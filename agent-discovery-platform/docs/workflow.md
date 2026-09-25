# The complete workflow, in plain language

An **entity** is anything discovered: an API, a container, a tool server, or a possible agent. An **agent** is an entity with enough evidence of model-guided, multi-step work. **Registered** means an operator put it in the catalog. **Approved** means an operator explicitly allowed routing to it. These are different facts. A **shadow candidate** has agent-like behavior but no operator registration; that label requests review, not an accusation.

The quickest way to see every stage is `python scripts/demo.py` after installation. Read `output/reports/demo-report.md` for the result and `demo-report.json` for the evidence behind it. The demo starts real local HTTP peers and uses the real application pipeline through an in-process HTTP test client. All work and telemetry are synthetic.

## 1. Start and check the system

**Input:** Database settings, role tokens, endpoint allowlist, and optional monitoring interval.

**Process:** The application validates configuration, opens the database, applies its versioned schema, and creates the discovery, routing, and monitoring services. `/health` checks the process; `/ready` checks database access.

**Output:** A ready API with interactive OpenAPI documentation at `/docs`.

**Why:** A partially configured service must not accept tasks under an assumed security policy.

**What can fail:** Missing or short tokens, unavailable database, malformed settings.

**Handling:** Startup or readiness fails with an actionable error. The demo generates a fresh token in memory and uses an isolated SQLite database. It never saves that token in its report.

## 2. Register known agents

**Input:** An authorized operator sends a candidate to `POST /agents/register`.

**Process:** Registration records the declaration and operator-managed registration state. It does not independently prove that the entity behaves as an agent or should be trusted.

**Output:** A catalog record with an ID and registration evidence.

**Why:** Later observations can be compared with the list the organization intended to run.

**What can fail:** Invalid fields, forbidden endpoint format, missing authorization.

**Handling:** The API rejects the request with a structured client error. The operator corrects the input; unrelated records remain available.

## 3. Select discovery sources

**Input:** `POST /discovery/run` receives named adapters and explicitly supplied URLs or inventories.

**Process:** Each adapter processes its own inputs under configured size and network limits. The prototype never guesses network ranges or scans arbitrary machines.

**Output:** A collection of normalized candidates plus a separate list of source errors.

**Why:** Different platforms expose different kinds of evidence; one source cannot describe every entity.

**What can fail:** An unavailable source, an unknown adapter, or invalid inventory.

**Handling:** That item receives an error while other source items continue. The integration test demonstrates a broken A2A card beside a successful API inventory.

## 4. Read A2A Agent Cards

**Input:** An explicit Agent Card URL such as `/security/.well-known/agent-card.json`, or an inline card.

**Process:** The adapter validates required card fields and extracts identity, endpoint, skills, protocol version, transport, and input/output modes. Modern interfaces can be cataloged even if they cannot be executed by the router.

**Output:** Declared agent metadata and card/version/transport evidence.

**Why:** A standards-based declaration is useful, while still needing corroboration.

**What can fail:** Bad JSON, incomplete cards, denied hosts, TLS failures, unsupported execution profiles.

**Handling:** Invalid discovery items are reported without stopping other adapters. Unsupported execution profiles remain non-routable. A published card alone does not prove autonomy or ownership.

## 5. Read MCP metadata

**Input:** An explicitly authorized MCP endpoint or supplied MCP inventory.

**Process:** For a live endpoint, the adapter initializes the supported protocol, sends the initialized notification, and lists tools. It does not call a tool during discovery.

**Output:** A tool-server candidate and declared tool metadata.

**Why:** Knowing which tools exist helps explain dependencies and possible capabilities.

**What can fail:** A protocol mismatch, repeated pagination cursor, excessive tool list, streaming-only server, timeout.

**Handling:** The adapter returns a bounded error. The supported profile is sessionless JSON over HTTP; unsupported streaming/session modes are rejected. An MCP server remains a tool server unless separate behavior supports agent classification.

