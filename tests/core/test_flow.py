import asyncio

import pytest

from riverflow import ConcurrencyPolicy, DAG, Flow, get_run_context
from riverflow.core.errors import (
    DuplicateFlowNodeError,
    EmptyFlowError,
    FlowCycleDetectedError,
    UnknownUpstreamFlowNodeError,
)
from riverflow.core.flow import FlowRunState
from riverflow.core.task import TaskState, TriggerRule


def make_dag(dag_id: str, func=None) -> DAG:
    with DAG(dag_id) as dag:
        @dag.task("task")
        async def task():
            if func:
                result = func()
                if asyncio.iscoroutine(result):
                    await result
    return dag


def test_flow_validates_empty_duplicate_foreign_and_cycle():
    with pytest.raises(EmptyFlowError):
        with Flow("empty"):
            pass

    first = make_dag("first")
    second = make_dag("second")
    flow = Flow("validation")
    left = flow.add_dag(first, node_id="left")
    with pytest.raises(DuplicateFlowNodeError):
        flow.add_dag(second, node_id="left")

    foreign = Flow("foreign")
    outside = foreign.add_dag(second)
    left.upstream_nodes.append(outside)
    with pytest.raises(UnknownUpstreamFlowNodeError):
        flow._validate()

    cyclic = Flow("cyclic")
    one = cyclic.add_dag(first)
    two = cyclic.add_dag(second)
    one >> two
    two >> one
    with pytest.raises(FlowCycleDetectedError, match="first -> second -> first"):
        cyclic._validate()


def test_flow_dependency_operators_and_configuration():
    dags = [make_dag(f"dag_{index}") for index in range(3)]
    flow = Flow("operators")
    one = flow.add_dag(dags[0], parameters={"scope": "bronze"})
    two = flow.add_dag(
        dags[1],
        trigger_rule=TriggerRule.ALL_DONE,
        concurrency=ConcurrencyPolicy.REJECT,
    )
    three = flow.add_dag(dags[2])

    one >> [two, three]
    flow._validate()

    assert two.upstream_nodes == [one]
    assert three.upstream_nodes == [one]
    assert one.parameters == {"scope": "bronze"}
    assert two.trigger_rule == TriggerRule.ALL_DONE
    assert two.concurrency == ConcurrencyPolicy.REJECT


async def test_flow_executes_dags_with_lineage_and_merged_parameters(riverflow):
    seen = []

    async def capture():
        context = get_run_context()
        seen.append(context)

    extract = make_dag("extract", capture)
    publish = make_dag("publish", capture)
    with Flow("daily", description="Cross-DAG orchestration") as flow:
        first = flow.add_dag(extract, parameters={"layer": "bronze"})
        second = flow.add_dag(publish, parameters={"layer": "gold"})
        first >> second

    riverflow.register_flow(flow)
    result = await riverflow.trigger_flow(
        "daily",
        parameters={"dataset": "ibge", "layer": "default"},
        requested_by="regression-test",
    )

    assert result is not None
    assert result.state == FlowRunState.SUCCESS
    assert result.node_states == {
        "extract": TaskState.SUCCESS,
        "publish": TaskState.SUCCESS,
    }
    assert set(result.dag_run_ids) == {"extract", "publish"}
    assert [context.metadata["layer"] for context in seen] == ["bronze", "gold"]
    assert all(context.metadata["dataset"] == "ibge" for context in seen)
    assert all(context.parent_flow_run_id == result.run_id for context in seen)
    assert [context.flow_node_id for context in seen] == ["extract", "publish"]
    assert all(context.trigger_source == "flow" for context in seen)

    persisted_children = riverflow.log_store.get_runs()
    assert {
        row["parent_flow_run_id"] for row in persisted_children
    } == {result.run_id}
    assert {
        row["flow_node_id"] for row in persisted_children
    } == {"extract", "publish"}
    riverflow._flow_run_history = []
    riverflow._rehydrate_flow_history()
    restored = riverflow.get_flow_history("daily")
    assert len(restored) == 1
    assert restored[0].dag_run_ids == result.dag_run_ids
    assert restored[0].node_states == result.node_states


async def test_flow_runs_independent_branches_in_parallel(riverflow):
    both_started = asyncio.Event()
    starts = 0

    async def branch():
        nonlocal starts
        starts += 1
        if starts == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=0.5)

    flow = Flow("parallel")
    flow.add_dag(make_dag("left", branch))
    flow.add_dag(make_dag("right", branch))
    riverflow.register_flow(flow)

    result = await riverflow.trigger_flow("parallel")

    assert result is not None
    assert result.state == FlowRunState.SUCCESS
    assert starts == 2


