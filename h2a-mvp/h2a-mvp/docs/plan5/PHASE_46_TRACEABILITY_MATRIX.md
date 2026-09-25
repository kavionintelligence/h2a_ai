# Phase 46 Traceability Matrix

| Requirement | Canonical implementation | Control | Verification |
| --- | --- | --- | --- |
| Command readiness projection | `ReadinessProjectionService.project` | Office and Control readiness centers | `readiness-projection-phase46.test.ts`, Electron readiness test |
| Exact status and countdown | `canonicalStatus`, `impactFor`, `ReadinessCommand` | Technical details | Boundary, skew, stale-proof, responsive tests |
| Exact-scope repair plan | `ReadinessProjectionService.plan` | `readiness.repair` | Scope, dependency, partial-repair, external-action tests |
| Grouped Human Proof | `H2AControlPlaneHost.execute` | `readiness.repair`, `human-proof.complete` | Duplicate, exact-purpose, at-most-once, click-budget tests |
| Persisted replacements | `repairCanonicalCommand`, `repairCredentialExactScope` | `control-plane:execute` | Organization immutability and restart tests |
| Provider/approval pause | Provider and approval prerequisites | `readiness.remediation.open` | External-action tests |
| Revoked peer replacement | Federation peer readiness and existing signed pairing services | `readiness.remediation.open` | Revoked immutability, federation regression, operator pairing check |
| Automatic refresh | Host continuation and snapshot subscription | No refresh command | Host auto-refresh and Electron renderer checks |
| Office/Control parity | Shared `OperatorReadinessState` in the control-plane snapshot | Office/Control switch | Electron parity screenshots and test |
| Governance and release integrity | Control registry, Phase 45 baseline, release manifest | 142 registered controls | Registry, baseline, production surface, assets, signed inventory |

No renderer-owned completion, generated success record, modified expiry, fabricated provider output, broadened authority, automated provider login, or automated independent approval is used for acceptance.