## 6. Import control-plane and registry information

**Input:** Kubernetes metadata snapshots, Docker metadata, API registry entries, inline Git manifests, or supplied local-process metadata.

**Process:** Adapters retain allowlisted identity and deployment fields. Kubernetes supports Pod, Deployment, Service, Ingress, and ServiceAccount metadata. Git and process adapters accept supplied metadata rather than reading arbitrary paths or executing commands.

**Output:** Candidates with service, namespace, deployment, owner, endpoint, and discovery-source evidence where supplied.

**Why:** Infrastructure can reveal a deployed entity even when it has never registered.

**What can fail:** Unsupported resources, malformed metadata, unavailable authorized metadata APIs.

**Handling:** Report per-item errors. Secrets, container environments, process command lines, and source trees are not imported. Unknown fields remain unknown.

## 7. Receive runtime observations

**Input:** `POST /events` with normalized events, or the OTLP JSON ingestion endpoint described in the API. Events describe model calls, tool calls, planning, memory, delegation, multi-step execution, and autonomous actions.

**Process:** The ingestion boundary validates timestamps and allowed event types. Runtime processing groups observations by service identity within a bounded recent time window. Duplicate event IDs are handled idempotently.

**Output:** Behavioral evidence associated with a candidate, plus accepted-event counts.

**Why:** Runtime evidence can expose an unregistered service that acts like an agent, and can challenge weak declarations.

**What can fail:** Invalid timestamps, stale events, replayed IDs, unsupported OTLP shape, missing authorization.

**Handling:** Invalid input is rejected or reported according to the endpoint contract; expired evidence does not establish current activity. Ingestion stores metadata evidence, not prompts, outputs, tokens, or credentials. Collectors must already be authorized to observe the workload.

## 8. Normalize observations

**Input:** Adapter and telemetry outputs in different formats.

**Process:** Every source produces the same `Candidate` and `Evidence` contracts. Evidence carries its kind, source, time, value, and event ID when available.

**Output:** Validated source-independent input for all later stages.

**Why:** Adding an adapter should not require rewriting classification, search, or routing.

**What can fail:** Invalid endpoints, too many fields/items, ambiguous source values.

**Handling:** Validation rejects unsafe shapes. Missing observations remain `null`, empty, or unknown; normalization never fills unknown model or owner details with invented values.

## 9. Construct a fingerprint

**Input:** Current metadata and evidence for a candidate.

**Process:** The fingerprint records which behaviors are observed, model and tool usage, declared interfaces, ownership, deployment, and first/last observation times.

**Output:** An `AgentFingerprint` that can be inspected through the record.

**Why:** This is a readable summary of what is known about an entity, independent of its eventual label.

**What can fail:** Insufficient evidence, conflicting declarations, stale behavioral evidence.

**Handling:** Unknown behavior stays unknown. Evidence is preserved so an engineer can inspect conflicts; the fingerprint is a summary, not cryptographic proof.

## 10. Classify agent-like behavior

**Input:** The fingerprint and supporting evidence.

**Process:** A deterministic rule engine looks for combined model interaction, tool use, and evidence of decisions or multi-step autonomous activity. Weak single signals do not satisfy the positive rule.

**Output:** `is_agent`, classification state, a heuristic evidence score, original evidence, and human-readable reasons.

**Why:** A normal API, fixed workflow, MCP server, and LLM wrapper must not automatically become agents.

**What can fail:** Incomplete telemetry can miss a real agent; forged or misleading observations can produce a false positive.

**Handling:** Keep uncertainty visible, show why the rule fired, and require operator trust approval before routing. Scores are not calibrated probabilities. Synthetic evaluation measures only the supplied fixture set.

The demo coordinator has an explicit multi-agent-system declaration corroborated by delegation. The transient child's creation inventory explicitly declares a dynamic-sub-agent subtype after its runtime discovery. Delegation alone does not prove that a child was dynamically created; both subtypes still require the same positive agent-behavior gates.

