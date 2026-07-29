import pytest
from datetime import timedelta

from riverflow.core.dag import DAG
from riverflow.core.errors import (
    DAGValidationError,
    EmptyDAGError,
    SelfDependencyError,
    UnknownUpstreamTaskError,
)


async def _noop():
    pass


def test_validation_reports_self_dependency_before_cycle_detection():
    dag = DAG("self_reference")
    task = dag.task("task")(_noop)
    task.upstream_tasks.append(task)

    with pytest.raises(SelfDependencyError):
        dag._validate()


def test_validation_rejects_foreign_task_with_colliding_id():
    dag = DAG("target")
    local = dag.task("shared")(_noop)
    downstream = dag.task("downstream")(_noop)

    foreign_dag = DAG("foreign")
    foreign = foreign_dag.task("shared")(_noop)
    downstream.upstream_tasks.append(foreign)

    assert dag.tasks["shared"] is local
    with pytest.raises(UnknownUpstreamTaskError):
        dag._validate()


def test_register_dag_validates_dags_not_built_with_context_manager(riverflow):
    with pytest.raises(EmptyDAGError):
        riverflow.register_dag(DAG("empty"))


def test_all_validation_errors_share_the_documented_base_class():
    assert issubclass(UnknownUpstreamTaskError, DAGValidationError)
    assert issubclass(EmptyDAGError, DAGValidationError)


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"retries": -1}, "greater than or equal to zero"),
        ({"retries": True}, "non-integer"),
        ({"timeout": timedelta(0)}, "greater than zero"),
        ({"retry_delay": timedelta(seconds=-1)}, "greater than or equal to zero"),
    ],
)
def test_invalid_task_execution_configuration_is_rejected(kwargs, message):
    dag = DAG("invalid_config")
    dag.task("task", **kwargs)(_noop)

    with pytest.raises((TypeError, ValueError), match=message):
        dag._validate()
