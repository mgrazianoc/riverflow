"""Tests for DAGExecutor with run_id / log_store forwarding."""

from riverflow.core.dag import DAG, DAGRunState
from riverflow.core.dag_executor import DAGExecutor
from riverflow.core.log_store import LogStore
from riverflow.core.logger import get_task_logger, get_logger, task_event
from riverflow.core.task import TaskState


# Module-level logger — mirrors the pattern used in ETL tasks
_module_logger = get_logger(component="test_dag_executor")


class TestDAGExecutorLogging:
    async def test_all_task_logs_captured(self, log_store: LogStore):
        with DAG(dag_id="d") as dag:
            @dag.task("a")
            async def a():
                get_task_logger().info("log_from_a")

            @dag.task("b")
            async def b():
                get_task_logger().info("log_from_b")

            a >> b

        executor = DAGExecutor(dag, run_id="run_1", log_store=log_store)
        states = await executor.run()

        assert states["a"] == TaskState.SUCCESS
        assert states["b"] == TaskState.SUCCESS

        all_logs = log_store.get_task_logs("run_1")
        assert any("log_from_a" in l["message"] for l in all_logs)
        assert any("log_from_b" in l["message"] for l in all_logs)

    async def test_failing_task_logs_still_stored(self, log_store: LogStore):
        with DAG(dag_id="d") as dag:
            @dag.task("ok")
            async def ok():
                get_task_logger().info("ok_msg")

            @dag.task("bad")
            async def bad():
                get_task_logger().error("about to die")
                raise RuntimeError("boom")

            ok >> bad

        executor = DAGExecutor(dag, run_id="run_1", log_store=log_store)
        states = await executor.run()

        assert states["ok"] == TaskState.SUCCESS
        assert states["bad"] == TaskState.FAILED

        ok_logs = log_store.get_task_logs("run_1", "ok")
        bad_logs = log_store.get_task_logs("run_1", "bad")
        assert any("ok_msg" in l["message"] for l in ok_logs)
        assert any("about to die" in l["message"] for l in bad_logs)

    async def test_parallel_tasks_logs_isolated(self, log_store: LogStore):
        """Fan-out pattern: a >> [b, c]. b and c run concurrently."""
        with DAG(dag_id="par") as dag:
            @dag.task("root")
            async def root():
                get_task_logger().info("root_msg")

            @dag.task("left")
            async def left():
                get_task_logger().info("left_msg")

            @dag.task("right")
            async def right():
                get_task_logger().info("right_msg")

            root >> [left, right]

        executor = DAGExecutor(dag, run_id="run_1", log_store=log_store)
        states = await executor.run()

        assert all(s == TaskState.SUCCESS for s in states.values())

        left_logs = log_store.get_task_logs("run_1", "left")
        right_logs = log_store.get_task_logs("run_1", "right")

        assert all(l["task_id"] == "left" for l in left_logs)
        assert all(l["task_id"] == "right" for l in right_logs)

    async def test_without_log_store_still_runs(self):
        with DAG(dag_id="d") as dag:
            @dag.task("t")
            async def t():
                pass

        executor = DAGExecutor(dag)
        states = await executor.run()
        assert states["t"] == TaskState.SUCCESS

    async def test_module_level_logger_captured(self, log_store: LogStore):
        """Reproduce the ETL pattern: module-level get_logger() + @task_event."""

        @task_event
        async def inner_extract():
            _module_logger.info("extracting data")

        with DAG(dag_id="etl") as dag:
            @dag.task("bronze_extract")
            async def bronze_extract():
                await inner_extract()

        executor = DAGExecutor(dag, run_id="run_etl", log_store=log_store)
        states = await executor.run()

        assert states["bronze_extract"] == TaskState.SUCCESS
        logs = log_store.get_task_logs("run_etl", "bronze_extract")
        messages = [l["message"] for l in logs]
        # task_event emits START / END
        assert any("START" in m for m in messages)
        assert any("END" in m for m in messages)
        # module-level logger emits "extracting data"
        assert any("extracting data" in m for m in messages)
