# H2A Local MVP Threat Model

## Scope And Assets

This threat model covers the local Electron MVP, renderer-to-main boundary, versioned repositories, multi-human biometric proof, organization authority, Passport V2 workload identity, signed mandates and approvals, Context Broker, supervised provider/framework processes, friend-node federation, collaboration records, enterprise topology, and Evidence V2 export.

Protected assets are Human Identity ownership, biometric helper material, organization and workload private keys, provider credentials, protected context values, Agent Passports, authority credentials, mandates and delegations, approval decisions, task and response content, federation identities, the authority ledger, enterprise topology metadata, and exported audit packages.

## Trust Boundaries

| Boundary | Trusted Side | Untrusted Or Lower-Trust Side | Enforcement |
|---|---|---|---|
| Renderer to main | Electron main process and domain services | React renderer input | context isolation, no Node integration, typed preload allowlist, Zod parsing |
| Public to secret storage | trusted repositories | renderer-visible projections and exports | separate paths, masked metadata, explicit export allowlist |
| Biometric capture to identity | local proof service | camera frames and presented face | liveness, distance, ArcFace, BCH matching, lockout, signed proof |
| Agent to authority | policy and mandate services | scripted or future provider runtime | mandatory authorization before disclosure and execution |
| Local evidence to investigator | verified JSONL ledger | modified files or untrusted export consumer | hash linking, canonical hashing, integrity report, bundle hash |
| Local adapters to future services | stable domain ports | API, MongoDB, Bedrock, CLI providers | disabled adapters fail explicitly until configured |
| Domain services to enterprise view | typed state ports in Electron main | aggregated renderer projection | strict `EnterpriseOverviewState`, read-only IPC, endpoint-existence rule, protected-value exclusion |
| H2A to host providers/frameworks | Process Supervisor and signed connector boundary | host-authenticated CLI/framework process | fixed invocation, bounded environment/workspace/output, cancellation, signatures, `connected-observed` ceiling |
| Local node to friend node | signed federation service and pinned peer record | network and remote process | independent keys, TLS/key pins, signed bounded envelopes, nonce/sequence/expiry checks, capability and context limits |

## Threats And Mitigations

| Threat | Consequence | Implemented Mitigation | Residual Risk |
|---|---|---|---|
| Renderer attempts privileged filesystem or secret access | credential or key disclosure | capability-limited preload API; secret repositories remain in main process | a fully compromised host can still inspect local process memory |
| Agent acts without valid authority | unauthorized action or disclosure | deterministic fail-closed policy evaluation before every scripted protected step | future adapters must preserve this ordering |
| Child delegation expands privilege | agent self-escalation | child scope, action, resource, limits, expiry, and delegation depth must attenuate parent | policy correctness still requires review as scope vocabulary grows |
| Replay or expired authority is accepted | stale authorization | status, expiry, signature, subject, chain, and approval checks with stable denial codes | local clock manipulation is not hardware-attested |
| Revoked authority continues working | containment failure | cascading mandate revocation and authorization denial; affected work is blocked | already disclosed data cannot be recalled |
| Evidence record is edited or reordered | incident reconstruction becomes unreliable | canonical event hash plus previous-hash verification identifies first failed event | attacker with full disk control can replace the complete ledger and application state together |
| Audit export leaks sensitive content | privacy or credential exposure | explicit minimized export projection and negative tests for secrets and content bodies | identifiers and hashes can still be sensitive operational metadata |
| Demo invents successful work | misleading executive claim | deterministic agents use real policy, routing, persistence, response, and evidence services | scripted task content is representative, not autonomous model output |
| Raw biometric data is retained | biometric privacy harm | raw frames are not retained by default; protected helper material is isolated | local biometric implementation is not independently certified |
| Provider session is mistaken for identity | broken attribution | durable Passport is distinct from independently revocable runtime binding | external provider logs are outside this MVP |
| Observed host process is presented as governed | false containment claim | trust ceiling is persisted and surfaced consistently; `governed` remains zero/fail-closed without isolation proof | a viewer may still misunderstand `connected-observed` without the documented definition |
| Topology invents a missing identity or authority link | false audit assurance | an edge requires both persisted endpoints; unresolved event identifiers make the trace `partial` with exact missing domains | current-state lifecycle changes may make historic references unresolved until archival snapshots exist |
| Enterprise view leaks prompts, outputs, credentials, or context | confidentiality loss through aggregation/export | resolver extracts identifier/hash aliases only; V2 export has negative protected-value assertions | identifiers, topology, counts, and hashes remain sensitive operational metadata |
| Forged or replayed friend-node message is accepted | remote unauthorized execution | pinned node/TLS identity, canonical signatures, organization binding, sequence, nonce, expiry, capability and context attenuation | public deployment still requires production mTLS, firewall, key custody, and availability controls |
| Missing authority is bypassed during resume | unauthorized sensitive action | eligible routing, separation of duty, exact-purpose proof, signed quorum decision, narrow child mandate, and exactly-once resume | policy and role configuration remain security-critical administration |

## Security Assumptions

- The local operating-system account and filesystem are not fully compromised.
- The bundled application code and biometric model assets are obtained from a trusted build.
- The system clock is sufficiently accurate for an MVP demonstration.
- Live Claude, Codex, and Antigravity host adapters and framework connectors may be active, but all remain `connected-observed`; no container/gateway governance is claimed.
- Friend-node federation acceptance covers independently keyed local nodes and pinned loopback TLS, not a public production deployment.

## Production Requirements

Before enterprise deployment, add hardware-backed key custody, enterprise IdP/HRIS lifecycle, encrypted database storage, runtime gateway/container isolation, credential brokering, production mTLS/node registry, remote append-only evidence replication, trusted timestamps, centralized retention and SIEM integration, signed release provenance, dependency and penetration testing, licensed biometric models with genuine/impostor calibration and legal review, incident response procedures, and independent control validation.
