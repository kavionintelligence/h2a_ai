import secrets
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from agent_census.api import create_app
from agent_census.config import Settings
from agent_census.models import Candidate, Evidence, RuntimeEvent, utcnow


@pytest.fixture
def system():
    s = Settings(
        database_url="sqlite://",
        admin_token=secrets.token_urlsafe(32),
        reader_token=secrets.token_urlsafe(32),
        ingest_token=secrets.token_urlsafe(32),
    )
    app = create_app(s)
    with TestClient(app) as client:
        yield app, client, s


def headers(s, role="admin"):
    return {"Authorization": "Bearer " + getattr(s, role + "_token")}


def test_auth_roles_and_validation_do_not_echo_secrets(system):
    app, client, s = system
    assert client.get("/health").status_code == 200
    assert client.get("/agents").status_code == 401
    assert client.post("/agents/register", headers=headers(s, "reader"), json={}).status_code == 403
    assert client.get("/agents", headers=headers(s, "ingest")).status_code == 403
    res = client.post(
        "/events",
        headers=headers(s, "ingest"),
        json={"events": [{"service": "demo", "event_type": s.admin_token}]},
    )
    assert res.status_code == 422
    assert s.admin_token not in res.text
    assert client.get("/audit", headers=headers(s, "reader")).status_code == 403


def test_crud_registration_not_classification_and_cleanup(system):
    app, client, s = system
    candidate = Candidate(
        candidate_id="one",
        name="Normal API",
        source="manual",
        endpoint="local://demo",
        entity_hint="api",
        skills=["send_email"],
    )
    created = client.post(
        "/agents/register", headers=headers(s), json=candidate.model_dump(mode="json")
    ).json()
    assert created["registered"] and not created["classification"]["is_agent"]
    aid = created["agent_id"]
    assert client.get("/agents/" + aid, headers=headers(s)).status_code == 200
    assert client.get("/graph/agent/" + aid, headers=headers(s)).json()["nodes"]
    match = client.post("/tasks/match", headers=headers(s), json={"task": "send email"}).json()
    assert not match["matches"]
    assert client.delete("/agents/" + aid, headers=headers(s, "reader")).status_code == 403
    assert client.delete("/agents/" + aid, headers=headers(s)).status_code == 200
    with app.state.store.transaction() as conn:
        assert app.state.store.observation_pairs(conn) == []
    assert client.get("/agents/" + aid, headers=headers(s)).status_code == 404
    assert app.state.store.audits()


def test_event_idempotency_window_and_untrusted_telemetry(system):
    app, client, s = system
    event = RuntimeEvent(
        event_id="evt-1",
        service="wrapper",
        event_type="llm_call",
        metadata={"prompt": "do not store", "api_key": s.admin_token},
    )
    body = {"events": [event.model_dump(mode="json")]}
    assert client.post("/events", headers=headers(s, "ingest"), json=body).json()["accepted"] == 1
    assert client.post("/events", headers=headers(s, "ingest"), json=body).json()["accepted"] == 0
    stored = client.get("/events", headers=headers(s)).json()
    assert stored[0]["metadata"] == {}
    records = client.get("/agents", headers=headers(s)).json()
    assert len(records) == 1 and not records[0]["classification"]["is_agent"]
    assert not records[0]["registered"] and records[0]["trust_status"] == "unverified"
    stale = event.model_copy(
        update={"event_id": "stale", "timestamp": utcnow() - timedelta(days=1)}
    )
    assert (
        client.post(
            "/events", headers=headers(s), json={"events": [stale.model_dump(mode="json")]}
        ).status_code
        == 422
    )
    future = event.model_copy(
        update={"event_id": "future", "timestamp": utcnow() + timedelta(days=1)}
    )
    assert (
        client.post(
            "/events", headers=headers(s), json={"events": [future.model_dump(mode="json")]}
        ).status_code
        == 422
    )


def test_behavior_expiration_keeps_agent_identity_visible_but_marks_it_stale(system):
    app, client, s = system
    service = app.state.service
    old = utcnow() - timedelta(seconds=s.event_window_seconds + 10)
    behavior = ["llm_call", "tool_call", "planning", "memory_access"]
    candidate = Candidate(
        candidate_id="old",
        name="old shadow",
        source="runtime",
        service="old",
        observed_at=old,
        evidence=[Evidence(kind=k, source="trace", value="x", observed_at=old) for k in behavior],
    )
    with app.state.store.transaction() as conn:
        record = service._upsert(candidate, conn, "test")
    assert record.classification.is_agent
    assert record.shadow
    assert record.health_status == "stale"
    assert record.activity_status == "stale"
    assert record.evidence_age_seconds >= s.event_window_seconds
    assert record.last_seen == old


def test_recent_runtime_evidence_remains_active(system):
    app, _, _ = system
    now = utcnow()
    candidate = Candidate(
        candidate_id="recent-agent",
        name="recent runtime agent",
        source="runtime",
        observed_at=now,
        evidence=[
            Evidence(kind=kind, source="opentelemetry", value="recent", observed_at=now)
            for kind in ("llm_call", "tool_call", "planning", "memory_access")
        ],
    )
    with app.state.store.transaction() as conn:
        record = app.state.service._upsert(candidate, conn, "test")
    assert record.classification.is_agent
    assert record.activity_status == "active"
    assert record.evidence_age_seconds < 60


