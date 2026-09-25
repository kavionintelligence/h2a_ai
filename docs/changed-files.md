# Integration file manifest

The supplied projects are archives without usable Git history. This manifest records the integration files from implementation ownership and inspection, rather than claiming a generated Git diff. “Current correction” means the strict Census-to-H2A separation requested after the earlier demo. “Retained integration” identifies earlier integration files still used but not rewritten during this correction.

## Agent Discovery Platform

Paths below are relative to `agent-discovery-platform/`.

| File | Change | Purpose |
| --- | --- | --- |
| `src/agent_census/api.py` | Current correction | Extend existing native scan with scan ID/timing, configured source count, newly observed IDs, honest unconfigured warning, persisted scan audit and per-entity discovery history; authenticated entity-history endpoint |
| `src/agent_census/config.py` | Current correction | Support the native backend environment-file configuration and explicit integration overrides without exposing provider credentials to H2A |
| `src/agent_census/storage.py` | Current correction | Read persisted per-entity Census audit history for evidence inspection and immutable import |
| `src/agent_census/governance_bridge.py` | Current correction; replaces prior synthetic bridge | Configure the dedicated integration database and native settings, then return existing `create_app`; optional `demo_fleet_url` appends explicit local A2A targets, without an alternative discovery engine, database fixtures or Census registration synchronization |
| `scripts/governance_bridge.py` | Current correction | Launch native Census API on loopback with backend-only configuration, internal token and explicit data directory; opt-in `--demo-fleet-url` |
| `src/agent_census/demo_fleet.py` | Added for requested opt-in demo agents | Four live loopback A2A services run explicitly labelled deterministic simulations and publish actual simulation-step telemetry through native `/events`; validates credential destinations and preserves existing source configuration |
| `scripts/demo_agent_fleet.py` | Added for requested opt-in demo agents | Serve the local fleet with backend-only telemetry credentials, readiness checks and graceful shutdown |
| `tests/integration/test_demo_fleet.py` | Added for requested opt-in demo agents | Real HTTP four-agent discovery and A2A execution, native shadow classification and stable identities, source merge, loopback security and malformed-request coverage |
| `tests/integration/test_governance_bridge.py` | Current correction | Replace synthetic-production-record assertions with native API authentication, honest empty scan, persistence and configuration tests |
| `tests/integration/test_real_scan.py` | Added in current correction | Exercise existing discovery through test-only HTTP A2A/MCP/API sources, runtime ingestion, partial failure, history and stale inventory |
| `README.md` | Current correction | Document strict integration, native source configuration and absence of production discovery fixtures |
| `docs/openapi.json` | Regenerated | Reflect current native API, including persisted discovery history |

The existing discovery collectors, classifier/fingerprinting/identity-resolution algorithms, native evidence models and security boundary were reused. Production `.env` credentials and historical validation databases were not edited or imported into the new integration database.

## H2A

Paths below are relative to `h2a-mvp/h2a-mvp/`.

| File | Change | Purpose |
| --- | --- | --- |
| `apps/governance/contracts.ts` | Current correction | Separate raw `DiscoveryScan` / `CensusEntity` from registry `Snapshot`; declare Census-ID mapping, immutable snapshot and independent governance status |
| `apps/governance/service.ts` | Current correction | Native backend-to-backend scan adapter; explicit idempotent import; lossless source preservation; additive legacy migration; owner/passport/mandate/approval/memory reuse; optional already-governed room peers |
| `apps/governance/server.ts` | Current correction | Real scan/import HTTP routes, strict request validation and selected room participants; existing governance routes retained |
| `apps/web/src/CensusDiscovery.tsx` | Added in current correction | Empty-ready initial state, SCAN, real summary/inventory/distributions/source warnings, evidence/history inspector, explicit register/view-registry transition |
| `apps/web/src/GovernanceApp.tsx` | Current correction | Integrate Census UI; select arbitrary imported H2A identities; show separate Census provenance/governance; preserve existing governance workflow, room selection and trace |
| `apps/web/src/governance.css` | Current correction | Discovery tables, summaries, source/freshness states, inspector and responsive layout |
| `packages/contracts/src/index.ts` | Current correction | Add native `AGENT_REGISTERED_IN_H2A` audit event while retaining existing event types |
| `tests/governance-service.test.ts` | Current correction | Scan/registry separation, complete source preservation, stale/non-agent handling, import deduplication, outage/partial errors, backend authentication, migration and existing governance enforcement tests |
| `apps/web/src/main.tsx` | Retained integration | Connect browser entrypoint to the real `GovernanceApp` and its styles |
| `apps/web/index.html` | Retained integration | Integrated application title, description and favicon |
| `tsconfig.node.json` | Retained integration | Include the HTTP governance application in native TypeScript checks |

Native `packages/identity`, `packages/mandates`, `packages/storage`, `packages/evidence` and other existing governance implementations were reused rather than replaced. Build output is regenerated separately and is not an additional discovery implementation.

### Subsequent Electron pipe / refresh repair

The user subsequently prioritized an Electron `EPIPE` crash. These additional changes repair the actual error-reporting boundary, unchanged-state refresh loops and related child-pipe lifecycle; they do not replace the discovery or governance implementation. Details and verification are in [electron-pipe-fix.md](electron-pipe-fix.md).

