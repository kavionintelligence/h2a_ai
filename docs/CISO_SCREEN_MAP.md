# Joon’s Hospital — CISO screen map

## Design goal and facts

Every screen should answer one security question, show its evidence boundary, and provide a direct path to the responsible person or next decision. Use white work surfaces, light-blue context areas, navy text and blue actions throughout—including Company Brain. Green, amber and red always have a text label; they describe record state, not a blanket claim that the hospital is safe.

The modeled organization has **6 teams, 42 people and 48 agents**. Each team has one C-level executive, one VP, one manager, one team lead and three members: 7 people. Each team has 5 shared agents and 3 personal agents: **30 shared + 18 personal agents** across the organization. Only the 18 team members have personal agents; do not imply that all 42 people do. A person without a personal agent is not a security finding. Every agent still needs an accountable owner.

The estate separately models **48 devices**: 42 person-assigned laptops and 6 shared hosts, split into 42 company-owned devices and 6 BYOD laptops. The **48 approved governed identities** are distinct from **6 software observations** (initially 1 approved / 1 waiting / 2 blocked / 2 unverified). Do not add software sightings to the agent count or equate a personal agent with personally owned hardware.

This is the hospital simulation workspace. Its stored tasks, decisions and outputs work as a connected scenario; they do not prove external hospital deployment, discovery coverage, clinical safety or real-world containment. Keep the discreet environment indicator and preserve provenance in exports.

## Screen-by-screen implementation map

The last column distinguishes implemented widgets from follow-up work. Current gaps remain capability/evidence gaps; polished visuals do not close them.

| Screen | CISO question | Best primary visual | Drill-down | Truth boundary | Current gap | Implemented / next |
| --- | --- | --- | --- | --- | --- | --- |
| **Overview** | What needs my attention across the hospital now? | Compact facts strip, company → team → room map, decision rail. | Team → room → person/agent/relationship → task. | Counts must come from the same selected scope. Graph edges represent recorded collaboration, not measured network traffic. | Scenario activity is not a connected-source coverage or exposure assessment. | Implemented workforce/work-state summaries and decision rail; next: collector-backed confidence and coverage. |
| **Security posture** | What can we prove, stop and not yet see? | Coverage/control-boundary matrix and ranked concern list. | Concern → evidence, accountable owner, known impact and supported action. | Distinguish implemented local controls, scenario outcomes, observations and unverified external controls. | Fleet denominator, IdP assurance, external containment receipts and independently protected evidence remain unproved. | Implemented concern detail/control boundaries; next: independently evidenced coverage, never a fabricated safety percentage. |
| **Organization** | Who is accountable, and how does responsibility flow? | Six hierarchy lanes and executive → VP → manager → lead → member count strip. | Expand a level → person → agents, devices and work. | Reporting hierarchy is not execution permission; seniority is separate from mandate scope. | Scenario identities are not synchronized HR/IdP identities; offboarding is not demonstrated. | Implemented `OrganizationSummary` and `PersonDeviceDetails`, including explicit no-personal-agent states. |
| **AI estate** | Which agents exist, where do they run, and what can they access? | Five views: Agents, Devices, People, Discovered software, Tool access. | Agent → owner/runtime/device → entitlement and recorded operations → task trace. | Approved scenario identity ≠ observed software ≠ connected runtime. Hardware ownership ≠ accountability. | Permissions/expiry/revocation and BYOD scope require connector-backed proof. | Implemented 30/18 composition, 48-device inventory, software-state summary and `AgentSecurityDetails`; entitlement and observed use stay separate. |
| **Discovery** | What AI is authorized, unknown or no longer reporting? | Classification summary and device-linked observation cards. | Observation → source, device, responsible reviewer and classification. | Installed, executing and authorized differ. “Blocked” is a scenario state, not a stop receipt. | Universal discovery, source freshness and actual stop receipts remain unproved. | Implemented `DiscoveryOverview`: 6 distinct observations with clear approved/waiting/blocked/unverified states. |
| **Task pipeline** | Where is work held, executing or prevented? | Non-overlapping stage counts, then bounded task cards. | Stage → task → identity, mandate, peer review, human decision and output. | A2A review is not human approval; blocked work must not show execution. | Production queue durability, operational SLAs and real throughput need evidence. | Implemented `TaskStageFlow`; human-gate group includes action and memory review, distinguished in task details. |
| **Rooms** | Who is collaborating, using which tools, under whose authority? | Company/team/room graph; room view connects people, agents, tool targets and task relationships. | Relationship → purpose, original owner, bounded mandate, task and recorded outcome. | A tool node or shared-room edge does not establish a live third-party connection or actual data transfer. | Connector execution receipts and negative cross-room isolation tests are not established by the map. | Implemented scope counts and hover/focus relationship previews; next: real connector receipts and isolation evidence. |
| **Company brain** | Where did this knowledge come from, who reviewed it, and who may reuse it? | Light-theme team knowledge graph plus compact source → human review → published → reused strip. | Team → memory → reviewer, allowed teams, source task, reuse references and deliverable. | Record-state counts are not a conversion funnel. Memory is context, not execution authority; modeled call savings are not measured causality. | External provenance validation, poisoning tests, retention/deletion and live provider behavior still need proof. | Implemented governance mini-flow, paginated record map/library and compact source-output preview; full deliverable opens the task inspector. |
| **Decisions** | Which action or memory publication needs my judgment? | Waiting decisions plus separate exact-action approval, A2A review and memory-publication counts. | Evidence count/request → latest retained task trace. | Scripted humans are not enterprise identity proof. Receiving-team human approvals: **0 recorded**. | No receiving-team human-approval gate; reviewer assurance and production escalation still need validation. | Implemented `DecisionSummary`; originating action approval and memory publication remain distinct from cross-team agent review. |
| **Evidence** | Can I reconstruct what happened and identify every decision-maker? | Category bars, recorded-day calendar and chronological event table. | Category → events → task identity/authority/outcome/artifact. | Calendar intensity is record volume, not risk. JSON export is not immutable or independently attested evidence. | External trust anchor, retention, timestamp trust and administrator-tamper resistance remain unproved. | Implemented `EvidencePulse`; next: per-task missing-evidence checklist, without inventing absent records. |

