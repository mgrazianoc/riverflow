"""
WebSocket Connection Manager for RiverFlow

Manages WebSocket connections and broadcasts DAG execution updates
to all connected clients in real-time.
"""

import asyncio
import json
from datetime import datetime
from typing import Set

from fastapi import WebSocket

from ..core.riverflow import DAGRunHistory
from ..core.logger import get_logger
from ..models.converters import run_to_model


logger = get_logger(component="RiverFlowWebSocketManager")


class ConnectionManager:
    """Manages WebSocket connections and broadcasts updates"""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.logger = get_logger(component="ConnectionManager")

    async def connect(self, websocket: WebSocket):
        """Accept and register a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.add(websocket)
        self.logger.info(
            f"Client connected. Total connections: {len(self.active_connections)}"
        )

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection"""
        self.active_connections.discard(websocket)
        self.logger.info(
            f"Client disconnected. Total connections: {len(self.active_connections)}"
        )

    async def broadcast(self, message: dict):
        """Broadcast a message to all connected clients"""
        if not self.active_connections:
            return

        # Convert message to JSON
        json_message = json.dumps(message, default=str)

        # Send to all connections
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(json_message)
            except Exception as e:
                self.logger.error(f"Error sending to client: {e}")
                disconnected.add(connection)

        # Remove dead connections
        for connection in disconnected:
            self.disconnect(connection)


def create_update_callback(manager: ConnectionManager):
    """
    Create a callback function for RiverFlow updates.

    Args:
        manager: ConnectionManager instance for broadcasting

    Returns:
        Callback function that broadcasts updates via WebSocket
    """

    def update_callback(run_history: DAGRunHistory):
        """Callback function that broadcasts DAG state updates via WebSocket"""
        run_model = run_to_model(run_history)
        message = {
            "type": "dag_update",
            "timestamp": datetime.now().isoformat(),
            "data": run_model.model_dump(mode="json"),
        }

        # Broadcast to all WebSocket clients
        asyncio.create_task(manager.broadcast(message))

    return update_callback
