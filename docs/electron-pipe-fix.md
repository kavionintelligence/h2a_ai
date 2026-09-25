# Electron refresh and pipe lifecycle repair

The reported failure was `EPIPE` at `flushControlPlaneRefresh` in the built Electron main process. Inspection showed that this refresh is **in-process**: it loads canonical H2A state and updates the control-plane projection. It does not write to a child process's stdin.

## Reproduced failure and feedback loops

The original refresh function caught a state-load error and called `console.error`. When the launcher's inherited stderr pipe was closed, that error-reporting write could itself throw `EPIPE`, escaping the catch block and rejecting the unawaited timer callback. The regression extracted the actual source function, forced a refresh failure, and supplied a closed/failing error-output pipe. Both recovery assertions failed before the fix with `Error: write EPIPE`. This reproduces the reported failure location; the user's complete original stack and underlying state-load error were not available.

Inspection also found two independent refresh feedback loops:

- `RealCollaborationCoordinator.getState()` reconciled state, assigned a fresh `updated_at`, and wrote the state file on every read, even when nothing changed.
- `HumanEscalationCoordinator.getState()` compared a projection with a newly assigned timestamp against the old state whenever an approval reference existed, causing timestamp-only writes.

The filesystem watcher observes these files. An unchanged read therefore scheduled another refresh, which performed another unchanged write. Both coordinators now compare meaningful state before persisting. Unchanged reads preserve their original timestamp and file; a real provider/approval transition still persists and is observed normally. The watcher, refresh execution, IPC updates, and safety polling remain enabled.

## Main-process diagnostics

`apps/desktop/main/diagnostics.ts` provides `DurableDiagnostics`. The main process uses it at the refresh, watcher, project-provider and startup error boundaries.

Every error is appended to:

```text
<H2A_DATA_PATH>/.electron-user-data/logs/main.jsonl
```

When `H2A_DATA_PATH` is unset, the existing desktop data root is `h2a-mvp/h2a-mvp/data/h2a-demo`. The `.electron-user-data` subtree is already excluded by the refresh watcher, so diagnostic persistence does not create another refresh loop.

The logger checks writable, destroyed, closed and ended state before stderr output. It observes synchronous exceptions, asynchronous error events and write-callback errors. `EPIPE` or a terminal stream state detaches that pipe permanently; later diagnostics continue to the file without repeatedly writing to the broken pipe. A still-open stream reporting `EAGAIN` receives a short cooldown; subsequent diagnostics can use it again. A `false` write return is treated as backpressure and waits for `drain`, never as permission to repeat bytes. Original refresh errors remain recorded, including when stderr is unavailable. Credential-like values are redacted. A disk error is retained in diagnostic status without recursively writing to the same failing pipe.

## Actual subprocess lifecycle fixes

Separate inspection found real unsafe stdin writes in the connector transports and provider supervisor. These are additional defects, not a fabricated child process inside the refresh function.

`LocalProcessTransport` and `DirectProcessTransport` now use a private `ProcessChannel` that owns one child generation. It installs spawn/error/exit/close and stream listeners immediately, validates child and writable-stream state, waits for write callbacks, handles backpressure, bounds startup/write/response waits, rejects pending operations on failure, clears stale transport references and cleans up readers/streams. Only a later explicit delivery can create a replacement child. A failed request is never silently replayed, and concurrent requests cannot mix responses on the same transport.

`ProcessSupervisor` observes spawn failure before checking the PID or awaiting persistence, installs process/stream listeners before a running record can be interrupted, validates stdin before ending it, and settles a pending flush on callback, error, close, exit or a bounded timeout. It records pipe failure, releases the active run, terminates the child and preserves failure evidence. Duplicate late callbacks do not create duplicate completion or implicit retries. The next authorized explicit start may create a new run. Asynchronous persistence errors surface through the normal status/diagnostic boundary instead of becoming unhandled callback rejections.

## Changed source and regression files

All paths below are relative to `h2a-mvp/h2a-mvp/`:

