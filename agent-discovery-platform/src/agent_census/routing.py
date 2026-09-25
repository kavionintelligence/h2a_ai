"""Execution boundary for explicitly approved, fresh and healthy catalog records."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from .discovery import MCP_VERSION, mcp_initialize, mcp_rpc, mcp_tools
from .models import AgentRecord, TaskRequest, utcnow
from .security import IntegrationError, SafeHTTP


class Router:
    def __init__(
        self, transport: SafeHTTP, health_ttl_seconds: int = 120, event_window_seconds: int = 3600
    ):
        self.transport = transport
        self.health_ttl_seconds = health_ttl_seconds
        self.event_window_seconds = event_window_seconds
        self._local: dict[str, Callable[[TaskRequest], dict[str, Any]]] = {}

    def register_local(self, name: str, handler: Callable[[TaskRequest], dict[str, Any]]) -> None:
        """Register trusted application code, never names supplied through the HTTP API."""
        if not name or not callable(handler):
            raise ValueError("A local handler needs a name and callable")
        self._local[name] = handler

    @staticmethod
    def _fresh(timestamp: datetime | None, maximum: int) -> bool:
        if timestamp is None or timestamp.tzinfo is None:
            return False
        age = (utcnow() - timestamp).total_seconds()
        return -5 <= age <= maximum

    @staticmethod
    def _evidence(record: AgentRecord, source: str, kind: str) -> str | None:
        matching = [ev for ev in record.evidence if ev.source == source and ev.kind == kind]
        return max(matching, key=lambda ev: ev.observed_at).value if matching else None

    def route(self, record: AgentRecord, request: TaskRequest) -> dict[str, Any]:
        if request.agent_id is not None and request.agent_id != record.agent_id:
            raise IntegrationError(
                "agent_mismatch", "Requested agent does not match routing target"
            )
        if record.trust_status != "approved":
            raise IntegrationError("untrusted_target", "Task routing requires an approved target")
        if not record.classification.is_agent:
            raise IntegrationError("not_an_agent", "Task routing requires agent classification")
        if record.auth_type not in {None, "none", "public"}:
            raise IntegrationError(
                "authentication_not_configured",
                "Protected upstream credential integration is not configured",
            )
        if record.health_status != "healthy" or not self._fresh(
            record.health_checked_at, self.health_ttl_seconds
        ):
            raise IntegrationError(
                "unhealthy_target", "Task routing requires a recent successful health check"
            )
        if not self._fresh(record.last_seen, self.event_window_seconds):
            raise IntegrationError("stale_target", "Target discovery evidence is stale")
        endpoint = record.endpoint
        if not endpoint:
            raise IntegrationError("missing_endpoint", "Target has no callable endpoint")
        available = {cap.name.casefold() for cap in record.capabilities} | {
            s.casefold() for s in record.skills + record.tools
        }
        if not all(cap.casefold() in available for cap in request.required_capabilities):
            raise IntegrationError(
                "capability_mismatch", "Target does not match required capabilities"
            )
        protocol: str | None = request.protocol
        if protocol is None:
            protocol = next(
                (p for p in record.protocols if p in {"a2a", "mcp", "http", "local"}), None
            )
        if protocol is None or protocol not in record.protocols:
            raise IntegrationError(
                "unsupported_protocol", "Target does not advertise the requested routing protocol"
            )
        if protocol == "local":
            result = self._route_local(record, request)
        elif urlsplit(endpoint).scheme not in {"http", "https"}:
            raise IntegrationError(
                "invalid_endpoint", "Network routing requires an HTTP or HTTPS endpoint"
            )
        elif protocol == "a2a":
            result = self._route_a2a(record, request)
        elif protocol == "mcp":
            result = self._route_mcp(record, request)
        else:
            result = self.transport.request(
                "POST",
                endpoint,
                json={"task": request.task, "arguments": request.arguments},
                retry=False,
            )
        # A2A may return an ongoing task; transport success does not prove task completion.
        status = "tool_error" if protocol == "mcp" and result.get("isError") else "dispatched"
        return {
            "agent_id": record.agent_id,
            "protocol": protocol,
            "status": status,
            "result": result,
        }

    def _route_local(self, record: AgentRecord, request: TaskRequest) -> dict[str, Any]:
        parsed = urlsplit(record.endpoint or "")
        if (
            parsed.scheme != "local"
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise IntegrationError("invalid_endpoint", "Invalid local endpoint")
        name = parsed.netloc + parsed.path.rstrip("/")
        handler = self._local.get(name)
        if handler is None:
            raise IntegrationError(
                "unregistered_callable",
                "No trusted application callable is registered for this endpoint",
            )
        result = handler(request)
        if not isinstance(result, dict):
            raise IntegrationError("invalid_result", "Local callable must return an object")
        return result

    def _route_a2a(self, record: AgentRecord, request: TaskRequest) -> dict[str, Any]:
        endpoint = record.endpoint
        if endpoint is None:
            raise IntegrationError("missing_endpoint", "Target has no callable endpoint")
        version = self._evidence(record, "a2a", "protocol_version")
        binding = self._evidence(record, "a2a", "protocol_binding")
        if version not in {"0.3", "0.3.0"} or binding != "JSONRPC":
            raise IntegrationError(
                "unsupported_protocol",
                "Execution supports only A2A 0.3 JSON-RPC; modern cards remain discoverable",
            )
        request_id = str(uuid4())
        message: dict[str, Any] = {
            "messageId": str(uuid4()),
            "role": "user",
            "kind": "message",
            "parts": [{"kind": "text", "text": request.task}],
        }
        params: dict[str, Any] = {"message": message}
        if request.arguments:
            message["parts"].append({"kind": "data", "data": request.arguments})
        result = self.transport.request(
            "POST",
            endpoint,
            json={"jsonrpc": "2.0", "id": request_id, "method": "message/send", "params": params},
            headers={"A2A-Version": "0.3"},
            retry=False,
        )
        if (
            not isinstance(result, dict)
            or result.get("jsonrpc") != "2.0"
            or result.get("id") != request_id
            or "error" in result
        ):
            raise IntegrationError(
                "upstream_rpc_error", "A2A returned an error or mismatched response envelope"
            )
        response = result.get("result")
        if not isinstance(response, dict):
            raise IntegrationError("invalid_result", "A2A result must be an object")
        return response

    def _route_mcp(self, record: AgentRecord, request: TaskRequest) -> dict[str, Any]:
        endpoint = record.endpoint
        if endpoint is None:
            raise IntegrationError("missing_endpoint", "Target has no callable endpoint")
        if self._evidence(record, "mcp", "protocol_version") != MCP_VERSION:
            raise IntegrationError(
                "unsupported_protocol", "Execution supports only MCP 2025-11-25 sessionless JSON"
            )
        if not request.tool or request.tool not in record.tools:
            raise IntegrationError(
                "tool_required", "MCP routing requires an explicitly selected catalog tool"
            )
        initialized = mcp_initialize(self.transport, endpoint)
        if "tools" not in initialized["capabilities"]:
            raise IntegrationError(
                "unsupported_capability", "MCP target no longer advertises tools"
            )
        current = {tool.get("name") for tool in mcp_tools(self.transport, endpoint)}
        if request.tool not in current:
            raise IntegrationError(
                "tool_unavailable", "Selected tool is no longer advertised by this endpoint"
            )
        # A failed execution is never automatically retried: it may already have taken effect.
        return mcp_rpc(
            self.transport,
            endpoint,
            "tools/call",
            {"name": request.tool, "arguments": request.arguments},
            100,
        )
