# A2A Connector

## Boundary

`A2AConnectorTransport` uses the official `@a2a-js/sdk` `1.0.1` JSON-RPC transport. The remote Agent Card must mark `https://h2a.local/extensions/authority/v1` as required. H2A attaches an authority envelope containing the task, passport, attestation, mandate, context-grant, trace, expiry, authority hash, and sender signature references.

The A2A message body carries the signed H2A connector exchange. A2A routing does not replace H2A signature, context, replay, or authorization checks.

## Deployment

- Keep local demonstrations on loopback.
- Require HTTPS, node key pinning, and explicit remote enablement for a friend node in Phase 20.
- Reject Agent Cards that do not require the H2A extension.

## Trust

Protocol interoperability does not establish runtime governance. The declared ceiling is `connected-observed` until remote attestation or H2A-controlled isolation is verified.

