# Agent classification

The classifier answers whether supplied observations contain enough evidence of agent behavior. It does not determine what every unseen application is doing. Missing evidence remains unknown rather than becoming a negative fact.

## Input and fingerprint

Each discovery adapter supplies a `Candidate`. The fingerprint combines the candidates that the identity resolver has already correlated. It retains evidence source, event identifier and observation time. Retransmissions with the same source, event identifier and kind count once. Repeating an LLM span a thousand times cannot create planning evidence or increase the number of signal categories.

The classifier recognizes these exact evidence kinds:

| Evidence kind | Fingerprint field |
|---|---|
| `llm_call` | `llm_interaction` |
| `tool_call` | `tool_usage` |
| `planning` | `planning` |
| `memory_access` | `memory_usage` |
| `delegation` | `delegation` |
| `autonomous_action` | `autonomous_actions` |
| `multi_step` | `multi_step` |

A model name does not imply an observed model call. A tool inventory does not imply a tool invocation. An arbitrary metadata object such as `{"planning": true}` is ignored. When no event supports a boolean field its value is `null`.

Known model names are retained as a list. Conflicting observed owners, providers, endpoints or frameworks are not arbitrarily resolved to the first value: the scalar fingerprint field becomes unknown. The original candidate observations remain available. First/last seen derive from observation timestamps, including evidence timestamps; constructing a fingerprint does not refresh a stale observation to the present time.

## Positive policy

All four gates must hold:

1. An LLM interaction was observed.
2. A tool invocation was observed.
3. At least one decision signal exists: planning, autonomous action or delegation.
4. At least one continuation signal exists: memory access, multistep execution, autonomous action or delegation.

The confidence field is an uncalibrated policy score, **not a probability**. For a positive decision it is `min(0.97, 0.72 + 0.04 * number_of_distinct_behavior_kinds + declaration_bonus)`, where the declaration bonus is 0.03. A declaration is an agent card, explicit agent declaration, manual registration evidence or registration ID. A declared positive scoring at least 0.90 receives `confirmed_agent`; other positives receive `probable_agent`.

In this prototype, “confirmed” means the configured deterministic evidence policy passed with declaration corroboration. It does not mean cryptographic identity verification, complete autonomy verification, or certainty about the underlying service. Classification and trust are separate.

For a negative gate decision the score is `min(0.69, 0.12 * number_of_distinct_behavior_kinds + declaration_bonus)`, where the declaration bonus is 0.08. This value still denotes strength of agent evidence. It is not confidence that the entity is a non-agent.

## False-positive controls and entity types

| Observed situation | Result |
|---|---|
| MCP tool inventory only | `mcp_server`, `probable_service` |
| Ordinary API metadata only | `api`, `probable_service` |
| Microservice metadata only | `traditional_microservice`, `probable_service` |
| LLM call only | `llm_wrapper`, `uncertain` |
| LLM and tool calls without the other gates | `ai_enabled_application`, `uncertain` |
| Declared workflow without behavioral gates | `workflow`, `uncertain` |
| Agent Card or manual registration alone | `unknown_entity`, `uncertain` |
| All behavioral gates | Agent, with the score/state above |

Positive entities default to `autonomous_agent`. An explicit multi-agent entity hint plus delegation can identify `multi_agent_system`; an explicit subagent hint can identify `dynamic_sub_agent`. These subtype labels are supplied metadata, not proof of the hinted topology. Registration and shadow status are independent fields, so a registered API is still not automatically an agent.

The model supports `confirmed_non_agent`, but v1 deliberately does not emit it from an absence of telemetry. A service may hide internal behavior. This conservative choice can produce false negatives; the evaluation records them instead of claiming complete coverage.

## What can fail

Telemetry can be absent, delayed, replayed, spoofed or misinstrumented. A model-driven workflow can emit signals similar to autonomy. These rules cannot establish whether a choice was internally autonomous from network traces alone. Correlation errors can combine unrelated evidence. The implementation therefore preserves reasons and provenance, keeps identity conflict handling separate, and reports uncalibrated scores. The service determines the observation window before invoking these pure functions; the classifier itself has no hidden clock or retention policy.

The pure `classify(fingerprint, candidates)` boundary can be replaced by a learned model later, while retaining the same output schema and explanation requirements. Any learned alternative requires an independently labeled dataset and calibration evaluation.