## 11. Resolve identities and duplicates

**Input:** A new observation plus existing catalog identities.

**Process:** The resolver compares normalized exact endpoints, source-specific IDs, explicit registration identifiers, and suitable composite infrastructure identity. It checks conflicting strong identities before merging.

**Output:** Either an existing canonical ID or a new ID, with a merge/no-merge decision and the signals used.

**Why:** An Agent Card, Kubernetes deployment, and runtime trace can describe the same service; counting all three as agents would inflate the census.

**What can fail:** Shared endpoints, identity reuse, incomplete metadata, or contradictory registration identifiers.

**Handling:** Conservative rules avoid weak name-only merges and preserve conflict explanations. The demo checks that the Security Agent's registration, A2A card, Kubernetes view, and runtime observations converge on one record. Identity is heuristic, not attested.

## 12. Infer capabilities

**Input:** Declared skills, tool names, and observed tool calls.

**Process:** The capability engine preserves declared skills, records observed tools, and uses a small explicit mapping for inference. For example, observed `secret_scanner` supports inferred `secret_detection` and `code_security`.

**Output:** Capability entries with a name, `declared`, `observed`, or `inferred` basis, confidence, and evidence.

**Why:** A useful catalog must explain what an entity might do and why it is believed capable.

**What can fail:** An unknown tool name, ambiguous skill text, or a tool with a misleading name.

**Handling:** Unknown tools do not gain invented capabilities. Inference remains a claim tied to evidence; production systems need execution-based capability validation.

## 13. Apply trust and health state

**Input:** Operator trust decisions, endpoint policy, and recent health checks.

**Process:** Approval is an explicit authorized update with a reason. Health scans call configured targets under endpoint policy; approved healthy state must be fresh for routing. Local callables are registered by trusted application code.

**Output:** Separate trust and health fields with timestamps and audit records.

**Why:** Being discovered, registered, or classified as an agent is not enough to authorize task execution.

**What can fail:** Unverified owner, blocked origin, failed TLS, timeout, expired health observation.

**Handling:** Unverified, blocked, unhealthy, unknown, or stale targets are excluded from executable matches. A health failure does not erase the entity's historical evidence.

## 14. Store the unified record

**Input:** Identity, fingerprint, classification, capabilities, trust state, and observations.

**Process:** The registry writes the updated record and source observations to the database, preserving registration and operator trust semantics across updates.

**Output:** One queryable record per resolved identity, with first/last seen times and decision history.

**Why:** Search, governance, and routing need a consistent view rather than a list of disconnected source responses.

**What can fail:** Database failure, malformed state, contention, or stale conflicting updates.

**Handling:** Database transactions and constraints protect stored state; errors are surfaced. SQLite is the easy local default; PostgreSQL is an optional deployment target. This prototype is intended for a single application writer.

## 15. Update the knowledge graph

**Input:** The stored record, capabilities, owner/deployment metadata, and observed relationships.

**Process:** The service maintains graph-like relational nodes and edges for tools, models, owners, capabilities, endpoints, deployments, and delegation where supported by evidence.

**Output:** `GET /graph/agent/{id}` returns the neighborhood for inspection and visualization.

**Why:** A record explains one entity; a graph explains its observed connections.

**What can fail:** A delegated target may not yet be known, and observations may omit an owner or deployment.

**Handling:** Preserve only supported relationships and their provenance; do not invent ownership or identity links. Unresolved targets remain named observations until they can be correlated.

## 16. Identify shadow candidates

**Input:** Positive agent classification, multiple behavioral signals, and registration state.

**Process:** If agent-like behavior is sufficiently supported and no operator registration exists, the service marks the record as a shadow candidate and emits review information.

**Output:** The shadow report includes the candidate, evidence, capabilities, confidence, and a review recommendation.