def test_registration_resolves_existing_shadow_and_preserves_first_seen(system):
    app, client, s = system
    now = utcnow()
    batch = [
        RuntimeEvent(
            service="hidden",
            namespace="runtime-namespace",
            endpoint="local://hidden",
            event_type=k,
            tool="secret_scanner" if k == "tool_call" else None,
            timestamp=now,
        )
        for k in ["llm_call", "tool_call", "planning", "memory_access"]
    ]
    result = client.post(
        "/events", headers=headers(s), json={"events": [e.model_dump(mode="json") for e in batch]}
    ).json()
    prior = result["agents"][0]
    assert prior["shadow"]
    prior_event_ids = {item["event_id"] for item in prior["evidence"] if item["event_id"]}
    registered = client.post(
        "/agents/register",
        headers=headers(s),
        json=Candidate(
            candidate_id=f"dashboard-{prior['agent_id']}",
            name="hidden",
            source="manual",
            endpoint="local://hidden",
            service="hidden",
        ).model_dump(mode="json"),
    ).json()
    assert registered["agent_id"] == prior["agent_id"]
    assert registered["registered"] and not registered["shadow"]
    assert registered["first_seen"] == prior["first_seen"]
    registered_event_ids = {item["event_id"] for item in registered["evidence"] if item["event_id"]}
    assert prior_event_ids <= registered_event_ids
    assert any(item["kind"] == "manual_registration" for item in registered["evidence"])
    assert any(decision["merged"] for decision in registered["identity_decisions"])
    assert client.get("/reports/shadow-agents", headers=headers(s)).json() == []


def test_dashboard_is_light_and_uses_existing_scan_and_register_apis(system):
    _, client, s = system
    response = client.get("/")
    assert response.status_code == 200
    assert 'name="color-scheme" content="light"' in response.text
    assert 'id="scan"' in response.text and "api('/dashboard/api/scan'" in response.text
    assert "api(`/dashboard/api/agents/" in response.text
    assert 'id="token"' not in response.text and 'id="connect"' not in response.text
    assert "Authorization:" not in response.text
    assert "scanErrors" not in response.text
    assert "Scan failed. Check the local Census service and discovery configuration" in response.text
    assert 'id="total">0<' in response.text and 'id="agents">0<' in response.text
    assert "Click Scan to discover agents and services." in response.text
    assert "loadRegistry().catch" not in response.text
    assert "isScanning = true" in response.text and "if (isScanning) return" in response.text
    assert s.admin_token not in response.text


def test_loopback_dashboard_scan_and_register_preserve_runtime_history():
    settings = Settings(database_url="sqlite://", admin_token=secrets.token_urlsafe(32))
    app = create_app(settings)
    with TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 12345)) as client:
        origin = {"Origin": "http://127.0.0.1"}
        events = [
            RuntimeEvent(
                service="dashboard-shadow",
                endpoint="http://127.0.0.1:8766/agent",
                event_type=kind,
                tool="lookup" if kind == "tool_call" else None,
            )
            for kind in ("llm_call", "tool_call", "planning", "memory_access")
        ]
        accepted = client.post(
            "/events",
            headers=headers(settings),
            json={"events": [event.model_dump(mode="json") for event in events]},
        )
        assert accepted.status_code == 200
        assert client.get("/dashboard/api/agents").status_code == 200
        assert client.post("/dashboard/api/scan", headers={"Origin": "https://evil.example"}).status_code == 403
        scanned = client.post("/dashboard/api/scan", headers=origin)
        assert scanned.status_code == 200
        shadow = next(record for record in scanned.json()["agents"] if record["name"] == "dashboard-shadow")
        assert shadow["classification"]["is_agent"] and shadow["shadow"] and not shadow["registered"]
        original_events = {item["event_id"] for item in shadow["evidence"] if item["event_id"]}
        registered = client.post(
            f"/dashboard/api/agents/{shadow['agent_id']}/register", headers=origin
        )
        assert registered.status_code == 200
        result = registered.json()
        assert result["agent_id"] == shadow["agent_id"] and result["registered"] and not result["shadow"]
        assert original_events <= {item["event_id"] for item in result["evidence"] if item["event_id"]}
        refreshed = client.get("/dashboard/api/agents").json()
        assert next(record for record in refreshed if record["agent_id"] == shadow["agent_id"])["registered"]
    app.state.store.engine.dispose()


def test_dashboard_api_rejects_remote_clients():
    app = create_app(Settings(database_url="sqlite://", admin_token=secrets.token_urlsafe(32)))
    with TestClient(app, base_url="http://127.0.0.1", client=("192.0.2.10", 12345)) as client:
        assert client.get("/dashboard/api/agents").status_code == 403
        assert (
            client.post(
                "/dashboard/api/scan", headers={"Origin": "http://127.0.0.1"}
            ).status_code
            == 403
        )
    app.state.store.engine.dispose()


def test_body_limit_and_correlation_id(system):
    _, client, s = system
    response = client.post(
        "/events", headers={**headers(s), "x-correlation-id": "batch-123"}, json={"events": []}
    )
    assert response.headers["x-correlation-id"] == "batch-123"
    assert (
        client.post(
            "/events", headers=headers(s), content=b"x" * (s.max_body_bytes + 1)
        ).status_code
        == 413
    )
