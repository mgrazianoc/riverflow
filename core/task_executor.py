import asyncio
from datetime import datetime
from typing import Callable, Optional
from .errors import (
    CallbackError,
    MaxRetriesExceededError,
    TaskFailedError,
    TaskTimeoutError,
)
from .logger import get_logger
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
    ) -> TaskInstance:
        """Execute a single task with timeout and retries"""
        instance = TaskInstance(task_id=task.task_id)

        # Callback on_execute
        if task.on_execute:
            try:
                await self._safe_callback(task.on_execute, instance, "on_execute")
            except CallbackError as e:
                self.logger.warning(str(e))

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
                    self.logger.error(f"Error in state change callback: {e}")

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
                        self.logger.error(f"Error in state change callback: {e}")

                if task.on_success:
                    try:
                        await self._safe_callback(
                            task.on_success, instance, "on_success"
                        )
                    except CallbackError as e:
                        self.logger.warning(str(e))

                return instance

            except asyncio.TimeoutError:
                last_error = TaskTimeoutError(task.task_id, task.timeout)
                instance.state = TaskState.TIMEOUT
                instance.end_time = datetime.now()
                instance.error = str(last_error)

                if attempt < task.retries:
                    self.logger.warning(
                        f"Retry {attempt + 1}/{task.retries} for {task.task_id}"
                    )
                    if task.on_retry:
                        try:
                            await self._safe_callback(
                                task.on_retry, instance, "on_retry"
                            )
                        except CallbackError as e:
                            self.logger.warning(str(e))
                    await asyncio.sleep(task.retry_delay.total_seconds())
                else:
                    # Notify TIMEOUT state (final attempt)
                    if on_state_change:
                        try:
                            on_state_change(TaskState.TIMEOUT)
                        except Exception as e:
                            self.logger.error(f"Error in state change callback: {e}")

                    if task.on_failure:
                        try:
                            await self._safe_callback(
                                task.on_failure, instance, "on_failure"
                            )
                        except CallbackError as e:
                            self.logger.warning(str(e))
                    raise MaxRetriesExceededError(
                        task.task_id, task.retries, last_error
                    )

            except Exception as e:
                last_error = e
                instance.state = TaskState.FAILED
                instance.end_time = datetime.now()
                instance.error = str(e)

                if attempt < task.retries:
                    self.logger.warning(
                        f"Retry {attempt + 1}/{task.retries} for {task.task_id}"
                    )
                    if task.on_retry:
                        try:
                            await self._safe_callback(
                                task.on_retry, instance, "on_retry"
                            )
                        except CallbackError as e:
                            self.logger.warning(str(e))
                    await asyncio.sleep(task.retry_delay.total_seconds())
                else:
                    # Notify FAILED state (final attempt)
                    if on_state_change:
                        try:
                            on_state_change(TaskState.FAILED)
                        except Exception as e:
                            self.logger.error(f"Error in state change callback: {e}")

                    if task.on_failure:
                        try:
                            await self._safe_callback(
                                task.on_failure, instance, "on_failure"
                            )
                        except CallbackError as e:
                            self.logger.warning(str(e))
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
