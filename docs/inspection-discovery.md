# Agent Census baseline inspection

Inspected before integration changes on 2026-09-24. No applicable AGENTS.md was found in the workspace ancestry or repository source, tests, scripts, examples, or docs.

## Existing application

- Python 3.11+ package `agent_census`; FastAPI 0.135.1, Pydantic 2.12.5, SQLAlchemy 2.0.48, Uvicorn 0.41.0.
- Frontend: server-rendered static `src/agent_census/dashboard.html`, vanilla JavaScript and CSS. Scan, selection/details, search, and registration call real `/dashboard/api/*` endpoints.
- SQLite persistence by default; optional PostgreSQL. Tables: entities, observations, runtime_events, graph_edges, alerts, audit_log, schema_versions. JSON documents retain evidence and identity decisions. One supported API worker and database transaction lock.
- Static distinct admin, reader, and ingest bearer tokens. Dashboard API separately restricts client/host to loopback and mutations to same-origin requests.
- Adapters: A2A cards, MCP inventory, supplied Kubernetes/Docker/API registry/Git manifest/process metadata, manual candidates. Runtime events and allowlisted OTLP JSON feed deterministic behavioral classification. This does not scan arbitrary machines or execute uploaded code.
- Agent classification requires observed LLM, tools, planning/control, and execution-state signals. Shadow classification is backend-derived from behavioral agent classification plus lack of registration. Registration resolves the existing canonical `AGT-...` ID using observed identity evidence.
- Original audit records contain action, actor, subject, correlation_id, timestamp, and details; they are not yet the unified governance lifecycle schema.

## Capability map

| Capability | Existing component | Baseline status | Required integration work |
| --- | --- | --- | --- |
| Agent discovery | `discovery.py`, `CensusService.discover`, `ingest`, `/discovery/run`, `/events`, `/v1/traces` | Working | Supply deterministic marketing fixture and expose internal bridge |
| Shadow classification | `detection.shadow_decision`, `service._project`, persisted `registered`/`shadow` | Working | Synchronize managed passport registration while retaining ID |
| Human binding | Candidate owner string, graph owner relation | Partial metadata only | Real human and binding records in H2A |
| Agent identity | `AgentRecord`, `resolve_identity`, Store entities/observations | Working | Retain this canonical ID throughout H2A |
| Passport | None | Missing | H2A issuance consumes human binding and canonical agent |
| Mandate | Task eligibility/trust checks only | Missing lifecycle policy | Integrate H2A policy evaluation and persisted mandates |
| Collaboration room | Delegation graph only | Missing | H2A persisted room/participants/actions |
| Human action approval | Registry trust update only | Missing | Per-action approval with enforced execution gating |
| Company memory | Runtime memory-access observations only | Missing | Proposed/reviewed memory with provenance |
| Identity trace | Census audit_log and evidence | Partial | Correlate discovery/registration with H2A lifecycle events |

## Existing APIs, fixtures, and scripts

Core APIs: health/readiness, agent register/list/detail/delete/search/trust, discovery run/scan, capabilities, evidence, relationships/graph, events/OTLP, shadow reports, audit, task matching and routing. Routing has A2A, HTTP, MCP, and trusted local-callable implementations.

Fixtures in `examples/` model Security, Research, CV, Coordinator, dynamic child, and shadow agents plus non-agent controls. `scripts/demo.py` runs real loopback peers, emits evaluation/reports, and performs discovery-to-A2A routing. `serve_demo.py` creates an ephemeral dashboard; persistent API uses `Settings.database_url`. Other scripts cover environment initialization, migration, packaging, evaluation, and optional real Bedrock validation. Existing `.env` was not read or altered.

Dockerfile and docker-compose provide SQLite with a named volume and optional PostgreSQL profile; initial environment creation and token setup are separate from application startup. The original project lacks a combined H2A startup/reset command.

## Checks actually run before modification

