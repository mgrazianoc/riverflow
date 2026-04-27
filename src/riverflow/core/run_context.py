from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass, field, replace
from typing import Any


@dataclass(frozen=True)
class RunContext:
    """Metadata describing why and how a Riverflow run was started."""

    dag_id: str | None = None
    run_id: str | None = None
    task_id: str | None = None
    trigger_source: str = "manual"
    trigger_mode: str | None = None
    requested_by: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    force: bool = False

    def with_run(
        self,
        *,
        dag_id: str,
        run_id: str,
        task_id: str | None = None,
    ) -> "RunContext":
        return replace(self, dag_id=dag_id, run_id=run_id, task_id=task_id)

    def with_task(self, task_id: str) -> "RunContext":
        return replace(self, task_id=task_id)


_current_run_context: ContextVar[RunContext | None] = ContextVar(
    "riverflow_current_run_context",
    default=None,
)


def get_run_context() -> RunContext | None:
    """Return the current task's run context, if the task is running under Riverflow."""

    return _current_run_context.get()


def set_run_context(context: RunContext):
    """Set the current run context and return a token for later reset."""

    return _current_run_context.set(context)


def reset_run_context(token) -> None:
    """Reset the current run context from a token returned by set_run_context."""

    _current_run_context.reset(token)
