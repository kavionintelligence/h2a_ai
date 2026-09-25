# Verification record — 2026-09-24

Executed on Windows with Node 24.21, Python 3.12 and isolated Chrome/Electron
test profiles. Results below distinguish actual running configuration from test
sources. No populated live external discovery is claimed.

## Subsequently requested four-agent demo fleet

The explicit `npm.cmd run demo:agents` profile starts four running local A2A
services with clearly labelled simulated planning, tools and evidence. It uses
the existing Census engine and H2A workflow; it does not insert discovery records
or automatically register agents. Default `npm.cmd run dev` remains unchanged.

| Check after adding the fleet | Result |
| --- | --- |
| Full Census suite including 15 new fleet cases | **125 passed** |
| Ruff / mypy | Passed / passed, 14 source files |
| H2A governance guards | **13 passed** |
| Existing cross-process HTTP lifecycle | **1 passed** |
| Actual fleet browser lifecycle | **1 passed**; all four agents explicitly imported, bound to Priya, passported, mandated and added to one room |
| Policy, approval, memory and trace | Allowed research executes; denied and pending/rejected requests do not execute; approval executes once; reviewed memory and correlated events persist |
| H2A process restart in browser test | Complete governance snapshot unchanged |
| Integrated / native node / native web TypeScript | All passed |
| Browser/API production build | Passed |
| Actual presenter launcher | All three health endpoints return 200; q stops all owned services; restart preserves all four Census IDs |
| Actual presenter browser | Starts Ready to scan; Scan returns four shadow agents with zero source errors; inspect offers Register in H2A; reload clears the presentation; no browser JS errors |
| Presenter state left ready | Zero H2A imports, bindings, passports or mandates; all four discoverable for manual onboarding |

The actual fleet test runs on isolated storage and reports no browser JS, console
or unexpected network errors. Evidence:
[browser/API observations](../.test-artifacts/demo-fleet-9a8cd5ae-9825-4be2-aed2-36452d849177/browser-evidence.json),
[four-agent state](../.test-artifacts/demo-fleet-9a8cd5ae-9825-4be2-aed2-36452d849177/final-state.json),
[browser trace](../.test-artifacts/demo-fleet-9a8cd5ae-9825-4be2-aed2-36452d849177/browser-trace.zip),
[live presenter inventory](../.test-artifacts/live-demo-fleet-inventory.png),
[live presenter UI check](../.test-artifacts/live-demo-fleet-ui.json),
[launcher restart check](../.test-artifacts/live-demo-fleet-restart.json),
[Census tests](../.test-artifacts/census-demo-fleet-pytest.txt),
[Ruff](../.test-artifacts/census-demo-fleet-ruff.txt),
[mypy](../.test-artifacts/census-demo-fleet-mypy.txt).

The full native Electron suite was not rerun for this fleet-only addition; its
previous result and known failures remain documented below. No H2A production
source was changed for the fleet. The model execution is simulated; HTTP
discovery, native classification, governance and persistence are actual behavior.

Run `npm.cmd run test:demo:agents` to repeat the fleet browser lifecycle.
See the [demo walkthrough](demo-agents.md) for presentation steps.

## Integrated application

| Check | Executed result |
| --- | --- |
| Full Census suite | **110 passed** |
| Census Ruff | Passed |
| Census mypy | Passed, 13 source files |
| H2A governance service integration | **13 passed** |
| Cross-process HTTP lifecycle | **1 passed**, including process restarts |
| Browser lifecycle | **1 passed**, including two explicitly imported agents, owner/passport/mandate, room, all approval/review states, outage/retry and stale inventory |
| Integrated TypeScript | Passed |
| Native H2A web TypeScript | Passed |
| Native H2A node TypeScript | Passed after final transport fixes |
| H2A browser/API production build | Passed |
| Electron production build | Passed after final transport fixes |
| Complete native H2A suite | **351 passed, 31 failed, 4 skipped** (386 tests) |
| Pipe/refresh/child-lifecycle regressions within full suite | **48 passed**, across six files |
| Original real-only UI -> H2A -> Census configuration (before optional fleet) | Passed: 0 configured sources, 0 entities, honest warning, empty registry; reload returns Ready to scan |
| Default launcher start/stop | Passed, both services ready; q stops both |
| Reset while running | Correctly refused |
| Reset while stopped | Passed; archived integration-data and did not change source services |

