"""LangChain/LangGraph middleware for enforcing H2A authority context.

Install the optional Phase 17 requirements before importing this module.
"""

from __future__ import annotations

from typing import Any, Callable

from langchain.agents.middleware import AgentMiddleware


class H2AAuthorityMiddleware(AgentMiddleware):
    """Fail closed before model and tool calls when H2A authority is invalid."""

    def __init__(
        self,
        verify_authority: Callable[[dict[str, Any]], bool],
        authorize_tool: Callable[[dict[str, Any], str, dict[str, Any]], bool],
    ) -> None:
        super().__init__()
        self._verify_authority = verify_authority
        self._authorize_tool = authorize_tool

    def before_model(self, state: Any, runtime: Any) -> None:
        authority = self._authority(runtime)
        if not self._verify_authority(authority):
            raise PermissionError("H2A_AUTHORITY_INVALID")
        return None

    def wrap_tool_call(self, request: Any, handler: Callable[[Any], Any]) -> Any:
        authority = self._authority(request.runtime)
        tool_call = request.tool_call
        name = str(tool_call.get("name", ""))
        arguments = tool_call.get("args", {})
        if not self._verify_authority(authority):
            raise PermissionError("H2A_AUTHORITY_INVALID")
        if not self._authorize_tool(authority, name, arguments):
            raise PermissionError("H2A_TOOL_NOT_AUTHORIZED")
        return handler(request)

    @staticmethod
    def _authority(runtime: Any) -> dict[str, Any]:
        context = getattr(runtime, "context", None)
        if not isinstance(context, dict):
            raise PermissionError("H2A_AUTHORITY_CONTEXT_MISSING")
        authority = context.get("h2a_authority")
        if not isinstance(authority, dict):
            raise PermissionError("H2A_AUTHORITY_CONTEXT_MISSING")
        required = {
            "task_id", "trace_id", "passport_id", "runtime_attestation_id",
            "mandate_id", "context_grant_id", "expires_at", "signature",
        }
        if not required.issubset(authority):
            raise PermissionError("H2A_AUTHORITY_FIELDS_MISSING")
        return authority
