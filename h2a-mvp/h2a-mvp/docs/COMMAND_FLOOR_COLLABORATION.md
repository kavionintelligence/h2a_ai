# Command Floor And Collaboration

## Purpose

Phase 6 turns the initial Command Floor visual foundation into a working local collaboration ledger. Operators can create and route assignments, reassign work, move it through controlled operational states, record assigned-agent responses, exchange agent-to-agent messages, and inspect persisted activity beside identity, mandate references, provider configuration, runtime state, and authority evidence.

Operational state is not authorization. Phase 6 records what work is planned and reported. Phase 7 remains responsible for signed mandates, policy evaluation, delegation, approval, expiry, and revocation. Phase 8 remains responsible for deterministic scripted execution and future live CLI or Bedrock execution.

## Trusted Architecture

| Layer | Responsibility |
|---|---|
| Renderer | Presents the roster, Kanban, assignment inspector, message composer, activity timeline, runtime view, and provider settings. |
| Preload | Exposes five allowlisted collaboration methods with shared TypeScript contracts. |
| Electron main | Parses every request with Zod and invokes the collaboration service. |
| `AgentCollaborationService` | Validates routing and transitions, updates workplace projections, persists history, and appends authority evidence. |
| Local repositories | Store assignment snapshots atomically and append immutable message, response, and activity JSONL records. |
| Authority ledger | Records security-relevant collaboration metadata and content hashes without duplicating full message or response bodies. |

## Persisted Records

### Work Assignment

Assignments contain identity, objective, assignee, operational status, risk, priority, dependencies, optional requested action, mandate reference, trace reference, timestamps, latest response, and message/response counts.

Supported states are:

- `queued`
- `active`
- `approval`
- `blocked`
- `complete`

The service uses an explicit transition map. Invalid jumps fail closed. A completed assignment may be reopened to active with a recorded status event.

### Collaboration Message

Messages link a source agent, destination agent, assignment, intent, mandate reference, trace, subject, body, timestamp, and delivery status. Sender and recipient must be different registered, online workplace agents.

Supported intents are `request`, `inform`, `propose`, `query`, `response`, and `handoff`.

### Assignment Response

A response links full output text to one assignment and its current assignee. The service rejects responses attributed to an agent that is not assigned to the work.

### Agent Activity

Activity entries provide a local operational timeline for assignment, status, message, response, runtime, and system events. They are inspectable per agent and assignment.

## Local Files

| Path | Purpose |
|---|---|
| `data/h2a-demo/workplace/assignments.json` | Atomic current assignment state. |
| `data/h2a-demo/workplace/fleet.json` | Current agent workplace projection. |
| `data/h2a-demo/workplace/messages.jsonl` | Immutable agent message history. |
| `data/h2a-demo/workplace/responses.jsonl` | Immutable assignment response history. |
| `data/h2a-demo/workplace/activity.jsonl` | Immutable agent activity history. |
| `data/h2a-demo/evidence/recent-events.json` | Recent evidence summaries for the Command Floor. |
| `data/h2a-demo/traces/tr_platform.jsonl` | Hash-linked authority evidence. |

`LocalJsonlRepository` validates every line and uses the existing atomic local file store when appending. Collaboration bodies remain in the workplace stores. Evidence payloads include routing metadata and SHA-256 body hashes instead of full content.

## IPC Surface

- `collaboration:get-state`
- `collaboration:create-assignment`
- `collaboration:update-assignment`
- `collaboration:record-response`
- `collaboration:send-message`

Every request and response is parsed against shared contracts in `packages/contracts/src/index.ts`.

## Command Floor Surfaces

### Agent Roster

Named agents show role, provider, model, current action, operational status, progress, and mandate reference. Selecting an agent opens the agent inspector.

### Collaboration Ledger

The five-column Kanban shows queued, active, approval, blocked, and complete work. Cards expose risk, priority, objective, assignment identifier, collaboration count, and assignee.

### Assignment Inspector

The assignment view provides:

- assignment and mandate/trace context
- priority, risk, requested action, and timestamps
- reassignment and valid next-state commands
- complete response history and response recording
- complete message thread and message composer
- an explicit notice that Phase 6 routing is not Phase 7 authorization

### Agent Operations

The agent view provides four tabs:

- **Identity:** passport, runtime binding, owner, mandate reference, lifecycle controls, and evidence context.
- **Activity:** persisted activity and recent messages.
- **Runtime:** terminal-style persisted activity with a clear live-runtime boundary.
- **Provider:** provider/model, workspace, command, auth mode, availability, and masked credential state.

The runtime tab never fabricates PTY or model output. Scripted execution activates in Phase 8; live CLI and Bedrock remain adapter-ready.

## Munder Reference Use

The following MIT-licensed Munder files were used as interaction and information-architecture references:

- `munder-difflin-main/munder-difflin-main/src/renderer/src/components/TasksKanban.tsx`
- `munder-difflin-main/munder-difflin-main/src/renderer/src/components/TaskDetailOverlay.tsx`
- `munder-difflin-main/munder-difflin-main/src/renderer/src/components/AgentDetailPanel.tsx`
- `munder-difflin-main/munder-difflin-main/src/renderer/src/components/PtyTerminalView.tsx`
- `munder-difflin-main/munder-difflin-main/src/renderer/src/components/AgentStrip.tsx`
- `munder-difflin-main/munder-difflin-main/src/main/hive.ts`

H2A adapted the shared roster, Kanban/detail, message routing, activity, and terminal-panel concepts. It uses new H2A schemas, services, evidence rules, components, copy, styling, and accessibility behavior. No Munder code was copied verbatim. No pixel art, character assets, parody branding, product copy, or restricted assets are used.

## Verification

`tests/agent-collaboration.test.ts` verifies assignment persistence, transition rules, workplace projection updates, reassignment, response authorship, message delivery, activity creation, linked evidence, and content redaction from the evidence ledger.

The checked-in local-data contract also validates all three collaboration JSONL stores. The complete suite passes with 36 tests. Typecheck, lint, production build, Electron startup, desktop and mobile layout, dialog reachability, named controls, and horizontal overflow checks also pass.
