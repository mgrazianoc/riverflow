"""Shared fixtures for the RiverFlow test suite."""

import os
import asyncio
import threading
import tempfile

import pytest

from riverflow.core.dag import DAG
from riverflow.core.log_store import LogStore
from riverflow.core.riverflow import Riverflow
from riverflow.core.logger import get_task_logger, install_task_stdout_capture


# ---------------------------------------------------------------------------
# Riverflow singleton reset
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_riverflow_singleton():
    """Reset the Riverflow singleton before each test so tests are independent."""
    Riverflow._instance = None
    Riverflow._lock = threading.Lock()
    # Ensure the stdout/stderr wrappers are installed so print() capture works
    # even when pytest replaces sys.stdout between tests.
    install_task_stdout_capture()
    yield
    Riverflow._instance = None
    Riverflow._lock = threading.Lock()


# ---------------------------------------------------------------------------
# Temp SQLite database
# ---------------------------------------------------------------------------

@pytest.fixture()
def tmp_db(tmp_path):
    """Return a path to a fresh temporary SQLite database."""
    return str(tmp_path / "test_riverflow.db")


@pytest.fixture()
def log_store(tmp_db):
    """Provide a LogStore pointed at a throwaway database."""
    return LogStore(db_path=tmp_db)


# ---------------------------------------------------------------------------
# Riverflow instance wired to a temp DB
# ---------------------------------------------------------------------------

@pytest.fixture()
def riverflow(tmp_db):
    """Provide a fresh Riverflow instance backed by a temp SQLite database."""
    rf = Riverflow.get_instance()
    rf._log_store = LogStore(db_path=tmp_db)
    return rf


# ---------------------------------------------------------------------------
# Sample DAG factories
# ---------------------------------------------------------------------------

@pytest.fixture()
def simple_dag():
    """A minimal two-task DAG: step_a >> step_b."""
    with DAG(dag_id="test_dag") as dag:
        @dag.task("step_a")
        async def step_a():
            logger = get_task_logger()
            logger.info("step_a running")
            print("step_a print")

        @dag.task("step_b")
        async def step_b():
            logger = get_task_logger()
            logger.info("step_b running")

        step_a >> step_b
    return dag


@pytest.fixture()
def failing_dag():
    """A DAG where step_b always raises."""
    with DAG(dag_id="fail_dag") as dag:
        @dag.task("ok_task")
        async def ok_task():
            logger = get_task_logger()
            logger.info("ok_task done")

        @dag.task("bad_task")
        async def bad_task():
            logger = get_task_logger()
            logger.error("about to crash")
            raise RuntimeError("intentional failure")

        ok_task >> bad_task
    return dag
