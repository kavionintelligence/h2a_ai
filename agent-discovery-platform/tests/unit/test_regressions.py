"""Regression coverage for independent boundary and temporal-integrity review."""

import secrets
import socket
from datetime import timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from agent_census.api import create_app
from agent_census.config import Settings
from agent_census.models import Candidate, Evidence, RuntimeEvent, utcnow
from agent_census.security import IntegrationError, SafeHTTP
from agent_census.service import CensusService
from agent_census.storage import Store


def settings(**kwargs):
    return Settings(admin_token=secrets.token_urlsafe(32), database_url="sqlite://", **kwargs)


def test_ipv4_mapped_link_local_is_denied_even_when_private_addresses_allowed(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *a, **kw: [
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::ffff:169.254.169.254", 80, 0, 0))
        ],
    )
    transport = SafeHTTP(
        settings(allowed_origins=("http://metadata.example",), allow_http=True, allow_private=True)
    )
    with pytest.raises(IntegrationError, match="Link-local"):
        transport.validate("http://metadata.example")


def test_host_block_override_uses_same_canonicalization_as_allowlist():
    transport = SafeHTTP(
        settings(allowed_origins=("https://example.org",), blocked_hosts=("EXAMPLE.ORG.",))
    )
    with pytest.raises(IntegrationError, match="blocked"):
        transport.validate("https://example.org")


def test_unsupported_sse_rejected_before_consuming_unending_body(monkeypatch):
    class NeverConsume(httpx.SyncByteStream):
        def __iter__(self):
            raise AssertionError("SSE body should not be read by a JSON-only client")
            yield b""  # pragma: no cover

    real_client = httpx.Client
    monkeypatch.setattr(
        httpx,
        "Client",
        lambda **kwargs: real_client(
            transport=httpx.MockTransport(
                lambda req: httpx.Response(
                    200, headers={"Content-Type": "text/event-stream"}, stream=NeverConsume()
                )
            ),
            **kwargs,
        ),
    )
    transport = SafeHTTP(
        settings(allowed_origins=("http://127.0.0.1",), allow_http=True, allow_private=True)
    )
    with pytest.raises(IntegrationError) as exc:
        transport.request("POST", "http://127.0.0.1", json={})
    assert exc.value.code == "unsupported_stream"


def test_conflicting_source_identity_update_cannot_orphan_previous_record():
    config = settings()
    store = Store(config.database_url)
    service = CensusService(store, config, SafeHTTP(config))
    candidate = Candidate(
        candidate_id="source-key",
        name="one",
        source="manual",
        namespace="team-a",
        endpoint="local://one",
    )
    with store.transaction() as conn:
        record = service._upsert(candidate, conn, "first")
    with pytest.raises(ValueError, match="source identity"):
        with store.transaction() as conn:
            service._upsert(candidate.model_copy(update={"namespace": "team-b"}), conn, "second")
    result = service.refresh("refresh")
    assert [r.agent_id for r in result["agents"]] == [record.agent_id]
    with store.transaction() as conn:
        assert store.observation_pairs(conn)[0][1].namespace == "team-a"


def test_stale_runtime_tools_and_declarations_do_not_gain_freshness_from_other_events():
    config = settings(event_window_seconds=60)
    store = Store(config.database_url)
    service = CensusService(store, config, SafeHTTP(config))
    now = utcnow()
    old = now - timedelta(minutes=5)
    stale_card = Candidate(
        candidate_id="card",
        name="one",
        source="a2a",
        endpoint="local://one",
        observed_at=old,
        skills=["code_security"],
        tools=["secret_scanner"],
        protocols=["a2a"],
        evidence=[Evidence(kind="agent_card", source="a2a", observed_at=old)],
    )
    runtime = Candidate(
        candidate_id="runtime",
        name="one",
        source="runtime",
        endpoint="local://one",
        observed_at=now,
        tools=["secret_scanner", "send_email"],
        evidence=[
            Evidence(kind="tool_call", source="trace", value="secret_scanner", observed_at=old),
            Evidence(kind="tool_call", source="trace", value="send_email", observed_at=now),
            Evidence(kind="llm_call", source="trace", value="model", observed_at=now),
            Evidence(kind="planning", source="trace", observed_at=now),
            Evidence(kind="memory_access", source="trace", observed_at=now),
        ],
    )
    with store.transaction() as conn:
        service._upsert(stale_card, conn, "card")
        record = service._upsert(runtime, conn, "runtime")
    assert record.classification.is_agent
    assert record.last_seen == now
    assert record.tools == ["send_email"]
    assert record.skills == [] and record.protocols == []
    assert "code_security" not in {c.name for c in record.capabilities}
    assert "email_delivery" in {c.name for c in record.capabilities}


def test_timezone_offset_event_survives_utc_retention_comparison():
    config = settings(event_window_seconds=3600)
    store = Store(config.database_url)
    service = CensusService(store, config, SafeHTTP(config))
    event = RuntimeEvent(
        service="offset-service",
        event_type="llm_call",
        timestamp=utcnow().astimezone(timezone(timedelta(hours=-8))),
    )
    result = service.ingest([event], "offset")
    assert result["accepted"] == 1
    assert len(result["agents"]) == 1
    assert [stored.event_id for stored in store.events()] == [event.event_id]


@pytest.mark.parametrize(
    "path",
    [
        "/capabilities",
        "/agents/{id}/capabilities",
        "/agents/{id}/evidence",
        "/agents/{id}/relationships",
    ],
)
def test_capability_evidence_and_relationship_reads_refresh_expired_projection(monkeypatch, path):
    config = settings(event_window_seconds=60)
    app = create_app(config)
    now = utcnow()
    candidate = Candidate(
        candidate_id="one",
        name="one",
        source="manual",
        skills=["code_security"],
        observed_at=now,
        evidence=[
            Evidence(kind="declared_skill", source="manual", value="code_security", observed_at=now)
        ],
    )
    with TestClient(app) as client:
        with app.state.store.transaction() as conn:
            record = app.state.service._upsert(candidate, conn, "create")
        assert record.capabilities
        monkeypatch.setattr("agent_census.service.utcnow", lambda: now + timedelta(minutes=5))
        response = client.get(
            path.format(id=record.agent_id),
            headers={"Authorization": "Bearer " + config.admin_token},
        )
        assert response.status_code == 200
        current = app.state.store.get(record.agent_id)
        assert current.capabilities == []
        assert current.skills == []
