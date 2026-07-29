import asyncio
from typing import TYPE_CHECKING, Callable, Optional

from .dag import DAGRunState
from .errors import FlowNodeBusyError
from .flow import ConcurrencyPolicy, Flow, FlowNode, FlowRunHistory
from .run_context import RunContext
from .task import TaskState
from .trigger_rules import TERMINAL_STATES, should_run

if TYPE_CHECKING:
    from .riverflow import Riverflow


class FlowExecutor:
    """Execute a Flow by triggering its DAG nodes as first-class child runs."""

    def __init__(
        self,
        flow: Flow,
        riverflow: "Riverflow",
        run_history: FlowRunHistory,
        on_node_state_change: Optional[
            Callable[[str, TaskState, str | None, str | None], None]
        ] = None,
        queue_poll_seconds: float = 0.05,
    ):
        self.flow = flow
        self.riverflow = riverflow
        self.run_history = run_history
        self.on_node_state_change = on_node_state_change
        self.queue_poll_seconds = queue_poll_seconds

    async def run(self) -> dict[str, TaskState]:
        # Revalidate on every run because dependency operators can mutate a
        # Flow after it was registered.
        self.flow._validate()

        states = {node_id: TaskState.NONE for node_id in self.flow.nodes}
        running: dict[asyncio.Task, FlowNode] = {}

        while True:
            for node in self._ready_nodes(states):
                states[node.node_id] = TaskState.RUNNING
                self._notify(node.node_id, TaskState.RUNNING)
                running[asyncio.create_task(self._run_node(node))] = node

            if running:
                completed, _ = await asyncio.wait(
                    running, return_when=asyncio.FIRST_COMPLETED
                )
                for future in completed:
                    node = running.pop(future)
                    try:
                        state, dag_run_id, error = future.result()
                    except Exception as exc:
                        state, dag_run_id, error = TaskState.FAILED, None, str(exc)
                    states[node.node_id] = state
                    self._notify(node.node_id, state, dag_run_id, error)
                continue

            unresolved = [
                node
                for node in self.flow.nodes.values()
                if states[node.node_id] == TaskState.NONE
            ]
            if not unresolved:
                return states

            blocked = [
                node for node in unresolved if self._upstreams_terminal(node, states)
            ]
            if not blocked:
                raise RuntimeError(
                    f"Flow '{self.flow.flow_id}' cannot make progress. "
                    "Validate its DAG-node dependencies."
                )
            for node in blocked:
                upstream_states = [
                    states[upstream.node_id] for upstream in node.upstream_nodes
                ]
                state = (
                    TaskState.UPSTREAM_FAILED
                    if any(
                        value
                        in {
                            TaskState.FAILED,
                            TaskState.UPSTREAM_FAILED,
                            TaskState.TIMEOUT,
                        }
                        for value in upstream_states
                    )
                    else TaskState.SKIPPED
                )
                states[node.node_id] = state
                self._notify(node.node_id, state)

    async def _run_node(
        self, node: FlowNode
    ) -> tuple[TaskState, str | None, str | None]:
        metadata = dict(self.run_history.parameters)
        metadata.update(node.parameters)
        context = RunContext(
            trigger_source="flow",
            trigger_mode=self.run_history.trigger_mode,
            requested_by=self.run_history.requested_by,
            metadata=metadata,
            force=node.concurrency == ConcurrencyPolicy.FORCE,
            parent_flow_run_id=self.run_history.run_id,
            flow_node_id=node.node_id,
        )

        while True:
            child = await self.riverflow.trigger(
                node.dag.dag_id,
                wait=True,
                force=node.concurrency == ConcurrencyPolicy.FORCE,
                run_context=context,
            )
            if child is not None:
                state = (
                    TaskState.SUCCESS
                    if child.state == DAGRunState.SUCCESS
                    else TaskState.FAILED
                )
                error = child.error
                if state == TaskState.FAILED and not error:
                    error = (
                        f"DAG '{node.dag.dag_id}' run '{child.run_id}' failed."
                    )
                return state, child.run_id, error
            if node.concurrency == ConcurrencyPolicy.REJECT:
                raise FlowNodeBusyError(
                    self.flow.flow_id, node.node_id, node.dag.dag_id
                )
            await asyncio.sleep(self.queue_poll_seconds)

    def _ready_nodes(
        self, states: dict[str, TaskState]
    ) -> list[FlowNode]:
        ready = []
        for node in self.flow.nodes.values():
            if states[node.node_id] != TaskState.NONE:
                continue
            if not self._upstreams_terminal(node, states):
                continue
            upstream_states = [
                states[upstream.node_id] for upstream in node.upstream_nodes
            ]
            if should_run(node.trigger_rule, upstream_states):
                ready.append(node)
        return ready

    @staticmethod
    def _upstreams_terminal(
        node: FlowNode, states: dict[str, TaskState]
    ) -> bool:
        return all(
            states.get(upstream.node_id, TaskState.NONE) in TERMINAL_STATES
            for upstream in node.upstream_nodes
        )

    def _notify(
        self,
        node_id: str,
        state: TaskState,
        dag_run_id: str | None = None,
        error: str | None = None,
    ) -> None:
        if self.on_node_state_change:
            self.on_node_state_change(node_id, state, dag_run_id, error)
