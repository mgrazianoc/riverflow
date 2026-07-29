"""Trigger-rule evaluation shared by task and Flow-node graphs."""

from .task import TaskState, TriggerRule


TERMINAL_STATES = frozenset(
    {
        TaskState.SUCCESS,
        TaskState.FAILED,
        TaskState.SKIPPED,
        TaskState.UPSTREAM_FAILED,
        TaskState.TIMEOUT,
    }
)


def should_run(rule: TriggerRule, states: list[TaskState]) -> bool:
    """Return whether a node should run after all upstream nodes terminate."""
    if not states:
        return True
    if rule == TriggerRule.ALL_SUCCESS:
        return all(state == TaskState.SUCCESS for state in states)
    if rule == TriggerRule.ALL_FAILED:
        return all(state == TaskState.FAILED for state in states)
    if rule == TriggerRule.ALL_DONE:
        return all(state in TERMINAL_STATES for state in states)
    if rule == TriggerRule.ALL_DONE_MIN_ONE_SUCCESS:
        return all(state in TERMINAL_STATES for state in states) and any(
            state == TaskState.SUCCESS for state in states
        )
    if rule == TriggerRule.ALL_SKIPPED:
        return all(state == TaskState.SKIPPED for state in states)
    if rule == TriggerRule.ONE_SUCCESS:
        return any(state == TaskState.SUCCESS for state in states)
    if rule == TriggerRule.ONE_FAILED:
        return any(state == TaskState.FAILED for state in states)
    if rule == TriggerRule.ONE_DONE:
        return any(
            state
            in {
                TaskState.SUCCESS,
                TaskState.FAILED,
                TaskState.UPSTREAM_FAILED,
                TaskState.TIMEOUT,
            }
            for state in states
        )
    if rule == TriggerRule.NONE_FAILED:
        return not any(
            state in {TaskState.FAILED, TaskState.UPSTREAM_FAILED} for state in states
        )
    if rule == TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS:
        return not any(
            state in {TaskState.FAILED, TaskState.UPSTREAM_FAILED} for state in states
        ) and any(state == TaskState.SUCCESS for state in states)
    if rule == TriggerRule.NONE_SKIPPED:
        return not any(state == TaskState.SKIPPED for state in states)
    if rule == TriggerRule.ALWAYS:
        return True
    return False
