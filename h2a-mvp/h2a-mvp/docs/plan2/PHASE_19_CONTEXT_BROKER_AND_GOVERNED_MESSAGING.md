# Phase 19 Context Broker And Governed Messaging

## Decision

Phase 19 replaces the connector conformance authorization fixture in the Electron runtime with a real local Context Broker. Protected values remain in OS-protected local ciphertext. Agents receive only a projection authorized for one organization, task, mandate, agent, Passport V2, purpose, field set, token budget, use limit, and expiry.

Agent-to-agent communication remains a durable Message Broker operation. Messages carry authority and artifact references, hashes, sequence, deduplication identity, expiry, and a sender workload signature. Message bodies are not used as an authority channel.

## Trust Boundaries

1. The renderer can request artifact and grant administration through typed IPC but never receives an artifact plaintext read method.
2. The Electron main process owns `ContextBrokerService`, Electron `safeStorage`, organization authority, recipient checks, and Message Broker composition.
3. Artifact metadata and hashes are public operational state; artifact values are serialized and sealed before persistence.
4. Context authorization runs immediately before connector delivery. The recipient is rechecked against task, agent, Passport, mandate, and assignment state.
5. The connector process receives only the authorized projection in its protocol frame. H2A does not place protected values in the process environment.
6. Evidence and disclosure records contain names, classifications, transformations, hashes, references, and reason codes, never disclosed values.

This boundary minimizes disclosure but does not upgrade host provider processes from `connected-observed` to `governed`. Container/gateway tool and network containment remains a later acceptance requirement.

## Records

- `ContextArtifact` stores organization, owner, source, field classifications, value hashes, sealed payload reference, lifecycle, canonical hash, and organization signature.
- `GovernedContextGrant` wraps the V2 grant with explicit field rules, transformation per field, use limit/count, lifecycle, canonical hash, and organization signature.
- `ContextDisclosure` records requested, granted, and withheld field names; transformation map; value hashes; projection hash; decision; idempotency key; and signature.
- `CompactedAuthorityContext` preserves human, agent, Passport, attestation, mandate, Context Grant, task, trace, and authority hash through provider prompt compaction.
- `GovernedAgentMessage` binds sender and recipient connectors/passports, task, trace, mandate, Context Grant, speech act, content reference/hash, sequence, deduplication identity, expiry, and sender signature.

All records are strict Zod contracts in `packages/contracts/src/context-broker.ts`.

## Context Workflow

1. An authority administrator creates an artifact and classifies each field as `public`, `internal`, `confidential`, or `restricted`.
2. `ContextBrokerService.createArtifact` hashes each canonical value, seals the complete payload, signs public metadata, and records minimized evidence.
3. An administrator selects a current assignment and issues a grant. `issueGrant` requires authority, an active artifact field, an eligible recipient binding, exact task/mandate/agent/Passport references, purpose, budget, use limit, and future expiry.
4. A connector requests named fields through its typed Context Request frame.
5. `authorize` verifies grant status, expiry, use count, organization, task, mandate, agent, Passport, purpose, and requested field rules.
6. Allowed fields are transformed with `value`, `mask`, `summarize`, or `reference`. Fields without a matching rule, above the classification ceiling, or beyond the budget are withheld.
7. The signed disclosure is persisted before the projection is returned. Repeating the same request returns the same decision and does not consume another use.
8. Expiry and revocation fail closed and create dedicated evidence events.

## Governed Message Workflow

1. The broker first accepts an organization-signed Task Envelope containing durable identity and authority references.
2. The sender creates a message that references content by identifier and hash rather than embedding it in authority metadata.
3. `recordGovernedMessage` checks both connector manifests, task authority, recipient capability, expiry, sender workload signature, deduplication identity, and monotonic sequence.
4. Valid messages persist to the governed message store and append minimized evidence. Valid retries are idempotent; forged content and sequence replay are rejected.
5. `compactTaskAuthority` creates the authority facts that must survive provider-side context compaction.

## Local Persistence

- `contexts/artifacts-v2.json`: signed public artifact metadata and value hashes.
- `contexts/private/artifact-payloads-v2.json`: Electron `safeStorage` ciphertext only.
- `contexts/grants-v2.json`: signed recipient- and purpose-bound grants.
- `contexts/disclosures-v2.json`: signed minimized release and withholding evidence.
- `messaging/governed-agent-messages-v2.json`: signed durable agent message metadata.
- `traces/tr_platform.jsonl`: hash-linked lifecycle evidence.

The service depends on `ContextPayloadProtector`, `ContextAuthorityPort`, `ContextRecipientPort`, and `EvidenceLedgerPort`. These ports preserve a plug-in path to KMS/envelope encryption, remote policy, MongoDB/AWS persistence, and a backend evidence service without changing broker semantics or renderer contracts.

## UI

The Context Broker route provides artifact, grant, disclosure, and governed-message views. Operators can classify and seal artifacts, issue transformation rules against active assignments, revoke grants, inspect withheld fields, and verify hashes and authority references. No UI or IPC method reads protected artifact plaintext.

Desktop `1440x900` and mobile `390x844` checks showed no page overflow, zero-size buttons, incoherent overlap, or browser warning/error. The mobile evidence table scrolls within its workbench.

## Acceptance Evidence

- `tests/context-broker-phase19.test.ts` proves recipient and purpose binding, deterministic masking, unauthorized-field withholding, idempotent replay, revocation, trusted-clock expiry, authority compaction, separate-process delivery, public-state/log/evidence/export leakage absence, signed message persistence, forged-message denial, and sequence-replay denial.
- The hidden sentinel is absent from the connector environment/output outside the authorized projection, public Context Broker state, evidence ledger, evidence export, and every persisted file including ciphertext bytes.
- Phase 15 connector, Phase 17 framework, Phase 18 multi-human approval, and organization authority regression suites pass.
- TypeScript, ESLint, and the Electron production build pass.
- The full 108-test aggregate run records 102 passed, 4 credentialed skipped, and two Windows load timeouts. Both timed suites pass directly: 6 of 6 tests. No Phase 19 assertion fails.

## Non-Claims

- Host Claude, Codex, Antigravity, MCP, and custom processes remain `connected-observed`; the Context Broker does not prove container/gateway enforcement.
- Gemini credentials, Cursor integration, friend-node federation, final cross-provider live acceptance, and the two deferred physical cross-person camera checks remain outside Phase 19.
- Local `safeStorage` is suitable for this MVP. Enterprise deployment should replace it with organization-managed KMS/HSM envelope encryption and backend retention policy through the existing protector and repository boundaries.
