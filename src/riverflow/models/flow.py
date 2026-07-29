from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from .task import TaskStateEnum, TriggerRuleEnum


class FlowRunStateEnum(str, Enum):
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class FlowNodeModel(BaseModel):
    node_id: str
    dag_id: str
    upstream_node_ids: list[str] = Field(default_factory=list)
    trigger_rule: TriggerRuleEnum
    concurrency: str
    parameters: dict[str, Any] = Field(default_factory=dict)


class FlowModel(BaseModel):
    flow_id: str
    description: Optional[str] = None
    timezone: str = "UTC"
    schedule_display: Optional[str] = None
    next_run: Optional[datetime] = None
    is_running: bool = False
    nodes: list[FlowNodeModel] = Field(default_factory=list)


class FlowRunModel(BaseModel):
    flow_id: str
    run_id: str
    state: FlowRunStateEnum
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    node_states: dict[str, TaskStateEnum] = Field(default_factory=dict)
    dag_run_ids: dict[str, str] = Field(default_factory=dict)
    node_errors: dict[str, str] = Field(default_factory=dict)
    error: Optional[str] = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    trigger_source: Optional[str] = None
    trigger_mode: Optional[str] = None
    requested_by: Optional[str] = None


class ClearFlowHistoryModel(BaseModel):
    flow_id: str
    cleared: int
