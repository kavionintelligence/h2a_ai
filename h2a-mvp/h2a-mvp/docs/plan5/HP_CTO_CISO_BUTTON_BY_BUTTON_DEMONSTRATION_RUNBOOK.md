# HP CTO/CISO Button-By-Button Demonstration Runbook

## Document Control

| Field | Value |
|---|---|
| Audience | HP CTO, CISO, enterprise AI leaders, security architects, and the H2A demo operator |
| Product posture | Local, non-commercial demonstration MVP |
| Current trust ceiling | `connected-observed` |
| Primary presentation | Office |
| Technical verification | Control |
| Current implementation status | Plan 5 Phases 45-50 implementation-complete; Phase 51 operator acceptance open |
| Recommended live duration | 18 minutes executive story plus 10 minutes technical drill-down |

This runbook demonstrates the following H2A control chain:

```text
Human Proof
  -> employee authority
  -> Agent Passport
  -> runtime attestation
  -> mandate
  -> assignment
  -> Context Grant
  -> signed handoff
  -> independent approval
  -> output hash
  -> evidence trace
```

## Truthful Demonstration Boundary

### What H2A can demonstrate now

- two enrolled employees with purpose-bound Human Proof;
- organization membership, role, credential, and separation-of-duty authority;
- Agent Passport V2, runtime binding, runtime session, and runtime attestation;
- real local Claude Code, Codex, Antigravity, custom CLI, and MCP execution when their official runtimes are healthy and authenticated;
- an editable four-node goal graph for research, UI design, implementation, and QA;
- exact-scope mandates, assignments, Context Grants, dependencies, and predecessor output hashes;
- real signed two-root federation on the approved local loopback topology;
- independent approval, exactly-once resume, cancellation, revocation, and persisted evidence;
- Office and Control views over the same canonical local data root.

### What must not be claimed yet

- Phase 51 final operator acceptance has not passed;
- required liveness is not accepted while the product is in `demo-bypass` mode;
- the trust ceiling is not higher than `connected-observed`;
- the approved federation demonstration is two independent local roots, not an internet or multi-laptop production deployment;
- a signed remote task acknowledgement proves receipt and bounded transport;
- the present friend-node `Acknowledge` path does not by itself prove that the remote provider executed the assignment and produced the returned output;
- do not say that the friend's Antigravity or custom agent performed QA or research unless a genuine remote provider run and signed completed result are visibly present;
- do not describe H2A as a replacement for enterprise IAM. Present it as an execution-time authority and evidence layer that can complement enterprise identity systems.

## The Executive Claim

Use this language:

> Existing identity systems can identify a user, workload, or service. H2A demonstrates a continuous, purpose-bound execution chain across the human, the agent identity, the live runtime, delegated authority, minimized context, another human's approval, and the resulting evidence. Every transition is inspectable and can fail closed.

Do not say “current IAM has no agent identity.” Several enterprise platforms now provide agent or workload identities. H2A's demonstrated difference is the continuous binding and evidence chain across a multi-agent task.

## CTO/CISO Challenge: How H2A Is Different

This is the answer to use when someone asks, “Why is this not just Okta, Entra Agent ID, a workload passport, or A2A?”

### The 30-Second Answer

> Okta, Entra, Auth0, and workload-identity systems provide important identity, lifecycle, authentication, token, entitlement, and resource-access controls. A2A provides a standard way for agents to discover one another and exchange tasks, messages, status, and artifacts. H2A is demonstrating a complementary execution-time control and evidence chain: a named human proves presence for an exact purpose; organization authority sponsors a durable agent Passport; a current runtime is attested; a signed mandate and assignment bound the task; a recipient-specific Context Grant limits disclosure; independent approval gates a sensitive effect; and the resulting output hash can be reconstructed through one evidence topology.

Do not claim that H2A replaces an enterprise IdP, IGA, workload-identity platform, or A2A. The defensible claim is that H2A joins those categories to task-level execution authority and evidence in this demonstration.

### Fair Comparison

| Category | What current products or standards already provide | What not to claim | What H2A demonstrates in addition |
|---|---|---|---|
| **Okta for AI Agents** | Agent registration and lifecycle, least-privilege resource connections, authentication through token flows, scope governance, accountability links, and System Log visibility | Do not say Okta has no agent identity, access governance, least privilege, lifecycle, or audit | A single task investigation that resolves exact-purpose Human Proof, organization authority, Passport, current runtime attestation, attenuated mandate, assignment, Context Grant, approval, output hash, and containment receipts |
| **Microsoft Entra Agent ID** | Purpose-built agent identities, blueprints, sponsors, lifecycle governance, access packages, Conditional Access, protection, and audit/sign-in visibility | Do not say Entra lacks agent sponsors, agent lifecycle, entitlement governance, or access policies | Runtime- and task-specific mandate ancestry, recipient field disclosure, signed handoff lineage, exactly-once effect resumption, and output-level evidence in the H2A task topology |
| **Auth0 for AI Agents** | User authentication, OAuth/OIDC, delegated API access, Token Vault, fine-grained RAG authorization, and CIBA/RAR human approval | Do not say Auth0 lacks delegated user context or human-in-the-loop authorization | H2A's local demonstration binds approval to the same persisted agent/runtime/mandate/assignment/context/output chain and exposes it in one operational investigation |
| **SPIFFE/SPIRE and workload identity** | Cryptographically verifiable workload identity using SPIFFE IDs and SVIDs, workload attestation, short-lived identity documents, and trust bundles | Do not say workload identity cannot identify or authenticate running software | H2A adds human sponsorship, business mandate semantics, task assignment, field-level Context Grants, independent effect approval, and application-level output provenance above workload authentication |
| **A2A** | Agent Cards, remote-agent discovery, authentication requirements, stateful Tasks, Messages, Artifacts, streaming, and task lifecycle | Do not say A2A is merely an unsecured chat format | H2A treats A2A as a transport option and applies organization authority, signed mandates, context limits, peer pins, approval, revocation, output hashes, and evidence around the task |
| **H2A demonstration MVP** | A local execution-time authority and evidence layer across humans, agents, runtimes, tasks, context, approvals, federation, outputs, and denials | Do not call the MVP a production replacement or claim trust above `connected-observed` | The differentiator is visible continuity across the whole protected work path, including what was withheld and why a command was allowed, paused, denied, cancelled, or resumed |

Official reference basis, verified for this runbook on 2026-09-02:

