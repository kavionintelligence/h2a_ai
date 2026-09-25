# MCP Connector

## Boundary

H2A uses `@modelcontextprotocol/sdk` `1.30.0`. `McpConnectorTransport` is the MCP client and the reference external agent is an MCP stdio server exposing `h2a_exchange`.

The tool is a two-step exchange: `task` returns a runtime-signed context request; `context-response` returns a runtime-signed result and acknowledgement. The broker verifies every frame and remains the sole context authorization point.

## Reference Run

```powershell
pnpm exec vitest run tests/framework-connectors-phase17.test.ts
```

For another MCP server, expose a tool named `h2a_exchange` with the same structured arguments and import its signed Connector Manifest/runtime public key before delivery. Local MCP uses stdio. A remote MCP deployment should use Streamable HTTP behind HTTPS and an authenticated gateway.

## Trust

The adapter ceiling is `connected-observed` until its process, filesystem, network, credentials, and protected tools execute inside a proven H2A isolation boundary.

