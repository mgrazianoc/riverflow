from datetime import timedelta

from riverflow import DAG, get_task_logger, serve


with DAG(dag_id="data_pipeline", schedule=timedelta(seconds=10)) as dag:

    @dag.task("extract_data")
    async def extract():
        get_task_logger().info("Extracting data...")

    @dag.task("transform_data_1")
    async def transform_1():
        get_task_logger().info("Transforming data 1...")

    @dag.task("transform_data_2")
    async def transform_2():
        get_task_logger().info("Transforming data 2...")

    @dag.task("load_data")
    async def load_data():
        get_task_logger().info("Loading data...")

    extract >> [transform_1, transform_2] >> load_data


if __name__ == "__main__":
    serve(dag, host="0.0.0.0")
