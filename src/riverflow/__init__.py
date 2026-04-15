"""
RiverFlow - Workflow Orchestration Engine

A lightweight, Python-native workflow orchestration library that enables
you to define, schedule, and monitor directed acyclic graphs (DAGs) of tasks.

Usage:
    ```python
    from riverflow.core.riverflow import RiverFlow
    from riverflow.core.dag import DAG
    from riverflow.core.task import Task

    # Or import modules:
    from riverflow import core
    dag = core.dag.DAG("my_workflow")
    ```
"""

from . import core
from . import models
from . import server

from importlib.metadata import version as _v

__version__ = _v("riverflow")

__all__ = [
    "core",
    "models",
    "server",
    "__version__",
]
