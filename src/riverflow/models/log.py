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
