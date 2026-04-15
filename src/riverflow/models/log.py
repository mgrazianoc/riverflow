from pydantic import BaseModel


class LogEntryModel(BaseModel):
    """A single log line from a task execution."""

    timestamp: str
    level: str
    task_id: str
    message: str


class TaskLogsModel(BaseModel):
    """Collection of log entries for a run."""

    run_id: str
    task_id: str | None = None
    total: int
    logs: list[LogEntryModel]


class TaskTimingEntry(BaseModel):
    """Per-task timing derived from log timestamps."""

    task_id: str
    start_time: str
    end_time: str
    log_count: int


class RunTimingModel(BaseModel):
    """Per-task timing for a run."""

    run_id: str
    tasks: list[TaskTimingEntry]
