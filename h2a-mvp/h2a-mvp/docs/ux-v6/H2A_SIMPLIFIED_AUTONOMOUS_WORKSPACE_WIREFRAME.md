# H2A Simplified Autonomous Workspace Wireframe

Status: Production workspace baseline implemented on 2026-09-08. The standalone HTML remains a target prototype; the canonical implementation is `apps/desktop/renderer/src/features/workspace/WorkspaceExperience.tsx`. Final Phase 51 operator acceptance is still required.

Date: 2026-09-08

## 1. Product Promise

H2A should feel like a normal team workspace:

1. An employee confirms who they are.
2. They connect the agents they already use.
3. They join a team workspace or create one.
4. They ask for an outcome.
5. H2A proposes a bounded plan and the employee chooses **Start work**.
6. Ready agents run continuously, exchange signed handoffs, and stop only when a human decision or a real boundary is reached.
7. The completed outcome and its authority chain remain understandable and reconstructable.

The everyday interface must not require employees to operate Passports, attestations, mandates, grants, hashes, federation handshakes, or evidence ledgers. H2A still creates and enforces those objects in the trusted host. They are shown only when the user opens **Authority** or **Proof** depth.

### Visual product identity

H2A is an AI-agent operating platform, not a conventional enterprise dashboard. Its primary surface is a living orchestration canvas:

- employees appear as accountable authority hubs;
- their connected agents form visible groups around them;
- work appears as executable dependency graphs rather than rows of provider buttons;
- active edges show real signed handoffs, bounded context, questions, approvals, and outputs;
- a live rail narrates canonical events without presenting fabricated agent conversation;
- list and dashboard views remain secondary tools for search, records, and administration.

The visual language adapts the supplied agent-workflow, agent-swarm, and AI-platform references without copying their brands, layouts, assets, or code.

## 2. Experience Laws

- One human request, one plan review, one start command.
- No per-agent Run buttons for an approved dependency graph.
- Identity proof appears in place, names the person, explains the exact purpose, and resumes the original action automatically.
- Expiry is discovered before execution and repaired from the current screen.
- Official agents connect with one **Connect** command plus provider authentication when required.
- Custom agents use one short configuration flow, with an automatic connection test.
- Coworker and node trust feels like a friend request, while signed transcripts and pinned keys remain authoritative underneath.
- Agents collaborate through persisted assignments, constrained messages, predecessor outputs, and signed handoffs. The UI must not simulate casual chat that did not occur.
- Safe, already-authorized work continues automatically. New authority, broader context, external effects, or destructive actions stop for a person.
- A stopped agent never silently restarts. The user chooses update, retry, reassign, or cancel.
- Every status is a plain sentence. Reason codes and record IDs live at Proof depth.
- Plain, Authority, and Proof are three readings of the same canonical object, not separate products.

## 3. Navigation

The Office/Control mode switch and the current long technical sidebar are retired from normal use. Navigation is a compact icon rail so the orchestration canvas remains the dominant first-viewport experience.

### Employee navigation

| Destination | Purpose |
|---|---|
| **Canvas** | Human-agent constellation, active work graphs, questions, and outcomes |
| **Workspaces** | Team rooms, projects, shared tasks, people, and agents |
| **People & agents** | Enterprise directory, accountable humans, connected agents |
| **Memory** | Reviewed, reusable organizational knowledge |
| **Security** | Visible only to authorized leads, administrators, Security, Compliance, and C-level roles |

The bottom identity block always shows the signed-in employee, department, role, and the two most consequential authority limits. Organization setup and connection health are reached from this block only by administrators.

### Depth control

Every task, room, person, agent, decision, and evidence row supports:

- **Plain**: what happened and what the employee needs to do.
- **Authority**: who allowed it, scope, context, limits, ownership, and expiry.
- **Proof**: canonical IDs, hashes, signatures, provider/runtime references, and reason codes.

Changing depth never changes the underlying object, route, or selection.

## 4. Role Views