Census final output: [census-final-results.txt](../.test-artifacts/census-final-results.txt).

HTTP lifecycle state and logs:
[final-state.json](../.test-artifacts/lifecycle-42e8f424-e67c-47ca-9222-e8b2690de9a6/final-state.json),
[service.log](../.test-artifacts/lifecycle-42e8f424-e67c-47ca-9222-e8b2690de9a6/service.log).

Final browser integration evidence:
[API/error observations](../.test-artifacts/browser-bec0d45e-f523-487a-a8b5-7b206d1e1c6d/browser-evidence.json),
[final state](../.test-artifacts/browser-bec0d45e-f523-487a-a8b5-7b206d1e1c6d/final-state.json),
[Playwright trace](../.test-artifacts/browser-bec0d45e-f523-487a-a8b5-7b206d1e1c6d/browser-trace.zip),
[discovery inspector](../.test-artifacts/browser-bec0d45e-f523-487a-a8b5-7b206d1e1c6d/01-discovery-shadow.png),
[room](../.test-artifacts/browser-bec0d45e-f523-487a-a8b5-7b206d1e1c6d/03-room-research-and-denial.png),
[reviewed memory](../.test-artifacts/browser-bec0d45e-f523-487a-a8b5-7b206d1e1c6d/07-reviewed-company-memory.png),
[identity trace](../.test-artifacts/browser-bec0d45e-f523-487a-a8b5-7b206d1e1c6d/08-complete-identity-trace.png),
[mobile discovery](../.test-artifacts/browser-bec0d45e-f523-487a-a8b5-7b206d1e1c6d/10-mobile-discovery.png),
[outage](../.test-artifacts/browser-bec0d45e-f523-487a-a8b5-7b206d1e1c6d/11-service-unavailable.png).

The browser reported zero unexpected JS errors, console errors or network
failures. One intentional HTTP 503 verifies outage handling. Mobile layout is
checked after the viewport resize has reached a rendered frame.

Original configuration, before the subsequently requested optional demo fleet:
[native scan](../.test-artifacts/census-actual-configuration/verification.json),
[running UI scan](../.test-artifacts/live-empty-scan.json),
[screenshot](../.test-artifacts/live-empty-scan.png).

## What the integration tests prove

- Scan makes real protocol requests from the existing Census engine to test-only
  A2A, MCP and API endpoints. Runtime observations are explicitly test telemetry.
- A new Discovery page makes no scan request, and no prior inventory is hydrated.
- Scanning leaves H2A registry empty. Non-agent import is rejected.
- Import creates a distinct H2A ID, preserves the complete native record/history
  byte-for-value, and remains idempotent after reload and restart.
- Census shadow/registered classification is unchanged by H2A governance.
  Stale entities remain visible; source errors preserve successful results.
- Priya's binding is a real persisted record. Passport requires that binding and
  valid H2A identity; signed passport is independently retrievable after restart.
- Native signed policy permits web_search, requires approval for external_share,
  denies crm_write/purchase, and rejects unknown actions.
- Room peers must already be discovered, explicitly imported and governed.
  Browser test selects Product Intelligence Agent in addition to Marketing
  Research Agent and Priya.
- Pending and rejected approvals have zero executions. Approval executes once;
  replay does not execute again or broaden the mandate.
- Unreviewed memory remains proposed. Approve, Edit & Approve and Reject persist
  distinct outcomes, provenance and reviewer/timestamps.
- H2A ledger events retain H2A identity across all downstream objects. Census
  discovery history and immutable original evidence are separately visible in
  the trace, linked by census_agent_id.
- Revoked/expired/tampered authority, actor spoofing, cross-origin writes and
  incomplete prerequisites fail. Durable execution receipts support bounded
  recovery without double simulated execution.
