# H2A Tests

This directory owns cross-package contract, integration, scenario, and desktop workflow tests. Package-local unit tests may live beside source files.

Phase 3 coverage includes versioned local data, legacy migrations, atomic writes and backups, path containment, feature configuration, adapter selection, runtime port compatibility, canonical event hashing, linked JSONL appends, tamper detection, and checked-in demo data integrity.

Phase 4 coverage adds local BCH registration and matching, signed Human Proof issuance, biometric data separation, evidence links, retry, and lockout behavior.

Phase 5 coverage adds provider-catalogue contracts, Human Proof-gated Agent Passport issuance, workload-key and credential isolation, masked credential metadata, workplace projection, and independent passport/runtime lifecycle transitions.

Phase 6 coverage adds persisted assignment creation and reassignment, legal and illegal status transitions, agent workplace projections, response authorship, message delivery, JSONL collaboration history, and evidence-body redaction.

Phase 7 coverage adds Human Proof-gated mandate signing, deterministic scope and limit decisions, missing/expired/revoked authority denial, bounded delegation, human approval, and cascading revocation containment.

Phase 8 coverage adds credential-free governed scenario execution, real assignment routing and responses, policy and disclosure transitions, success, denial, approval/resume, failure, timeout, revocation, evidence integrity, and shared scripted/live CLI/Bedrock runtime contracts.

Phase 11 includes an opt-in host containment proof invoked with `pnpm test:containment`. It uses a digest-pinned Linux image and records Docker-enforceable isolation evidence under `docs/plan2/evidence/`; it is intentionally separate from ordinary credential-free Vitest execution.

Phase 12 coverage adds independent organization-scoped employee identities, real BCH service enrollment at 20/45/70 records, subject-specific verification and synthetic cross-human denial, version rotation, revocation, timed lockout/recovery, duplicate-capture rejection, membership binding, nonce replay denial, public-state/evidence biometric minimization, signed idempotent V1 identity migration with mandatory biometric recapture, and synthetic labeled calibration-policy evaluation. Live keyboard/accessibility acceptance passed; two physical cross-person camera rejection checks remain deferred.

Phase 13 coverage adds biometric organization bootstrap, Ed25519 authority credential verification, employment and credential lifecycle enforcement, RBAC resource/action/limit evaluation, approval powers, credential tamper denial, and protected mandate issue/approval enforcement through the organization authority port.

Phase 14 coverage adds sponsor-authorized Passport V2 issuance, organization signature verification, workload and session private-key isolation, copied-passport attestation denial, one-time challenge-response, session-key rotation, trust-mode ceiling enforcement, lifecycle invalidation, and signed idempotent V1 migration.

Phase 15 coverage adds signed Connector Manifest import, signed Task Envelope validation, durable delivery state, sequence and authority-reference checks, bounded retry/dead-letter/cancellation, broker restart persistence, evidence linkage, Python SDK syntax, and a real separate-process context/result round trip that survives lost acknowledgement without duplicate execution.

Phase 16 coverage adds fixed official Claude/Codex/Antigravity invocation policies, provider health, authority and workspace fail-closed checks, environment isolation, bounded output, evidence ordering, restart recovery, timeout, actual process-tree cancellation, Passport/binding/session revocation, and opt-in real structured provider proofs. Live tests run only when `H2A_RUN_LIVE_PROVIDER_TESTS=1`; `H2A_LIVE_PROVIDERS` can select provider lanes.

Phase 17 coverage adds truthful framework capability/dependency health, remote-HTTPS and URL-credential enforcement, current OpenClaw/n8n host-boundary contracts, Python LangGraph middleware syntax, and a real official-MCP-to-local-CLI collaboration using organization-signed tasks, runtime-signed frames, dependency propagation, least-context release, durable acknowledgement, and verified evidence.

Phase 18 coverage adds eligible-membership routing, separation of duty, policy-bound credentials, exact-purpose Human Proof, quorum, terminal rejection, organization-signed decisions and narrow child mandates, approval attribution, and exactly-once paused-action resume.

Phase 19 coverage adds classified and sealed artifacts, exact recipient/purpose Context Grants, field transformations and withholding, budget/use/expiry/revocation enforcement, idempotent disclosures, authority-preserving compaction, separate-process leakage scans, durable signed agent messages, and forgery/sequence-replay denial.

Phase 20 coverage adds independent node keys, signed invitation/registration/acceptance, key and TLS certificate pinning, capability/context attenuation, signed bounded task/ack exchange, sequence and nonce replay persistence, forgery and credential denial, heartbeat, revocation, remote HTTP denial, and minimized federation receipts.

Phase 21 coverage adds complete cross-domain enterprise trace resolution, explicit partial traces without invented entities, consistent runtime trust posture, topology endpoint integrity, claim evidence counts, and privacy-minimized Evidence V2 export while retaining Evidence V1 compatibility.

Phase 9 coverage adds complete protected-action attribution, delegation ancestry, event and decision filtering, exact tamper localization, privacy-minimized audit export, canonical bundle hashing, and export-event evidence.

Phase 10 coverage adds a clean-storage executive integration gate across persisted Human Proof, four signed provider-lane agents, root and delegated mandates, successful collaboration, least-privilege denial, Human Approval/resume, cascading revocation, evidence investigation, minimized export, and non-destructive demo-session creation.
