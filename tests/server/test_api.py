"""Tests for the FastAPI REST endpoints."""

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from riverflow.core.dag import DAG
from riverflow.core.log_store import LogStore
from riverflow.core.logger import get_task_logger
from riverflow.core.riverflow import Riverflow
from riverflow.server.api import create_riverflow_api


@pytest.fixture()
async def client(riverflow: Riverflow, simple_dag: DAG):
    """Provide an httpx async client wired to the test Riverflow instance."""
    riverflow.register_dag(simple_dag)
    app = create_riverflow_api(riverflow)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


class TestStatusEndpoint:
    async def test_status(self, client: AsyncClient):
        resp = await client.get("/api/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "registered_dags" in data
        assert "test_dag" in data["registered_dags"]


class TestDagsEndpoints:
    async def test_list_dags(self, client: AsyncClient):
        resp = await client.get("/api/dags")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        ids = [d["dag_id"] for d in data]
        assert "test_dag" in ids

    async def test_get_single_dag(self, client: AsyncClient):
        resp = await client.get("/api/dags/test_dag")
        assert resp.status_code == 200
        assert resp.json()["dag_id"] == "test_dag"

    async def test_get_dag_graph(self, client: AsyncClient):
        resp = await client.get("/api/dags/test_dag/graph")
        assert resp.status_code == 200
        data = resp.json()
        assert "nodes" in data
        assert "edges" in data
        node_ids = [n["id"] for n in data["nodes"]]
        assert "step_a" in node_ids
        assert "step_b" in node_ids


class TestTriggerEndpoints:
    async def test_trigger_dag(self, client: AsyncClient):
        resp = await client.put("/api/dags/test_dag/trigger")
        assert resp.status_code == 200
        data = resp.json()
        assert data["state"] == "running"
        assert data["run_id"] is not None
        assert data["dag_id"] == "test_dag"
        assert data["trigger_source"] == "api"

    async def test_trigger_dag_with_metadata(self, client: AsyncClient):
        resp = await client.put(
            "/api/dags/test_dag/trigger",
            json={
                "metadata": {"run_mode": "backfill"},
                "trigger_mode": "queue",
                "requested_by": "tester",
                "force": True,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["metadata"] == {"run_mode": "backfill"}
        assert data["trigger_source"] == "api"
        assert data["trigger_mode"] == "queue"
        assert data["requested_by"] == "tester"
        assert data["force"] is True

    async def test_trigger_single_task(self, client: AsyncClient):
        resp = await client.put("/api/dags/test_dag/tasks/step_a/trigger")
        assert resp.status_code == 200
        data = resp.json()
        assert data["state"] == "running"
        assert data["dag_id"] == "test_dag"
        assert data["run_id"] is not None
        assert data["trigger_source"] == "api"

    async def test_trigger_unknown_dag(self, client: AsyncClient):
        resp = await client.put("/api/dags/nonexistent/trigger")
        assert resp.status_code == 500


class TestHistoryEndpoint:
    async def test_history_empty(self, client: AsyncClient):
        resp = await client.get("/api/history")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 0

    async def test_history_after_trigger(self, client: AsyncClient):
        await client.put("/api/dags/test_dag/trigger")
        resp = await client.get("/api/history")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert data[0]["dag_id"] == "test_dag"
        assert "run_id" in data[0]
        assert "task_states" in data[0]

    async def test_history_filter_by_dag(self, client: AsyncClient):
        await client.put("/api/dags/test_dag/trigger")
        resp = await client.get("/api/history?dag_id=test_dag")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

        resp2 = await client.get("/api/history?dag_id=other")
        assert len(resp2.json()) == 0


class TestRunLogsEndpoint:
    async def test_get_logs_for_run(self, client: AsyncClient):
        trigger_resp = await client.put("/api/dags/test_dag/trigger")
        run_id = trigger_resp.json()["run_id"]
        await asyncio.sleep(0.5)  # wait for background DAG to finish

        resp = await client.get(f"/api/runs/{run_id}/logs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["run_id"] == run_id
        assert data["total"] > 0
        assert any("step_a" in l["task_id"] for l in data["logs"])

    async def test_get_logs_filtered_by_task(self, client: AsyncClient):
        trigger_resp = await client.put("/api/dags/test_dag/trigger")
        run_id = trigger_resp.json()["run_id"]
        await asyncio.sleep(0.5)  # wait for background DAG to finish

        resp = await client.get(f"/api/runs/{run_id}/logs?task_id=step_a")
        assert resp.status_code == 200
        data = resp.json()
        assert data["task_id"] == "step_a"
        assert all(l["task_id"] == "step_a" for l in data["logs"])

    async def test_get_logs_for_unknown_run(self, client: AsyncClient):
        resp = await client.get("/api/runs/no_such_run/logs")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
