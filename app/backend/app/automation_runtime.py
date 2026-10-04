"""Lifecycle-managed consumer of the existing transactional operations queue."""
import asyncio
import logging
import time
from datetime import datetime, timezone
from .operations_worker import process_one, refresh

log = logging.getLogger("foggara.automation")
runtime = {"state": "stopped", "last_poll": None, "last_refresh": None, "error": None}

async def run_queue(stop: asyncio.Event, poll_seconds: float = 15):
    last_refresh = -3600.0
    runtime["state"] = "running"
    try:
        while not stop.is_set():
            try:
                if time.monotonic() - last_refresh >= 3600:
                    await asyncio.to_thread(refresh)
                    last_refresh = time.monotonic()
                    runtime["last_refresh"] = datetime.now(timezone.utc).isoformat()
                # Bound each cycle; queue row locks allow multiple PostgreSQL instances.
                for _ in range(20):
                    if stop.is_set() or await asyncio.to_thread(process_one) is None:
                        break
                runtime.update(state="running", error=None, last_poll=datetime.now(timezone.utc).isoformat())
            except Exception as exc:
                runtime.update(state="degraded", error=type(exc).__name__)
                log.warning("queue cycle failed: %s", type(exc).__name__)
            try:
                await asyncio.wait_for(stop.wait(), timeout=poll_seconds)
            except asyncio.TimeoutError:
                pass
    finally:
        runtime["state"] = "stopped"
