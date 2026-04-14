from datetime import datetime
from typing import Optional

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


class ScheduledDAGModel(BaseModel):
    """A DAG's schedule info for the dashboard."""

    dag_id: str
    schedule_display: str
    next_run: Optional[datetime] = None


class DashboardModel(BaseModel):
    """Aggregated data for the dashboard home page."""

    total_dags: int = 0
    running_now: int = 0
    total_runs: int = 0
    recent_failures: int = 0
    overall_success_rate: float = 0.0
    scheduled_dags: list[ScheduledDAGModel] = []
