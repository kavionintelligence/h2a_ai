import { describe, expect, it } from 'vitest';
import type { AuthorityApprovalState, OrganizationAuthorityState } from '@h2a/contracts';
import { resolvePhase28ApprovalFlow } from '../apps/desktop/renderer/src/features/authority/phase28ApprovalFlow';

describe('Phase 28 approval flow synchronization', () => {
  it('moves an expired selection to the newest pending request and preselects the sole independent approver', () => {
    const { approvals, organization } = fixture();
    const flow = resolvePhase28ApprovalFlow(approvals, organization, 'request_expired', '', Date.parse('2026-08-31T17:35:00.000Z'));
    expect(flow.request?.approval_request_id).toBe('request_pending');
    expect(flow.approverMembership?.membership_id).toBe('membership_admin');
    expect(flow.proof?.human_proof_id).toBe('proof_approval');
    expect(flow.credential?.credential_id).toBe('credential_policy_bound');
  });

  it('does not treat expired proof or authority as decision-ready', () => {
    const { approvals, organization } = fixture();
    const flow = resolvePhase28ApprovalFlow(approvals, organization, 'request_pending', 'membership_admin', Date.parse('2026-08-31T19:10:00.000Z'));
    expect(flow.request?.approval_request_id).toBe('request_pending');
    expect(flow.proof).toBeUndefined();
    expect(flow.credential).toBeUndefined();
  });
});

function fixture(): { approvals: AuthorityApprovalState; organization: OrganizationAuthorityState } {
  const approvals = {
    policies: [{ approval_policy_id: 'policy_phase28_findings_publish', status: 'active', proof_purpose: 'approve restricted findings publication' }],
    requests: [
      { approval_request_id: 'request_expired', approval_policy_id: 'policy_phase28_findings_publish', eligible_membership_ids: ['membership_admin'], status: 'expired', requested_at: '2026-08-31T17:10:00.000Z', expires_at: '2026-08-31T17:20:00.000Z' },
      { approval_request_id: 'request_pending', approval_policy_id: 'policy_phase28_findings_publish', eligible_membership_ids: ['membership_admin'], status: 'pending', requested_at: '2026-08-31T17:29:00.000Z', expires_at: '2026-08-31T17:39:00.000Z' }
    ],
    request_contexts: [], decisions: [], extensions: [], resumes: []
  } as unknown as AuthorityApprovalState;
  const organization = {
    organizations: [], roles: [], decisions: [],
    memberships: [{ membership_id: 'membership_admin', human_id: 'human_admin', employee_id: 'H2A-ADMIN-01', status: 'active' }],
    assurance: [{ membership_id: 'membership_admin', human_id: 'human_admin', human_proof_id: 'proof_approval', purpose: 'approve restricted findings publication', expires_at: '2026-08-31T17:40:00.000Z' }],
    credentials: [{ credential_id: 'credential_policy_bound', membership_id: 'membership_admin', status: 'active', approval_policy_ids: ['policy_phase28_findings_publish'], expires_at: '2026-08-31T19:00:00.000Z' }]
  } as unknown as OrganizationAuthorityState;
  return { approvals, organization };
}
