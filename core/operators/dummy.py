"""
Empty Operator - A no-op task for dependency chaining

Similar to Airflow's EmptyOperator (formerly DummyOperator), this operator
does nothing but is useful for:
- Grouping dependencies
- Creating fan-out/fan-in patterns
- Visual organization in DAGs
"""


async def dummy_task():
    """A task that does nothing - used for dependency grouping"""
    pass


def create_empty_task(dag, task_id: str):
    """
    Create an empty operator task in a DAG.

    Args:
        dag: The DAG to add the task to
        task_id: Unique identifier for the empty task

    Returns:
        The created Task object

    Example:
        with DAG("my_dag") as dag:
            start = create_empty_operator(dag, "start")
            end = create_empty_operator(dag, "end")

            task1 = dag.task("task1")(my_func1)
            task2 = dag.task("task2")(my_func2)

            start >> [task1, task2] >> end
    """

    @dag.task(task_id)
    async def _empty():
        pass

    return _empty
