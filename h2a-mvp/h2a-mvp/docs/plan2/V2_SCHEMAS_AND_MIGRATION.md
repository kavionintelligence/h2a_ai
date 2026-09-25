# V2 Schemas And Migration

## Executable Contract Package

`packages/contracts/src/v2.ts` exports strict Zod schemas and inferred types for:

- organization, human identity, employment membership, authority role and human authority credential;
- biometric token-set policy, enrollment V2 and Human Proof V2;
- Agent Passport V2, Runtime Attestation and Runtime Session;
- Mandate V2, Approval Policy, Approval Request V2 and Approval Decision;
- Context Grant, Task Envelope and Agent Message V2;
- Connector Manifest, H2A-over-A2A authority envelope and V2 migration receipt.

The file freezes schema version `2`, trust modes, the 20-70 record bounds, signature/hash fields and H2A A2A extension URI. It is exported through `@h2a/contracts`. Phase implementations may add optional fields only when backward compatible; breaking changes require a new schema version.

## V1 Inventory And Mapping

| V1 record | V2 target | Preserved | Required enrichment |
|---|---|---|---|
| `HumanIdentity` | `HumanIdentityV2` | ID, name, status, lifecycle times | organization, membership, enrollment reference |
| `BiometricEnrollment` | `BiometricEnrollmentV2` | subject, provider, model, public hashes, signing evidence | 20-70 capture set, policy/version, protected refs, rotation status |
| `HumanProof` | `HumanProofV2` | proof/subject, assurance, methods, times, provider hash | organization, membership, enrollment version, purpose, nonce, policy hash |
| `AgentPassport` | `AgentPassportV2` | agent identity, sponsor human, capabilities, key, status, signature | organization membership, sponsor authority, purpose/risk, connector |
| `AgentRuntimeBinding` | `RuntimeAttestation` plus `RuntimeSession` | provider, model/session lifecycle hints | executable/adapter identity, challenge proof, session key, trust evidence |
| `Mandate` | `MandateV2` | hierarchy, issuer/subject, objective, resources/actions, expiry, signature | organization authority credential, context classes, approval policy |
| `ApprovalRequest` | `ApprovalRequestV2` plus `ApprovalDecision` | blocked action, mandate, agent, status, times | eligible memberships, review grant, approver proof/credential/signature |
| collaboration records | `TaskEnvelope`, `AgentMessageV2`, `ContextGrant` | task, sender/recipient, trace and content | signed envelope, sequence, dedupe, expiry, content refs, disclosure proof |

## Migration Workflow

1. Read and validate V1 without modifying it.
2. Hash the canonical V1 record.
3. Map fields that have direct evidence.
4. Resolve organization, membership and policy from signed configuration.
5. Mark unavailable security facts in `missing_fields`; do not infer them.
6. Write a new V2 record only when its strict schema passes.
7. Create a signed `V2MigrationReceipt` with source and target hashes.
8. Keep V1 readable until all dependent evidence references have migrated and restart tests pass.

Biometric V1 enrollment cannot be promoted to a 20-record V2 enrollment by duplicating its 3-5 templates. It requires a new capture ceremony. Existing proofs expire naturally and are never upgraded in place.

## Verification

`tests/plan2-contracts-and-a2a.test.ts` verifies token-set bounds, count consistency, Human Proof minimization, frozen trust labels and A2A extension validation. `tests/human-identity-v2.test.ts` now verifies additive V1 identity migration, mandatory legacy biometric enrichment, byte-for-byte source preservation, Ed25519 receipt signatures, idempotent reruns, and minimized migration evidence. The V2 biometric service remains non-authoritative for human accuracy claims until the real two-participant Phase 12 ceremony passes.