| Role | Default view | Additional capability |
|---|---|---|
| Employee | Own and shared work | Connect own agents, join workspaces, create work |
| Team lead | Team work and exceptions | Assign people/agents, approve delegable team actions |
| Department head | Department outcomes | Cross-team work, departmental authority summary |
| C-level | Company outcomes | Company collaboration map and consequential decisions |
| Security / Compliance | Exceptions and investigations | Proof depth, containment, legal hold, control posture |
| Administrator | Connection and organization health | Directory, platform, boundary, and company connection setup |

This is one product with role-based projections, not separate dashboards with separate state.

## 5. Click Budgets

Required camera capture, provider sign-in, and a second person's independent confirmation are not counted as ordinary clicks, but they must happen in place.

| Journey | Target |
|---|---:|
| First employee setup | 3 screens, 1 identity confirmation |
| Connect an official agent | **Connect** + provider authentication + **Done** |
| Connect a custom agent | 3 steps maximum |
| Join an existing workspace | 1 command; 2 when approval is required |
| Create a workspace | 2 steps |
| Create and start work | Type request + **Review plan** + **Start work** |
| Run an approved multi-agent graph | 0 per-agent commands |
| Repair an expired exact scope | Original command + in-place confirmation; automatic resume |
| Add a coworker | Search/select + **Send request** + mutual confirmation |
| Pause and change work | **Pause** + one selected outcome |
| Open technical proof | 1 depth change |

## 6. Screen Map

### W01 - Welcome and identity

Purpose: make a usable employee session without exposing identity infrastructure.

```text
Welcome to H2A

Work email        [ varun@company.example ]
Employee ID       [ E-1042 ]
Organization      [ HP                              ]

[ Continue ]

Confirm it is you
[ camera with live guidance ]
For: binding this H2A session to Varun
[ Cancel ]
```

After successful confirmation, H2A creates or resolves the employee binding and shows Home. If enterprise SSO/directory exists, name, employee ID, organization, department, and role come from that source. H2A does not import historical permissions as agent authority.

### W02 - Agent canvas

```text
H2A / Storefront launch                         [ Plain | Authority | Proof ]
[ Ask for an outcome...                                      ] [ Start ]

┌──────────────────────────── LIVING CANVAS ────────────────────────────┐
│                                                                      │
│  Varun                                                               │
│   ├─ Claude ───────┐                                                 │
│   └─ Codex ────────┼── [ Storefront mission ] ── [ Outcome ]         │
│                    │           │                                      │
│  Maya              │           └── [ Approval: Samir ]                │
│   ├─ Research ─────┤                                                  │
│   └─ Antigravity ──┘                                                  │
│                                                                      │
│  active edges = signed handoffs · amber = human needed · red = stop │
└──────────────────────────────────────────────────────────────────────┘

LIVE NOW
Codex picked up the approved design and three product facts.
15 protected fields stayed behind.                         [ Inspect ]
```

The canvas is the default product view. It supports pan, zoom, fit-to-work, keyboard navigation, and a complete DOM list alternative. It can switch between **Organization**, **Workspace**, and **Mission** focus without changing the underlying canonical state.

The top command bar is the fastest path to work. It opens the graph composer over the canvas. The right live rail shows what needs the person first, then active work, then completed outcomes. It must never become a social feed.

### W03 - Connect agents

Opened from **People & agents -> Add agent**, from onboarding, or directly when planning needs a missing capability.

```text
Connect an agent

Recommended for you
[ Claude Code ]     UI and analysis       Connected
[ Codex ]           coding                [ Connect ]
[ Antigravity ]     review and QA          [ Connect ]
[ Custom agent ]    MCP or command         [ Set up ]

Connected agents always belong to a named person.
```

Official provider flow:

1. Employee chooses **Connect**.
2. H2A opens provider authentication only when required.
3. Trusted-host preflight discovers the supported provider, version, and capabilities.
4. H2A creates the minimum Passport, session, attestation, and employee binding needed for use.
5. The row becomes **Connected** only after canonical readiness is true.

If authority expires, the row says **Permission expired - renew**, not Connected. Renewal opens the in-place confirmation and performs an exact-scope replacement. Revoked authority is never reactivated.

Custom-agent flow:

1. **Connection**: choose MCP, local command, or approved HTTPS endpoint.
2. **Capabilities**: review discovered tools and choose allowed capabilities.
3. **Test and connect**: run a real health/authentication test, then bind the agent.

Secrets never enter renderer state or proof exports.

