<p align="center">
  <img src="assets/logo.svg" alt="Riverflow" width="64" height="64"/>
</p>

<h1 align="center">Riverflow</h1>

<p align="center">
  <em>A single-host workflow orchestrator.<br/>
  Python-native. Airflow-shaped. Built to fit on one machine.</em>
</p>

---

## Why

Airflow without the cluster. No Kubernetes, no Celery, no external database, no worker fleet. One process, one host, one UI.

Use it for ETL, internal automation, scheduled jobs embedded in an application, or anything that fits on a VPS.

## Install

```bash
pip install riverflow
```

## Ten-line DAG

```python
from datetime import timedelta
import uvicorn
from riverflow.core import DAG, Riverflow
from riverflow.server.api import create_riverflow_api
from riverflow.server.setup import get_uvicorn_log_config, setup_unified_logging

with DAG(dag_id="hourly_rollup", schedule=timedelta(hours=1)) as dag:
    @dag.task("extract")
    async def extract(): ...

    @dag.task("transform")
    async def transform(): ...

    @dag.task("load")
    async def load(): ...

    extract >> transform >> load

setup_unified_logging()
Riverflow.get_instance().register_dag(dag)
uvicorn.run(
    create_riverflow_api(Riverflow.get_instance()),
    host="0.0.0.0",
    port=8083,
    log_config=get_uvicorn_log_config(),
)
```

Open `http://localhost:8083/ui`.

## Features

**Orchestration.** DAGs with `>>` dependencies. Cron and interval schedules. Retries, timeouts, trigger rules. Async tasks by default.

**UI.** A Broadsheet-flavoured single-page app. Overview, DAG detail (overview / graph / grid / gantt / history / tasks), run detail with live logs, and a built-in **Host** page for on-box CPU, memory, disk, and network — four charts in a 2×2 grid with a synchronised crosshair.

**Live.** WebSocket push — no polling, no full-page refreshes.

**Keyboard.** `⌘K` command palette, `/` to filter, `j` / `k` to move, `g d` / `g l` / `g h` / `g s` to jump between sections.

**Light footprint.** Zero heavyweight chart libraries. Initial JS bundle ≈ 75 kB gzipped.

## Shape of the code

```
src/riverflow/
├── core/        # DAG, Task, scheduler, executor, logging
├── models/      # Pydantic contracts shared with the UI
└── server/      # FastAPI app, WebSocket, host metrics collector
ui/              # React + Vite + Tailwind, served from the same process
```

## Not goals

Horizontal scale-out. Multi-tenant auth. A plugin marketplace. If you need those, you need Airflow.

## License

Apache 2.0

