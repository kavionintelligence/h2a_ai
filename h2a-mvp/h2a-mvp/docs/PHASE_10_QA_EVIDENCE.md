# Phase 10 Quality Assurance Evidence

## Automated Gate

The final gate passed on 2026-08-20. `pnpm typecheck`, `pnpm lint`, and `pnpm build` completed without errors. `pnpm test` passed 54 tests in 12 files. `tests/executive-demo.test.ts` is the cross-domain executive integration test. It starts with empty temporary storage and verifies persisted Human Proof, signed Passports, four provider lanes, bounded authority, deterministic outcomes, integrity, investigation, and minimized export.

The packaged Electron smoke used a newly generated isolated session. Four Electron processes remained active after ten seconds, the session manifest existed, and stderr was empty. The smoke processes were then stopped without touching another session.

## Visual Matrix

| Surface | Desktop | Mobile | Primary checks |
|---|---|---|---|
| Command Floor | `docs/qa/phase10/command-floor-1440x900.png` | `docs/qa/phase10/command-floor-390x844.png` | roster, scenario, board, inspector, navigation |
| Human Proof | `docs/qa/phase10/human-proof-1440x900.png` | covered by responsive interaction audit | camera stage, assurance hierarchy, recovery |
| Mandates | `docs/qa/phase10/mandates-1440x900.png` | covered by responsive interaction audit | registry, policy, approval, lifecycle |
| Evidence | `docs/qa/phase10/evidence-1440x900.png` | `docs/qa/phase10/evidence-390x844.png` | integrity, filters, workbench, export boundary |

Browser screenshots verify layout and truthful no-IPC states. Native Electron smoke and automated integration tests verify trusted-process behavior. Browser fallback data is not accepted as security evidence.

The captured content viewports are 1425x891 and 375x811 after browser chrome and scrollbar allocation. These exercise the supported wide and narrow endpoints. The unchanged responsive system was also verified at 768x1024 and 1024x768 during the Phase 2-9 gates.

## Interaction And Accessibility Checks

- five stable destinations remain keyboard-reachable and named;
- route changes focus the main region;
- native fields have visible or accessible labels;
- icon-only commands have accessible names and stable dimensions;
- loading, empty, error, denied, approval, revoked, integrity-failed, and desktop-required states are explicit;
- mobile bottom navigation does not cover scroll content;
- no supported viewport has page-level horizontal overflow or incoherent overlap;
- reduced-motion rules remain active;
- the Phase 10 browser inspection reported no console warnings or errors;
- Electron preload loads under sandboxing with context isolation and Node integration disabled.

## Security Boundary Checks

- renderer source does not import Node filesystem, storage, evidence, secret-store, or private biometric repository modules;
- provider secrets and private signing keys are absent from renderer projections and audit exports;
- evidence append fails on an invalid chain;
- audit export is canonical, minimized, hash-addressed, and evidence-recorded;
- clean demo sessions are additive and refuse overwrite instead of deleting prior evidence.

## Artifact Validation

- `scenarios/executive-demo.json` parses as JSON;
- all six saved PNG captures have valid dimensions and were visually inspected;
- new Phase 10 code, scenario, and documentation artifacts contain no non-ASCII text;
- renderer source contains no Node filesystem, local repository, authority ledger, process environment, child-process, or Electron imports;
- the production build completed after the renderer boundary scan.