### W04 - People, teams, and workspaces

```text
People & agents                         [ People | Agents ]       [ + Add ]

Search people in HP...

Varun              Technology       2 agents     Active
Maya Singh         Finance          3 agents     Active
Samir Mehta        Legal            1 agent      Active

Workspaces                                                  [ + New workspace ]
Storefront launch       Technology + Marketing   6 people   [ Open ]
Vendor review           Finance + Legal          4 people   [ Join ]
```

Enterprise directory members are discoverable by approved name, email, or employee ID. Display names aid discovery but never establish trust.

The default **People & agents** presentation is an agent constellation, not a table: each human is the anchor for their agents, active workspace connections form edges, and borrowed or remote agents are visually distinct. Search results and accessibility mode use the equivalent list.

**Create workspace** is two steps:

1. Name, team, purpose, and sensitivity.
2. Review who can join and the default company boundaries, then **Create**.

**Join workspace** is one command when the user is already eligible. If approval or identity confirmation is required, the request remains on the same sheet and completes there.

Workspaces use a folder visual model. Each folder shows its teams, people, agents, sensitivity, and live state. Opening a folder does not open another dashboard: it focuses the main orchestration canvas on that workspace and reveals the humans, owned agents, active missions, bounded context, decisions, and outcomes inside it.

The company agent catalog borrows the familiar discovery behavior of a social network without borrowing its trust model. Employees can browse company-approved agents, see the accountable human or owning team, capability, review status, and usage. **Request for workspace** routes a governed request to the owner. It never follows, connects, or grants access merely because a profile was found or selected. Personal agents remain owned by their employee; organization-shared agents remain owned by a named team and accountable human.

### W05 - Connect a coworker or company node

```text
Add coworker

Search HP directory or nearby approved H2A nodes
[ Maya Singh / E-2041 / team name... ]

Maya Singh · Finance · H2A Finance Node
Will share: selected workspace threads only
Maximum agent context: 3 fields

[ Send request ]
```

Both administrators confirm identity in place. Both screens then show the same short comparison phrase. Choosing **These match** on both sides causes H2A to exchange and persist the signed invitation, registration, acceptance, capabilities, endpoints, and key pins. JSON and fingerprints remain under Proof depth. No trust is established from a display name alone.

States: Request sent, waiting for Maya, compare phrase, connected, offline, expired, revoked, replacement required.

### W06 - Start work on the graph canvas

```text
Create work

What outcome do you need?
[ Build a responsive clothing storefront with approved product content. ]

Workspace     Storefront launch
Project       website-delivery
Sensitivity   Internal
Due           Friday

[ Review plan ]
```

H2A proposes a validated graph directly on the canvas using connected agents and their current capabilities. It never claims an unavailable agent is ready. The user can replace an agent, remove a node, or change a dependency directly on the graph; the readable plan remains available beside it.

```text
Here is the plan

1 Research content      Maya's Research agent      read-only       starts now
2 Design storefront     Varun's Claude agent       design files    starts now
3 Implement             Varun's Codex agent        project copy    after 1 + 2
4 Validate              Maya's Antigravity agent   read/test       after 3

They may use: approved product sources, brand files, project copy
They cannot: publish, deploy, read customer PII, or leave this workspace

[ Change plan ]                                      [ Start work ]
```

Changing an agent, dependency, result, or scope shows a plan diff. **Start work** is the single commit. One compatible Human Proof may bind the whole exact plan. Independent decisions remain separate.

### W07 - Collaboration room

The room should feel like a live agent session, not a Slack clone, a standard dashboard, or a set of provider run cards. It combines a Zoom-like participant stage with the active graph: the currently working agent occupies the main tile, other people and agents remain visible around it, and the active handoff edge is highlighted.

```text
Storefront launch · Live room                     [ Pause ] [ Leave ]

+--------------------------+----------------------+----------------------+
| LIVE STAGE               | PARTICIPANTS         | CURRENT STEP         |
|                          | Varun                 | Implement storefront |
| [ Codex working ]        |   Claude  done        | Owner: Varun         |
| Implementing header      |   Codex   working     | Context: 2 of 9      |
| and product grid         | Maya                  | Writes: project copy |
|                          |   Research done       | Cannot deploy        |
| Next: Antigravity QA     |   Antigravity waiting| [ See authority ]    |
+--------------------------+----------------------+----------------------+

PLAN  [Research done] -> [Design done] -> [Implementation 62%] -> [QA waits]

Updates | Plan | Context | Outputs | Decisions
"Use the approved fall campaign imagery."                         [ Send ]
```

