# H2A Visual State Catalogue

Status: Phase 2 baseline

## Application Loading

Trigger: initial IPC and repository read.  
Surface: stable metric, roster, and board skeletons.  
Accessibility: main region has `aria-busy="true"`; the state announces `Loading H2A workspace`.  
Reduced motion: shimmer becomes a static neutral fill.

Development verification URL:

```text
http://127.0.0.1:5173/?state=loading
```

## Application Error

Trigger: system status or workplace snapshot cannot be loaded.  
Surface: alert panel with cause, recovery instruction, and Retry command.  
Accessibility: `role="alert"` with assertive announcement.  
Security: renderer-safe error text must not disclose secrets or raw biometric material.

Development verification URL:

```text
http://127.0.0.1:5173/?state=error
```

## Empty Workplace

Trigger: repository returns no registered agents.  
Surface: empty-state panel explaining that the local roster is empty and offering Refresh.  
Accessibility: polite status announcement.  
Behavior: no fabricated agents, mandates, assignments, or evidence are shown.

Development verification URL:

```text
http://127.0.0.1:5173/?state=empty
```

## Agent State

| State | Text | Visual Treatment | Operational Meaning |
|---|---|---|---|
| working | Working | green text plus activity icon | executing an authorized assignment |
| ready | Ready | green text plus radio icon | runtime available for bounded work |
| approval-required | Approval required | amber text plus alert icon | execution paused at a human gate |
| blocked | Blocked | amber text plus alert icon | execution cannot continue |
| offline | Offline | neutral text plus status icon | runtime unavailable |

## Assignment State

| State | Column | Meaning |
|---|---|---|
| queued | Queued | accepted but not executing |
| active | Active | currently executing |
| approval | Approval | paused for an authorized human decision |
| complete | Complete | final response recorded |

Risk is conveyed by both label and color: `standard`, `sensitive`, or `restricted`.

## Evidence Integrity

| State | Treatment | Meaning |
|---|---|---|
| verified | green plus explicit Verified text | checked chain is internally consistent |
| warning | amber plus warning text | verification is incomplete or degraded |
| failed | red plus failed text | an integrity mismatch was detected |

V0 verified state is local tamper evidence and must not be described as external notarization.

## Human Proof State

Phase 2 truth state is `Enrollment required`. The UI must not claim a verified human until Phase 4 creates a valid Human Identity and Human Proof record through the implemented biometric workflow.

## Interaction State

- Hover changes border, surface, or shadow without changing layout dimensions.
- Pressed state uses a stable surface change.
- Focus uses a visible 3px blue ring.
- Selected agent and assignment use a blue border plus `aria-pressed` where appropriate.
- Disabled controls are not shown until a real command exists that can be unavailable.

## Shared Structural Components

- `StatusBadge` provides semantic neutral, information, verified, approval, and danger treatments.
- `StatePanel` provides empty and recoverable error states with live-region behavior.
- `WorkspaceLoadingState` preserves the Command Floor geometry while data loads.
- `ModalDialog` uses the native dialog element, Escape handling, labelled title/description, scrim dismissal, and a 44px close control.
- `DataTable` provides caption semantics, column headers, row identity, and keyboard-reachable horizontal overflow.
