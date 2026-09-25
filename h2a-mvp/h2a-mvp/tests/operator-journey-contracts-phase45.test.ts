import { describe, expect, it } from 'vitest';
import {
  clickBudgetMeasurementSchema,
  collaborativeGoalSchema,
  demonstrationConductorSchema,
  federationPairingSchema,
  nodeDiscoverySnapshotSchema,
  operatorReadinessSchema,
  repairPlanSchema,
  workflowExecutionSchema,
  workGraphSchema
} from '@h2a/contracts';

const now = '2026-09-01T15:30:00.000Z';
const later = '2026-09-01T16:30:00.000Z';
const hash = `sha256:${'a'.repeat(64)}`;
const emptyScope = { resources: [], actions: [], fields: [], paths: [], commands: [], capabilities: [], duration_seconds: null, quorum: null, policy_bindings: [] };

describe('Phase 45 simplified operator contracts', () => {
  it('round-trips every frozen Plan 5 contract without changing canonical references', () => {
    const readiness = operatorReadinessSchema.parse({
      schema_version: 2, readiness_id: 'readiness_1', subject_id: 'assignment_1', command_id: 'task.run', command_label: 'Run task', status: 'ready', repair_plan_id: null,
      prerequisites: [{ prerequisite_id: 'prereq_mandate', kind: 'mandate', canonical_reference_id: 'mandate_1', replacement_for_id: null, bound_human_id: null, status: 'ready', expires_at: later, expires_in_seconds: 3600, reason_code: 'MANDATE_ACTIVE', impact: 'Mandate is current.', scope: emptyScope, scope_hash: hash, affected_control_ids: ['task.run'], evidence_refs: ['event_1'], source_route: 'command-floor', remediation: { kind: 'none', label: 'No action required', route: null } }],
      trust_ceiling: 'connected-observed', evaluated_at: now, generation_hash: hash
    });
    expect(operatorReadinessSchema.parse(JSON.parse(JSON.stringify(readiness)))).toEqual(readiness);

    const repair = repairPlanSchema.parse({
      schema_version: 2, repair_plan_id: 'repair_1', readiness_id: readiness.readiness_id, readiness_generation_hash: hash, command_id: readiness.command_id, status: 'operator-required',
      operations: [{ operation_id: 'operation_1', kind: 'replace-mandate', target_reference_id: 'mandate_1', replacement_reference_id: null, replacement_for_id: null, exact_scope: emptyScope, exact_scope_hash: hash, proof_human_id: 'human_1', proof_purpose: 'administer governed task authority', dependency_ids: [], status: 'operator-required', reason_code: 'MANDATE_EXPIRED', impact: 'Task is blocked.', evidence_refs: [] }],
      grouped_proof_purposes: [{ human_id: 'human_1', purpose: 'administer governed task authority', operation_ids: ['operation_1'] }], created_at: now, updated_at: now, completed_at: null
    });
    expect(repairPlanSchema.parse(JSON.parse(JSON.stringify(repair)))).toEqual(repair);

    const discovery = nodeDiscoverySnapshotSchema.parse({
      schema_version: 1, mode: 'same-host', availability: 'available', telemetry: 'disabled', generated_at: now,
      nodes: [{ discovery_id: 'discovery_1', mode: 'same-host', node_id: 'node_2', organization_id: 'org_1', display_name: 'Finance node', endpoint_policy: 'loopback-only', capabilities: ['task.receive', 'ack'], key_fingerprint: hash, pairing_code_hint: 'A17K', advertised_fields: ['node_id', 'organization_id', 'display_name', 'key_fingerprint', 'expires_at'], discovered_at: now, expires_at: later, trust_status: 'unconfirmed' }]
    });
    expect(nodeDiscoverySnapshotSchema.parse(JSON.parse(JSON.stringify(discovery)))).toEqual(discovery);

    const pairing = federationPairingSchema.parse({
      schema_version: 1, pairing_id: 'pairing_1', discovery_id: 'discovery_1', local_node_id: 'node_1', remote_node_id: 'node_2', local_organization_id: 'org_1', remote_organization_id: 'org_1', requested_capabilities: ['task.receive', 'ack'], maximum_context_fields: 3, status: 'comparison-required', local_proof_id: 'proof_1', remote_proof_id: 'proof_2', comparison_code: '314159', transcript_hash: hash, local_confirmed_at: null, remote_confirmed_at: null, invitation_id: 'invitation_1', registration_id: 'registration_1', acceptance_id: null, local_peer_id: null, remote_peer_id: null, reason_code: null, evidence_refs: [], expires_at: later, updated_at: now, trust_ceiling: 'connected-observed'
    });
    expect(federationPairingSchema.parse(JSON.parse(JSON.stringify(pairing)))).toEqual(pairing);

    const goal = collaborativeGoalSchema.parse({ schema_version: 1, goal_id: 'goal_1', organization_id: 'org_1', project_id: 'project_1', title: 'Prepare control review', objective: 'Produce a bounded control review.', outcome: 'A reviewed control report.', constraints: [], deadline: null, sensitivity: 'internal', expected_outputs: ['review.md'], created_by_human_id: 'human_1', trace_id: 'trace_1', status: 'planned', created_at: now, updated_at: now });
    expect(collaborativeGoalSchema.parse(JSON.parse(JSON.stringify(goal)))).toEqual(goal);

    const graph = workGraphSchema.parse(workGraph());
    expect(workGraphSchema.parse(JSON.parse(JSON.stringify(graph)))).toEqual(graph);

    const execution = workflowExecutionSchema.parse({ schema_version: 1, execution_id: 'execution_1', graph_id: graph.graph_id, goal_id: graph.goal_id, trace_id: graph.trace_id, status: 'ready', pause_reason_code: null, active_node_ids: [], attempts: [], cancellation_requested_by: null, evidence_refs: [], started_at: null, updated_at: now, completed_at: null, trust_ceiling: 'connected-observed' });
    expect(workflowExecutionSchema.parse(JSON.parse(JSON.stringify(execution)))).toEqual(execution);

    const conductor = demonstrationConductorSchema.parse({ schema_version: 1, conductor_id: 'conductor_1', ceremony_id: 'ceremony_1', trace_id: 'trace_1', status: 'paused', active_step_id: 'human_step', steps: [{ step_id: 'human_step', journey_id: 'set-up-people', title: 'Verify employee', status: 'paused', dependency_ids: [], safe_automation: false, pause_kind: 'human-proof', reason_code: 'FRESH_HUMAN_PROOF_REQUIRED', evidence_refs: [], attempts: 0 }], canonical_cursor: 7, created_at: now, updated_at: now, completed_at: null, trust_ceiling: 'connected-observed' });
    expect(demonstrationConductorSchema.parse(JSON.parse(JSON.stringify(conductor)))).toEqual(conductor);
  });

  it('rejects inconsistent readiness, repair, pairing, graph, and conductor success states', () => {
    expect(() => operatorReadinessSchema.parse({ schema_version: 2, readiness_id: 'r', subject_id: 's', command_id: 'c', command_label: 'Command', status: 'ready', prerequisites: [{ prerequisite_id: 'p', kind: 'mandate', canonical_reference_id: 'm', replacement_for_id: null, bound_human_id: null, status: 'expired', expires_at: now, expires_in_seconds: -1, reason_code: 'MANDATE_EXPIRED', impact: 'Blocked.', scope: emptyScope, scope_hash: hash, affected_control_ids: ['c'], evidence_refs: [], source_route: 'mandates', remediation: { kind: 'automatic-after-proof', label: 'Repair', route: 'mandates' } }], repair_plan_id: null, trust_ceiling: 'connected-observed', evaluated_at: now, generation_hash: hash })).toThrow('Ready commands cannot contain');
    expect(() => repairPlanSchema.parse({ schema_version: 2, repair_plan_id: 'r', readiness_id: 'ready', readiness_generation_hash: hash, command_id: 'c', status: 'operator-required', operations: [{ operation_id: 'op', kind: 'replace-mandate', target_reference_id: 'same', replacement_reference_id: 'same', replacement_for_id: 'same', exact_scope: emptyScope, exact_scope_hash: hash, proof_human_id: null, proof_purpose: 'purpose', dependency_ids: [], status: 'operator-required', reason_code: 'EXPIRED', impact: 'Blocked.', evidence_refs: [] }], grouped_proof_purposes: [], created_at: now, updated_at: now, completed_at: null })).toThrow();
    expect(() => federationPairingSchema.parse({ schema_version: 1, pairing_id: 'p', discovery_id: 'd', local_node_id: 'a', remote_node_id: 'b', local_organization_id: 'o', remote_organization_id: 'o', requested_capabilities: ['ack'], maximum_context_fields: 1, status: 'active', local_proof_id: null, remote_proof_id: null, comparison_code: null, transcript_hash: hash, local_confirmed_at: null, remote_confirmed_at: null, invitation_id: null, registration_id: null, acceptance_id: null, local_peer_id: null, remote_peer_id: null, reason_code: null, evidence_refs: [], expires_at: later, updated_at: now, trust_ceiling: 'connected-observed' })).toThrow();
    const missingGraph = workGraph();
    missingGraph.dependency_edges[0]!.successor_node_id = 'missing';
    expect(() => workGraphSchema.parse(missingGraph)).toThrow('references a missing node');
    expect(() => demonstrationConductorSchema.parse({ schema_version: 1, conductor_id: 'c', ceremony_id: 'ceremony', trace_id: 'trace', status: 'running', active_step_id: 's', steps: [{ step_id: 's', journey_id: 'j', title: 'Unsafe automation', status: 'running', dependency_ids: [], safe_automation: true, pause_kind: 'human-proof', reason_code: 'INVALID', evidence_refs: [], attempts: 1 }], canonical_cursor: 1, created_at: now, updated_at: now, completed_at: null, trust_ceiling: 'connected-observed' })).toThrow('Automated conductor steps');
  });

  it('keeps click telemetry strict, minimized, local, and free of private content fields', () => {
    const valid = { journey_id: 'connect-friend-node', session_id: 'session_1', events: [{ control_id: 'federation.connect', action_kind: 'command', occurred_at: now }], operator_commands: 1, route_changes: 0, proof_attempts: 0, manual_refreshes: 0, copied_payloads: 0, repairs: 0, measured_at: now, telemetry_storage: 'local-minimized' };
    expect(clickBudgetMeasurementSchema.parse(valid)).toEqual(valid);
    expect(clickBudgetMeasurementSchema.safeParse({ ...valid, prompt: 'private', response_body: 'private' }).success).toBe(false);
    expect(clickBudgetMeasurementSchema.safeParse({ ...valid, events: [{ ...valid.events[0], protected_value: 'private' }] }).success).toBe(false);
    expect(() => nodeDiscoverySnapshotSchema.parse({ schema_version: 1, mode: 'future-directory', availability: 'available', nodes: [], telemetry: 'disabled', generated_at: now })).toThrow('cannot be represented as available');
  });
});

