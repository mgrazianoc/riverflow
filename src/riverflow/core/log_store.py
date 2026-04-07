"""
RiverFlow Log Store - SQLite-based storage for task logs and run history.

Provides persistent storage for:
- Per-task log entries (captured during execution)
- DAG run history (survives process restarts)
"""

import json
import sqlite3
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional


class LogStore:
    """SQLite-backed store for task logs and DAG run history."""

    def __init__(self, db_path: str = "riverflow.db"):
        self._db_path = db_path
        self._local = threading.local()
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        if not hasattr(self._local, "conn") or self._local.conn is None:
            conn = sqlite3.connect(self._db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            self._local.conn = conn
        return self._local.conn

    def _init_db(self):
        conn = self._get_conn()
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS task_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                dag_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_task_logs_run
                ON task_logs(run_id);
            CREATE INDEX IF NOT EXISTS idx_task_logs_run_task
                ON task_logs(run_id, task_id);

            CREATE TABLE IF NOT EXISTS dag_runs (
                run_id TEXT PRIMARY KEY,
                dag_id TEXT NOT NULL,
                state TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                task_states TEXT,
                error TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_dag_runs_dag
                ON dag_runs(dag_id);
            CREATE INDEX IF NOT EXISTS idx_dag_runs_start
                ON dag_runs(start_time);
            """
        )
        conn.commit()

    # ========== Task Logs ==========

    def save_task_logs(
        self,
        run_id: str,
        dag_id: str,
        task_id: str,
        records: List[Dict[str, Any]],
    ) -> None:
        """Batch-insert captured log records for a task execution."""
        if not records:
            return
        conn = self._get_conn()
        conn.executemany(
            "INSERT INTO task_logs (run_id, dag_id, task_id, timestamp, level, message) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            [
                (run_id, dag_id, task_id, r["timestamp"], r["level"], r["message"])
                for r in records
            ],
        )
        conn.commit()

    def get_task_logs(
        self, run_id: str, task_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Query log entries for a run, optionally filtered by task."""
        conn = self._get_conn()
        if task_id:
            rows = conn.execute(
                "SELECT timestamp, level, task_id, message FROM task_logs "
                "WHERE run_id = ? AND task_id = ? ORDER BY id",
                (run_id, task_id),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT timestamp, level, task_id, message FROM task_logs "
                "WHERE run_id = ? ORDER BY id",
                (run_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    # ========== DAG Runs ==========

    def save_run(
        self,
        run_id: str,
        dag_id: str,
        state: str,
        start_time: Optional[datetime],
        end_time: Optional[datetime],
        task_states: Dict[str, str],
        error: Optional[str],
    ) -> None:
        """Persist a DAG run record (insert or update)."""
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO dag_runs "
            "(run_id, dag_id, state, start_time, end_time, task_states, error) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                run_id,
                dag_id,
                state,
                start_time.isoformat() if start_time else None,
                end_time.isoformat() if end_time else None,
                json.dumps(task_states),
                error,
            ),
        )
        conn.commit()

    def get_runs(
        self, dag_id: Optional[str] = None, limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Query DAG run history, most recent first."""
        conn = self._get_conn()
        query = "SELECT * FROM dag_runs"
        params: list = []
        if dag_id:
            query += " WHERE dag_id = ?"
            params.append(dag_id)
        query += " ORDER BY start_time DESC"
        if limit:
            query += " LIMIT ?"
            params.append(limit)
        rows = conn.execute(query, params).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            if d.get("task_states"):
                d["task_states"] = json.loads(d["task_states"])
            result.append(d)
        return result

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Get a single run by ID."""
        conn = self._get_conn()
        row = conn.execute(
            "SELECT * FROM dag_runs WHERE run_id = ?", (run_id,)
        ).fetchone()
        if row is None:
            return None
        d = dict(row)
        if d.get("task_states"):
            d["task_states"] = json.loads(d["task_states"])
        return d
