"""
Host metrics — lightweight psutil-based sampler.

Single-host deployment is the sweet spot of Riverflow, so first-class
host observability is warranted. The collector runs a background
coroutine that samples CPU / memory / disk / network every
`interval_seconds` and keeps the last `retention_minutes` of samples
in memory. A fresh ``/api/host/metrics`` response reads the ring
buffer — no disk I/O, no Prometheus, no external agent.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, Optional

import psutil


@dataclass(slots=True)
class HostSample:
    """A single point-in-time host sample."""

    timestamp: float
    cpu_percent: float
    load_1: float
    load_5: float
    load_15: float
    mem_used: int
    mem_total: int
    mem_percent: float
    swap_used: int
    swap_total: int
    disk_used: int
    disk_total: int
    disk_percent: float
    disk_read_bytes_per_sec: float
    disk_write_bytes_per_sec: float
    net_rx_bytes_per_sec: float
    net_tx_bytes_per_sec: float


class HostMetricsCollector:
    """
    Samples host metrics on a fixed interval and retains a rolling
    window in memory. Thread-safe for single-asyncio-loop usage.
    """

    def __init__(
        self,
        interval_seconds: float = 5.0,
        retention_minutes: float = 60.0,
        disk_path: str = "/",
    ) -> None:
        self.interval_seconds = interval_seconds
        self.retention_minutes = retention_minutes
        self.disk_path = disk_path
        capacity = max(1, int((retention_minutes * 60) / interval_seconds))
        self._buffer: Deque[HostSample] = deque(maxlen=capacity)
        self._task: Optional[asyncio.Task[None]] = None

        # Previous counters for rate calculations
        self._prev_disk_read: Optional[int] = None
        self._prev_disk_write: Optional[int] = None
        self._prev_net_rx: Optional[int] = None
        self._prev_net_tx: Optional[int] = None
        self._prev_ts: Optional[float] = None

        # Prime cpu_percent so the first read isn't 0.0.
        psutil.cpu_percent(interval=None)

    # ────────────────────────────────────────────────────────
    # Lifecycle
    # ────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._task is not None:
            return
        # Take an immediate first sample so the API has data at once.
        self._sample()
        self._task = asyncio.create_task(self._run(), name="host-metrics")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except (asyncio.CancelledError, Exception):
            pass
        self._task = None

    async def _run(self) -> None:
        while True:
            try:
                await asyncio.sleep(self.interval_seconds)
                self._sample()
            except asyncio.CancelledError:
                raise
            except Exception:
                # Never let a single bad sample kill the collector.
                continue

    # ────────────────────────────────────────────────────────
    # Sampling
    # ────────────────────────────────────────────────────────

    def _sample(self) -> None:
        now = time.time()
        dt = (now - self._prev_ts) if self._prev_ts else self.interval_seconds
        dt = max(dt, 0.001)

        vm = psutil.virtual_memory()
        sw = psutil.swap_memory()
        du = psutil.disk_usage(self.disk_path)

        # Disk I/O rates
        disk_read = disk_write = 0.0
        try:
            dio = psutil.disk_io_counters()
            if dio is not None:
                if self._prev_disk_read is not None:
                    disk_read = max(0.0, (dio.read_bytes - self._prev_disk_read) / dt)
                    disk_write = max(0.0, (dio.write_bytes - self._prev_disk_write) / dt)
                self._prev_disk_read = dio.read_bytes
                self._prev_disk_write = dio.write_bytes
        except Exception:
            pass

        # Network I/O rates
        net_rx = net_tx = 0.0
        try:
            nio = psutil.net_io_counters()
            if self._prev_net_rx is not None:
                net_rx = max(0.0, (nio.bytes_recv - self._prev_net_rx) / dt)
                net_tx = max(0.0, (nio.bytes_sent - self._prev_net_tx) / dt)
            self._prev_net_rx = nio.bytes_recv
            self._prev_net_tx = nio.bytes_sent
        except Exception:
            pass

        # Load average (not available on Windows; fall back to zeros).
        try:
            la1, la5, la15 = psutil.getloadavg()
        except (AttributeError, OSError):
            la1 = la5 = la15 = 0.0

        self._prev_ts = now
        self._buffer.append(
            HostSample(
                timestamp=now,
                cpu_percent=psutil.cpu_percent(interval=None),
                load_1=la1,
                load_5=la5,
                load_15=la15,
                mem_used=int(vm.used),
                mem_total=int(vm.total),
                mem_percent=float(vm.percent),
                swap_used=int(sw.used),
                swap_total=int(sw.total),
                disk_used=int(du.used),
                disk_total=int(du.total),
                disk_percent=float(du.percent),
                disk_read_bytes_per_sec=disk_read,
                disk_write_bytes_per_sec=disk_write,
                net_rx_bytes_per_sec=net_rx,
                net_tx_bytes_per_sec=net_tx,
            )
        )

    # ────────────────────────────────────────────────────────
    # Read
    # ────────────────────────────────────────────────────────

    def recent(self, minutes: Optional[float] = None) -> list[HostSample]:
        """Return samples from the last `minutes` (default: full window)."""
        if minutes is None:
            return list(self._buffer)
        cutoff = time.time() - (minutes * 60)
        return [s for s in self._buffer if s.timestamp >= cutoff]

    @property
    def cpu_count(self) -> int:
        return psutil.cpu_count(logical=True) or 1