| File | Purpose |
| --- | --- |
| `apps/desktop/main/diagnostics.ts` | Durable diagnostics and guarded stderr output |
| `apps/desktop/main/index.ts` | Use diagnostics at the actual refresh/error boundaries |
| `packages/agents/src/realCollaborationCoordinator.ts` | Stop unchanged read/write refresh feedback |
| `packages/agents/src/humanEscalationCoordinator.ts` | Stop timestamp-only approval reconciliation writes |
| `packages/agents/src/processSupervisor.ts` | Spawn and raw-input lifecycle, pipe failure and pending-write settlement |
| `packages/messaging/src/processChannel.ts` | Shared private child generation / JSON pipe lifecycle |
| `packages/messaging/src/localProcessTransport.ts` | Guarded persistent connector transport |
| `packages/messaging/src/directProcessTransport.ts` | Guarded one-shot framework transport |
| `tests/control-plane-diagnostics.test.ts` | Exact refresh regression, closed streams, async EPIPE, EAGAIN, drain, late errors, durable evidence and redaction |
| `tests/control-plane-refresh-persistence.test.ts` | Unchanged state reads preserve content/mtime; actual changes still persist |
| `tests/human-escalation-refresh-persistence.test.ts` | Pending/approved/rejected reconciliation preserves unchanged file bytes/mtime and persists actual approval transitions |
| `tests/process-transport-lifecycle.test.ts` | Connector spawn, exit, close, failure, timeout, backpressure and explicit replacement |
| `tests/process-supervisor-phase16.test.ts` | Existing native supervision plus missing executable, dead stdin, async errors, stuck callback and explicit replacement regressions |
| `tests/electron-main-diagnostics.test.ts` | Actual Electron launch, closed launcher stderr, repeated state errors, recovery after repair, and preserved authentication boundary |

## Executed checks and limits

- Before the logging fix: both exact refresh-function regressions failed with `write EPIPE`.
- After the logging fix: **9 diagnostic regressions passed** using actual Node `Writable` behavior in addition to the extracted refresh function.
- Initial refresh persistence regressions: **2 passed**, verifying unchanged bytes/mtime and real provider transitions.
- Human escalation persistence regressions: **2 passed**. Combined with existing human-escalation recovery, diagnostics and collaboration-persistence regressions: **15 passed** across four files.
- Connector lifecycle and existing connector/context/framework regression selection: **33 passed**, including **17 new lifecycle tests**. Evidence: `../.test-artifacts/process-transport-tests.txt`.
- An elevated Windows run of native supervision, diagnostics, refresh persistence and optional live-provider tests: **21 passed, 4 skipped**, no failures. The skipped live-provider tests are opt-in tests, not simulated successes.
- Native Node TypeScript check passed after the pending-write settlement fix. Root Electron build and full browser TypeScript checks also passed.
- Final elevated native supervision run: **17/17 passed**, including seven added pipe/spawn regressions and the original process termination/revocation checks. [Retained test output](../.test-artifacts/process-supervisor-pipes-tests.txt).
- Actual Electron regression: **passed**. A real login window stayed alive after closing the launcher's stderr reader and three independently triggered state-file errors. Original errors and the actual pipe failure remained on disk; restoring the file recovered normal IPC. An administrator-only operation still denied the unauthenticated caller. No authentication bypass, production hook or mocked Electron process was used. [Recorded result](../.test-artifacts/electron-main-diagnostics-1790272514642/result.json).

The final full native run completed with **351 passed, 31 failed, 4 skipped**. All **48 pipe/refresh/lifecycle regressions passed** inside that run, including actual Electron recovery. [Verification](verification.md) and the [individual failure table](h2a-full-suite-failures.md) preserve the remaining failures and targeted rerun findings. This is not an all-green acceptance claim; browser governance success does not certify every desktop workflow.

The two newly failing full-suite desktop scenarios (`electron-collaboration-phase41` and `electron-office-native-phase50`) passed unchanged in a targeted rerun (**2/2**). Separate temporary instrumented copies also passed and recorded ordinary explicit shutdown with exit code zero, empty main diagnostics and no renderer crash. Their full-suite early closure remains unreproduced; no further production change was made. [Original test output](../.test-artifacts/electron-targeted-rerun.txt) is retained, and diagnostic copies were moved out of the test tree.

Discovery, explicit Census import, H2A identity mapping, policy, approval and memory integration remain separate from these runtime repairs. The root [README](../README.md) documents the integrated application; [changed-files.md](changed-files.md) includes this repair in the complete manifest.
