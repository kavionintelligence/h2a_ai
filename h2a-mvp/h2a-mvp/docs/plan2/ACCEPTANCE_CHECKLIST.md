# Plan 2 Acceptance Checklist

## Phase 11

- [x] Active status states that live provider collaboration is incomplete.
- [x] V0 provider requirements are explicitly historical definition-only acceptance.
- [x] Plan 2 traceability and final acceptance gates exist.
- [x] V1 contracts are inventoried and compatible V2 migrations are defined.
- [x] Strict executable V2 schemas and migration receipt exist.
- [x] Trust claims and ceilings are frozen.
- [x] Live credential and privacy handling is defined.
- [x] Claude structured restricted-tool probe completed.
- [x] Standalone official Codex CLI installed and live JSONL read-only probe completed.
- [x] Official Gemini CLI installed and fail-closed auth state recorded.
- [x] Official A2A 1.0 client/server round trip with required H2A extension passes.
- [x] Real BCH 20/45/70 performance benchmark passes.
- [x] OpenClaw native typed-hook plugin boundary selected.
- [x] Local-only two-node federation topology selected.
- [x] Exact WSL2/Docker setup and proof sequence documented.
- [x] WSL2/Docker isolation boundary installed and Linux engine connectivity verified.
- [x] WSL2/Docker isolation feasibility containment proof passes.
- [x] Gemini authentication is explicitly classified `user action scheduled`; its structured-output probe remains a Phase 16/22 live-provider gate.

Phase 11 is complete. On 2026-08-21 the user explicitly scheduled Gemini API authentication and Cursor Agent work for later, while prioritizing Claude, OpenAI/Codex, and Antigravity. Antigravity CLI `1.1.16` is now installed and reached authenticated structured generation, but a malformed user-level telemetry hook prevents clean tool-enabled probe acceptance. This follows the Plan 2 rule that a failed provider feasibility spike blocks only its dependent phase. Phase 16 subsequently proved real host-process supervision, mandate/passport/session revocation wiring, and runtime evidence integration at `connected-observed`; real credential brokering, H2A Gateway mediation, and execution inside the selected isolation boundary remain required for `governed`.

## Phase 12

- [x] Multiple employee identities persist independently.
- [x] Each enrollment protects a configurable 20-70 BCH record token set.
- [x] Token sets support versioning, rotation, revocation and deduplication; V1 identity metadata migrates with signed receipts while legacy biometric material correctly requires recapture.
- [x] Verification binds proof purpose, nonce, organization, policy and enrollment version.
- [x] Synthetic labeled genuine/impostor calibration report is generated through the real BCH codec for 1-, 3-, and 5-match policy mechanics; human FAR/FRR remains explicitly unmeasured.
- [x] Automated denial, both own-person checks, and both operator-attested physical cross-person BCH rejections pass; exact attempts and the temporary liveness-bypass boundary are recorded in `LATER_TASKS.md`.
- [x] Raw images, embeddings, BCH records and helper material remain absent from public state and evidence.
- [x] Employee enrollment and verification UI states pass responsive and accessibility checks. Responsive browser checks pass; the user confirmed live Electron keyboard navigation, screen-reader announcements, camera-denial handling, and retry/recovery on 2026-08-21.

## Phase 13

- [x] Organizations, departments, manager relationships, roles, and employment memberships persist locally through strict V2 contracts.
- [x] One-time bootstrap requires a current organization-bound Human Proof and creates a signed authority-administrator credential.
- [x] Join, suspend, transfer, reactivate, terminate, expiry, and credential revocation are enforced with evidence.
- [x] RBAC resource/action scopes, amount/record limits, and approval powers produce stable allow/deny reason codes.
- [x] Identity assurance and business authority remain separate checks.
- [x] An authenticated employee without the required authority cannot issue, delegate, lifecycle-change, or approve a protected mandate.
- [x] Employee, role, credential, hierarchy, lifecycle, and policy-evaluation views pass responsive visual checks.

