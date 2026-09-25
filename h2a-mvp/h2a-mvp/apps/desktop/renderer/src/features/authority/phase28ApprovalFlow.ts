import type { AuthorityApprovalState, OrganizationAuthorityState } from '@h2a/contracts';

type ApprovalRequest = AuthorityApprovalState['requests'][number];
type ApprovalPolicy = AuthorityApprovalState['policies'][number];
type Membership = OrganizationAuthorityState['memberships'][number];
type Assurance = OrganizationAuthorityState['assurance'][number];
type Credential = OrganizationAuthorityState['credentials'][number];

export interface Phase28ApprovalFlow {
  request: ApprovalRequest | undefined;
  policy: ApprovalPolicy | undefined;
  eligibleMemberships: Membership[];
  approverMembership: Membership | undefined;
  proof: Assurance | undefined;
  credential: Credential | undefined;
}

export function resolvePhase28ApprovalFlow(
  approvals: AuthorityApprovalState,
  organization: OrganizationAuthorityState,
  selectedRequestId: string,
  selectedApproverMembershipId: string,
  now = Date.now()
): Phase28ApprovalFlow {
  const activePending = approvals.requests
    .filter((item) => item.status === 'pending' && new Date(item.expires_at).getTime() > now)
    .sort((left, right) => right.requested_at.localeCompare(left.requested_at));
  const requested = approvals.requests.find((item) => item.approval_request_id === selectedRequestId);
  const request = requested?.status === 'pending' && new Date(requested.expires_at).getTime() > now
    ? requested
    : activePending[0] ?? requested ?? approvals.requests.at(-1);
  const policy = approvals.policies.find((item) => item.approval_policy_id === request?.approval_policy_id && item.status === 'active');
  const eligibleMemberships = organization.memberships.filter((item) =>
    item.status === 'active' && request?.eligible_membership_ids.includes(item.membership_id)
  );
  const requestedApprover = eligibleMemberships.find((item) => item.membership_id === selectedApproverMembershipId);
  const approverMembership = requestedApprover ?? (eligibleMemberships.length === 1 ? eligibleMemberships[0] : undefined);
  const proof = organization.assurance
    .filter((item) =>
      item.membership_id === approverMembership?.membership_id &&
      item.human_id === approverMembership?.human_id &&
      item.purpose === policy?.proof_purpose &&
      new Date(item.expires_at).getTime() > now
    )
    .sort((left, right) => right.expires_at.localeCompare(left.expires_at))[0];
  const credential = organization.credentials
    .filter((item) =>
      item.membership_id === approverMembership?.membership_id &&
      item.status === 'active' &&
      new Date(item.expires_at).getTime() > now &&
      Boolean(policy && item.approval_policy_ids.includes(policy.approval_policy_id))
    )
    .sort((left, right) => right.expires_at.localeCompare(left.expires_at))[0];
  return { request, policy, eligibleMemberships, approverMembership, proof, credential };
}