Each agent tile shows its accountable employee. Agent animation/state comes only from persisted workflow state or explicitly labelled live process telemetry.

The room automatically runs all ready nodes. A node becomes ready only when its declared predecessors and security prerequisites are ready. Completion persists an output receipt and wakes dependants. The employee does not press Play on each agent.

The stage rotates to the active agent or human decision. It may show concise, truthful status such as **Reading 3 approved sources**, **Writing in its isolated project copy**, or **Waiting for Maya's review**. It must not invent natural-language agent conversation from process logs.

### W08 - Signed handoff and bounded context

Shown as a room event and under **Context**:

```text
Codex picked up from Claude and Research
Received: design tokens, approved product facts, predecessor hashes
Left behind: private notes, owner email, recovery secret, 12 other fields
Passed 3, left behind 15                                      [ See proof ]
```

This is the product's key differentiation. The user sees that human authority and least context travel with the work; Proof depth shows mandate ancestry, Context Grant, projection hash, predecessor hashes, provider/runtime, acknowledgement, and signed evidence.

### W09 - Outputs

Outputs are viewable deliverables, not only hashes.

```text
Outputs

Research brief             Ready       [ Preview ] [ Open file ]
Storefront design          Ready       [ Preview ] [ Compare ]
Implementation             Working     [ Open project copy ]
Accessibility report       Waiting

Selected output: Storefront design
[ rendered markdown / image / file preview ]

Created by Claude · owned by Varun · sha256:...                 [ Proof ]
```

An output may expose a file preview, file path, diff, validation result, or external result according to its type. Protected values remain excluded. A receipt without a usable deliverable is visibly labelled **Receipt only**.

### W10 - In-place identity and repair

Any protected action can open this modal without route changes:

```text
Confirm it is Varun
Technology · Administrator · E-1042
Camera must show Varun

For: approving the Storefront launch plan
This confirmation expires in 2 minutes.

[ camera ]    Move a little closer
              Face 1 of 1 · liveness required · ready

[ Cancel ]
```

After successful verification, H2A reconciles the canonical proof, repairs compatible exact scopes in dependency order, closes the modal, refreshes the originating object, and resumes the original command at most once.

If the provider needs login, the modal changes to **Sign in to Codex to continue** and never implies Human Proof can complete provider authentication. If another person must approve, the room changes to **Waiting for Maya** and never auto-approves.

### W11 - Pause, interruption, and recovery

Choosing **Pause** stops live work through the real process and workflow coordinator, freezes downstream nodes, and opens:

```text
Work paused
Codex stopped while editing the product grid. Completed outputs are retained.

[ Add an instruction and continue ]
[ Retry this step ]
[ Assign another agent ]
[ Cancel remaining work ]

Nothing restarts until you choose.
```

Rules:

- **Add an instruction and continue** produces a plan amendment. If authority and scope do not expand, H2A resumes after showing the diff. If they expand, H2A requests the required confirmation or approval.
- **Retry this step** creates another attempt under the same current scope; it does not erase the failed attempt.
- **Assign another agent** validates the replacement's owner, Passport, runtime, mandate projection, tools, paths, context, and provider readiness.
- **Cancel remaining work** is destructive and requires confirmation. Running process trees stop and downstream work becomes cancelled. Completed evidence and outputs remain.

Safe provider failures may receive a small bounded automatic retry. Exhausted retry, authentication, capacity, policy denial, or inconsistent output always pauses visibly.

### W12 - Decision

```text
Approval needed
Publish the approved storefront to staging

What will happen
- Integrate the accepted files
- Publish to the approved staging target
- Run the accessibility check

Will not happen
- No production deployment
- No customer data access

Requested by Varun · implemented by Codex
Samir cannot approve his own agent's work, so this came to you.

[ Approve ] [ Request changes ] [ Route to someone else ] [ Block ]
```

