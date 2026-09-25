# H2A repository inspection

Inspected `h2a-mvp/h2a-mvp` before implementation. No AGENTS.md found. Its README references `../rule.md` and `../PLAN_OF_ACTION.md`; those files are absent from the supplied archive.

| Capability | Existing component | Inspected status and integration work |
| --- | --- | --- |
| Applications | Electron desktop; React 19/Vite browser app | Desktop uses real main-process services and preload IPC. Browser app is a localStorage wireframe; its buttons do not reach those services. |
| Identity | `packages/identity/src/agentIdentityService.ts` | Signed native passports and runtime binding persist. `createAgent` creates a fresh random agent ID together with passport, so discovery ID preservation and a separate owner-binding stage require adaptation. |
| Humans/auth | `humanIdentityV2Service.ts`, organization service, employee workspace session | Biometric proof, signed org authority, Electron sender-bound sessions exist. Browser has no backend authentication. Demo uses an explicitly labeled loopback presenter session, not fabricated biometric authentication. |
| Passport | Native `agentPassportSchema`, `AuthoritySignatureService` | Ed25519 signing/verification and registry storage reusable. New orchestration issues native records using the existing discovery identity. |
| Mandates | `packages/mandates/src/mandateService.ts` | Real signed policy, scope/expiry/revocation/delegation checks; allow/deny/approval results; persistent approval requests. Reuse directly. |
| Approvals | Native MandateService and MultiHumanApprovalService | Native decisions persist; orchestration must connect approval resolution to an exactly-once simulated action and revalidate authority. |
| Room | `EmployeeWorkspaceService` and `workspaceRoomSchema` | Persisted signed rooms support human membership IDs only. Required agent participants/trust context require orchestration extension. |
| Memory | Employee workspace draft/review/withdraw | Draft/published distinction, independent reviewer, content hashes exist. Native model only records human author and lacks source/agent/passport/mandate provenance; adapt these patterns in connected demo schema. |
| Evidence | `LocalAuthorityEventLedger`, `EvidenceAuditService` | Durable hash-linked JSONL with canonical hashing/tamper verification. Reuse common ledger, extend event enum for discovery, binding, rooms, memory. |
| Storage | `AtomicFileStore`, `VersionedJsonRepository`, `LocalJsonlRepository` | Local versioned JSON, validated envelopes, atomic replacement, backups and path containment. No external database required for H2A. |
| API | `apps/desktop/main/index.ts` + preload | Extensive typed IPC APIs. No HTTP facade connecting browser wireframe; add small loopback HTTP adapter. |
| Existing tests | `tests/*.test.ts`, Vitest 4 | 90+ test files across identity, mandate, approval, room, storage, collaboration, runtime, desktop. |
| Config/startup | `package.json`, pnpm lock, Vite/Electron configs | README `pnpm install`, `pnpm dev`, renderer-only `pnpm dev:web`; pnpm unavailable on host. Archived dependency links were plain text placeholders. |
| Seeds/scripts | `data/h2a-demo`, demo sessions/showcases, `scripts/new-demo-session.mjs` | Many archived demo datasets, isolated session creator and phase validation scripts. New integration uses dedicated data root; existing sessions remain untouched. |

Baseline attempt: `node_modules/.bin/vitest.CMD run tests/agent-identity.test.ts tests/mandate-policy.test.ts tests/employee-workspace.test.ts tests/evidence-audit.test.ts --maxWorkers=1` failed before collection with `ERR_MODULE_NOT_FOUND: @vitest/utils`. Root cause was archive symlink placeholders. Root restored local links and subsequently ran native identity/mandate tests successfully (11 tests). Additional results are in final verification documentation.

After archive link repair, `node node_modules/vitest/vitest.mjs run tests/employee-workspace.test.ts tests/evidence-audit.test.ts tests/storage-concurrency.test.ts --maxWorkers=1` passed all 15 tests. The new isolated native service integration test `tests/governance-service.test.ts` passed 8 tests covering action/approval/restart/idempotency, native revocation, signature tamper denial and Shadow classification, expired-authority restart recovery, memory evidence/review/restart/trace, signed execution receipt recovery after interrupted audit append, persisted room/approval correlation, and actual HTTP actor-spoof/cross-origin rejection. `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json` passed with the new service and HTTP server included.

The integrated demo reuses H2A native storage, evidence, signatures, passport schema and mandate/approval engine. It extends only the missing discovery-to-identity handoff, agent-aware rooms, executable action lifecycle, reviewed agent memory provenance, and HTTP interface.
