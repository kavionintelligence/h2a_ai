import type { OrganizationAuthorityState } from '@h2a/contracts';

export function resolveLeastContextActor(state: OrganizationAuthorityState) {
  for (const proof of state.assurance) {
    const credential = state.credentials.find((item) => {
      if (item.membership_id !== proof.membership_id || item.status !== 'active') return false;
      const roles = item.role_ids.map((roleId) => state.roles.find((role) => role.role_id === roleId && role.status === 'active')).filter((role) => Boolean(role));
      const allows = (resource: string, action: string) => roles.some((role) => role?.authority_scopes.some((scope) => (scope.resource === resource || scope.resource === '*') && scope.actions.some((allowed) => allowed === action || allowed === '*')));
      return allows('context-artifact', 'create') && allows('context-grant', 'issue') && roles.some((role) => role?.approval_powers.includes('context.grant.issue'));
    });
    if (credential) return { membership_id: proof.membership_id, human_proof_id: proof.human_proof_id, authority_credential_id: credential.credential_id };
  }
  return undefined;
}
