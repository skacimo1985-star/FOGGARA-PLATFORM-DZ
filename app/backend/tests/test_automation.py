import asyncio
from .test_operations import ops, policy, observation, approve, BASE
from app.operations_worker import process_one


def test_automation_matrix_is_reviewed_and_org_scoped(client, ops):
    policy(client, ops)
    approve(client, ops, observation(client, ops, "water"))
    approve(client, ops, observation(client, ops, "food"))
    observation(client, ops, "health")  # Pending inputs must not enter the matrix.
    response = client.get(BASE + "/automation", headers=ops["member"])
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["matrix"][0][0] == result["matrix"][2][2] == 1
    assert result["matrix"][0][2] == result["matrix"][2][0] == 1
    assert result["matrix"][4][4] == 0
    foreign = client.get(BASE + "/automation", headers=ops["foreign"]).json()
    assert not any(sum(row) for row in foreign["matrix"])
    assert foreign["policy"] is None
    assert client.get(BASE + "/automation").status_code == 401


def test_queue_enrichment_is_idempotent_and_preserves_provenance(client, ops):
    policy(client, ops)
    oid = observation(client, ops)
    approve(client, ops, oid)
    for _ in range(2):
        response = client.post(BASE + "/automation/enqueue", headers=ops["member"])
        assert response.status_code == 202, response.text
    assert client.get(BASE + "/jobs", headers=ops["member"]).json()["total"] == 2
    assert process_one() == "completed"
    assert process_one() == "completed"
    assert process_one() is None
    result = client.get(BASE + "/evaluations", headers=ops["member"]).json()["items"][0]["result"]
    assert result["data_class"] == "COMPUTED" and result["field_execution"] is False
    assert result["provenance"]["water"]["observation_id"] == oid
    assert result["provenance"]["water"]["source"] == "Field report test"
    assert result["provenance"]["water"]["review_status"] == "approved"
    assert result["score"] is None  # Never invent the four missing domain readings.
    client.post(BASE + "/automation/enqueue", headers=ops["member"])
    assert process_one() == "completed"
    assert client.get(BASE + "/evaluations", headers=ops["member"]).json()["total"] == 1


def test_lifecycle_worker_recovers_and_stops(monkeypatch):
    import app.automation_runtime as module
    calls = []
    def refresh():
        calls.append("refresh")
        if calls.count("refresh") == 1:
            raise TimeoutError("temporary provider failure")
    def consume():
        calls.append("consume")
        return None
    monkeypatch.setattr(module, "refresh", refresh)
    monkeypatch.setattr(module, "process_one", consume)
    monkeypatch.setattr(module, "runtime", {"state": "stopped", "last_poll": None, "last_refresh": None, "error": None})
    async def scenario():
        stop = asyncio.Event()
        task = asyncio.create_task(module.run_queue(stop, poll_seconds=.01))
        try:
            for _ in range(200):
                if module.runtime["last_poll"]:
                    break
                await asyncio.sleep(.005)
            assert module.runtime["state"] == "running"
            assert module.runtime["error"] is None
            assert module.runtime["last_refresh"]
        finally:
            stop.set()
            await task
    asyncio.run(scenario())
    assert calls.count("refresh") == 2 and "consume" in calls
    assert module.runtime["state"] == "stopped"
