# Phase 39 - Hybrid Provider Runtime And Attached Terminals

Status: Complete at the `connected-observed` trust ceiling

## Outcome

H2A now supports two complementary provider execution surfaces without conflating their assurance:

- `structured-cli` remains the default governed task path for Claude Code, Codex, and Antigravity.
- `framework-stdio` remains the signed framework transport.
- `interactive-pty` is an explicit attached terminal for provider login, consent, and optional interactive work.

The terminal is hosted by the Electron main process. Closing, reloading, or detaching the renderer does not terminate it. Input and cancellation remain protected by live H2A authority and short-lived attachment leases.

## Architecture

`RuntimeTransportRegistry` exposes typed descriptors for all three transports and owns the `node-pty` Windows ConPTY adapter. `RuntimeAttachmentService` owns PTY lifecycle, authority checks, leases, telemetry normalization, bounded replay, process-tree termination, and evidence emission.

Persisted local records are stored under the active data root:

- `runtime/terminal-sessions.json`
- `runtime/terminal-leases.json`
- `runtime/terminal-events.json`
- `runtime/provider-config/<agent>/<provider>/` only for provider configuration that officially supports isolation

Codex receives an agent-specific `CODEX_HOME`. Claude Code and Antigravity retain their host provider configuration because this phase does not silently relocate or overwrite global state where a supported per-agent switch was not established.

The preload boundary exposes typed state, start, attach, detach, replay, input, resize, and cancel operations. Renderer code cannot select arbitrary executables or arguments. Provider adapters construct fixed official invocations and tests reject bypass, automatic approval, or permission-skipping flags.

## Attachment Governance

- Any number of current `observe` leases may attach.
- Only one client may own `interact` and `control` at a time.
- Leases carry client ID, connection generation, capability set, issue time, and expiry.
- Detach revokes the renderer attachment but leaves the host process running.
- Input and cancellation re-evaluate the active Passport, binding, runtime session, mandate, trace, workspace, and assignment authority.
- Passport, binding, runtime-session, or live-authority revocation terminates the PTY process tree and persists the final state.
- Renderer reload reattaches through bounded replay. A cursor older than retained history receives `snapshot-required`, never fabricated terminal output.

## Output And Evidence

Raw terminal data is redacted before persistence, split into bounded chunks, protected by pending-byte backpressure, and retained within global and per-session limits. Telemetry uses `started`, `output-reference`, `activity`, `awaiting-input`, `turn-complete`, `failed`, `cancelled`, and `exited` kinds under one canonical H2A run ID.

Evidence events store provider, transport, authority references, argument policy, configuration scope, trust mode, termination reason, and output hash. They do not store credentials or treat terminal visibility as stronger isolation. Attached host terminals visibly remain `connected-observed`.

## UI

The Command Floor agent Runtime inspector opens on `Structured CLI`. The operator may explicitly select `Attached terminal`, then choose `Login / consent` or `Start session`. The surface exposes transport, session, status, lease, terminal output, attach/detach, and stop state. Its footer states that detach does not stop the host process and that input/stop require current authority.

## Verification

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test:phase39`: production build and 20 tests across four files passed.
- Local official probes found Claude Code 2.1.216, Codex CLI 0.148.0, and Antigravity 1.1.19. Antigravity is truthfully `degraded`, not missing: its enabled user-level telemetry hook contains a Windows-incompatible command.
- Real Windows ConPTY spawn, input, resize, replay, and process-tree cancellation passed.
- Multiple observers, single input owner, detach/reattach, stale generation, cursor gap, backpressure, authority revocation, host restart, and revoked-control denial passed.
- Existing structured provider supervisor and provider-adapter regressions passed in the Phase 39 gate.
- Phase 33 through Phase 38 gates were rerun sequentially and passed.
- The final repository-wide single-worker regression passed 54 test files and 198 tests; one file and four tests remained intentionally skipped by their existing environment gates.
- Electron screenshots passed at `390x844`, `768x1024`, `1024x768`, and `1440x900` and were visually inspected.

The Phase 39 terminal controls expanded the connected Control registry from 87 to 93 controls. The existing Phase 33 build script regenerated and independently verified its Ed25519 baseline at `sha256:9e25f355fd6c0bdc08bec389e4db420c58b27bf36d410ed0e40d49210ab754a4`; Plan 3 still reports 8 complete phases and keeps Phases 31 and 32 open.

## Dependencies And Licensing

- `node-pty` 1.1.0, MIT
- `@xterm/xterm` 6.0.0, MIT
- `@xterm/addon-fit` 0.11.0, MIT

No Munder Dunder or Mosaic source, asset, bypass flag, or provider-launch code was copied for this phase. The implementation follows the recorded Plan 4 adaptation boundary and uses original H2A contracts and UI.

## Non-Claims

- PTY attachment does not raise trust above `connected-observed`.
- Host-provider authentication is not an H2A identity proof.
- H2A does not claim OS-level containment for an attached host terminal.
- Provider login or consent may still require the account owner when the official CLI requests it.
- Antigravity interactive tool use requires the account owner to repair or disable the incompatible user-level telemetry hook; H2A does not alter that file without approval.
- Plan 3 Phase 31 physical/operator checks and Phase 32 final ceremony remain assigned to Phase 44.
