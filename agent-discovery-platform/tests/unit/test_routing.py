from datetime import timedelta

import pytest

from agent_census.models import (
    AgentFingerprint,
    AgentRecord,
    Classification,
    Evidence,
    TaskRequest,
    utcnow,
)
from agent_census.routing import Router
from agent_census.security import IntegrationError


class StubTransport:
    def __init__(self, responder=None):
        self.calls = []
        self.responder = responder

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        return self.responder(method, url, kwargs) if self.responder else {"answer": "ok"}


def target(**updates):
    now = utcnow()
    record = AgentRecord(
        agent_id="agent1",
        name="Test agent",
        endpoint="https://agent.example/run",
        protocols=["http"],
        trust_status="approved",
        health_status="healthy",
        health_checked_at=now,
        discovery_sources=["manual"],
        first_seen=now,
        last_seen=now,
        confidence=0.8,
        evidence=[],
        fingerprint=AgentFingerprint(identity="agent1", first_seen=now, last_seen=now),
        classification=Classification(
            is_agent=True,
            confidence=0.8,
            classification="probable_agent",
            entity_type="agent",
            evidence=[],
            reasons=["runtime evidence"],
        ),
    )
    return record.model_copy(update=updates)


@pytest.mark.parametrize(
    "update,code",
    [
        ({"trust_status": "unverified"}, "untrusted_target"),
        ({"health_status": "unknown"}, "unhealthy_target"),
        ({"health_checked_at": utcnow() - timedelta(minutes=10)}, "unhealthy_target"),
        ({"last_seen": utcnow() - timedelta(days=1)}, "stale_target"),
        ({"auth_type": "declared"}, "authentication_not_configured"),
        ({"endpoint": None}, "missing_endpoint"),
    ],
)
def test_routing_fail_closed_before_network(update, code):
    transport = StubTransport()
    with pytest.raises(IntegrationError) as exc:
        Router(transport).route(target(**update), TaskRequest(task="Analyze"))
    assert exc.value.code == code
    assert not transport.calls


def test_non_agent_cannot_be_routed_even_if_trusted():
    transport = StubTransport()
    record = target()
    record.classification.is_agent = False
    with pytest.raises(IntegrationError, match="agent classification"):
        Router(transport).route(record, TaskRequest(task="Analyze"))
    assert not transport.calls


def test_http_execution_has_no_retries_and_does_not_claim_task_completion():
    transport = StubTransport()
    result = Router(transport).route(target(), TaskRequest(task="Analyze", arguments={"alert": 1}))
    assert result["status"] == "dispatched"
    assert transport.calls[0][2]["retry"] is False
    assert transport.calls[0][2]["json"] == {"task": "Analyze", "arguments": {"alert": 1}}


def test_a2a_modern_card_is_discoverable_but_not_executable():
    record = target(
        protocols=["a2a"],
        evidence=[
            Evidence(kind="protocol_version", source="a2a", value="1.0"),
            Evidence(kind="protocol_binding", source="a2a", value="JSONRPC"),
        ],
    )
    transport = StubTransport()
    with pytest.raises(IntegrationError) as exc:
        Router(transport).route(record, TaskRequest(task="Analyze"))
    assert exc.value.code == "unsupported_protocol"
    assert not transport.calls


def test_a2a_legacy_dispatch_uses_matching_jsonrpc_envelope():
    record = target(
        protocols=["a2a"],
        evidence=[
            Evidence(kind="protocol_version", source="a2a", value="0.3.0"),
            Evidence(kind="protocol_binding", source="a2a", value="JSONRPC"),
        ],
    )
    transport = StubTransport(
        lambda method, url, kwargs: {
            "jsonrpc": "2.0",
            "id": kwargs["json"]["id"],
            "result": {"kind": "task", "id": "t1", "status": {"state": "working"}},
        }
    )
    result = Router(transport).route(record, TaskRequest(task="Analyze"))
    assert transport.calls[0][2]["json"]["method"] == "message/send"
    assert result["status"] == "dispatched"


def test_mcp_requires_explicit_tool_and_rechecks_live_inventory():
    record = target(
        protocols=["mcp"],
        tools=["lookup"],
        evidence=[Evidence(kind="protocol_version", source="mcp", value="2025-11-25")],
    )

    def respond(method, url, kwargs):
        request = kwargs["json"]
        rpc = request["method"]
        if rpc == "notifications/initialized":
            return {}
        result = {
            "protocolVersion": "2025-11-25",
            "serverInfo": {"name": "tools", "version": "1"},
            "capabilities": {"tools": {}},
        }
        if rpc == "tools/list":
            result = {"tools": []}
        return {"jsonrpc": "2.0", "id": request["id"], "result": result}

    transport = StubTransport(respond)
    router = Router(transport)
    with pytest.raises(IntegrationError) as exc:
        router.route(record, TaskRequest(task="Analyze"))
    assert exc.value.code == "tool_required"
    assert not transport.calls
    with pytest.raises(IntegrationError) as exc:
        router.route(record, TaskRequest(task="Analyze", tool="lookup"))
    assert exc.value.code == "tool_unavailable"
    assert all(call[2]["json"]["method"] != "tools/call" for call in transport.calls)


def test_local_routing_only_calls_explicit_application_registration():
    router = Router(StubTransport())
    record = target(endpoint="local://echo", protocols=["local"])
    with pytest.raises(IntegrationError) as exc:
        router.route(record, TaskRequest(task="hello"))
    assert exc.value.code == "unregistered_callable"
    router.register_local("echo", lambda req: {"echo": req.task})
    assert router.route(record, TaskRequest(task="hello"))["result"] == {"echo": "hello"}


def test_mcp_tool_error_is_not_reported_as_success():
    record = target(
        protocols=["mcp"],
        tools=["lookup"],
        evidence=[Evidence(kind="protocol_version", source="mcp", value="2025-11-25")],
    )

    def respond(method, url, kwargs):
        payload = kwargs["json"]
        if payload["method"] == "notifications/initialized":
            return {}
        if payload["method"] == "initialize":
            result = {
                "protocolVersion": "2025-11-25",
                "serverInfo": {"name": "tools", "version": "1"},
                "capabilities": {"tools": {}},
            }
        elif payload["method"] == "tools/list":
            result = {"tools": [{"name": "lookup", "inputSchema": {"type": "object"}}]}
        else:
            result = {"isError": True, "content": [{"type": "text", "text": "Tool failed"}]}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": result}

    transport = StubTransport(respond)
    result = Router(transport).route(record, TaskRequest(task="Lookup", tool="lookup"))
    assert result["status"] == "tool_error"
    assert sum(call[2]["json"]["method"] == "tools/call" for call in transport.calls) == 1
