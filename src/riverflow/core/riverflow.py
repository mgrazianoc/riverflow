"""
RiverFlow - Workflow Orchestration Engine

A singleton class that manages DAG execution, state tracking, and provides
a centralized interface for triggering and monitoring workflows.
"""

import asyncio
import threading
from datetime import datetime, timedelta
from typing import Callable, Dict, List, Optional
from dataclasses import dataclass, field

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from pytz import timezone as pytz_timezone

from .dag import DAG, DAGRunState
from .logger import get_logger
from .dag_executor import DAGExecutor
from .task import TaskState


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
        self._update_callbacks: List[Callable[[DAGRunHistory], None]] = []
        self._run_counter = 0
        self._scheduler = None
        self._scheduler_started = False
        self.logger = (
            logger if logger is not None else get_logger(component="RiverFlow")
        )

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
        if dag.dag_id in self._dags:
            self.logger.warning(f"DAG '{dag.dag_id}' already registered, updating...")

        self._dags[dag.dag_id] = dag
        if dag.dag_id not in self._dag_locks:
            self._dag_locks[dag.dag_id] = asyncio.Lock()

        self.logger.info(f"DAG '{dag.dag_id}' registered with RiverFlow")

        # Auto-schedule if DAG has a schedule
        if dag.schedule and self._scheduler_started:
            self._schedule_dag(dag)

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

    async def trigger(
        self, dag_id: str, wait: bool = True, force: bool = False
    ) -> Optional[DAGRunHistory]:
        """
        Trigger a DAG execution.

        Args:
            dag_id: ID of the DAG to trigger
            wait: If True, wait for completion. If False, run in background
            force: If True, allows concurrent runs (ignores lock)

        Returns:
            DAGRunHistory if wait=True, None if wait=False

        Example:
            # Wait for completion
            result = await riverflow.trigger("my_dag")

            # Fire and forget
            await riverflow.trigger("my_dag", wait=False)
        """
        if dag_id not in self._dags:
            raise ValueError(f"DAG '{dag_id}' not registered with RiverFlow")

        dag = self._dags[dag_id]
        dag_lock = self._dag_locks[dag_id]

        # Check if DAG is already running
        if not force:
            if dag_lock.locked():
                self.logger.info(
                    f"DAG '{dag_id}' is already running. Skipping trigger."
                )
                return None

        if wait:
            # Execute synchronously with lock
            async with dag_lock:
                return await self._execute_dag(dag)
        else:
            # Execute in background
            asyncio.create_task(self._execute_dag_with_lock(dag))
            self.logger.info(f"DAG '{dag_id}' triggered in background")
            return None

    async def _execute_dag_with_lock(self, dag: DAG) -> DAGRunHistory:
        """Execute DAG with lock protection"""
        dag_lock = self._dag_locks[dag.dag_id]
        async with dag_lock:
            return await self._execute_dag(dag)

    async def _execute_dag(self, dag: DAG) -> DAGRunHistory:
        """Internal method to execute a DAG and track its state"""
        # Generate run ID
        self._run_counter += 1
        run_id = f"{dag.dag_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{self._run_counter}"

        # Create run history record
        run_history = DAGRunHistory(
            dag_id=dag.dag_id,
            run_id=run_id,
            state=DAGRunState.RUNNING,
            start_time=datetime.now(),
        )

        # Add to current runs and history
        self._current_runs[dag.dag_id] = run_history
        self._run_history.append(run_history)

        # Notify RUNNING state
        self._notify_update(run_history)

        try:
            # Define callback for task state changes
            def on_task_state_change(task_id: str, state: TaskState):
                """Update run_history.task_states on every task state change"""
                run_history.task_states[task_id] = state
                # Notify listeners of the update
                self._notify_update(run_history)

            # Execute the DAG using DAGExecutor with state change callback
            dag_executor = DAGExecutor(dag, on_task_state_change=on_task_state_change)
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
            # Remove from current runs
            if dag.dag_id in self._current_runs:
                del self._current_runs[dag.dag_id]

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
        return dag_id in self._current_runs

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
        if dag_id:
            before = len(self._run_history)
            self._run_history = [h for h in self._run_history if h.dag_id != dag_id]
            cleared = before - len(self._run_history)
        else:
            cleared = len(self._run_history)
            self._run_history.clear()

        self.logger.info(f"Cleared {cleared} history record(s)")
        return cleared

    def get_registered_dags(self) -> List[str]:
        """Get list of all registered DAG IDs"""
        return list(self._dags.keys())

    def __repr__(self) -> str:
        return (
            f"RiverFlow("
            f"dags={len(self._dags)}, "
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
            # Schedule the DAG
            self._scheduler.add_job(
                func=lambda: asyncio.create_task(self.trigger(dag.dag_id, wait=False)),
                trigger=trigger,
                id=dag.dag_id,
                name=f"DAG: {dag.dag_id}",
                replace_existing=True,
            )
            self.logger.info(
                f"Scheduled DAG '{dag.dag_id}' with schedule: {dag.schedule}"
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
