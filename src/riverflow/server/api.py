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
    DashboardModel,
    StatusModel,
    TaskLogsModel,
)
from ..models.converters import (
    build_dashboard,
    dag_to_graph,
    dag_to_model,
    dag_to_summary,
    logs_to_model,
    run_to_model,
)
from .graph_layout import layout_dag_graph
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
        # Build schedule lookup
        sched_lookup = {}
        for info in self.riverflow.get_scheduled_dags():
            sched_lookup[info["dag_id"]] = info.get("next_run")

        for dag_id in self.riverflow.get_registered_dags():
            is_running = self.riverflow.is_running(dag_id)
            dag = self.riverflow.get_dag(dag_id)
            try:
                stats = self.riverflow.get_dag_stats(dag_id)
            except Exception:
                stats = {}
            dags.append(dag_to_summary(
                dag_id, is_running, stats,
                schedule=dag.schedule if dag else None,
                next_run=sched_lookup.get(dag_id),
            ))
        return dags

    async def get_dag(self, dag_id: str) -> DAGModel:
        """Get details about a specific DAG"""
        dag = self.riverflow.get_dag(dag_id)
        if dag is None:
            raise HTTPException(status_code=404, detail=f"Unknown DAG: {dag_id}")
        stats = self.riverflow.get_dag_stats(dag_id)
        is_running = self.riverflow.is_running(dag_id)
        sched_lookup = {}
        for info in self.riverflow.get_scheduled_dags():
            sched_lookup[info["dag_id"]] = info.get("next_run")
        return dag_to_model(dag, is_running, stats, next_run=sched_lookup.get(dag_id))

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
        raw_logs = await self.riverflow.get_task_logs_async(run_id, task_id)
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
        app.state.start_time = datetime.now()
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
    from fastapi.exceptions import StarletteHTTPException
    from .templates import templates

    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc: StarletteHTTPException):
        accept = request.headers.get("accept", "")
        if "text/html" in accept:
            return templates.TemplateResponse(
                request, "404.html", status_code=404
            )
        return HTMLResponse(content=str(exc.detail), status_code=404)

    @app.get("/ui", response_class=HTMLResponse)
    async def ui_index(request: Request):
        dashboard = build_dashboard(riverflow)
        return templates.TemplateResponse(
            request, "dashboard.html", {"dashboard": dashboard}
        )

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
        # Pass schedule info
        sched_lookup = {}
        for info in riverflow.get_scheduled_dags():
            sched_lookup[info["dag_id"]] = info.get("next_run")
        dag_model = dag_to_model(dag, is_running, stats, latest_run_id, next_run=sched_lookup.get(dag_id))
        return templates.TemplateResponse(
            request, "dag_detail.html", {"dag": dag_model}
        )

    @app.get("/ui/runs/{run_id}", response_class=HTMLResponse)
    async def ui_run_detail(request: Request, run_id: str):
        """Dedicated run detail page."""
        # Search current runs first, then history
        run = None
        for cur in riverflow.get_current_runs().values():
            if cur.run_id == run_id:
                run = cur
                break
        if run is None:
            for hist in riverflow.get_history():
                if hist.run_id == run_id:
                    run = hist
                    break
        if run is None:
            raise HTTPException(status_code=404, detail=f"Unknown run: {run_id}")
        return templates.TemplateResponse(
            request, "run_detail.html", {"run": run_to_model(run)}
        )

    @app.put("/ui/dags/{dag_id}/trigger", response_class=HTMLResponse)
    async def ui_trigger_dag(request: Request, dag_id: str):
        """Fire-and-forget trigger for the HTMX UI.

        Starts the DAG in a background task and returns immediately
        so the browser connection isn't held open for the entire run.
        WebSocket pushes keep the UI updated in real-time.
        """
        if dag_id not in riverflow._dags:
            raise HTTPException(status_code=404, detail=f"Unknown DAG: {dag_id}")
        await riverflow.trigger(dag_id, wait=False)
        return HTMLResponse(status_code=202)

    @app.get("/ui/partials/dashboard-stats", response_class=HTMLResponse)
    async def ui_partial_dashboard_stats(request: Request):
        dashboard = build_dashboard(riverflow)
        return templates.TemplateResponse(
            request, "partials/_dashboard_stats.html", {"dashboard": dashboard}
        )

    @app.get("/ui/partials/activity-feed", response_class=HTMLResponse)
    async def ui_partial_activity_feed(request: Request):
        history = riverflow.get_history(limit=15)
        runs = [run_to_model(r) for r in history]
        return templates.TemplateResponse(
            request, "partials/_activity_feed.html", {"runs": runs}
        )

    @app.get("/ui/partials/schedule-list", response_class=HTMLResponse)
    async def ui_partial_schedule_list(request: Request):
        dashboard = build_dashboard(riverflow)
        return templates.TemplateResponse(
            request, "partials/_schedule_list.html", {"scheduled_dags": dashboard.scheduled_dags}
        )

    @app.get("/ui/partials/dag-list", response_class=HTMLResponse)
    async def ui_partial_dag_list(request: Request):
        dags = []
        sched_lookup = {}
        for info in riverflow.get_scheduled_dags():
            sched_lookup[info["dag_id"]] = info.get("next_run")
        for did in riverflow.get_registered_dags():
            is_running = riverflow.is_running(did)
            dag_obj = riverflow.get_dag(did)
            try:
                stats = riverflow.get_dag_stats(did)
            except Exception:
                stats = {}
            dags.append(dag_to_summary(
                did, is_running, stats,
                schedule=dag_obj.schedule if dag_obj else None,
                next_run=sched_lookup.get(did),
            ))
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
        sched_lookup = {}
        for info in riverflow.get_scheduled_dags():
            sched_lookup[info["dag_id"]] = info.get("next_run")
        dag_model = dag_to_model(dag, is_running, stats, next_run=sched_lookup.get(dag_id))
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
        layout_dag_graph(graph)
        return templates.TemplateResponse(
            request, "partials/_dag_graph.html", {"graph": graph}
        )

    @app.get("/ui/partials/dag-history/{dag_id}", response_class=HTMLResponse)
    async def ui_partial_dag_history(
        request: Request, dag_id: str, page: int = 1
    ):
        page_size = 20
        all_history = riverflow.get_history(dag_id=dag_id, limit=page * page_size + 1)
        total_count = len(all_history)
        offset = (page - 1) * page_size
        page_runs = all_history[offset : offset + page_size]
        has_more = len(all_history) > offset + page_size
        runs = [run_to_model(run) for run in page_runs]
        return templates.TemplateResponse(
            request,
            "partials/_dag_history.html",
            {
                "runs": runs,
                "dag_id": dag_id,
                "page": page,
                "has_more": has_more,
                "total_count": total_count,
            },
        )

    @app.get("/ui/partials/dag-grid/{dag_id}", response_class=HTMLResponse)
    async def ui_partial_dag_grid(request: Request, dag_id: str):
        """Grid view: task × run matrix."""
        dag = riverflow.get_dag(dag_id)
        if dag is None:
            raise HTTPException(status_code=404, detail=f"Unknown DAG: {dag_id}")
        history = riverflow.get_history(dag_id=dag_id, limit=25)
        runs = [run_to_model(run) for run in history]
        task_ids = list(dag.tasks.keys())
        return templates.TemplateResponse(
            request, "partials/_dag_grid.html", {"runs": runs, "task_ids": task_ids}
        )

    @app.get("/ui/partials/task-logs/{run_id}", response_class=HTMLResponse)
    async def ui_partial_task_logs(
        request: Request, run_id: str, task_id: Optional[str] = None
    ):
        raw_logs = await riverflow.get_task_logs_async(run_id, task_id)
        logs_model = logs_to_model(run_id, task_id, raw_logs)
        return templates.TemplateResponse(
            request, "partials/_task_logs.html", {"logs": logs_model}
        )

    @app.get("/ui/partials/dag-logs/{dag_id}", response_class=HTMLResponse)
    async def ui_partial_dag_logs(request: Request, dag_id: str):
        """Resolve latest run for a DAG and return its logs."""
        run_id = None
        current = riverflow.get_current_runs().get(dag_id)
        if current:
            run_id = current.run_id
        else:
            history = riverflow.get_history(dag_id=dag_id, limit=1)
            if history:
                run_id = history[0].run_id
        if not run_id:
            return HTMLResponse(
                '<p class="empty-state-small">No runs yet — trigger the DAG to see logs here.</p>'
            )
        raw_logs = await riverflow.get_task_logs_async(run_id)
        logs_model = logs_to_model(run_id, None, raw_logs)
        return templates.TemplateResponse(
            request, "partials/_task_logs.html", {"logs": logs_model}
        )

    @app.get("/ui/partials/dag-calendar/{dag_id}", response_class=HTMLResponse)
    async def ui_partial_dag_calendar(request: Request, dag_id: str):
        """Calendar heatmap: daily run counts over the past 12 weeks."""
        from collections import defaultdict
        from datetime import date as _date, timedelta as _td

        history = riverflow.get_history(dag_id=dag_id, limit=500)
        # Aggregate by date
        counts: dict[_date, dict] = defaultdict(lambda: {"count": 0, "failures": 0})
        for run in history:
            if run.start_time:
                d = run.start_time.date()
                counts[d]["count"] += 1
                if run.state.value == "failed":
                    counts[d]["failures"] += 1

        today = _date.today()
        # Go back to the most recent Monday 12 weeks ago
        weeks = 12
        start = today - _td(days=today.weekday() + (weeks - 1) * 7)

        # Build cell grid: col = week (2-based, 1 is day labels), row = weekday (1-7)
        cells = []
        max_count = max((v["count"] for v in counts.values()), default=0) or 1
        day = start
        col = 2
        while day <= today:
            row = day.weekday() + 1  # Mon=1 .. Sun=7
            c = counts.get(day, {"count": 0, "failures": 0})
            # intensity 0-4
            if c["count"] == 0:
                intensity = 0
            else:
                intensity = min(4, max(1, round(c["count"] / max_count * 4)))
            cells.append({
                "date": day.isoformat(),
                "count": c["count"],
                "failures": c["failures"],
                "intensity": intensity,
                "col": col,
                "row": row,
            })
            day += _td(days=1)
            if day.weekday() == 0:
                col += 1

        # Month labels
        months = []
        seen_months = set()
        for cell in cells:
            d = _date.fromisoformat(cell["date"])
            key = (d.year, d.month)
            if key not in seen_months:
                seen_months.add(key)
                months.append({"label": d.strftime("%b"), "col": cell["col"]})

        day_labels = ["Mon", "", "Wed", "", "Fri", "", ""]
        return templates.TemplateResponse(
            request,
            "partials/_dag_calendar.html",
            {"cells": cells, "months": months, "day_labels": day_labels, "dag_id": dag_id},
        )

    @app.get("/ui/partials/dag-code/{dag_id}", response_class=HTMLResponse)
    async def ui_partial_dag_code(request: Request, dag_id: str):
        """Show Python source for each task in the DAG."""
        import inspect
        import html as _html

        dag = riverflow.get_dag(dag_id)
        if dag is None:
            raise HTTPException(status_code=404, detail=f"Unknown DAG: {dag_id}")

        tasks_source = []
        for task_id, task in dag.tasks.items():
            try:
                src = inspect.getsource(task.func)
                module = task.func.__module__ or ""
            except (OSError, TypeError):
                src = "# Source not available"
                module = ""
            tasks_source.append({
                "task_id": task_id,
                "source": _html.escape(src),
                "module": module,
            })
        return templates.TemplateResponse(
            request,
            "partials/_dag_code.html",
            {"tasks_source": tasks_source},
        )

    @app.get("/ui/config", response_class=HTMLResponse)
    async def ui_config(request: Request):
        """System info / about page."""
        import platform
        import sys

        info = {
            "version": "0.6.0",
            "python_version": sys.version.split()[0],
            "platform": platform.platform(),
            "start_time": app.state.start_time.isoformat() if hasattr(app.state, "start_time") else "",
            "uptime": "",
            "db_path": str(riverflow.log_store._db_path) if hasattr(riverflow.log_store, "_db_path") else "in-memory",
            "total_runs": len(riverflow.get_history()),
            "registered_dags": len(riverflow.get_registered_dags()),
            "running_now": len(riverflow.get_current_runs()),
            "scheduled_count": len(riverflow.get_scheduled_dags()),
            "active_ws": len(manager.active_connections),
        }
        return templates.TemplateResponse(
            request, "config.html", {"info": info}
        )

    # Mount static files for UI assets (CSS, JS, HTMX)
    # This must come after explicit routes so they take priority
    STATIC_DIR = Path(__file__).resolve().parent / "ui" / "static"
    app.mount("/ui/static", StaticFiles(directory=str(STATIC_DIR)), name="ui_static_files")

    return app
