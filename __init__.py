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
from . import server

__version__ = "0.1.0"

__all__ = [
    "core",
    "server",
    "__version__",
]