function workGraph() {
  const node = (node_id: string) => ({ node_id, title: node_id, objective: `Complete ${node_id}`, human_owner_id: 'human_1', agent_id: `agent_${node_id}`, runtime_binding_id: `binding_${node_id}`, execution_target: 'local' as const, remote_peer_id: null, passport_id: `passport_${node_id}`, runtime_session_id: `session_${node_id}`, runtime_attestation_id: `attestation_${node_id}`, mandate_id: `mandate_${node_id}`, context_grant_id: null, project_assignment_id: null, workplace_assignment_id: null, worktree_lease_id: null, mailbox_route_id: null, provider: 'openai-codex' as const, allowed_context_fields: ['case_id'], withheld_context_fields: [], allowed_paths: ['src'], allowed_tools: ['read'], allowed_network_hosts: [], expected_outputs: [`${node_id}.md`], validation_commands: [], mandate_scope: emptyScope, mandate_expires_at: later, approval_policy_ids: [], replacement_for_node_id: null, status: 'draft' as const, reason_code: null, evidence_refs: [] });
  return { schema_version: 1 as const, graph_id: 'graph_1', goal_id: 'goal_1', trace_id: 'trace_1', status: 'draft' as const, nodes: [node('research'), node('implementation')], dependency_edges: [{ edge_id: 'edge_1', predecessor_node_id: 'research', successor_node_id: 'implementation', condition: 'succeeded' as const, on_unsatisfied: 'wait' as const }], approval_checkpoints: [], revision: 1, plan_hash: hash, proposed_by: 'deterministic-h2a' as const, provider_proposal_hash: null, approved_by_human_id: null, approved_human_proof_id: null, created_at: now, updated_at: now, trust_ceiling: 'connected-observed' as const };
}
