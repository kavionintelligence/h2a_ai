import type { ApprovalPolicy, OrganizationAuthorityState } from '@h2a/contracts';

export interface ApprovalRequestDefaults {
  requesterMembershipId: string;
  resource: string;
  action: string;
  approvalPower: string;
}

export interface ApprovalRoutePreview {
  eligibleMembershipIds: string[];
  quorum: number;
  ready: boolean;
}

export function resolveApprovalRequestDefaults(
  organization: OrganizationAuthorityState,
  policy: ApprovalPolicy | undefined
): ApprovalRequestDefaults {
  const eligibleRoles = new Set(policy?.eligible_role_ids ?? []);
  const activeMemberships = organization.memberships.filter((item) => item.status === 'active');
  const requester = activeMemberships.find((item) => item.role_ids.every((roleId) => !eligibleRoles.has(roleId))) ?? activeMemberships[0];
  const role = organization.roles.find((item) => item.status === 'active' && policy?.eligible_role_ids.includes(item.role_id));
  const scope = role?.authority_scopes[0];
  return {
    requesterMembershipId: requester?.membership_id ?? '',
    resource: scope?.resource ?? 'restricted-records',
    action: scope?.actions[0] ?? 'read',
    approvalPower: role?.approval_powers[0] ?? 'restricted.read.approve'
  };
}

export function previewApprovalRoute(
  organization: OrganizationAuthorityState,
  policy: ApprovalPolicy | undefined,
  requesterMembershipId: string,
  resource: string,
  action: string,
  approvalPower: string,
  now = Date.now()
): ApprovalRoutePreview {
  if (!policy) return { eligibleMembershipIds: [], quorum: 0, ready: false };
  const eligibleMembershipIds = organization.memberships.filter((member) => {
    if (member.organization_id !== policy.organization_id || member.status !== 'active') return false;
    if (policy.separation_of_duty && member.membership_id === requesterMembershipId) return false;
    const roleIds = member.role_ids.filter((roleId) => policy.eligible_role_ids.includes(roleId));
    const roleAllows = organization.roles.some((role) =>
      roleIds.includes(role.role_id) &&
      role.status === 'active' &&
      role.approval_powers.includes(approvalPower) &&
      role.authority_scopes.some((scope) =>
        matches(scope.resource, resource) && scope.actions.some((allowedAction) => matches(allowedAction, action))
      )
    );
    if (!roleAllows) return false;
    return organization.credentials.some((credential) =>
      credential.membership_id === member.membership_id &&
      credential.organization_id === policy.organization_id &&
      credential.status === 'active' &&
      new Date(credential.expires_at).getTime() > now &&
      credential.approval_policy_ids.includes(policy.approval_policy_id) &&
      credential.role_ids.some((roleId) => roleIds.includes(roleId)) &&
      (!credential.resource_constraints.length || credential.resource_constraints.some((value) => matches(value, resource))) &&
      (!credential.action_constraints.length || credential.action_constraints.some((value) => matches(value, action)))
    );
  }).map((member) => member.membership_id);
  return { eligibleMembershipIds, quorum: policy.quorum, ready: eligibleMembershipIds.length >= policy.quorum };
}

function matches(pattern: string, value: string): boolean {
  return pattern === '*' || pattern === value || (pattern.endsWith('.*') && value.startsWith(pattern.slice(0, -1)));
}
