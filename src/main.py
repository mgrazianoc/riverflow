"""Local Riverflow showcase.

Run the complete example:

    uv run python src/main.py --open

Run only the server and UI, with no registered workflows:

    uv run python src/main.py --blank --open
"""

import argparse

from riverflow import DAG, Flow, get_task_logger, serve


with DAG("ibge_source", description="Collect one scoped source.") as ibge_source:

    @ibge_source.task("discover")
    async def discover():
        get_task_logger().info("Discovering IBGE datasets.")

    @ibge_source.task("download_population")
    async def download_population():
        get_task_logger().info("Downloading population data.")

    @ibge_source.task("download_boundaries")
    async def download_boundaries():
        get_task_logger().info("Downloading geographic boundaries.")

    discover >> [download_population, download_boundaries]


with DAG("medallion", description="Promote source data through shared layers.") as medallion:

    @medallion.task("bronze")
    async def bronze():
        get_task_logger().info("Writing the bronze layer.")

    @medallion.task("silver")
    async def silver():
        get_task_logger().info("Writing the silver layer.")

    @medallion.task("gold")
    async def gold():
        get_task_logger().info("Writing the gold layer.")

    bronze >> silver >> gold


with Flow(
    "ibge_pipeline",
    description="Run the scoped IBGE work before the shared medallion work.",
) as ibge_pipeline:
    source = ibge_pipeline.add_dag(
        ibge_source,
        parameters={"scope": "ibge"},
    )
    layers = ibge_pipeline.add_dag(
        medallion,
        parameters={"scope": "ibge"},
    )
    source >> layers


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Riverflow local showcase.")
    parser.add_argument(
        "--blank",
        action="store_true",
        help="Start Riverflow without registering DAGs or Flows.",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Open the local UI after the server starts.",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8083, type=int)
    args = parser.parse_args()

    serve(
        None if args.blank else ibge_pipeline,
        host=args.host,
        port=args.port,
        open_browser=args.open,
    )


if __name__ == "__main__":
    main()