async def test_flow_failure_cascades_but_all_done_still_runs(riverflow):
    ran = []

    def fail():
        raise RuntimeError("source broke")

    failed = make_dag("failed", fail)
    blocked = make_dag("blocked", lambda: ran.append("blocked"))
    cleanup = make_dag("cleanup", lambda: ran.append("cleanup"))
    flow = Flow("failure")
    source = flow.add_dag(failed)
    normal = flow.add_dag(blocked)
    always = flow.add_dag(cleanup, trigger_rule=TriggerRule.ALL_DONE)
    source >> [normal, always]
    riverflow.register_flow(flow)

    result = await riverflow.trigger_flow("failure")

    assert result is not None
    assert result.state == FlowRunState.FAILED
    assert result.node_states["failed"] == TaskState.FAILED
    assert result.node_states["blocked"] == TaskState.UPSTREAM_FAILED
    assert result.node_states["cleanup"] == TaskState.SUCCESS
    assert ran == ["cleanup"]
    assert "failed" in result.node_errors


async def test_queue_policy_waits_for_busy_dag(riverflow):
    release = asyncio.Event()
    executions = 0

    async def wait_once():
        nonlocal executions
        executions += 1
        if executions == 1:
            await release.wait()

    dag = make_dag("shared", wait_once)
    flow = Flow("queued")
    flow.add_dag(dag)
    riverflow.register_flow(flow)
    external = await riverflow.trigger("shared", wait=False)
    assert external is not None

    flow_task = asyncio.create_task(riverflow.trigger_flow("queued"))
    await asyncio.sleep(0.08)
    assert executions == 1
    release.set()
    result = await asyncio.wait_for(flow_task, timeout=1)

    assert result is not None
    assert result.state == FlowRunState.SUCCESS
    assert executions == 2


async def test_reject_policy_fails_when_dag_is_busy(riverflow):
    release = asyncio.Event()

    async def wait():
        await release.wait()

    dag = make_dag("busy", wait)
    flow = Flow("rejected")
    flow.add_dag(dag, concurrency=ConcurrencyPolicy.REJECT)
    riverflow.register_flow(flow)
    external = await riverflow.trigger("busy", wait=False)
    assert external is not None

    result = await riverflow.trigger_flow("rejected")
    release.set()
    while riverflow.is_running("busy"):
        await asyncio.sleep(0)

    assert result is not None
    assert result.state == FlowRunState.FAILED
    assert "concurrency policy is 'reject'" in result.node_errors["busy"]


async def test_force_policy_starts_a_concurrent_dag_run(riverflow):
    release = asyncio.Event()
    executions = 0

    async def first_waits():
        nonlocal executions
        executions += 1
        if executions == 1:
            await release.wait()

    dag = make_dag("force_shared", first_waits)
    flow = Flow("forced")
    flow.add_dag(dag, concurrency=ConcurrencyPolicy.FORCE)
    riverflow.register_flow(flow)
    external = await riverflow.trigger("force_shared", wait=False)
    assert external is not None
    while executions < 1:
        await asyncio.sleep(0)

    result = await asyncio.wait_for(riverflow.trigger_flow("forced"), timeout=1)

    assert result is not None
    assert result.state == FlowRunState.SUCCESS
    assert executions == 2
    assert riverflow.is_running("force_shared")
    release.set()
    while riverflow.is_running("force_shared"):
        await asyncio.sleep(0)


async def test_background_flow_rejects_rapid_duplicate_trigger(riverflow):
    release = asyncio.Event()
    dag = make_dag("slow", release.wait)
    flow = Flow("single")
    flow.add_dag(dag)
    riverflow.register_flow(flow)

    first = await riverflow.trigger_flow("single", wait=False)
    second = await riverflow.trigger_flow("single", wait=False)

    assert first is not None
    assert second is None
    release.set()
    while riverflow.is_flow_running("single"):
        await asyncio.sleep(0)


async def test_scheduled_flow_marks_trigger_context(riverflow):
    dag = make_dag("scheduled_child")
    flow = Flow("scheduled_flow")
    flow.add_dag(dag)
    riverflow.register_flow(flow)

    await riverflow._scheduled_flow_trigger("scheduled_flow")
    while riverflow.is_flow_running("scheduled_flow"):
        await asyncio.sleep(0)

    history = riverflow.get_flow_history("scheduled_flow")
    assert history[0].trigger_source == "schedule"
    assert history[0].trigger_mode == "scheduled"


def test_flow_history_round_trip_and_clear(log_store):
    from datetime import datetime

    now = datetime.now()
    log_store.save_flow_run(
        run_id="flow_run",
        flow_id="flow",
        state="success",
        start_time=now,
        end_time=now,
        node_states={"extract": "success"},
        dag_run_ids={"extract": "dag_run"},
        node_errors={},
        error=None,
        parameters={"scope": "ibge"},
        trigger_source="api",
        trigger_mode="backfill",
        requested_by="tester",
    )

    runs = log_store.get_flow_runs("flow")
    assert runs[0]["node_states"] == {"extract": "success"}
    assert runs[0]["dag_run_ids"] == {"extract": "dag_run"}
    assert runs[0]["parameters"] == {"scope": "ibge"}
    assert log_store.clear_flow_runs("flow") == 1
    assert log_store.get_flow_runs() == []
