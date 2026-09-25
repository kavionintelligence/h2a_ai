# Joon’s Hospital / CISO presentation

Open `http://127.0.0.1:8788/` on this running installation. The hospital simulation is now the default experience; `?mode=enterprise` remains an explicit simulation URL. To access the separate real workspace, use `http://127.0.0.1:8788/?mode=workspace`. On another installation, use its own server address with the same mode parameters. The hospital simulation needs no model credentials, cloud connectors or external assets.

## What is included

- Fictional **Joon’s Hospital**, with six support departments: Technology, Cybersecurity, Design, Sales, Marketing and Management. The operational examples concern staff software, security, partnerships, outreach and administration—not clinical diagnosis or treatment.
- **42 named people**, with seven complete profiles in each department: one C-level sponsor, one VP, one manager, one team lead and three team members. All names in the scenario are Indian. The CISO is Neha Sharma. There is no additional assumed 6,000-person workforce.
- **48 approved governed agent identities:** 5 shared team agents plus 3 personal agents per department (30 shared / 18 personal). Each has a human owner, illustrative Passport and mandate. The 18 team members have personal agents; the other 24 people do not automatically receive one.
- **48 modeled devices:** 42 person-assigned laptops and 6 shared runtime hosts. Of those, 42 are company-owned (36 laptops + 6 hosts) and 6 are BYOD laptops. Device custody, hardware ownership and agent accountability are separate relationships. BYOD visibility is limited to the enrolled work profile.
- **6 separate software observations:** initially 1 approved, 1 waiting for approval, 2 blocked and 2 unverified. These are not six extra governed identities; the approved Codex observation links to an existing agent. Presenter classifications update the observation state.
- Deterministic, randomized 30-day history: 10–20 tasks per day, totaling 434 historical tasks and 380 completed tasks with reviewed knowledge in the initial scenario. Records include policy blocks, rejected requests, cross-team handoffs, tool operations and human decisions.
- 20 current tasks in a looping scenario pipeline. Every stage changes linked task, event, approval and memory records—not just the displayed counters.
- 18 directional collaboration rooms. A team map includes both the rooms it originates and incoming rooms in which it participates; these shared memberships must not be added together as unique company rooms.
- Organization, agent estate, discovery examples, pipeline, company brain, decision review, task identity traces and searchable/exportable evidence. No patient data is included.

## Overview and relationship maps

The light-blue and white overview shows the actual scenario workforce, accountable agents, rooms, waiting decisions, reviewed knowledge and restricted attempts. Its work-flow widget reconciles every retained task into completed, in progress, awaiting review, or blocked/rejected. Finished-output cards open their source task and deliverable.

The **Company collaboration map** has three levels:

1. **Hospital:** the company brain connects to all six teams.
2. **Team:** the selected team sits at the center, surrounded by every room it contributes to. The right panel shows people, bound agents, rooms and reviewed records for this scope.
3. **Room:** accountable people, participating agents, scoped work, company tools and knowledge are connected. Select a task to inspect its specific path. Hover or focus a connection for a short summary; select it for its mandate, accountable human, permitted scope, data boundary and task detail.

The top-left back control and breadcrumbs preserve the route back to the team and hospital. Green means recorded/completed, amber means human review, red means blocked/rejected, and neutral means planned/in progress. Color is accompanied by text; a green relationship is not proof of company-wide security. Keyboard and narrow-screen relationship lists provide alternative access to map details.

**Company brain** now uses the same white/light-blue surfaces, navy text and blue actions as the rest of the application. A compact source-task → human review → published context → reuse strip uses actual scenario record/reference counts, not a conversion funnel. Hover or focus a team or memory node for a preview; select it for provenance, reviewer, allowed teams, reuse and source-task details. Its local team selector, search, publication-state filter and pagination control the records shown. Completed source tasks offer a short handoff preview, a link to the complete task deliverable, and a Markdown download. Pending, blocked and rejected tasks do not manufacture completed deliverables.

Hospital overview metrics are company-wide. The maps and brain use their own drill-down and local controls; the application-level department/search controls are not global filters for those maps. Inventory, organization, discovery, pipeline, decisions and evidence retain their own applicable list filters.

## Estate and CISO drill-downs

