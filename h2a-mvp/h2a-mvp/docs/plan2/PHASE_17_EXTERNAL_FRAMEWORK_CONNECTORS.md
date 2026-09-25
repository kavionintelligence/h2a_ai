# Phase 17 - External Framework And Enterprise Connectors

## Outcome

Phase 17 adds real adapter boundaries for MCP, A2A 1.0, signed HTTP/webhooks, n8n, LangGraph, OpenClaw, custom CLI processes, and future provider APIs. A reference MCP agent and the existing local CLI agent completed one shared signed task trace with a dependency handoff and field-minimized context.

The authority flow is implementation-backed: organization-signed Task Envelopes, publisher-signed Connector Manifests, runtime-signed context requests/results/acknowledgements, durable delivery, and hash-linked evidence. Runtime trust remains `connected-observed`. This phase does not claim that host processes are contained by the Phase 11 Docker boundary.

## Architecture

1. `FrameworkConnectorService` persists capability declarations, probes only dependency/configuration presence, and never reads credential values.
2. `ConnectorRegistry` accepts only valid publisher-signed manifests and binds each connector to its runtime public key.
3. `MessageBroker` validates organization authority, creates signed protocol frames, releases only requested authorized fields, verifies runtime signatures, and records delivery evidence.
4. Transport adapters translate the same signed two-step exchange into MCP stdio, A2A 1.0 messages, signed HTTP, or a supervised JSON-line process.
5. Host integrations call the H2A policy surface. They do not reproduce identity or mandate policy inside n8n, LangGraph, or OpenClaw.
6. The Settings Connector Registry displays declared capabilities, health, trust ceiling, recent delivery state, and explicit dependency probes.

## Collaboration Proof

The acceptance test performs these real steps under `trace_phase17_collaboration` and `mandate_phase17_supplier_review`:

1. The official MCP TypeScript SDK launches the reference MCP agent over stdio.
2. The MCP agent requests only `supplier_name` and `risk_tier`, receives those authorized fields, and returns `Acme:high` in a signed result.
3. A second organization-signed task references the MCP task as a dependency.
4. The local CLI agent requests only `mcp_assessment`; the broker releases only that prior result.
5. Both results and acknowledgements are runtime-signed and the collaboration run is recorded with verified evidence integrity.

This satisfies the Phase 17 connector-collaboration acceptance at the current honest trust class. Moving provider execution into an approved isolated gateway remains required before the runtime itself can be labelled `governed`.

## Security Properties

- Remote HTTP requires HTTPS; loopback HTTP is allowed for the local demo.
- URL-embedded credentials are rejected.
- MCP and local CLI child processes receive a minimum environment plus explicit H2A references.
- A2A Agent Cards must declare the H2A authority extension as required.
- OpenClaw run and tool policy calls fail closed against a loopback endpoint.
- API health probes inspect only whether a named environment variable exists and do not persist its value.
- Missing hosts or credentials are reported as dependency, configuration, or authentication requirements; they are never replaced by scripted success.

## Files

- `packages/contracts/src/framework-connectors.ts`
- `packages/connectors/src/frameworkConnectorService.ts`
- `packages/messaging/src/mcpTransport.ts`
- `packages/messaging/src/a2aTransport.ts`
- `packages/messaging/src/signedHttpTransport.ts`
- `packages/sdk-typescript/src/sampleMcpAgent.ts`
- `packages/sdk-python/h2a_sdk/langgraph.py`
- `integrations/n8n/`
- `integrations/openclaw/`
- `tests/framework-connectors-phase17.test.ts`

## Deferred External Acceptance

- n8n, LangGraph, and OpenClaw live-host acceptance requires those hosts to be installed and configured.
- OpenAI, Anthropic, Gemini, and Bedrock API acceptance requires user-owned credentials and consent.
- Provider API credentials are intentionally not required for this credential-free Phase 17 gate.
- Phase 19 remains responsible for the complete classified Context Broker and leakage proof.