Phase 13 is complete under the user's explicit phase-order exception. Phase 12 cross-person BCH evidence is now complete; Phase 18 independently owns separation-of-duty and quorum requirements.

## Phase 14

- [x] Passport V2 issuance requires current sponsor Human Proof and `agent-passport:issue` authority.
- [x] Passport V2 binds organization, sponsor, membership, authority credential, connector, purpose, risk, capabilities, workload key, lifecycle, and expiry under an organization signature.
- [x] A one-time workload-key challenge must verify before a runtime session becomes ready.
- [x] Copying public passport and binding records without the workload private key cannot attest.
- [x] Session rotation creates a fresh session key and revokes the prior session.
- [x] Passport and runtime lifecycle are independent while inactive passports invalidate active sessions.
- [x] `governed` and `external-attested` labels fail closed until their owning integration phases.
- [x] V1 migration is explicit, signed, workload-key preserving, and idempotent.
- [x] Onboarding and runtime identity views pass desktop/mobile visual checks.

## Phase 15

- [x] Publisher-signed Connector Manifests reject canonical-hash or signature tampering.
- [x] Organization-signed Task Envelopes retain passport, runtime-attestation, mandate, Context Grant, trace, sequence, expiry, and idempotency references.
- [x] Durable delivery supports queued, in-flight, retrying, acknowledged, dead-letter, and cancelled states.
- [x] Connector result and acknowledgement frames require valid runtime signatures, payload hashes, sequence, expiry, and matching authority references.
- [x] A separate process requests authorized context and returns a typed signed result.
- [x] Simulated acknowledgement loss retries without duplicate execution.
- [x] TypeScript and Python SDK foundations plus conformance tests exist.
- [x] Connector health and delivery status are visible through typed IPC and the local Settings surface.

Phase 15 is complete. The conformance authorization port enforces a real bounded grant fixture; the Electron runtime remains fail closed until the Phase 19 Context Broker is connected. Provider processes remain `connected-observed` until Phase 16 proves actual supervision and isolation.

## Phase 16

- [x] The renderer cannot select an executable, shell, arguments, unrestricted environment, or workspace outside the approved root.
- [x] Official Claude Code, OpenAI Codex, and Antigravity adapters use fixed restricted command policies and report missing/degraded dependencies honestly.
- [x] Active Passport V2, provider binding, runtime session, attestation, mandate, agent, workspace, and evidence integrity are checked before launch.
- [x] Real structured tasks completed through all three provider adapters and produced minimized hash-linked proof files.
- [x] Output streams through bounded/redacted persistent records and remains inspectable in the Command Floor Runtime tab.
- [x] Operator cancellation, execution timeout, Passport revocation, binding revocation, and session revocation terminate actual process trees.
- [x] Restart recovery and application shutdown cannot leave a run falsely reported as controlled.
- [x] All host CLI runs remain explicitly `connected-observed`; no adapter is upgraded to `governed` without complete container/gateway isolation proof.

Phase 16 is complete for the Plan 2 `connected-observed` acceptance path. Claude Code `2.1.216`, Codex CLI `0.148.0`, and Antigravity `1.1.16` produced real structured output through H2A. Antigravity remains degraded for tool-enabled use because of the recorded user-level Windows telemetry hook. The digest-pinned Docker feasibility proof is not execution evidence for these host-authenticated runs, so H2A Gateway credential brokering and containerized tool/network enforcement remain required before the `governed` trust label can be used.

## Phase 17

- [x] MCP uses the official TypeScript SDK and completes a real signed stdio exchange.
- [x] A2A uses the official JavaScript SDK and requires the H2A authority extension in the Agent Card.
- [x] Signed HTTP enforces HTTPS remotely, permits loopback for the local demo, rejects URL credentials, bounds responses, and fails redirects/timeouts.
- [x] A real n8n custom node package, LangGraph middleware, and OpenClaw typed-hook plugin boundary are present with setup guides and truthful missing-host health.
- [x] Custom CLI and custom HTTP adapters share the signed task/context/result/acknowledgement contract.
- [x] OpenAI, Anthropic, Gemini, and Bedrock declarations report credential prerequisites without reading or persisting values.
- [x] Connector capabilities, endpoint policy, dependency health, trust ceiling, delivery state, and collaboration runs are persisted and exposed through typed IPC and Settings.
- [x] One MCP framework agent and one separate local CLI agent complete dependent tasks on the same signed trace with least-context handoff and verified evidence.
- [x] No connector exceeds `connected-observed`; unavailable hosts and credentials are not replaced by scripted success.

