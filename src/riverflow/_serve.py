"""
High-level entry points: ``serve()`` and ``run()``.

These wrap the three-step bootstrap (logging + singleton + uvicorn) into
one-liners. The low-level pieces in :mod:`riverflow.core` and
:mod:`riverflow.server` remain available for advanced use.
"""

from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import sys
import webbrowser
from pathlib import Path
from threading import Timer
from typing import Any, Iterable, Optional, Union

from .core.dag import DAG
from .core.flow import Flow, FlowRunHistory
from .core.riverflow import Riverflow, DAGRunHistory
from .core.logger import get_logger


Workflow = Union[DAG, Flow]
WorkflowSource = Union[Workflow, Iterable[Workflow], str, Path, None]
DagSource = WorkflowSource


def _coerce_workflows(source: WorkflowSource) -> list[Workflow]:
    """Resolve a high-level workflow argument into DAGs and Flows."""
    if source is None:
        return []
    if isinstance(source, (DAG, Flow)):
        return [source]
    if isinstance(source, (str, Path)):
        return _load_workflows_from_path(Path(source))
    workflows = list(source)
    for workflow in workflows:
        if not isinstance(workflow, (DAG, Flow)):
            raise TypeError(
                f"Expected DAG or Flow, got {type(workflow).__name__}. "
                "Pass a workflow, an iterable of workflows, or a Python file."
            )
    return workflows


def _coerce_dags(source: DagSource) -> list[DAG]:
    """Backward-compatible DAG-only coercion helper."""
    values = _coerce_workflows(source)
    dags = [value for value in values if isinstance(value, DAG)]
    if len(dags) != len(values):
        raise TypeError("Expected DAG, but received a Flow.")
    return dags


def _load_workflows_from_path(path: Path) -> list[Workflow]:
    """Import a Python file and collect its top-level DAGs and Flows."""
    path = path.expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"No such file: {path}")
    if path.suffix != ".py":
        raise ValueError(f"Expected a .py file, got: {path}")

    path_digest = hashlib.sha256(str(path).encode()).hexdigest()[:12]
    module_name = f"_riverflow_user_{path.stem}_{path_digest}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load module from {path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    # Make sibling imports work (e.g. `from helpers import foo` in user's file)
    original_sys_path = sys.path[:]
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(module)
    except BaseException:
        if sys.modules.get(module_name) is module:
            del sys.modules[module_name]
        raise
    finally:
        sys.path[:] = original_sys_path

    workflows = []
    seen = set()
    for value in vars(module).values():
        if isinstance(value, (DAG, Flow)) and id(value) not in seen:
            seen.add(id(value))
            workflows.append(value)
    if not workflows:
        raise ValueError(
            f"No DAG or Flow instances found in {path}. "
            "Define at least one workflow at module scope."
        )
    return workflows


def _load_dags_from_path(path: Path) -> list[DAG]:
    """Import a Python file and collect every top-level DAG it defines."""
    workflows = _load_workflows_from_path(path)
    dags = [workflow for workflow in workflows if isinstance(workflow, DAG)]
    if not dags:
        raise ValueError(
            f"No DAG instances found in {path}. "
            "Define at least one `DAG(...)` at module scope."
        )
    return dags


def serve(
    dags: WorkflowSource = None,
    *,
    host: str = "127.0.0.1",
    port: int = 8083,
    open_browser: bool = False,
    log_config: Optional[dict] = None,
    setup_logging: bool = True,
) -> None:
    """
    Register DAGs and start the Riverflow HTTP server.

    This is the one-liner most users want::

        from riverflow import DAG, serve

        with DAG("hourly") as dag:
            ...

        serve(dag)

    Args:
        dags: A single :class:`DAG`, an iterable of DAGs, or the path to a
            Python file that defines DAGs at module scope. If ``None``,
            assumes DAGs have already been registered on the singleton.
        host: Interface to bind. Defaults to ``127.0.0.1`` (loopback).
            Use ``"0.0.0.0"`` to expose on the network.
        port: TCP port. Defaults to ``8083``.
        open_browser: If True, open the UI in the default browser once the
            server is ready.
        log_config: Custom uvicorn logging config dict. Defaults to
            Riverflow's unified config.
        setup_logging: If True (default), install Riverflow's formatter on the
            root logger. Set to False if your application owns logging.
    """
    # Local imports keep `import riverflow` cheap for users who only want DAG.
    import uvicorn

    from .server.api import create_riverflow_api
    from .server.setup import get_uvicorn_log_config, setup_unified_logging

    if setup_logging:
        setup_unified_logging()

    logger = get_logger(component="RiverFlow")
    riverflow = Riverflow.get_instance()

    for workflow in _coerce_workflows(dags):
        if isinstance(workflow, Flow):
            riverflow.register_flow(workflow)
        else:
            riverflow.register_dag(workflow)

    registered = riverflow.get_registered_dags()
    if not registered and not riverflow.get_registered_flows():
        logger.warning(
            "serve() called with no workflows registered. "
            "Pass a DAG, Flow, iterable, or Python path."
        )

    app = create_riverflow_api(riverflow)

    if open_browser:
        ui_url = f"http://{'localhost' if host in ('0.0.0.0', '127.0.0.1') else host}:{port}/ui"
        Timer(1.0, lambda: webbrowser.open(ui_url)).start()

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_config=log_config or get_uvicorn_log_config(),
    )


def run(
    dag: Workflow,
    *,
    setup_logging: bool = True,
    metadata: dict[str, Any] | None = None,
    trigger_mode: str | None = None,
    requested_by: str | None = None,
) -> DAGRunHistory | FlowRunHistory:
    """
    Execute a DAG or Flow once, synchronously, and return its run history.

    Useful for scripts, tests, and CI jobs where the HTTP server is
    overkill::

        from riverflow import DAG, run

        with DAG("once") as dag:
            ...

        history = run(dag)
        assert history.state.value == "success"

    Args:
        dag: The DAG or Flow to execute. The name stays ``dag`` for backward
            compatibility with callers that use the keyword argument.
        setup_logging: If True (default), install Riverflow's formatter.
        metadata: Arbitrary metadata attached to this run.
        trigger_mode: Optional caller-defined trigger intent.
        requested_by: Optional user or system identifier.

    Returns:
        The final :class:`DAGRunHistory` for the run.
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        pass
    else:
        raise RuntimeError(
            "run() cannot be called while an asyncio event loop is running. "
            "Use `await Riverflow.get_instance().trigger(dag.dag_id)` in async code."
        )

    if setup_logging:
        from .server.setup import setup_unified_logging

        setup_unified_logging()

    riverflow = Riverflow.get_instance()
    if isinstance(dag, Flow):
        if dag.flow_id not in riverflow.get_registered_flows():
            riverflow.register_flow(dag)
        history = asyncio.run(
            riverflow.trigger_flow(
                dag.flow_id,
                wait=True,
                parameters=metadata,
                trigger_source="manual",
                trigger_mode=trigger_mode,
                requested_by=requested_by,
            )
        )
        workflow_type, workflow_id = "Flow", dag.flow_id
    else:
        if dag.dag_id not in riverflow.get_registered_dags():
            riverflow.register_dag(dag)
        history = asyncio.run(
            riverflow.trigger(
                dag.dag_id,
                wait=True,
                metadata=metadata,
                trigger_source="manual",
                trigger_mode=trigger_mode,
                requested_by=requested_by,
            )
        )
        workflow_type, workflow_id = "DAG", dag.dag_id
    if history is None:
        raise RuntimeError(
            f"{workflow_type} '{workflow_id}' was already running; run() cannot proceed."
        )
    return history
