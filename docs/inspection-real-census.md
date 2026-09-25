# Agent Census inspection and H2A integration

Inspected the existing FastAPI application, `Settings`, SQLAlchemy store, schemas,
collectors, classifier, runtime ingestion, native scan routes, historical dashboard
launcher, and synthetic bridge before changing them. Baseline: 106 tests passed,
Ruff passed, mypy passed (13 source files).

## Responsibilities and reused components

| Capability | Existing component | Integration work |
| --- | --- | --- |
| A2A, MCP, API/service, Kubernetes, Docker discovery | `src/agent_census/discovery.py` | Reused without changing collectors. Live URL scans use the existing SafeHTTP boundary. |
| Repository discovery | `GitManifestAdapter` | Existing support is supplied inline manifests only. This repository does not clone repositories or call GitHub discovery APIs. |
| Runtime discovery | `POST /events`, `POST /v1/traces`, `runtime_candidates` | Reused. Instrumented agents must send actual runtime observations; no production fixture injection. |
| Fingerprinting, classification, identity resolution, capabilities, shadow detection | `src/agent_census/detection.py`, `CensusService` | Reused without changing these algorithms. |
| Canonical Census identity, evidence, first/last seen, stale inventory | `AgentRecord`, `Store`, `CensusService._project` | Reused. Native scans retain stale records and report which IDs were actually observed by current collectors. |
| Configured scan | `POST /agents/scan`, `scan_inventory` | Added timing, scan ID, observed IDs, source count, unconfigured warning, persisted scan audit, and persisted per-entity discovery history. |
| Authentication and outbound policy | Native bearer role tokens, `SafeHTTP` | Reused. No tokens or provider credentials enter the H2A browser. |
| H2A integration process | `governance_bridge.create_bridge` | Removed synthetic discovery implementation. This factory now only configures and returns the native `create_app`. |
| Governance | H2A registry, bindings, passports, mandates, rooms, approvals, memory | H2A owns these. Importing in H2A does not invoke Census registration or modify source evidence. |

## Native API contract

H2A calls `POST /agents/scan` with no body and an internal bearer token. The Census
backend performs its configured collector calls before responding. The response is:

```text
{
  scan_id, correlation_id, started_at, completed_at,
  discovery_sources: string[], configured_source_count: number,
  observed_agent_ids: string[],
  agents: (complete native AgentRecord & {discovery_history: CensusAuditEntry[]})[],
  errors: [{source?, agent_id?, item?, code, message?}]
}
```

`observed_agent_ids` contains entities returned by collector observations in this
scan. `agents` additionally retains the persisted Census inventory, including stale
agents and runtime observations. A scan does not claim that retained history was
newly observed. The native `AgentRecord` carries the canonical `agent_id`, provider,
model, framework, capabilities, tools, protocols, endpoint, confidence, discovery
sources, fingerprint, classification, original evidence, identity decisions,
first/last seen, `activity_status`, `evidence_age_seconds`, `registered`, and `shadow`.

`discovery_history` is reconstructed from persisted Census `CANDIDATE_UPDATED` and
`AGENT_REGISTERED` audit entries, not frontend data. Entries contain timestamps,
correlation IDs, and previous source/classification/shadow decisions. It is also
retrievable from authenticated `GET /agents/{agent_id}/history`.

Native Census registration and H2A governance registration are separate facts.
H2A preserves the supplied Census values and stores its own canonical identity
mapping and governance status alongside the imported immutable snapshot.

Partial failures return successful entities and source-specific errors. Missing
targets return `no_sources_configured`; there is no fallback to demo fixtures,
archived reports, historical validation databases, or external paid agent execution.

## Configuration and startup

From the workspace root, `npm.cmd run dev` starts both services. The dedicated
integration Census database is `integration-data/census/census.db`. It starts empty
on first launch and then persists observations across restarts.

For an independently launched Census process, privately supply the same internal
token to Census as `GOVERNANCE_BRIDGE_TOKEN` and to H2A as `CENSUS_API_TOKEN`, then:

