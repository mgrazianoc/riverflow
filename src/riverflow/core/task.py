from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Awaitable, Callable, List, Optional

from .errors import SelfDependencyError


class TaskState(Enum):
    NONE = "none"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    UPSTREAM_FAILED = "upstream_failed"
    TIMEOUT = "timeout"


class TriggerRule(Enum):
    ALL_SUCCESS = "all_success"  # all upstream tasks must succeed (default)
    ALL_FAILED = "all_failed"  # all upstream tasks must fail
    ALL_DONE = "all_done"  # all upstream tasks must be in a terminal state (success, failed, skipped)
    ALL_DONE_MIN_ONE_SUCCESS = "all_done_min_one_success"  # all non-skipped upstream tasks must be done and at least one must be successful
    ALL_SKIPPED = "all_skipped"  # all upstream tasks must be skipped
    ONE_SUCCESS = "one_success"  # at least one upstream task must succeed
    ONE_FAILED = "one_failed"  # at least one upstream task must fail
    ONE_DONE = "one_done"  # at least one upstream task must be in a terminal state
    NONE_FAILED = "none_failed"  # no upstream task should fail (success, skipped, upstream_failed, timeout are ok)
    NONE_FAILED_MIN_ONE_SUCCESS = "none_failed_min_one_success"  # no upstream task should fail and at least one should succeed
    NONE_SKIPPED = "none_skipped"  # no upstream task should be skipped
    ALWAYS = "always"  # always trigger, regardless of upstream states


@dataclass
class Task:
    task_id: str
    func: Callable[[], Awaitable[None]]
    upstream_tasks: List["Task"] = field(default_factory=list)
    trigger_rule: TriggerRule = TriggerRule.ALL_SUCCESS
    timeout: Optional[timedelta] = None
    retries: int = 0
    retry_delay: timedelta = timedelta(seconds=5)

    on_execute: Optional[Callable] = None
    on_success: Optional[Callable] = None
    on_failure: Optional[Callable] = None
    on_retry: Optional[Callable] = None
    on_skip: Optional[Callable] = None

    def __rshift__(self, other):
        """
        Syntactic sugar: task1 >> task2 or task1 >> [task2, task3]
        Sets self as upstream of other(s)
        """
        if isinstance(other, list):
            # task1 >> [task2, task3]
            for task in other:
                if self.task_id == task.task_id:
                    raise SelfDependencyError(self.task_id)
                task.upstream_tasks.append(self)
            return other
        else:
            # task1 >> task2
            if self.task_id == other.task_id:
                raise SelfDependencyError(self.task_id)
            other.upstream_tasks.append(self)
            return other

    def __lshift__(self, other):
        """
        Syntactic sugar: task1 << task2 or task1 << [task2, task3]
        Sets other(s) as upstream of self
        """
        if isinstance(other, list):
            # task1 << [task2, task3]
            for task in other:
                if self.task_id == task.task_id:
                    raise SelfDependencyError(self.task_id)
                self.upstream_tasks.append(task)
            return self
        else:
            # task1 << task2
            if self.task_id == other.task_id:
                raise SelfDependencyError(self.task_id)
            self.upstream_tasks.append(other)
            return self

    def __rrshift__(self, other):
        """
        Syntactic sugar for: [task1, task2] >> task3
        Handles when list is on the left side
        """
        for task in other:
            if task.task_id == self.task_id:
                raise SelfDependencyError(self.task_id)
            self.upstream_tasks.append(task)
        return self

    def __rlshift__(self, other):
        """
        Syntactic sugar for: [task1, task2] << task3
        Handles when list is on the left side
        """
        for task in other:
            if task.task_id == self.task_id:
                raise SelfDependencyError(self.task_id)
            task.upstream_tasks.append(self)
        return other


@dataclass
class TaskInstance:
    task_id: str
    state: TaskState = TaskState.NONE
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    error: Optional[str] = None
    retry_count: int = 0
