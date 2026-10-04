import asyncio

from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app.auth_admission import AuthAdmissionMiddleware, MAX_AUTH_BODY
from app.models import Service, ServiceRequest
from app.services.catalog import CATALOG_PROVIDER, ensure_service_catalog
from tests.conftest import login


def test_login_normalizes_email_but_preserves_password(client, world):
    response = client.post("/api/auth/login", json={"email":"  O1M@T.DZ  ","password":"pass#1"})
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "o1m@t.dz"
    assert client.post("/api/auth/login", json={"email":"o1m@t.dz","password":" pass#1 "}).status_code == 401


def test_auth_schema_bounds_and_does_not_echo_password(client):
    secret = "secret" * 200
    for body in ({"email":"e@t.dz","password":secret}, {"email":"e@t.dz","password":"secret","role":"admin"}):
        response=client.post("/api/auth/login",json=body)
        assert response.status_code == 422
        assert secret not in response.text


def test_declared_large_auth_body_rejected_before_database(client, monkeypatch):
    import app.auth_limits as limits
    monkeypatch.setattr(limits.engine,"begin",lambda: (_ for _ in ()).throw(AssertionError("Database must not be touched")))
    response=client.post("/api/auth/register",content=b"x"*(MAX_AUTH_BODY+1))
    assert response.status_code == 413
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"


async def request_asgi(app, path="/api/auth/login", chunks=(b"{}",), headers=()):
    messages=[]
    events=[{"type":"http.request","body":chunk,"more_body":i<len(chunks)-1} for i,chunk in enumerate(chunks)]
    async def receive():
        if events:return events.pop(0)
        return {"type":"http.disconnect"}
    async def send(message):messages.append(message)
    await app({"type":"http","asgi":{"version":"3.0"},"method":"POST","path":path,
               "headers":list(headers),"client":("testclient",123),"query_string":b"","server":("test",80),"scheme":"http"},receive,send)
    return messages


def test_chunked_auth_body_is_bounded():
    called=[]
    async def inner(scope,receive,send):called.append(scope)
    messages=asyncio.run(request_asgi(AuthAdmissionMiddleware(inner),chunks=(b"x"*MAX_AUTH_BODY,b"x")))
    assert messages[0]["status"] == 413
    assert not called


def test_admission_rejects_parallel_excess_and_recovers(monkeypatch):
    monkeypatch.setenv("AUTH_MAX_CONCURRENT","2")
    monkeypatch.setenv("RATE_LIMIT_LOGIN_MAX","500")
    async def exercise():
        release=asyncio.Event();started=asyncio.Event();active=0;peak=0
        async def inner(scope,receive,send):
            nonlocal active,peak
            if scope["path"]=="/api/auth/login":
                payload=await receive();assert payload["body"]==b"{}"
                active+=1;peak=max(peak,active)
                if active==2:started.set()
                await release.wait();active-=1
            await send({"type":"http.response.start","status":200,"headers":[]})
            await send({"type":"http.response.body","body":b"ok"})
        gate=AuthAdmissionMiddleware(inner)
        admitted=[asyncio.create_task(request_asgi(gate)) for _ in range(2)]
        try:
            await asyncio.wait_for(started.wait(),1)
            excess=await asyncio.gather(*(request_asgi(gate) for _ in range(40)))
            assert all(x[0]["status"]==503 for x in excess)
            assert all((b"retry-after",b"5") in x[0]["headers"] for x in excess)
            # Unrelated requests bypass the occupied credential slots.
            health=await request_asgi(gate,path="/api/health")
            assert health[0]["status"]==200
        finally:
            release.set();await asyncio.gather(*admitted)
        assert peak==2
        assert (await request_asgi(gate))[0]["status"]==200
    asyncio.run(exercise())


def test_admission_slot_released_on_exception(monkeypatch):
    monkeypatch.setenv("AUTH_MAX_CONCURRENT","1")
    async def exercise():
        failed=True
        async def inner(scope,receive,send):
            nonlocal failed
            if failed:failed=False;raise RuntimeError("Test failure")
            await send({"type":"http.response.start","status":200,"headers":[]})
        gate=AuthAdmissionMiddleware(inner)
        try:await request_asgi(gate)
        except RuntimeError:pass
        assert (await request_asgi(gate))[0]["status"]==200
    asyncio.run(exercise())


def test_local_rate_denial_precedes_database(client, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_LOGIN_MAX","1")
    assert client.post("/api/auth/login",json={"email":"missing@t.dz","password":"bad"}).status_code==401
    import app.auth_limits as limits
    monkeypatch.setattr(limits.engine,"begin",lambda: (_ for _ in ()).throw(AssertionError("Database must not be touched")))
    response=client.post("/api/auth/login",json={"email":"missing@t.dz","password":"bad"})
    assert response.status_code==429
    assert response.headers["retry-after"]=="60"


def test_throttle_store_failure_is_closed_and_retryable(client,monkeypatch):
    import app.auth_limits as limits
    def fail():raise OperationalError("query",{},Exception("sensitive connection details"))
    monkeypatch.setattr(limits.engine,"begin",fail)
    response=client.post("/api/auth/login",json={"email":"missing@t.dz","password":"bad"})
    assert response.status_code==503
    assert response.headers["retry-after"]=="5"
    assert "sensitive" not in response.text


def test_catalog_is_idempotent_and_publication_is_scoped(client,db):
    assert ensure_service_catalog(db)==7
    db.commit()
    assert ensure_service_catalog(db)==0
    db.add_all([Service(type="inspection",name_ar="private",name_fr="private",name_en="private",provider="Unpublished provider",is_demo=False),
                Service(type="inspection",name_ar="demo",name_fr="demo",name_en="demo",provider=CATALOG_PROVIDER,is_demo=True)])
    db.commit()
    response=client.get("/api/public/services")
    assert response.status_code==200
    assert response.headers["cache-control"]=="public, max-age=300"
    assert len(response.json())==7
    assert all(not s["is_demo"] and s["provider"]==CATALOG_PROVIDER for s in response.json())


def test_catalog_service_requests_stay_tenant_scoped(client,world,db):
    ensure_service_catalog(db);db.commit()
    service=client.get("/api/public/services").json()[0]
    headers=login(client,"o1m@t.dz")
    response=client.post("/api/service-requests",json={"service_id":service["id"],"notes":"Scope review requested"},headers=headers)
    assert response.status_code==201
    assert not response.json()["is_demo"]
    other=login(client,"o2m@t.dz")
    assert client.get(f"/api/service-requests/{response.json()['id']}",headers=other).status_code==404
    assert db.scalar(select(ServiceRequest.org_id).where(ServiceRequest.id==response.json()["id"]))==world["org1"].id


def test_registration_burst_is_durably_bounded(client,db,monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_AUTH_MAX","100")
    body={"full_name":"Test User","organization_name":"Test organization","password":"Not-a-real-secret-123"}
    for i in range(5):
        response=client.post("/api/auth/register",json={**body,"email":f"qa{i}@example.invalid"})
        assert response.status_code==201
    response=client.post("/api/auth/register",json={**body,"email":"qa6@example.invalid"})
    assert response.status_code==429
    assert 1<=int(response.headers["retry-after"])<=900
    assert client.get("/api/health").status_code==200
