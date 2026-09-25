# ByoSync backend source audit and build plan

Implementation update: [Real rooms and discovery](REAL_ROOMS_AND_DISCOVERY.md) records the subsequently implemented integrations and their current limits. This file retains the original audit/build-plan history.

## Decision

ByoSync should remain one deployable product with H2A as its authority core. The seven supplied repositories are not seven services that should all be bundled. They contain overlapping products, incompatible deployment assumptions, and different licences. Their useful parts should enter through bounded adapters.

The backend target is:

`collectors/runtimes → normalized intake → discovery classification → H2A identity and authority → governed work/approval → reviewed memory → joined identity trace`

The complete mechanical audit is in `backend-source-audit/FILE_INVENTORY.csv`; the static function/class/export index is in `backend-source-audit/SYMBOL_INDEX.csv`. Together they cover 9,128 retained files after excluding generated dependencies and build output. Static indexing is not a licence grant and does not replace review of a file before copying it.

## Repository decisions

### Langfuse

- Licence: MIT for core; exclude `ee/`, `web/src/ee/`, and `worker/src/ee/`.
- Use: architecture and compatibility patterns for batch ingestion, trace/observation identity, idempotent queue contracts and OTLP.
- Relevant files/functions:
  - `web/src/pages/api/public/ingestion.ts`: batch validation, per-event authorization and partial-result handling.
  - `web/src/pages/api/public/otel/v1/traces/index.ts`: OTLP HTTP boundary.
  - `packages/shared/src/server/queues.ts`: versioned queue payload schemas and backward-compatible consumers.
  - `worker/src/features/otel-ingestion/processOtelEvents.ts`: independent enrichment, evaluation and persistence stages.
- Do not import: Langfuse UI, evaluation product, ClickHouse/Redis/S3 stack, model gateway, billing or enterprise directories.
- ByoSync implementation: a small normalized telemetry endpoint persists bounded metadata and hashes evidence. Full Langfuse remains an optional upstream source, not a mandatory dependency.

### AIOStack

- Licence: Apache-2.0, not MIT.
- Use: Kubernetes observer/outpost deployment model and service-account/workload attribution vocabulary.
- Relevant files/functions:
  - `charts/aiostack/templates/observer/observer.yaml`: node-level observer pattern.
  - `charts/aiostack/templates/outpost/outpost.yaml`: centralized receiver pattern.
  - `charts/aiostack/templates/*/serviceaccount.yaml` and RBAC manifests: least-privilege deployment surfaces.
  - `install.sh`: prerequisite, configuration, install, verify and rollback phases.
- Limitation: this repository mostly contains Helm packaging; the described eBPF classification backend is not present as reusable source.
- Do not import: hosted Aurva UI assumptions, credentials flow, unrelated `ai-flow` ML stack, or packaged chart archives.
- ByoSync implementation: accept normalized AIOStack runtime metadata through the telemetry/report APIs. Build a dedicated Helm chart later when the local product contract is stable.

### Claw Hunter

- Licence: MIT.
- Use: portable, read-only endpoint discovery for OpenClaw on Windows/macOS/Linux.
- Relevant files/functions:
  - `claw-hunter.ps1`: host, CLI, config, process, gateway, privilege, secret, plugin and skill discovery; structured JSON and upload support.
  - `claw-hunter.sh`: equivalent Unix/macOS collector.
  - `tests/powershell/run-tests.ps1` and `tests/bash/run-tests.sh`: collector contract fixtures.
- Limitation: detects OpenClaw only; it is not a general enterprise AI census.
- ByoSync implementation: `/api/adapters/claw-hunter` accepts the native JSON shape and turns material risks into bounded source findings. Collectors remain separately deployable and read-only.

### Shadow AI Guard

- Licence: Apache-2.0 with NOTICE retention.
- Use: multi-surface discovery schema, source-health distinction, device enrolment concepts and human review queue.
- Relevant files/functions:
  - `receiver/app/main.py` `Finding` and `report`: bounded finding contract, authentication gate and fail-closed delivery.
  - `discovery/discover.py`: registry candidate discovery and explicit approval workflow.
  - `scanner/ai_guard/discover.py` `run_discover`: scheduled discovery boundary.
  - `scanner/ai_guard/scanners/*`: Entra, Exchange, Intune, Jamf, SentinelOne and MCP adapter boundaries.
  - `endpoint/windows/ai-guard-collector.ps1` and portal collector scripts: endpoint collection and safe path handling.
  - `docs/agentic.md`: honest separation of configured activity, observed execution and unsupported inference.
- Do not import: the second portal/UI, Loki/Grafana deployment, account/budget product, mailer or edition/upgrade system.
- ByoSync implementation: `/api/adapters/shadow-ai-guard` accepts its stable finding shape and records source, device, identity, autonomy and evidence without collecting prompts.

### Mem0

