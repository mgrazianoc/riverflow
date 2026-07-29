from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, Optional, Union

from .dag import DAG
from .errors import (
    DuplicateFlowNodeError,
    EmptyFlowError,
    FlowCycleDetectedError,
    SelfDependencyError,
    UnknownUpstreamFlowNodeError,
)
from .task import TaskState, TriggerRule


class FlowRunState(Enum):
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class ConcurrencyPolicy(str, Enum):
    QUEUE = "queue"
    REJECT = "reject"
    FORCE = "force"


@dataclass(eq=False)
class FlowNode:
    node_id: str
    dag: DAG
    parameters: dict[str, Any] = field(default_factory=dict)
    trigger_rule: TriggerRule = TriggerRule.ALL_SUCCESS
    concurrency: ConcurrencyPolicy = ConcurrencyPolicy.QUEUE
    upstream_nodes: list["FlowNode"] = field(default_factory=list)

    def __rshift__(self, other):
        targets = other if isinstance(other, list) else [other]
        for target in targets:
            if self is target:
                raise SelfDependencyError(self.node_id)
            if self not in target.upstream_nodes:
                target.upstream_nodes.append(self)
        return other

    def __lshift__(self, other):
        sources = other if isinstance(other, list) else [other]
        for source in sources:
            if self is source:
                raise SelfDependencyError(self.node_id)
            if source not in self.upstream_nodes:
                self.upstream_nodes.append(source)
        return self

    def __rrshift__(self, other):
        for source in other:
            source >> self
        return self

    def __rlshift__(self, other):
        for target in other:
            self >> target
        return other


@dataclass
class FlowRunHistory:
    flow_id: str
    run_id: str
    state: FlowRunState
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    node_states: dict[str, TaskState] = field(default_factory=dict)
    dag_run_ids: dict[str, str] = field(default_factory=dict)
    node_errors: dict[str, str] = field(default_factory=dict)
    error: Optional[str] = None
    parameters: dict[str, Any] = field(default_factory=dict)
    trigger_source: str = "manual"
    trigger_mode: Optional[str] = None
    requested_by: Optional[str] = None


class Flow:
    """A reusable directed graph of DAG invocations."""

    def __init__(
        self,
        flow_id: str,
        schedule: Optional[Union[Dict, str, timedelta]] = None,
        description: Optional[str] = None,
        timezone: str = "UTC",
    ):
        self.flow_id = flow_id
        self.schedule = schedule
        self.description = description
        self.timezone = timezone
        self.nodes: dict[str, FlowNode] = {}
        self._validated = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            self._validate()
        return False

    def add_dag(
        self,
        dag: DAG,
        *,
        node_id: str | None = None,
        parameters: dict[str, Any] | None = None,
        trigger_rule: TriggerRule = TriggerRule.ALL_SUCCESS,
        concurrency: ConcurrencyPolicy | str = ConcurrencyPolicy.QUEUE,
    ) -> FlowNode:
        node_id = node_id or dag.dag_id
        if node_id in self.nodes:
            raise DuplicateFlowNodeError(self.flow_id, node_id)
        try:
            policy = ConcurrencyPolicy(concurrency)
        except ValueError as error:
            valid = ", ".join(policy.value for policy in ConcurrencyPolicy)
            raise ValueError(
                f"Flow node '{node_id}' has concurrency='{concurrency}'. "
                f"Choose one of: {valid}."
            ) from error
        node = FlowNode(
            node_id=node_id,
            dag=dag,
            parameters=dict(parameters or {}),
            trigger_rule=trigger_rule,
            concurrency=policy,
        )
        self.nodes[node_id] = node
        self._validated = False
        return node

    def get_node(self, node_id: str) -> FlowNode | None:
        return self.nodes.get(node_id)

    def _validate(self) -> None:
        if not self.nodes:
            raise EmptyFlowError(self.flow_id)
        for node_id, node in self.nodes.items():
            node.dag._validate()
            try:
                json.dumps(node.parameters)
            except (TypeError, ValueError, RecursionError) as error:
                raise ValueError(
                    f"Flow node '{node_id}' in Flow '{self.flow_id}' has parameters "
                    "that are not JSON-serializable."
                ) from error
            for upstream in node.upstream_nodes:
                if upstream is node:
                    raise SelfDependencyError(node_id)
                if self.nodes.get(upstream.node_id) is not upstream:
                    raise UnknownUpstreamFlowNodeError(
                        self.flow_id, node_id, upstream.node_id
                    )
        self._check_cycles()
        self._validated = True

    def _check_cycles(self) -> None:
        visited: set[str] = set()
        active: set[str] = set()
        path: list[str] = []

        def visit(node_id: str) -> None:
            visited.add(node_id)
            active.add(node_id)
            path.append(node_id)
            for upstream in self.nodes[node_id].upstream_nodes:
                if upstream.node_id not in visited:
                    visit(upstream.node_id)
                elif upstream.node_id in active:
                    start = path.index(upstream.node_id)
                    raise FlowCycleDetectedError(
                        self.flow_id, path[start:] + [upstream.node_id]
                    )
            path.pop()
            active.remove(node_id)

        for node_id in self.nodes:
            if node_id not in visited:
                visit(node_id)
