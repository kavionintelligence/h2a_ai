# Shadow-agent detection

In this prototype a shadow agent is an entity that passes the behavioral agent policy and has not been explicitly registered. An unknown service, an MCP server, an LLM wrapper, or a missing owner does not satisfy that definition on its own.

## How the decision works

1. Normalize declared, infrastructure and runtime observations.
2. Resolve workload identity before combining behavior, so a card and a trace can describe one entity.
3. Build the fingerprint from exact evidence kinds.
4. Apply the agent classifier's LLM/tool/decision/continuation gates.
5. Check registration status independently.
6. For an unregistered positive, require at least three distinct behavioral signal kinds, including `llm_call`, `tool_call`, and planning, autonomous action or delegation.
7. Surface the entity as a review candidate with evidence and inferred capabilities.

For example, the local shadow mock emits model calls, tool calls, planning, memory access and an autonomous action. Its infrastructure observation supplies workload metadata, but it does not register. The resulting alert is explainable from those observations. A repeated model-call event or a tool inventory cannot substitute for missing signal categories.

Multiple independent observation sources are desirable but not mandatory in the v1 rule. One instrumented runtime can observe several distinct behaviors. Evidence retains its collector source, so reviewers can distinguish one producer claiming several facts from independent corroboration. Infrastructure metadata contributes identity evidence; it does not independently prove autonomy.

The `shadow` flag expresses a policy classification, not a finding of maliciousness. A healthy, useful application may simply need registration. The intended action is review and governance reconciliation, not automatic deletion or disruption.

## Observation time, replay and continuous tracking

Runtime candidate IDs depend on workload identity, not timestamp. Their observation time is the maximum actual event timestamp. Replayed event IDs do not advance the timestamp or add new behavior. First/last seen are retained in the fingerprint and record.

The service controls which retained observations are supplied to the classifier. Removing stale behavioral evidence must reclassify the entity; a periodic monitor should not turn old evidence into a new sighting merely because it recomputed the fingerprint. Registration suppresses the shadow flag without altering the underlying evidence or changing an API into an agent.

## Limits and false positives

The rules are not a calibrated classifier. Explicit instrumentation signals can be forged or accidentally mislabeled. A deterministic workflow can resemble an agent if its instrumentation reports planning and autonomous action. Conversely, an actual agent may evade detection if it emits only network calls, hides local tools, or never traverses a monitored integration.

V1 does not inspect encrypted network payloads, attach debuggers, harvest shell history, scan arbitrary hosts, discover every process, or infer private model reasoning. It uses configured target metadata and supplied telemetry. An unobserved agent remains unobserved, and unknown fields remain unknown.

The synthetic benchmark evaluates the tested fixtures only. Strong results on intentionally constructed positives and negatives do not establish enterprise detection precision, coverage, robustness to adversarial telemetry, or deployment readiness. Real validation requires authorized workload labels, more difficult workflow negatives, per-source reliability assessment and a time-based evaluation protocol.

## Existing work and this integration

Existing inventory and registration-reconciliation systems already identify shadow agents; the research survey includes Microsoft Agent Governance Toolkit. This project does not claim to invent that concept. Its proposed integration combines a conservative behavioral gate, evidence-preserving cross-source identity, capability provenance, a registry/graph and policy-filtered routing in one reproducible prototype.

See [classification](classification.md), [identity resolution](identity-resolution.md), [capability inference](capability-inference.md), and [research](research.md) for the policy details and prior-art decisions.
