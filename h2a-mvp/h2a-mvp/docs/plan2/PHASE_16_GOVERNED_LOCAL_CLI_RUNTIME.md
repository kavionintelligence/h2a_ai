# Phase 16 - Supervised Local CLI Runtime

Status: complete at `connected-observed`; `governed` remains unverified

## Purpose

Phase 16 replaces provider definitions and manual probes with real H2A-controlled execution for the official Claude Code, OpenAI Codex, and Antigravity CLIs. The trusted Electron main process owns launch authority, process lifecycle, output capture, evidence, cancellation, timeout, and revocation. The renderer can submit a bounded task request but cannot supply an executable, arguments, environment, shell, or unrestricted working directory.

## Trust Result

All three live lanes are classified `connected-observed`.

- Real provider processes execute and return structured output.
- Active Passport V2, runtime binding, runtime session, attestation, mandate, agent, provider, and workspace references must agree before launch.
- H2A records process lifecycle and minimized execution evidence.
- Cancellation, timeout, passport revocation, binding revocation, and session revocation terminate the actual process tree.
- Host CLI execution is not the Phase 11 digest-pinned container boundary and does not pass through an H2A credential gateway. Therefore it cannot be called `governed`.

## Components

| Component | Responsibility |
|---|---|
| `packages/contracts/src/live-runtime.ts` | Strict provider, request, status, output, lifecycle, and public-state contracts. |
| `packages/agents/src/liveProviderAdapters.ts` | Discover official binaries and build fixed provider-specific invocations. |
| `packages/agents/src/processSupervisor.ts` | Authorize, launch, stream, bound, persist, terminate, recover, and evidence real processes. |
| Electron main/preload | Keep process authority outside the renderer and expose schema-validated state/start/cancel IPC. |
| Command Floor Runtime tab | Show provider health, prompt, trust class, run/stop actions, output, and terminal reason. |

## Launch Workflow

1. The renderer submits provider, agent, Passport, binding, session, mandate, trace, workspace, prompt, optional model, and timeout.
2. The main process parses the request with the strict contract and asks the runtime authority adapter to validate current evidence integrity and every identity/authority reference.
3. The supervisor confirms the workspace is inside the approved application root and denies a second active process for the same runtime session.
4. The selected adapter resolves only its official executable and creates a fixed restricted argument list. No request field can become a command or flag.
5. The supervisor creates an allowlisted environment, excluding unrelated host secrets, starts the process without a shell, and persists the starting/running lifecycle.
6. Bounded stdout/stderr records stream into `runtime/live-output.json`; the UI polls only the trusted public projection.
7. Completion, failure, timeout, cancellation, or revocation records a minimized evidence event before the terminal state becomes visible.

## Fixed Provider Policies

| Provider | Executable boundary | Fixed restrictions |
|---|---|---|
| Claude Code | official `claude.exe` | print/stream JSON, plan permission, tools disabled, safe mode, no session persistence |
| OpenAI Codex | official package JavaScript entry launched directly by Node | exec JSON, read-only sandbox, ephemeral session, user config ignored, workspace bound |
| Antigravity | official `agy.exe` | print/stream JSON, plan mode, sandbox, slash commands disabled, bounded print timeout |

Claude and Codex probe as ready on this machine. Antigravity completes real tool-free structured work but remains `degraded` because an enabled user-level telemetry hook contains a Windows-incompatible command. H2A does not modify user provider configuration without approval.

## Lifecycle Enforcement

- Operator cancellation calls the supervisor, marks the run cancelled, and kills the process tree.
- The execution timer marks the run timed out and kills the process tree.
- Passport suspension/revocation terminates all matching live runs.
- Runtime binding disconnection terminates all matching live runs.
- Runtime session rotation/revocation terminates the prior session's live runs.
- Host restart converts orphaned starting/running records to failed recovery records; it never pretends they are still controlled.
- Application shutdown terminates all active supervised process trees.

## Data And Privacy

| Location | Contents |
|---|---|
| `runtime/live-runs.json` | Versioned lifecycle records, references, hashes, executable version, policy labels, environment key names, and terminal reason. |
| `runtime/live-output.json` | Bounded/redacted local output records for the Runtime tab. |
| `traces/*.jsonl` | Hash-linked lifecycle evidence without prompt text, credentials, private keys, or full output. |
| `docs/plan2/evidence/phase16-*-live-proof.json` | Minimized live provider proof containing hashes and integrity state only. |
| `docs/plan2/evidence/phase16-live-process-termination-proof.json` | Actual cancellation/revocation terminal states and evidence-chain integrity. |

The provider prompt is passed directly as one process argument and is represented in evidence only by SHA-256. The environment contains only required operating-system paths plus non-secret H2A runtime flags. Provider credentials remain under each official CLI's own authenticated account storage and are never copied into H2A state.

## Munder-Difflin Adaptation

No Munder-Difflin source was copied. H2A reimplemented the useful MIT-licensed process concepts after reviewing:

- `src/main/pty.ts` for provider process ownership and streamed terminal lifecycle;
- `src/main/procKill.ts` for cross-platform process-tree cleanup;
- `src/main/shellEnv.ts` for deliberate environment construction;
- `src/main/hooks.ts` and `src/main/hive.ts` for lifecycle notification and coordination boundaries;
- `src/shared/providerAutomation.ts` and its recovery tests for provider-specific automation policy and failure handling.

Munder exposes a flexible terminal office. H2A narrows that model: no renderer-controlled shell, no arbitrary command or argument forwarding, no implicit authority, and no acknowledgement without H2A identity, session, mandate, lifecycle, and evidence references.

## Verification

- Unit tests prove fixed adapter arguments, absence of dangerous bypass flags, workspace containment, environment secret stripping, authority denial, real output streaming, timeout, operator cancellation, and passport/binding/session revocation.
- Opt-in live tests prove official Claude Code `2.1.216`, Codex CLI `0.148.0`, and Antigravity `1.1.16` return real structured output through the supervisor.
- A fresh opt-in test proves cancellation and revocation stop official Claude process trees.
- Desktop `1440x900` and mobile `390x844` checks show a contained Runtime panel with no horizontal overflow.

## Non-Claims And Follow-Up

- Phase 16 does not claim provider execution is `governed`.
- The digest-pinned Docker/WSL containment proof demonstrates enforceable isolation capability, not that these authenticated host CLI runs used it.
- H2A Gateway credential brokering and protected tool/network mediation remain required before a provider may become `governed`.
- Gemini API authentication and Cursor Agent remain explicitly deferred.
- Antigravity's user telemetry hook should be repaired or disabled only with user approval, then its tool-enabled path must be re-tested.
- Phase 19 still owns production Context Grants and prompt/context leakage tests; Phase 22 owns the real cross-provider, cross-human final scenario.
