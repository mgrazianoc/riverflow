"""
Logging Setup for ETL Application

Configures unified logging across all components (RiverFlow, FastAPI, Uvicorn, APScheduler)
using the RiverFlow logging system.
"""

import logging
import sys
from framework import RiverFlowFormatter


def setup_unified_logging():
    """
    Configure all loggers to use RiverFlow's formatting.

    This ensures that all logs from uvicorn, fastapi, apscheduler, and our
    application use the same format: [timestamp] {component} level - message
    """
    # Get the RiverFlow formatter
    formatter = RiverFlowFormatter(use_colors=True)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Remove existing handlers to avoid duplicates
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Add console handler with RiverFlow formatter
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)

    # Configure specific loggers with component names
    loggers_config = {
        "uvicorn": logging.INFO,
        "uvicorn.access": logging.INFO,
        "uvicorn.error": logging.INFO,
        "fastapi": logging.INFO,
        "apscheduler": logging.INFO,
        "apscheduler.scheduler": logging.INFO,
        "apscheduler.executors": logging.WARNING,
    }

    for logger_name, level in loggers_config.items():
        logger = logging.getLogger(logger_name)
        logger.setLevel(level)
        logger.propagate = True  # Propagate to root logger
        # Remove logger's own handlers to avoid duplicates
        for handler in logger.handlers[:]:
            logger.removeHandler(handler)

    return formatter


def get_uvicorn_log_config():
    """
    Get uvicorn logging configuration that integrates with RiverFlow logging.

    Returns:
        dict: Uvicorn-compatible logging configuration
    """
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "riverflow": {
                "()": "framework.core.logger.RiverFlowFormatter",
                "use_colors": True,
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "riverflow",
                "stream": "ext://sys.stdout",
            },
        },
        "loggers": {
            "uvicorn": {
                "handlers": ["console"],
                "level": "INFO",
                "propagate": False,
            },
            "uvicorn.access": {
                "handlers": ["console"],
                "level": "INFO",
                "propagate": False,
            },
            "uvicorn.error": {
                "handlers": ["console"],
                "level": "INFO",
                "propagate": False,
            },
        },
        "root": {
            "handlers": ["console"],
            "level": "INFO",
        },
    }
