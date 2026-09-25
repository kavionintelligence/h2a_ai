# Phase 13 - Organization And Human Authority

Status: Complete under the user's explicit 2026-08-21 phase-order exception. Phase 12 is accepted complete for sequencing; its two deferred cross-person camera rejection checks remain required Final Plan 2 evidence in `LATER_TASKS.md`.

## Purpose

Phase 13 separates biometric identity assurance from enterprise business authority. A valid Human Proof establishes who is present. An active, organization-signed authority credential establishes what that employee may do. Protected mandate operations require both.

## Implemented Architecture

- `OrganizationAuthorityService` owns organizations, employment memberships, departments, manager relationships, roles, signed authority credentials, and reason-coded decisions.
- Strict V2 Zod contracts define every request, persisted record, public state, lifecycle action, and decision reason.
- The Electron main process is the trusted boundary. The renderer receives typed public state and invokes schema-validated IPC methods through preload.
- Ed25519 credentials contain organization, membership, assigned roles, constraints, issue/expiry time, canonical hash, and organization signature.
- The mandate service receives a protected-authority port. Create, delegate, suspend, reactivate, revoke, approve, and reject operations cannot bypass Phase 13 in the real Electron composition.
- Legacy service tests may omit the port to preserve the historical Phase 7 boundary; the desktop runtime always injects it.

## Storage

All records remain local beneath `H2A_DATA_PATH`:

| Record | Path |
|---|---|
| Organizations | `organizations/registry-v2.json` |
| Memberships | `organizations/memberships-v2.json` |
| Roles | `authority/roles-v2.json` |
| Authority credentials | `authority/credentials-v2.json` |
| Recent decisions | `authority/decisions-v2.json` |
| Organization signing key | `settings/organization-signing-key-v2.json` |
| Immutable audit events | existing hash-linked evidence ledger |

## Workflows

### Bootstrap

1. An enrolled employee presents a current, organization-bound Human Proof.
2. H2A creates the organization, built-in authority-administrator role, first active membership, and signed administrator credential atomically under the service lock.
3. Evidence records the real human, organization, membership, role, credential, and policy version.

### Employee Lifecycle

An authenticated authority administrator may join an enrolled human to the same organization, assign manager/department/roles, suspend employment, transfer it, reactivate it, or terminate it. A manager must be an active, different membership in the same organization. Suspend, transfer, and terminate revoke active credentials. A transfer enters `transferred`; reactivation and a freshly issued credential are explicit steps.

### Role And Credential Policy

Roles combine resource/action scopes with optional amount and record limits plus named approval powers. Credentials can narrow those assignments further and are verified for canonical hash, signature, status, expiry, organization, membership, and role consistency on every evaluation. Credential lifecycle supports suspend, reactivate, revoke, and automatic expiry.

### Protected Mandates

The mandate UI resolves a current assured membership and an active credential carrying the needed mandate role. The service then independently checks Human Proof, employment, credential integrity, role scope, limits, and approval power. Denial returns a stable reason code and the operation does not execute. Authorization evidence identifies the bound human rather than only the membership.

## Desktop Experience

`People & Authority` provides an employee directory, reporting hierarchy, role catalogue, signed credential inventory, lifecycle dialogs, one-time trusted bootstrap, and a policy evaluator. The screen was verified at 1440x900 and 390x844-equivalent mobile width with all six navigation destinations visible, contained tables, labelled icon controls, and no browser console warnings.

## Evidence And Tests

Evidence covers organization bootstrap, role creation, employee lifecycle, credential lifecycle, and minimized allow/deny authority decisions. Tests prove biometric bootstrap, Ed25519 verification, unauthorized employee denial, record and amount constraints, approval-power denial, transfer/reactivation behavior, credential expiry, tamper rejection, and enforcement at mandate issue and approval boundaries.

Final Phase 13 gates: typecheck passed, lint passed, 72 tests in 17 files passed, production Electron build passed, Docker containment proof passed, and isolated-session Electron startup produced a responsive window.

## Deliberate Non-Claims

- Separation-of-duty, quorum, eligible-approver discovery, biometric co-signing, and exact-once resume belong to Phase 18 and are not claimed here.
- Agent Passport V2 workload attestation belongs to Phase 14.
- Live provider execution remains unavailable until its owning phases pass.
- The two deferred Phase 12 cross-person camera checks remain required for final Plan 2 acceptance.
