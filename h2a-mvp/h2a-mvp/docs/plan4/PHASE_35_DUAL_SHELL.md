# Phase 35 - Dual Shell And Top-Left Mode Switch

Status: Complete

Date: 2026-08-26 Asia/Calcutta

## Result

H2A now has two reversible presentation shells over the same Phase 34 canonical snapshot and command facade. New data roots open in Office mode. Existing roots retain their previously persisted choice in `settings/appearance-preferences.json`.

Control mode remains the existing operational `AppShell` and all ten established routes remain unchanged. Office mode is a compact, full-bleed operational projection of the real `OfficeState`; it does not create agents, assignments, authority, evidence, or success records and it does not raise the `connected-observed` trust ceiling.

## Runtime Flow

```text
PresentationModeSwitch
        |
        v
ControlPlaneCommandFacade.execute(appearance.set)
        |
        v
H2AControlPlaneHost -> LocalAppearancePreferencesRepository
        |
        v
atomic settings/appearance-preferences.json
        |
        v
same canonical snapshot + same Office projection
        |
        +-> AppShell (Control)
        +-> OfficeShell (Office)
```

The React route, selected agent identifier, active canonical trace, and loaded workflow state live above both shells. Switching therefore remounts presentation only. `retainSelectedAgentId` preserves an existing valid selection across canonical refreshes and falls back only when that agent no longer exists.

## Components

- `PresentationModeSwitch` is a named two-button segmented control with Office and Control icons, `aria-pressed`, visible focus, and Left/Right/Home/End keyboard operation.
- `AppShell` retains all existing Control routes and places the switch at the top-left without changing the desktop workspace geometry.
- `OfficeShell` consumes only `OfficeState`, `AppearancePreferences`, `SystemStatus`, and the selected canonical agent. It displays actual identity, agent, assignment, context, approval, federation, trace, acceptance, storage, and evidence-integrity values.
- The Office refresh control invokes the same `workspace.refresh` command facade used by Control mode.
- User and operating-system reduced-motion preferences suppress transitions and animation.

## Security And Truth Boundary

- Presentation preference is non-security state scoped to `H2A_DATA_PATH`.
- Office mode has no domain repository, provider adapter, private key, credential, biometric token, prompt body, or output body.
- A shell switch cannot create or mutate Human Proof, Passport, runtime session, mandate, Context Grant, approval, federation, provider output, evidence, or acceptance state.
- Office trust remains capped at `connected-observed`; it renders `unverified` when canonical evidence does not support that ceiling.
- Empty roots display zero values and `No selected agent`; no preview or fabricated workplace is introduced.
- Munder-Difflin and Mosaic code/assets were not copied. Phase 35 uses original H2A React/CSS and Lucide icons already licensed by this repository.

## Acceptance

- `pnpm test:phase33`: signed baseline verified, 3 files and 5 tests passed.
- `pnpm test:phase34`: production build, 3 files and 8 tests passed.
- `pnpm test:phase35`: production build, 4 files and 10 tests passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `node scripts/verify-production-surface.mjs`: passed, 20 production renderer files scanned.
- Final serialized repository regression: 46 files passed, 1 credentialed file skipped; 172 tests passed and 4 credentialed tests skipped.
- Responsive Electron evidence was captured at `390x844`, `768x1024`, and `1440x900`; direct inspection found the scene nonblank, readable, non-overlapping, and free of horizontal overflow.
- Control parity evidence preserves the Phase 33 desktop workspace dimensions: 228 px sidebar, 86 px topbar, and unchanged remaining workspace width. The top-left switch is the approved shell addition.
- Security scans found no private-key, provider-secret, recovery-secret, biometric-token, prompt-body, output-body, preview-fixture, Munder, Mosaic, GPL, or Pixi markers in the Phase 35 implementation/evidence scope.

## Guided App Check

1. Launch a clean H2A data root and confirm Office is selected.
2. Use Left/Right or Home/End on the top-left switch and confirm Control opens immediately.
3. Open any Control route, switch to Office and back, and confirm the same route remains selected.
4. Restart H2A and confirm the last selected presentation returns for that data root.
5. Confirm Office counts, trace, trust, and selected-agent details match Control and do not claim success on an empty session.

These checks are automated in `tests/electron-presentation-shell-phase35.test.ts`; no operator-only acceptance remains for Phase 35.

## Exit

Switching is instant at the renderer boundary, reversible, atomically persistent, data-root isolated, accessible, reduced-motion aware, and behaviorally neutral. Phase 36 may replace the structural Office scene with the original PixiJS pixel engine without changing this shell or persistence contract.
