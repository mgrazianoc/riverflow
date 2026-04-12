"""
Converters: core dataclasses / objects → Pydantic models.

These are the ONLY functions allowed to bridge the core engine
into the typed model layer.
"""

from datetime import datetime
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

def dag_to_summary(dag_id: str, is_running: bool, stats: dict) -> DAGSummaryModel:
    return DAGSummaryModel(
        dag_id=dag_id,
        is_running=is_running,
        total_runs=stats.get("total_runs", 0),
        success_count=stats.get("success_count", 0),
        failed_count=stats.get("failed_count", 0),
        success_rate=stats.get("success_rate", 0.0),
        avg_duration_seconds=stats.get("avg_duration_seconds", 0.0),
    )


def dag_to_model(dag: DAG, is_running: bool, stats: dict) -> DAGModel:
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
