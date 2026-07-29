"""
RiverFlow - Workflow Orchestration Engine

A singleton class that manages DAG execution, state tracking, and provides
a centralized interface for triggering and monitoring workflows.
"""

import asyncio
import json
import threading
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional
from dataclasses import dataclass, field

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from pytz import timezone as pytz_timezone

from .dag import DAG, DAGRunState
from .logger import get_logger, install_task_stdout_capture
from .dag_executor import DAGExecutor
from .flow import Flow, FlowRunHistory, FlowRunState
from .flow_executor import FlowExecutor
from .run_context import RunContext
from .task import TaskState
from .task_executor import TaskExecutor
from .log_store import LogStore


@dataclass
class DAGRunHistory:
    """Record of a DAG execution"""

    dag_id: str
    run_id: str
    state: DAGRunState
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    task_states: Dict[str, TaskState] = field(default_factory=dict)
    error: Optional[str] = None
    run_context: RunContext = field(default_factory=RunContext)


class Riverflow:
    """
    Singleton orchestration engine for managing DAG executions.

    Features:
    - Centralized DAG state management
    - Execution locking to prevent concurrent runs
    - Historical state tracking
    - Update callbacks for real-time monitoring
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
        return cls._instance

    def __init__(self, logger=None):
        if self._initialized:
            return

        self._initialized = True
        self._dags: Dict[str, DAG] = {}
        self._dag_locks: Dict[str, asyncio.Lock] = {}
        self._run_history: List[DAGRunHistory] = []
        self._current_runs: Dict[str, DAGRunHistory] = {}
        self._active_runs: Dict[str, Dict[str, DAGRunHistory]] = {}
        self._update_callbacks: List[Callable[[DAGRunHistory], None]] = []
        self._run_counter = 0
        self._flows: Dict[str, Flow] = {}
        self._flow_locks: Dict[str, asyncio.Lock] = {}
        self._flow_run_history: List[FlowRunHistory] = []
        self._current_flow_runs: Dict[str, FlowRunHistory] = {}
        self._active_flow_runs: Dict[str, Dict[str, FlowRunHistory]] = {}
        self._flow_update_callbacks: List[Callable[[FlowRunHistory], None]] = []
        self._flow_run_counter = 0
        self._scheduler = None
        self._scheduler_started = False
        self._log_store = LogStore()
        self.logger = (
            logger if logger is not None else get_logger(component="RiverFlow")
        )
        install_task_stdout_capture()

        # Rehydrate run history from SQLite
        self._rehydrate_history()
        self._rehydrate_flow_history()

    @classmethod
    def get_instance(cls) -> "Riverflow":
        """Get the singleton instance"""
        return cls()

    def register_dag(self, dag: DAG) -> None:
        """
        Register a DAG with RiverFlow.

        Args:
            dag: The DAG to register
            auto_schedule: If True and DAG has a schedule, automatically schedule it
        """
        dag._validate()

        if dag.dag_id in self._dags:
            self.logger.warning(f"DAG '{dag.dag_id}' already registered, updating...")

        self._dags[dag.dag_id] = dag
        if dag.dag_id not in self._dag_locks:
            self._dag_locks[dag.dag_id] = asyncio.Lock()

        self.logger.info(f"DAG '{dag.dag_id}' registered with RiverFlow")

        # Auto-schedule if DAG has a schedule
        if dag.schedule and self._scheduler_started:
            self._schedule_dag(dag)

    def register_flow(self, flow: Flow) -> None:
        """Register a Flow and the DAG definitions referenced by its nodes."""
        flow._validate()
        for node in flow.nodes.values():
            existing = self._dags.get(node.dag.dag_id)
            if existing is not None and existing is not node.dag:
                raise ValueError(
                    f"Flow '{flow.flow_id}' references DAG '{node.dag.dag_id}', "
                    "but a different DAG object with that ID is already registered. "
                    "Reuse the registered DAG object or choose a unique dag_id."
                )
            if existing is None:
                self.register_dag(node.dag)
        if flow.flow_id in self._flows:
            self.logger.warning(
                f"Flow '{flow.flow_id}' already registered, updating..."
            )
        self._flows[flow.flow_id] = flow
        self._flow_locks.setdefault(flow.flow_id, asyncio.Lock())
        if flow.schedule and self._scheduler_started:
            self._schedule_flow(flow)
        self.logger.info(f"Flow '{flow.flow_id}' registered with RiverFlow")

    def on_update(self, callback: Callable[[DAGRunHistory], None]) -> None:
        """
        Register a callback to receive DAG state updates.

        Args:
            callback: Function that receives DAGRunHistory on updates

        Example:
            def my_callback(run_history):
                print(f"DAG {run_history.dag_id} is now {run_history.state}")

            riverflow.on_update(my_callback)
        """
        self._update_callbacks.append(callback)
        self.logger.info(f"Registered update callback: {callback.__name__}")

    def _notify_update(self, run_history: DAGRunHistory) -> None:
        """Notify all registered callbacks of a state update"""
        for callback in self._update_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    # Schedule async callbacks
                    asyncio.create_task(callback(run_history))
                else:
                    callback(run_history)
            except Exception as e:
                self.logger.error(f"Error in update callback {callback.__name__}: {e}")

    def on_flow_update(self, callback: Callable[[FlowRunHistory], None]) -> None:
        """Register a callback for Flow run updates."""
        self._flow_update_callbacks.append(callback)

    def _notify_flow_update(self, run_history: FlowRunHistory) -> None:
        for callback in self._flow_update_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    asyncio.create_task(callback(run_history))
                else:
                    callback(run_history)
            except Exception as error:
                name = getattr(callback, "__name__", repr(callback))
                self.logger.error(f"Error in Flow update callback {name}: {error}")

    async def trigger(
        self,
        dag_id: str,
        wait: bool = True,
        force: bool = False,
        *,
        metadata: dict[str, Any] | None = None,
        trigger_source: str = "manual",
        trigger_mode: str | None = None,
        requested_by: str | None = None,
        run_context: RunContext | None = None,
    ) -> Optional[DAGRunHistory]:
        """
        Trigger a DAG execution.

        Args:
            dag_id: ID of the DAG to trigger
            wait: If True, wait for completion. If False, run in background
            force: If True, allows concurrent runs (ignores lock)
            metadata: Arbitrary user metadata attached to this run
            trigger_source: Source that requested the run (e.g. manual, api, schedule)
            trigger_mode: Caller-defined trigger intent/mode
            requested_by: Optional user or system identifier
            run_context: Pre-built context; if provided, explicit fields above fill gaps

        Returns:
            DAGRunHistory (RUNNING state if wait=False, final state if wait=True).
            None only when the DAG is already running and force=False.

        Example:
            # Wait for completion
            result = await riverflow.trigger("my_dag")

            # Fire and forget — returns immediately with RUNNING state
            result = await riverflow.trigger("my_dag", wait=False)
        """
        if dag_id not in self._dags:
            raise ValueError(f"DAG '{dag_id}' not registered with RiverFlow")

        dag = self._dags[dag_id]
        dag_lock = self._dag_locks[dag_id]

        # A background run is registered before it acquires the lock, so the
        # active-run registry closes the rapid double-trigger race.
        if not force and self.is_running(dag_id):
            self.logger.info(
                f"DAG '{dag_id}' is already running. Skipping trigger."
            )
            return None

        context = self._build_run_context(
            dag_id=dag.dag_id,
            force=force,
            metadata=metadata,
            trigger_source=trigger_source,
            trigger_mode=trigger_mode,
            requested_by=requested_by,
            run_context=run_context,
        )

        # Create run history upfront so we can return it immediately
        run_history = self._create_run_history(dag.dag_id, run_context=context)

        if wait:
            if force:
                return await self._execute_dag(dag, run_history)
            async with dag_lock:
                return await self._execute_dag(dag, run_history)
        else:
            if force:
                asyncio.create_task(self._execute_dag(dag, run_history))
            else:
                asyncio.create_task(self._execute_dag_with_lock(dag, run_history))
            self.logger.info(f"DAG '{dag_id}' triggered in background")
            return run_history

    def _build_run_context(
        self,
        *,
        dag_id: str,
        force: bool = False,
        metadata: dict[str, Any] | None = None,
        trigger_source: str = "manual",
        trigger_mode: str | None = None,
        requested_by: str | None = None,
        run_context: RunContext | None = None,
    ) -> RunContext:
        if run_context is None:
            context = RunContext(
                dag_id=dag_id,
                trigger_source=trigger_source,
                trigger_mode=trigger_mode,
                requested_by=requested_by,
                metadata=metadata or {},
                force=force,
            )
        else:
            merged_metadata = dict(run_context.metadata)
            if metadata:
                merged_metadata.update(metadata)
            context = RunContext(
                dag_id=run_context.dag_id or dag_id,
                run_id=run_context.run_id,
                task_id=run_context.task_id,
                trigger_source=run_context.trigger_source or trigger_source,
                trigger_mode=run_context.trigger_mode or trigger_mode,
                requested_by=run_context.requested_by or requested_by,
                metadata=merged_metadata,
                force=run_context.force or force,
                parent_flow_run_id=run_context.parent_flow_run_id,
                flow_node_id=run_context.flow_node_id,
            )

        try:
            json.dumps(context.metadata)
        except (TypeError, ValueError, RecursionError) as error:
            raise ValueError(
                f"Metadata for DAG '{dag_id}' must be JSON-serializable. "
                "Use strings, numbers, booleans, null, lists, and string-keyed objects."
            ) from error
        return context

    def _create_run_history(
        self,
        dag_id: str,
        task_id: str | None = None,
        run_context: RunContext | None = None,
    ) -> DAGRunHistory:
        """Create and register a new DAGRunHistory record."""
        self._run_counter += 1
        suffix = f"_{task_id}" if task_id else ""
        run_id = (
            f"{dag_id}{suffix}"
            f"_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            f"_{self._run_counter}"
        )
        context = (run_context or RunContext()).with_run(
            dag_id=dag_id,
            run_id=run_id,
            task_id=task_id,
        )
        run_history = DAGRunHistory(
            dag_id=dag_id,
            run_id=run_id,
            state=DAGRunState.RUNNING,
            start_time=datetime.now(),
            run_context=context,
        )
        self._active_runs.setdefault(dag_id, {})[run_id] = run_history
        self._current_runs[dag_id] = run_history
        self._run_history.append(run_history)
        self._notify_update(run_history)
        return run_history

    async def trigger_flow(
        self,
        flow_id: str,
        wait: bool = True,
        force: bool = False,
        *,
        parameters: dict[str, Any] | None = None,
        trigger_source: str = "manual",
        trigger_mode: str | None = None,
        requested_by: str | None = None,
    ) -> FlowRunHistory | None:
        """Trigger a registered Flow of DAG runs."""
        flow = self._flows.get(flow_id)
        if flow is None:
            raise ValueError(f"Flow '{flow_id}' not registered with RiverFlow")
        values = dict(parameters or {})
        try:
            json.dumps(values)
        except (TypeError, ValueError, RecursionError) as error:
            raise ValueError(
                f"Parameters for Flow '{flow_id}' must be JSON-serializable. "
                "Use strings, numbers, booleans, null, lists, and string-keyed objects."
            ) from error
        if not force and self.is_flow_running(flow_id):
            self.logger.info(f"Flow '{flow_id}' is already running. Skipping trigger.")
            return None

        run_history = self._create_flow_run_history(
            flow_id,
            parameters=values,
            trigger_source=trigger_source,
            trigger_mode=trigger_mode,
            requested_by=requested_by,
        )
        if wait:
            if force:
                return await self._execute_flow(flow, run_history)
            async with self._flow_locks[flow_id]:
                return await self._execute_flow(flow, run_history)
        if force:
            asyncio.create_task(self._execute_flow(flow, run_history))
        else:
            asyncio.create_task(self._execute_flow_with_lock(flow, run_history))
        return run_history

    def _create_flow_run_history(
        self,
        flow_id: str,
        *,
        parameters: dict[str, Any],
        trigger_source: str,
        trigger_mode: str | None,
        requested_by: str | None,
    ) -> FlowRunHistory:
        self._flow_run_counter += 1
        run_id = (
            f"{flow_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            f"_{self._flow_run_counter}"
        )
        history = FlowRunHistory(
            flow_id=flow_id,
            run_id=run_id,
            state=FlowRunState.RUNNING,
            start_time=datetime.now(),
            parameters=parameters,
            trigger_source=trigger_source,
            trigger_mode=trigger_mode,
            requested_by=requested_by,
        )
        self._active_flow_runs.setdefault(flow_id, {})[run_id] = history
        self._current_flow_runs[flow_id] = history
        self._flow_run_history.append(history)
        self._notify_flow_update(history)
        return history

    async def _execute_flow_with_lock(
        self, flow: Flow, history: FlowRunHistory
    ) -> FlowRunHistory:
        async with self._flow_locks[flow.flow_id]:
            return await self._execute_flow(flow, history)

    async def _execute_flow(
        self, flow: Flow, history: FlowRunHistory
    ) -> FlowRunHistory:
        try:
            def on_node_state_change(
                node_id: str,
                state: TaskState,
                dag_run_id: str | None,
                error: str | None,
            ) -> None:
                history.node_states[node_id] = state
                if dag_run_id:
                    history.dag_run_ids[node_id] = dag_run_id
                if error:
                    history.node_errors[node_id] = error
                self._notify_flow_update(history)

            history.node_states = await FlowExecutor(
                flow,
                self,
                history,
                on_node_state_change=on_node_state_change,
            ).run()
            failed_states = {
                TaskState.FAILED,
                TaskState.TIMEOUT,
                TaskState.UPSTREAM_FAILED,
            }
            history.state = (
                FlowRunState.FAILED
                if any(state in failed_states for state in history.node_states.values())
                else FlowRunState.SUCCESS
            )
            if history.node_errors:
                history.error = "; ".join(
                    f"{node_id}: {error}"
                    for node_id, error in history.node_errors.items()
                )
        except Exception as error:
            history.state = FlowRunState.FAILED
            history.error = str(error)
            self.logger.error(f"Flow '{flow.flow_id}' execution failed: {error}")
        finally:
            history.end_time = datetime.now()
            self._finish_active_flow_run(flow.flow_id, history.run_id)
            await self._persist_flow_run(history)
            self._notify_flow_update(history)
        return history

    async def _execute_dag_with_lock(
        self, dag: DAG, run_history: DAGRunHistory
    ) -> DAGRunHistory:
        """Execute DAG with lock protection"""
        dag_lock = self._dag_locks[dag.dag_id]
        async with dag_lock:
            return await self._execute_dag(dag, run_history)

    async def _execute_dag(
        self, dag: DAG, run_history: DAGRunHistory
    ) -> DAGRunHistory:
        """Internal method to execute a DAG and track its state"""
        run_id = run_history.run_id

        try:
            # Define callback for task state changes
            def on_task_state_change(task_id: str, state: TaskState):
                """Update run_history.task_states on every task state change"""
                run_history.task_states[task_id] = state
                # Notify listeners of the update
                self._notify_update(run_history)

            # Execute the DAG using DAGExecutor with state change callback
            dag_executor = DAGExecutor(
                dag,
                on_task_state_change=on_task_state_change,
                run_id=run_id,
                log_store=self._log_store,
                run_context=run_history.run_context,
            )
            task_states = await dag_executor.run()

            # Ensure final states are in sync
            run_history.task_states = task_states
            run_history.end_time = datetime.now()

            # Check if any task failed
            failed_states = {
                TaskState.FAILED,
                TaskState.TIMEOUT,
                TaskState.UPSTREAM_FAILED,
            }

            has_failures = any(state in failed_states for state in task_states.values())

            run_history.state = (
                DAGRunState.FAILED if has_failures else DAGRunState.SUCCESS
            )

        except Exception as e:
            run_history.state = DAGRunState.FAILED
            run_history.end_time = datetime.now()
            run_history.error = str(e)
            self.logger.error(f"DAG '{dag.dag_id}' execution failed: {e}")

        finally:
            self._finish_active_run(dag.dag_id, run_history.run_id)

            # Persist to SQLite
            await self._persist_run(run_history)

            # Notify final state
            self._notify_update(run_history)

        return run_history

    def get_history(
        self, dag_id: Optional[str] = None, limit: Optional[int] = None
    ) -> List[DAGRunHistory]:
        """
        Get historical DAG run states.

        Args:
            dag_id: Filter by specific DAG ID (None for all DAGs)
            limit: Maximum number of records to return (None for all)

        Returns:
            List of DAGRunHistory records, most recent first

        Example:
            # Get last 10 runs of all DAGs
            history = riverflow.get_history(limit=10)

            # Get all runs of specific DAG
            history = riverflow.get_history(dag_id="my_dag")
        """
        # Filter by dag_id if specified
        if dag_id:
            filtered = [h for h in self._run_history if h.dag_id == dag_id]
        else:
            filtered = self._run_history

        # Sort by start_time descending (most recent first)
        sorted_history = sorted(
            filtered, key=lambda h: h.start_time or datetime.min, reverse=True
        )

        # Apply limit if specified
        if limit:
            return sorted_history[:limit]

        return sorted_history

    def get_current_runs(self) -> Dict[str, DAGRunHistory]:
        """
        Get all currently running DAGs.

        Returns:
            Dictionary mapping dag_id to their current DAGRunHistory

        Example:
            current = riverflow.get_current_runs()
            for dag_id, run in current.items():
                print(f"{dag_id} has been running for {duration}s")
        """
        return self._current_runs.copy()

    def get_flow_history(
        self, flow_id: str | None = None, limit: int | None = None
    ) -> List[FlowRunHistory]:
        """Return Flow run history, most recent first."""
        values = (
            [run for run in self._flow_run_history if run.flow_id == flow_id]
            if flow_id
            else self._flow_run_history
        )
        result = sorted(
            values, key=lambda run: run.start_time or datetime.min, reverse=True
        )
        return result[:limit] if limit else result

    def get_current_flow_runs(self) -> Dict[str, FlowRunHistory]:
        """Return the most recent active run for every running Flow."""
        return self._current_flow_runs.copy()

    def is_flow_running(self, flow_id: str) -> bool:
        return bool(self._active_flow_runs.get(flow_id))

    def _finish_active_flow_run(self, flow_id: str, run_id: str) -> None:
        active = self._active_flow_runs.get(flow_id)
        if not active:
            self._current_flow_runs.pop(flow_id, None)
            return
        active.pop(run_id, None)
        if active:
            self._current_flow_runs[flow_id] = next(reversed(active.values()))
        else:
            self._active_flow_runs.pop(flow_id, None)
            self._current_flow_runs.pop(flow_id, None)

    def is_running(self, dag_id: str) -> bool:
        """
        Check if a DAG is currently running.

        Args:
            dag_id: The DAG ID to check

        Returns:
            True if the DAG is currently running

        Example:
            if riverflow.is_running("my_dag"):
                print("DAG is busy")
        """
        return bool(self._active_runs.get(dag_id))

    def _finish_active_run(self, dag_id: str, run_id: str) -> None:
        """Remove one active run without hiding concurrent forced runs."""
        active = self._active_runs.get(dag_id)
        if not active:
            self._current_runs.pop(dag_id, None)
            return
        active.pop(run_id, None)
        if active:
            self._current_runs[dag_id] = next(reversed(active.values()))
        else:
            self._active_runs.pop(dag_id, None)
            self._current_runs.pop(dag_id, None)

    def get_dag_stats(self, dag_id: str) -> Dict:
        """
        Get statistics for a specific DAG.

        Args:
            dag_id: The DAG ID to analyze

        Returns:
            Dictionary with statistics (total_runs, success_count, etc.)
        """
        runs = self.get_history(dag_id=dag_id)

        if not runs:
            return {
                "total_runs": 0,
                "success_count": 0,
                "failed_count": 0,
                "success_rate": 0.0,
                "avg_duration_seconds": 0.0,
            }

        success_count = sum(1 for r in runs if r.state == DAGRunState.SUCCESS)
        failed_count = sum(1 for r in runs if r.state == DAGRunState.FAILED)

        # Calculate average duration
        durations = []
        for run in runs:
            if run.start_time and run.end_time:
                duration = (run.end_time - run.start_time).total_seconds()
                durations.append(duration)

        avg_duration = sum(durations) / len(durations) if durations else 0.0

        return {
            "total_runs": len(runs),
            "success_count": success_count,
            "failed_count": failed_count,
            "success_rate": (success_count / len(runs) * 100) if runs else 0.0,
            "avg_duration_seconds": avg_duration,
            "last_run": runs[0] if runs else None,
        }

    def clear_history(self, dag_id: Optional[str] = None) -> int:
        """
        Clear run history.

        Args:
            dag_id: Clear history for specific DAG (None for all)

        Returns:
            Number of records cleared
        """
        if dag_id and self.is_running(dag_id):
            raise RuntimeError(
                f"Cannot clear history for DAG '{dag_id}' while it is running. "
                "Wait for the active run to finish and try again."
            )
        if dag_id is None and self._active_runs:
            raise RuntimeError(
                "Cannot clear all history while DAGs are running. "
                "Wait for active runs to finish and try again."
            )

        if dag_id:
            before = len(self._run_history)
            self._run_history = [h for h in self._run_history if h.dag_id != dag_id]
            cleared = before - len(self._run_history)
        else:
            cleared = len(self._run_history)
            self._run_history.clear()

        self._log_store.clear_runs(dag_id)
        self.logger.info(f"Cleared {cleared} history record(s)")
        return cleared

    def clear_flow_history(self, flow_id: str | None = None) -> int:
        """Clear Flow history once the selected Flows are idle."""
        if flow_id and self.is_flow_running(flow_id):
            raise RuntimeError(
                f"Cannot clear history for Flow '{flow_id}' while it is running. "
                "Wait for the active run to finish and try again."
            )
        if flow_id is None and self._active_flow_runs:
            raise RuntimeError(
                "Cannot clear all Flow history while Flows are running. "
                "Wait for active runs to finish and try again."
            )
        if flow_id:
            before = len(self._flow_run_history)
            self._flow_run_history = [
                run for run in self._flow_run_history if run.flow_id != flow_id
            ]
            cleared = before - len(self._flow_run_history)
        else:
            cleared = len(self._flow_run_history)
            self._flow_run_history.clear()
        self._log_store.clear_flow_runs(flow_id)
        return cleared

    def get_registered_dags(self) -> List[str]:
        """Get list of all registered DAG IDs"""
        return list(self._dags.keys())

    def get_dag(self, dag_id: str) -> Optional[DAG]:
        """Get DAG definition by ID."""
        return self._dags.get(dag_id)

    def get_registered_flows(self) -> List[str]:
        return list(self._flows.keys())

    def get_flow(self, flow_id: str) -> Flow | None:
        return self._flows.get(flow_id)

    @property
    def log_store(self) -> LogStore:
        """Access the underlying log store."""
        return self._log_store

    # ========== PERSISTENCE HELPERS ==========

    def _rehydrate_history(self) -> None:
        """Load past run records from SQLite into in-memory history."""
        try:
            rows = self._log_store.get_runs()
            for row in rows:
                start = (
                    datetime.fromisoformat(row["start_time"])
                    if row.get("start_time")
                    else None
                )
                end = (
                    datetime.fromisoformat(row["end_time"])
                    if row.get("end_time")
                    else None
                )
                task_states = {}
                for tid, sval in (row.get("task_states") or {}).items():
                    try:
                        task_states[tid] = TaskState(sval)
                    except ValueError:
                        task_states[tid] = TaskState.NONE

                self._run_history.append(
                    DAGRunHistory(
                        dag_id=row["dag_id"],
                        run_id=row["run_id"],
                        state=DAGRunState(row["state"]),
                        start_time=start,
                        end_time=end,
                        task_states=task_states,
                        error=row.get("error"),
                        run_context=RunContext(
                            dag_id=row["dag_id"],
                            run_id=row["run_id"],
                            trigger_source=row.get("trigger_source") or "manual",
                            trigger_mode=row.get("trigger_mode"),
                            requested_by=row.get("requested_by"),
                            metadata=row.get("metadata") or {},
                            force=bool(row.get("force", False)),
                            parent_flow_run_id=row.get("parent_flow_run_id"),
                            flow_node_id=row.get("flow_node_id"),
                        ),
                    )
                )
            if self._run_history:
                self.logger.info(
                    f"Rehydrated {len(self._run_history)} past run(s) from SQLite"
                )
        except Exception as e:
            self.logger.warning(f"Failed to rehydrate run history: {e}")

    def _rehydrate_flow_history(self) -> None:
        try:
            for row in self._log_store.get_flow_runs():
                states = {}
                for node_id, value in row.get("node_states", {}).items():
                    try:
                        states[node_id] = TaskState(value)
                    except ValueError:
                        states[node_id] = TaskState.NONE
                self._flow_run_history.append(
                    FlowRunHistory(
                        flow_id=row["flow_id"],
                        run_id=row["run_id"],
                        state=FlowRunState(row["state"]),
                        start_time=(
                            datetime.fromisoformat(row["start_time"])
                            if row.get("start_time")
                            else None
                        ),
                        end_time=(
                            datetime.fromisoformat(row["end_time"])
                            if row.get("end_time")
                            else None
                        ),
                        node_states=states,
                        dag_run_ids=row.get("dag_run_ids") or {},
                        node_errors=row.get("node_errors") or {},
                        error=row.get("error"),
                        parameters=row.get("parameters") or {},
                        trigger_source=row.get("trigger_source") or "manual",
                        trigger_mode=row.get("trigger_mode"),
                        requested_by=row.get("requested_by"),
                    )
                )
        except Exception as error:
            self.logger.warning(f"Failed to rehydrate Flow history: {error}")

    async def _persist_run(self, run_history: DAGRunHistory) -> None:
        """Save a run record to SQLite (off the event loop)."""
        if self._log_store:
            task_states = {
                tid: state.value
                for tid, state in run_history.task_states.items()
            }
            await asyncio.to_thread(
                self._log_store.save_run,
                run_id=run_history.run_id,
                dag_id=run_history.dag_id,
                state=run_history.state.value,
                start_time=run_history.start_time,
                end_time=run_history.end_time,
                task_states=task_states,
                error=run_history.error,
                metadata=run_history.run_context.metadata,
                trigger_source=run_history.run_context.trigger_source,
                trigger_mode=run_history.run_context.trigger_mode,
                requested_by=run_history.run_context.requested_by,
                force=run_history.run_context.force,
                parent_flow_run_id=run_history.run_context.parent_flow_run_id,
                flow_node_id=run_history.run_context.flow_node_id,
            )

    async def _persist_flow_run(self, run_history: FlowRunHistory) -> None:
        await asyncio.to_thread(
            self._log_store.save_flow_run,
            run_id=run_history.run_id,
            flow_id=run_history.flow_id,
            state=run_history.state.value,
            start_time=run_history.start_time,
            end_time=run_history.end_time,
            node_states={
                node_id: state.value
                for node_id, state in run_history.node_states.items()
            },
            dag_run_ids=run_history.dag_run_ids,
            node_errors=run_history.node_errors,
            error=run_history.error,
            parameters=run_history.parameters,
            trigger_source=run_history.trigger_source,
            trigger_mode=run_history.trigger_mode,
            requested_by=run_history.requested_by,
        )

    def get_task_logs(
        self, run_id: str, task_id: Optional[str] = None
    ) -> List[Dict]:
        """Retrieve captured task logs from the store (sync)."""
        return self._log_store.get_task_logs(run_id, task_id)

    async def get_task_logs_async(
        self, run_id: str, task_id: Optional[str] = None
    ) -> List[Dict]:
        """Retrieve captured task logs without blocking the event loop."""
        return await asyncio.to_thread(self._log_store.get_task_logs, run_id, task_id)

    async def get_task_timing_async(self, run_id: str) -> List[Dict]:
        """Get per-task start/end timestamps from log data."""
        return await asyncio.to_thread(self._log_store.get_task_timing, run_id)

    # ========== SINGLE TASK TRIGGER ==========

    async def trigger_task(
        self,
        dag_id: str,
        task_id: str,
        *,
        wait: bool = True,
        metadata: dict[str, Any] | None = None,
        trigger_source: str = "manual",
        trigger_mode: str | None = None,
        requested_by: str | None = None,
        run_context: RunContext | None = None,
    ) -> DAGRunHistory | None:
        """
        Trigger a single task within a DAG, ignoring its dependencies.

        Useful for re-running a specific task or debugging.

        Args:
            wait: If True, wait for completion. If False, run in background.
        """
        if dag_id not in self._dags:
            raise ValueError(f"DAG '{dag_id}' not registered with RiverFlow")

        dag = self._dags[dag_id]
        task = dag.get_task(task_id)
        if task is None:
            raise ValueError(
                f"Task '{task_id}' not found in DAG '{dag_id}'"
            )

        if self.is_running(dag_id):
            self.logger.info(
                f"DAG '{dag_id}' is already running. Skipping task trigger."
            )
            return None

        context = self._build_run_context(
            dag_id=dag_id,
            metadata=metadata,
            trigger_source=trigger_source,
            trigger_mode=trigger_mode,
            requested_by=requested_by,
            run_context=run_context,
        )
        run_history = self._create_run_history(
            dag_id,
            task_id,
            run_context=context,
        )

        if wait:
            return await self._execute_single_task(
                task, task_id, dag_id, run_history
            )
        else:
            asyncio.create_task(
                self._execute_single_task(
                    task, task_id, dag_id, run_history
                )
            )
            self.logger.info(
                f"Task '{task_id}' in DAG '{dag_id}' triggered in background"
            )
            return run_history

    async def _execute_single_task(
        self,
        task,
        task_id: str,
        dag_id: str,
        run_history: DAGRunHistory,
    ) -> DAGRunHistory:
        """Execute a single task and update run_history."""
        run_id = run_history.run_id
        try:
            task_executor = TaskExecutor()

            def on_state_change(state: TaskState):
                run_history.task_states[task_id] = state
                self._notify_update(run_history)

            instance = await task_executor.execute_task(
                task,
                on_state_change=on_state_change,
                run_id=run_id,
                dag_id=dag_id,
                log_store=self._log_store,
                run_context=run_history.run_context,
            )
            run_history.task_states[task_id] = instance.state
            run_history.end_time = datetime.now()
            run_history.state = (
                DAGRunState.SUCCESS
                if instance.state == TaskState.SUCCESS
                else DAGRunState.FAILED
            )

        except Exception as e:
            run_history.state = DAGRunState.FAILED
            run_history.end_time = datetime.now()
            run_history.error = str(e)
            run_history.task_states[task_id] = TaskState.FAILED
            self.logger.error(
                f"Task '{task_id}' in DAG '{dag_id}' failed: {e}"
            )

        finally:
            self._finish_active_run(dag_id, run_history.run_id)
            await self._persist_run(run_history)
            self._notify_update(run_history)

        return run_history

    def __repr__(self) -> str:
        return (
            f"RiverFlow("
            f"dags={len(self._dags)}, "
            f"flows={len(self._flows)}, "
            f"running={len(self._current_runs)}, "
            f"history={len(self._run_history)}, "
            f"scheduler={'active' if self._scheduler_started else 'inactive'})"
        )

    # ========== SCHEDULING METHODS ==========

    def start_scheduler(self, timezone: str = "UTC") -> None:
        """
        Start the background scheduler for automatic DAG execution.

        This will schedule all registered DAGs that have a schedule defined.
        Requires APScheduler to be installed: pip install apscheduler

        Args:
            timezone: Default timezone for scheduled jobs (e.g., 'America/Sao_Paulo', 'UTC')

        Example:
            riverflow = RiverFlow.get_instance()

            # Register DAGs with schedules
            with DAG("daily", schedule={"hour": "12", "minute": "0"}) as dag:
                # ... define tasks ...
            riverflow.register_dag(dag)

            # Start scheduler
            riverflow.start_scheduler(timezone="America/Sao_Paulo")
        """
        if self._scheduler_started:
            self.logger.warning("Scheduler already started")
            return

        self.logger.info(f"Starting scheduler with timezone: {timezone}")
        self._scheduler = AsyncIOScheduler(timezone=timezone)

        # Schedule all registered DAGs that have schedules
        for dag in self._dags.values():
            if dag.schedule:
                self._schedule_dag(dag)
        for flow in self._flows.values():
            if flow.schedule:
                self._schedule_flow(flow)

        self._scheduler.start()
        self._scheduler_started = True
        self.logger.info(
            f"Scheduler started with {len(self._scheduler.get_jobs())} job(s)"
        )

    def _schedule_dag(self, dag: DAG) -> None:
        """Internal method to schedule a DAG"""
        if not self._scheduler:
            return

        # Remove existing job if any
        existing_job = self._scheduler.get_job(dag.dag_id)
        if existing_job:
            existing_job.remove()

        # Create trigger based on schedule type
        trigger = self._create_trigger(dag.schedule, dag.timezone)

        if trigger:
            # Schedule the DAG - AsyncIOScheduler can handle async functions directly
            self._scheduler.add_job(
                func=self._scheduled_dag_trigger,
                args=[dag.dag_id],
                trigger=trigger,
                id=dag.dag_id,
                name=f"DAG: {dag.dag_id}",
                replace_existing=True,
            )
            self.logger.info(
                f"Scheduled DAG '{dag.dag_id}' with schedule: {dag.schedule}"
            )

    async def _scheduled_dag_trigger(self, dag_id: str):
        """Async wrapper for scheduled DAG triggers"""
        try:
            await self.trigger(
                dag_id,
                wait=False,
                trigger_source="schedule",
                trigger_mode="scheduled",
            )
        except Exception as e:
            self.logger.error(f"Error in scheduled trigger for DAG '{dag_id}': {e}")

    def _schedule_flow(self, flow: Flow) -> None:
        if not self._scheduler:
            return
        job_id = f"flow:{flow.flow_id}"
        trigger = self._create_trigger(flow.schedule, flow.timezone)
        if trigger:
            self._scheduler.add_job(
                func=self._scheduled_flow_trigger,
                args=[flow.flow_id],
                trigger=trigger,
                id=job_id,
                name=f"Flow: {flow.flow_id}",
                replace_existing=True,
            )

    async def _scheduled_flow_trigger(self, flow_id: str) -> None:
        try:
            await self.trigger_flow(
                flow_id,
                wait=False,
                trigger_source="schedule",
                trigger_mode="scheduled",
            )
        except Exception as error:
            self.logger.error(
                f"Error in scheduled trigger for Flow '{flow_id}': {error}"
            )

    def _create_trigger(self, schedule, tz: str):
        """Create APScheduler trigger from schedule definition"""
        if isinstance(schedule, dict):
            # Dict format: {"hour": "12", "minute": "0", "day_of_week": "mon-fri"}
            timezone_str = schedule.get("timezone", tz)
            tz_obj = pytz_timezone(timezone_str)
            return CronTrigger(
                timezone=tz_obj,
                **{k: v for k, v in schedule.items() if k != "timezone"},
            )

        elif isinstance(schedule, str):
            # Cron expression: "0 12 * * *"
            # Parse cron string
            parts = schedule.split()
            if len(parts) == 5:
                minute, hour, day, month, day_of_week = parts
                tz_obj = pytz_timezone(tz)
                return CronTrigger(
                    minute=minute,
                    hour=hour,
                    day=day,
                    month=month,
                    day_of_week=day_of_week,
                    timezone=tz_obj,
                )

        elif isinstance(schedule, timedelta):
            # Interval: timedelta(hours=24)
            return IntervalTrigger(
                seconds=schedule.total_seconds(), timezone=pytz_timezone(tz)
            )

        return None

    def stop_scheduler(self) -> None:
        """
        Stop the background scheduler.

        This will stop all scheduled DAG executions but won't affect
        currently running DAGs.
        """
        if not self._scheduler_started or not self._scheduler:
            self.logger.warning("Scheduler is not running")
            return

        self.logger.info("Stopping scheduler...")
        self._scheduler.shutdown(wait=False)
        self._scheduler = None
        self._scheduler_started = False
        self.logger.info("Scheduler stopped")

    def get_scheduled_dags(self) -> List[Dict]:
        """
        Get information about all scheduled DAGs.

        Returns:
            List of dicts with DAG schedule information
        """
        if not self._scheduler_started or not self._scheduler:
            return []

        scheduled_dags = []
        for job in self._scheduler.get_jobs():
            if job.id.startswith("flow:"):
                continue
            dag_id = job.id
            dag = self._dags.get(dag_id)

            scheduled_dags.append(
                {
                    "dag_id": dag_id,
                    "schedule": dag.schedule if dag else None,
                    "next_run": job.next_run_time,
                    "job_name": job.name,
                }
            )

        return scheduled_dags

    def get_scheduled_flows(self) -> List[Dict]:
        """Get information about all scheduled Flows."""
        if not self._scheduler_started or not self._scheduler:
            return []
        result = []
        for job in self._scheduler.get_jobs():
            if not job.id.startswith("flow:"):
                continue
            flow_id = job.id.removeprefix("flow:")
            flow = self._flows.get(flow_id)
            result.append(
                {
                    "flow_id": flow_id,
                    "schedule": flow.schedule if flow else None,
                    "next_run": job.next_run_time,
                    "job_name": job.name,
                }
            )
        return result
