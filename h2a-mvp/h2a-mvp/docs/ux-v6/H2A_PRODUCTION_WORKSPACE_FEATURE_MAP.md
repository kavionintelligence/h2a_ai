# H2A Production Workspace Feature Map

Status: Unified Workspace UI implemented; final two-person and external-system operator acceptance remains open.

Date: 2026-09-09

## Product experience

H2A now opens as an agent operating workspace after an administrator signs in. The normal path is:

1. Verify the named employee in place.
2. Connect or select accountable agents.
3. Open a project workspace or create an outcome.
4. Review the bounded graph once.
5. Choose **Approve & start**.
6. H2A advances dependency-ready agents through the trusted host and stops at real human, provider, validation, authority, or federation boundaries.
7. Inspect context, decisions, outputs, and evidence on the same mission.

The classic Control console remains available for security demonstrations, detailed administration, troubleshooting, and acceptance ceremonies. It is no longer the default product surface.

## Screen map

### Agent canvas

The first screen is a live human-agent work graph, not a generic dashboard.

- **Agent team** shows real planning candidates and whether each agent is local or belongs to a paired node.
- **Active missions** lists persisted collaborative goals and their current graph status.
- **Flow** shows accountable humans, assigned agents, dependencies, and current execution state.
- **Context** shows fields released to each agent and fields withheld by its Context Grant.
- **Outputs** shows expected outputs, persisted output references, hashes, and evidence links.
- **Decisions** shows graph approval, Human Proof, revision, and approval checkpoints.
- **Approve & start** approves the exact persisted plan, then asks the trusted host to advance all dependency-ready work. There are no ordinary per-agent Run buttons.
- **Continue ready work** resumes only work that remains authorized and dependency-ready.
- Selecting a node exposes renew, pause/cancel, revoke, and evidence actions only when relevant.

All displayed status comes from the canonical control-plane snapshot. The activity rail does not invent agent conversation.

### Workspaces

- Real governed projects appear as folder-shaped workspaces.
- Opening a project focuses its most relevant persisted mission on the agent canvas.
- Projects without a mission open the governed project registration flow.
- Durable team rooms are read and changed through the signed employee workspace service.
- Room creation, membership, project and mission links, and reviewed Memory remain in one compact Workspace sheet.
- A signed `room-links` mutation validates project and mission references before persisting them; a room can contain many missions.

### People & agents

- Lists active organization members with their accountable agents.
- Distinguishes local agents from agents available through a paired node.
- **Connect agent** opens the real Passport/runtime/provider connection flow.
- **Add coworker** opens the governed federation pairing flow.
- Company-visible names are discovery only. A display name never establishes trust, grants authority, or shares protected context.
- **My team**, **My rooms**, and administrator-only **Organization** projections filter the same canonical directory records.

### Company memory

- Uses a neural map to present reviewed reusable knowledge and its relationships.
- Published, draft, rejected, and withdrawn records remain durable and revisioned.
- Protected Context Broker artifacts appear as locked metadata nodes.
- Locked nodes never reveal source values, embeddings, snippets, or sensitive derived facts.
- **Review memory** opens the durable room review workflow in place and resumes exact-purpose verification in the same sheet.
- **Sharing boundaries** opens Context Grants and protected-field controls.

### Security map

- Shows the live organization hierarchy: organization, people, agents, mandates, approvals, grants, and federation peers.
- Shows evidence-ledger integrity and active-control counts from canonical state.
- **Run security controls** opens adversarial and containment validation.
- **Investigate evidence** opens durable trace reconstruction.
- **Demo readiness** opens the acceptance gate.
- **My team**, **Executive**, and **CISO** projections change scope and proof depth without creating another state or borrowing authority.

## In-place operating sheets

Routine actions stay in Workspace-native sheets:

