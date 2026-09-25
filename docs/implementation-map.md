# Census to H2A implementation map

This document describes the current integration. **`agent-discovery-platform` is the only discovery and Census engine. `h2a-mvp/h2a-mvp` owns the application, registry, identity, and governance after explicit import.**

Both supplied projects were inspected before integration. They are archive directories without usable Git history. No applicable `AGENTS.md` was found. H2A references parent `rule.md` and `PLAN_OF_ACTION.md` files that are absent from the archive.

Earlier inspection notes retain historical observations and initial implementation decisions. Their synthetic bridge, shared Census/H2A ID, and passport-to-Census-registration plans are superseded by this document and [the real Census inspection](inspection-real-census.md).

## Existing applications and infrastructure inspected

| Area | Agent Discovery Platform | H2A |
| --- | --- | --- |
| Applications / frontend | FastAPI and static HTML/JavaScript dashboard in `src/agent_census/dashboard.html` | Electron main/preload IPC, React desktop renderer, and separate React 19 / Vite 7 browser application |
| Backend | Python 3.11+, FastAPI, Pydantic 2, Uvicorn; `CensusService` coordinates collectors, identity resolution, classification, persistence | TypeScript packages for identity, organization, agents, mandates, collaboration, messaging, federation, storage, evidence; integrated browser commands use a small Node HTTP facade |
| Storage | SQLAlchemy SQLite; optional PostgreSQL. Entities, observations, runtime events, graph edges, alerts, audit, schema versions | `AtomicFileStore`, versioned JSON, JSONL audit, backups, Zod validation, Ed25519 signatures; no external database required |
| Discovery | A2A cards; MCP inventory; API/service registry; supplied Kubernetes, Docker, process and Git manifest metadata; runtime events and OTLP JSON | No new collectors, classifier, fingerprint engine, provider inference, identity resolver, or stale detector. Existing unrelated desktop runtime/federation connectors remain available |
| Human / agent identity | Canonical Census `AGT-...`, identity-resolution decisions and evidence, source owner metadata | Human proof, organization authority, employee sessions, agent identity, signed passport registry; explicit imported agent and owner binding |
| Policy / approval | Existing trust and routing APIs inspected; not used as H2A policy authority | Native signed mandate evaluator and persistent approval engine; execution revalidates passport, owner, mandate, approval and room |
| APIs / schemas | `/agents/scan`, `/discovery/run`, `/agents`, entity evidence/history, `/events`, `/v1/traces`, graph/search/shadow/routing; Pydantic models | Existing typed desktop IPC and Zod schemas; `/api/state`, `/api/discovery/scan`, `/api/discovery/import` and governance commands in `apps/governance/server.ts` |
| Authentication | Distinct admin, reader and ingest bearer roles; loopback/same-origin dashboard restriction; `SafeHTTP` outbound policy | Desktop sender-bound sessions and biometric/organization authority remain. Integrated browser uses explicit local presenter session, loopback Host checks, same-origin writes and strict request schemas |
| Tests | Pytest unit, integration, security, runtime, routing and offline HTTP peer suites; Ruff and mypy | Vitest native tests, Playwright Electron tests, TypeScript, Electron/browser builds; root HTTP and browser lifecycle tests |
| Docker / configuration | Existing Dockerfile, compose SQLite volume and optional PostgreSQL, locked Python dependencies, backend `.env` | Existing pnpm lock/scripts, Electron/Vite/TypeScript/Vitest configuration; root runner starts Python and Node services together |
| Demo data / scripts | Existing `examples/`, `demo.py`, `serve_demo.py`, persistent dashboard, environment/migration/package/evaluation and real-validation scripts | Existing `data/h2a-demo`, showcase/session scripts, runtime fixtures and phase validation. Integrated startup does not load these discovery fixtures |

Repository support means Census's existing supplied-manifest adapter. This integration adds neither repository cloning nor a GitHub API crawler. Runtime discovery requires actual instrumentation data sent to Census.

The archive initially had broken H2A dependency-link placeholders and a Census virtualenv pointing to a missing interpreter. Root setup repairs local dependency links and selects a working Python environment; these packaging repairs are separate from application behavior.

## Capability map

