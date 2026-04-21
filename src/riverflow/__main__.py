"""
Riverflow command-line interface.

Usage::

    riverflow serve path/to/dags.py [--host 127.0.0.1] [--port 8083] [--open]
    riverflow run   path/to/dags.py <dag_id>
    riverflow version

Or equivalently via the module runner::

    python -m riverflow serve path/to/dags.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__


def _cmd_serve(args: argparse.Namespace) -> int:
    from ._serve import serve

    serve(
        Path(args.path),
        host=args.host,
        port=args.port,
        open_browser=args.open,
    )
    return 0


def _cmd_run(args: argparse.Namespace) -> int:
    from ._serve import _load_dags_from_path, run

    dags = _load_dags_from_path(Path(args.path))
    target = next((d for d in dags if d.dag_id == args.dag_id), None)
    if target is None:
        ids = ", ".join(sorted(d.dag_id for d in dags)) or "(none)"
        print(
            f"error: no DAG with id '{args.dag_id}' in {args.path}. "
            f"Available: {ids}",
            file=sys.stderr,
        )
        return 2

    history = run(target)
    print(f"{history.dag_id} {history.run_id} -> {history.state.value}")
    return 0 if history.state.value == "success" else 1


def _cmd_version(_: argparse.Namespace) -> int:
    print(f"riverflow {__version__}")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="riverflow",
        description="Single-host workflow orchestrator.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_serve = sub.add_parser("serve", help="Start the HTTP server + UI.")
    p_serve.add_argument("path", help="Python file defining one or more DAGs.")
    p_serve.add_argument("--host", default="127.0.0.1", help="Bind address.")
    p_serve.add_argument("--port", default=8083, type=int, help="TCP port.")
    p_serve.add_argument(
        "--open", action="store_true", help="Open the UI in a browser on start."
    )
    p_serve.set_defaults(func=_cmd_serve)

    p_run = sub.add_parser("run", help="Execute a single DAG synchronously.")
    p_run.add_argument("path", help="Python file defining the DAG.")
    p_run.add_argument("dag_id", help="ID of the DAG to execute.")
    p_run.set_defaults(func=_cmd_run)

    p_ver = sub.add_parser("version", help="Print the installed version.")
    p_ver.set_defaults(func=_cmd_version)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
