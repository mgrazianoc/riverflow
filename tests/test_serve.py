import asyncio
import sys
from pathlib import Path

import pytest

from riverflow import DAG, Flow
from riverflow._serve import _load_dags_from_path, _load_workflows_from_path, run


def test_load_dags_deduplicates_module_aliases(tmp_path):
    source = tmp_path / "dags.py"
    source.write_text(
        "from riverflow import DAG\n"
        "with DAG('one') as dag:\n"
        "    @dag.task('task')\n"
        "    async def task(): pass\n"
        "alias = dag\n"
    )

    assert [dag.dag_id for dag in _load_dags_from_path(source)] == ["one"]


def test_failed_module_load_restores_import_state(tmp_path):
    source = tmp_path / "broken.py"
    source.write_text("raise RuntimeError('broken import')\n")
    before_path = sys.path[:]
    before_modules = set(sys.modules)

    with pytest.raises(RuntimeError, match="broken import"):
        _load_dags_from_path(source)

    assert sys.path == before_path
    assert set(sys.modules) == before_modules


async def test_sync_run_rejects_active_event_loop_without_leaking_coroutine():
    with DAG("async_caller") as dag:
        @dag.task("task")
        async def task():
            pass

    with pytest.raises(RuntimeError, match=r"cannot be called.*event loop"):
        run(dag, setup_logging=False)

    await asyncio.sleep(0)


def test_load_and_run_flow_from_public_entry_point(tmp_path, monkeypatch):
    source = tmp_path / "flow.py"
    source.write_text(
        "from riverflow import DAG, Flow\n"
        "with DAG('extract') as extract:\n"
        "    @extract.task('task')\n"
        "    async def task(): pass\n"
        "with Flow('pipeline') as flow:\n"
        "    flow.add_dag(extract)\n"
    )

    workflows = _load_workflows_from_path(source)
    flow = next(value for value in workflows if isinstance(value, Flow))
    monkeypatch.chdir(tmp_path)
    history = run(flow, setup_logging=False)

    assert history.flow_id == "pipeline"
    assert history.state.value == "success"


def test_local_showcase_exposes_dags_and_flow():
    workflows = _load_workflows_from_path(
        Path(__file__).resolve().parents[1] / "src" / "main.py"
    )

    assert {
        getattr(workflow, "dag_id", getattr(workflow, "flow_id", None))
        for workflow in workflows
    } == {"ibge_source", "medallion", "ibge_pipeline"}
