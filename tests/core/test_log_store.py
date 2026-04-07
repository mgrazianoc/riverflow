"""Tests for riverflow.core.log_store.LogStore"""

from datetime import datetime

from riverflow.core.log_store import LogStore


class TestTaskLogsCRUD:
    """Basic insert / query cycle for task_logs table."""

    def test_save_and_retrieve_logs(self, log_store: LogStore):
        records = [
            {"timestamp": "2026-01-01T00:00:00", "level": "INFO", "message": "hello"},
            {"timestamp": "2026-01-01T00:00:01", "level": "WARNING", "message": "warn"},
        ]
        log_store.save_task_logs("run_1", "my_dag", "task_a", records)

        logs = log_store.get_task_logs("run_1")
        assert len(logs) == 2
        assert logs[0]["message"] == "hello"
        assert logs[1]["level"] == "WARNING"

    def test_filter_by_task_id(self, log_store: LogStore):
        log_store.save_task_logs(
            "run_1", "dag", "task_a",
            [{"timestamp": "t1", "level": "INFO", "message": "a"}],
        )
        log_store.save_task_logs(
            "run_1", "dag", "task_b",
            [{"timestamp": "t2", "level": "INFO", "message": "b"}],
        )

        a_logs = log_store.get_task_logs("run_1", "task_a")
        assert len(a_logs) == 1
        assert a_logs[0]["task_id"] == "task_a"

        b_logs = log_store.get_task_logs("run_1", "task_b")
        assert len(b_logs) == 1
        assert b_logs[0]["message"] == "b"

    def test_empty_records_skipped(self, log_store: LogStore):
        log_store.save_task_logs("run_1", "dag", "task_a", [])
        assert log_store.get_task_logs("run_1") == []

    def test_nonexistent_run_returns_empty(self, log_store: LogStore):
        assert log_store.get_task_logs("no_such_run") == []


class TestDagRunsCRUD:
    """Basic insert / query / upsert cycle for dag_runs table."""

    def test_save_and_get_run(self, log_store: LogStore):
        now = datetime.now()
        log_store.save_run(
            run_id="r1",
            dag_id="my_dag",
            state="success",
            start_time=now,
            end_time=now,
            task_states={"task_a": "success"},
            error=None,
        )

        runs = log_store.get_runs()
        assert len(runs) == 1
        assert runs[0]["run_id"] == "r1"
        assert runs[0]["task_states"] == {"task_a": "success"}

    def test_filter_by_dag_id(self, log_store: LogStore):
        now = datetime.now()
        for i, dag in enumerate(["dag_a", "dag_b", "dag_a"]):
            log_store.save_run(f"r{i}", dag, "success", now, now, {}, None)

        assert len(log_store.get_runs(dag_id="dag_a")) == 2
        assert len(log_store.get_runs(dag_id="dag_b")) == 1

    def test_limit(self, log_store: LogStore):
        now = datetime.now()
        for i in range(5):
            log_store.save_run(f"r{i}", "dag", "success", now, now, {}, None)

        assert len(log_store.get_runs(limit=3)) == 3

    def test_upsert_updates_state(self, log_store: LogStore):
        now = datetime.now()
        log_store.save_run("r1", "dag", "running", now, None, {}, None)
        log_store.save_run("r1", "dag", "success", now, now, {"t": "success"}, None)

        run = log_store.get_run("r1")
        assert run is not None
        assert run["state"] == "success"
        assert run["task_states"] == {"t": "success"}

    def test_get_single_run(self, log_store: LogStore):
        now = datetime.now()
        log_store.save_run("r1", "dag", "success", now, now, {}, None)

        assert log_store.get_run("r1") is not None
        assert log_store.get_run("nonexistent") is None

    def test_runs_ordered_by_start_time_desc(self, log_store: LogStore):
        t1 = datetime(2026, 1, 1, 10, 0)
        t2 = datetime(2026, 1, 1, 11, 0)
        t3 = datetime(2026, 1, 1, 12, 0)

        log_store.save_run("early", "dag", "success", t1, t1, {}, None)
        log_store.save_run("late", "dag", "success", t3, t3, {}, None)
        log_store.save_run("mid", "dag", "success", t2, t2, {}, None)

        runs = log_store.get_runs()
        assert [r["run_id"] for r in runs] == ["late", "mid", "early"]