## Shared interaction contract

- One primary visual per screen; use a table or inspector for supporting detail rather than adding decorative charts.
- Keep Back visible at each graph level. Preserve the team/room context when returning from an inspector.
- Hover and keyboard focus show the same short explanation. Click or tap pins details; no essential information is hover-only.
- Pause playback when inspecting a person, agent, room relationship or knowledge record so details do not move during a discussion.
- Record status and outcome must use both text and color. Amber means attention; red means a recorded denial, rejection or identified concern—not merely “unknown.”
- Identity and action flow is **human binding → Passport → mandate → scoped collaboration → exact human decision → permitted execution → separately reviewed memory**. Peer review and memory review never substitute for action approval.
- A separate receiving-team human-approval gate is not implemented; its recorded count is explicitly zero. Do not relabel A2A reviews as those approvals.
- Vendor website icons for GitHub, Figma and Salesforce, and Microsoft/Google platform marks, are recognition aids—not proof of a specific product integration or live connection.
- Completed task outputs are operational sample deliverables, exclude patient data, and retain scenario provenance. Preview only a short handoff in a side panel; show the complete output in its task inspector or download.
- Prefer correct denominators over impressive percentages. Display the 42 modeled people rather than 6,000; show actual retained reference counts rather than invented savings or network-volume totals.

## Company Brain implementation notes

`CompanyBrainExplorer.tsx` retains the company/team drill-down, hover/focus cards, searchable eight-record pages, persistent detail panel and completed-output download. The governance flow derives source-task count from unique memory task IDs, review count from non-proposed memory records, published count from published records and reuse count from retained task memory references. These are different populations with different meanings, so the caption explicitly says they are not a funnel. Pending memory remains excluded from reusable context.

The UI/UX skill influenced the light semantic color tokens, keyboard/touch alternatives, persistent back path, bounded graph density and compact detail preview. The same data remains available through the library on small screens.

## Verification commands

From `ByoSync`: `npm run typecheck`, then `npm run build`.

`node h2a-mvp/h2a-mvp/node_modules/vitest/vitest.mjs run tests/enterprise-simulation.test.ts tests/hospital-model.test.ts tests/graph-model.test.ts tests/estate-model.test.ts --root h2a-mvp/h2a-mvp --maxWorkers=1`

`node --test tests/enterprise-simulation-browser.test.mjs`

Functional checks do not establish real discovery coverage, security certification or production scale.
