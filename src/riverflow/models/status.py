from datetime import datetime

from pydantic import BaseModel


class StatusModel(BaseModel):
    """Current system status."""

    timestamp: datetime
    registered_dags: list[str]
    running_dags: list[str]
    total_history: int
    active_connections: int


class APIInfoModel(BaseModel):
    """Root endpoint info."""

    name: str = "RiverFlow API"
    version: str = "1.0.0"
    endpoints: dict[str, str] = {}
