"""Riverflow error hierarchy.

Error messages are written to be *actionable*: they name the offending
object, explain what went wrong, and point at the most likely fix. A
user hitting these shouldn't need to open the source to understand them.
"""

from datetime import timedelta
from typing import List, Optional


class RiverflowException(Exception):
    """Base exception for all Riverflow errors."""

    pass


# === DAG VALIDATION ===============================================


class DAGValidationError(RiverflowException):
    """Base exception for DAG validation errors."""

    pass


class EmptyDAGError(DAGValidationError):
    """Raised when a DAG is validated without any registered tasks."""

    def __init__(self, dag_id: str):
        self.dag_id = dag_id
        super().__init__(
            f"DAG '{dag_id}' has no tasks. "
            f"Register at least one task with @{dag_id}.task(...) "
            f"before the `with DAG(...)` block exits."
        )


class CycleDetectedError(DAGValidationError):
    """Raised when a circular dependency is detected in a DAG."""

    def __init__(self, dag_id: str, cycle_path: Optional[List[str]] = None):
        self.dag_id = dag_id
        self.cycle_path = cycle_path or []
        path_str = " -> ".join(self.cycle_path) if self.cycle_path else "<unknown path>"
        super().__init__(
            f"Cycle detected in DAG '{dag_id}': {path_str}. "
            f"A DAG must be acyclic — remove or reverse one of the dependencies "
            f"along this path."
        )


class DuplicateTaskError(DAGValidationError):
    """Raised when two tasks are registered with the same task_id in one DAG."""

    def __init__(self, dag_id: str, task_id: str):
        self.dag_id = dag_id
        self.task_id = task_id
        super().__init__(
            f"Task '{task_id}' is registered twice in DAG '{dag_id}'. "
            f"Each task_id within a DAG must be unique. "
            f"Check for a duplicated @{dag_id}.task(\"{task_id}\") decorator, "
            f"a repeated Task(task_id=\"{task_id}\", ...) constructor, "
            f"or a module being imported more than once."
        )


class InvalidDependencyError(DAGValidationError):
    """Raised when an invalid dependency relationship is defined between tasks."""

    def __init__(self, from_task: str, to_task: str, reason: str):
        self.from_task = from_task
        self.to_task = to_task
        self.reason = reason
        super().__init__(
            f"Invalid dependency '{from_task}' >> '{to_task}': {reason}."
        )


class SelfDependencyError(InvalidDependencyError):
    """Raised when a task attempts to depend on itself."""

    def __init__(self, task_id: str):
        super().__init__(
            task_id,
            task_id,
            "a task cannot depend on itself — remove the self-referential "
            "`>>` or `set_upstream` call",
        )


class UnknownUpstreamTaskError(DAGValidationError):
    """Raised when a task references an upstream task that is not in the DAG."""

    def __init__(self, dag_id: str, task_id: str, missing_upstream: str):
        self.dag_id = dag_id
        self.task_id = task_id
        self.missing_upstream = missing_upstream
        super().__init__(
            f"Task '{task_id}' in DAG '{dag_id}' depends on upstream task "
            f"'{missing_upstream}', but that task is not registered in this DAG. "
            f"Either register it with @{dag_id}.task(\"{missing_upstream}\") "
            f"or remove the dependency."
        )


# === TASK EXECUTION ===============================================


class TaskExecutionError(RiverflowException):
    """Base exception for task execution errors."""

    def __init__(self, task_id: str, message: str):
        self.task_id = task_id
        super().__init__(f"Task '{task_id}': {message}")


class TaskTimeoutError(TaskExecutionError):
    """Raised when a task exceeds its execution timeout."""

    def __init__(self, task_id: str, timeout: timedelta):
        self.timeout = timeout
        secs = timeout.total_seconds()
        super().__init__(
            task_id,
            f"exceeded its timeout of {secs:g}s and was cancelled. "
            f"Increase `timeout=` on the task, or profile the function to "
            f"find the slow path.",
        )


class TaskFailedError(TaskExecutionError):
    """Raised when a task fails during execution due to an unhandled exception."""

    def __init__(self, task_id: str, original_error: Exception):
        self.original_error = original_error
        err_type = type(original_error).__name__
        super().__init__(
            task_id,
            f"raised {err_type}: {original_error}",
        )


class MaxRetriesExceededError(TaskExecutionError):
    """Raised when a task fails and exhausts all retry attempts."""

    def __init__(self, task_id: str, retries: int, last_error: Exception):
        self.retries = retries
        self.last_error = last_error
        attempts = retries + 1  # initial attempt + retries
        err_type = type(last_error).__name__
        super().__init__(
            task_id,
            f"exhausted all {attempts} attempts ({retries} retries). "
            f"Final error was {err_type}: {last_error}",
        )


