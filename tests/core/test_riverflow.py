"""Tests for the Riverflow orchestration engine (trigger, trigger_task, history, logs)."""

from riverflow.core.dag import DAG, DAGRunState
from riverflow.core.logger import get_task_logger
from riverflow.core.riverflow import Riverflow
from riverflow.core.task import TaskState


class TestRiverflowTrigger:
    async def test_full_dag_trigger(self, riverflow: Riverflow, simple_dag: DAG):
        riverflow.register_dag(simple_dag)
        result = await riverflow.trigger("test_dag")

        assert result.state == DAGRunState.SUCCESS
        assert result.run_id is not None
        assert result.task_states["step_a"] == TaskState.SUCCESS
        assert result.task_states["step_b"] == TaskState.SUCCESS

    async def test_trigger_unknown_dag_raises(self, riverflow: Riverflow):
        try:
            await riverflow.trigger("nope")
            assert False, "Should have raised"
        except ValueError:
            pass

    async def test_trigger_failing_dag(self, riverflow: Riverflow, failing_dag: DAG):
        riverflow.register_dag(failing_dag)
        result = await riverflow.trigger("fail_dag")

        assert result.state == DAGRunState.FAILED
        assert result.task_states["bad_task"] == TaskState.FAILED


class TestRiverflowTriggerTask:
    async def test_single_task_trigger(self, riverflow: Riverflow, simple_dag: DAG):
        riverflow.register_dag(simple_dag)
        result = await riverflow.trigger_task("test_dag", "step_a")

        assert result.state == DAGRunState.SUCCESS
        assert "step_a" in result.run_id
        assert result.task_states["step_a"] == TaskState.SUCCESS

    async def test_trigger_nonexistent_task_raises(
        self, riverflow: Riverflow, simple_dag: DAG
    ):
        riverflow.register_dag(simple_dag)
        try:
            await riverflow.trigger_task("test_dag", "no_such_task")
            assert False, "Should have raised"
        except ValueError:
            pass

    async def test_trigger_task_in_unknown_dag_raises(self, riverflow: Riverflow):
        try:
            await riverflow.trigger_task("nope", "t")
            assert False, "Should have raised"
        except ValueError:
            pass

    async def test_failing_task_trigger(self, riverflow: Riverflow, failing_dag: DAG):
        riverflow.register_dag(failing_dag)
        result = await riverflow.trigger_task("fail_dag", "bad_task")

        assert result.state == DAGRunState.FAILED
        assert result.task_states["bad_task"] == TaskState.FAILED


class TestRiverflowLogCapture:
    async def test_dag_run_logs_captured(self, riverflow: Riverflow, simple_dag: DAG):
        riverflow.register_dag(simple_dag)
        result = await riverflow.trigger("test_dag")

        all_logs = riverflow.get_task_logs(result.run_id)
        assert len(all_logs) > 0

        a_logs = riverflow.get_task_logs(result.run_id, "step_a")
        b_logs = riverflow.get_task_logs(result.run_id, "step_b")
        assert any("step_a running" in l["message"] for l in a_logs)
        assert any("step_b running" in l["message"] for l in b_logs)

    async def test_print_output_captured(self, riverflow: Riverflow, simple_dag: DAG):
        riverflow.register_dag(simple_dag)
        result = await riverflow.trigger("test_dag")

        a_logs = riverflow.get_task_logs(result.run_id, "step_a")
        assert any("step_a print" in l["message"] for l in a_logs)

    async def test_single_task_trigger_logs(
        self, riverflow: Riverflow, simple_dag: DAG
    ):
        riverflow.register_dag(simple_dag)
        result = await riverflow.trigger_task("test_dag", "step_a")

        logs = riverflow.get_task_logs(result.run_id, "step_a")
        assert any("step_a running" in l["message"] for l in logs)


class TestRiverflowHistory:
    async def test_history_tracks_runs(self, riverflow: Riverflow, simple_dag: DAG):
        riverflow.register_dag(simple_dag)
        await riverflow.trigger("test_dag")
        await riverflow.trigger("test_dag")

        history = riverflow.get_history()
        assert len(history) == 2

    async def test_history_ordered_most_recent_first(
        self, riverflow: Riverflow, simple_dag: DAG
    ):
        riverflow.register_dag(simple_dag)
        first = await riverflow.trigger("test_dag")
        second = await riverflow.trigger("test_dag")

        history = riverflow.get_history()
        assert history[0].run_id == second.run_id
        assert history[1].run_id == first.run_id

    async def test_history_filter_by_dag(self, riverflow: Riverflow, simple_dag: DAG):
        riverflow.register_dag(simple_dag)
        await riverflow.trigger("test_dag")

        assert len(riverflow.get_history(dag_id="test_dag")) == 1
        assert len(riverflow.get_history(dag_id="other")) == 0

    async def test_history_persisted_to_sqlite(
        self, riverflow: Riverflow, simple_dag: DAG
    ):
        riverflow.register_dag(simple_dag)
        result = await riverflow.trigger("test_dag")

        stored = riverflow.log_store.get_run(result.run_id)
        assert stored is not None
        assert stored["state"] == "success"
        assert stored["dag_id"] == "test_dag"

    async def test_task_trigger_appears_in_history(
        self, riverflow: Riverflow, simple_dag: DAG
    ):
        riverflow.register_dag(simple_dag)
        await riverflow.trigger("test_dag")
        await riverflow.trigger_task("test_dag", "step_a")

        history = riverflow.get_history()
        assert len(history) == 2

    async def test_history_includes_run_id(
        self, riverflow: Riverflow, simple_dag: DAG
    ):
        riverflow.register_dag(simple_dag)
        result = await riverflow.trigger("test_dag")

        history = riverflow.get_history()
        assert history[0].run_id == result.run_id

    async def test_each_run_has_unique_id(
        self, riverflow: Riverflow, simple_dag: DAG
    ):
        riverflow.register_dag(simple_dag)
        r1 = await riverflow.trigger("test_dag")
        r2 = await riverflow.trigger("test_dag")

        assert r1.run_id != r2.run_id
