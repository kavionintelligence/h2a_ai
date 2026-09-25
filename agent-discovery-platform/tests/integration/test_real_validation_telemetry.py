"""Transport regressions for the live runner; these are not live-provider evidence."""

import json
import secrets

import pytest
from fastapi.testclient import TestClient
from opentelemetry.trace import Status, StatusCode

from agent_census.api import create_app
from agent_census.config import Settings
from agent_census.detection import parse_otlp, runtime_candidates
from agent_census.models import RuntimeEvent
from scripts.real_validation_telemetry import make_tracer


def test_sdk_export_keeps_identity_and_tool_provenance_without_capturing_payloads(tmp_path):
    config = Settings(database_url="sqlite://", admin_token=secrets.token_urlsafe(32))
    app = create_app(config)
    endpoint = "http://127.0.0.1:9101/a2a"
    provider, tracer, exporter = make_tracer(
        "sdk-worker", endpoint, "http://census.test", config.admin_token, tmp_path
    )
    with TestClient(app, headers={"Authorization": "Bearer " + config.admin_token}) as client:
        exporter._client.close()
        exporter._client = client
        registered = client.post(
            "/agents/register",
            json={
                "candidate_id": "sdk-worker",
                "name": "SDK worker",
                "source": "manual",
                "endpoint": endpoint,
            },
        ).json()
        with tracer.start_as_current_span("agent.run") as execution:
            with tracer.start_as_current_span("openai.responses") as call:
                call.set_attribute("gen_ai.operation.name", "chat")
                call.set_attribute("gen_ai.request.model", "test-model")
                call.set_attribute("gen_ai.provider.name", "openai")
                call.set_attribute("agent_census.llm_location", "external")
                call.set_attribute("gen_ai.input.messages", "PRIVATE_PROMPT")
                call.set_attribute("authorization", "Bearer PRIVATE_KEY")
                call.add_event("exception", {"exception.message": "PRIVATE_EXCEPTION"})
            with tracer.start_as_current_span("mcp.tools.call") as tool:
                tool.set_attribute("gen_ai.operation.name", "execute_tool")
                tool.set_attribute("gen_ai.tool.name", "repository_analysis")
                tool.set_attribute("agent_census.mcp_server", "http://127.0.0.1:9102/mcp")
                tool.set_attribute("gen_ai.tool.call.arguments", "PRIVATE_ARGUMENTS")
            execution.add_event("agent_census.autonomous_action")
            execution.add_event("agent_census.multi_step")
            trace_id = f"{execution.get_span_context().trace_id:032x}"
        assert provider.force_flush()
        assert exporter.accepted == 4 and exporter.failures == 0
        records = client.get("/agents").json()
        assert len(records) == 1
        record = records[0]
        assert record["agent_id"] == registered["agent_id"]
        assert record["provider"] == "openai"
        assert record["framework"] == "custom-openai-responses"
        assert record["endpoint"] == endpoint
        assert record["classification"]["is_agent"] is True
        assert record["fingerprint"]["mcp_connections"] == ["http://127.0.0.1:9102/mcp"]
        assert any(
            evidence["signal"] == "same_endpoint"
            for decision in record["identity_decisions"]
            for evidence in decision["evidence"]
        )
        assert len(client.get("/agents/search", params={"q": "external LLM providers"}).json()) == 1
        assert len(client.get("/agents/search", params={"q": "agents using MCP"}).json()) == 1
        events = client.get("/events").json()
        assert {event["trace_id"] for event in events} == {trace_id}
        assert all(event["event_id"].startswith(f"otlp:{trace_id}:") for event in events)
        saved = "\n".join(path.read_text() for path in tmp_path.rglob("*.json"))
        for private in (
            "PRIVATE_PROMPT",
            "PRIVATE_KEY",
            "PRIVATE_ARGUMENTS",
            "PRIVATE_EXCEPTION",
            config.admin_token,
        ):
            assert private not in saved + json.dumps(events)
        for receipt in exporter.receipts:
            payload = json.loads((exporter.output_dir / receipt["batch"]).read_text())
            assert len(parse_otlp(payload)) == receipt["accepted"]
        provider.shutdown()


def test_failed_sdk_operations_and_ordinary_http_spans_do_not_claim_agent_behavior(tmp_path):
    config = Settings(database_url="sqlite://", admin_token=secrets.token_urlsafe(32))
    provider, tracer, exporter = make_tracer(
        "sdk-failures", "http://127.0.0.1:9103", "http://census.test", config.admin_token, tmp_path
    )
    with TestClient(
        create_app(config), headers={"Authorization": "Bearer " + config.admin_token}
    ) as client:
        exporter._client.close()
        exporter._client = client
        for operation in ("chat", "execute_tool"):
            with tracer.start_as_current_span("failed.operation") as span:
                span.set_attribute("gen_ai.operation.name", operation)
                span.set_attribute("gen_ai.tool.name", "repository_analysis")
                span.set_status(Status(StatusCode.ERROR, "PRIVATE_FAILURE"))
                span.add_event("agent_census.autonomous_action")
        with tracer.start_as_current_span("http.request") as span:
            span.set_attribute("http.request.method", "GET")
        assert provider.force_flush()
        assert exporter.accepted == 0 and exporter.failures == 0
        assert client.get("/events").json() == []
        assert client.get("/agents").json() == []
        assert "PRIVATE_FAILURE" not in "\n".join(
            path.read_text() for path in tmp_path.rglob("*.json")
        )
        provider.shutdown()


def test_runtime_provider_and_framework_conflicts_remain_unknown():
    events = [
        RuntimeEvent(
            service="shared-workload",
            event_type="llm_call",
            metadata={"gen_ai.provider.name": provider, "framework": framework},
        )
        for provider, framework in [("provider-a", "framework-a"), ("provider-b", "framework-b")]
    ]
    candidate = runtime_candidates(events)[0]
    assert candidate.provider is None
    assert candidate.framework is None
    assert {e.value for e in candidate.evidence if e.kind == "llm_provider"} == {
        "provider-a",
        "provider-b",
    }


@pytest.mark.parametrize("attribute", ["agent_census.endpoint", "agent_census.mcp_server"])
def test_otlp_connection_extensions_reject_embedded_credentials(attribute):
    def attr(key, value):
        return {"key": key, "value": {"stringValue": value}}

    payload = {
        "resourceSpans": [
            {
                "resource": {"attributes": [attr("service.name", "invalid-connection")]},
                "scopeSpans": [
                    {
                        "spans": [
                            {
                                "traceId": "a" * 32,
                                "spanId": "b" * 16,
                                "startTimeUnixNano": "1577836800000000000",
                                "attributes": [
                                    attr("gen_ai.operation.name", "execute_tool"),
                                    attr(attribute, "http://user:credential@127.0.0.1:9102/mcp"),
                                ],
                            }
                        ]
                    }
                ],
            }
        ],
    }
    with pytest.raises(ValueError, match="credentials"):
        parse_otlp(payload)
