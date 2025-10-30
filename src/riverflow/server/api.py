"""
FastAPI Server for RiverFlow

Provides REST and WebSocket endpoints for monitoring and controlling
DAG executions through a web interface.
"""

import json
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from ..core import RiverFlow, get_logger, DAGRunHistory
from .ws import ConnectionManager, create_update_callback


logger = get_logger(component="RiverFlowAPI")


class RiverFlowAPI:
    """API handler for RiverFlow orchestration engine"""

    def __init__(self, riverflow: RiverFlow, manager: ConnectionManager):
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

    async def root(self) -> Dict[str, Any]:
        """API information endpoint"""
        return {
            "name": "RiverFlow API",
            "version": "1.0.0",
            "endpoints": {
                "websocket": "/ws",
                "dags": "/api/dags",
                "status": "/api/status",
                "history": "/api/history",
                "trigger": "/api/dags/{dag_id}/trigger",
            },
        }

    async def get_status(self) -> Dict[str, Any]:
        """Get current RiverFlow status"""
        return {
            "timestamp": datetime.now().isoformat(),
            "registered_dags": self.riverflow.get_registered_dags(),
            "running_dags": list(self.riverflow.get_current_runs().keys()),
            "total_history": len(self.riverflow.get_history()),
            "active_connections": len(self.manager.active_connections),
        }

    async def get_dags(self) -> Dict[str, Any]:
        """Get list of registered DAGs with details"""
        dags = []
        for dag_id in self.riverflow.get_registered_dags():
            dag_info = {
                "dag_id": dag_id,
                "is_running": self.riverflow.is_running(dag_id),
            }

            # Try to get DAG stats if available
            try:
                stats = self.riverflow.get_dag_stats(dag_id)
                dag_info["stats"] = stats
            except Exception:
                pass

            dags.append(dag_info)

        return {
            "timestamp": datetime.now().isoformat(),
            "total": len(dags),
            "dags": dags,
        }

    async def get_dag(self, dag_id: str) -> Dict[str, Any]:
        """Get details about a specific DAG"""
        stats = self.riverflow.get_dag_stats(dag_id)
        return {
            "timestamp": datetime.now().isoformat(),
            "dag_id": dag_id,
            "is_running": self.riverflow.is_running(dag_id),
            "stats": stats,
        }

    async def get_history(
        self, limit: int = 100, dag_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get DAG execution history"""
        history = self.riverflow.get_history(limit=limit)

        if dag_id:
            history = [run for run in history if run.dag_id == dag_id]

        return {
            "timestamp": datetime.now().isoformat(),
            "total": len(history),
            "runs": [self._serialize_run(run) for run in history],
        }

    async def trigger_dag(self, dag_id: str) -> Dict[str, Any]:
        """Trigger a DAG execution"""
        try:
            result = await self.riverflow.trigger(dag_id)
            return {
                "timestamp": datetime.now().isoformat(),
                "success": True,
                "dag_id": dag_id,
                "run_id": result.run_id,
                "state": result.state.value,
            }
        except Exception as e:
            self.logger.error(f"Failed to trigger DAG {dag_id}: {e}")
            return {
                "timestamp": datetime.now().isoformat(),
                "success": False,
                "dag_id": dag_id,
                "error": str(e),
            }

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
                        "runs": [self._serialize_run(run) for run in history],
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
                            self._serialize_run(run) for run in current_runs.values()
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

    # ========== Serialization Helpers ==========

    def _serialize_run(self, run: DAGRunHistory) -> Dict[str, Any]:
        """Serialize a DAG run history object"""
        return {
            "dag_id": run.dag_id,
            "run_id": run.run_id,
            "state": run.state.value,
            "start_time": run.start_time.isoformat() if run.start_time else None,
            "end_time": run.end_time.isoformat() if run.end_time else None,
            "task_states": {
                task_id: state.value for task_id, state in run.task_states.items()
            },
            "error": run.error,
            "duration_seconds": (
                (run.end_time - run.start_time).total_seconds()
                if run.start_time and run.end_time
                else None
            ),
        }


def create_riverflow_api(riverflow: Optional[RiverFlow] = None) -> FastAPI:
    """
    Create a FastAPI application with RiverFlow monitoring endpoints.

    Args:
        riverflow: RiverFlow instance to monitor. If None, uses the singleton instance.

    Returns:
        Configured FastAPI application
    """
    if riverflow is None:
        riverflow = RiverFlow.get_instance()

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
    app.get("/api/history")(api.get_history)
    app.put("/api/dags/{dag_id}/trigger")(api.trigger_dag)

    # Register WebSocket endpoint
    app.websocket("/ws")(api.websocket_handler)

    return app
