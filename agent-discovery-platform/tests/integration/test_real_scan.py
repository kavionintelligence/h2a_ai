"""Explicit offline fixtures verify real HTTP collectors, never production scan data."""

import json
import secrets
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import pytest
from fastapi.testclient import TestClient

from agent_census.config import Settings
from agent_census.governance_bridge import create_bridge
from agent_census.models import Candidate, Evidence, RuntimeEvent, utcnow


@pytest.fixture
def protocol_source():
    requests = []
    behavior = {"fail": False}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def reply(self, data, status=200):
            payload = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            requests.append(("GET", self.path))
            if behavior["fail"] or self.path == "/failed":
                self.reply({"error": "test source unavailable"}, 503)
            elif self.path == "/card":
                self.reply({
                    "name": "Explicit test research agent", "description": "Test fixture",
                    "version": "1.0", "protocolVersion": "0.3.0", "url": base + "/agent",
                    "provider": {"organization": "Fixture Provider"}, "capabilities": {},
                    "defaultInputModes": ["text"], "defaultOutputModes": ["text"],
                    "skills": [{"id": "research", "name": "research",
                                "description": "Test research", "tags": ["research"]}],
                })
            else:
                self.reply({"entries": [{"id": "test-api", "name": "Explicit test service",
                                         "endpoint": base + "/service", "entity_hint": "api"}]})

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            method = body["method"]
            requests.append(("POST", method))
            if method == "initialize":
                result = {"protocolVersion": "2025-11-25", "capabilities": {"tools": {}},
                          "serverInfo": {"name": "Explicit test MCP", "version": "1.0"}}
            elif method == "tools/list":
                result = {"tools": [{"name": "search", "description": "Fixture tool",
                                     "inputSchema": {"type": "object"}}]}
            elif method == "notifications/initialized":
                self.reply({})
                return
            else:
                self.reply({"error": "Execution is forbidden in discovery tests"}, 400)
                return
            self.reply({"jsonrpc": "2.0", "id": body["id"], "result": result})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    base = f"http://127.0.0.1:{server.server_port}"
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield base, requests, behavior
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_scan_invokes_existing_a2a_mcp_and_api_collectors_and_keeps_identity(tmp_path, protocol_source):
    base, calls, _ = protocol_source
    token = secrets.token_urlsafe(32)
    settings = Settings(
        admin_token=token, allowed_origins=(base,), allow_private=True, allow_http=True,
        discovery_sources={"a2a": [{"url": base + "/card"}], "mcp": [{"url": base + "/mcp"}],
                           "api_registry": [{"url": base + "/registry"}]},
    )
    app = create_bridge(tmp_path, token, settings=settings)
    headers = {"Authorization": f"Bearer {token}"}
    with TestClient(app, headers=headers) as client:
        assert client.get("/agents").json() == [] and calls == []
        first = client.post("/agents/scan").json()
        assert first["errors"] == []
        assert first["configured_source_count"] == 3
        assert len(first["agents"]) == len(first["observed_agent_ids"]) == 3
        assert {("GET", "/card"), ("GET", "/registry"), ("POST", "initialize"),
                ("POST", "tools/list")}.issubset(calls)
        assert all(method != "tools/call" for _, method in calls)
        declared = next(a for a in first["agents"] if "a2a" in a["protocols"])
        # The existing Census classifier does not mistake a declaration for behavior.
        assert not declared["classification"]["is_agent"]
        evidence = [RuntimeEvent(
            event_id=f"explicit-test-{kind}", service="Explicit test research agent",
            source="explicit_offline_test", endpoint=base + "/agent", event_type=kind,
            model="fixture-model" if kind == "llm_call" else None,
            tool="search" if kind == "tool_call" else None,
            metadata={"framework": "CrewAI", "llm_provider": "Fixture Provider"},
        ).model_dump(mode="json") for kind in ("llm_call", "tool_call", "planning", "memory_access")]
        assert client.post("/events", json={"events": evidence}).status_code == 200
        second = client.post("/agents/scan").json()
        assert second["scan_id"] != first["scan_id"]
        assert {a["agent_id"] for a in second["agents"]} == set(first["observed_agent_ids"])
        agent = next(a for a in second["agents"] if a["agent_id"] == declared["agent_id"])
        assert agent["classification"]["is_agent"] and agent["shadow"] and not agent["registered"]
        assert agent["fingerprint"]["identity"] == declared["fingerprint"]["identity"]
        assert agent["framework"] == "CrewAI" and agent["model"] == "fixture-model"
        assert agent["first_seen"] == declared["first_seen"]
        assert len(agent["evidence"]) >= 7 and len(agent["identity_decisions"]) >= 3
        assert any(item["details"]["shadow"] for item in agent["discovery_history"])
        assert agent["discovery_history"] == client.get(
            f"/agents/{agent['agent_id']}/history"
        ).json()
        assert len(client.get("/agents").json()) == 3
    reopened = create_bridge(tmp_path, token, settings=settings)
    with TestClient(reopened, headers=headers) as client:
        persisted = client.get(f"/agents/{agent['agent_id']}").json()
        assert persisted["evidence"] == agent["evidence"]
        assert persisted["fingerprint"] == agent["fingerprint"]


def test_partial_scan_keeps_results_and_names_failed_source(tmp_path, protocol_source):
    base, _, _ = protocol_source
    token = secrets.token_urlsafe(32)
    app = create_bridge(tmp_path, token, settings=Settings(
        admin_token=token, allowed_origins=(base,), allow_private=True, allow_http=True,
        discovery_sources={"a2a": [{"url": base + "/card"}],
                           "api_registry": [{"url": base + "/failed"}]},
    ))
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as client:
        result = client.post("/agents/scan").json()
        assert len(result["agents"]) == 1
        assert result["errors"][0]["source"] == "api_registry"
        assert result["errors"][0]["code"] == "upstream_http_error"
        assert result["observed_agent_ids"] == [result["agents"][0]["agent_id"]]


def test_stale_shadow_inventory_and_original_evidence_survive_failed_fresh_scan(tmp_path, protocol_source):
    base, _, _ = protocol_source
    token = secrets.token_urlsafe(32)
    app = create_bridge(tmp_path, token, settings=Settings(
        admin_token=token, allowed_origins=(base,), allow_private=True, allow_http=True,
        discovery_sources={"a2a": [{"url": base + "/failed"}]},
    ))
    old = utcnow() - timedelta(days=3)
    candidate = Candidate(
        candidate_id="explicit-stale-test", name="Explicit stale test agent", source="runtime",
        endpoint=base + "/agent", observed_at=old,
        evidence=[Evidence(kind=kind, source="explicit_offline_test", observed_at=old)
                  for kind in ("llm_call", "tool_call", "planning", "memory_access")],
    )
    with app.state.store.transaction() as conn:
        original = app.state.service._upsert(candidate, conn, "explicit-test")
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as client:
        result = client.post("/agents/scan").json()
        assert len(result["agents"]) == 1 and result["observed_agent_ids"] == []
        agent = result["agents"][0]
        assert agent["agent_id"] == original.agent_id
        assert agent["activity_status"] == "stale" and agent["shadow"]
        assert agent["evidence_age_seconds"] >= 3 * 86400
        assert agent["evidence"] == original.model_dump(mode="json")["evidence"]
        assert agent["first_seen"] == agent["last_seen"] == old.isoformat().replace("+00:00", "Z")
