# Phase 14 - Agent Passport V2 And Runtime Attestation

Status: Complete. Phase 12 is accepted complete for phase sequencing under the user's 2026-08-21 exception; its two physical cross-person checks remain in `LATER_TASKS.md` and the Final Plan 2 Gate.

## Purpose

Phase 14 makes an agent a cryptographically bound organizational workload identity. Provider access is not authority, a passport record is not a runtime, and possession of a copied public record is insufficient to create a trusted session.

## Architecture

- `AgentIdentityService` now creates an authoritative `AgentPassportV2` and retains a V1 compatibility projection for completed mandate, collaboration, and audit paths.
- New passport issuance requires a current Human Proof and an active authority credential whose role permits `agent-passport:issue`.
- The passport binds organization, human sponsor, employment membership, issuance proof, authority credential, connector manifest, purpose, risk tier, capabilities, workload public key, lifecycle, expiry, canonical hash, and organization signature.
- Workload and session private keys remain in trusted-process repositories and never enter renderer state, public passports, runtime attestations, or evidence payloads.
- Runtime attestation is a separate signed record. A one-time 60-second challenge is signed by the workload private key and verified against the passport public key before a session can become ready.
- Every rotation creates a fresh session key, attestation, and runtime session. The previous session becomes revoked and cannot silently regain trust.
- Passport suspend/revoke invalidates active runtime sessions. Reactivation does not reactivate an old session; a fresh attestation is required.

## Trust Ceiling

Phase 14 can truthfully issue `unverified` and `connected-observed` sessions. Requests for `governed` fail closed until Phase 16 proves process, filesystem, network, tool-gateway, cancellation, and revocation enforcement. `external-attested` also fails closed until a conformant external verifier exists in Phase 16/17.

## Storage

| Record | Local path beneath `H2A_DATA_PATH` |
|---|---|
| Passport V2 registry | `passports/registry-v2.json` |
| V1 compatibility projection | `passports/registry.json` |
| Workload private keys | `passports/workload-keys.json` |
| Runtime attestations | `runtime/attestations-v2.json` |
| Runtime sessions | `runtime/sessions-v2.json` |
| One-time challenges | `runtime/challenges-v2.json` |
| Session private keys | `runtime/session-keys-v2.json` |
| Migration receipts | `migrations/v2-agent-passport-receipts.json` |
| Organization signing key | `settings/organization-signing-key-v2.json` |

## Workflows

### Sponsor-Authorized Issuance

1. The renderer selects the current assured membership and authority credential.
2. The main process independently evaluates `agent-passport:issue` through `OrganizationAuthorityService`.
3. H2A validates provider/model contracts, purpose, risk, connector, capabilities, and expiry.
4. H2A generates a workload Ed25519 key pair and stores only the public key in Passport V2.
5. The organization signs the canonical passport and records minimized issuance evidence.
6. The local runtime supervisor performs the initial workload challenge and creates the first runtime session.

### Runtime Attestation And Rotation

1. H2A validates passport signature, status, expiry, connector, binding, trust ceiling, and requested attestation expiry.
2. H2A issues and persists a short-lived one-time challenge.
3. The workload signer signs the nonce; H2A verifies it against the passport public key.
4. H2A creates a fresh session key, organization-signed attestation, and ready runtime session.
5. Any previous active session is revoked and rotation evidence links old and new session IDs.

### Lifecycle And Migration

Sponsor-authorized passport suspend and revoke invalidate active sessions; reactivation leaves prior sessions suspended. Disconnect stops sessions independently. V1 migration requires explicit organization, membership, proof, authority credential, connector, purpose, risk, and expiry enrichment. It preserves the existing workload public/private key binding, emits a signed receipt, and is idempotent.

## Desktop Experience

The Add Agent workflow now captures purpose and risk tier and shows `Issue and attest`. It refuses onboarding until a currently assured employee has explicit passport issuance authority. The Agent inspector shows V2/compatibility status, human sponsor, risk, runtime trust, session state, workload-key verification, independent lifecycle controls, and attestation rotation.

Responsive inspection passed at 1440x900 and 390x844 target dimensions. The full-height mobile dialog contains its own scroll surface, footer actions fit, document width remains contained, and browser warnings/errors are zero.

## Evidence And Verification

Evidence events cover Passport V2 issuance/migration, workload challenges, runtime attestation, session rotation, and session revocation. Automated tests prove sponsor denial, Ed25519 organization signature verification, private-key isolation, copied-passport denial, fresh session-key rotation, governed-label denial, lifecycle invalidation, and idempotent V1 migration.

Final gate: typecheck passed, lint passed, 78 tests in 18 files passed, production build passed, Docker containment proof passed, responsive visual QA passed, and an isolated native Electron session launched a responsive `H2A Command Floor` window.

## Non-Claims

- Phase 14 proves workload-key possession inside the local trusted identity service; Phase 16 must bind this challenge to supervised real provider processes.
- No live Claude, Codex, Gemini, Antigravity, or external framework execution is claimed.
- No session is labelled `governed` yet.
- Passport V2 is additive; Phase 21 will upgrade cross-domain evidence resolution from the V1 compatibility projection to native V2 entities.
