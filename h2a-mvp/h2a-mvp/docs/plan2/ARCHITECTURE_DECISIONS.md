# Plan 2 Architecture Decisions

Status: Frozen for Phases 12-22. Changes require a documented ADR amendment and user approval.

## ADR-201 Additive V2 Migration

Keep V1 repositories readable and introduce schema-version-2 records beside them. Migration creates signed receipts and never overwrites V1 evidence. Records missing organization, membership, authority, policy, purpose, nonce, workload, or attestation data enter `requires-enrichment`; migration cannot invent those facts.

## ADR-202 Trust Claims Are Enforced Types

The only runtime trust modes are `governed`, `connected-observed`, `external-attested`, and `unverified`. A live model response proves connectivity, not governance. `governed` requires containment evidence for filesystem, network, process, credential and protected-tool paths. The policy engine, not a provider or model, assigns the effective trust mode.

## ADR-203 H2A Authority Over A2A 1.0

A2A 1.0 is the remote agent task/message lifecycle protocol. H2A remains the identity and authority layer. Agent Cards declare required extension `urn:h2a:authority-envelope:v1`; clients send `A2A-Version: 1.0` and `A2A-Extensions`. Critical authority records remain in H2A durable storage and messages carry signed references and bundle hashes.

## ADR-204 Provider Surfaces

- Claude: official CLI print/stream JSON with explicit tool restrictions.
- Codex: official `codex exec --json` for the first adapter; App Server stdio JSON-RPC for richer lifecycle and approval events after version-specific schema generation.
- Gemini: official headless CLI `stream-json` with policy/plan controls, or official API when the selected account cannot use the CLI.
- Bedrock: AWS SDK Converse/ConverseStream with IAM least privilege.

Browser cookies, consumer web-session automation, provider-wide bypass modes, and renderer-held credentials are prohibited.

## ADR-205 OpenClaw Boundary

Use a native OpenClaw plugin with `openclaw.plugin.json`, pinned provenance, explicit `plugins.allow`, and typed `api.on(...)` hooks for policy, prompt shaping, tool control, and block/cancel behavior. Verify the loaded runtime with `openclaw plugins inspect <id> --runtime --json`. Signed webhook is a fallback for message ingress, not proof of protected-action enforcement.

## ADR-206 Isolation Target

Use WSL2 plus Docker Linux containers as the preferred local isolation target. Each agent session receives a bounded workspace mount, allowlisted environment, no Docker socket, explicit network policy, non-root user, resource limits, process-tree ownership, and per-task capability broker. Until the containment suite passes, real local CLIs are `connected-observed`.

## ADR-207 Biometric Demonstration Policy

Initial enrollment is 20 protected records, configurable to 70. `required_matches=1` is permitted only as a visible `demo-unmeasured` policy for this non-commercial demonstration. Performance feasibility does not justify an accuracy claim. Phase 12 records genuine/impostor calibration and allows a stricter threshold without schema change.

## ADR-208 Local Federation

Phase 20 runs two independently keyed local nodes over loopback HTTPS/WebSocket or A2A. The design remains TLS-capable, but no public listener, domain, tunnel, or internet claim is required. Node invitation, key pinning, heartbeat, replay defense and revocation are mandatory even on loopback.

## Protocol Allocation

| Concern | Boundary |
|---|---|
| identity, authority, context and evidence | signed H2A V2 records |
| remote agent task lifecycle | A2A 1.0 plus required H2A extension |
| tool and resource calls | MCP through H2A Gateway |
| local coding CLIs | Process Supervisor plus provider adapter |
| n8n | signed webhook/callback, then custom node |
| LangChain/LangGraph | TypeScript/Python H2A middleware |
| OpenClaw | native typed-hook plugin |
| same-machine custom process | authenticated loopback HTTP or OS-local IPC |
