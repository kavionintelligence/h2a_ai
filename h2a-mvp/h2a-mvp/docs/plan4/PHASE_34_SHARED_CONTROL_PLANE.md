# Phase 34 - Shared Renderer State And Command Facade

Updated: 2026-08-26 Asia/Calcutta

## Result

Phase 34 is complete. H2A now has one trusted main-process control-plane host that supplies a schema-validated canonical snapshot plus a derived Office projection to renderer clients. The current Control renderer consumes that host through one command facade; the Office shell introduced in Phase 35 will consume the same snapshot and facade rather than creating a second repository or success state.

No ceremony, identity, mandate, approval, provider output, or evidence record was seeded or promoted by this phase. Presentation settings are the only new persisted data and remain non-security preferences under the active `H2A_DATA_PATH`.

## Architecture

```text
Canonical domain read models
        |
        v
H2AControlPlaneHost (trusted Electron main process)
        |-- schema validation and canonical hash
        |-- aggregate version and monotonic event cursor
        |-- bounded 128-event replay window
        |-- short-lived capability-scoped attachments
        |-- persisted appearance preference adapter
        |
        +--> ControlPlaneSnapshot --> Control renderer
        |                           via ControlPlaneCommandFacade
        |
        +--> OfficeProjectionService --> OfficeState
                                      (Phase 35+ renderer)
```

`H2AControlPlaneHost` owns current state, event order, attachment generations, and command admission. A renderer receives a snapshot and then minimized event envelopes. A gap causes bounded replay; an old cursor, ahead cursor, or host restart requires snapshot replacement. Stale, expired, superseded, and disconnected attachments cannot execute commands or present cached completion as current.

## Public Protocol

- Protocol version: `1`.
- Transport: typed Electron IPC through the existing context-isolated preload.
- Supported capabilities: `workspace.observe`, `workspace.refresh`, `appearance.read`, and `appearance.write`.
- Attach requests explicitly request capabilities; the response records only granted capabilities.
- Capability discovery describes host support and does not grant Human Proof, Passport, mandate, Context Grant, approval, or provider authority.
- Event envelopes contain event/host/aggregate IDs, sequence, version, time, topic, changed domain names, optional evidence reference, and canonical hash. They contain no biometric data, provider credentials, protected values, prompts, outputs, or terminal bodies.
- The host and Office projection are capped at `connected-observed`. Renderer preferences cannot raise trust.

## Persisted Preferences

`settings/appearance-preferences.json` is an atomic, versioned record scoped to the active data root. It stores:

- `presentation_mode`: `control | office`;
- reduced-motion preference;
- camera position;
- zoom;
- inspector width;
- update timestamp.

Older Phase 34 preference records are read with schema defaults for the added viewport fields. No Office domain repository exists.

## Build Mapping

- Contracts: `packages/contracts/src/control-plane.ts`, `office.ts`, `presentation.ts`, and `guided-workflow.ts`.
- Host: `packages/control-plane/src/h2aControlPlaneHost.ts`.
- Projection: `packages/office/src/officeProjectionService.ts`.
- Persistence: `LocalAppearancePreferencesRepository` in `packages/storage/src/index.ts`.
- Public boundary: `apps/desktop/main/index.ts`, `apps/desktop/preload/index.ts`, and `H2ADesktopApi`.
- Renderer facade: `apps/desktop/renderer/src/control-plane/commandFacade.ts`.
- Coordinated renderer consumption: `apps/desktop/renderer/src/App.tsx`.

## Verification

`pnpm test:phase34` builds production main/preload/renderer bundles and passes eight tests across three files. Coverage includes malformed canonical state, projection, trust cap, protocol mismatch, scoped capabilities, lost update, event gap, bounded replay, snapshot fallback, stale generation, expiry, disconnect denial, command-to-public-IPC mapping, preference persistence, restart recovery, host generation replacement, and data-root isolation.

The Electron test launches the real packaged development entry three times across two clean data roots. It verifies canonical parity with the existing public collaboration API, receives a real appearance event, denies stale/disconnected commands, preserves Root A preferences after process restart, and keeps Root B at independent defaults.

The Phase 33 signed baseline and focused regression suite pass unchanged. Typecheck, ESLint, production build, Phase 34 tests, and the complete aggregate regression pass. The final single-worker aggregate run passed 44 files and 169 tests with one credentialed file and four credentialed tests intentionally skipped. An earlier load-affected run timed out one Phase 31 connector-restart assertion; the exact file passed independently and the final aggregate rerun passed cleanly.

## Exit

The shared snapshot contains both canonical Control data and the derived `OfficeState`; both renderer modes can consume those same IDs, hashes, statuses, trust posture, and commands. Phase 35 may add the dual shell and switch without adding a second data source.

Phase 34 does not claim that the Office UI, pixel engine, live projection, guided workflows, attached terminals, or governed project delivery already exists. Those remain Phases 35 through 41. Plan 3 Phase 31 required-liveness/withdrawal acceptance and Phase 32 final ceremony remain assigned to Phase 44.