| File under `h2a-mvp/h2a-mvp/` | Change |
| --- | --- |
| `apps/desktop/main/diagnostics.ts` | New durable JSONL diagnostics with closed-pipe/backpressure/error handling |
| `apps/desktop/main/index.ts` | Use diagnostics instead of unsafe stderr error reporting in main refresh and other error boundaries |
| `packages/agents/src/realCollaborationCoordinator.ts` | Persist reconciliation only when meaningful state changes |
| `packages/agents/src/humanEscalationCoordinator.ts` | Avoid timestamp-only writes during read reconciliation |
| `packages/agents/src/processSupervisor.ts` | Observe spawn/stream lifecycle, guard stdin, settle pending input, persist failure and clear active runs without replay |
| `packages/messaging/src/processChannel.ts` | New private subprocess generation and JSON pipe lifecycle helper |
| `packages/messaging/src/localProcessTransport.ts` | Replace unchecked reusable stdin writes and stale child references |
| `packages/messaging/src/directProcessTransport.ts` | Replace unchecked one-shot stdin and incomplete child teardown |
| `tests/control-plane-diagnostics.test.ts` | New exact refresh and real writable-stream error regressions |
| `tests/control-plane-refresh-persistence.test.ts` | New read-only refresh and real-transition persistence regressions |
| `tests/human-escalation-refresh-persistence.test.ts` | New approval read/reconciliation file-persistence regressions |
| `tests/process-transport-lifecycle.test.ts` | New child lifecycle and pipe regressions |
| `tests/process-supervisor-phase16.test.ts` | Extend native supervision coverage with input/spawn/error/replacement cases |
| `tests/electron-main-diagnostics.test.ts` | Actual Electron closed-stderr error/recovery regression without authentication bypass |

## Workspace root

| File | Change | Purpose |
| --- | --- | --- |
| `package.json` | Current correction and optional fleet | Add full native H2A tests and `demo:agents` / `test:demo:agents`; retain setup/start/build/reset and other integration tests |
| `.gitignore` | Current correction | Exclude the new integration data directory alongside prior generated state/build/test outputs |
| `scripts/start-demo.mjs` | Current correction and optional fleet | Start native Census and H2A; opt-in `--demo-agents` starts local agent services and waits for telemetry readiness; backend-only credential, persistent `integration-data/`, owned-process shutdown |
| `scripts/reset-demo.mjs` | Current correction | Archive/reset integration state only while stopped; no synthetic discovery seeding |
| `scripts/test-h2a-full.mjs` | Added in current correction | Build native Electron, run the complete H2A suite, provide detected Python on the child process PATH and save a machine-readable report |
| `tests/helpers/census-test-sources.mjs` | Added in current correction | Explicitly test-only live HTTP peers and source controls; never imported by production startup |
| `tests/governance-lifecycle.test.mjs` | Current correction | Actual cross-process Census scan, explicit import and complete enforced governance lifecycle, provenance/ID mapping, freshness, failures and persistence |
| `tests/governance-browser.test.mjs` | Current correction | Actual browser SCAN/inspect/import/registry/governance controls, reload behavior, evidence retention and browser diagnostics |
| `tests/demo-fleet-governance.test.mjs` | Added for optional local fleet | Run four actual simulated A2A agents and native Census; explicitly govern all four through the browser, select all four in a room, enforce policies/approvals, publish reviewed memory, inspect trace and verify backend restart persistence |
| `README.md` | Current correction | Architecture, backend configuration, exact startup/test/reset commands and real demo steps |
| `docs/implementation-map.md` | Current correction | Inspected project inventory, reused components, responsibility map, identity separation, migration and verification limits |
| `docs/verification.md` | Current correction | Final executed results, limitations and links to retained evidence |
| `docs/h2a-full-suite-failures.md` | Added during final verification | Individual full-suite failures, prior-run comparison and unfiltered report links |
| `docs/inspection-real-census.md` | Added in current correction | Native Census inspection, existing supported sources/API, current configuration and verification |
| `docs/changed-files.md` | Added in current correction | This manifest |
| `docs/electron-pipe-fix.md` | Added for subsequent crash repair | Reproduced error boundary, feedback loops, child lifecycle changes and regression evidence |
| `docs/demo-agents.md` | Added for optional local fleet | Explicit simulated runtime profile, real Census scan, four-agent onboarding and governance walkthrough, restart/freshness behavior |
| `scripts/setup.mjs` | Retained integration | Select working dependencies and repair archive packaging prerequisites |
| `scripts/repair-archive-links.mjs` | Retained integration | Restore extracted dependency-link placeholders |
| `scripts/demo-runtime.mjs` | Retained integration | Locate the native Python interpreter, start/stop owned child processes and await service readiness |
| `scripts/build-demo.mjs` | Retained integration | Build the H2A HTTP backend bundle and production React browser application |
| `scripts/test-existing.mjs` | Retained integration | Run existing Census and selected native H2A suites |
| `tsconfig.governance.json` | Retained integration | Integrated TypeScript checking configuration |
| `docs/inspection-discovery.md` | Historical inspection retained | Original Census inspection and first implementation record; superseded integration decisions are identified in the current map |
| `docs/inspection-h2a.md` | Historical inspection retained | Original H2A inspection and native component verification record |

## Generated outputs and state

`h2a-mvp/h2a-mvp/.governance-dist/`, `apps/web/dist/` and native `out/` contain generated build output. `.test-artifacts/` contains machine-readable test reports, isolated databases/state, logs, screenshots and browser traces. Dependency-link repair affects extracted `node_modules` packaging. These generated files are not hand-maintained source changes.

`integration-data/` holds the new persistent Census database and H2A state. Reset archives this state into `demo-archives/`. Previous `demo-data/` and archived validation data are not silently reused as real scan results.
