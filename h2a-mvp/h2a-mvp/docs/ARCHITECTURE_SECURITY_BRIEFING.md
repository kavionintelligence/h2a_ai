# H2A Architecture And Security Briefing

## Executive Position

H2A separates five concepts that are commonly collapsed in agent platforms: the human owner, durable Agent Passport, temporary provider runtime, signed mandate authority, and evidence of each decision. The result is a provider-neutral control layer where an agent session is never treated as identity and an assignment is never treated as permission.

## Local V0 Topology

```text
React renderer
  -> typed contextBridge allowlist
Electron trusted process
  -> HumanProofService -> local face/liveness/ArcFace/BCH provider
  -> AgentIdentityService -> Passport + runtime binding + secret store
  -> MandateService -> signatures + policy + delegation + approval + revocation
  -> ScriptedScenarioService -> assignments + disclosure + deterministic runtime
  -> EvidenceAuditService -> investigation + verification + minimized export
  -> versioned JSON/JSONL repositories + hash-linked authority ledger
```

The renderer has no Node integration or direct filesystem access. Main-process request schemas and response schemas are validated. Private signing keys, biometric helper material, and provider credentials remain in trusted-process repositories.

## Security Properties Demonstrated

| Property | Mechanism | Visible proof |
|---|---|---|
| Human ownership | local face, liveness, distance, ArcFace, BCH, signed short-lived proof | Human Proof state and attempt evidence |
| Durable agent identity | Human Proof-gated signed Passport | Agent identity chain |
| Session separation | independently revocable runtime binding | Passport/runtime lifecycle comparison |
| Least privilege | deterministic mandate scope and limits | Decision Inspector and reason codes |
| Bounded delegation | strict child attenuation and depth | delegation ancestry and negative tests |
| Human oversight | approval-required policy and fresh proof | paused run, approval record, resumed run |
| Containment | root revocation invalidates descendants and affected work | blocked agents/tasks and denial evidence |
| Data minimization | resource field allowlist and hashed collaboration evidence | disclosed fields and minimized export |
| Audit integrity | canonical SHA-256 event and previous-hash links | integrity banner and exact failed event |
| Secret isolation | OS protection and capability-limited IPC | masked metadata and storage tests |

## Provider Interoperability

OpenAI/Codex, Claude Code, Gemini/Antigravity, custom CLI, and Bedrock are represented by stable provider and runtime contracts. In V0, `ScriptedWorkplaceRuntime` is the only enabled executor. Provider-labelled agents still cross real H2A policy, disclosure, assignment, response, and evidence boundaries; H2A does not claim those external models were called.

## Replacement Architecture

| Local V0 component | Enterprise replacement | Contract retained |
|---|---|---|
| `AtomicFileStore` and versioned repositories | authenticated API, MongoDB, or approved database | `KeyValueStoragePort` and repository/domain schemas |
| local signing files | HSM, KMS, or managed key service | canonical signature input and signature result |
| local biometric provider | approved remote, device, or hardware-backed proof | Human Proof request/result semantics |
| scripted runtime | hardened CLI broker or AWS Bedrock adapter | `AgentRuntimePort` request/result |
| sandbox resource | enterprise resource gateway | resource request/disclosure result |
| local evidence ledger | remote append-only store, SIEM, or notarization service | authority event schema and verification semantics |

Replacing an adapter must not bypass authorization, expose secrets to the renderer, or change event semantics. Unsupported modes fail explicitly until registered.

## Residual Risks And Non-Claims

- A fully compromised local host can replace application state and the entire ledger together.
- Local time is not a trusted timestamp source.
- The supplied biometric assets are approved only for this non-commercial demonstration and require replacement or licensing for production.
- Local hashes provide tamper evidence, not legal non-repudiation or external notarization.
- H2A V0 has no enterprise IAM, remote access control, centralized retention, SIEM forwarding, hardware key custody, or compliance certification.

See `THREAT_MODEL.md`, `SECURITY_CONTROLS_MATRIX.md`, `THIRD_PARTY_NOTICES.md`, and the root `docs/h2a/CTO_CISO_QUESTION_EVIDENCE_MATRIX.md` for detailed evidence and boundaries.