Approval opens the exact-purpose identity confirmation and returns to the decision. Exactly-once effects read: **Approved and used once. It cannot run again.** Boundary violations never offer approval.

### W13 - Evidence story

The default evidence view answers six questions:

```text
Who asked?        Varun · Technology
What was allowed? Build storefront in the isolated project copy
Who worked?       Claude, Research, Codex, Antigravity; each owned by a person
What travelled?   3 approved fields and predecessor hashes; 15 fields withheld
Who decided?      Maya approved staging publication
What resulted?    Integrated storefront + validation receipt
```

A connected timeline expands to:

`Human -> employee authority -> Agent Passport -> runtime attestation -> mandate -> assignment -> Context Grant -> signed handoff -> approval -> output hash -> evidence receipt`

Proof depth provides immutable identifiers, signed records, trust ceiling, ledger verification, denial receipts, and reconstruction/export controls.

### W14 - Security and leadership

Everyday employees do not see a control-plane dashboard. Authorized users see:

- company posture: agents bound, platforms connected, exceptions, unknown agents;
- work map across teams and external parties;
- blocked boundary attempts and repeated delegated-limit extensions;
- active, expired, revoked, and replacement-required relationships;
- containment actions with exact impact;
- evidence integrity and retention;
- one-click investigation from any person, agent, platform, workspace, or trace.

The leadership version defaults to outcomes and exceptions. Security defaults to Authority depth and can open Proof.

The Security surface is a visual control map, not a collection of unrelated metrics. It combines:

- the company authority hierarchy on the left;
- a Notion-like executable control flow for the selected mission in the center;
- identity, context, unknown-agent, connection, expiry, and containment posture on the right;
- selectable links from each hierarchy branch to the exact mission, mandate, handoff, decision, denial, or output it governs.

Healthy, waiting, expiring, and blocked nodes are visually distinct. Boundary blocks terminate without an approval path. Delegable checkpoints route only after a person chooses to request the decision.

### W15 - Company memory network

Company Memory uses a neural knowledge map rather than a document list. The center represents reviewed organizational memory; connected nodes represent playbooks, policies, lessons, templates, and approved sources. Edges represent reviewed relationships such as subject, workspace, owner, dependency, or approved reuse.

Hovering or focusing an accessible node shows its readable summary, owner, review state, and allowed uses. A locked node shows only:

- its safe label;
- owning team;
- classification;
- why it is unavailable;
- the governed route for requesting access.

Locked content, snippets, embeddings, protected metadata, and derived sensitive facts are never exposed by hover. Selecting a permitted node can attach it to a mission within the employee's current remit. Selecting a locked node can only request access through the owning team. Raw conversations and task transcripts never become company memory automatically; a named reviewer must approve reusable memory.

## 7. Autonomous Orchestration Contract

The following is required for the simplified experience to remain truthful.

### Automatic continuation is allowed when

- the plan is approved and persisted;
- the node is ready and all declared predecessor edges are satisfied;
- the agent's current Passport, runtime, attestation, mandate, assignment, Context Grant, provider authentication, project boundary, and peer relationship are ready;
- requested context, tool, path, command, host, action, duration, and output stay inside approved scope;
- no human-only effect or independent approval is required.

### H2A pauses when

- a person must confirm identity;
- provider sign-in or consent is required;
- scope, context, duration, resource, path, tool, command, host, or capability expands;
- an independent approval or another physical participant is required;
- a company boundary is hit;
- a signature, generation, ledger, peer, or control-plane attachment is invalid;
- validation fails or an output is inconsistent;
- the user pauses, revokes, or cancels.

### Agent collaboration

Agents do not receive unrestricted access to each other's chats or private histories. They communicate through:

- signed work messages;
- declared predecessor outputs;
- least-context projections;
- questions routed to accountable people;
- durable decisions and amendments;
- typed validation and output receipts.

The room may summarize those real events but cannot fabricate discussion.

## 8. Visual Direction

CENTER PRIMARY CANVAS

