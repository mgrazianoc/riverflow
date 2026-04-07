"""Tests for TaskLogHandler, get_task_logger, and stdout capture."""

import asyncio
import logging
import sys

from riverflow.core.logger import (
    TaskLogHandler,
    _current_task_logger,
    _TaskOutputStream,
    get_task_logger,
    install_task_stdout_capture,
    RiverFlowLoggerAdapter,
    _original_stdout,
)


class TestTaskLogHandler:
    def test_captures_records(self):
        handler = TaskLogHandler()
        logger = logging.getLogger("test.capture")
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)

        logger.info("hello")
        logger.warning("warn msg")

        assert len(handler.records) == 2
        assert handler.records[0]["level"] == "INFO"
        assert handler.records[0]["message"] == "hello"
        assert handler.records[1]["level"] == "WARNING"
        assert "timestamp" in handler.records[0]

        logger.removeHandler(handler)

    def test_empty_if_no_logs(self):
        handler = TaskLogHandler()
        assert handler.records == []


class TestGetTaskLogger:
    def test_returns_contextvar_logger_when_set(self):
        dummy_logger = logging.getLogger("test.contextvar")
        adapter = RiverFlowLoggerAdapter(dummy_logger, {"component": "test"})

        token = _current_task_logger.set(adapter)
        try:
            result = get_task_logger()
            assert result is adapter
        finally:
            _current_task_logger.reset(token)

    def test_returns_fallback_when_unset(self):
        result = get_task_logger()
        assert result is not None  # should return a generic logger


class TestTaskOutputStream:
    def test_routes_to_task_logger_when_active(self):
        handler = TaskLogHandler()
        logger = logging.getLogger("test.stdout_route")
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        adapter = RiverFlowLoggerAdapter(logger, {"component": "test"})

        stream = _TaskOutputStream(_original_stdout, level="INFO")

        token = _current_task_logger.set(adapter)
        try:
            stream.write("captured line\n")
        finally:
            _current_task_logger.reset(token)

        assert len(handler.records) == 1
        assert handler.records[0]["message"] == "captured line"

        logger.removeHandler(handler)

    def test_passes_through_when_inactive(self, capsys):
        # Temporarily restore real stdout so capsys can work
        original = sys.stdout
        sys.stdout = _original_stdout

        stream = _TaskOutputStream(_original_stdout, level="INFO")
        stream.write("passthrough\n")

        sys.stdout = original

    def test_ignores_blank_lines(self):
        handler = TaskLogHandler()
        logger = logging.getLogger("test.blank")
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        adapter = RiverFlowLoggerAdapter(logger, {"component": "test"})

        stream = _TaskOutputStream(_original_stdout)
        token = _current_task_logger.set(adapter)
        try:
            stream.write("\n\n  \n")
        finally:
            _current_task_logger.reset(token)

        assert len(handler.records) == 0
        logger.removeHandler(handler)


class TestContextVarIsolation:
    """Verify ContextVars keep concurrent tasks isolated."""

    async def test_concurrent_tasks_are_isolated(self):
        results = {}

        async def task_a():
            h = TaskLogHandler()
            lg = logging.getLogger("test.iso.a")
            lg.addHandler(h)
            lg.setLevel(logging.DEBUG)
            adapter = RiverFlowLoggerAdapter(lg, {"component": "a"})
            token = _current_task_logger.set(adapter)
            try:
                await asyncio.sleep(0.01)
                get_task_logger().info("from_a")
                results["a"] = h.records[:]
            finally:
                _current_task_logger.reset(token)
                lg.removeHandler(h)

        async def task_b():
            h = TaskLogHandler()
            lg = logging.getLogger("test.iso.b")
            lg.addHandler(h)
            lg.setLevel(logging.DEBUG)
            adapter = RiverFlowLoggerAdapter(lg, {"component": "b"})
            token = _current_task_logger.set(adapter)
            try:
                await asyncio.sleep(0.01)
                get_task_logger().info("from_b")
                results["b"] = h.records[:]
            finally:
                _current_task_logger.reset(token)
                lg.removeHandler(h)

        await asyncio.gather(task_a(), task_b())

        assert len(results["a"]) == 1
        assert results["a"][0]["message"] == "from_a"
        assert len(results["b"]) == 1
        assert results["b"][0]["message"] == "from_b"