| Demo capability | Existing repository | Existing component | Inspected status | Required work / current behavior |
| --- | --- | --- | --- | --- |
| Agent discovery | Agent Discovery Platform | `discovery.py`, `CensusService.discover`, native `POST /agents/scan` | Working independent collectors; prior integration used synthetic inputs | Removed synthetic bridge behavior. H2A invokes configured native scan; results do not automatically enter H2A registry |
| Agent / non-agent and shadow classification | Agent Discovery Platform | `detection.py`, `CensusService._project`, `AgentRecord.classification`, `registered`, `shadow` | Working | Reused unchanged. H2A displays returned values and gates import on returned `is_agent`; no passport-derived shadow classification |
| Fingerprint, capabilities, identity resolution, provider/model/framework, timestamps and stale evidence | Agent Discovery Platform | Native record, fingerprint, evidence, identity decisions, observation projection | Working | Full scan response and immutable import snapshot preserve these fields, including unknown future fields; stale inventory remains visible |
| Discovery inspection / history | Census + H2A UI | Census audit store/API; `CensusDiscovery.tsx` | Native evidence existed; browser integration partial | Scan timing/observed IDs and persisted Census history added; inspector exposes original source data and separate H2A mapping |
| H2A registry import | H2A | Governance registry and atomic repository in `apps/governance/service.ts` | Previously automatic import with Census ID as H2A ID | Explicit import creates one `H2A-AGENT-...` per `census_agent_id`, freezes complete source snapshot, deduplicates across clicks/restarts |
| Human binding | H2A | Native identity/organization patterns; persisted binding | Separate scenario owner stage needed | Only an imported H2A identity can bind to Priya; binding persists and is required for passport issuance |
| Agent passport | H2A | `agentPassportSchema`, native passport repository, `AuthoritySignatureService` | Working signed credentials | Issue against canonical H2A identity and active owner; never register in Census or change discovery evidence |
| Mandate | H2A | `packages/mandates/src/mandateService.ts` | Working signed evaluator | Reuse allow/deny/approval, revocation and expiry checks against imported H2A identity |
| Collaboration room | H2A | Workplace/collaboration patterns; agent-aware governance room schema | Agent trust context needed adaptation | Persist Priya and selected governed agents; do not automatically create/govern a Product Intelligence fixture |
| Allowed execution / human approval | H2A | Native `authorize`, `resolveApproval`; execution receipts | Native decisions worked; execution connection needed | Pending/rejected do not execute; approved executes once; audit/results persist. External action effects remain explicitly simulated |
| Company memory | H2A | Draft/review/publish patterns, content hashing, governance memory schema | Agent/source provenance needed extension | Research result becomes proposed memory; approve/edit-and-approve/reject governs publication; full identity, authority, room/source/reviewer provenance persists |
| Identity trace | Census + H2A | Persisted Census history; `LocalAuthorityEventLedger` | Independent histories | Source history links via `census_agent_id` and import event to H2A hash-linked lifecycle events; no fabricated Census events |
| Startup, persistence, reset | Both + root scripts | Native services/stores, `start-demo.mjs`, `reset-demo.mjs` | Previously separate startup | One command starts both using `integration-data/`; stopped reset archives state and does not seed discovery fixtures |

## Implemented boundary

```text
H2A Discovery UI (empty on entry: Ready to scan)
  -> POST /api/discovery/scan
  -> H2A backend adapter + internal bearer credential
  -> Census POST /agents/scan
  -> Existing collectors + runtime inventory + Census classification
  -> Complete inventory, evidence, history, freshness and source errors
  -> H2A ephemeral scan view / inspector

Explicit Register in H2A
  -> POST /api/discovery/import { census_agent_id, scan_id }
  -> H2A canonical identity + immutable source snapshot
  -> Human owner -> passport -> mandate -> room
  -> Enforced actions / approval -> reviewed memory -> governance trace
```

Provider credentials and configuration remain on Census. H2A's backend holds only its internal API credential; it rejects credential-bearing URLs and redirects and allows HTTPS or loopback HTTP. No browser credential form is added. Unavailability produces the explicit retry state; partial source failures appear as warnings beside successful results.

`DiscoveryScan` is separate from `Snapshot`. Scanning writes no H2A registry or governance events. Recent explicit scan responses are cached on the backend only to validate later import. The UI starts with no results on entry/reload. Persisted Census inventory, including stale agents, appears only after a new scan. `observed_agent_ids` distinguishes new collector observations from retained history.

## Identity and migration

```text
Census AGT-... <-> H2A agent.census_agent_id
                    |
                    +-- H2A agent_id = H2A-AGENT-...
                    +-- immutable discovery_snapshot / original evidence
                    +-- owner, passport, mandate, room, action, approval, memory, audit
```

The identifiers deliberately differ. H2A commands and downstream governance records use the H2A ID. Registration retries and concurrent clicks return the existing Census-ID mapping. Passport issuance changes neither Census `shadow`/`registered` nor source classification, fingerprint or evidence.

H2A governance is separately `Registered`, `Owned` or `Managed`. An entity can be registered in H2A and stale in Census, or governed in H2A while its preserved source history still records shadow status.

Previous integrated records receive an additive `census_agent_id` mapping and `legacy_identity` marker. Their original IDs, signatures, evidence and signed references remain intact. Migration does not invent missing source snapshots. The new default integration directory prevents old synthetic demo evidence from entering real scans.

## Verification boundaries

Real adapter tests use explicitly test-only HTTP A2A/MCP/API peers and runtime observations; production startup never loads them. The imported lifecycle uses real signatures, policy, approval persistence/enforcement, audit and memory review. Its external research/share effects are simulated and labeled accordingly.

The supplied Census configuration currently has zero targets. Its actual scan correctly returns empty inventory plus a configuration warning. A populated live demonstration needs authorized real targets or runtime data. Test-peer success is not evidence of discovering an external production agent.

The final full H2A suite completed with 351 passed, 31 failed and 4 skipped. All 48 pipe/refresh/lifecycle regressions passed, including actual Electron pipe closure. Remaining failures include missing external CLIs, desktop window closures/timeouts and stale UI/data expectations. Initial environment and mixed-revision failures were resolved or superseded by this final run. See [verification](verification.md) and the [failure table](h2a-full-suite-failures.md) for exact results. This integration does not claim to certify every unrelated desktop workflow.

Exact startup/demo instructions: [root README](../README.md). Source manifest: [changed-files.md](changed-files.md).