```powershell
cd E:\agent-census\agent-discovery-platform
.\.venv-validation\Scripts\python.exe scripts/governance_bridge.py --port 8011 --data-dir ..\integration-data\census
```

The launcher loads Census settings from `agent-discovery-platform/.env` without
copying provider credentials into process configuration or H2A. Environment
variables override the file. `--env-file` selects another backend-only file. The
explicit integration data directory overrides `CENSUS_DATABASE_URL` so an old
validation database cannot accidentally become the integrated scan inventory.

To use real remote services, configure exact authorized origins and targets in
that backend file, for example URLs for `a2a`, `mcp`, or `api_registry`. These must
be your actual endpoints. No targets are invented by the application. Local HTTP
services additionally require the existing private-address and HTTP policy flags.
No discovery collector invokes model work or MCP `tools/call`.

## Verification on 2026-09-24

- Full Census suite after changes: **110 passed**.
- Ruff: **All checks passed**.
- mypy: **Success, no issues in 13 source files**.
- Final repeated full-suite, Ruff and mypy logs are saved in
  `.test-artifacts/census-final-results.txt` (all commands exited 0).
- Existing baseline tests remained intact except the previous two bridge tests,
  which asserted synthetic production records and were replaced with native API
  authentication, honest empty scanning, persistence, and environment tests.
- New explicit test-only HTTP peers exercised actual A2A card fetches, MCP
  initialize/tools-list exchanges, API registry fetching, partial source failure,
  runtime identity merging, unchanged fingerprints and evidence after restart,
  and stale shadow record retention. Test peer data is explicitly synthetic and
  is not loaded by either production service.
- The actual current `.env` has **zero configured discovery targets**. A fresh
  native scan using that configuration returned HTTP 200, zero entities, zero
  newly observed IDs, and the configuration warning. This is a successful honest
  empty scan, **not verification of discovering a live external agent**. A live
  populated demonstration still needs real targets or instrumented runtime data.
- Machine-readable empty-scan evidence is in
  `.test-artifacts/census-actual-configuration/verification.json` at the workspace root.

Commands used (from `agent-discovery-platform`):

```powershell
.\.venv-validation\Scripts\python.exe -m pytest -q --basetemp=../.test-artifacts/census-real-scan-20260924 -o cache_dir=../.test-artifacts/census-pytest-cache
.\.venv-validation\Scripts\python.exe -m ruff check .
.\.venv-validation\Scripts\python.exe -m mypy
```

Changed Census files: `src/agent_census/api.py`, `config.py`, `storage.py`,
`governance_bridge.py`, `scripts/governance_bridge.py`,
`tests/integration/test_governance_bridge.py`, `tests/integration/test_real_scan.py`,
`README.md`, and the generated `docs/openapi.json`.

## Subsequently requested optional local fleet

`npm.cmd run demo:agents` adds four running local A2A demonstration services through
`scripts/demo_agent_fleet.py`. `--demo-fleet-url` on the Census launcher appends their
card URLs to the existing native collector configuration without replacing the
operator's sources, origins or blocked-host policy. Normal startup remains unchanged.

The fleet executes deterministic local simulations and sends their observations
through authenticated native `/events`; it never writes the Census database or
creates H2A identities. Its source, model, framework, cards and task results all
identify simulation explicitly. There is no real LLM or external framework claim.
See [demo-agents.md](demo-agents.md) for the exact four-agent demonstration.

After this addition, the full Census suite passed **125 tests**, Ruff passed, and
mypy passed for **14 source files**. Logs are saved in
`.test-artifacts/census-demo-fleet-pytest.txt`, `census-demo-fleet-ruff.txt`, and
`census-demo-fleet-mypy.txt`. The fifteen new native tests include real HTTP card
fetching, executable A2A turns, simulated runtime provenance, native shadow
classification, stable identifiers, source merging and request/security guards.
