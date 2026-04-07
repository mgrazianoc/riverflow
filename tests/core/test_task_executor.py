"""Tests for TaskExecutor with per-task log capture."""

import asyncio
from datetime import timedelta

from riverflow.core.task import Task, TaskState
from riverflow.core.task_executor import TaskExecutor
from riverflow.core.log_store import LogStore
from riverflow.core.logger import get_task_logger


class TestTaskExecutorLogCapture:
    """Verify that execute_task captures logs into a LogStore."""

    async def test_successful_task_captures_logs(self, log_store: LogStore):
        async def my_func():
            logger = get_task_logger()
            logger.info("doing work")

        task = Task(task_id="t1", func=my_func)
        executor = TaskExecutor()
        instance = await executor.execute_task(
            task, run_id="run_1", dag_id="dag_1", log_store=log_store,
        )

        assert instance.state == TaskState.SUCCESS
        logs = log_store.get_task_logs("run_1", "t1")
        assert any("doing work" in l["message"] for l in logs)

    async def test_print_captured_as_log(self, log_store: LogStore):
        async def my_func():
            print("print output")

        task = Task(task_id="t1", func=my_func)
        executor = TaskExecutor()
        await executor.execute_task(
            task, run_id="run_1", dag_id="dag_1", log_store=log_store,
        )

        logs = log_store.get_task_logs("run_1", "t1")
        assert any("print output" in l["message"] for l in logs)

    async def test_failing_task_still_captures_logs(self, log_store: LogStore):
        async def my_func():
            logger = get_task_logger()
            logger.info("before crash")
            raise RuntimeError("boom")

        task = Task(task_id="t1", func=my_func)
        executor = TaskExecutor()

        try:
            await executor.execute_task(
                task, run_id="run_1", dag_id="dag_1", log_store=log_store,
            )
        except Exception:
            pass

        logs = log_store.get_task_logs("run_1", "t1")
        assert any("before crash" in l["message"] for l in logs)

    async def test_no_log_store_still_works(self):
        """execute_task should succeed even without log_store / run_id."""
        async def my_func():
            pass

        task = Task(task_id="t1", func=my_func)
        executor = TaskExecutor()
        instance = await executor.execute_task(task)
        assert instance.state == TaskState.SUCCESS

    async def test_multiple_tasks_logs_isolated(self, log_store: LogStore):
        async def func_a():
            get_task_logger().info("log_a")

        async def func_b():
            get_task_logger().info("log_b")

        executor = TaskExecutor()

        task_a = Task(task_id="ta", func=func_a)
        task_b = Task(task_id="tb", func=func_b)

        await executor.execute_task(
            task_a, run_id="run_1", dag_id="dag", log_store=log_store,
        )
        await executor.execute_task(
            task_b, run_id="run_1", dag_id="dag", log_store=log_store,
        )

        a_logs = log_store.get_task_logs("run_1", "ta")
        b_logs = log_store.get_task_logs("run_1", "tb")

        assert all(l["task_id"] == "ta" for l in a_logs)
        assert all(l["task_id"] == "tb" for l in b_logs)
        assert any("log_a" in l["message"] for l in a_logs)
        assert any("log_b" in l["message"] for l in b_logs)