Phase 17 is complete at `connected-observed`. The phrase "governed task" is satisfied at the H2A envelope and decision-flow layer: task, mandate, passport, attestation, grant, signatures, dependency, acknowledgement, and evidence references are enforced. The executing host processes are not labelled `governed` until the selected isolation/gateway boundary contains them. Phase 19 must replace the conformance authorization fixture with the complete classified Context Broker before final live-product acceptance.

## Phase 18

- [x] Unauthorized actions remain paused and freeze the exact task, agent, mandate, resource, action, effect hash, review grant, risk, and idempotency key.
- [x] Routing includes only active employees whose roles, limits, approval power, credentials, and policy binding satisfy the requirement.
- [x] Separation of duty excludes the requester and routing fails when eligible employees cannot meet quorum.
- [x] Every co-signature requires a current biometric Human Proof for the policy's exact purpose and is organization-root signed.
- [x] Rejection is terminal; expiry, withdrawal, stale proof, or revoked authority invalidates unconsumed execution.
- [x] Quorum issues a zero-delegation child mandate narrowed to the exact requested effect.
- [x] The paused assignment resumes once; replay returns completed state without executing again.
- [x] Evidence identifies the requesting human and agent, every approving human/proof/credential, the child mandate, task, and output hash.
- [x] Authority Inbox and biometric-purpose handoff pass desktop and mobile visual checks.

Phase 18 is complete. The independent physical cross-person BCH checks are now recorded; final high-assurance biometric acceptance still requires liveness to be restored.

## Phase 19

- [x] Artifact fields are classified and values persist only as OS-protected local ciphertext; public state contains metadata and hashes.
- [x] Context Grants bind exact organization, task, mandate, recipient agent, Passport V2, purpose, fields, transformations, token budget, use limit, and expiry.
- [x] Recipient, purpose, unauthorized-field, classification, budget, use, expiry, and revocation checks fail closed.
- [x] Value, mask, summarize, and reference transformations are deterministic and disclosure evidence excludes plaintext values.
- [x] Valid repeated context requests are idempotent and do not consume a second use.
- [x] A separate connector process receives only the authorized projection; a hidden sentinel is absent from environment, output, public state, logs, evidence export, and persisted file bytes.
- [x] Signed governed messages bind task, trace, connectors, Passports, mandate, Context Grant, content hash/reference, sequence, deduplication identity, and expiry.
- [x] Forged messages and sequence replay are rejected; valid retry is idempotent.
- [x] Compacted provider authority retains human, agent, Passport, attestation, mandate, grant, task, trace, and authority hash.
- [x] Context Broker artifact, grant, disclosure, and message inspection passes desktop and mobile visual checks without displaying protected values.

Phase 19 and P2-016 are complete. The Context Broker is connected to the production Electron connector path and replaces its conformance authorization fixture. Host execution remains truthfully `connected-observed` until container/gateway enforcement is proven.

## Phase 20

- [x] Every node generates an independent Ed25519 key and protects its private key behind the configured key-protector port.
- [x] Invitation, registration, acceptance, key pinning, capability attenuation, context-field limits, expiry, heartbeat, offline state, and revocation are durable.
- [x] Node and organization binding, payload hash, signature, monotonic sequence, nonce, expiry, task authority references, credential exclusion, and context limits fail closed.
- [x] A real TLS listener and client exchange a signed bounded task and signed acknowledgement; the wrong certificate pin is rejected.
- [x] Remote HTTP and implicit non-loopback listeners are denied; remote operation requires explicit enablement and HTTPS.
- [x] Restart retains replay defense and minimized receipts contain no task context, provider credentials, or private keys.
- [x] Federation node, peer, handshake, and traffic views pass desktop/mobile visual and overflow checks.

