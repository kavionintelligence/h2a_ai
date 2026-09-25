# Mandate, Policy, And Delegation

Status: Phase 7 complete  
Runtime: local Electron main process  
Storage: `data/h2a-demo/mandates`

## Security Boundary

Agent identity, provider access, and assignment state do not authorize sensitive action. Every action request enters `MandateService.authorize`, which evaluates signed authority with deterministic TypeScript rules before returning `ALLOW`, `DENY`, or `REQUIRES_HUMAN_APPROVAL`.

The renderer cannot read signing keys, write mandate repositories, decide policy, or resolve approval by itself. It uses schema-validated preload IPC. The shared Ed25519 authority key remains in the trusted local settings repository.

## Stored Records

- `registry.json` - versioned signed root and child mandates
- `delegations.json` - explicit parent/child authority edges
- `approvals.json` - pending, approved, rejected, and invalidated human gates
- `decisions.jsonl` - append-only authorization decision history
- `traces/tr_platform.jsonl` - hash-linked authority events

## Mandate Contract

Every active mandate binds:

- issuer human and current Human Proof
- subject Agent Passport
- objective, resources, allowed actions, and prohibited actions
- amount, record, duration, and exact-parameter limits
- disclosure field allowlist
- actions requiring human approval
- delegation destinations and maximum depth
- issuance and expiry timestamps
- canonical SHA-256 hash and Ed25519 signature

Mandate actions must be contained by the subject passport capabilities. Expired, suspended, revoked, unsigned, malformed, subject-mismatched, missing, or out-of-scope authority fails closed with a stable reason code.

## Delegation

Child authority is accepted only when it is a deterministic subset of its parent. Resources, actions, disclosure, limits, expiry, approval gates, destination set, and depth are checked. Parent prohibitions must remain in the child. Because objective meaning is not delegated to an LLM, Phase 7 conservatively requires the child objective to equal the signed parent objective.

Revoking a parent re-signs the lifecycle state of every descendant as revoked, invalidates their pending approvals, blocks workplace agents bound to the affected mandates, and blocks affected assignments.

## Human Approval

An action listed in `approvals.requiredActions` never returns `ALLOW` on its first evaluation. It creates a pending approval and returns `REQUIRES_HUMAN_APPROVAL`. Approval or rejection requires a current high-assurance Human Proof and emits linked authority evidence.

## UI

The Mandates console provides:

- signed registry and effective lifecycle status
- mandate detail, limits, disclosure, and signature evidence
- direct child delegation chain
- root and attenuated-child composer
- deterministic policy tester with reason-coded result
- pending human approval queue
- suspend, reactivate, and cascading revoke controls

The browser preview shows truthful empty state when trusted IPC, Human Proof, and Agent Passports are unavailable. Real mutation workflows run only in Electron.

## Verification

`tests/mandate-policy.test.ts` covers Human Proof gating, Ed25519 signing, allowed and denied evaluation, missing and expired authority, amount limits, human approval, over-broad delegation denial, valid child delegation, cascading revocation, and active-work containment.