- **People & authority** explains membership, credentials, and current Human Proof.
- **Agent connections** selects a native or company provider first, then guides Passport and runtime setup in one form.
- **Edit work plan** reviews every assigned agent and starts all dependency-ready work with one approval.
- **Human decisions** verifies the named independent approver, records approve or reject, supports withdrawal, and resumes exactly once.
- **Sharing boundaries** shows released transformations, withheld hashes, remaining uses, expiry, and revocation.
- **Projects & integration** connects a real local project without silently granting write authority.
- **Security validation** runs the real adversarial and containment handlers and requires persisted receipts.
- **Work receipts** searches and exports canonical evidence while reconstructing the human, proof, Passport, runtime, mandate, and hash chain.

These sheets do not render legacy phase-number workspaces. **Control console** remains an explicit advanced-audit destination for raw records and ceremony diagnostics.

### Plain, Authority, and Proof

These are three views of the same records:

- **Plain** answers what is happening and what action is needed.
- **Authority** exposes owner, tools, paths, fields, mandate lineage, and expiry.
- **Proof** exposes IDs, hashes, signatures, trace references, and evidence receipts.

Changing depth does not create a second state or bypass a policy boundary.

## Connected working capabilities

The workspace projects these already implemented H2A capabilities:

- Human Proof V2 identity binding with named in-place verification.
- Organization membership, separated authority, and renewable administrator credentials.
- Agent Passport V2, runtime session, runtime attestation, mandate, and assignment readiness.
- Live Claude Code, Codex CLI, Antigravity, and official MCP framework execution when their providers are installed and authenticated.
- Protected artifacts and non-identical least-context grants with released and withheld fields.
- Signed local and paired-node handoffs with predecessor hashes and persisted output hashes.
- Purpose-bound cross-human approval, rejection, withdrawal, and exactly-once resume.
- Pinned-key federation, bounded capabilities, task/acknowledgement/heartbeat exchange, replay denial, revocation, and durable receipts.
- Adversarial-control receipts, cancellation, authority revocation, and restart recovery.
- Governed Git project assignments, isolated worktrees, allowed paths/commands, validation, and approval-gated integration.
- Durable team rooms and independently reviewed organizational memory.
- Canonical evidence reconstruction and minimized acceptance-package verification.
- Command readiness and exact-scope repair without silently broadening authority.

## Trusted execution path

The simplified runner is host-owned:

`WorkspaceExperience -> window.h2a.runWorkGraph -> goal-work-graph:run -> GoalWorkGraphCoordinator.runReadyGraph`

`runReadyGraph` reads the persisted graph, selects only dependency-ready assignments with current mandates, and invokes the existing provider, federation, project, policy, and evidence paths. It stops truthfully when nothing is eligible. A failed or blocked node is not relabeled as successful and a stopped node is not silently restarted.

Human Proof continuation is also bounded. **Approve & start** stores only the exact graph continuation, opens the named proof challenge, and resumes after a matching current proof appears. Canceling the challenge or navigating away clears that continuation.

## Performance and complexity rules

- Normal mission execution uses one plan review and one start command.
- Safe dependency continuation is automatic in the trusted host.
- Polling does not overwrite a newer employee snapshot with stale state.
- Canonical state is refreshed after every command and by the existing event stream.
- Expired or missing authority is shown before work runs and repaired from the current context when the underlying workflow supports repair.
- Detailed ceremony screens remain available, but normal work does not require copying IDs, hashes, invitation documents, or grant JSON.

## Claims that remain limited

Do not present these as finished until their acceptance is completed:

- Final Phase 51 clean-session, two-person, two-node operator acceptance.
- Required-liveness acceptance with two physically present people; demo-bypass does not assert liveness.
- Production remote networking beyond the implemented and tested local two-node transport and secure-listener policy.
- Organization-wide directory discovery across separately deployed machines without governed pairing.
- Fully automatic provider login or consent; official provider authentication remains provider-controlled.
- Enterprise identity-provider synchronization and server-enforced custom role policies beyond the implemented employee, team, room, administrator, executive, and CISO projections.
- A free-form conversational room containing invented agent chat. H2A shows real events, outputs, decisions, and constrained messages instead.

These limits preserve the distinction between a demonstrated, persisted control and a future enterprise deployment claim.
