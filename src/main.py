import uvicorn

from riverflow.core import DAG, Riverflow
from datetime import timedelta

from riverflow.server.api import create_riverflow_api
from riverflow.server.setup import get_uvicorn_log_config, setup_unified_logging


def build_dag() -> DAG:
    # Define a DAG with context manager for task definition
    with DAG(dag_id="data_pipeline", schedule=timedelta(seconds=10)) as dag:

        @dag.task("extract_data")
        async def extract():
            print("Extracting data...")
            # Your extraction logic here

        @dag.task("transform_data_1")
        async def transform_1():
            print("Transforming data 1...")
            # Your transformation logic here

        @dag.task("transform_data_2")
        async def transform_2():
            print("Transforming data 2...")
            # Your transformation logic here

        @dag.task("load_data")
        async def load_data():
            print("Loading data...")
            # Your loading logic here

        # Set dependencies using >> operator
        extract >> [transform_1, transform_2] >> load_data

        return dag


def main():
    # Setup unified logging before anything else
    setup_unified_logging()

    riverflow = Riverflow.get_instance()

    dag = build_dag()

    riverflow.register_dag(dag)

    app = create_riverflow_api(riverflow)

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8083,
        log_config=get_uvicorn_log_config(),  # Use our Riverflow logging config
    )


if __name__ == "__main__":
    main()
