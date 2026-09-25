import { describe, expect, it } from 'vitest';
import type { HumanEscalationState, OrganizationAuthorityState } from '@h2a/contracts';
import { ADMINISTRATOR_RECOVERY_PURPOSE, resolvePhase28AuthorityRecovery } from '../apps/desktop/renderer/src/features/authority/phase28AuthorityRecovery';

describe('Phase 28 authority recovery', () => {
  it('requires proof and preserves the expired policy-bound credential as the replacement template', () => {
    const state = fixture();
    const before = resolvePhase28AuthorityRecovery(state.organization, state.escalation, Date.parse('2026-08-31T16:30:00.000Z'));
    expect(before.activeCredential).toBeUndefined();
    expect(before.expiredCredential?.credential_id).toBe('credential_phase28_expired');
    expect(before.recoveryProof).toBeUndefined();

    state.organization.assurance.push({ membership_id: 'membership_admin', human_id: 'human_admin', human_proof_id: 'proof_recovery', purpose: ADMINISTRATOR_RECOVERY_PURPOSE, expires_at: '2026-08-31T16:35:00.000Z' });
    const verified = resolvePhase28AuthorityRecovery(state.organization, state.escalation, Date.parse('2026-08-31T16:30:00.000Z'));
    expect(verified.recoveryProof?.human_proof_id).toBe('proof_recovery');
    expect(verified.expiredCredential).toMatchObject({ role_ids: ['role_authority_admin', 'role_phase28_findings_approver'], approval_policy_ids: ['policy_phase28_findings_publish'], resource_constraints: ['hp.evidence-ledger'], action_constraints: ['findings.publish'] });
  });

  it('recognizes only a live policy-bound replacement as quorum-ready', () => {
    const state = fixture();
    state.organization.credentials.push({ ...state.organization.credentials[0]!, credential_id: 'credential_phase28_live', status: 'active', issued_at: '2026-08-31T16:25:00.000Z', expires_at: '2026-08-31T18:25:00.000Z' });
    expect(resolvePhase28AuthorityRecovery(state.organization, state.escalation, Date.parse('2026-08-31T16:30:00.000Z')).activeCredential?.credential_id).toBe('credential_phase28_live');
  });
});

function fixture(): { organization: OrganizationAuthorityState; escalation: HumanEscalationState } {
  const organization = {
    organizations: [{ schema_version: 2, organization_id: 'org_hp_demo', name: 'HP Demo', policy_version: '1', signing_root_key_id: 'root-key', status: 'active', created_at: '2026-08-31T12:00:00.000Z', updated_at: '2026-08-31T12:00:00.000Z' }],
    memberships: [{ schema_version: 2, organization_id: 'org_hp_demo', membership_id: 'membership_admin', human_id: 'human_admin', employee_id: 'H2A-ADMIN-01', department: 'Security', role_ids: ['role_authority_admin', 'role_phase28_findings_approver'], status: 'active', effective_from: '2026-08-31T12:00:00.000Z', updated_at: '2026-08-31T12:00:00.000Z' }],
    roles: [],
    credentials: [{ schema_version: 2, credential_id: 'credential_phase28_expired', organization_id: 'org_hp_demo', membership_id: 'membership_admin', role_ids: ['role_authority_admin', 'role_phase28_findings_approver'], resource_constraints: ['hp.evidence-ledger'], action_constraints: ['findings.publish'], approval_policy_ids: ['policy_phase28_findings_publish'], issued_at: '2026-08-31T13:00:00.000Z', expires_at: '2026-08-31T15:00:00.000Z', status: 'expired', canonical_hash: `sha256:${'1'.repeat(64)}`, organization_signature: 'ed25519:test' }],
    decisions: [], assurance: []
  } as OrganizationAuthorityState;
  const escalation = { schema_version: 1, ceremony_id: 'ceremony', trace_id: 'phase22_trace', status: 'completed', requester_human_id: 'human_operator', requester_membership_id: 'membership_operator', approver_human_id: 'human_admin', approver_membership_id: 'membership_admin', policy_id: 'policy_phase28_findings_publish', assignment_id: 'assignment', agent_id: 'agent', passport_id: 'passport', binding_id: 'binding', runtime_session_id: 'session', parent_mandate_id: 'mandate', review_context_grant_id: 'grant', requested_effect_hash: `sha256:${'2'.repeat(64)}`, approval_request_id: 'approval', run_id: 'run', output_hash: `sha256:${'3'.repeat(64)}`, rejection_request_id: null, completed_idempotency_keys: [], last_error: null, updated_at: '2026-08-31T16:00:00.000Z' } as HumanEscalationState;
  return { organization, escalation };
}
