# Phase 36 - Original Pixel Office Engine

Status: Complete

Date: 2026-08-26 Asia/Calcutta

## Result

Office mode now renders an original H2A 2D pixel office through PixiJS 8.20.1. The scene is a renderer-only projection over the Phase 34 canonical snapshot. It does not own or persist humans, agents, assignments, authority, context, federation, evidence, or acceptance state.

The office includes an original procedural floor, six operational zones, six provider/flexible desks, provider-labelled screens, deterministic character seats, bounded camera controls, BFS grid paths, resize handling, low-power idle, reduced-motion behavior, and bounded WebGL recovery. A visible DOM entity roster remains available when the canvas is unavailable and provides equivalent agent-selection actions.

## Runtime Flow

```text
ControlPlaneSnapshot
       |
       +-> OfficeProjectionService -> OfficeState
       |
       +-> canonical collaboration.workplace.agents
                 |
                 v
       buildOfficeSceneModel
                 |
        +--------+---------+
        |                  |
        v                  v
OfficeSceneEngine     DOM entity roster
Pixi canvas           accessible inspection/actions
```

`OfficeSceneEngine` never calls a repository, provider adapter, evidence writer, or protected command. Agent activation returns only the selected canonical agent identifier to the existing presentation-neutral React state.

## Engine

- `officeTheme.ts` owns the original grid, palette, zone geometry, provider station geometry, walkability, and tile/world conversion.
- `pathfinding.ts` performs deterministic four-direction BFS over the original walkability grid.
- `seatAllocation.ts` assigns each canonical agent to its provider station first, then a deterministic flex/overflow seat.
- `OfficeCamera.ts` implements bounded pan, zoom, fit/reset, and viewport clamping.
- `sceneLifecycle.ts` owns testable low-power ticker policy and bounded context-loss recovery.
- `OfficeSceneEngine.ts` mounts Pixi, draws the procedural map and characters, animates only initial movement to a seat, handles resize and interaction, enters idle when movement ends, and tears down all GPU/observer/event resources on remount.
- `PixelOfficeScene.tsx` owns React lifecycle, recovery generation, named camera controls, live render state, and the accessible entity list.

The Pixi `unsafe-eval` compatibility module is imported because Pixi requires its CSP-compatible shader evaluator under H2A's Electron policy. H2A does not loosen the page CSP or provider/runtime governance to render the scene.

## Accessibility And Responsive Behavior

- Seven named icon controls provide zoom, four-direction pan, and camera reset without requiring drag or wheel precision.
- Canvas pointer pan and wheel zoom remain optional enhancements.
- The canvas is excluded from the accessibility tree and represented by a named image region plus a visible DOM roster.
- Six zones, six stations, and every canonical agent remain inspectable as text. Agent entries are real buttons that update the same selected-agent state as Control mode.
- Compact presentation controls retain explicit accessible names when their visible labels collapse.
- Operating-system or persisted reduced motion snaps characters to seats and keeps the ticker idle.
- Mobile/tablet layouts preserve a stable canvas, horizontal entity roster, normal-flow inspector, and no document-level horizontal overflow.

## Asset And Licensing Boundary

The scene uses Pixi `Graphics` and `Text`; no bitmap map, tileset, sprite sheet, font, sound, brand, product copy, or recolored reference asset is shipped.

`docs/plan4/assets/phase36-asset-manifest.json` records source, author, license, modification status, and SHA-256 for the original procedural theme. `scripts/verify-phase36-assets.mjs` verifies that declared source hash and compares H2A application files against all 15 hashes under the prohibited Munder `src/renderer/src/assets` tree.

Munder's MIT code was read only at the specific Plan 4 reference paths for lifecycle concepts. Its bundled LimeZu assets, maps, characters, branding, names, and copy were not copied, transformed, imported, or shipped. Mosaic code and assets were not read or used for Phase 36.

## Security And Truth Boundary

- Scene animation cannot create success, approval, authority, evidence, or trust.
- Initial character movement means only that a canonical agent was placed at a deterministic desk. Phase 37 owns truthful runtime/status effects.
- Labels contain provider/station names and canonical agent summary fields only; protected artifact values, biometric material, credentials, prompt bodies, response bodies, and private keys never enter the scene.
- WebGL context loss rebuilds presentation only. Canonical state remains host-owned and is reapplied after remount.
- The scene stops its ticker while hidden, outside the viewport, reduced-motion, or without moving characters.
- Trust remains `connected-observed` or `unverified`; Office rendering cannot raise it.

## Acceptance

- `pnpm test:phase33`: signed Plan 3 carry-forward baseline passed before implementation.
- `pnpm test:phase34`: canonical control-plane production acceptance passed before implementation.
- `pnpm test:phase35`: dual-shell build, restart, responsive, and 100-switch stress acceptance passed before and after Phase 36.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with zero findings.
- `pnpm test:phase36`: production build, 2 files and 7 tests passed.
- Required canvas PNG analysis found more than 12 sampled colors at `390x844`, `768x1024`, `1024x768`, and `1440x900`.
- Resize, toolbar zoom/pan/reset, context loss, WebGL remount, Control/Office remount, low-power idle, reduced motion, named controls, entity roster, and horizontal-overflow checks passed in real Electron.
- Asset verification passed: 1 original asset definition, 15 prohibited reference hashes, 153 H2A application files scanned, 0 violations.
- The legacy Phase 23 surface registry and Phase 25 Electron bootstrap passed together after the Plan 4 source inventory was updated.
- Final complete-set acceptance passed every non-opt-in test: the Phase 25 production Electron ceremony passed in a fresh isolated process, then the remaining serialized run passed 47 files and 178 tests; combined totals are 48 files and 179 tests passed, with 1 credentialed file and 4 credentialed tests skipped by design.

Evidence is under `docs/plan4/evidence/phase36/`.

## Guided App Test

1. Launch H2A on any data root and select Office.
2. Confirm the original floor, six zones, six stations, and the right-side canonical inspector render.
3. Use the seven camera controls and optional canvas drag/wheel input.
4. Inspect the Office entities roster without relying on the canvas. Select any listed real agent and confirm the inspector changes to that same agent.
5. Switch to Control and back. Confirm the Office canvas remounts and the selected canonical agent remains selected.
6. Enable operating-system reduced motion and confirm the status reads `Low-power idle` after render.
7. Resize through mobile, tablet, and desktop sizes and confirm controls, canvas, roster, inspector, and command dock remain operable.

All non-physical Phase 36 checks are automated. No provider login, camera ceremony, secret entry, or operator-only acceptance is required for this renderer phase.

## Exit

The original office renders reliably in a production Electron process, survives resize/context loss/remount, idles when inactive, remains inspectable and operable without canvas, and contains no restricted copied asset. Phase 37 may now add detailed canonical status effects without changing this engine's persistence or trust boundary.
