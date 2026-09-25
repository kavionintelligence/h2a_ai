import type { HumanEscalationState, OrganizationAuthorityState } from '@h2a/contracts';

export const PHASE28_POLICY_ID = 'policy_phase28_findings_publish';
export const PHASE28_ROLE_ID = 'role_phase28_findings_approver';
export const ADMINISTRATOR_RECOVERY_PURPOSE = 'administer trusted federation peers';

export interface Phase28AuthorityRecovery {
  membership: OrganizationAuthorityState['memberships'][number] | undefined;
  activeCredential: OrganizationAuthorityState['credentials'][number] | undefined;
  expiredCredential: OrganizationAuthorityState['credentials'][number] | undefined;
  administratorCredential: OrganizationAuthorityState['credentials'][number] | undefined;
  recoveryProof: OrganizationAuthorityState['assurance'][number] | undefined;
}

export function resolvePhase28AuthorityRecovery(
  organization: OrganizationAuthorityState,
  escalation: HumanEscalationState | undefined,
  now = Date.now()
): Phase28AuthorityRecovery {
  const membership = organization.memberships.find((item) =>
    item.membership_id === escalation?.approver_membership_id &&
    item.status === 'active' &&
    item.role_ids.includes('role_authority_admin') &&
    item.role_ids.includes(PHASE28_ROLE_ID)
  );
  const credentials = organization.credentials.filter((item) => item.membership_id === membership?.membership_id);
  const active = (credential: typeof credentials[number]) => credential.status === 'active' && new Date(credential.expires_at).getTime() > now;
  const activeCredential = credentials.find((item) => active(item) && item.role_ids.includes(PHASE28_ROLE_ID) && item.approval_policy_ids.includes(PHASE28_POLICY_ID));
  const expiredCredential = [...credentials].reverse().find((item) =>
    item.role_ids.includes(PHASE28_ROLE_ID) &&
    item.approval_policy_ids.includes(PHASE28_POLICY_ID) &&
    (item.status === 'expired' || new Date(item.expires_at).getTime() <= now)
  );
  const administratorCredential = credentials.find((item) => active(item) && item.role_ids.includes('role_authority_admin'));
  const recoveryProof = [...organization.assurance].sort((left, right) => right.expires_at.localeCompare(left.expires_at)).find((item) =>
    item.membership_id === membership?.membership_id &&
    item.human_id === membership?.human_id &&
    item.purpose === ADMINISTRATOR_RECOVERY_PURPOSE &&
    new Date(item.expires_at).getTime() > now
  );
  return { membership, activeCredential, expiredCredential, administratorCredential, recoveryProof };
}
