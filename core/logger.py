"""
RiverFlow Logger - Isolated logging system with Airflow-style formatting

Provides a centralized logging system for the RiverFlow framework with:
- Airflow-style log formatting
- Isolated from application loggers
- Color-coded output
- Context-aware logging (DAG ID, Task ID, Run ID)
"""

import functools
import inspect
import logging
import sys
from typing import Optional


# ANSI color codes
class LogColors:
    RESET = "\033[0m"
    BOLD = "\033[1m"

    # Log levels
    DEBUG = "\033[36m"  # Cyan
    INFO = "\033[32m"  # Green
    WARNING = "\033[33m"  # Yellow
    ERROR = "\033[31m"  # Red
    CRITICAL = "\033[35m"  # Magenta

    # Components
    DAG = "\033[94m"  # Blue
    TASK = "\033[96m"  # Light Cyan
    SCHEDULER = "\033[92m"  # Light Green


class RiverFlowFormatter(logging.Formatter):
    """
    Custom formatter that mimics Airflow's log format:
    [YYYY-MM-DD HH:MM:SS,mmm] {component} {level} - message
    """

    # Format: [timestamp] {component} level - message
    BASE_FORMAT = "[%(asctime)s] {%(component)s} %(levelname)s - %(message)s"

    # Color formats for different log levels
    FORMATS = {
        logging.DEBUG: f"{LogColors.DEBUG}{BASE_FORMAT}{LogColors.RESET}",
        logging.INFO: f"{LogColors.INFO}{BASE_FORMAT}{LogColors.RESET}",
        logging.WARNING: f"{LogColors.WARNING}{BASE_FORMAT}{LogColors.RESET}",
        logging.ERROR: f"{LogColors.ERROR}{BASE_FORMAT}{LogColors.RESET}",
        logging.CRITICAL: f"{LogColors.CRITICAL}{BASE_FORMAT}{LogColors.RESET}",
    }

    def __init__(self, use_colors: bool = True):
        super().__init__(datefmt="%Y-%m-%d %H:%M:%S")
        self.use_colors = use_colors

    def format(self, record):
        # Add default component if not present
        if not hasattr(record, "component"):
            # Use logger name as component, simplify uvicorn logger names
            component = record.name if record.name else "RiverFlow"

            # Simplify uvicorn logger names for cleaner output
            if component.startswith("uvicorn."):
                # uvicorn.error -> uvicorn (server logs)
                # uvicorn.access -> uvicorn.access (keep access logs separate)
                if component == "uvicorn.error":
                    component = "uvicorn"
                # else keep the original name

            record.component = component

        # Choose format based on log level and color preference
        if self.use_colors:
            log_fmt = self.FORMATS.get(record.levelno, self.BASE_FORMAT)
        else:
            log_fmt = self.BASE_FORMAT

        formatter = logging.Formatter(log_fmt, datefmt=self.datefmt)
        return formatter.format(record)


class RiverFlowLoggerAdapter(logging.LoggerAdapter):
    """
    Logger adapter that adds contextual information (DAG ID, Task ID, Run ID)
    to log messages in Airflow style.
    """

    def __init__(self, logger, extra=None):
        super().__init__(logger, extra or {})

    def process(self, msg, kwargs):
        # Build component name from context
        component_parts = []

        if "dag_id" in self.extra:
            component_parts.append(f"dag_id={self.extra['dag_id']}")

        if "task_id" in self.extra:
            component_parts.append(f"task_id={self.extra['task_id']}")

        if "run_id" in self.extra:
            component_parts.append(f"run_id={self.extra['run_id']}")

        # Set component in extra
        if component_parts:
            component = ", ".join(component_parts)
        else:
            component = self.extra.get("component", "RiverFlow")

        # Add component to kwargs
        if "extra" not in kwargs:
            kwargs["extra"] = {}
        kwargs["extra"]["component"] = component

        return msg, kwargs


