# Riverflow — Agent Guide

> Read this before touching Python under `src/riverflow/`. The UI has its
> own guide at [ui/AGENTS.md](ui/AGENTS.md).

---

## 1. Public API (what users see)

The top-level `riverflow` package is the contract. Keep it thin and stable.

```python
from riverflow import DAG, Task, Riverflow, serve, run, get_task_logger
```

- `serve(dags, *, host, port, open_browser, log_config, setup_logging)` —
  the one-liner. Takes a `DAG`, a list of DAGs, a `.py` path, or nothing
  (if DAGs are already registered on the singleton).
- `run(dag)` — execute once, synchronously, return `DAGRunHistory`. For
  scripts and tests.
- `DAG` / `Task` / `Riverflow` / `get_task_logger` — re-exported from
  `riverflow.core` for ergonomics.
- CLI: `riverflow serve path/to/dags.py [--host --port --open]` and
  `riverflow run path/to/dags.py <dag_id>`. Implemented in
  [src/riverflow/\_\_main\_\_.py](src/riverflow/__main__.py).

**Non-negotiable:** the Ten-line DAG example in the README must stay a
one-liner bootstrap. If a change would force users back to manual
`uvicorn.run(...)` + `setup_unified_logging()` + `register_dag()` wiring,
the change is wrong.

The low-level pieces (`riverflow.core.riverflow.Riverflow.get_instance()`,
`riverflow.server.api.create_riverflow_api`,
`riverflow.server.setup.setup_unified_logging`) remain importable for
advanced users but should not appear in docs or examples.

---

## 2. Shape of the code

```
src/riverflow/
├── __init__.py       # public surface — DAG, serve, run, …
├── __main__.py       # `riverflow` CLI
├── _serve.py         # serve() + run() + .py discovery
├── core/             # DAG, Task, scheduler, executors, logger, log_store
├── models/           # Pydantic contracts shared with the UI
└── server/           # FastAPI app, WebSocket, host metrics
```

Rules:

1. **No new public modules at the top level** without updating `__all__`
   and this file.
2. **Pydantic at the edges.** Every HTTP response is a model from
   `riverflow.models`. No raw dicts cross `server/api.py`.
3. **Errors are sentences.** See
   [src/riverflow/core/errors.py](src/riverflow/core/errors.py) — each
   exception explains what the user did, what the rule is, and how to
   fix it. Match that tone for any new error class.
4. **Singleton stays hidden.** User code should never need
   `Riverflow.get_instance()`. `serve()` and `run()` handle it.

---

## 3. Tests and build

- `uv sync` — install.
- `uv run pytest -q` — 60 tests, all must pass.
- `make build-ui` — build the UI into `src/riverflow/server/ui/dist/`
  (hatch bundles it into the wheel via `hatch_build.py`).
- No test should import from `riverflow.server.setup` or call
  `uvicorn.run`. Use `run(dag)` for end-to-end DAG tests.

---

## 4. Release checklist

1. Bump `version` in
   [pyproject.toml](pyproject.toml) and
   [ui/package.json](ui/package.json) in lockstep.
2. `uv sync && uv run pytest -q` — 60 pass.
3. `cd ui && npm install && npm run build` — bundle should stay
   ≤ ~80 kB gzipped for the main chunk.
4. Commit as `release: vX.Y.Z` with a short editorial body covering what
   changed for users.
5. Annotated tag: `git tag -a vX.Y.Z -m "vX.Y.Z — …"`.
6. `git push origin main && git push origin vX.Y.Z`.

---

## 5. Voice

README, errors, commit messages, CLI help — all written in the same
editorial register as the UI: short sentences, concrete nouns, no
marketing. "Single-host workflow orchestrator." Not "The modern,
AI-powered, cloud-native…"