- Census outage/restart/Retry and browser reload never create duplicate agents.

Default startup imports no test peers, ingests no synthetic runtime events,
and never opens the archived validation databases. The demonstration's research
and external-share execution remain clearly labelled simulations; governance
decisions are real.

## Full native H2A suite and Electron fix

The full native suite was run without filtering. The first run overlapped
implementation edits and is not a final acceptance result. A stable elevated
rerun with the working Python interpreter on PATH completed **315 passed,
29 failed, 4 skipped** (348 tests, 94 files), before the new pipe fix:

[full report before pipe fix](../.test-artifacts/h2a-full-suite-before-pipe-fix.json),
[log](../.test-artifacts/h2a-full-suite-before-pipe-fix.log).

It exposed Electron startup/UI failures, missing Claude/Antigravity CLI
dependencies, and stale static UI/data expectations. Elevated execution resolved
the earlier AppData/process-control failures. Tests were not weakened to hide
missing dependencies or rewrite archived demo data.

The final full rerun after all production fixes completed in 377.71 seconds:
**351 passed, 31 failed, 4 skipped**, across 99 files. All six new/extended
pipe and refresh regression files passed (48 tests). Native authentication,
workspace, project delivery, governance service and process termination tests
also passed. The full suite is **not green**.

See the [individual failure table](h2a-full-suite-failures.md),
[final JSON report](../.test-artifacts/h2a-full-suite.json), and
[final log](../.test-artifacts/h2a-full-suite.log).

The actual Electron regression closes the real launcher stderr reader, triggers
three filesystem refresh errors, records the exact EPIPE and original state
errors without crashing, restores the state file, verifies IPC recovery and
preserves the administrator boundary. It passed again inside the full suite:
[final Electron evidence](../.test-artifacts/electron-main-diagnostics-1790272902039/result.json).
The root cause and implementation are in [electron-pipe-fix.md](electron-pipe-fix.md).

Separate 30-second startup observations retained a live login window with no
main/renderer exceptions or spontaneous close. The isolated legacy phase34
selector timed out because this fresh app is at employee sign-in, not the old
workspace selector; the app itself stayed alive and exited only during explicit
test cleanup. This does not explain every desktop failure in the full suite.

The two original tests that newly reported `Target closed` in the final full run
were rerun unchanged in isolation: `electron-collaboration-phase41.test.ts` and
`electron-office-native-phase50.test.ts` both passed (**2/2**, 16.07 seconds).
[Captured command and output](../.test-artifacts/electron-targeted-rerun.txt)
are retained. Separate temporary copies with lifecycle diagnostics also passed,
showing normal explicit cleanup and no main/renderer exception or crash. The
temporary copies were removed, and no production edit was justified by these
results. The full-suite result remains **351 passed, 31 failed, 4 skipped**;
the full-run early closure in these two tests remains unexplained.

## Reproduce

From workspace root:

~~~powershell
npm.cmd test
npm.cmd run test:browser
npm.cmd run test:guards
npm.cmd run test:existing
npm.cmd run test:h2a:full
npm.cmd run test:electron:pipe
npm.cmd run typecheck
npm.cmd run build
~~~

The full H2A command builds Electron and writes .test-artifacts/h2a-full-suite.json
and console output. Use shell redirection to retain the log. It includes all
existing opt-in skips as defined by the repository; this integration adds no
blanket skips. Native tests requiring desktop/process-control access need an
appropriate unsandboxed test environment.

From agent-discovery-platform:

~~~powershell
.\.venv-validation\Scripts\python.exe -m pytest -q --basetemp=../.test-artifacts/census-verification -o cache_dir=../.test-artifacts/census-pytest-cache
.\.venv-validation\Scripts\python.exe -m ruff check .
.\.venv-validation\Scripts\python.exe -m mypy
~~~

See [README](../README.md) for exact startup/reset, source configuration and real
demo steps. Artifact directories are ignored, local and independent of presenter
data. This report supersedes earlier synthetic-discovery verification claims.

