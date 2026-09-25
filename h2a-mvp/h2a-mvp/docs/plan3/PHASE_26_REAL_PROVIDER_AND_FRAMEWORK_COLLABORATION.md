# Phase 26 - Real Provider And Framework Collaboration

Status: Complete on 2026-08-22 Asia/Calcutta. Engineering, signed authority replacement, credentialed four-lane execution, restart recovery, and same-trace Demo Gate recognition passed at the `connected-observed` trust ceiling.

## Purpose

Phase 26 executes the four Phase 25 workload identities on the active ceremony trace. Any ready lane can run first or continue after another lane fails. Each run receives only output hashes from successful lanes already completed on the trace; final acceptance still requires all four mandatory lanes.

## Architecture

- `RealCollaborationCoordinator` owns only `collaboration/phase26-state-v1.json` and invokes public Identity, Mandate, Collaboration, Process Supervisor, Framework Connector, Ceremony, and Evidence ports.
- Provider processes use the fixed Phase 16 adapters. Renderer values cannot select an executable, arguments, working directory, environment, or prompt.
- Framework tasks pass through Connector Registry and Message Broker as an organization-signed task frame. The external process verifies it and returns runtime-signed result and acknowledgement frames.
- MCP uses the pinned official TypeScript SDK over stdio. Custom CLI uses a fixed JSON-line subprocess. A2A remains fail-closed until an HTTPS peer Agent Card is pinned.
- Every lane resolves an active Passport V2, connected binding, current runtime session, active mandate, and ceremony assignment before it can become ready.
- Expired mandates are immutable. `replaceAuthority` requires current Administrator / Approver Human Proof and credential authority, copies the exact prior scope into one new root plus three attenuated children for 120 minutes, rebinds the existing assignments through the public collaboration service, and records the replacement on the shared trace.
- The coordinator permits one ready lane at a time in operator-selected order. It snapshots successful prior lane output hashes for the new run and never passes predecessor response bodies or protected ceremony context.
- Output is bounded by Process Supervisor and connector schemas. Evidence stores references, status, and hashes rather than credentials or raw protected context.
- Trust remains `connected-observed`; this phase does not claim governed Windows isolation.

## UI And IPC

- Command Floor includes a ceremony-bound Phase 26 console with MCP/custom CLI selection, preflight, independent ready-lane commands, cancellation, retry, health/version, authority links, status, and output hashes.
- Typed preload methods expose get, prepare, replace-authority, run-lane, cancel-lane, and framework execute operations.
- There is no renderer method for `recordCollaboration`, connector signing keys, raw executable selection, or manual completion insertion.

## Verification

- `tests/real-collaboration-phase26.test.ts` launches real custom CLI and official MCP subprocesses and verifies signed task/result/acknowledgement delivery, zero disclosure, dependency references, ledger integrity, and A2A prerequisite denial.
- `tests/process-supervisor-phase16.test.ts` covers real process cancellation, timeout, Passport/session revocation, inactive authority, workspace containment, environment minimization, and bounded output.
- `tests/guided-bootstrap-phase25.test.ts` proves stale-proof denial, immutable expired records, same-scope replacement, assignment rebinding, duplicate prevention, and restart reconstruction through real services.
- `tests/product-surface-phase23.test.ts` accounts for all 139 renderer button declarations and validates each connected Phase 26 command against preload and main IPC.
- `pnpm typecheck`, `pnpm lint`, production build, and `pnpm test:phase26` pass.

## Production Preflight

Session `phase23-guided-20260821175015` resolved the existing ceremony and all four Passport/session/mandate/assignment chains with no horizontal overflow.

- Claude Code: ready, version `2.1.216`.
- OpenAI Codex: ready, version `0.148.0`.
- Official MCP SDK: ready.
- Antigravity: ready, version `1.1.17`; user confirmed a real authenticated stream-JSON run with status `SUCCESS` and exact response `ANTIGRAVITY_READY` after disabling the incompatible telemetry hook.

The incompatible telemetry hook is reversibly disabled as `hooks.json.disabled`, with `hooks.json.backup` retained. No credential value was exposed or stored by H2A.

## Acceptance Result

Claude, Antigravity, the official MCP framework participant, and Codex produced real successful durable run records on ceremony `ceremony_c3ad55dc-a544-4b51-958a-0583c80b5902` and trace `phase22_234eca22-ff97-4764-891b-763af7e2d82b`. Codex received only predecessor output hashes. Restart reconstructed all run IDs, hashes, authority references, and terminal states. Demo Gate recognized the three same-trace provider runs and same-trace framework evidence without raising trust above `connected-observed`.
