"""Protocol boundaries and failure isolation, without network access."""

from agent_census.discovery import ADAPTERS, run_adapters


class StubTransport:
    def __init__(self, responder=None):
        self.calls = []
        self.responder = responder

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        if self.responder is None:
            raise AssertionError("Unexpected network access")
        return self.responder(method, url, kwargs)


def card(**changes):
    result = {
        "name": "Analyst",
        "description": "Analyzes security alerts",
        "version": "1.2",
        "url": "https://agent.example/a2a",
        "protocolVersion": "0.3.0",
        "capabilities": {},
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "skills": [
            {
                "id": "security",
                "name": "security analysis",
                "description": "Analyze alerts",
                "tags": ["security"],
            }
        ],
    }
    result.update(changes)
    return result


def test_a2a_import_handles_both_versions_and_never_executes():
    modern = card(
        supportedInterfaces=[
            {
                "url": "https://modern.example/a2a",
                "protocolBinding": "HTTP+JSON",
                "protocolVersion": "1.0",
            }
        ],
        signatures=[{"signature": "untrusted"}],
    )
    transport = StubTransport()
    result = ADAPTERS["a2a"].discover([{"card": card()}, {"card": modern}], transport)
    assert not result.errors
    assert [c.endpoint for c in result.candidates] == [
        "https://agent.example/a2a",
        "https://modern.example/a2a",
    ]
    assert result.candidates[1].metadata["signature_verified"] is False
    assert any(
        e.kind == "protocol_version" and e.value == "1.0" for e in result.candidates[1].evidence
    )
    assert transport.calls == []


def test_malformed_item_does_not_hide_valid_sources_or_items():
    result = run_adapters(
        {
            "a2a": [{"card": {}}, {"card": card()}],
            "unknown": [{}],
            "manual": [{"name": "Candidate"}],
        },
        StubTransport(),
    )
    assert {c.name for c in result.candidates} == {"Analyst", "Candidate"}
    assert {e["code"] for e in result.errors} == {"invalid_inventory", "unknown_source"}


def test_mcp_handshake_paginated_inventory_without_tool_execution():
    def respond(method, url, kwargs):
        payload = kwargs["json"]
        name = payload["method"]
        if name == "notifications/initialized":
            return {}
        result = {
            "protocolVersion": "2025-11-25",
            "serverInfo": {"name": "tools", "version": "1"},
            "capabilities": {"tools": {}},
        }
        if name == "tools/list":
            result = {
                "tools": [{"name": "lookup", "inputSchema": {"type": "object"}}],
                "nextCursor": "page2",
            }
            if payload["params"].get("cursor"):
                result = {"tools": [{"name": "summarize", "inputSchema": {"type": "object"}}]}
        return {"jsonrpc": "2.0", "id": payload["id"], "result": result}

    transport = StubTransport(respond)
    result = ADAPTERS["mcp"].discover([{"url": "https://tools.example/mcp"}], transport)
    assert not result.errors
    assert result.candidates[0].tools == ["lookup", "summarize"]
    assert result.candidates[0].entity_hint == "mcp_server"
    assert [call[2]["json"]["method"] for call in transport.calls] == [
        "initialize",
        "notifications/initialized",
        "tools/list",
        "tools/list",
    ]


def test_mcp_negotiation_rejects_unimplemented_modern_version():
    transport = StubTransport(
        lambda method, url, kwargs: {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"protocolVersion": "2026-07-28"},
        }
    )
    result = ADAPTERS["mcp"].discover([{"url": "https://tools.example/mcp"}], transport)
    assert result.errors[0]["code"] == "unsupported_protocol"
    assert len(transport.calls) == 1


def test_inventory_excludes_secrets_commands_and_untrusted_registration():
    result = run_adapters(
        {
            "kubernetes": [
                {
                    "items": [
                        {
                            "kind": "Pod",
                            "metadata": {"name": "worker", "uid": "uid1"},
                            "spec": {
                                "serviceAccountName": "worker-sa",
                                "containers": [
                                    {"env": [{"name": "TOKEN", "value": "secret-value"}]}
                                ],
                            },
                        }
                    ]
                }
            ],
            "local_process": [
                {
                    "name": "worker",
                    "cmdline": "--token secret-value",
                    "environment_variables": {"TOKEN": "secret-value"},
                }
            ],
            "manual": [
                {
                    "name": "claimed",
                    "registration_id": "admin",
                    "trust_status": "approved",
                    "metadata": {"token": "secret-value"},
                }
            ],
            "git": [{"path": "C:/secret.txt", "manifest": {"name": "bad"}}],
        },
        StubTransport(),
    )
    assert len(result.candidates) == 3
    assert "secret-value" not in result.model_dump_json()
    assert all(c.registration_id is None for c in result.candidates)
    assert result.errors[0]["code"] == "unsafe_source"


def test_nested_kubernetes_bad_object_does_not_abort_following_objects():
    result = ADAPTERS["kubernetes"].discover(
        [
            {
                "items": [
                    {"kind": "Secret", "metadata": {"name": "bad"}},
                    {"kind": "Service", "metadata": {"name": "good"}},
                ]
            }
        ],
        StubTransport(),
    )
    assert len(result.errors) == 1
    assert [c.name for c in result.candidates] == ["good"]


def test_live_kubernetes_gets_only_explicit_safe_namespaced_resources():
    transport = StubTransport(
        lambda method, url, kwargs: {
            "items": [{"metadata": {"name": "service-one", "namespace": "team"}}]
        }
    )
    result = ADAPTERS["kubernetes"].discover(
        [{"api_url": "https://cluster.example", "namespace": "team", "kinds": ["Service"]}],
        transport,
    )
    assert not result.errors
    assert transport.calls[0][:2] == (
        "GET",
        "https://cluster.example/api/v1/namespaces/team/services",
    )
    assert result.candidates[0].metadata["resource_kind"] == "Service"


def test_live_docker_handles_native_array_and_ignores_command():
    transport = StubTransport(
        lambda method, url, kwargs: [
            {
                "Id": "123",
                "Names": ["/worker"],
                "Command": "secret-value",
                "State": "running",
                "Labels": {},
            }
        ]
    )
    result = ADAPTERS["docker"].discover([{"api_url": "https://docker.example"}], transport)
    assert not result.errors
    assert transport.calls[0][1] == "https://docker.example/containers/json"
    assert "secret-value" not in result.model_dump_json()


def test_mcp_registry_packages_are_metadata_without_execution():
    result = ADAPTERS["api_registry"].discover(
        [
            {
                "servers": [
                    {
                        "server": {
                            "name": "io.example/tool",
                            "version": "1",
                            "packages": [{"runtimeHint": "npx"}],
                        }
                    }
                ]
            }
        ],
        StubTransport(),
    )
    assert not result.errors
    assert result.candidates[0].endpoint is None
    assert result.candidates[0].entity_hint == "mcp_server"
