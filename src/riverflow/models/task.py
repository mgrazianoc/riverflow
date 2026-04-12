from enum import Enum
from typing import Optional

from pydantic import BaseModel


class TaskStateEnum(str, Enum):
    NONE = "none"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    UPSTREAM_FAILED = "upstream_failed"
    TIMEOUT = "timeout"


class TriggerRuleEnum(str, Enum):
    ALL_SUCCESS = "all_success"
    ALL_FAILED = "all_failed"
    ALL_DONE = "all_done"
    ALL_DONE_MIN_ONE_SUCCESS = "all_done_min_one_success"
    ALL_SKIPPED = "all_skipped"
    ONE_SUCCESS = "one_success"
    ONE_FAILED = "one_failed"
    ONE_DONE = "one_done"
    NONE_FAILED = "none_failed"
    NONE_FAILED_MIN_ONE_SUCCESS = "none_failed_min_one_success"
    NONE_SKIPPED = "none_skipped"
    ALWAYS = "always"


class TaskModel(BaseModel):
    task_id: str
    trigger_rule: TriggerRuleEnum = TriggerRuleEnum.ALL_SUCCESS
    retries: int = 0
    retry_delay_seconds: float = 5.0
    timeout_seconds: Optional[float] = None
    upstream_task_ids: list[str] = []
