import asyncio
import logging
import sys
from datetime import datetime
from typing import Callable, Optional
from .errors import (
    CallbackError,
    MaxRetriesExceededError,
    TaskFailedError,
    TaskTimeoutError,
)
from .logger import (
    get_logger,
    RiverFlowLoggerAdapter,
    TaskLogHandler,
    _current_task_logger,
    _TaskOutputStream,
)
from .run_context import RunContext, reset_run_context, set_run_context
from .task import Task, TaskInstance, TaskState


class TaskExecutor:
    """
    Executes individual tasks with retry logic, timeouts, and monitoring.

    Responsibilities:
    - Execute task functions
    - Handle retries with configurable delays
    - Monitor task timeouts
    - Execute task lifecycle callbacks
    """

    def __init__(self):
        self.logger = get_logger(component="TaskExecutor")

    async def execute_task(
        self,
        task: Task,
        on_state_change: Optional[Callable[[TaskState], None]] = None,
        run_id: Optional[str] = None,
        dag_id: Optional[str] = None,
        log_store=None,
        run_context: RunContext | None = None,
    ) -> TaskInstance:
        """Execute a single task with timeout and retries"""
        instance = TaskInstance(task_id=task.task_id)

        # --- Set up per-task log capture ---
        task_log_handler: Optional[TaskLogHandler] = None
        task_logger_token = None
        run_context_token = None
        child_logger = None
        logger = self.logger  # local ref; avoids mutating shared self.logger

        if run_id and dag_id:
            child_logger = logging.getLogger(
                f"riverflow.task.{run_id}.{task.task_id}"
            )
            child_logger.setLevel(logging.DEBUG)
            child_logger.propagate = True  # also output to console via parent

            task_log_handler = TaskLogHandler(
                log_store=log_store,
                run_id=run_id,
                dag_id=dag_id,
                task_id=task.task_id,
            )
            child_logger.addHandler(task_log_handler)

            task_adapter = RiverFlowLoggerAdapter(
                child_logger,
                {
                    "dag_id": dag_id,
                    "task_id": task.task_id,
                    "run_id": run_id,
                },
            )
            task_logger_token = _current_task_logger.set(task_adapter)
            logger = task_adapter
            context = (
                run_context.with_task(task.task_id)
                if run_context
                else RunContext(dag_id=dag_id, run_id=run_id, task_id=task.task_id)
            )
            run_context_token = set_run_context(context)

            # Ensure stdout/stderr capture wraps the *current* streams.
            # Test runners (e.g. pytest) may replace sys.stdout after the
            # initial install_task_stdout_capture() call, so re-wrap here.
            if not isinstance(sys.stdout, _TaskOutputStream):
                sys.stdout = _TaskOutputStream(sys.stdout, level="INFO")
            if not isinstance(sys.stderr, _TaskOutputStream):
                sys.stderr = _TaskOutputStream(sys.stderr, level="ERROR")

        try:
            return await self._run_with_retries(
                task, instance, on_state_change, logger
            )
        finally:
            # Clean up context var
            if task_logger_token is not None:
                _current_task_logger.reset(task_logger_token)
            if run_context_token is not None:
                reset_run_context(run_context_token)
            # Remove handler and flush any remaining logs
            if child_logger and task_log_handler:
                child_logger.removeHandler(task_log_handler)
                await asyncio.to_thread(task_log_handler.flush_remaining)

    async def _run_with_retries(
        self,
        task: Task,
        instance: TaskInstance,
        on_state_change: Optional[Callable[[TaskState], None]],
        logger,
    ) -> TaskInstance:

        # Callback on_execute
        if task.on_execute:
            try:
                await self._safe_callback(task.on_execute, instance, "on_execute")
            except CallbackError as e:
                logger.warning(str(e))

        last_error = None

        for attempt in range(task.retries + 1):
            instance.retry_count = attempt
            instance.state = (
                TaskState.RUNNING
            )  # ✨ Vai direto para RUNNING (sem QUEUED)
            instance.start_time = datetime.now()

            # Notify RUNNING state
            if on_state_change:
                try:
                    on_state_change(TaskState.RUNNING)
                except Exception as e:
                    logger.error(f"Error in state change callback: {e}")

            try:
                task_coro = task.func()

                if task.timeout:
                    await asyncio.wait_for(
                        task_coro,
                        timeout=task.timeout.total_seconds(),
                    )
                else:
                    await task_coro

                # Success!
                instance.state = TaskState.SUCCESS
                instance.end_time = datetime.now()

                # Notify SUCCESS state
                if on_state_change:
                    try:
                        on_state_change(TaskState.SUCCESS)
                    except Exception as e:
                        logger.error(f"Error in state change callback: {e}")

                if task.on_success:
                    try:
                        await self._safe_callback(
                            task.on_success, instance, "on_success"
                        )
                    except CallbackError as e:
                        logger.warning(str(e))

                return instance

            except asyncio.TimeoutError:
                last_error = TaskTimeoutError(task.task_id, task.timeout)
                instance.state = TaskState.TIMEOUT
                instance.end_time = datetime.now()
                instance.error = str(last_error)

                if attempt < task.retries:
                    logger.warning(
                        f"Retry {attempt + 1}/{task.retries} for {task.task_id}"
                    )
                    if task.on_retry:
                        try:
                            await self._safe_callback(
                                task.on_retry, instance, "on_retry"
                            )
                        except CallbackError as e:
                            logger.warning(str(e))
                    await asyncio.sleep(task.retry_delay.total_seconds())
                else:
                    # Notify TIMEOUT state (final attempt)
                    if on_state_change:
                        try:
                            on_state_change(TaskState.TIMEOUT)
                        except Exception as e:
                            logger.error(f"Error in state change callback: {e}")

                    if task.on_failure:
                        try:
                            await self._safe_callback(
                                task.on_failure, instance, "on_failure"
                            )
                        except CallbackError as e:
                            logger.warning(str(e))
                    raise MaxRetriesExceededError(
                        task.task_id, task.retries, last_error
                    )

            except Exception as e:
                last_error = e
                instance.state = TaskState.FAILED
                instance.end_time = datetime.now()
                instance.error = str(e)

                if attempt < task.retries:
                    logger.warning(
                        f"Retry {attempt + 1}/{task.retries} for {task.task_id}"
                    )
                    if task.on_retry:
                        try:
                            await self._safe_callback(
                                task.on_retry, instance, "on_retry"
                            )
                        except CallbackError as e:
                            logger.warning(str(e))
                    await asyncio.sleep(task.retry_delay.total_seconds())
                else:
                    # Notify FAILED state (final attempt)
                    if on_state_change:
                        try:
                            on_state_change(TaskState.FAILED)
                        except Exception as e:
                            logger.error(f"Error in state change callback: {e}")

                    if task.on_failure:
                        try:
                            await self._safe_callback(
                                task.on_failure, instance, "on_failure"
                            )
                        except CallbackError as e:
                            logger.warning(str(e))
                    raise TaskFailedError(task.task_id, last_error)

        return instance

    async def _safe_callback(
        self, callback: Callable, instance: TaskInstance, callback_type: str
    ):
        """Execute callback and raise CallbackError if it fails"""
        try:
            if asyncio.iscoroutinefunction(callback):
                await callback(instance)
            else:
                callback(instance)
        except Exception as e:
            raise CallbackError(callback_type, instance.task_id, e)