1. Existing `.venv/Scripts/python.exe` failed: its configured base Python installation is missing. Existing `.venv-validation/Scripts/python.exe` is operational.
2. `.venv-validation/Scripts/python.exe -m pytest -q -p no:cacheprovider --basetemp=.pytest-runner/inspection`: **104 passed in 4.75 seconds**, including the existing offline demo against HTTP peers, adapters, security, identity, telemetry, registration, and routing tests.
3. Started the unmodified app with Uvicorn on an ephemeral loopback port and a separate temporary SQLite file. Health, readiness, and dashboard shell returned HTTP 200.
4. POSTed a Marketing Research Agent / CrewAI declaration through `/discovery/run`, then five runtime signals through `/events`. `/agents/{id}` returned `shadow=true`, `registered=false`, CrewAI, and the same canonical ID.
5. The dashboard inventory endpoint returned this record. Its actual registration endpoint with same-origin header changed `registered=true`, `shadow=false`, and retained the canonical ID. Persisted audit contained `AGENT_REGISTERED`.
6. Stopped the server and recreated the application against the same SQLite file: exactly one entity, same ID, registration retained.

The baseline dashboard API and served shell were verified over real HTTP; a browser click walkthrough of that original dashboard was not performed during this inspection. Browser verification belongs to the integrated demo acceptance pass.

## Minimal integration decision

Retain Census as the discovery/classification authority and H2A as the governance application. Add a small loopback bearer-authenticated Census bridge with its own SQLite file. Feed synthetic offline telemetry through the existing classifier; never substitute frontend shadow labels. H2A consumes the returned canonical IDs and asks Census to register after valid passport onboarding. Keep original applications and optional provider validation independent.

## Implemented bridge and checks

`agent-discovery-platform/scripts/governance_bridge.py` starts the bearer-authenticated loopback adapter implemented in `src/agent_census/governance_bridge.py`. It requires `GOVERNANCE_BRIDGE_TOKEN` (24 or more characters), `--data-dir`, and accepts `--port` (default 8011). Its SQLite file is `<data-dir>/census.db`.

- Public `GET /health` returns database readiness.
- Authenticated `POST /demo/discover` executes Census metadata discovery and synthetic runtime telemetry ingestion for Marketing Research Agent (CrewAI) and Product Intelligence Agent (LangGraph); both are initially shadow. It returns `{agents, errors, synthetic, correlation_id}`.
- Authenticated `GET /demo/agents` reads persisted records.
- Authenticated `POST /demo/agents/{agent_id}/register`, with optional `{owner}`, consumes the discovered identity and invokes the original registration pipeline. Registration is idempotent and retains the canonical ID.
- Exported records include the complete Census record, `discovery_status: discovered`, `synthetic: true`, and `discovery_engine: agent-census`. The bridge does not issue passports or decide governance policy.

The two added integration tests exercise authorization, repeat discovery, evidence, missing-agent rejection, registration, persisted audits, idempotency, and reopening SQLite. The complete Census suite passes: **106 tests in 5.08 seconds**. Ruff and mypy checks on the additions passed.

A separate live CLI smoke check started the bridge, performed discovery/registration over HTTP, terminated it, explicitly verified the listener was unavailable, started a new process against the same SQLite file, and verified two records with the same canonical IDs and registration state. This check passed.

### Windows child process handling

The supplied virtualenv executable is a Windows redirector. Terminating only its PID can leave the actual interpreter running. A first smoke attempt exposed this through SQLite file locking; a subsequent process-tree termination attempt was denied in this sandbox. The successful check resolved `sys._base_executable` using the virtualenv interpreter, launched that executable directly, and passed the virtualenv `Lib/site-packages` plus the repository `src` directory through `PYTHONPATH`. The direct child could then be terminated by its own process handle. The checked runtime here is `C:/Users/Sarbartha/AppData/Roaming/uv/python/cpython-3.12-windows-x86_64-none/python.exe`; portable startup should discover it instead of hard-coding this machine path.

Playwright 1.55.0 imports from the nested H2A package. Its downloaded Chromium is absent; installed Chrome and Edge executables are available. Browser acceptance can use installed Chrome with a fresh headless Playwright context without accessing the user's profile.