class RiverFlowLogger:
    """
    Singleton logger manager for RiverFlow framework.
    Provides isolated logging with Airflow-style formatting.
    """

    _instance = None
    _logger = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._initialized = True
        self._setup_logger()

    def _setup_logger(self):
        """Initialize the isolated RiverFlow logger"""
        # Create logger with unique name to isolate it
        self._logger = logging.getLogger("riverflow")
        self._logger.setLevel(logging.INFO)

        # Prevent propagation to root logger (isolation)
        self._logger.propagate = False

        # Remove any existing handlers
        self._logger.handlers.clear()

        # Create console handler
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.DEBUG)

        # Add custom formatter
        formatter = RiverFlowFormatter(use_colors=True)
        handler.setFormatter(formatter)

        # Add handler to logger
        self._logger.addHandler(handler)

    @classmethod
    def get_logger(
        cls,
        component: Optional[str] = None,
        dag_id: Optional[str] = None,
        task_id: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> logging.LoggerAdapter:
        """
        Get a logger with optional context information.

        Args:
            component: Component name (e.g., 'DAGExecutor', 'TaskExecutor', 'RiverFlow')
            dag_id: DAG identifier
            task_id: Task identifier
            run_id: Run identifier

        Returns:
            LoggerAdapter with context

        Example:
            # Simple logger
            logger = RiverFlowLogger.get_logger(component='DAGExecutor')
            logger.info("Starting DAG execution")

            # Logger with context
            logger = RiverFlowLogger.get_logger(
                dag_id='my_dag',
                task_id='extract',
                run_id='run_123'
            )
            logger.info("Task started")
        """
        instance = cls()

        # Build extra context
        extra = {}
        if component:
            extra["component"] = component
        if dag_id:
            extra["dag_id"] = dag_id
        if task_id:
            extra["task_id"] = task_id
        if run_id:
            extra["run_id"] = run_id

        return RiverFlowLoggerAdapter(instance._logger, extra)

    @classmethod
    def set_level(cls, level: int):
        """
        Set the logging level for RiverFlow.

        Args:
            level: logging level (e.g., logging.DEBUG, logging.INFO)

        Example:
            RiverFlowLogger.set_level(logging.DEBUG)
        """
        instance = cls()
        instance._logger.setLevel(level)

    @classmethod
    def disable_colors(cls):
        """Disable color output in logs"""
        instance = cls()
        for handler in instance._logger.handlers:
            if isinstance(handler.formatter, RiverFlowFormatter):
                handler.formatter.use_colors = False

    @classmethod
    def enable_colors(cls):
        """Enable color output in logs"""
        instance = cls()
        for handler in instance._logger.handlers:
            if isinstance(handler.formatter, RiverFlowFormatter):
                handler.formatter.use_colors = True

    @classmethod
    def add_file_handler(
        cls, filename: str, level: int = logging.INFO, use_colors: bool = False
    ):
        """
        Add a file handler to log to a file.

        Args:
            filename: Path to log file
            level: Logging level for file handler
            use_colors: Whether to use colors in file (usually False)

        Example:
            RiverFlowLogger.add_file_handler('/var/log/riverflow.log')
        """
        instance = cls()

        # Create file handler
        file_handler = logging.FileHandler(filename)
        file_handler.setLevel(level)

        # Add formatter (without colors for files)
        formatter = RiverFlowFormatter(use_colors=use_colors)
        file_handler.setFormatter(formatter)

        # Add to logger
        instance._logger.addHandler(file_handler)


# Convenience function for getting logger
def get_logger(
    component: Optional[str] = None,
    dag_id: Optional[str] = None,
    task_id: Optional[str] = None,
    run_id: Optional[str] = None,
) -> logging.LoggerAdapter:
    """
    Convenience function to get a RiverFlow logger.

    Args:
        component: Component name
        dag_id: DAG identifier
        task_id: Task identifier
        run_id: Run identifier

    Returns:
        LoggerAdapter with context

    Example:
        from ETL.framework.core.logger import get_logger

        logger = get_logger(component='MyComponent')
        logger.info("Hello RiverFlow!")
    """
    return RiverFlowLogger.get_logger(
        component=component, dag_id=dag_id, task_id=task_id, run_id=run_id
    )


def task_event(func):
    """
    Decorator for logging task execution events (START/END).

    Logs the start and end of task execution with timing information.
    Works with both sync and async functions.

    Usage:
        @task_event
        async def my_task():
            # task code
            pass
    """

    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs):
        func_name = func.__name__
        module = func.__module__
        logger = get_logger(component=f"{module}.{func_name}")

        logger.info("START")
        try:
            result = await func(*args, **kwargs)
            logger.info("END")
            return result
        except Exception as e:
            logger.exception(f"EXCEPTION: {str(e)}")
            raise

    @functools.wraps(func)
    def sync_wrapper(*args, **kwargs):
        func_name = func.__name__
        module = func.__module__
        logger = get_logger(component=f"{module}.{func_name}")

        logger.info("START")
        try:
            result = func(*args, **kwargs)
            logger.info("END")
            return result
        except Exception as e:
            logger.exception(f"EXCEPTION: {str(e)}")
            raise

    if inspect.iscoroutinefunction(func):
        return async_wrapper
    else:
        return sync_wrapper
