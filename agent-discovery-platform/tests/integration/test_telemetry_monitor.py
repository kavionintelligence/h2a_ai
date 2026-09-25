import secrets
import time

from fastapi.testclient import TestClient

from agent_census.api import create_app
from agent_census.config import Settings
from agent_census.models import RuntimeEvent, utcnow


def test_otlp_json_endpoint_and_replay_build_behavior_without_payload_capture():
    config = Settings(database_url="sqlite://", admin_token=secrets.token_urlsafe(32))
    app = create_app(config)
    nanos = str(int(utcnow().timestamp() * 1_000_000_000))
    operations = ["chat", "execute_tool", "plan", "search_memory"]
    spans = [
        {
            "traceId": "a" * 32,
            "spanId": f"{index + 1:016x}",
            "name": "synthetic event",
            "startTimeUnixNano": nanos,
            "endTimeUnixNano": nanos,
            "attributes": [
                {"key": "gen_ai.operation.name", "value": {"stringValue": operation}},
                {"key": "gen_ai.tool.name", "value": {"stringValue": "secret_scanner"}},
                {"key": "gen_ai.request.model", "value": {"stringValue": "mock"}},
                {"key": "gen_ai.prompt", "value": {"stringValue": "NEVER STORE THIS"}},
            ],
        }
        for index, operation in enumerate(operations)
    ]
    payload = {
        "resourceSpans": [
            {
                "resource": {
                    "attributes": [{"key": "service.name", "value": {"stringValue": "otlp-shadow"}}]
                },
                "scopeSpans": [{"spans": spans}],
            }
        ]
    }
    with TestClient(app, headers={"Authorization": "Bearer " + config.admin_token}) as client:
        response = client.post("/v1/traces", json=payload)
        assert response.status_code == 200 and response.json() == {}
        assert response.headers["x-census-accepted"] == "4"
        assert client.post("/v1/traces", json=payload).headers["x-census-accepted"] == "0"
        records = client.get("/agents").json()
        assert len(records) == 1 and records[0]["shadow"]
        assert "NEVER STORE THIS" not in client.get("/events").text


def test_mcp_use_and_external_llm_search_require_direct_event_evidence():
    config = Settings(database_url="sqlite://", admin_token=secrets.token_urlsafe(32))
    app = create_app(config)
    with TestClient(app, headers={"Authorization": "Bearer " + config.admin_token}) as client:
        events = [
            RuntimeEvent(service="worker", event_type=kind)
            for kind in ["llm_call", "tool_call", "planning", "memory_access", "external_api_call"]
        ]
        client.post(
            "/events", json={"events": [e.model_dump(mode="json") for e in events]}
        ).raise_for_status()
        assert client.get("/agents/search", params={"q": "external LLM providers"}).json() == []
        assert client.get("/agents/search", params={"q": "agents using MCP"}).json() == []
        direct = [
            RuntimeEvent(
                service="worker",
                event_type="llm_call",
                metadata={"llm_provider": "synthetic-external", "llm_location": "external"},
            ),
            RuntimeEvent(
                service="worker",
                event_type="tool_call",
                tool="secret_scanner",
                metadata={"mcp_server": "https://tools.example/mcp"},
            ),
        ]
        client.post(
            "/events", json={"events": [e.model_dump(mode="json") for e in direct]}
        ).raise_for_status()
        assert len(client.get("/agents/search", params={"q": "external LLM providers"}).json()) == 1
        using = client.get("/agents/search", params={"q": "agents using MCP"}).json()
        assert len(using) == 1
        record = using[0]["agent"]
        graph = client.get("/graph/agent/" + record["agent_id"]).json()
        assert any(
            edge["target_type"] == "MCPServer" and edge["target"] == "https://tools.example/mcp"
            for edge in graph["edges"]
        )


def test_background_monitor_runs_without_user_polling():
    config = Settings(
        database_url="sqlite://", admin_token=secrets.token_urlsafe(32), monitor_interval_seconds=1
    )
    app = create_app(config)
    with TestClient(app):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            if any(row["action"] == "HEALTH_SCAN" for row in app.state.store.audits()):
                break
            time.sleep(0.05)
        else:
            raise AssertionError("background monitor did not perform a health sweep")
