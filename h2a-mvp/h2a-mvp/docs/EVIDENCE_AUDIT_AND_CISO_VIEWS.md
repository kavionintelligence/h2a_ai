# Evidence, Audit, And CISO Views

## Purpose

Phase 9 turns H2A's persisted identity, authority, collaboration, and execution records into an inspectable incident record. The Evidence Explorer does not synthesize audit claims. It resolves persisted public repositories and the append-only evidence ledger into a linked investigation model.

## Runtime Flow

1. The renderer submits a validated `EvidenceQuery` through the preload allowlist.
2. The Electron main process invokes `EvidenceAuditService` in the trusted process.
3. The service verifies the entire JSONL evidence chain before constructing the result.
4. Public identity, Human Proof, passport, runtime, mandate, delegation, approval, decision, assignment, message, response, and scenario records are joined by persisted identifiers and trace IDs.
5. The renderer receives only the validated `EvidenceExplorerState` projection.

## Investigation Model

Each `EvidenceInvestigationRecord` contains:

- the canonical authority event and its integrity state;
- human owner and Human Proof references;
- Agent Passport and runtime binding references;
- mandate status and ordered delegation ancestry;
- the deterministic authorization decision and reason code;
- assignment and scenario references;
- a resolution status plus explicit missing links.

Protected action lifecycle events must resolve human, passport, runtime, mandate, and decision records. Missing evidence is displayed as unresolved; it is never silently filled with demo data.

## Explorer Capabilities

- full-text filtering across event, trace, actor, mandate, reason, and linked identifiers;
- event type, actor type, authorization decision, reason code, and integrity-only filters;
- chain-of-custody timeline and per-event hash inspection;
- Human Identity to Human Proof to Passport to runtime to mandate attribution view;
- parent-to-child delegation ancestry;
- authorization decision, disclosure, approval, and persisted payload inspection;
- implementation-backed controls matrix;
- integrity status with failed event identification.

## Audit Export

`exportEvidenceBundle` writes a deterministic JSON package to the local `exports/` directory. The package contains the query, source ledger head, integrity report, matching investigation records, control mappings, and a canonical bundle hash. A successful export is itself appended to the evidence ledger as `AUDIT_BUNDLE_EXPORTED`.

The export intentionally excludes private signing keys, encrypted provider credentials, biometric helper material, commands, working directories, provider session identifiers, collaboration message bodies, response bodies, and scenario output bodies. Where correlation is needed, the export retains identifiers, routing metadata, and content hashes.

An export is still possible after tampering is detected so an investigator can preserve the failure state. H2A does not append an export event to a chain that has already failed verification.

## Current Boundary

This local MVP demonstrates application-level attribution and tamper evidence. It is not a compliance certification, trusted timestamp authority, hardware-backed attestation system, or remote immutable archive. Enterprise storage, SIEM forwarding, retention, access control, and external key custody remain adapter-backed production work.

## Verification

- `tests/evidence-audit.test.ts` verifies complete protected-action attribution, delegation ancestry, decision filtering, exact tamper detection, privacy-minimized export, canonical bundle hashing, and export evidence.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` are the Phase 9 code quality gates.
- Desktop QA verifies real local ledger loading, filtering, inspection, and export through the secure preload boundary.
