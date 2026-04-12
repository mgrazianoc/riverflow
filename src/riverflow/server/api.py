"""
FastAPI Server for RiverFlow

Provides REST and WebSocket endpoints for monitoring and controlling
DAG executions through a web interface.

Every endpoint returns a Pydantic model — no raw dicts cross
the boundary between the engine and the outside world.
"""

import json
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ..core.riverflow import Riverflow, get_logger, DAGRunHistory
from ..models import (
    APIInfoModel,
    DAGGraphModel,
    DAGModel,
    DAGRunModel,
    DAGSummaryModel,
    StatusModel,
    TaskLogsModel,
)
from ..models.converters import (
    dag_to_graph,
    dag_to_model,
    dag_to_summary,
    logs_to_model,
    run_to_model,
)
from .ws import ConnectionManager, create_update_callback


logger = get_logger(component="RiverFlowAPI")
UI_DIR = Path(__file__).resolve().parent / "ui"


class RiverFlowAPI:
    """API handler for RiverFlow orchestration engine"""

    def __init__(self, riverflow: Riverflow, manager: ConnectionManager):
        self.riverflow = riverflow
        self.manager = manager
        self.logger = logger

    # ========== Lifecycle Handlers ==========

    async def startup(self):
        """Application startup"""
        self.riverflow.start_scheduler()
        self.logger.info("RiverFlow scheduler started")
        self.logger.info("RiverFlow API started successfully")
        registered_dags = self.riverflow.get_registered_dags()
        if registered_dags:
            self.logger.info(f"Registered DAGs: {', '.join(registered_dags)}")

    async def shutdown(self):
        """Application shutdown"""
        self.riverflow.stop_scheduler()
        self.logger.info("RiverFlow scheduler stopped")

    # ========== REST Endpoints ==========

    async def root(self) -> APIInfoModel:
        """API information endpoint"""
        return APIInfoModel(
            endpoints={
                "ui": "/ui",
                "websocket": "/ws",
                "dags": "/api/dags",
                "dag_graph": "/api/dags/{dag_id}/graph",
                "status": "/api/status",
                "history": "/api/history",
                "trigger": "/api/dags/{dag_id}/trigger",
            },
        )

    async def get_status(self) -> StatusModel:
        """Get current RiverFlow status"""
        return StatusModel(
            timestamp=datetime.now(),
            registered_dags=self.riverflow.get_registered_dags(),
            running_dags=list(self.riverflow.get_current_runs().keys()),
            total_history=len(self.riverflow.get_history()),
            active_connections=len(self.manager.active_connections),
        )

    async def get_dags(self) -> list[DAGSummaryModel]:
        """Get list of registered DAGs with summary stats."""
        dags: list[DAGSummaryModel] = []
        for dag_id in self.riverflow.get_registered_dags():
            is_running = self.riverflow.is_running(dag_id)
            try:
                stats = self.riverflow.get_dag_stats(dag_id)
            except Exception:
                stats = {}
            dags.append(dag_to_summary(dag_id, is_running, stats))
        return dags

    async def get_dag(self, dag_id: str) -> DAGModel:
        """Get details about a specific DAG"""
        dag = self.riverflow.get_dag(dag_id)
        if dag is None:
            raise HTTPException(status_code=404, detail=f"Unknown DAG: {dag_id}")
        stats = self.riverflow.get_dag_stats(dag_id)
        is_running = self.riverflow.is_running(dag_id)
        return dag_to_model(dag, is_running, stats)

    async def get_dag_graph(self, dag_id: str) -> DAGGraphModel:
        """Get DAG graph topology and latest task states for UI rendering."""
        dag = self.riverflow.get_dag(dag_id)
        if dag is None:
            raise HTTPException(status_code=404, detail=f"Unknown DAG: {dag_id}")

        latest_run = None
        current = self.riverflow.get_current_runs().get(dag_id)
        if current:
            latest_run = current
        else:
            history = self.riverflow.get_history(dag_id=dag_id, limit=1)
            if history:
                latest_run = history[0]

        is_running = self.riverflow.is_running(dag_id)
        return dag_to_graph(dag, is_running, latest_run)

    async def get_history(
        self, limit: int = 100, dag_id: Optional[str] = None
    ) -> list[DAGRunModel]:
        """Get DAG execution history"""
        history = self.riverflow.get_history(limit=limit)

        if dag_id:
            history = [run for run in history if run.dag_id == dag_id]

        return [run_to_model(run) for run in history]

    async def trigger_dag(self, dag_id: str) -> DAGRunModel:
        """Trigger a DAG execution"""
        try:
            result = await self.riverflow.trigger(dag_id)
            return run_to_model(result)
        except Exception as e:
            self.logger.error(f"Failed to trigger DAG {dag_id}: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    async def trigger_task(self, dag_id: str, task_id: str) -> DAGRunModel:
        """Trigger a single task within a DAG (ignoring dependencies)"""
        try:
            result = await self.riverflow.trigger_task(dag_id, task_id)
            return run_to_model(result)
        except Exception as e:
            self.logger.error(
                f"Failed to trigger task {task_id} in DAG {dag_id}: {e}"
            )
            raise HTTPException(status_code=500, detail=str(e))

    async def get_run_logs(
        self, run_id: str, task_id: Optional[str] = None
    ) -> TaskLogsModel:
        """Get captured task logs for a run"""
        raw_logs = self.riverflow.get_task_logs(run_id, task_id)
        return logs_to_model(run_id, task_id, raw_logs)

    # ========== WebSocket Handler ==========

    async def websocket_handler(self, websocket: WebSocket):
        """
        WebSocket endpoint for real-time DAG execution updates.

        Upon connection:
        1. Sends complete execution history
        2. Streams real-time updates as they occur
        """
        await self.manager.connect(websocket)

        try:
            # Send connection confirmation
            await self._send_connection_message(websocket)

            # Send historical data
            await self._send_history(websocket)

            # Send current runs
            await self._send_current_runs(websocket)

            # Handle client messages
            await self._handle_client_messages(websocket)

        except Exception as e:
            self.logger.error(f"WebSocket connection error: {e}")

        finally:
            self.manager.disconnect(websocket)

    # ========== WebSocket Helper Methods ==========

    async def _send_connection_message(self, websocket: WebSocket):
        """Send connection confirmation"""
        await websocket.send_json(
            {
                "type": "connected",
                "timestamp": datetime.now().isoformat(),
                "message": "Connected to RiverFlow WebSocket",
                "data": {
                    "total_dags": len(self.riverflow.get_registered_dags()),
                    "registered_dags": self.riverflow.get_registered_dags(),
                    "active_connections": len(self.manager.active_connections),
                },
            }
        )

    async def _send_history(self, websocket: WebSocket):
        """Send complete execution history"""
        history = self.riverflow.get_history(limit=100)

        if history:
            await websocket.send_json(
                {
                    "type": "history",
                    "timestamp": datetime.now().isoformat(),
                    "data": {
                        "total_runs": len(history),
                        "runs": [run_to_model(run).model_dump(mode="json") for run in history],
                    },
                }
            )

    async def _send_current_runs(self, websocket: WebSocket):
        """Send currently running DAGs"""
        current_runs = self.riverflow.get_current_runs()
        if current_runs:
            await websocket.send_json(
                {
                    "type": "current_runs",
                    "timestamp": datetime.now().isoformat(),
                    "data": {
                        "running_dags": [
                            run_to_model(run).model_dump(mode="json") for run in current_runs.values()
                        ]
                    },
                }
            )

    async def _handle_client_messages(self, websocket: WebSocket):
        """Handle incoming client messages"""
        while True:
            try:
                data = await websocket.receive_text()

                if data:
                    try:
                        client_message = json.loads(data)
                        await self._process_client_message(websocket, client_message)
                    except json.JSONDecodeError:
                        self.logger.warning(f"Received invalid JSON: {data}")

            except WebSocketDisconnect:
                break
            except Exception as e:
                self.logger.error(f"WebSocket error: {e}")
                break

    async def _process_client_message(
        self, websocket: WebSocket, message: Dict[str, Any]
    ):
        """Process a client message and send response"""
        msg_type = message.get("type")

        if msg_type == "ping":
            await websocket.send_json(
                {"type": "pong", "timestamp": datetime.now().isoformat()}
            )

        elif msg_type == "get_status":
            await websocket.send_json(
                {
                    "type": "status",
                    "timestamp": datetime.now().isoformat(),
                    "data": {
                        "registered_dags": self.riverflow.get_registered_dags(),
                        "running_dags": list(self.riverflow.get_current_runs().keys()),
                        "total_history": len(self.riverflow.get_history()),
                    },
                }
            )

        elif msg_type == "get_dag_stats":
            dag_id = message.get("dag_id")
            if dag_id:
                stats = self.riverflow.get_dag_stats(dag_id)
                await websocket.send_json(
                    {
                        "type": "dag_stats",
                        "timestamp": datetime.now().isoformat(),
                        "data": {"dag_id": dag_id, "stats": stats},
                    }
                )

def create_riverflow_api(riverflow: Optional[Riverflow] = None) -> FastAPI:
    """
    Create a FastAPI application with RiverFlow monitoring endpoints.

    Args:
        riverflow: RiverFlow instance to monitor. If None, uses the singleton instance.

    Returns:
        Configured FastAPI application
    """
    if riverflow is None:
        riverflow = Riverflow.get_instance()

    # Initialize WebSocket connection manager
    manager = ConnectionManager()

    # Register update callback with RiverFlow
    riverflow.on_update(create_update_callback(manager))

    # Create API handler
    api = RiverFlowAPI(riverflow, manager)

    # Define lifespan context manager for startup/shutdown
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Startup
        await api.startup()
        yield
        # Shutdown
        await api.shutdown()

    # Create FastAPI app with lifespan
    app = FastAPI(
        title="RiverFlow API",
        description="REST and WebSocket API for RiverFlow workflow orchestration",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Enable CORS for web clients
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register REST endpoints
    app.get("/")(api.root)
    app.get("/api/status")(api.get_status)
    app.get("/api/dags")(api.get_dags)
    app.get("/api/dags/{dag_id}")(api.get_dag)
    app.get("/api/dags/{dag_id}/graph")(api.get_dag_graph)
    app.get("/api/history")(api.get_history)
    app.put("/api/dags/{dag_id}/trigger")(api.trigger_dag)
    app.put("/api/dags/{dag_id}/tasks/{task_id}/trigger")(api.trigger_task)
    app.get("/api/runs/{run_id}/logs")(api.get_run_logs)

    # Register WebSocket endpoint
    app.websocket("/ws")(api.websocket_handler)

    # ── HTMX UI routes ──────────────────────────────────
    from fastapi import Request
    from .templates import templates

    @app.get("/ui", response_class=HTMLResponse)
    async def ui_index(request: Request):
        return templates.TemplateResponse(request, "base.html")

    @app.get("/ui/dags/{dag_id}", response_class=HTMLResponse)
    async def ui_dag_detail(request: Request, dag_id: str):
        dag = riverflow.get_dag(dag_id)
        if dag is None:
            raise HTTPException(status_code=404, detail=f"Unknown DAG: {dag_id}")
        stats = riverflow.get_dag_stats(dag_id)
        is_running = riverflow.is_running(dag_id)
        # Find the latest run ID for the Logs tab
        latest_run_id = None
        current = riverflow.get_current_runs().get(dag_id)
        if current:
            latest_run_id = current.run_id
        else:
            history = riverflow.get_history(dag_id=dag_id, limit=1)
            if history:
                latest_run_id = history[0].run_id
        dag_model = dag_to_model(dag, is_running, stats, latest_run_id)
        return templates.TemplateResponse(
            request, "dag_detail.html", {"dag": dag_model}
        )

    @app.get("/ui/partials/dag-list", response_class=HTMLResponse)
    async def ui_partial_dag_list(request: Request):
        dags = []
        for did in riverflow.get_registered_dags():
            is_running = riverflow.is_running(did)
            try:
                stats = riverflow.get_dag_stats(did)
            except Exception:
                stats = {}
            dags.append(dag_to_summary(did, is_running, stats))
        return templates.TemplateResponse(
            request, "partials/_dag_list.html", {"dags": dags}
        )

    @app.get("/ui/partials/dag-stats/{dag_id}", response_class=HTMLResponse)
    async def ui_partial_dag_stats(request: Request, dag_id: str):
        dag = riverflow.get_dag(dag_id)
        if dag is None:
            raise HTTPException(status_code=404, detail=f"Unknown DAG: {dag_id}")
        stats = riverflow.get_dag_stats(dag_id)
        is_running = riverflow.is_running(dag_id)
        dag_model = dag_to_model(dag, is_running, stats)
        return templates.TemplateResponse(
            request, "partials/_dag_stats.html", {"dag": dag_model}
        )

    @app.get("/ui/partials/dag-graph/{dag_id}", response_class=HTMLResponse)
    async def ui_partial_dag_graph(request: Request, dag_id: str):
        dag = riverflow.get_dag(dag_id)
        if dag is None:
            raise HTTPException(status_code=404, detail=f"Unknown DAG: {dag_id}")
        latest_run = None
        current = riverflow.get_current_runs().get(dag_id)
        if current:
            latest_run = current
        else:
            history = riverflow.get_history(dag_id=dag_id, limit=1)
            if history:
                latest_run = history[0]
        is_running = riverflow.is_running(dag_id)
        graph = dag_to_graph(dag, is_running, latest_run)
        return templates.TemplateResponse(
            request, "partials/_dag_graph.html", {"graph": graph}
        )

    @app.get("/ui/partials/dag-history/{dag_id}", response_class=HTMLResponse)
    async def ui_partial_dag_history(request: Request, dag_id: str):
        history = riverflow.get_history(dag_id=dag_id, limit=50)
        runs = [run_to_model(run) for run in history]
        return templates.TemplateResponse(
            request, "partials/_dag_history.html", {"runs": runs}
        )

    @app.get("/ui/partials/task-logs/{run_id}", response_class=HTMLResponse)
    async def ui_partial_task_logs(
        request: Request, run_id: str, task_id: Optional[str] = None
    ):
        raw_logs = riverflow.get_task_logs(run_id, task_id)
        logs_model = logs_to_model(run_id, task_id, raw_logs)
        return templates.TemplateResponse(
            request, "partials/_task_logs.html", {"logs": logs_model}
        )

    # Mount static files for UI assets (CSS, JS, HTMX)
    # This must come after explicit routes so they take priority
    STATIC_DIR = Path(__file__).resolve().parent / "ui" / "static"
    app.mount("/ui/static", StaticFiles(directory=str(STATIC_DIR)), name="ui_static_files")

    # Keep legacy static mount for old JS UI during transition
    app.mount("/ui/legacy", StaticFiles(directory=str(UI_DIR)), name="ui_legacy")

    return app
