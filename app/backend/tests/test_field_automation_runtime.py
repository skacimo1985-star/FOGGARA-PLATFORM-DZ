import asyncio


def test_field_automation_runtime_runs_and_stops(monkeypatch):
    import app.field_automation_runtime as module

    calls = []

    def cycle():
        calls.append("cycle")
        return {"eligible": 1, "processed": 1, "created": 7, "no_scene": 0, "failed": 0}

    monkeypatch.setattr(module, "run_cycle", cycle)
    monkeypatch.setattr(
        module,
        "runtime",
        {"state": "stopped", "last_run": None, "last_success": None, "summary": None, "error": None},
    )

    async def scenario():
        stop = asyncio.Event()
        task = asyncio.create_task(module.run_field_automation(stop, interval_seconds=0.01))
        try:
            for _ in range(200):
                if module.runtime["last_success"]:
                    break
                await asyncio.sleep(0.005)
            assert module.runtime["state"] == "running"
            assert module.runtime["summary"]["created"] == 7
            assert module.runtime["error"] is None
        finally:
            stop.set()
            await task

    asyncio.run(scenario())
    assert calls
    assert module.runtime["state"] == "stopped"
