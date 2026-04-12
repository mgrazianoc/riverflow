from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from .task import TaskModel, TaskStateEnum, TriggerRuleEnum


class DAGSummaryModel(BaseModel):
    """Lightweight DAG info for list views."""

    dag_id: str
    is_running: bool = False
    total_runs: int = 0
    success_count: int = 0
    failed_count: int = 0
    success_rate: float = 0.0
    avg_duration_seconds: float = 0.0


class DAGModel(BaseModel):
    """Full DAG detail."""

    dag_id: str
    description: Optional[str] = None
    timezone: str = "UTC"
    is_running: bool = False
    tasks: list[TaskModel] = []
    total_runs: int = 0
    success_count: int = 0
    failed_count: int = 0
    success_rate: float = 0.0
    avg_duration_seconds: float = 0.0


class DAGNodeModel(BaseModel):
    """A node in the DAG graph visualisation."""

    id: str
    label: str
    state: TaskStateEnum = TaskStateEnum.NONE
    trigger_rule: TriggerRuleEnum = TriggerRuleEnum.ALL_SUCCESS
    retries: int = 0


class DAGEdgeModel(BaseModel):
    """An edge in the DAG graph visualisation."""

    id: str
    source: str
    target: str


class DAGGraphModel(BaseModel):
    """Complete graph payload for rendering a DAG."""

    dag_id: str
    is_running: bool = False
    run_id: Optional[str] = None
    nodes: list[DAGNodeModel] = []
    edges: list[DAGEdgeModel] = []
    timestamp: datetime
