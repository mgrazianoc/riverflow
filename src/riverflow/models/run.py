from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from .task import TaskStateEnum


class DAGRunStateEnum(str, Enum):
    IDLE = "idle"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class TaskRunModel(BaseModel):
    """State of a single task within a DAG run."""

    task_id: str
    state: TaskStateEnum = TaskStateEnum.NONE


class DAGRunModel(BaseModel):
    """A single DAG execution record."""

    dag_id: str
    run_id: str
    state: DAGRunStateEnum
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    task_states: dict[str, TaskStateEnum] = Field(default_factory=dict)
    error: Optional[str] = None
    duration_seconds: Optional[float] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    trigger_source: Optional[str] = None
    trigger_mode: Optional[str] = None
    requested_by: Optional[str] = None
    force: bool = False
