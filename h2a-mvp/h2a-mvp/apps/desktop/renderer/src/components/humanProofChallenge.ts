import type { GuidedBootstrapState, OrganizationAuthorityState } from '@h2a/contracts';

export interface HumanProofSubject {
  humanId: string;
  displayName: string;
  employeeId: string | null;
  organizationName: string | null;
  department: string | null;
  roleNames: string[];
  enrollmentRequired: boolean;
}

export function resolveHumanProofSubject(
  humanId: string,
  bootstrap: GuidedBootstrapState,
  organization: OrganizationAuthorityState
): HumanProofSubject {
  const enrolled = bootstrap.humans.find((human) => human.human_id === humanId);
  const membership = organization.memberships.find((item) => item.human_id === humanId && item.status === 'active')
    ?? organization.memberships.find((item) => item.human_id === humanId);
  const company = organization.organizations.find((item) => item.organization_id === membership?.organization_id)
    ?? organization.organizations[0];
  const roleNames = (membership?.role_ids ?? []).map((roleId) =>
    organization.roles.find((role) => role.role_id === roleId)?.name ?? roleId);
  return {
    humanId,
    displayName: enrolled?.display_name ?? humanId,
    employeeId: membership?.employee_id ?? null,
    organizationName: company?.name ?? null,
    department: membership?.department ?? null,
    roleNames,
    enrollmentRequired: !enrolled
  };
}

export function challengeFailureMessage(error: unknown, displayName: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('HUMAN_PROOF_CHALLENGE_EXPIRED')) return `This verification challenge expired. Start the protected command again for ${displayName}.`;
  if (message.includes('HUMAN_PROOF_STALE')) return `The proof predates this challenge. Verify ${displayName} again for the displayed purpose.`;
  if (message.includes('HUMAN_PROOF_BINDING_MISMATCH')) return `The proof does not match ${displayName} and this exact purpose. No command was continued.`;
  if (message.includes('HUMAN_PROOF_SOURCE_BINDING_MISMATCH')) return 'The protected command changed while verification was open. Return to the command and start a new challenge.';
  if (message.includes('CONTROL_PLANE_DISCONNECTED_READ_ONLY')) return 'The control plane disconnected before proof completion. Reconnect and retry; no protected command was continued.';
  return message;
}

export function remainingChallengeSeconds(expiresAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1_000));
}
