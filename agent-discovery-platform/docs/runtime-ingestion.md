# Runtime ingestion and framework integration

`POST /events` accepts `{ "events": [...] }` with up to 500 normalized `RuntimeEvent` objects. An admin or ingest bearer token is required. Include a globally unique event ID, timezone-aware timestamp, service identity and an observed event type; attach namespace/deployment when available. No event grants registration, approval or health. Do not send prompts, user messages, credentials or tool arguments. Events older than the configured observation window, or more than five minutes in the future, are rejected.

```json
{
  "events": [{
    "event_id": "unique-producer-event-id",
    "timestamp": "2026-09-24T12:00:00Z",
    "source": "application_audit",
    "service": "security-worker",
    "namespace": "team-a",
    "deployment": "security-worker",
    "event_type": "tool_call",
    "tool": "secret_scanner",
    "metadata": {"mcp_server": "https://authorized-tools.example/mcp"}
  }]
}
```

Replace the example timestamp with the real observation time. `mcp_server` is a producer-reported tool connection. It does not cause a network request. Merely exposing an MCP endpoint does not create a `USES MCPServer` edge. An LLM event may additionally carry `llm_provider` and `llm_location: "external"` or `"local"`; only explicit location evidence supports an external-LLM search result. A generic external API event plus a local LLM call does not establish remote-model usage. These are attributed telemetry claims, not cryptographic verification.

## OTLP/HTTP JSON subset

`POST /v1/traces` accepts OTLP JSON `resourceSpans` / `scopeSpans` / `spans`, hexadecimal trace/span IDs, Unix nanosecond timestamps, and string-valued allowlisted attributes. A successful response is the standard empty JSON export response; the optional `X-Census-Accepted` header counts normalized events accepted. Unknown operations can be ignored without claiming an agent. The receiver is not a general-purpose trace warehouse.

Supported mappings include `gen_ai.operation.name` chat/text_completion/generate_content -> LLM call; execute_tool -> tool call; invoke_agent -> agent call; plan -> planning; and documented memory operations -> memory access. Resource service/namespace/deployment fields scope identity. `gen_ai.request.model`, `gen_ai.tool.name`, and `gen_ai.provider.name` provide evidence identifiers. Prompts/completions and arbitrary attributes are dropped. GenAI conventions are developing and the implementation's accepted field mapping is versioned by project source.

Span events named `agent_census.<event_type>` can explicitly report normalized behavior absent from the accepted standard subset, for example `agent_census.autonomous_action` or `agent_census.delegation`. These are **project extensions**, not claims that OTel standardizes those names. OTLP protobuf, gRPC, gzip decoding and complete GenAI semantic coverage are not implemented.

The receiver also accepts these string-valued **project attributes** on resources, spans, or supported span events:

| Attribute | Meaning |
|---|---|
| `agent_census.endpoint` | The instrumented workload's observable endpoint, used for identity resolution. |
| `agent_census.framework` | The instrumented workload's actual framework or execution harness. |
| `agent_census.llm_location` | `external` or `local`, retained only for an LLM operation. |
| `agent_census.mcp_server` | The MCP endpoint actually used, retained only for a tool operation. |

Endpoint attributes reject credentials, query strings, fragments, and values over 2048 characters. They do not trigger network requests or confer registration, approval, or health. Runtime provider and framework fields are populated only when their observations agree; conflicting values remain unknown. `gen_ai.provider.name` is projected from LLM operations and retained with the underlying evidence.

Spans explicitly marked with OTLP error status (`status.code: 2`) contribute neither their operation nor their span events. A failed attempt does not establish successful model or tool use. Instrumentation should set operation attributes after a successful result and emit decision/continuation events only at the corresponding actual execution boundary. The receiver cannot independently verify the truthfulness of attributed telemetry.

`scripts/real_validation_telemetry.py` provides a synchronous `SpanExporter` for actual OpenTelemetry SDK `ReadableSpan` objects. It sends the allowed JSON subset to `/v1/traces` and saves those exact sanitized request bytes plus receipt counts. It creates no spans or behavior events, captures no prompts, tool arguments/results, headers or exception messages, and must be attached to application instrumentation around the actual provider and tool calls.

## Application-side bridges

For LangGraph, CrewAI, AutoGen, OpenAI Agents SDK and Claude Agent SDK, install a trace processor/event listener in the application you control, or use its supported OTel instrumentation. Map only actual observations to this event contract and emit them through an authenticated collector. A framework import or agent-named class is weak static metadata, not sufficient behavior. The [research record](research.md) links the inspected source hooks and processors. Full provider/framework exporters were researched but not bundled or exercised against real providers; their credentials and runtime versions remain your integration boundary.

Pipeline spans use the OTel API. A deployment can install an SDK `TracerProvider` and exporter before creating the application. No remote exporter is silently enabled by this prototype. Structured stage logs and the audit API remain available with correlation IDs when no exporter is configured.
