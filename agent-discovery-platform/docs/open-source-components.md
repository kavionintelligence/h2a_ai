# Open-source component inventory

The project reuses installed Python packages through their public APIs. Upstream source files have not been copied, modified or vendored. A repository clone would duplicate packaged components without improving the prototype, so none was included. Original adapter, classifier, identity, capability, graph, policy, routing and demo code is in `src/agent_census`.

Exact requirements are in `pyproject.toml`. `requirements.lock` records the full dependency resolution, including optional groups, transitive packages and universal artifact hashes. [Distribution inventory](../third_party/dependency-inventory.json) records the distributions actually installed in the measured Windows/Python 3.12 environment; platform-conditional dependencies for other environments are not implied to have been executed. [Collected license files](../third_party/licenses/) preserve the notices supplied by those distributions. Build isolation can install additional build-system distributions independently of the application environment.

## Direct runtime reuse

For every row, integration is a pinned pip dependency and upstream modifications are **none**. These are the concrete reused repositories, distinct from research-only alternatives below.

| Package/version | Repository | License | Components used and purpose |
|---|---|---|---|
| FastAPI 0.135.1 | [fastapi/fastapi](https://github.com/fastapi/fastapi) | MIT | `api.py` and local mock platform: typed REST endpoints, dependencies, request validation, OpenAPI and docs. |
| Pydantic 2.12.5 | [pydantic/pydantic](https://github.com/pydantic/pydantic) | MIT | `models.py`: strict candidate/event/registry contracts, field limits and validators. |
| SQLAlchemy 2.0.48 | [sqlalchemy/sqlalchemy](https://github.com/sqlalchemy/sqlalchemy) | MIT | `storage.py`: database engine, schema, indexes, transactions and relational node/edge storage. SQLite is the tested local default. |
| HTTPX 0.28.1 | [encode/httpx](https://github.com/encode/httpx) | BSD-3-Clause | `security.py` and protocol adapters: bounded HTTP transport with centralized target controls; no upstream credential passthrough. |
| Uvicorn 0.41.0 | [Kludex/uvicorn](https://github.com/Kludex/uvicorn) | BSD-3-Clause | ASGI serving for local service and loopback mock peers. |
| Starlette 0.52.1 | [Kludex/starlette](https://github.com/Kludex/starlette) | BSD-3-Clause | FastAPI ASGI foundation and in-process API testing. Explicit pin retains compatibility. |
| AnyIO 4.12.1 | [agronholm/anyio](https://github.com/agronholm/anyio) | MIT | Async concurrency substrate used by HTTP/ASGI dependencies; explicit compatibility pin. |
| OpenTelemetry API 1.40.0 | [open-telemetry/opentelemetry-python](https://github.com/open-telemetry/opentelemetry-python) | Apache-2.0 | `service.py`: discovery and runtime-ingestion pipeline span boundaries. |
| OpenTelemetry SDK 1.40.0 | [open-telemetry/opentelemetry-python](https://github.com/open-telemetry/opentelemetry-python) | Apache-2.0 | Installed SDK support for configuring a deployment tracer provider. The default application does not ship a remote exporter or claim that provider traces are automatically collected. OTLP JSON ingestion is implemented separately. |

## Development and optional packages

| Package/version | Repository | License | Purpose / actual scope |
|---|---|---|---|
| pytest 9.0.2 | [pytest-dev/pytest](https://github.com/pytest-dev/pytest) | MIT | Executed unit, integration and end-to-end suites. |
| pytest-cov 7.0.0 | [pytest-dev/pytest-cov](https://github.com/pytest-dev/pytest-cov) | MIT | Coverage collection when requested in validation commands. |
| Ruff 0.15.5 | [astral-sh/ruff](https://github.com/astral-sh/ruff) | MIT | Executed formatter and lint checks. |
| mypy 1.19.1 | [python/mypy](https://github.com/python/mypy) | MIT | Executed static type checks under the project's configuration. |
| build 1.4.0 | [pypa/build](https://github.com/pypa/build) | MIT | Python distribution build frontend. |
| psycopg / binary extra 3.3.3 | [psycopg/psycopg](https://github.com/psycopg/psycopg) | LGPL-3.0-only for the driver; inspect distribution notices for bundled components | Optional PostgreSQL connectivity. Including the extra is not evidence of a live PostgreSQL test. No psycopg source modification or static incorporation into this project. |
| setuptools 82.0.1 | [pypa/setuptools](https://github.com/pypa/setuptools) | MIT | Pinned isolated build backend in `build-system.requires`. |
| wheel 0.46.3 | [pypa/wheel](https://github.com/pypa/wheel) | MIT | Pinned wheel build support. |

Transitive packages have their own licenses: the project license does not replace those terms. The machine-readable installed inventory and included license texts are more detailed than this direct-component table. The optional binary driver may include separately licensed native libraries; retain its full distribution notices when redistributing that environment.

## Research-only candidates and decisions

The complete README/license/maintenance/source-inspection record and rationale are in [research](research.md). No code from the following projects is shipped. “Use vocabulary” means implementing documented public fields, not copying upstream source.

| Repository | License as inspected | Final decision and reason |
|---|---|---|
| [A2A specification](https://github.com/a2aproject/A2A) | Apache-2.0 | REFERENCE: bounded card importer and explicit protocol profiles. |
| [A2A Python SDK](https://github.com/a2aproject/a2a-python) | Apache-2.0 | REFERENCE: resolver/schema semantics; prefer packaged SDK for broader future interoperability. |
| [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) | MIT | REFERENCE: narrow legacy JSON compatibility profile implemented here; full SDK transport integration deferred. |
| [MCP Registry](https://github.com/modelcontextprotocol/registry) | Apache-2.0 new code/spec; historical MIT; non-spec docs CC-BY-4.0 per inspected transition notice | REFERENCE: metadata import; no registry publisher service included. |
| [Agentgateway](https://github.com/agentgateway/agentgateway) | Apache-2.0 | REFERENCE enforcement architecture; REJECT embedded gateway stack for this prototype. |
| [Kubernetes Python client](https://github.com/kubernetes-client/python) | Apache-2.0 | REFERENCE API semantics; use public HTTP snapshots/limited configured list requests here. |
| [SPIRE](https://github.com/spiffe/spire) | Apache-2.0 | REFERENCE future attestation; no simulated identity verification. |
| [OTel GenAI conventions](https://github.com/open-telemetry/semantic-conventions-genai) | Apache-2.0 | USE vocabulary / REFERENCE schema; still Development, not a frozen complete standard. |
| [OpenInference](https://github.com/Arize-ai/openinference) | Apache-2.0 | REFERENCE application-side instrumentation bridge; no claim of automatic instrumentation. |
| [LangGraph](https://github.com/langchain-ai/langgraph) | MIT | REFERENCE execution/state evidence; imports alone cannot identify an agent. |
| [CrewAI](https://github.com/crewAIInc/crewAI) | MIT | REFERENCE event-listener surfaces; no runtime dependency needed for synthetic demo. |
| [AutoGen](https://github.com/microsoft/autogen) | MIT code | REFERENCE existing-installation compatibility; maintenance-mode framework is unnecessary as a new foundation. |
| [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) | MIT | REFERENCE trace processors and handoffs; no provider credentials or real model required. |
| [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python) | MIT SDK source; service/bundled component terms separate | REFERENCE tool/subagent hooks; no CLI bundle or provider service included. |
| [NetworkX](https://github.com/networkx/networkx) | BSD-3-Clause | REFERENCE graph model; SQLAlchemy relational nodes/edges suffice without another graph dependency. |
| [Semantic Router](https://github.com/aurelio-labs/semantic-router) | MIT | REFERENCE replaceable ranking concept; avoid model/index requirements for deterministic offline matching. |
| [Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit) | MIT | REFERENCE existing discovery/reconciliation prior art; conservative classification and identity policy require original integration. |
| [PatronAI](https://github.com/giggsoinc/patronai) | Apache-2.0 stated by README | REJECT at README triage: AI endpoint/code-use signals alone do not satisfy behavioral classification. No source audit or copying. |
| [Shadow AI Governance Detection](https://github.com/zerokali20/Shadow-AI-Governance-Detection) | MIT stated by README | REJECT at README triage: approved-tool/payload-risk scope differs. No source audit or copying. |
| [ShadowLens](https://github.com/iamsparshgupta/shadowlens) | Proprietary/all rights reserved stated by README | REJECT at license triage; not reused. |

Release snapshots and mutable source links are preserved in the research record so an engineer can revisit these decisions. Only the locked Python packages above are implementation dependencies. Docker base images and an optional PostgreSQL server are separate deployment components; preserve their own notices when redistributing container images. No container image is bundled in the source archive.
