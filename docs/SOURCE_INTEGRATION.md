# ByoSync source integration

For the newer endpoint collectors, real Claude/Codex room execution, named users, Mem0 and Langfuse adapters, see [Real rooms and discovery](REAL_ROOMS_AND_DISCOVERY.md). The sections below document the original foundation integration.

ByoSync is assembled from the two product foundations in this workspace. The CISO interface hides their internal project phases, but it does not replace their security services with frontend fixtures.

## Agent Census source

Source: `C:\Users\khatr\Downloads\H2A_mvp\Ai-Census-main\agent-discovery-platform`

Used through the real Census bridge and scan contract:

- configured A2A, MCP, API, manifest, telemetry, Docker, and Kubernetes collection;
- evidence-based agent/non-agent classification;
- shadow status, provider, model, endpoint, capabilities, freshness, and source warnings;
- explicit import into H2A without rewriting the Census classification;
- full discovery snapshot and provenance hash preserved with the H2A identity.

## H2A source

Source: `C:\Users\khatr\Downloads\H2A_mvp\h2a-mvp`

The stable services used by ByoSync are synchronized into its product tree and invoked by the governance backend:

- `AuthoritySignatureService` for Ed25519 identity and execution receipts;
- `MandateService` for bounded actions, denials, approval requests, lifecycle changes, and containment;
- `AgentCollaborationService` for durable work assignments, status transitions, agent-to-agent messages, response hashes, and evidence linkage;
- `LocalAuthorityEventLedger` for append-only hash-linked trace evidence;
- `LocalWorkplaceRepository`, `VersionedJsonRepository`, and `AtomicFileStore` for durable local state;
- native H2A contract schemas for validation at every command boundary.

## CISO product projection

The ByoSync UI turns those services into five questions:

1. **What AI exists?** — Census discovery and shadow classification.
2. **Who is accountable?** — human binding and signed Agent Passport.
3. **What may it do?** — active, suspended, or revoked mandate and exact policy boundaries.
4. **How did identity and context move?** — rooms, assignments, bounded handoffs, sender/recipient Passports, mandate references, body hashes, and traces.
5. **Can we stop and prove it?** — mandate containment, negative authorization, human decisions, reviewed memory, integrity verification, and evidence export.

## Intentionally not claimed

- A room does not transfer authority between agents.
- A message is not proof that a provider model executed.
- Message and response bodies are stored in the collaboration repository; the authority ledger stores hashes and routing metadata.
- Enterprise SSO, external assurance, and external-system enforcement remain `Not configured` until their real connectors are supplied.
- Credentialed provider collaboration from the broader H2A project is not labelled active in ByoSync unless those providers and their trust prerequisites are configured.
