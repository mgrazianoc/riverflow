"""
Riverflow — single-host workflow orchestrator.

The common case is a one-liner::

    from riverflow import DAG, serve, get_task_logger

    with DAG("hourly") as dag:
        @dag.task("extract")
        async def extract():
            get_task_logger().info("pulling...")

    serve(dag)

Advanced users can still reach into :mod:`riverflow.core`,
:mod:`riverflow.models`, and :mod:`riverflow.server`.
"""

from importlib.metadata import version as _v

__version__ = _v("riverflow")

from . import core, models, server
from .core.dag import DAG
from .core.logger import get_logger, get_task_logger
from .core.riverflow import Riverflow
from .core.run_context import RunContext, get_run_context
from .core.task import Task
from ._serve import run, serve

__all__ = [
    # High-level API
    "DAG",
    "Task",
    "Riverflow",
    "RunContext",
    "serve",
    "run",
    "get_logger",
    "get_task_logger",
    "get_run_context",
    # Submodules
    "core",
    "models",
    "server",
    "__version__",
]