- Near-black orchestration canvas with a subtle fixed dot grid, high-contrast nodes, and restrained connection animation.
- Human authority hubs use a circular identity treatment; agents use compact rectangular nodes attached to their human.
- Mission, decision, context, and output nodes have distinct shapes and labels, not color alone.
- Active graph edges may animate only when a real process or handoff is active. Reduced-motion mode uses a static emphasized edge.
- The currently selected node opens a light inspector rail with Plain, Authority, and Proof readings.
- A minimap, fit-to-work command, pan, zoom, and accessible list alternative are mandatory for large graphs.

SECONDARY SURFACES

- Quiet white and soft-gray panels with near-black text.
- Blue for primary commands, green for completed/allowed, amber for waiting/expiring, red only for blocked/revoked/destructive.
- No gradients, decorative orbs, oversized marketing hero, or card-inside-card layouts.
- Cards use 8px radius maximum and only for repeated work items, agents, decisions, and modals.
- The collaboration room uses the dark live canvas/stage surrounded by a light operational shell.
- Agent tiles use provider marks as secondary metadata; the accountable person's name is primary.
- Minimum 44px controls, visible focus, keyboard operation, reduced motion, and responsive reflow.
- No font size tied to viewport width. Compact panels use compact headings.

## 9. Responsive Behavior

- Desktop: sidebar, main stage, and context panel may be visible together.
- Tablet: context panel becomes a tab below the stage.
- Mobile: one column; the live stage, plan strip, and selected tab remain available. Decisions are fully actionable without opening a desktop.
- The depth control remains reachable on every viewport.
- No horizontal scrolling for ordinary content; graphs may pan within a bounded canvas with a list alternative.

## 10. What This Wireframe Deletes

| Current friction | Target replacement |
|---|---|
| Office/Control switch | Plain/Authority/Proof depth on the same object |
| Long technical sidebar | Compact five-destination rail with a canvas-first workspace |
| Conventional dashboard as Home | Living human-agent orchestration canvas |
| Per-agent Run buttons | Approved dependency graph auto-runs ready nodes |
| Human Proof route | Named in-place identity dialog with automatic return/resume |
| Manual refresh | Canonical event reconciliation after every protected operation |
| JSON federation handshake | Coworker request + mutual short comparison phrase |
| Expiry discovered by errors | Preflight state and in-place exact-scope renewal |
| Provider lane pages | Agent catalog and room participants |
| Output hashes without content | Inline deliverable preview plus Proof metadata |
| Separate approvals queue | Decisions appear in Home and in the relevant room |
| Generic error banner | Plain outcome, impact, and direct next action |
| Technical evidence as a destination | Proof depth on the same business story |

## 11. Implementation Boundaries

This wireframe does not authorize weakening H2A controls. Production implementation must:

- use the canonical repositories, trusted-host services, typed IPC, policy gates, and evidence ledger;
- retain exact-purpose Human Proof and separation of duty;
- retain pinned-key federation, signed transcripts, least-context grants, and denial evidence;
- preserve immutable revoked records;
- keep provider login and consent external and truthful;
- use actual provider processes and outputs, never renderer-local success;
- keep protected values, secrets, biometric material, and raw output bodies out of minimized evidence;
- label `demo-bypass`, disconnected, offline, degraded, receipt-only, and connected-observed states honestly.

## 12. Delivery Sequence After Approval

1. Replace the shell and Home while keeping current technical routes reachable by direct Proof links.
2. Build the agent catalog and one-click trusted-host connection coordinator.
3. Build People, workspace membership, and simple coworker pairing.
4. Replace task composition with Request -> Review plan -> Start work.
5. Add host-owned automatic graph execution and interruption recovery.
6. Build the live collaboration room, bounded handoff rows, and output previews.
7. Add in-place proof/repair/approval to every protected action.
8. Add role projections, Security, leadership, and full Proof depth.
9. Migrate current Control pages to advanced direct routes and remove them from normal navigation.
10. Run clean-session, two-person, two-node, provider, security, responsive, accessibility, restart, privacy, evidence, and tamper-negative acceptance.

## 13. Review Decisions Needed

Before production implementation, the product owner should approve:

- five-destination navigation;
- retirement of the visible Office/Control switch;
- collaboration room layout and automatic graph execution;
- the named in-place identity interaction;
- the agent connection catalog;
- friend-request coworker pairing;
- output preview behavior;
- role projections and the Security destination;
- the click budgets and delivery sequence.
