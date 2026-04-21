"""Host metrics API model."""

from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class HostSamplePoint(BaseModel):
    """A single snapshot of host-level metrics."""

    timestamp: datetime

    # CPU
    cpu_percent: float = Field(..., ge=0.0)
    load_1: float = Field(..., ge=0.0)
    load_5: float = Field(..., ge=0.0)
    load_15: float = Field(..., ge=0.0)

    # Memory (bytes)
    mem_used: int = Field(..., ge=0)
    mem_total: int = Field(..., ge=0)
    mem_percent: float = Field(..., ge=0.0)
    swap_used: int = Field(..., ge=0)
    swap_total: int = Field(..., ge=0)

    # Disk usage + I/O (bytes, bytes/s)
    disk_used: int = Field(..., ge=0)
    disk_total: int = Field(..., ge=0)
    disk_percent: float = Field(..., ge=0.0)
    disk_read_bytes_per_sec: float = Field(..., ge=0.0)
    disk_write_bytes_per_sec: float = Field(..., ge=0.0)

    # Network I/O (bytes/s)
    net_rx_bytes_per_sec: float = Field(..., ge=0.0)
    net_tx_bytes_per_sec: float = Field(..., ge=0.0)


class HostMetricsModel(BaseModel):
    """Rolling-window host metrics plus static host info."""

    cpu_count: int = Field(..., ge=1)
    disk_path: str
    interval_seconds: float = Field(..., gt=0)
    samples: list[HostSamplePoint]
