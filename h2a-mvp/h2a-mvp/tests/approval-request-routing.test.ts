import { describe, expect, it } from 'vitest';
import type { ApprovalPolicy, OrganizationAuthorityState } from '@h2a/contracts';
import { previewApprovalRoute, resolveApprovalRequestDefaults } from '../apps/desktop/renderer/src/features/authority/approvalRequestRouting';

describe('approval request routing preview', () => {
  it('defaults the requester to the operator and resolves policy fields', () => {
    const { organization, policy } = fixture();
    expect(resolveApprovalRequestDefaults(organization, policy)).toEqual({
      requesterMembershipId: 'membership_operator',
      resource: 'hp.evidence-ledger',
      action: 'findings.publish',
      approvalPower: 'findings.publish.approve'
    });
  });

  it('previews the same separation-of-duty and policy-bound credential requirements as the domain service', () => {
    const { organization, policy } = fixture();
    expect(previewApprovalRoute(organization, policy, 'membership_operator', 'hp.evidence-ledger', 'findings.publish', 'findings.publish.approve', Date.parse('2026-09-01T10:00:00.000Z'))).toMatchObject({ eligibleMembershipIds: ['membership_admin'], quorum: 1, ready: true });
    expect(previewApprovalRoute(organization, policy, 'membership_admin', 'hp.evidence-ledger', 'findings.publish', 'findings.publish.approve', Date.parse('2026-09-01T10:00:00.000Z')).ready).toBe(false);
    organization.credentials[0]!.expires_at = '2026-09-01T09:00:00.000Z';
    expect(previewApprovalRoute(organization, policy, 'membership_operator', 'hp.evidence-ledger', 'findings.publish', 'findings.publish.approve', Date.parse('2026-09-01T10:00:00.000Z')).ready).toBe(false);
  });
});

function fixture(): { organization: OrganizationAuthorityState; policy: ApprovalPolicy } {
  const policy = { schema_version: 2, approval_policy_id: 'policy_phase28_findings_publish', organization_id: 'org_hp_demo', name: 'Restricted findings publication', eligible_role_ids: ['role_phase28_findings_approver'], quorum: 1, separation_of_duty: true, risk_tiers: ['restricted'], proof_purpose: 'approve restricted findings publication', decision_ttl_seconds: 600, status: 'active', updated_at: '2026-09-01T09:00:00.000Z' } as ApprovalPolicy;
  const organization = {
    organizations: [{ schema_version: 2, organization_id: 'org_hp_demo', name: 'HP Demo', policy_version: '1', signing_root_key_id: 'root', status: 'active', created_at: '2026-09-01T09:00:00.000Z', updated_at: '2026-09-01T09:00:00.000Z' }],
    memberships: [
      { schema_version: 2, organization_id: 'org_hp_demo', membership_id: 'membership_admin', human_id: 'human_admin', employee_id: 'H2A-ADMIN-01', department: 'Security', role_ids: ['role_authority_admin', 'role_phase28_findings_approver'], status: 'active', effective_from: '2026-09-01T09:00:00.000Z', updated_at: '2026-09-01T09:00:00.000Z' },
      { schema_version: 2, organization_id: 'org_hp_demo', membership_id: 'membership_operator', human_id: 'human_operator', employee_id: 'H2A-OPERATOR-01', department: 'Operations', role_ids: ['role_h2a_operator'], status: 'active', effective_from: '2026-09-01T09:00:00.000Z', updated_at: '2026-09-01T09:00:00.000Z' }
    ],
    roles: [{ schema_version: 2, organization_id: 'org_hp_demo', role_id: 'role_phase28_findings_approver', name: 'Findings Publication Approver', description: 'Approves findings.', authority_scopes: [{ resource: 'hp.evidence-ledger', actions: ['findings.publish'] }], approval_powers: ['findings.publish.approve'], status: 'active', updated_at: '2026-09-01T09:00:00.000Z' }],
    credentials: [{ schema_version: 2, credential_id: 'credential_admin', organization_id: 'org_hp_demo', membership_id: 'membership_admin', role_ids: ['role_phase28_findings_approver'], resource_constraints: [], action_constraints: [], approval_policy_ids: [policy.approval_policy_id], issued_at: '2026-09-01T09:00:00.000Z', expires_at: '2026-09-01T12:00:00.000Z', status: 'active', canonical_hash: `sha256:${'1'.repeat(64)}`, organization_signature: 'ed25519:test' }],
    decisions: [], assurance: []
  } as OrganizationAuthorityState;
  return { organization, policy };
}