Phase 20 and P2-017 are complete for the local two-node topology. Public federation still requires operator-supplied hosting, domain, TLS, firewall, and production key custody. Federation does not upgrade host provider execution beyond `connected-observed`.

## Phase 21

- [x] Humans, organizations, memberships, credentials, proofs, agents, Passports, runtime sessions, connectors, mandates, Context Grants, approvals, federation nodes, live runs, and output hashes appear in one typed topology.
- [x] Topology relationships are emitted only when both persisted endpoints exist; unresolved references remain visible and are never replaced with invented entities.
- [x] Persisted traces resolve across all material Phase 11-20 domains and report `complete`, `partial`, or `not-applicable` with exact missing domains.
- [x] `unverified`, `connected-observed`, `governed`, and `external-attested` are consistent across runtime posture, topology, and claims; current host providers are not upgraded beyond `connected-observed`.
- [x] Evidence V2 exports the enterprise topology and trace coverage with a canonical hash while excluding protected context, prompt/output bodies, credentials, biometric material, and private keys.
- [x] The Claims view exposes supporting event types, current-session event counts, and challenge procedures, including explicit backend and biometric non-claims.
- [x] CTO replacement seams identify persistence, secrets, workforce identity, biometrics, execution, federation, and evidence ports without claiming deployed enterprise backends.
- [x] The enterprise Command Floor and Evidence Explorer V2 pass desktop/mobile visual, overflow, interaction, typecheck, test, lint, and production-build gates.

Phase 21 and P2-018 are complete. This is an enterprise-observable local product boundary, not the Phase 22 live cross-provider acceptance event. Host and framework execution remains `connected-observed`, and production biometric accuracy remains deferred.

## Phase 22

- [x] A strict manifest and eleven-gate acceptance contract reject incomplete sessions.
- [x] Six adversarial categories derive status only from persisted Phase 22 evidence.
- [x] Demo Gate exposes pass, fail, pending, and user-action-required states through typed IPC.
- [x] Final package export is canonical-hashed and excludes protected values and runtime bodies.
- [x] The focused approval, context, federation, replay/tamper, and containment aggregate passes 20 tests.
- [x] Two physical cross-person BCH rejection checks are recorded; both returned `BIOMETRIC_MISMATCH` with 0 matches and no cross-bound proof. Liveness was temporarily bypassed and remains a separate final acceptance prerequisite.
- [ ] A second enrolled human biometrically approves the exact paused live action.
- [ ] Claude, Codex, the accepted Google lane, and a conformant framework agent complete one shared task.
- [ ] Live cancellation, revocation, restart, and six attacks are persisted under Phase 22 traces.
- [ ] Demo Gate reports eleven of eleven passed and the final package is recorded.

The Phase 22 evaluator and export are complete, but P2-019 remains `in-progress`. Operator-accessible framework execution and shared-trace propagation through approval/delegation denials must be implemented before the remaining physical and credentialed ceremony can close Plan 2.

## Final Plan 2 Gate

- [ ] Two humans have independent 20-70 record enrollments and cannot cross-verify.
- [ ] Organizational roles, authority credentials, separation of duty and quorum are enforced.
- [ ] Passport copying without workload private key cannot create a trusted session.
- [ ] Claude, Codex and Gemini complete real parts of one task.
- [ ] At least one conformant external framework agent participates.
- [ ] Every agent receives only its authorized Context Grant.
- [ ] Missing authority routes to an eligible human and resumes exactly once after biometric co-sign.
- [ ] Revocation and cancellation stop actual execution.
- [x] Two independently keyed local nodes exchange signed H2A federation envelopes.
- [ ] Replay, forged approval, over-broad delegation, leakage and tamper attempts fail closed.
- [ ] Evidence reconstructs both humans, every passport/session, authority chain, context grant, message, action and output.
