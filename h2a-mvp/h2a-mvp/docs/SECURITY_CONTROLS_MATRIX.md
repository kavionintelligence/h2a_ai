# H2A Security Controls Matrix

The Evidence Explorer receives this implemented control map from `auditControls` in `packages/evidence/src/auditService.ts`. UI status is therefore tied to the same source used by audit queries and exports.

| Control | Security Objective | Implementation | Verification Evidence |
|---|---|---|---|
| H2A-AC-01 Human-to-agent attribution | Attribution | signed Human Proof, Agent Passport ownership, runtime binding, and mandate subjects resolve into one identity chain | complete-chain test and Evidence Explorer chain inspector |
| H2A-AC-04 Organization authority | Least privilege | active membership, scoped roles, limits, approval power, signed credential, and policy binding gate protected employee actions | organization-authority tests and Employee Authority view |
| H2A-AC-02 Deterministic least privilege | Least privilege | every protected scripted action is evaluated against mandate scope and limits | mandate and scenario policy tests; Decision Inspector reason codes |
| H2A-AC-03 Bounded delegation | Privilege containment | child mandates must attenuate parent scope and delegation depth | negative attenuation tests and visible delegation ancestry |
| H2A-IA-01 Human oversight | Human control | sensitive actions pause pending fresh Human Proof and a recorded approval decision | approval/resume tests and approval evidence panel |
| H2A-IA-02 Multi-human quorum | Human control | eligible routing, separation of duty, exact-purpose biometric co-signature, quorum, narrow child mandate, and exactly-once resume | Phase 18 approval suite, Authority Inbox, and Evidence V2 trace |
| H2A-IR-01 Revocation containment | Incident response | revocation blocks descendants, pending approvals, agents, and affected work | cascading revocation tests and denial events |
| H2A-DP-01 Data minimization | Privacy | evidence contains hashes and routing metadata instead of collaboration bodies; exports use an allowlist | export privacy assertions and bundle inspection |
| H2A-DP-02 Purpose-bound context | Privacy | Context Grants bind recipient, task, mandate, purpose, fields, transformations, budget, use, expiry, and revocation | Phase 19 leakage suite and Context Grant topology |
| H2A-AU-01 Tamper-evident audit | Integrity | canonical hashes and previous-hash links cover the JSONL authority ledger | mutation test and failed-event integrity banner |
| H2A-AU-02 Cross-domain evidence V2 | Integrity | traces resolve persisted human, authority, agent, runtime, connector, grant, approval, node, run, and output references; missing entities remain explicit | Phase 21 complete/partial tests and minimized V2 export |
| H2A-SC-01 Secret isolation | Confidentiality | workload private keys and provider credentials stay in trusted-process repositories | secret-store and renderer-boundary tests |
| H2A-EX-01 Truthful runtime trust | Containment | runtime sessions, connectors, and processes expose trust ceilings; host execution remains `connected-observed` until isolation is proven | supervisor lifecycle tests and Command Floor trust posture |
| H2A-FT-01 Pinned federation | Integrity | independent node keys, key/TLS pins, signed bounded envelopes, replay defense, capability/context limits, and revocation | Phase 20 two-node TLS/security suite and topology inspection |
| H2A-AR-01 Adapter portability boundary | Architecture | local storage, scripted runtime, live CLI, and Bedrock conform to stable ports | runtime adapter contract tests and explicit disabled capability state |
| H2A-AR-02 Enterprise replacement seams | Architecture | typed ports identify replaceable persistence, key custody, workforce identity, biometric, execution, federation, and evidence implementations | Enterprise topology seam inventory and Phase 21 architecture brief |

## Status Meaning

`implemented` means the local MVP has code, persisted evidence, and an automated or inspectable verification path. It does not mean the control is independently audited, certified, or sufficient for an HP production environment.
