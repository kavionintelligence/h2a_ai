# CISO buyer review — 25 September 2026

## Verdict

**Demo clarity: 7/10. Enterprise production readiness: 3/10.** These are reviewer judgments, not calculated risk scores, certifications or an independent penetration test. I would consider a bounded, non-sensitive pilot; I would not approve a 6,000-person production rollout on the evidence available.

The compelling story is accountable AI work: discovery observation → human owner → Passport → bounded mandate → room collaboration → human decision → reviewed memory → trace. The product becomes less credible when this is presented as universal discovery, enterprise-wide containment or independently trustworthy evidence.

The simulation demonstrates a workflow. It does not demonstrate that 6,000 employees were monitored, that real tool spending fell, or that the product stopped a real data leak.

## Buying questions and assessment

Scores use 0 = no evidence, 5 = credible bounded implementation, 10 = independently validated enterprise operation. They are not averaged into an assurance score.

| CISO question | Current judgment | Grade | Required purchase evidence |
| --- | --- | --- | --- |
| What AI exists, and where are we blind? | Endpoint and configured-source observations work; no verified fleet denominator or universal AI visibility. | 4/10 | Enrolled endpoints vs expected inventory, supported sources, detection precision/recall, stale-source alerts. |
| Who owns an agent, and what may it do? | Human binding, signed Passports, mandates and execution checks exist locally. | 6/10 | IdP-derived ownership, offboarding, key rotation, expiry, revocation and attempted privilege escalation. |
| Can I stop it? | ByoSync can reject governed work, suspend authority and cancel managed runs. It cannot stop every external AI session. | 4/10 | Connector-specific stop receipts, failure modes, time-to-enforce and known remaining exposure. |
| Is a human really accountable? | Named roles and independent review for room runs/memory exist. Local operator mode is not independent identity proof. | 5/10 | SSO/MFA, session lifecycle, least privilege and reviewer-independence checks for each action class. |
| Can one team steal another team's context? | Room access and reviewed-memory eligibility exist. No independent isolation or poisoning assessment recorded. | 5/10 | Cross-role, cross-room and cross-tenant negative tests; deletion and poisoned-memory handling. |
| Can sensitive data leave the company? | Bounded CLI workflows are not enterprise DLP. Optional external adapters require data-flow review. | 2/10 | Destination policy, content inspection, residency, secrets handling and adversarial tests. |
| Could an administrator rewrite the evidence? | Local hash-linked records and signed receipts are useful; same-host data and keys are not independent trust anchors. | 4/10 | Externally protected checkpoints/WORM export, retention, access audit and administrator-tamper exercise. |
| Will it survive failures and scale? | Portable single-host deployment exists. No demonstrated HA, restore drill or 6,000-person load evidence. | 2/10 | Restore verification, RPO/RTO, capacity limits, failover and operational ownership. |

## Changes implemented in this review

- Security Posture in both real workspace and separately labeled enterprise simulation. One-click overview entry, priority filters, concern detail, evidence/owner/impact and working drill-through links.
- Explicit fleet coverage unknown; stale/invalid/missing scan dates; latest received source reports checked for freshness rather than trusting a reported “healthy” label. 24 hours is a review heuristic, not a customer SLA. Report view is bounded to the loaded report window.
- Incomplete identity authority and visible-room/pending-action impact scope. The UI does not invent a company-wide blast radius.
- Waiting human decisions, proposed/published memory counts, local ledger verification versus independent attestation.
- Control boundary matrix and six expandable production acceptance gates. No invented compliance percentage or blanket safe score.
- Exportable security brief retains provenance, limitations and acceptance gates.
- Backend now projects mandate expiration and emits findings for expired mandates and invalid/inactive Passport authority. The inventory excludes expired/unknown authority from its ready state; inspectors display expiry and known impact scope.
- Removed direct approval from the decision-list shortcut. It now opens the exact-action review. This is a UX safeguard; the backend remains the enforcement boundary.
- Added anti-framing, no-referrer and MIME-sniffing response protections, plus a limited CSP covering framing, base URIs and objects. This is not a complete script-src CSP. Shared-token cookies now receive Secure when an HTTPS public origin is configured. TLS still requires deployment configuration.
- Updated stale guard-test fixtures to current inventory-report/evidence-export actions and the current state path, preserving tamper, expiry, revocation, replay and recovery assertions.

