# Phase 45 Traceability Matrix

| Requirement | Contract or service | Control or source | Evidence | Automated test |
| --- | --- | --- | --- | --- |
| Complete command inventory | Baseline generator | `CONTROL_REGISTRY.json` | `operator-journey-baseline.json` | `operator-journey-baseline-phase45.test.ts` |
| Current command and route counts | Click measurement rules | Ordered baseline sequences | `operator-journey-baseline.json` | `operator-journey-baseline-phase45.test.ts` |
| Frozen click budgets | `clickBudgetMeasurementSchema` | Plan 5 journey controls | Phase 45 baseline doc | `operator-journey-contracts-phase45.test.ts` |
| Explicit workflow dependencies | `guidedWorkflowDependencyEdgeSchema` | Guided workflow projection | Existing canonical workflow state | `guided-workflow-dependencies-phase45.test.ts` |
| Parallel, serial, cyclic, missing, and denied graphs | `analyzeDependencyGraph` | Read-only planning model | Test receipts | `guided-workflow-dependencies-phase45.test.ts` |
| Operator readiness | `operatorReadinessSchema` | Future readiness strip | Schema test | `operator-journey-contracts-phase45.test.ts` |
| Exact-scope repair | `repairPlanSchema` | Future repair dialog | Schema test | `operator-journey-contracts-phase45.test.ts` |
| Minimized discovery | `nodeDiscoverySnapshotSchema` | Future coworker dialog | Baseline non-claims | `operator-journey-contracts-phase45.test.ts` |
| Mutual pairing | `federationPairingSchema` | Future pairing confirmation | Schema test | `operator-journey-contracts-phase45.test.ts` |
| Goal and work graph | `collaborativeGoalSchema`, `workGraphSchema` | Future task composer | Schema test | `operator-journey-contracts-phase45.test.ts` |
| Durable execution | `workflowExecutionSchema` | Future Office workflow drawer | Schema test | `operator-journey-contracts-phase45.test.ts` |
| Demonstration conductor | `demonstrationConductorSchema` | Future conductor panel | Schema test | `operator-journey-contracts-phase45.test.ts` |
| Original reason codes preserved | `remediationForReasonCode` | Future remediation notice | Projection test | `guided-workflow-dependencies-phase45.test.ts` |
| Privacy-minimized telemetry | `operatorActionTelemetrySchema` | No network transport | Strict-schema negative test | `operator-journey-contracts-phase45.test.ts` |
| No current behavior change | `OperatorJourneyProjectionService` | Existing Office and Control | Canonical ID/blocker comparison | `guided-workflow-dependencies-phase45.test.ts` |
| Carried release controls | Existing Phase 42/43 checks | Production renderer | Signed release inventory | `test:phase45` |