**Why:** A catalog of declarations alone cannot reveal unknown agent workloads.

**What can fail:** Sparse telemetry, delayed registration, transient children, or spoofed instrumentation.

**Handling:** Require combined behavior, expose reasons and evidence, and treat the result as a review queue. The demo's unknown service and dynamically observed child use two telemetry sources. They are not silently registered or approved.

## 17. Search by capability or attribute

**Input:** A user query such as `code security`, `GitHub repositories`, or `MCP`.

**Process:** Deterministic text and capability normalization searches indexed catalog data. It does not call an external language model or claim semantic understanding of every phrase.

**Output:** Matching entities with capability evidence, confidence, endpoint, protocol, and health information.

**Why:** Users should find relevant entities without knowing their IDs.

**What can fail:** Unsupported wording, absent capability evidence, or an empty registry.

**Handling:** Return an empty result or explain the supported capability vocabulary. Search may show unapproved entities for inspection; execution applies stricter filters.

## 18. Match a task

**Input:** Task text and optional explicit `required_capabilities`.

**Process:** The task analyzer maps known wording to canonical capabilities. The matcher checks capability evidence, trust, freshness, and health, then ranks eligible entities.

**Output:** Required capabilities, candidate matches, evidence-based match reasons, and exclusion information.

**Why:** Selecting an execution target is more demanding than listing text matches.

**What can fail:** Ambiguous task wording, no matching capabilities, only stale or unapproved targets.

**Handling:** Return no eligible match with reasons. Explicit capability names make automated calls predictable. Unsupported tasks are not silently assigned an arbitrary agent.

## 19. Route the task

**Input:** A matched record, the task, optional protocol, and an explicitly selected MCP tool when relevant.

**Process:** The router rechecks trust, capability, endpoint, and freshness constraints. It uses A2A 0.3 JSON-RPC `message/send`, a direct HTTP JSON POST, supported MCP `tools/call`, or a trusted local callable.

**Output:** The selected agent ID, protocol, and upstream result.

**Why:** Different agents expose different execution interfaces; one generic HTTP assumption is insufficient.

**What can fail:** Unsupported protocol version, changed tool inventory, blocked host, stale health, timeout, or an upstream error.

**Handling:** Return a structured execution error. Executions are not automatically retried because work may already have happened. Read-only discovery can use bounded retries. This prototype reports synchronous results; it does not implement a durable task queue.

## 20. Observe execution and continue monitoring

**Input:** Subsequent runtime events and optional scheduled health scans.

**Process:** New evidence refreshes fingerprints and records. Health monitoring checks previously cataloged explicit targets. Event windows and health TTLs prevent old observations from authorizing new work indefinitely.

**Output:** Updated last-seen times, health, evidence, graph relationships, and shadow state.

**Why:** Discovery is a changing inventory, not a one-time spreadsheet.

**What can fail:** A stopped collector, unavailable peer, stale evidence, or a changed endpoint.

**Handling:** Preserve historical evidence while treating stale or failed activity conservatively. Monitoring discovers no new network ranges. Operators can rerun inventory adapters with refreshed metadata.

## 21. Review evidence and measured results

**Input:** Registry records, graph data, audit logs, task match explanations, and synthetic ground truth.

**Process:** The demo saves a full JSON report, a readable Markdown report, and computed evaluation metrics. Integration and end-to-end tests verify the same paths.

**Output:** Reproducible entity counts, confusion matrix, merge results, inferred capability precision, and measured local timings.

**Why:** A successful-looking demo is not evidence of accuracy unless expected outcomes and decision paths are visible.

**What can fail:** A missing entity, false positive, incorrect merge, unsupported inference, or nondeterministic timing.

**Handling:** Tests fail on incorrect outcomes. Timings are measured anew rather than asserted against arbitrary speed thresholds. These small synthetic experiments do not establish performance or accuracy on production workloads.
