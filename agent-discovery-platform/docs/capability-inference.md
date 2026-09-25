# Capability inference and task analysis

A capability record always contains a name, basis, confidence and supporting evidence. Its basis distinguishes a claim from an observation or a deduction.

| Basis | Meaning | V1 score |
|---|---|---|
| `declared` | Exact skill string supplied by an agent card or registration | 0.75 |
| `observed` | A specific tool was invoked, represented as `tool:<name>` | 0.90 |
| `inferred` | A closed mapping associates a known tool with a task capability | 0.50 if listed; 0.85 if invoked |

Scores are policy weights, not calibrated probabilities. A tool-call event proves only the reported invocation; the current normalized event contract does not establish success or output quality. Therefore the direct observation is named after the tool, while broader capabilities remain inferred. A declared skill and an inferred skill may share a name and remain separate records with separate provenance.

## Closed mapping

| Exact tool | Inferred capability |
|---|---|
| `secret_scanner` | `code_security`, `secret_detection`, `security_analysis` |
| `github.search_code` | `code_search`, `repository_analysis` |
| `github.get_repository` | `repository_analysis` |
| `literature_search`, `paper_search` | `literature_search` |
| `paper_analyzer` | `paper_analysis` |
| `image_classifier` | `image_classification` |
| `object_detector` | `object_detection` |
| `send_email`, `email.send` | `email_delivery` |

The implementation also recognizes explicitly listed canonical capability-named tools, such as `image_classification`, `paper_analysis` and `code_security`. The complete mapping is `TOOL_CAPABILITIES` in `src/agent_census/detection.py`.

There is no broad substring inference. A tool named `some_secret_like_name` does not establish secret detection. `send_email_preview` does not establish email delivery. An unknown tool invocation produces only `tool:<exact-name>` as observed evidence. The mapping is intentionally small and reviewable; adding a mapping requires evidence, documentation and a regression test.

## Task-to-capability analysis

`required_capabilities(task)` recognizes a finite set of phrases and canonical names. Examples include “code security,” “find secrets,” “analyse GitHub repositories,” “literature search,” “analyse papers,” “image classification,” “detect objects,” and “send email.” It can return multiple requirements for a compound task. Case and repeated spaces are normalized, while word boundaries prevent accidental substring matches.

Unsupported tasks return an empty requirement list. Callers must not interpret this as permission to route to every agent. A query about protocol (“using MCP”) or model provider is a metadata filter, not a capability inference, and is handled by the search layer rather than invented as a skill.

The matching layer consumes these requirements and retains the supporting declared/observed/inferred evidence. Trust, authentication, health and protocol checks are separate requirements before any dispatch. A capability score cannot override a blocked endpoint or insufficient authorization.

## Research limits

This dictionary will miss synonyms, composed abilities and new domains. It cannot infer arbitrary capabilities from documentation or code, and it does not use embeddings or a language model. This is deliberate for an offline, deterministic evaluation. A learned or embedding-based matcher can be added behind the same function boundary, but its matches must continue to expose evidence and undergo precision/recall evaluation on held-out examples.

Declared capabilities and emitted telemetry are not automatically trustworthy. The platform preserves where each claim came from; application-side instrumentation and operator review are needed before treating claims as reliable execution promises.
