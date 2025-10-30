"""
RiverFlow Server - FastAPI WebSocket Server for Real-Time DAG Monitoring

Provides WebSocket endpoints for streaming DAG execution updates,
including historical data and real-time state changes.

Import modules directly:
- riverflow.server.api
- riverflow.server.setup
"""

from . import api
from . import setup

__all__ = [
    "api",
    "setup",
]
