# Phase 21 - Enterprise Command Floor And Evidence V2

## Outcome

Phase 21 turns the Phase 11-20 services into one inspectable enterprise operating model. It does not duplicate or replace their enforcement. `EnterpriseObservabilityService` reads each domain through a typed state port, creates a read-only topology, resolves persisted trace references, and labels gaps instead of synthesizing missing records.

The Command Floor now summarizes active authority, connectors, Context Grants, federation, processes, and runtime trust. Evidence Explorer V2 provides topology, trace coverage, challengeable claims, and named enterprise replacement seams.

## Source-Of-Truth Domains

| Domain | Authoritative service/state | Enterprise projection |
|---|---|---|
| Human and organization | Human Identity V2 and Organization Authority | humans, memberships, credentials, proofs, organization ownership |
| Agent identity | Agent Identity V2 | Passports, workload attestations, runtime sessions, sponsors |
| Authority | Mandates and Multi-Human Approval | mandate bounds, pending approvals, approvers, narrow resume authority |
| Context | Context Broker | purpose-bound Context Grants and recipient relationships |
| Execution | Collaboration and Process Supervisor | agents, assignments, live runs, process state, output hashes |
| Connectors | Framework Connector Service | connector kind, health, trust ceiling, collaboration runs |
| Federation | Federation Service | independent nodes, active peers, bounded transport evidence |
| Evidence | hash-linked authority ledger | trace summaries, integrity, claims, Evidence V2 export |

No renderer component reads local files directly. Electron main composes the services, the preload exposes `getEnterpriseOverview`, and the renderer consumes the strict `EnterpriseOverviewState` contract.

## Operational Topology

The topology uses four operational lanes:

1. Identity: organization, human, membership, proof, agent, Passport.
2. Authority: authority credential, mandate, Context Grant, approval.
3. Execution: runtime session, connector, live run, output hash.
4. Transport: federation node and peer relationships.

Edges are emitted only when both persisted endpoint entities exist. Missing references are retained in the trace `missing_links` list and the trace is `partial`; the resolver never creates an entity merely because an event payload mentions its identifier.

## Evidence V2 Resolution

For each persisted `trace_id`, the resolver:

1. verifies the authority ledger and retains the exact integrity state;
2. groups ordered events and their actor, subject, mandate, and payload references;
3. extracts identifier and hash fields only, never prompt, response, context, biometric, key, or credential values;
4. resolves human, membership, credential, proof, Passport, runtime, mandate, grant, approval, connector, federation node, live run, and output references against current domain state;
5. labels the trace `complete`, `partial`, or `not-applicable` with explicit missing domains;
6. exports the same minimized topology and trace summaries in `h2a.audit.bundle.v2` with a canonical bundle hash.

Evidence V1 remains available when no enterprise provider is attached, preserving existing consumers and tests.

## Trust Labels

| Label | Meaning in this MVP |
|---|---|
| `unverified` | identity or runtime proof is absent or not accepted |
| `connected-observed` | H2A supervises and records the process/connector, but does not claim container or gateway containment |
| `governed` | reserved for a runtime whose isolation, tool, filesystem, network, and credential boundary has been proven; current count remains zero |
| `external-attested` | reserved for an accepted external attestation integration; current integrations do not claim it |

Trust labels are shown in the Command Floor posture, topology nodes, trace evidence, and claim challenge view. A successful provider login or output never upgrades `connected-observed` to `governed`.

## Claim Challenge Model

The Claims view publishes the exact claim, trust/status label, implemented ledger event types, matching-event count, and a direct challenge procedure. Current claims cover human binding, least-context disclosure, human approval, observed provider control, federation, backend boundaries, and the explicit non-claim for production biometric accuracy.

An empty event count is visible evidence that the current session has not demonstrated that claim; implementation status alone is not presented as session execution evidence.

## Replacement Seams

| Boundary | Local implementation | Enterprise replacement | Readiness |
|---|---|---|---|
| Persistence | atomic JSON/JSONL repositories | MongoDB, DynamoDB, organization data service | ready |
| Key/secret custody | Electron `safeStorage` protector ports | AWS KMS, CloudHSM, enterprise vault | ready |
| Workforce identity | local identity, membership, authority registry | IdP, HRIS, SCIM, WebAuthn | partial |
| Biometrics | local face/liveness/distance/BCH provider | licensed biometric provider or enterprise authenticator | ready contract; production calibration deferred |
| Agent execution | supervised local CLI/framework adapters | H2A Gateway, container workers, AWS Bedrock | partial |
| Federation | pinned loopback HTTP/HTTPS | managed mTLS gateway and public node registry | partial |
| Audit/retention | local hash-linked ledger | SIEM, immutable object retention, compliance archive | ready |

These seams are architectural ports, not claims that the named enterprise systems are already deployed.

## Security And Privacy Properties

- Topology is read-only and cannot authorize, approve, disclose, execute, or federate work.
- Every IPC response is parsed by the Phase 21 Zod schema.
- Edges require persisted endpoints; unresolved identifiers remain visible failures.
- Evidence V2 includes identifiers, states, hashes, and event types, but excludes protected values and process output bodies.
- Provider execution remains `connected-observed`; `governed` is fail-closed.
- Production biometric FAR/FRR remains a deferred claim pending licensed models and genuine/impostor calibration.

## Verification

- `tests/enterprise-observability-phase21.test.ts` proves complete resolution, explicit partial resolution without invented entities, and minimized Evidence V2 export.
- `tests/evidence-audit.test.ts` proves the original V1 investigation/export remains compatible.
- Typecheck validates main, preload, renderer, and all domain-port composition.
- Desktop and mobile browser inspection covers topology, traces, claims, seams, filters, trust labels, overflow, and overlap.

## Acceptance Boundary

P2-018 is complete when the automated, build, and visual gates pass. Phase 21 does not complete the Phase 22 credentialed cross-provider/cross-human demonstration, deferred physical cross-person biometric checks, Gemini authentication, production isolation, public federation deployment, or production biometric certification.
