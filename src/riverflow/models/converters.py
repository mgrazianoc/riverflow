"""
Converters: core dataclasses / objects → Pydantic models.

These are the ONLY functions allowed to bridge the core engine
into the typed model layer.
"""

from datetime import datetime, timedelta
from typing import Optional

from ..core.dag import DAG
from ..core.task import Task
from ..core.riverflow import DAGRunHistory

from .dag import (
    DAGEdgeModel,
    DAGGraphModel,
    DAGModel,
    DAGNodeModel,
    DAGSummaryModel,
)
from .run import DAGRunModel, DAGRunStateEnum
from .task import TaskModel, TaskStateEnum, TriggerRuleEnum
from .log import LogEntryModel, TaskLogsModel
from .status import DashboardModel, ScheduledDAGModel


# ────────────────────────────────────────
# Helpers
# ────────────────────────────────────────

def _format_schedule(schedule) -> Optional[str]:
    """Human-readable schedule string."""
    if schedule is None:
        return None
    if isinstance(schedule, timedelta):
        secs = int(schedule.total_seconds())
        if secs < 60:
            return f"every {secs}s"
        if secs < 3600:
            m = secs // 60
            return f"every {m}m"
        h = secs // 3600
        return f"every {h}h"
    if isinstance(schedule, dict):
        parts = []
        for k in ("minute", "hour", "day", "month", "day_of_week"):
            parts.append(schedule.get(k, "*"))
        return " ".join(parts)
    if isinstance(schedule, str):
        return schedule
    return str(schedule)


# ────────────────────────────────────────
# Task
# ────────────────────────────────────────

def task_to_model(task: Task) -> TaskModel:
    return TaskModel(
        task_id=task.task_id,
        trigger_rule=TriggerRuleEnum(task.trigger_rule.value),
        retries=task.retries,
        retry_delay_seconds=task.retry_delay.total_seconds(),
        timeout_seconds=task.timeout.total_seconds() if task.timeout else None,
        upstream_task_ids=[t.task_id for t in task.upstream_tasks],
    )


# ────────────────────────────────────────
# DAG
# ────────────────────────────────────────

def dag_to_summary(
    dag_id: str,
    is_running: bool,
    stats: dict,
    schedule=None,
    next_run=None,
) -> DAGSummaryModel:
    return DAGSummaryModel(
        dag_id=dag_id,
        is_running=is_running,
        total_runs=stats.get("total_runs", 0),
        success_count=stats.get("success_count", 0),
        failed_count=stats.get("failed_count", 0),
        success_rate=stats.get("success_rate", 0.0),
        avg_duration_seconds=stats.get("avg_duration_seconds", 0.0),
        schedule_display=_format_schedule(schedule),
        next_run=next_run,
    )


def dag_to_model(
    dag: DAG,
    is_running: bool,
    stats: dict,
    latest_run_id: Optional[str] = None,
    next_run=None,
) -> DAGModel:
    return DAGModel(
        dag_id=dag.dag_id,
        description=dag.description,
        timezone=dag.timezone,
        is_running=is_running,
        tasks=[task_to_model(t) for t in dag.tasks.values()],
        total_runs=stats.get("total_runs", 0),
        success_count=stats.get("success_count", 0),
        failed_count=stats.get("failed_count", 0),
        success_rate=stats.get("success_rate", 0.0),
        avg_duration_seconds=stats.get("avg_duration_seconds", 0.0),
        latest_run_id=latest_run_id,
        schedule_display=_format_schedule(dag.schedule),
        next_run=next_run,
    )


def dag_to_graph(
    dag: DAG,
    is_running: bool,
    latest_run: Optional[DAGRunHistory],
) -> DAGGraphModel:
    latest_task_states: dict[str, str] = {}
    if latest_run is not None:
        latest_task_states = {
            tid: state.value for tid, state in latest_run.task_states.items()
        }

    nodes = [
        DAGNodeModel(
            id=task_id,
            label=task_id,
            state=TaskStateEnum(latest_task_states.get(task_id, "none")),
            trigger_rule=TriggerRuleEnum(task.trigger_rule.value),
            retries=task.retries,
        )
        for task_id, task in dag.tasks.items()
    ]

    edges = [
        DAGEdgeModel(
            id=f"{upstream.task_id}->{task_id}",
            source=upstream.task_id,
            target=task_id,
        )
        for task_id, task in dag.tasks.items()
        for upstream in task.upstream_tasks
    ]

    return DAGGraphModel(
        dag_id=dag.dag_id,
        is_running=is_running,
        run_id=latest_run.run_id if latest_run else None,
        nodes=nodes,
        edges=edges,
        timestamp=datetime.now(),
    )


# ────────────────────────────────────────
# Run
# ────────────────────────────────────────

def run_to_model(run: DAGRunHistory) -> DAGRunModel:
    duration = None
    if run.start_time and run.end_time:
        duration = (run.end_time - run.start_time).total_seconds()

    return DAGRunModel(
        dag_id=run.dag_id,
        run_id=run.run_id,
        state=DAGRunStateEnum(run.state.value),
        start_time=run.start_time,
        end_time=run.end_time,
        task_states={
            tid: TaskStateEnum(state.value)
            for tid, state in run.task_states.items()
        },
        error=run.error,
        duration_seconds=duration,
        metadata=run.run_context.metadata,
        trigger_source=run.run_context.trigger_source,
        trigger_mode=run.run_context.trigger_mode,
        requested_by=run.run_context.requested_by,
        force=run.run_context.force,
    )


# ────────────────────────────────────────
# Logs
# ────────────────────────────────────────

def logs_to_model(
    run_id: str,
    task_id: Optional[str],
    raw_logs: list[dict],
) -> TaskLogsModel:
    entries = [
        LogEntryModel(
            timestamp=log["timestamp"],
            level=log["level"],
            task_id=log["task_id"],
            message=log["message"],
        )
        for log in raw_logs
    ]
    return TaskLogsModel(
        run_id=run_id,
        task_id=task_id,
        total=len(entries),
        logs=entries,
    )


# ────────────────────────────────────────
# Dashboard
# ────────────────────────────────────────

def build_dashboard(riverflow) -> DashboardModel:
    """Build aggregated dashboard data from the Riverflow instance."""
    from ..core.dag import DAGRunState

    dag_ids = riverflow.get_registered_dags()
    total_dags = len(dag_ids)
    running_now = len(riverflow.get_current_runs())

    all_history = riverflow.get_history()
    total_runs = len(all_history)
    success_count = sum(1 for r in all_history if r.state == DAGRunState.SUCCESS)
    recent_failures = sum(1 for r in all_history[:20] if r.state == DAGRunState.FAILED)
    overall_rate = (success_count / total_runs * 100) if total_runs else 0.0

    # Build schedule list
    scheduled: list[ScheduledDAGModel] = []
    scheduled_info = riverflow.get_scheduled_dags()
    for info in scheduled_info:
        dag = riverflow.get_dag(info["dag_id"])
        scheduled.append(ScheduledDAGModel(
            dag_id=info["dag_id"],
            schedule_display=_format_schedule(dag.schedule) if dag else "—",
            next_run=info.get("next_run"),
        ))

    return DashboardModel(
        total_dags=total_dags,
        running_now=running_now,
        total_runs=total_runs,
        recent_failures=recent_failures,
        overall_success_rate=overall_rate,
        scheduled_dags=scheduled,
    )