- Licence: Apache-2.0, not MIT.
- Use: optional memory-provider contract and entity scoping.
- Relevant files/functions:
  - `mem0/memory/main.py` `Memory` and `AsyncMemory`: add/search/get/update/delete/history contract.
  - `mem0/memory/base.py`: provider abstraction.
  - `mem0/memory/utils.py`: fact normalization and safe parsing patterns.
  - `server/main.py`: authenticated self-hosted REST boundary and append-only request logging.
  - `server/auth.py`: API-key and JWT separation.
- Do not import now: LLM fact extraction, 30 vector stores, Neo4j, PostgreSQL/pgvector, the dashboard, hosted client or anonymous telemetry.
- Reason: ByoSync memory is a governed record. It must be proposed by an authorized agent and reviewed by a human before publication. A vector store must not bypass that lifecycle.
- ByoSync implementation: local reviewed memory remains authoritative; `MEM0_API_URL` is recognized only as optional configuration until an outbound, approval-preserving adapter is implemented.

### Forge Orchestrator

- Licence: FSL-1.1-ALv2 until its 2028-03-18 conversion date. The README badge saying MIT conflicts with `LICENSE.md`; the licence file governs.
- Use: architecture reference only. Do not copy code into ByoSync.
- Reference concepts:
  - policy in the core rather than the UI;
  - append-only events;
  - locks and crash recovery;
  - task ownership, knowledge capture, drift checks and quality gates;
  - preflight/doctor reports.
- Relevant reference files: `src/core/event.rs`, `state.rs`, `knowledge.rs`, `quality_gate.rs`, `governance.rs`, `pod/journal.rs`, `pod/preflight.rs`.

### Claw Orchestrator

- Licence: MIT.
- Use: durable run and verification patterns for future governed runtime execution.
- Relevant files/functions:
  - `src/kernel/store.ts`: atomic JSON, event replay, run leases, incarnation fencing and secret stripping.
  - `src/kernel/engine.ts` `RunKernel`, `validateSpec`, `prepareSpec`: bounded workflow execution and restart recovery.
  - `src/kernel/nodes/human-gate.ts`: explicit pause/resume boundary.
  - `src/kernel/exec.ts`: timeouts, output caps and process-tree termination.
  - `src/circuit-breaker.ts`: failure containment.
  - `src/run-ledger.ts`: runtime-owned measurements separated from engine self-report.
  - `src/handoff.ts`: bounded transcript transfer.
  - `src/embedded-server.ts`: token-to-cookie local dashboard authentication pattern.
  - `src/verify/*`: acceptance contracts and evidence bundles.
- Do not import: coding-specific engines, council/autoloop/ultraapp, embedded dashboard or OpenAI-compatible proxy.
- ByoSync implementation: retain H2A rooms/assignments as the authority source. Add generic run execution only after mandates can bind an executable adapter, timeout, budget and verification contract.

## Implemented backend boundary

- H2A signed Passport, human binding, mandate, exact-action policy, approval, governed room, handoff, reviewed memory and hash-linked ledger remain native.
- `PlatformService` adds atomic, bounded persistence for source reports and normalized runtime telemetry.
- Native adapters accept Claw Hunter and Shadow AI Guard JSON without requiring their portals.
- Joined identity trace endpoint combines authority history with runtime telemetry by agent identity.
- Platform status reports what is native, connected, merely ready to receive, or not configured.
- Network deployment is loopback by default. A non-loopback bind requires an access token; the browser exchanges a one-time login URL for an HttpOnly, SameSite cookie.

## API additions

| Endpoint | Purpose |
|---|---|
| `GET /api/platform/status` | Runtime, authority, persistence, connector and intake truth |
| `POST /api/telemetry/ingest` | Bounded normalized runtime events; single item or batch |
| `GET /api/telemetry?trace_id=&limit=` | Inspect stored runtime evidence |
| `POST /api/source-reports` | Generic normalized collector report |
| `GET /api/source-reports?limit=` | Inspect collector reports and source health |
| `POST /api/adapters/claw-hunter` | Native Claw Hunter JSON adapter |
| `POST /api/adapters/shadow-ai-guard` | Native Shadow AI Guard finding adapter |
| `GET /api/agents/:id/identity-trace` | Authority and runtime records in one chronological chain |

## What is still required before calling this production-ready

1. Enterprise SSO, RBAC, tenant separation and operator provisioning.
2. TLS termination, secret management, key rotation and signed collector/device enrolment.
3. A server database for concurrent multi-user deployments; local atomic files remain appropriate for a portable single-node showcase.
4. Background queues and backpressure for high-volume telemetry.
5. OTLP compatibility and a documented mapping from workload/service identity to H2A agent identity.
6. Optional Mem0 publication adapter that can only receive already-reviewed memory.
7. A generic runtime adapter contract with mandate-bound tools, budgets, timeouts, circuit breaking and verification evidence.
8. Kubernetes packaging, upgrades, backup/restore and disaster-recovery tests.
9. Security review, threat model, dependency/SBOM scan and penetration testing.

The honest CISO demo is therefore a real, durable single-node governance product with live connector intake and portable authenticated access—not yet a horizontally scaled enterprise control plane.