- [Okta AI agent registration, lifecycle, and least privilege](https://developer.okta.com/docs/api/secures-ai/ai-agents)
- [Okta AI agent resource connections](https://help.okta.com/oie/en-us/content/topics/ai-agents/ai-agent-secure.htm)
- [Microsoft Entra Agent ID](https://learn.microsoft.com/en-us/entra/agent-id/)
- [Microsoft Entra agent identity governance and sponsorship](https://learn.microsoft.com/en-us/entra/id-governance/identity-governance-overview)
- [Auth0 for AI Agents](https://auth0.com/docs/get-started/auth0-for-ai-agents)
- [Auth0 asynchronous authorization](https://auth0.com/ai/docs/intro/asynchronous-authorization)
- [SPIFFE concepts and SVIDs](https://spiffe.io/docs/latest/spiffe/concepts/)
- [A2A protocol specification](https://a2a-protocol.org/dev/specification/)

### What “Identity And Mandate Travel” Actually Means

Use precise language. The biometric image, biometric helper data, private signing keys, provider credentials, and full previous responses do **not** travel from agent to agent.

The governed chain carries or references only what the next boundary needs, such as:

- initiating `human_id` and organization membership reference;
- authority credential and role decision references;
- agent and Passport IDs;
- runtime session and attestation IDs;
- mandate ID, ancestry, exact scope, limits, expiry, and signature/hash;
- assignment, task, and recipient IDs;
- Context Grant ID, permitted fields, transformations, budget, use count, and expiry;
- projection hash and withheld-field decision;
- predecessor output hashes instead of previous response bodies;
- peer ID, pinned key, sequence, payload hash, and signed acknowledgement for a remote boundary;
- approval request, exact effect hash, quorum, approver proof reference, and decision;
- final output hash, reason code, evidence IDs, and trace references.

At each protected boundary H2A resolves these references against current persisted state. A revoked mandate, expired proof, mismatched recipient, inactive runtime attestation, exceeded Context Grant, invalid peer pin, or missing approval blocks the next operation.

Say:

> Human accountability travels as signed, minimized authority references and hashes. The employee's biometric material does not travel. Each receiving boundary revalidates current authority before it releases context, launches a provider, accepts a handoff, or applies an effect.

### Seven-Minute “Show Me The Difference” Challenge

Use one clothing-storefront task that already has a `tr_goal_*` trace. Keep its trace ID visible throughout this sequence.

#### 1. Prove The Human Is More Than A Login

1. In **Office**, click **Live organization**.
2. Select the initiating employee.
3. Point to the employee's membership, role, and active signed credential.
4. Trigger a protected command only if a fresh demonstration proof is needed.
5. In the Human Proof popup, point to:
   - the required employee name;
   - the exact command purpose;
   - the capture policy and proof expiry;
   - the truthful liveness posture.
6. Complete the proof and let the originating screen refresh automatically.

What this adds beyond a normal login:

- fresh presence for one exact purpose;
- organization membership and business-power evaluation;
- short proof lifetime;
- a durable proof reference, not biometric material, for later attribution.

#### 2. Prove The Agent Is More Than An OAuth Client Or Agent Card

1. Click **Agent roster**.
2. Select Claude or Codex.
3. In the Inspector open **Agent → identity**.
4. Point to **Agent Passport**, **Human sponsor**, organization, risk/capability boundary, and mandate reference.
5. Open **runtime**.
6. Point to the separate provider binding, runtime session, runtime attestation, provider health, and trust ceiling.

Say:

> The Passport is the durable organization identity. The provider binding is replaceable. The current process still needs its own session and attestation before the Passport can be used for execution.

#### 3. Prove Authority Is Task-Bound And Attenuated

1. Click **Tasks**.
2. Select the research node and then the coding node.
3. Point to the different owners, dependencies, allowed capabilities, context fields, and approval requirements.
4. Click **Technical details** to enter **Control → Command Floor** if requested.
5. Open **Control → Mandates**.
6. Select the root mandate and show **Authority chain**.
7. Select a child mandate and show that its resource, actions, limits, duration, and requested fields are equal to or narrower than its parent.
8. Use **Run policy** only for a pre-arranged non-destructive challenge.

Say:

> An access token can authenticate the caller. The H2A mandate records what this agent may do for this exact delegated task, how far delegation can continue, and when that authority expires.

#### 4. Prove The Next Agent Does Not Receive The Whole Conversation

1. Return to **Office → Context**.
2. Open **Grants** and select the grant for the next task node.
3. Point to recipient agent, Passport, task, mandate, allowed fields, transformations, token budget, use count, and expiry.
4. Open **Disclosures**.
5. Compare **Granted** and **Withheld** columns.
6. Point to `values excluded` and the projection hash.
7. Return to **Collaboration**.
8. Select the corresponding signed handoff.
9. Point to predecessor hashes and confirm that the prior response body is not displayed.

Say:

> A2A can carry a task and artifact. H2A decides the permitted projection for this recipient and records what was withheld before the handoff occurs.

#### 5. Prove A Remote Boundary Is Pinned And Bounded

1. Click **Coworkers**.
2. Select the active coworker.
3. Point to active state, pinned identity/fingerprint, permitted capabilities, and maximum context fields.
4. Click **Technical details**.
5. In **Control → Federation**, open **Peers** and show the opposite node's pinned key.
6. Open **Traffic** and select the accepted task or acknowledgement receipt.
7. Point to trace, sequence, payload type, payload hash, and decision.
8. Show a replay or revoked-peer denial receipt if already prepared.

Say:

> A2A or another adapter may carry the task. H2A's control plane binds the exchange to a mutually pinned node, an active mandate and Context Grant, a sequence, a payload hash, and fail-closed peer lifecycle.

Do not call an acknowledgement remote model execution. Show a remote provider run and signed completed result before making that stronger claim.

#### 6. Prove Approval Is For One Effect, Not A Standing Permission

1. Return to **Office → Approvals**.
2. Select the pending protected effect.
3. Point to requester, requesting agent, mandate, review grant, resource, action, effect hash, expiry, eligible approver, and quorum.
4. Click **Verify exact purpose**.
5. Verify the different eligible employee named by H2A.
6. Click **Approve**.
7. Click **Resume once**.
8. Show that the request becomes terminal and a second resume does not execute a second effect.

Say:

> This is not approval of the agent account. It is an independent signature over one effect hash, followed by one consumable resume.

#### 7. Reconstruct The Product Proof In The Evidence Ledger

1. Click **Office → Evidence**.
2. Paste the clothing task's `tr_goal_*` trace in the search field.
3. Click **Apply evidence filters**.
4. In **Investigation**, select the task events in chronological order.
5. Point to actor, subject, mandate, trace, event ID, previous hash, event hash, and the minimized payload fields.
6. Click **Enterprise topology**.
7. Show how the task pivots through referenced human, organization, credential, Passport, runtime, mandate, assignment, Context Grant, peer, approval, and output records even when an identity record originated on a different trace.
8. Click **Controls** and show attribution, organization authority, least privilege, context minimization, human oversight, runtime trust, federation, and containment controls.
9. Click **Export JSON** if the CISO asks for independent inspection.

Say:

> H2A does not rely on a screenshot of a successful agent. The evidence ledger links the exact actor, authority, context decision, runtime result, approval, output hash, and denial history. The integrity badge verifies the hash chain over those persisted records.

### Evidence Events To Show

Use the active task trace first. Some identity or proof records can have their own originating trace; use their referenced IDs or **Enterprise topology** to pivot to them. Do not claim that every record has the same trace ID.

| Chain link | Office or Control screen | Persisted event to identify | Payload or relationship to point out |
|---|---|---|---|
| Human presence | Human Proof / Evidence | `HUMAN_VERIFIED_V2` | organization, membership, exact purpose, nonce hash, matched-record count, liveness mode, assurance, proof hash, expiry |
| Employee authority | Live organization / People & Authority / Evidence | `AUTHORITY_CREDENTIAL_ISSUED`, `HUMAN_AUTHORITY_ALLOWED` | organization, membership, roles/scopes, credential expiry, canonical hash, allow/deny decision |
| Durable agent identity | Agent roster / Evidence | `AGENT_PASSPORT_V2_ISSUED` | sponsor membership, authority credential, connector manifest, risk tier, Passport canonical hash |
| Current runtime | Agent roster runtime / Evidence | `RUNTIME_ATTESTED` | Passport, runtime session, connector, trust mode, attestation canonical hash |
| Delegated authority | Tasks / Mandates / Evidence | `MANDATE_SIGNED`, `MANDATE_DELEGATED` | Human Proof reference, parent/child ancestry, exact scope, limits, expiry, canonical signature hash |
| Work assignment | Tasks / Project delivery / Evidence | `WORK_ASSIGNED`, `PROJECT_ASSIGNMENT_SIGNED` | agent, Passport, runtime session, mandate, goal/task, assignment hash |
| Context policy | Context / Evidence | `CONTEXT_GRANT_ISSUED` | recipient, task, mandate, allowed and withheld fields, projection hash, protected values excluded, expiry |
| Actual disclosure | Context / Evidence | `CONTEXT_DISCLOSURE_AUTHORIZED` or `CONTEXT_DISCLOSURE_DENIED` | granted fields, transformations, withheld fields, recipient decision, reason code |
| Local handoff | Collaboration / Evidence | `PROJECT_HANDOFF_RECORDED` | source and destination assignment, body hash, references; no unrestricted response body |
| Remote handoff | Coworkers / Federation / Evidence | `FEDERATION_ENVELOPE_ACCEPTED` or `FEDERATION_ENVELOPE_REJECTED` | peer, sender, recipient, payload type/hash, sequence, task, decision, reason code |
| Sensitive-effect pause | Approvals / Evidence | `AUTHORITY_ESCALATION_REQUESTED`, `APPROVAL_ROUTED` | exact requested-effect hash, requester, agent, mandate, eligible route, review grant, quorum |
| Independent decision | Approvals / Evidence | `APPROVAL_DECISION_SIGNED`, `APPROVAL_QUORUM_REACHED` | approver human/membership, proof, credential, decision signature, quorum |
| Exactly-once effect | Approvals / Evidence | `APPROVED_ACTION_RESUMED` | task, narrow mandate, requester, agent, approvers, output hash |
| Provider result | Tasks / Agent roster / Evidence | `LIVE_RUNTIME_SUCCEEDED`, `WORK_GRAPH_NODE_RUN` | provider run, status, output hash, predecessor hashes, mandate and assignment relationship |
| Containment | Security / Evidence | `LIVE_RUNTIME_CANCELLED`, `LIVE_RUNTIME_REVOKED`, `FEDERATION_ENVELOPE_REJECTED` | operator or authority reason, rejected sequence/signature/hash, durable denial receipt |

### Show The Real Product Log, Not The Engineering Diary

H2A has two different kinds of logs. Do not confuse them in the presentation.

- **Canonical product evidence:** `<H2A_DATA_PATH>/traces/tr_platform.jsonl`. This is the append-only, hash-linked runtime authority ledger used by **Control → Evidence**.
- **Engineering work diary:** the repository `logs/YYYY-MM-DD.md` files. These document development activity and test history, but they are not runtime proof for a customer task.

To show the real product ledger safely:

1. Open **Control → Settings**.
2. Record the exact **Data path** shown for the active window.
3. Open **Control → Evidence**.
4. Search the task trace and confirm **Integrity verified**.
5. Select an event and point to its `previous_hash` and `event_hash` in the persisted payload inspector.
6. Click **Export JSON** to create the minimized audit export.
7. If the CISO asks to see storage, open the read-only file at `<Data path>/traces/tr_platform.jsonl`.
8. Show that each JSON line has a unique event ID, timestamp, trace, actor, subject, event type, payload, previous hash, and event hash.
9. Do not edit the canonical ledger during the live demonstration.
10. Use a copied acceptance package for the one-byte tamper-negative test.

The canonical ledger verifier checks JSON/schema validity, duplicate event IDs, the `previous_hash` link, and the canonical event hash. An integrity badge means that chain currently verifies; it does not replace the separate requirement that the expected business events exist.

### Questions The HP Team Is Likely To Ask

**“Why would HP not just use Okta or Entra?”**

> HP should continue using enterprise IAM. H2A can consume or complement those identities and entitlements. This demonstration focuses on the execution interval after access is established: which human authorized this exact agent task, which runtime used it, what context was released, which mandate governed each hop, who approved the effect, and which output and denial receipts resulted.

**“Is your Passport just an A2A Agent Card?”**

> No. An A2A Agent Card describes how to discover and interact with an agent, including capabilities and authentication requirements. The H2A Passport shown here is an organization-signed durable identity linked to human sponsorship and authority, while a separate runtime session and attestation prove the current execution binding. A2A can be one transport underneath the governed handoff.

**“Are you sending employee biometrics to every agent?”**

> No. Biometric material stays in the protected local identity subsystem. Downstream records carry proof, membership, credential, mandate, and trace references plus hashes. Each boundary validates those references and their current lifecycle.

**“What proves the mandate was followed?”**

> The mandate alone is not the proof. Show the policy decision, assignment, Context Grant, runtime event, handoff, output hash, and any denied over-scope attempt on the same investigation topology. Revoking or narrowing a prerequisite blocks the next protected operation and leaves a denial receipt.

**“What proves the model really ran?”**

> Show a `LIVE_RUNTIME_STARTED` followed by `LIVE_RUNTIME_SUCCEEDED` for the official provider, its run ID and output hash, or the corresponding `WORK_GRAPH_NODE_RUN` result. Provider health, an office animation, or a transport acknowledgement alone is not execution proof.

**“Can this integrate with our IAM and protocol standards?”**

> Architecturally, H2A is positioned as a complementary policy and evidence layer. The current MVP demonstrates local connectors and A2A/MCP-style transport boundaries, but a production Okta, Entra, SPIFFE, or enterprise-policy integration is future integration work and must not be represented as already deployed.

## How To Read The H2A Interface

Use this section to orient the audience before beginning the task story. The **Office** view is the executive operating experience. The **Control** view exposes the same canonical records for technical and security verification. Switching views does not create a second copy of the task or change its state.

### Shared Header And Status Language

| UI element | What the audience sees | What it demonstrates | Operator explanation |
|---|---|---|---|
| **Office / Control** switch | Two presentation modes in the top-left | One product state has an operational view and a technical verification view | “Office is where teams operate. Control is where security and platform teams inspect the exact records behind the same work.” |
| **Mode** | `Live and scripted orchestration` or the runtime mode actually active | Whether real providers can run in addition to scripted rehearsal paths | “The label states the runtime posture; it is not a hidden production claim.” |
| **Trust** | `Connected-observed ceiling` | The maximum assurance supported by the current local topology | “Every result is capped at connected-observed. The UI will not silently promote the trust level.” |
| **Evidence verified** | Green integrity status | The persisted evidence hash chain currently verifies | “This says the ledger is internally consistent, not that every possible acceptance test has passed.” |
| **Session** | `connected`, cursor number, observer count | The renderer is attached to the trusted control-plane host and consuming ordered state | “The cursor shows that Office and Control are following the same live event stream.” |
| **Refresh** icon | Circular-arrow icon in Office or a phase panel | Requests a new canonical snapshot from the trusted process | “Refresh does not manufacture progress; it re-reads persisted state.” |

### The 2D Operations Office

The pixel office is not a decorative dashboard. It is a visual index over canonical people, agents, assignments, handoffs, peers, approvals, traces, and alerts.

| Office area | What is shown | What it means during the demo |
|---|---|---|
| **Operations office floor** | Human avatars, provider workstations, functional zones, desks, and status markers | A spatial summary of who and what participates in the current organization |
| **Provider workstations** | Claude, Antigravity, Framework, Codex, and any registered participants | A workstation represents a registered agent/runtime binding; animation alone must not be described as execution |
| **Workspace buttons** | Live organization, Agent roster, Tasks, Collaboration, Coworkers, Approvals, Context, Project delivery, Security, Evidence | These are the ten audience-facing operational screens used in the story |
| **Governed handoffs** | Recent signed signals with released-field, withheld-field, and predecessor counts | Work is moving through bounded records, not an unrestricted shared chat transcript |
| **Remote node portals** | Paired coworkers and active, offline, revoked, or replacement-required state | The boundary between independent H2A roots is visible and fail-closed |
| **Inspector** | Selected entity ID, provider health, trace, output hash, reason code, authority chain, context fields, predecessor hashes, and evidence links | The audience can inspect why a person, agent, task, or handoff is allowed and what evidence supports it |
| **Attention** panel | Expiry, revocation, dependency, or approval notifications | H2A exposes stale authority before a protected command fails |
| **Next action dock** | The next guided workflow action and active trace ID | The operator is guided through the shortest valid next step while the trace remains visible |

Demonstrate the office visually:

1. Click an employee avatar and point to the **Canonical ID** and **Authority chain** in the Inspector.
2. Click a provider workstation and point to **Provider health**, **Trace**, and **Output hash**.
3. Click a signed handoff in **Governed handoffs** and show its released, withheld, and predecessor counts.
4. Click an **Evidence link** in the Inspector only when the audience asks for the underlying record.
5. Keep the active trace visible in the command dock while moving between workspaces.

Say:

> The office is a live map of canonical control-plane records. Movement and workstation activity help operators understand the story, but the proof is the identity, authority, context, output, and evidence shown in the Inspector.

### Office Workspace Guide

#### Live Organization - People And Authority

**What is visible:** employees, departments, reporting lines, roles, active memberships, signed credentials, authority metrics, and policy state.

**What it demonstrates:** accountable humans are enrolled into one organization and hold different business powers. The Administrator/Approver and Operator are not interchangeable.

**Buttons and tabs to show:**

1. Click **Live organization**.
2. Open **employees** to show each employee and membership status.
3. Open **roles** to show bounded RBAC and approval powers.
4. Open **credentials** to show signed human business authority and lifecycle status.
5. Open **policy** only for a technical audience that wants a deterministic authority check.
6. Select each employee and point to the corresponding Inspector authority chain.

**Demo sentence:** “Human Proof establishes who is present; organization membership, role, and credential establish what that person is permitted to authorize.”

#### Agent Roster - Identity And Runtime

**What is visible:** agent cards, provider health, Passport state, sponsor, capabilities, runtime session, attestation, mandate, assignment, and Command Readiness warnings.

**What it demonstrates:** a Claude, Codex, Antigravity, framework, or custom provider account is not treated as authority by itself. H2A binds a durable agent identity to a current runtime and delegated human authority.

**Buttons to show:**

1. Click **Agent roster**.
2. Select an agent card.
3. In the Inspector select **Agent**, then open **identity**.
4. Point to **Agent Passport**, **Human sponsor**, and mandate reference.
5. Open **runtime** and point to provider health, runtime session, and attestation.
6. If Command Readiness appears, expand **Technical details** to show the exact expired or missing prerequisite.
7. Use **Repair prerequisites** only if required; complete the named Human Proof and return automatically.

**Demo sentence:** “The provider can change without replacing the agent Passport, but execution is blocked unless the runtime, mandate, assignment, and proof are current.”

#### Tasks - Goal Composer And Work Graph

**What is visible:** the clothing-site goal, four proposed work nodes, owners, capabilities, dependencies, context fields, risk, approval requirements, execution status, and output hashes.

**What it demonstrates:** H2A turns one human goal into separately governed work rather than sending one unrestricted prompt to every agent.

**Buttons to show:**

1. Click **Tasks**.
2. Click **1. Compose goal** and enter the clothing-storefront objective.
3. Click **2. Propose graph**.
4. Review and, if needed, edit the research, UI, implementation, and QA nodes.
5. Click **Save edits**.
6. Click **3. Approve exact plan** and complete the named in-place Human Proof.
7. Click **4. Run ready work**, or run individual ready nodes with **Run**.
8. Use **Cancel**, **Reassign**, **Revoke**, **Retry**, or **Recheck lifecycle** only when demonstrating that lifecycle.

**Demo sentence:** “Each node receives its own owner, mandate, assignment, context contract, and dependencies; the work graph is the visible collaboration contract.”

#### Collaboration - Handoffs And Outputs

**What is visible:** signed work signals, status, released fields, withheld fields, predecessor hashes, evidence references, and active remote boundaries.

**What it demonstrates:** agents collaborate through bounded handoffs and hashes instead of automatically receiving every prior response or protected field.

**Buttons to show:**

1. Click **Collaboration**.
2. Select the research-to-UI, UI-to-code, or code-to-QA signal.
3. Compare **released**, **withheld**, and **predecessor** counts.
4. Click an evidence-reference button only for a requested drill-down.
5. Point to **Remote boundaries** to identify which handoff crossed to another H2A root.

**Demo sentence:** “The next agent receives the authorized projection and predecessor hashes, not a copy of every previous answer.”

#### Coworkers - Pinned Remote Boundary

**What is visible:** discovered coworker nodes, connection request state, short verification code, pinned fingerprint, permitted capabilities, context-field limit, health, and replacement state.

**What it demonstrates:** another employee's H2A root remains independently keyed and must be mutually connected before tasks can cross the boundary.

**Buttons to show:**

1. Click **Coworkers**.
2. Click **Add coworker**.
3. Select the discovered organization node and click **Connect**.
4. On the second root click **Accept request**.
5. Compare the displayed code with the other operator and click **Codes match** on both roots.
6. Confirm the coworker is active and its pinned boundary is visible.
7. Use **Technical details** only if the audience requests the signed invitation, registration, acceptance, pin, or transport receipts.

**Demo sentence:** “The simple connection experience is backed by independent node keys, mutual code confirmation, capability limits, and pinned trust.”

#### Approvals - Paused Effects

**What is visible:** pending protected effects, requester, agent, mandate, review grant, effect hash, expiry, eligible independent approver, quorum, co-signatures, and terminal status.

**What it demonstrates:** a sensitive provider or repository effect can be frozen and routed to a different eligible person for exact-purpose approval.

**Buttons to show:**

1. Click **Approvals**.
2. Select the newest pending request.
3. Point to the exact resource, action, effect hash, requester, and expiry.
4. Click **Verify exact purpose** and verify the named approver.
5. Click **Approve** or **Reject**.
6. For an approved paused effect, click **Resume once**.
7. Show that a second resume does not produce a second effect.
8. For withdrawal evidence, click **Verify withdrawal**, then **Withdraw** on a disposable pending request.

**Demo sentence:** “Approval signs one exact effect, not a broad permission to let the agent do anything later.”

#### Context - Released And Withheld

**What is visible:** protected artifacts, active Context Grants, disclosures, withheld-field totals, recipient identities, transformations, projection hashes, use budgets, and revocation receipts.

**What it demonstrates:** H2A minimizes context per recipient and can stop disclosure before a provider process launches.

**Buttons and tabs to show:**

1. Click **Context**.
2. Open **Grants** to show recipient, task, mandate, fields, budget, use count, and expiry.
3. Open **Disclosures** to compare granted and withheld fields.
4. Open **Artifacts** to show that the source is sealed.
5. Open **Messages** to show signed handoff routes and content references.
6. In the Phase 27 panel click a lane and show its projection hash and predecessor count.
7. Use **Prove fail-closed revocation** only on the prepared demonstration grant.

**Demo sentence:** “Durable evidence stores the projection hash and field decisions; protected source values and response bodies are not copied into the evidence ledger.”

#### Project Delivery - Worktrees And Integration

**What is visible:** canonical Git root, base branch and revision, protected paths, allowed commands, isolated worktree leases, agent outputs, validation receipts, pending integration effect, and final integration reference.

**What it demonstrates:** multiple agent results can become a real project change through isolated work, validation, and independent approval.

**Buttons to show:**

1. Click **Project delivery**.
2. Select the registered clothing-storefront project.
3. Show the base revision and isolated assignments.
4. Open each completed output and point to its output hash and validation receipt.
5. Click **Prepare exact effect** for the accepted integration candidate.
6. Click **Route exact approval**.
7. Complete the independent approval in **Approvals**.
8. Return and click **Verify approval and integrate**.
9. Show the resulting integration evidence reference.

**Demo sentence:** “Agent output does not enter the protected branch merely because a model produced it; validation and an independently approved exact effect gate integration.”

#### Security - Denials And Containment

**What is visible:** replay, forged approval, over-broad delegation, context leakage, federation tamper, provider failure, operator cancellation, authority revocation, and restart-recovery results.

**What it demonstrates:** invalid paths execute through the real policy boundary and count only when a persisted denial receipt exists.

**Buttons to show:**

1. Click **Security**.
2. Show all six adversarial cards and their blocked reason codes.
3. Point to the persisted event ID for each result.
4. Show operator cancellation and authority revocation containment receipts.
5. Show `HOST_PROCESS_RESTARTED` for restart recovery.

**Demo sentence:** “A red-team result is not a visual checkbox. Each blocked attempt has a persisted reason code and evidence event.”

#### Evidence - Trace Reconstruction

**What is visible:** ledger count, integrity status, event timeline, attribution chain, decision inspector, topology, control coverage, trace IDs, hashes, and persisted payload metadata.

**What it demonstrates:** the business task can be reconstructed from initiating human through identity, authority, runtime, context, agents, approvals, containment, and outputs.

**Buttons and tabs to show:**

1. Click **Evidence**.
2. Paste the active task trace into search.
3. Click the filter icon to **Apply evidence filters**.
4. Use **Investigation** to select events chronologically.
5. Use **Enterprise topology** to show identity, authority, execution, and transport relationships.
6. Use **Controls** to show implemented security objectives and their verification evidence.
7. Click **Export JSON** only when the audience asks for the minimized technical bundle.

**Demo sentence:** “This is the differentiator: the output is not separated from the human, authority, context, runtime, and approval path that produced it.”

### Control Sidebar Screen Guide

Use **Control** for deliberate technical verification. Do not walk through every page during the executive story; open only the pages that answer the audience's question.

| Control screen | What appears | What it proves | When to show it |
|---|---|---|---|
| **Command Floor** | Command Readiness, Phase 25 organization bootstrap, Phase 26 provider lanes, agent/runtime details, task and delivery controls | A command is enabled only when proof, credential, Passport, session, attestation, mandate, assignment, grant, provider, and peer dependencies resolve | When asked why a Run button is enabled or blocked |
| **Human Proof** | Enrolled employees, selected identity, camera preview, live distance, required distance range, face count, quality, liveness posture, token-set matching, proof expiry | The protected command is bound to the named employee and exact purpose | When explaining identity enrollment, mismatch denial, camera policy, or liveness limitations |
| **People & Authority** | Employees, roles, credentials, reporting lines, lifecycle actions, and deterministic policy tester | Business authority is organization-scoped and separable from biometric identity | When discussing RBAC, join/move/leave, credential expiry, or separation of duty |
| **Authority Inbox** | Routed effects, policies, quorum, eligible approvers, co-signatures, expiry, approval, rejection, withdrawal, and exactly-once resume | Human oversight is exact-purpose, independent, time-bound, and auditable | During the protected-action approval demonstration |
| **Mandates** | Signed authority registry, root and child delegation chain, scope, limits, expiry, policy gateway, and human gate | Agent authority is delegated, attenuated, deterministic, and revocable | When asked how H2A prevents an agent from expanding its own permissions |
| **Context Broker** | Artifacts, grants, disclosures, messages, granted/withheld fields, transformations, projection hashes, budget, and revocation | Least-context policy is enforced before disclosure | During privacy and data-minimization questions |
| **Federation** | Local node identity, pinned key, listener, peers, handshake documents, traffic receipts, task, acknowledgement, heartbeat, replay denial, and revoked-peer denial | Independent roots exchange signed minimized envelopes under pinned trust | During the two-employee/two-root collaboration drill-down |
| **Evidence** | Investigation timeline, attribution chain, enterprise topology, controls, integrity status, and export | Every accepted or denied transition is reconstructable from persisted records | At the end of the story and for CISO questions |
| **Demo Gate** | Shared ceremony, prerequisite state, 11 acceptance gates, six adversarial controls, clean-session readiness, package eligibility | The system does not self-declare demo readiness without required evidence | At the final acceptance conclusion, not at the start |
| **Settings** | Storage mode, agent mode, Human Proof mode, liveness mode, resource mode, schema version, data path, Connector Registry, provider/framework dependency status, imported connectors, and delivery status | The operator can identify the exact local root, runtime posture, connector health, and missing dependencies | Before the demo for validation, or when asked which providers/protocols are genuinely available |

### Settings Screen: What Every Field Means

| Setting | Meaning | Demonstration rule |
|---|---|---|
| **Storage mode** | Where canonical state is persisted | For this MVP, state is local-file and survives restart on the same data path |
| **Agent mode** | Whether the workplace is scripted, live-capable, or mixed | Read the displayed value; do not imply a provider ran unless its lane has a real persisted result |
| **Human proof** | Active biometric/token verification implementation | Explain face matching and BCH token behavior truthfully |
| **Liveness** | `required` or `demo-bypass` | Never call demo-bypass high-assurance liveness |
| **Resource mode** | Current execution containment posture | Do not claim governed isolation unless the displayed mode and acceptance evidence support it |
| **Schema version** | Version of the persisted local data contracts | Useful for technical reproducibility, not part of the executive story |
| **Data path** | Exact canonical root used by this H2A window | Use it to prove Node A and Node B are independent roots and to avoid accidental session confusion |
| **Connector Registry** | Adapter health, dependencies, authentication, configuration, acknowledgements, and dead letters | Green `ready` means the adapter can be invoked; it does not mean a specific task succeeded |
| **Import signed connector** | Publisher/runtime-key-verified connector registration | Show only for connector extensibility questions |
| **Recent deliveries** | Queued, in-flight, acknowledged, failed, cancelled, or dead-letter connector deliveries | Use it to distinguish transport state from provider task success |

### Human Proof Dialog: What The Operator Must Confirm

When H2A needs a person, it opens an in-place dialog rather than requiring a manual trip to the Human Proof page. Before capturing, read these fields aloud:

1. **Verify protected command for `<employee name>`** identifies the required person.
2. **Camera must show `<employee name>`** prevents using whichever person happens to be nearby.
3. **Exact purpose** states the one command being authorized.
4. **Estimated distance** must remain inside the displayed required range.
5. **Face count** must be exactly one.
6. **Quality** must satisfy the displayed capture policy.
7. **Liveness** must say `required` before making a liveness-backed claim; otherwise state `demo-bypass`.
8. After success, the dialog closes and the originating screen re-reads canonical readiness automatically.

### Status And Evidence Legend

| Visible state | Meaning |
|---|---|
| Green / `ready`, `active`, `succeeded`, `acknowledged`, `verified` | The named persisted prerequisite or result currently resolves |
| Amber / `expiring`, `pending`, `approval required`, `offline` | Operator action or a time-sensitive dependency remains |
| Red / `failed`, `revoked`, `expired`, `blocked` | The command cannot proceed; inspect the reason code and repair path |
| Gray / `not ready`, `not observed`, `not applicable` | Evidence is absent, the step has not run, or the control does not apply |
| `tr_goal_*` | Business goal/work-graph trace |
| `phase22_*` | Shared acceptance ceremony trace |
| `sha256:*` | Integrity or output reference; it is not the protected response body |
| Event or evidence ID | Durable record that can be opened in Evidence |

Never describe a green provider-health badge as task completion. Completion requires the task or lane to show a persisted successful result and output hash. Never describe a pixel animation as evidence; use the Inspector or Evidence record.

## Pre-Demo Preparation

Complete this section before the HP audience enters. Do not spend the live session enrolling identities, installing CLIs, copying federation JSON, or troubleshooting expired authority.

### 1. Prepare The Primary Root

1. Start H2A with the selected canonical `H2A_DATA_PATH`.
2. Open **Office**.
3. Confirm the top status shows:
   - `Live and scripted orchestration`;
   - `Connected-observed ceiling`;
   - `Evidence verified`;
   - `Session connected`.
4. Open **Control → Settings**.
5. Record the displayed data path in the operator notes.
6. Return to **Office**.

### 2. Prepare The People

1. Open **Live organization**.
2. Confirm Employee A is the Administrator/Approver.
3. Confirm Employee B is the Operator.
4. Confirm both memberships and their required authority credentials are active.
5. When H2A opens a Human Proof dialog, verify that the dialog says:
   - `Verify protected command for <employee name>`;
   - `Camera must show <employee name>`;
   - `Exact purpose: <purpose>`.
6. Do not use the wrong employee merely to get past a prompt.
7. If required liveness is disabled, state that this is a demo-bypass proof and do not call it high assurance.

### 3. Prepare The Agents

1. Open **Agent roster**.
2. Confirm four usable participants are visible:
   - Claude for UI or control review;
   - Codex for implementation;
   - Antigravity for QA or architecture review;
   - custom CLI or framework for research/interoperability.
3. Select each agent card.
4. In the right inspector, select the **Agent** tab if necessary.
5. Open **identity**.
6. Confirm each selected agent displays:
   - Agent Passport;
   - `V2 organization-signed` where applicable;
   - Human sponsor;
   - runtime trust;
   - runtime session;
   - mandate reference.
7. Open **runtime** and confirm the provider is healthy before the audience arrives.
8. Use **Repair prerequisites** if the Command Readiness panel warns about expiring proof, credential, session, attestation, mandate, assignment, grant, or peer state.
9. Do not start the demo with a red `Repair before run` panel.

### 4. Prepare The Project

1. Create or select a small, disposable Git repository for the clothing website.
2. Ensure the repository has a clean base revision.
3. Ensure its `package.json` contains the validation commands H2A will allow.
4. Open **Project delivery**.
5. Enter:
   - **Project name:** `HP Governed Clothing Storefront`;
   - **Canonical local Git root:** the actual disposable Git root;
   - **Approved research hosts:** only the hosts needed for the demonstration.
6. Click **Register project**.
7. Confirm the Project summary displays repository mode, base branch, base revision, protected paths, and allowed commands.

### 5. Prepare The Coworker Root

1. Start the independent Node B H2A root.
2. Confirm its data path differs from Node A.
3. Keep both local listeners and applications available.
4. Ensure both roots belong to the intended demonstration organization.
5. Do not reuse a revoked peer as trusted. Create a replacement connection when H2A says `replacement-required`.

### 6. Record The IDs Used During The Demonstration

Keep this small operator table off-screen:

| Record | Value |
|---|---|
| Primary data path | |
| Friend data path | |
| Employee A | |
| Employee B | |
| Project ID | |
| Goal trace ID | |
| Peer ID | |
| Approval request ID | |
| Final output hash | |

## Live Demonstration: Executive Story

### Screen 1 - Office Overview

**Purpose:** establish that this is one operational workspace, not a collection of disconnected demos.

1. Click **Office** in the top-left mode switch.
2. Point to the header status:
   - live/scripted mode;
   - trust ceiling;
   - evidence integrity;
   - connected session and cursor.
3. Point to the office floor and the right-side Inspector.
4. Click **Live organization**.
5. Show the two employees, their roles, memberships, and authority separation.
6. Close the workspace with its close icon or `Escape`.

Say:

> H2A starts with accountable humans. A username is not the authority root. A current purpose-bound Human Proof, an active organization membership, and a signed authority credential determine what protected commands the employee may perform.

Expected evidence:

- two real employee identities;
- Administrator/Approver and Operator are visibly distinct;
- no preview or seeded success identity is presented as real.

### Screen 2 - Human To Agent Binding

**Purpose:** show that an agent is more than a provider account.

1. Open **Agent roster**.
2. Click the Claude agent card.
3. In the inspector, select **Agent** and then **identity**.
4. Point to:
   - **Agent Passport**;
   - **Human sponsor**;
   - **Runtime trust**;
   - **Runtime session**;
   - **Mandate reference**.
5. Select the Codex card and show the same identity boundary.
6. Select **runtime** for one agent.
7. Point out **Structured CLI** and the provider health; do not launch an unrelated prompt.
8. Return to **identity**.

Say:

> The provider model is replaceable. The durable H2A identity is the Passport, sponsored by a human and bound to a verified workload key, live runtime session, attestation, mandate, and assignment.

Do not click **Rotate attestation**, **Suspend**, **Revoke**, or **Disconnect** during this identity introduction.

### Screen 3 - Connect A Coworker

**Purpose:** show a simpler friend-request experience while retaining cryptographic trust.

1. Close **Agent roster**.
2. Open **Coworkers**.
3. Click **Add coworker**.
4. In **Search coworker node, employee, or connection code**, enter the Node B name or short connection code.
5. If the result button says **Verify**, complete the named administrator Human Proof dialog; H2A returns to the same workspace automatically.
6. Click **Connect** on the discovered Node B.
7. On Node B, open **Coworkers**.
8. Click **Accept request**. If prompted, complete Node B administrator verification.
9. Compare the displayed short code on both screens using an independent visual or spoken channel.
10. On Node A click **Codes match**.
11. On Node B click **Codes match**.
12. Confirm both screens show the coworker as connected/active.
13. Close **Coworkers**.

Say:

> The friendly name helps discovery, but it is not the trust anchor. H2A signs the full admission transcript, pins the remote key, requires both administrators, and asks both people to compare the same short code.

If the peer was previously revoked, stop. The correct action is a new request, not reactivation.

### Screen 4 - Create The Clothing Website Goal

**Purpose:** turn one business outcome into an inspectable work graph.

1. Open **Tasks**.
2. Select `HP Governed Clothing Storefront` in **Project**.
3. Enter:
   - **Goal:** `Build a small clothing website`;
   - **Outcome:** `A polished, accessible clothing storefront with source-backed content and passing validation.`;
   - **Objective:** `Research product content, design the storefront UI, implement it, and validate accessibility and quality.`;
   - **Constraints:** one per line:

```text
No protected values in provider outputs
No writes outside approved project paths
Use only approved research hosts
Require independent approval before integration
```

4. Set **Sensitivity** to `Restricted` for the strongest approval story.
5. Leave the deadline blank only if the default two-hour authority window is acceptable.
6. Click **1. Compose goal**.
7. Confirm the goal and outcome appear.
8. Click **2. Propose graph**.

Expected graph:

1. `Research product content`;
2. `Design the storefront UI`;
3. `Implement the storefront`;
4. `Validate accessibility and quality`.

Say:

> H2A converts the goal into bounded work. Research and UI can begin independently. Implementation waits for both. QA waits for implementation.

### Screen 5 - Review Agent Ownership And Scope

**Purpose:** prove that H2A does not merely divide prose; it binds execution authority.

For each graph node:

1. Open the **Agent** selector.
2. Assign the intended ready candidate:
   - research to custom CLI or an eligible paired-node research agent;
   - UI to Claude;
   - implementation to Codex;
   - QA to Antigravity.
3. Use **Depends on** to verify:
   - implementation depends on research and UI;
   - QA depends on implementation.
4. Read the node facts without changing them:
   - Human owner;
   - Attribution;
   - Provider;
   - Target (`local` or `paired-node`);
   - Outputs;
   - Tools;
   - Paths;
   - Hosts;
   - Released;
   - Withheld;
   - Mandate;
   - Authority ancestry;
   - Expiry;
   - Validation;
   - Reason;
   - Final output.
5. Click **Save edits** if any candidate or dependency changed.
6. Click **3. Approve exact plan**.
7. Complete the in-place Human Proof for the named employee and exact purpose if prompted.
8. Confirm each node now has persisted mandate and assignment references.

Say:

> Approval signs this exact graph revision. H2A then provisions each node's Passport reference, runtime session, mandate, assignment, Context Grant, workspace boundary, and mailbox route. Editing the graph changes its plan hash and requires fresh approval.

### Screen 6 - Run Independent Work

**Purpose:** show concurrency, dependencies, real provider boundaries, and honest waiting states.

1. Click **4. Run ready work**.
2. Watch the research and UI nodes start as independent roots.
3. If provider login or consent appears, complete it without exposing credentials to the audience.
4. Confirm local provider nodes finish with a **Final output** hash.
5. Confirm implementation changes from `waiting` to `ready` only after both predecessors succeed.
6. Click **4. Run ready work** again if the next dependency wave is not started automatically.
7. Confirm QA remains waiting until implementation succeeds.
8. For a paired-node assignment, switch briefly to Node B and show the received signed task.
9. On Node B, use **Technical details** from **Coworkers** only when the audience wants the protocol proof.
10. In Control Federation, select Node A and click **Acknowledge** only after the intended remote work boundary is satisfied.
11. Return to Node A and refresh the work graph if reconciliation has not yet appeared.

Mandatory narration for a paired node:

> This proves signed bounded dispatch, receipt, and completed acknowledgement. In the current build, we claim remote provider execution only when a genuine remote provider run and its signed output reference are also present.

Do not call a transport acknowledgement an Antigravity or custom-agent output.

### Screen 7 - Inspect Collaboration And Minimized Context

**Purpose:** show what agents received and what H2A withheld.

1. Close **Tasks**.
2. Open **Collaboration**.
3. Select the signals for research, UI, implementation, and QA.
4. For each signal, point to:
   - status;
   - source/recipient;
   - released field count;
   - withheld field count;
   - predecessor hash count;
   - output hash or waiting reason;
   - evidence references.
5. Click an evidence reference only if a technical drill-down is appropriate; it opens the same canonical record in **Evidence**.
6. Close **Collaboration**.
7. Open **Context**.
8. Show active grants and disclosures.
9. Open the **Disclosures** view.
10. Point to the allowed fields, withheld fields, transformation, projection hash, use count, and reason code.
11. Open **Messages** and show signed handoff routes and content references.

Say:

> An agent receives the fields authorized for its purpose plus hashes of predecessor outputs. H2A does not need to pass every previous response body or every protected field through the chain.

For the dedicated Phase 27 control demonstration only:

1. Click **Prepare Phase 27** if no protected artifact exists.
2. Enter nonproduction values.
3. Click **Seal and issue grants**.
4. Run each enabled **Run handoff** in sequence.
5. Compare **Released** and **Withheld** across lanes.
6. Click **Prove fail-closed revocation** after all acknowledgements.
7. Show `CONTEXT_GRANT_REVOKED` and `provider launch blocked`.

The Phase 27 ceremony trace is a dedicated least-context proof. Do not imply it is automatically the clothing project's goal trace unless the displayed trace IDs are identical.

### Screen 8 - Independent Human Approval

**Purpose:** freeze one exact repository effect and require another eligible human.

1. Open **Project delivery**.
2. Locate the Human Integration Gate.
3. Confirm the changed files and validation receipts are visible for the project assignments.
4. Click **Prepare exact effect**.
5. Point to the resulting expected effect hash.
6. Select an active approval policy.
7. Click **Route exact approval**.
8. H2A opens or directs the Office **Approvals** workspace.
9. Select the newest pending request whose effect hash matches the project effect hash.
10. Select the eligible employee who is different from the requester.
11. Click **Verify exact purpose**.
12. Verify the named Administrator/Approver for the exact displayed purpose.
13. Click **Approve**.
14. If the request exposes **Resume once**, click **Resume once** one time.
15. Return to **Project delivery**.
16. Click **Verify approval and integrate**.
17. Confirm **Accepted integration** displays the integrated commit and signature hash.

Say:

> The approver is not approving a vague conversation. The decision is bound to the current repository effect hash, policy, task, requester, agent, and one-use authority. A stale or different diff cannot consume this approval.

Exactly-once proof:

1. Return to **Approvals**.
2. Confirm the request is terminal or resumed.
3. Verify that **Resume once** is no longer available for a second execution.
4. Do not create a second effect merely to simulate exactly-once behavior.

### Screen 9 - Cancellation Or Revocation

**Purpose:** show that H2A can stop authority while preserving accountability.

Use a disposable node, not the accepted final integration.

1. Open **Tasks**.
2. Select a node that is `running` or `waiting`.
3. To demonstrate operator containment, click **Cancel**.
4. Confirm the node shows `cancelled` and reason `OPERATOR_CANCELLED`.
5. Or, to demonstrate authority containment, click **Revoke**.
6. Complete the named Human Proof if requested.
7. Confirm the node shows `revoked` and reason `MANDATE_REVOKED`.
8. Confirm dependent work remains blocked rather than silently continuing.
9. Open **Collaboration** and show that the cancelled/revoked record and evidence references remain visible.

Say:

> H2A separates stopping execution from deleting history. Revocation removes future authority; the signed record of what happened remains available for investigation.

### Screen 10 - Reconstruct The Evidence Chain

**Purpose:** finish with the CISO view and prove that Office was not a decorative simulation.

1. Open **Evidence** in Office.
2. Enter the clothing goal's `tr_goal_...` trace ID in the search field.
3. Click the filter icon titled **Apply evidence filters**.
4. Select the first relevant goal or graph event in **Event timeline**.
5. Point to **Attribution chain**.
6. Walk through the available chain fields:
   - Human Identity;
   - Human Proof;
   - Agent Passport;
   - Runtime Binding;
   - Mandate Authority;
   - Context Grant;
   - Assignment;
   - scenario/project run;
   - output/event hash.
7. Select the work-graph approval event.
8. Select each node-run event and show predecessor hashes and output hash references.
9. Select the project approval and integration events.
10. Select the cancellation or revocation event.
11. Point to **Hash chain verified**.
12. Click **Enterprise topology** and show the same people, authority, execution, and transport objects.
13. Click **Controls** and show the implemented control map.
14. Click **Technical details** to switch explicitly to **Control → Evidence**.
15. Confirm the same trace ID, record IDs, hashes, reason codes, and trust ceiling remain visible.

Say:

> This is the differentiator: H2A can reconstruct who initiated the goal, which agent identity and runtime acted, what mandate and context were valid, what crossed each handoff, who approved the exact effect, which output hash resulted, and why any denied or revoked action stopped.

## Technical Drill-Down

Use this section only after the executive story or when the CISO asks for enforcement detail.

### Agent Identity Drill-Down

1. **Office → Agent roster**.
2. Select the agent.
3. Select **Agent → identity**.
4. Show Passport ID, sponsor, runtime session, attestation trust mode, and mandate reference.
5. Click **Technical details**.
6. In Control Command Floor, select the same agent and show matching IDs.

### Context Minimization Drill-Down

1. **Office → Context**.
2. Open **Grants**, **Disclosures**, and **Messages**.
3. Show field names and hashes, not protected values.
4. In Control Evidence, search the disclosure or message ID.
5. Show `CONTEXT_GRANT_ACTIVE` or the reason-coded denial.

### Federation Drill-Down

1. **Office → Coworkers**.
2. Show connected status and short-code confirmation state.
3. Click **Technical details**.
4. In Federation, open **Peers**, **Handshake**, and **Traffic**.
5. Show pinned key fingerprints and signed minimized receipts.
6. Do not expose private keys, secrets, or protected task values.

### Approval Drill-Down

1. **Office → Approvals**.
2. Select the project integration request.
3. Show requester, agent, mandate, review grant, effect hash, policy, quorum, and co-signature.
4. Show that the decision is terminal and cannot be applied twice.

### Security Drill-Down

1. **Office → Security**.
2. Show the six adversarial controls.
3. Run only challenges whose prerequisites are currently active.
4. Expected blocked reasons include replay, forged approval, over-broad delegation, context leakage, federation tamper, and provider failure.
5. Show cancellation, authority revocation, and restart recovery only on disposable work.
6. Keep the trust label at `Connected-observed ceiling`.

## Final Acceptance And Export

This is Phase 51 operator acceptance, not part of the short executive story.

1. Switch to **Control**.
2. Open **Demo Gate**.
3. Click **New clean session**.
4. Launch H2A with the generated clean data path.
5. Click **Require liveness**.
6. Complete required-liveness verification for both physically present enrolled people.
7. Click **Create ceremony**.
8. Click **Assess prerequisites**.
9. Complete all carried workflows with real providers, two humans, and two independent roots.
10. Confirm:
    - 11/11 acceptance gates;
    - six blocked adversarial controls;
    - verified ledger;
    - required-liveness evidence for both humans;
    - approval withdrawal evidence;
    - project integration evidence;
    - complete trace reconstruction;
    - `Connected-observed ceiling`.
11. Click **Export package** only when it becomes enabled.
12. Independently verify the package using the shipped verifier.
13. Change one byte in a copy and confirm verification fails.
14. Restart on the same root and confirm IDs, hashes, receipts, and terminal states persist.

## Demonstration Failure Recovery

| Visible condition | Correct operator action | Never do |
|---|---|---|
| `Repair before run` | Click **Repair prerequisites**, complete the named proof, and wait for automatic refresh | Do not broaden scope or manually edit storage |
| Human Proof expires | Restart the exact protected command and verify the named employee | Do not reuse another purpose's proof |
| Provider at capacity | Retry later or use an already approved replacement candidate with the same capabilities | Do not label a failed run successful |
| Paired work is waiting | Confirm listener, peer, signed receipt, and genuine completed result | Do not treat transport acceptance as provider output |
| Peer revoked | Create a new coworker request and compare a new code | Do not reactivate revoked trust |
| Context Grant expired | Use the exact-scope renewal control | Do not expose the sealed source values |
| Approval expired | Create a new request and reverify the exact purpose | Do not alter timestamps or reuse the old decision |
| Work graph blocked | Read the node reason and use **Recheck lifecycle**, **Retry**, or **Reassign** as permitted | Do not skip dependencies |
| Control plane disconnected | Wait for reconnection and canonical reconciliation | Do not present cached Office state as current authority |

## Operator Closing Statement

Use this close:

> H2A is not claiming that a model becomes trustworthy because it is connected. It demonstrates that enterprise agent work can remain attributable, purpose-bound, minimized, interruptible, independently approvable, and reconstructable across human and agent boundaries. The current local demonstration remains connected-observed; higher assurance requires the final liveness ceremony and stronger runtime isolation evidence.

## Live Sign-Off Checklist

- [ ] Office and Control show the same trust ceiling.
- [ ] Two employee identities and separation of duty are visible.
- [ ] At least two real provider agents show Passport and active runtime state.
- [ ] The coworker connection uses mutual short-code confirmation.
- [ ] The clothing goal produces the four expected work nodes.
- [ ] Every node visibly binds a human owner, agent, mandate, assignment, and context policy.
- [ ] Local provider output hashes are real and persisted.
- [ ] Any remote execution claim has a genuine remote provider run and signed completed result.
- [ ] Released and withheld fields differ by recipient.
- [ ] Predecessor hashes are visible without prior response bodies.
- [ ] A different eligible human approves the exact effect.
- [ ] The approved effect resumes or integrates once.
- [ ] Cancellation or revocation stops disposable work and retains evidence.
- [ ] Evidence reconstructs the goal trace and reports a verified hash chain.
- [ ] No claim exceeds `connected-observed`.
- [ ] Required liveness and Phase 51 final acceptance are described truthfully.
