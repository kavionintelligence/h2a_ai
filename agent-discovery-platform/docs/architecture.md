# Architecture and design decisions

The supplied request is the primary specification. A separate architecture attachment was not supplied. This implementation keeps all fifteen core concepts, including negative entity classification, identity correlation and continuous updates. It does not equate registration with agency.

## Components and boundaries

| Module | Responsibility |
|---|---|
| `models.py` | Validated candidate, evidence, event, fingerprint, classification, capability and registry contracts |
| `discovery.py` | Eight independent metadata/HTTP adapter types; partial failures |
| `detection.py` | Ninth runtime adapter functions, OTLP mapping, deterministic classifier, resolver, inference and task analysis |
| `security.py` | Role-token abstraction, redaction, network policy and bounded transport |
| `service.py` | Transactional orchestration, materialized registry, freshness, search, matching |
| `storage.py` | Versioned schema, observations, registry, temporal events, relational graph, alerts, audit |
| `routing.py` | A2A / HTTP / MCP / application-installed local execution |
| `api.py` | Authenticated OpenAPI service, monitor, bounded requests and dashboard |
| `mock_platform.py`, `demo.py` | Isolated synthetic peers, ground truth and executable evaluation |

SQLAlchemy and a relational edge table avoid operating a graph database for small traversal queries. SQLite WAL is the zero-dependency default. PostgreSQL support uses the same JSON-backed model with ordinary indexed relational keys. There is no vector database: explicit capability aliases and inference rules are easier to audit and sufficient for this first experiment.

Raw discovery inputs do not become an unquestioned registry row. Normalization drops sensitive configuration, fingerprints aggregate current evidence, and the classifier distinguishes observable behavior from advertised interfaces. The API stores all candidate entities so negative controls and uncertain candidates remain visible. A positive classifier decision is not a trust decision.

## Persistence and consistency

Schema v1 creates `entities`, `observations`, `runtime_events`, `graph_edges`, `alerts`, `audit_log`, and `schema_versions`. Primary/foreign keys prevent duplicate observations and orphaned owned graph records. Entity type/registration, observation entity, event service/timestamp and graph owner are indexed. Bootstrap migration is idempotent; unsupported schema versions fail. Migration entry point is `python scripts/migrate.py`. The demo is executable seed data.

Each candidate update writes its entity, observation, graph, alert and audit record in one transaction. A process lock serializes identity resolution and updates. External fetches during discovery happen outside this write transaction; health sweeps are bounded but hold a transaction while polling, a documented scaling limitation. Use **one application worker**. This prototype does not claim safe multi-process writes or distributed scheduler ownership.

Observations store the latest snapshot for a source key. Runtime evidence is constrained to a configurable window; old observations do not become newly seen just because a sweep ran. Event IDs suppress replay during the retained window. Repeated alerts update a single row per entity. Registration clears the shadow status without deleting its audit history.

## Extensibility

Discovery adapters emit the common model; classifier/fingerprint/inference/resolver are pure replaceable functions. A learned classifier can replace the rule function while retaining evidence and a new score-semantics version. Static bearer verification is one authentication implementation, not an OIDC implementation. Outbound credential forwarding is deliberately unsupported until a protocol-specific credential adapter is installed. Local callable registration is trusted application setup, never a remote code execution feature.

See [workflow](workflow.md), [protocols](protocols.md), and [diagrams](diagrams/).