## Actual code evidence

Paths are relative to `ByoSync/h2a-mvp/h2a-mvp`.

- `apps/governance/service.ts`: `requirePassport`, `requireGoverned`, `validateActiveAuthority`, `execute`, `reviewMemory`, `snapshot`. Signed authority, expiration, exact-action checks and actual local exports. `initialize` persists the signing private key in the deployment's settings storage; it is not an external KMS.
- `apps/governance/room-runtime.ts`: `decide`, `execute`, `publish`, `reviewedMemory`. Named-user independent review, restricted CLI arguments, repeated authority checks, publication gate and reviewed-context validation. A cancellation/authority check cannot retract data already sent to a model provider.
- `apps/governance/actors.ts`: local actor and configured named credentials. Not federated SSO, MFA or SCIM.
- `apps/governance/server.ts`: host/origin validation, request limits, role routing, session cookies and response headers. The shared-token login URL remains sensitive; do not expose it publicly or treat it as enterprise identity.
- `apps/governance/platform.ts`: bounded local telemetry/source-report retention and per-payload hashes. Collector-reported evidence is not independent attestation or a durable external archive.
- `apps/web/src/security-posture/`: conservative projections and the new CISO decision view.

## Remaining production blockers — not fixed by widgets

1. **Enterprise identity:** integrate and test the customer's IdP, MFA assurance, session revocation, offboarding, least privilege and approval separation. Decide tenant model before shared deployment.
2. **Data and key protection:** move signing secrets behind a managed key boundary; document encrypted persistence, backup encryption, adapter egress, data residency, retention and deletion. Define secrets/PII redaction and actual DLP integration.
3. **Discovery and enforcement coverage:** implement enrolled asset inventory and source heartbeat contracts. For each endpoint/cloud/browser integration, prove discovery limits and supported containment; record a receipt or a visible failure.
4. **Independent evidence:** export to a separately administered immutable destination, verify checkpoints and retention, and test tampering by a privileged local administrator.
5. **Abuse testing:** independently test role/room/tenant isolation, prompt injection, poisoned memory, forged telemetry, replay, tool permissions and denial of service. Source-code restrictions alone are not proof of model safety.
6. **Operations:** benchmark the intended workload, demonstrate backup restoration and restart behavior, define alert ownership and RPO/RTO, and plan high availability where required.

Some of these require customer infrastructure, secrets, a deployment model and independent testing. They cannot honestly be completed by adding sample data or a UI badge.

## Five-minute buying demo

1. Open Security Posture. State exactly whether you are showing workspace evidence or synthetic playback. Explain the fleet denominator gap first.
2. Select a shadow/unowned observation. Show source evidence, owner responsibility, and the distinction between installed, active and authorized.
3. Inspect an agent's human binding, Passport, mandate expiration and known room impact. In a dedicated test workspace, suspend authority and demonstrate a refused governed action; separately show the external containment limit.
4. Open a held exact-action request. Demonstrate rejection or authorized independent review. Inspect the result and execution count.
5. Inspect a proposed memory record, review it, then show scoped reuse and its evidence trail. Export the security brief and discuss the six production gates.

Use the real workspace for real control evidence. Use the labeled simulation only for company-scale navigation and narrative. Never substitute simulation throughput, tool-call savings or approvals for measured customer outcomes.

## Verification

TypeScript check and production frontend/backend build; isolated governance/posture/simulation tests; room/runtime/connector tests; local HTTP and HTTPS-configured cookie tests; real-workspace and simulation browser journeys. Browser checks include security filters, evidence drill-through, exact-action review, download, playback isolation and responsive widths. No paid CLI runs or real endpoint containment were initiated for this review. These are functional regressions, not a security certification, penetration test or scale benchmark.