class CallbackError(RiverflowException):
    """Raised when a task lifecycle callback (on_success, on_failure, ...) fails."""

    def __init__(self, callback_type: str, task_id: str, error: Exception):
        self.callback_type = callback_type
        self.task_id = task_id
        self.original_error = error
        err_type = type(error).__name__
        super().__init__(
            f"{callback_type} callback for task '{task_id}' raised "
            f"{err_type}: {error}. "
            f"Callbacks should be side-effect-only and must not raise; "
            f"wrap risky work in a try/except inside the callback."
        )


# === DAG EXECUTOR =================================================


class DAGExecutorError(RiverflowException):
    """Base exception for DAG execution errors."""

    pass


class DAGNotReadyError(DAGExecutorError):
    """Raised when attempting to run a DAG that is not in a ready state."""

    def __init__(self, dag_id: str, reason: str):
        self.dag_id = dag_id
        self.reason = reason
        super().__init__(
            f"DAG '{dag_id}' is not ready to run: {reason}."
        )
# Base
from datetime import timedelta
from typing import List


class RiverflowException(Exception):
    """Base exception for all workflow errors"""

    pass


# === DAG VALIDATION ===
class DAGValidationError(RiverflowException):
    """Base exception for DAG validation errors"""

    pass


class CycleDetectedError(DAGValidationError):
    """Raised when a circular dependency is detected in a DAG"""

    def __init__(self, dag_id: str, cycle_path: List[str] = None):
        self.dag_id = dag_id
        self.cycle_path = cycle_path or []
        path_str = " -> ".join(self.cycle_path) if self.cycle_path else "unknown"
        super().__init__(f"Cycle detected in DAG '{dag_id}': {path_str}")


class DuplicateTaskError(DAGValidationError):
    """Raised when attempting to add a task with an ID that already exists in the DAG"""

    def __init__(self, dag_id: str, task_id: str):
        self.dag_id = dag_id
        self.task_id = task_id
        super().__init__(f"Task '{task_id}' already exists in DAG '{dag_id}'")


class InvalidDependencyError(DAGValidationError):
    """Raised when an invalid dependency relationship is defined between tasks"""

    def __init__(self, from_task: str, to_task: str, reason: str):
        self.from_task = from_task
        self.to_task = to_task
        super().__init__(f"Invalid dependency {from_task} -> {to_task}: {reason}")


class SelfDependencyError(InvalidDependencyError):
    """Raised when a task attempts to depend on itself"""

    def __init__(self, task_id: str):
        super().__init__(task_id, task_id, "task cannot depend on itself")


# === TASK EXECUTION ===
class TaskExecutionError(RiverflowException):
    """Base exception for task execution errors"""

    def __init__(self, task_id: str, message: str):
        self.task_id = task_id
        super().__init__(f"Task '{task_id}': {message}")


class TaskTimeoutError(TaskExecutionError):
    """Raised when a task exceeds its execution timeout"""

    def __init__(self, task_id: str, timeout: timedelta):
        self.timeout = timeout
        super().__init__(task_id, f"exceeded timeout of {timeout.total_seconds()}s")


class TaskFailedError(TaskExecutionError):
    """Raised when a task fails during execution due to an unhandled exception"""

    def __init__(self, task_id: str, original_error: Exception):
        self.original_error = original_error
        super().__init__(task_id, f"failed with error: {str(original_error)}")


class MaxRetriesExceededError(TaskExecutionError):
    """Raised when a task fails and exhausts all retry attempts"""

    def __init__(self, task_id: str, retries: int, last_error: Exception):
        self.retries = retries
        self.last_error = last_error
        super().__init__(
            task_id, f"failed after {retries} retries. Last error: {str(last_error)}"
        )


class CallbackError(RiverflowException):
    """Raised when a task callback function fails during execution"""

    def __init__(self, callback_type: str, task_id: str, error: Exception):
        self.callback_type = callback_type
        self.task_id = task_id
        self.original_error = error
        super().__init__(
            f"{callback_type} callback for task '{task_id}' failed: {str(error)}"
        )


# === DAG EXECUTOR ===
class DAGExecutorError(RiverflowException):
    """Base exception for DAG execution errors"""

    pass


class DAGNotReadyError(DAGExecutorError):
    """Raised when attempting to run a DAG that is not in a ready state"""

    def __init__(self, dag_id: str, reason: str):
        self.dag_id = dag_id
        super().__init__(f"DAG '{dag_id}' is not ready to run: {reason}")
