import { describe, expect, it } from 'vitest';
import { humanEscalationStateSchema, type ApprovalRequestV2 } from '@h2a/contracts';
import { reconcileHumanEscalationState } from '@h2a/agents';

const originalEffect = `sha256:${'1'.repeat(64)}`;
const rejectionEffect = `sha256:${'2'.repeat(64)}`;
const outputHash = `sha256:${'3'.repeat(64)}`;

describe('Phase 28 rejection recovery', () => {
  it('preserves an expired rejection request while reopening only the disposable rejection step', () => {
    const next = reconcileHumanEscalationState(state(), [request('approval_primary', 'expired', originalEffect), request('approval_rejection', 'expired', rejectionEffect)], '2026-08-31T15:30:00.000Z');

    expect(next).toMatchObject({
      status: 'completed',
      approval_request_id: 'approval_primary',
      rejection_request_id: null,
      requested_effect_hash: originalEffect,
      run_id: 'run_primary',
      output_hash: outputHash
    });
  });

  it('closes Phase 28 only when the separate rejection request is durably rejected', () => {
    const next = reconcileHumanEscalationState(state(), [request('approval_primary', 'expired', originalEffect), request('approval_rejection', 'rejected', rejectionEffect)], '2026-08-31T15:30:00.000Z');

    expect(next.status).toBe('completed-with-rejection');
    expect(next.rejection_request_id).toBe('approval_rejection');
    expect(next.output_hash).toBe(outputHash);
  });
});

function state() {
  return humanEscalationStateSchema.parse({
    schema_version: 1,
    ceremony_id: 'ceremony_phase28', trace_id: 'phase22_trace', status: 'rejection-pending',
    requester_human_id: 'human_operator', requester_membership_id: 'membership_operator',
    approver_human_id: 'human_admin', approver_membership_id: 'membership_admin',
    policy_id: 'policy_phase28', assignment_id: 'assignment_phase28', agent_id: 'agent_claude',
    passport_id: 'passport_claude', binding_id: 'binding_claude', runtime_session_id: 'session_claude',
    parent_mandate_id: 'mandate_claude', review_context_grant_id: 'grant_review',
    requested_effect_hash: rejectionEffect, approval_request_id: 'approval_primary',
    run_id: 'run_primary', output_hash: outputHash, rejection_request_id: 'approval_rejection',
    completed_idempotency_keys: ['configure_phase28'], last_error: null, updated_at: '2026-08-31T15:20:00.000Z'
  });
}

function request(id: string, status: ApprovalRequestV2['status'], effect: string): ApprovalRequestV2 {
  return {
    schema_version: 2,
    approval_request_id: id,
    organization_id: 'org_hp_demo',
    task_id: 'assignment_phase28',
    requesting_human_id: 'human_operator',
    requesting_agent_id: 'binding_claude',
    mandate_id: 'mandate_claude',
    required_resource: 'hp.evidence-ledger',
    required_action: 'findings.publish',
    requested_effect_hash: effect,
    review_context_grant_id: 'grant_review',
    approval_policy_id: 'policy_phase28',
    eligible_membership_ids: ['membership_admin'],
    status,
    requested_at: '2026-08-31T15:00:00.000Z',
    expires_at: '2026-08-31T15:10:00.000Z'
  };
}
