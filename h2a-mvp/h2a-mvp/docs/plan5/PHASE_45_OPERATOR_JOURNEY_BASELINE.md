# Phase 45 Operator Journey Baseline

## Purpose

Freeze the current operator cost and vocabulary before Plan 5 simplifies the product. Phase 45 changes contracts and read-only projections only. Existing protected commands, domain services, persistence, evidence, and trust decisions remain unchanged.

The machine-verifiable baseline is `docs/plan5/evidence/phase45/operator-journey-baseline.json`. It is generated from the complete current `docs/plan3/CONTROL_REGISTRY.json`, so every registered Office and Control command has a domain, route, classification, and source.

## Counting Rules

- **Operator command**: a deliberate request for a state transition or live effect.
- **Route change**: moving between Office and a Control destination.
- **Proof attempt**: submitting one Human Proof capture. It is counted separately because proof is a mandatory security pause.
- **Manual refresh**: requesting state reconciliation after a command.
- **Copied payload**: transferring signed protocol JSON through the clipboard.
- **Recovery**: an explicit retry or replacement after an unmet prerequisite.

Counts are derived from the ordered control sequence in the baseline JSON. They are not success claims and do not create product telemetry.

## Frozen Operator Vocabulary

| Technical object | Office term |
| --- | --- |
| Human identity and membership | Employee |
| Agent Passport and runtime | Agent |
| Work assignment | Task |
| Dependency edge | Waits for |
| Mandate | Allowed work |
| Context Grant | Shared context |
| Approval request and decision | Human decision |
| Evidence, hashes, and signatures | Technical details |

Control continues to use exact technical names and canonical identifiers.

## Click Budgets

| Journey | Budget |
| --- | --- |
| Connect a discovered coworker | At most 3 commands plus required Human Proof and mutual trust confirmation |
| Create and start a governed task | At most 4 commands plus required Human Proof, approval, or provider consent |
| Repair eligible expired prerequisites | 1 repair command plus minimum required Human Proof |
| Resume an interrupted demonstration | 1 resume command after its blocker is resolved |
| Open exact technical evidence | 1 Technical details command |

These are Plan 5 exit requirements. The larger Phase 45 baseline values document current friction rather than satisfying the target.

## Discovery Architecture And Non-Claims

### Same Host

Two local roots may be discovered through a host-owned adapter that advertises minimized pairing metadata. Discovery never activates trust. Both administrators still provide Human Proof and confirm a transcript-derived comparison code before signed peer records become active.

### Secure LAN

Secure LAN discovery is behind `NodeDiscoveryPort`. Before an adapter is enabled, its dependency license, maintenance, privacy behavior, multicast or broadcast exposure, spoofing resistance, endpoint policy, and denial-of-service surface require approval and tests. Advertisements are limited to the fields enumerated by `nodeDiscoveryAdvertisedFieldSchema`.

### Future Directory

A company or global username lookup requires an authenticated organization-directory backend. The local MVP has no such backend and must report this adapter as `not-implemented`.

### Explicit Non-Claims

- A display name, username, avatar, endpoint, IP address, or discovery result is not identity or trust.
- Phase 45 does not provide automatic pairing, automatic repair, goal planning, or a demonstration conductor.
- No clipboard payload, prompt, response body, protected context value, biometric material, credential, or private key enters click-budget telemetry.
- The trust ceiling remains `connected-observed`.

## Guided Baseline Check

1. Open each of the six existing guided journeys in Office.
2. Confirm the next step, canonical evidence references, and original reason code match the corresponding Control destination.
3. Switch between Office and Control and confirm no protected command runs merely because the presentation changed.
4. Confirm the ordered current control sequences in the baseline JSON describe the visible workflow.
5. Confirm no new success state or command is visible in Phase 45.

