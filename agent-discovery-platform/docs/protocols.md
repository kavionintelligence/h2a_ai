# Supported protocol profiles

The catalog normalizes protocol metadata without pretending to implement every protocol operation. Discovery support and execution support are separate. The protocol revision is explicit evidence; an agent's application version does not select a wire protocol.

| Profile | Discovery | Explicit task routing |
|---|---|---|
| A2A 0.3 JSON-RPC | Core card validation and skill extraction | `message/send` over HTTP POST, text task plus optional data arguments. Validates response JSON-RPC version and request ID. No streaming, task polling, cancel or push notifications. |
| A2A 1.0 card | Reads ordered `supportedInterfaces`, skills, default media and declared security | Unsupported; returns a structured error before execution. |
| A2A gRPC / HTTP+JSON | Interface metadata only; gRPC-only card has no callable HTTP endpoint | Unsupported. |
| MCP 2025-11-25 | `initialize`, `notifications/initialized`, cursor-based `tools/list` | Requires a specific tool already in the catalog. Initializes and re-lists at execution time, then performs one `tools/call`. |
| MCP 2026-07-28 | Inline inventories can record the revision | Live modern discovery/execution unsupported; no silent protocol fallback. |
| Plain HTTP | Supplied registry/manifest metadata | One JSON POST: `{"task":"...","arguments":{...}}`. This is a project-specific contract. |
| Local | Supplied `local://name` metadata | Only a callable registered explicitly with `Router.register_local(name, handler)` in trusted application code. No HTTP mechanism registers code or command strings. |

MCP live support is limited to sessionless JSON responses. It sends both JSON and SSE in the required Accept header, but fails closed when the response is SSE; therefore it is a bounded compatibility profile rather than a complete MCP client. Stateful `Mcp-Session-Id`, OAuth, modern per-request metadata, long-lived subscriptions and stdio transports require a future official SDK integration. The [2025 lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) defines the implemented handshake. The [2026 versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning) and [modern HTTP specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) changed these semantics; `server/discover`, request metadata and mirrored header validation must be implemented before advertising that version.

Routing checks target identity, agent classification, approved trust, healthy status, fresh health check, recent evidence, compatible requested capabilities, a callable endpoint and an advertised protocol. Protected upstream credentials are not configured, so records declaring authentication requirements cannot execute. Every network action goes through SafeHTTP; inbound authorization headers are never forwarded. Local routing must resolve an application-registered callable.

Execution POSTs are never retried automatically, because a timeout may follow a successful side effect. The response reports `dispatched`, not assumed completion: an A2A result may contain a task that is still working. MCP `isError:true` is reported as `tool_error`. Callers must inspect the returned result and task state. No autonomous tool selection is performed; MCP requires an explicit tool name and arguments.

Source schemas, cards and signatures describe claims. Presence of a signature is not verification; an endpoint URL is not an authorization grant. [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) requires resource-specific token validation and audience checks for protected deployments. [SPIFFE](https://spiffe.io/docs/latest/spiffe-about/overview/) can provide future attested workload identities. Neither trust mechanism is simulated here.
