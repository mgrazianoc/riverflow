from datetime import timedelta
from typing import Callable, Optional, Union, Dict
from enum import Enum

from .errors import (
    CycleDetectedError,
    DAGValidationError,
    DuplicateTaskError,
    InvalidDependencyError,
    SelfDependencyError,
)
from .task import Task, TriggerRule


class DAGRunState(Enum):
    """State of a DAG run"""

    IDLE = "idle"  # DAG is registered but not scheduled or running
    SCHEDULED = "scheduled"  # DAG is scheduled to run at a specific time
    RUNNING = "running"  # DAG is currently executing
    SUCCESS = "success"  # DAG completed successfully
    FAILED = "failed"  # DAG failed during execution


class DAG:
    """
    Directed Acyclic Graph representing a workflow.

    Args:
        dag_id: Unique identifier for the DAG
        schedule: Cron-style schedule or timedelta interval
            - Dict format: {"hour": "12", "minute": "0", "timezone": "America/Sao_Paulo"}
            - String format: "0 12 * * *" (cron expression)
            - timedelta: timedelta(hours=24) for interval-based scheduling
            - None: Manual triggering only
        description: Optional description of the DAG

    Examples:
        # Cron-style (dict)
        DAG("daily", schedule={"hour": "12", "minute": "0"})

        # Cron expression
        DAG("daily", schedule="0 12 * * *")

        # Interval
        DAG("daily", schedule=timedelta(hours=24))

        # Manual only
        DAG("manual")
    """

    def __init__(
        self,
        dag_id: str,
        schedule: Optional[Union[Dict, str, timedelta]] = None,
        description: Optional[str] = None,
        timezone: str = "UTC",
    ):
        self.dag_id = dag_id
        self.schedule = schedule
        self.description = description
        self.timezone = timezone
        self.tasks: dict[str, Task] = {}
        self._validated = False

    def __enter__(self):
        """Context manager support"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Validate DAG on exit"""
        if exc_type is None:
            self._validate()
        return False

    def task(
        self,
        task_id: str,
        trigger_rule: TriggerRule = TriggerRule.ALL_SUCCESS,
        timeout: Optional[timedelta] = None,
        retries: int = 0,
        retry_delay: timedelta = timedelta(seconds=300),
        on_execute: Optional[Callable] = None,
        on_success: Optional[Callable] = None,
        on_failure: Optional[Callable] = None,
        on_retry: Optional[Callable] = None,
        on_skip: Optional[Callable] = None,
    ):
        """Decorator to register tasks"""

        def decorator(func: Callable):
            if task_id in self.tasks:
                raise DuplicateTaskError(self.dag_id, task_id)

            task = Task(
                task_id=task_id,
                func=func,
                trigger_rule=trigger_rule,
                timeout=timeout,
                retries=retries,
                retry_delay=retry_delay,
                on_execute=on_execute,
                on_success=on_success,
                on_failure=on_failure,
                on_retry=on_retry,
                on_skip=on_skip,
            )
            self.tasks[task_id] = task
            return task

        return decorator

    def get_task(self, task_id: str) -> Optional[Task]:
        """Retrieve a task by its ID"""
        return self.tasks.get(task_id)

    def _validate(self):
        """Comprehensive DAG validation"""
        if not self.tasks:
            raise DAGValidationError(f"DAG '{self.dag_id}' has no tasks")

        # Check for cycles
        self._check_cycles()

        # Check for self-dependencies
        self._check_self_dependencies()

        # Check that all upstream tasks exist in this DAG
        self._check_upstream_tasks_exist()

        self._validated = True

    def _check_cycles(self):
        """Detect cycles using DFS with path tracking"""
        visited = set()
        rec_stack = set()
        path = []

        def visit(task_id: str) -> bool:
            visited.add(task_id)
            rec_stack.add(task_id)
            path.append(task_id)

            task = self.tasks[task_id]
            for upstream in task.upstream_tasks:
                if upstream.task_id not in visited:
                    if visit(upstream.task_id):
                        return True
                elif upstream.task_id in rec_stack:
                    # Found cycle - build the cycle path
                    cycle_start = path.index(upstream.task_id)
                    cycle_path = path[cycle_start:] + [upstream.task_id]
                    raise CycleDetectedError(self.dag_id, cycle_path)

            path.pop()
            rec_stack.remove(task_id)
            return False

        for task_id in self.tasks:
            if task_id not in visited:
                visit(task_id)

    def _check_self_dependencies(self):
        """Check if any task depends on itself"""
        for task_id, task in self.tasks.items():
            for upstream in task.upstream_tasks:
                if upstream.task_id == task_id:
                    raise SelfDependencyError(task_id)

    def _check_upstream_tasks_exist(self):
        """Verify all upstream tasks are in this DAG"""
        for task_id, task in self.tasks.items():
            for upstream in task.upstream_tasks:
                if upstream.task_id not in self.tasks:
                    raise InvalidDependencyError(
                        upstream.task_id,
                        task_id,
                        f"upstream task '{upstream.task_id}' not found in DAG",
                    )