- **AI estate** has five views: Agents, Devices, People, Discovered software and Tool access. Search, scope/state filters and clickable summaries expose the underlying records rather than inventing additional totals. Agent cards connect a bound human, configured runtime, deployment device and tool scope.
- **Agent details** distinguish assigned authority from retained mandate evaluations, exact-action human approvals, A2A review returns, blocked tasks and tool operations. Tool access shows entitlement separately from observed operations and modeled calls. A cross-team review does not grant the receiving agent the originating agent’s tool rights.
- **Person details** connect reporting responsibility, personal/owned agents, device ownership and custody, BYOD limits, tasks and related observations. **Discovery** provides classification counts and an observation → device → accountable-reviewer path.
- **Organization** adds a countable hierarchy strip with expandable people. **Task pipeline** adds non-overlapping current-stage counts. **Decisions** separates exact human approvals, cross-team agent reviews and memory publications. **Evidence** adds category bars and an activity calendar: intensity means record volume, not risk.
- **Receiving-team human approvals: 0 recorded.** There is no separate receiving-team human-approval gate in this workflow. The existing originating human action decision and memory-publication gate must not be represented as that missing control.

Tool icons use vendor website marks for GitHub, Figma and Salesforce, plus Microsoft/Google platform marks where applicable. A platform mark is not a product-specific logo, connector verification or proof of a live connection. Runtime marks identify modeled products; custom agents retain a bot icon.

## Presentation controls

**Play** advances one scenario transition per interval. **Pause** freezes advancement; opening a record also pauses. **Step** advances one transition while paused. Speed choices are 0.5×, 1× and 3×. The simulation clock advances one minute per event, not wall-clock time.

Scripted human decisions are enabled initially so the full loop progresses unattended. Disable them to hold exact-action and memory approvals for a presenter decision. Rejecting an action stops tool execution. Rejecting proposed memory excludes it from future context. A completed cohort becomes history and a new 20-task cohort starts automatically.

Agent-type filters, task history and evidence filters are interactive. Click a person, agent, task or memory to follow the binding, authority, originating human and A2A delegation scope. Export produces JSON explicitly marked synthetic.

Playback progress is saved under the browser-local `byosync.enterprise-simulation.v2` key. The older `v1` scenario key is left untouched; it is not imported into the new hospital hierarchy. Reload resumes the v2 data but always starts paused. A new browser/laptop generates the same structured scenario relative to its start date; it does not synchronize presenter decisions from another browser. Reset affects only this isolated v2 scenario, never the old v1 key or real workspace records. Export before resetting to preserve a presentation session.

To bound long-running browser storage, playback retains the latest 80 finished live tasks, approximately 900 live events at cohort boundaries and 160 live memory records; the full seeded 30-day history is retained. Older live links may fall outside that retained window; export before extended playback if a complete session archive is required.

## Honest boundaries

The persistent **Simulation environment** indicator identifies the data source without filling every screen with disclaimers. All names, evidence, results, Passport/mandate identifiers, tool usage and approvals in this mode are synthetic. There are no CLI executions, external tool invocations, endpoint scans, authenticated humans or real security containment operations. Tool names describe modeled boundaries, not connected services. The real workspace remains a separate mode and data source. A scenario authorization is not a live identity registration.

Completed output is a sample operational handoff derived from the task and its scenario identities. It contains no patient information, clinical advice, claimed certification or independent proof that an external control was tested. Task completion does not authorize production deployment, external disclosure, contractual commitments or automatic memory publication.

The memory-efficiency chart models a completed task with eight baseline tool calls. Each eligible published memory record avoids one modeled call, up to five. Historical reuse opportunity increases with scenario maturity. This is an explanation of the intended value—not measured savings, a benchmark or proof that more memory always reduces tool calls. Memory never grants new authority.

## Checks

Run from the `ByoSync` folder:

`npm run typecheck`

`npm run build`

`node h2a-mvp/h2a-mvp/node_modules/vitest/vitest.mjs run tests/enterprise-simulation.test.ts tests/hospital-model.test.ts tests/graph-model.test.ts tests/estate-model.test.ts --root h2a-mvp/h2a-mvp --maxWorkers=1`

`node --test tests/enterprise-simulation-browser.test.mjs`

The unit tests cover the 42-person hierarchy, 48 agent-owner bindings, deterministic history, graph relationships, device/observation projections, review gates and completed-output provenance. The browser test serves a separate static build, checks zero live API calls, play/pause/reload/manual decisions, exports and responsive widths, and saves screenshots under `.test-artifacts/enterprise-*`. These checks do not certify production security or hospital deployment. See `docs/CISO_SCREEN_MAP.md` for implemented visuals and remaining evidence gaps.
