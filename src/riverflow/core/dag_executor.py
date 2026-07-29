import asyncio
from typing import Callable, List, Optional
from .dag import DAG
from .task_executor import TaskExecutor
from .errors import (
    DAGNotReadyError,
    MaxRetriesExceededError,
    TaskFailedError,
    TaskTimeoutError,
)
from .logger import get_logger
from .run_context import RunContext
from .task import Task, TaskInstance, TaskState
from .trigger_rules import TERMINAL_STATES, should_run


class DAGExecutor:
    """
    Executes a DAG using event-driven task scheduling for maximum parallelism.

    Responsibilities:
    - Event-driven task execution (start tasks as soon as dependencies are satisfied)
    - Trigger rule evaluation
    - Task state coordination
    - Optimal resource utilization
    """

    def __init__(
        self,
        dag: DAG,
        on_task_state_change: Optional[Callable[[str, TaskState], None]] = None,
        run_id: Optional[str] = None,
        log_store=None,
        run_context: RunContext | None = None,
    ):
        self.dag = dag
        self.task_executor = TaskExecutor()
        self.on_task_state_change = on_task_state_change
        self.run_id = run_id
        self.log_store = log_store
        self.run_context = run_context
        self.logger = get_logger(component="DAGExecutor", dag_id=dag.dag_id)

    def _should_task_run(
        self, task: Task, upstream_states: dict[str, TaskState]
    ) -> bool:
        """Check if task should run based on upstream states"""
        if not task.upstream_tasks:
            return True  # No upstream, always run

        states = [
            upstream_states.get(t.task_id, TaskState.NONE) for t in task.upstream_tasks
        ]
        return should_run(task.trigger_rule, states)

    @staticmethod
    def _is_terminal(state: TaskState) -> bool:
        return state in TERMINAL_STATES

    def _upstreams_are_terminal(
        self, task: Task, states: dict[str, TaskState]
    ) -> bool:
        return all(
            self._is_terminal(states.get(upstream.task_id, TaskState.NONE))
            for upstream in task.upstream_tasks
        )

    async def run(self):
        """Execute the DAG using event-driven approach"""
        if not self.dag._validated:
            raise DAGNotReadyError(self.dag.dag_id, "DAG has not been validated")

        self.logger.info(f"Starting DAG: {self.dag.dag_id}")

        states: dict[str, TaskState] = {
            task_id: TaskState.NONE for task_id in self.dag.tasks
        }

        # Track running tasks
        running_tasks: dict[asyncio.Task, Task] = {}
        dag_failed = False

        while True:
            for task in self._get_ready_tasks(states):
                await self._start_task(task, running_tasks, states)

            if running_tasks:
                done_asyncio_tasks, _ = await asyncio.wait(
                    running_tasks.keys(), return_when=asyncio.FIRST_COMPLETED
                )
                for asyncio_task in done_asyncio_tasks:
                    task = running_tasks.pop(asyncio_task)
                    try:
                        result = asyncio_task.result()
                        states[task.task_id] = result.state
                        self._notify_state_change(task.task_id, result.state)
                        self.logger.debug(
                            f"Task {task.task_id} completed: {result.state.value}"
                        )
                        if result.state in {TaskState.FAILED, TaskState.TIMEOUT}:
                            dag_failed = True
                    except Exception as e:
                        states[task.task_id] = TaskState.FAILED
                        self._notify_state_change(task.task_id, TaskState.FAILED)
                        self.logger.error(f"Unexpected error in task {task.task_id}: {e}")
                        dag_failed = True
                continue

            unresolved = [
                task
                for task in self.dag.tasks.values()
                if states[task.task_id] == TaskState.NONE
            ]
            if not unresolved:
                break

            blocked = [
                task
                for task in unresolved
                if self._upstreams_are_terminal(task, states)
            ]
            if not blocked:
                # Validation should make this unreachable, but avoid silently
                # returning a partially executed DAG if it is mutated later.
                raise DAGNotReadyError(
                    self.dag.dag_id,
                    "no remaining task can make progress; validate dependencies again",
                )

            for task in blocked:
                failed_upstream = [
                    upstream.task_id
                    for upstream in task.upstream_tasks
                    if states.get(upstream.task_id)
                    in {
                        TaskState.FAILED,
                        TaskState.UPSTREAM_FAILED,
                        TaskState.TIMEOUT,
                    }
                ]
                state = (
                    TaskState.UPSTREAM_FAILED
                    if failed_upstream
                    else TaskState.SKIPPED
                )
                states[task.task_id] = state
                self._notify_state_change(task.task_id, state)
                if failed_upstream:
                    self.logger.warning(
                        f"Skipped {task.task_id}: upstream failed "
                        f"({', '.join(failed_upstream)})"
                    )
                else:
                    self.logger.info(
                        f"Skipped {task.task_id}: trigger rule not met"
                    )
                await self._execute_skip_callback(task, state)

        # Print summary
        status = "FAILED" if dag_failed else "COMPLETED"
        self.logger.info(f"DAG {self.dag.dag_id} {status}")
        for task_id, state in states.items():
            emoji = {
                TaskState.SUCCESS: "✅",
                TaskState.FAILED: "❌",
                TaskState.TIMEOUT: "⏱️",
                TaskState.SKIPPED: "⏭️",
                TaskState.UPSTREAM_FAILED: "⛔",
            }.get(state, "❓")
            self.logger.info(f"  {emoji} {task_id}: {state.value}")

        return states

    def _get_ready_tasks(self, states: dict[str, TaskState]) -> List[Task]:
        """Find tasks that are ready to run based on current states"""
        ready_tasks = []

        for task_id, task in self.dag.tasks.items():
            # Skip if already processed
            if states[task_id] != TaskState.NONE:
                continue

            # Check if task should run based on trigger rules
            if self._upstreams_are_terminal(task, states) and self._should_task_run(
                task, states
            ):
                ready_tasks.append(task)

        return ready_tasks

    async def _start_task(
        self,
        task: Task,
        running_tasks: dict[asyncio.Task, Task],
        states: dict[str, TaskState],
    ) -> None:
        """Start a task and track it in running_tasks"""
        states[task.task_id] = TaskState.RUNNING
        self._notify_state_change(task.task_id, TaskState.RUNNING)
        self.logger.info(f"Starting task: {task.task_id}")

        # Create asyncio task for execution
        asyncio_task = asyncio.create_task(self._execute_with_error_handling(task))
        running_tasks[asyncio_task] = task

    async def _execute_skip_callback(self, task: Task, state: TaskState) -> None:
        """Execute the on_skip callback for a task"""
        if task.on_skip:
            instance = TaskInstance(task_id=task.task_id, state=state)
            try:
                if asyncio.iscoroutinefunction(task.on_skip):
                    await task.on_skip(instance)
                else:
                    task.on_skip(instance)
            except Exception as e:
                self.logger.error(f"on_skip callback error for {task.task_id}: {e}")

    def _notify_state_change(self, task_id: str, state: TaskState) -> None:
        """Notify callback when a task state changes"""
        if self.on_task_state_change:
            try:
                self.on_task_state_change(task_id, state)
            except Exception as e:
                self.logger.error(f"Error in task state change callback: {e}")

    async def _execute_with_error_handling(self, task: Task) -> TaskInstance:
        """Wrapper to handle task execution errors"""
        try:
            # Create a state change callback for this task
            def task_state_callback(state: TaskState):
                self._notify_state_change(task.task_id, state)

            return await self.task_executor.execute_task(
                task,
                task_state_callback,
                run_id=self.run_id,
                dag_id=self.dag.dag_id,
                log_store=self.log_store,
                run_context=self.run_context,
            )
        except (TaskFailedError, MaxRetriesExceededError, TaskTimeoutError):
            # Re-raise known task errors
            raise
        except Exception as e:
            # Wrap unexpected errors
            raise TaskFailedError(task.task_id, e)
