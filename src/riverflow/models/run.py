from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel

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
    task_states: dict[str, TaskStateEnum] = {}
    error: Optional[str] = None
    duration_seconds: Optional[float] = None
