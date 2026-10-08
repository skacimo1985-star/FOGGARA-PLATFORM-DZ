"""Lifecycle scheduler for real parcel field-intelligence analysis."""
import asyncio
import logging
from datetime import datetime, timezone

from . import config
from .field_automation import run_cycle

log = logging.getLogger("foggara.field_automation.runtime")
runtime = {
    "state": "stopped",
    "last_run": None,
    "last_success": None,
    "summary": None,
    "error": None,
    "cursor": 0,
}


async def run_field_automation(stop: asyncio.Event, interval_seconds: float | None = None):
    interval = float(interval_seconds or config.FIELD_AUTOMATION_INTERVAL_SECONDS)
    runtime["state"] = "running"
    try:
        while not stop.is_set():
            runtime["last_run"] = datetime.now(timezone.utc).isoformat()
            try:
                summary = await asyncio.to_thread(run_cycle, after_id=int(runtime.get("cursor") or 0))
                runtime.update(
                    state="running",
                    last_success=datetime.now(timezone.utc).isoformat(),
                    summary=summary,
                    error=None,
                    cursor=int(summary.get("last_parcel_id") or 0),
                )
            except Exception as exc:
                runtime.update(state="degraded", error=type(exc).__name__)
                log.warning("field automation cycle failed: %s", type(exc).__name__)
            try:
                await asyncio.wait_for(stop.wait(), timeout=interval)
            except asyncio.TimeoutError:
                pass
    finally:
        runtime["state"] = "stopped"
