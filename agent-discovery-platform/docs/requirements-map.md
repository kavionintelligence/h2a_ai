# Requirement-to-implementation map

The supplied specification is the source of truth. This table names concrete mechanisms rather than treating a mock as an external production integration.

| Requested concept | Implementation / evidence |
|---|---|
| Declared discovery | A2A card and MCP inventory/HTTP adapters; parser and live loopback tests |
| Control-plane discovery | K8s Pods/Deployments/Services/Ingress/ServiceAccounts safe snapshots and configured lists; Docker configured lists; API registry metadata |
| Runtime discovery | Normalized events and OTLP JSON subset; authenticated `/events` and `/v1/traces` integration tests |
| Fingerprinting | Nullable behavior flags, provenance, original times, models, interfaces and ownership |
| Agent versus non-agent | Deterministic gates and four deliberate negative controls; MCP/card/wrapper-only tests |
| Identity resolution | Exact endpoint, scoped workload and explicit ID signals; merge/conflict/ambiguity decisions; update integrity regression |
| Capability discovery | Declared/observed/inferred provenance; closed tool dictionary, runtime expiry regression |
| Trust verification | Explicit operator approval, network policy, verified TLS, role checks and health; cryptographic attestation not implemented |
| Knowledge graph | Persistent relational edge model with provenance; entity/tool/model/owner/deployment/endpoint/capability/delegation views |
| Unified registry | All candidate entities retained; CRUD and compatibility aliases; transaction and cleanup tests |
| Search | Capability phrases plus explicit MCP-use/external-LLM evidence; unsupported meanings do not acquire facts |
| Capability matching | All requested capabilities plus classification/auth/trust/health/freshness filters and visible exclusion reasons |
| Routing | A2A 0.3 JSON-RPC, HTTP, MCP 2025-11-25 sessionless JSON, installed local callables; all four exercised |
| Shadow detection | Unregistered multi-signal behavior, updatable review alert, registration clears alert, dynamic subagent fixture |
| Continuous tracking | Configurable background monitor, health TTL, evidence expiration, event ingestion and graph refresh; timer integration test |
| Extensible adapters | ABC and source map for eight import adapters; runtime conversion functions form the ninth source boundary |
| Git/process discovery | Explicit manifest/process inventory only; no unrestricted code/secret/cmdline inspection |
| ARD metadata | Generic registry import supported; unspecified ARD version not treated as a normative conformance claim |
| Database | SQLite demonstrated; SQLAlchemy/PostgreSQL option, schema v1 migration, indices/FKs/idempotency |
| Security and observability | Bounded inputs, DNS pinning, metadata-address denial, no redirects/proxy forwarding, sanitized errors, role tokens, audit, JSON stage logs, OTel API spans |
| Failure handling | Per-item/source structured discovery errors, HTTP timeout and read retry/backoff, no automatic task retry |
| Demo and evaluation | Ten targeted entities, real loopback peers, 48 synthetic events, generated reports and ground-truth metrics |
| Documentation | README, workflow (each stage's inputs/process/output/failures), research/license inventory, security/deployment/troubleshooting, seven Mermaid diagrams |
| Reproducibility | Exact direct pins, universal hashed dependency lock, source package, archive manifest and clean-extraction checks |

Cloud IAM, real cloud/provider agents, cryptographic identity verification, complete framework exporter integrations, full protocol conformance, and large-scale deployment are explicit prototype boundaries. The deterministic local path does not depend on any of them. See `validation.md` for actual test results and `research.md` for prior art and proposed mechanisms.
