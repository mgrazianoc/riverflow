import asyncio
import sys

import pytest

from riverflow import DAG
from riverflow._serve import _load_dags_from_path, run


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
