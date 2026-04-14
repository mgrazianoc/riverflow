"""
RiverFlow Models — The contract layer between data and view.

Every piece of data that crosses the boundary between core engine and
the API / UI / WebSocket layer MUST be one of these Pydantic models.
No raw dicts, no ad-hoc JSON, no strings.
"""

from .dag import DAGModel, DAGSummaryModel, DAGGraphModel, DAGNodeModel, DAGEdgeModel
from .task import TaskModel, TaskStateEnum, TriggerRuleEnum
from .run import DAGRunModel, DAGRunStateEnum, TaskRunModel
from .log import LogEntryModel, TaskLogsModel
from .status import StatusModel, APIInfoModel, ScheduledDAGModel, DashboardModel

__all__ = [
    # DAG
    "DAGModel",
    "DAGSummaryModel",
    "DAGGraphModel",
    "DAGNodeModel",
    "DAGEdgeModel",
    # Task
    "TaskModel",
    "TaskStateEnum",
    "TriggerRuleEnum",
    # Run
    "DAGRunModel",
    "DAGRunStateEnum",
    "TaskRunModel",
    # Log
    "LogEntryModel",
    "TaskLogsModel",
    # Status
    "StatusModel",
    "APIInfoModel",
    "ScheduledDAGModel",
    "DashboardModel",
]
