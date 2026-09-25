import type { OperatorPrerequisite, OperatorPrerequisiteStatus, OperatorReadiness } from '@h2a/contracts';

export function primaryReadinessPrerequisite(command: OperatorReadiness): OperatorPrerequisite {
  const unresolved = command.prerequisites.filter((item) => item.status !== 'ready');
  const byStatus = (statuses: OperatorPrerequisiteStatus[]) => unresolved.find((item) => statuses.includes(item.status));

  if (command.status === 'blocked') return byStatus(['revoked', 'disconnected-read-only']) ?? unresolved[0]!;
  if (command.status === 'external-action-required') return byStatus(['authentication-required', 'dependency-missing', 'approval-required']) ?? unresolved[0]!;
  if (command.status === 'operator-action-required') return unresolved.find((item) => item.remediation.kind === 'operator-action') ?? unresolved[0]!;
  if (command.status === 'partial-repair' || command.status === 'repairable') return byStatus(['expiring', 'expired']) ?? unresolved[0]!;
  return unresolved[0]!;
}
