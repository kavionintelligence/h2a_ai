import type { AgentIdentityState, CollaborationState, MandateState } from '@h2a/contracts';

export interface ContextRecipientBindingInput {
  organizationId: string;
  taskId: string;
  mandateId: string;
  agentId: string;
  passportId: string;
}

export function assertContextRecipientBinding(input: ContextRecipientBindingInput, identity: AgentIdentityState, mandates: MandateState, collaboration: CollaborationState): void {
  const passport = identity.passportsV2?.find((item) => item.passport_id === input.passportId && item.agent_id === input.agentId && item.organization_id === input.organizationId && item.status === 'active');
  if (!passport) throw new Error('Context recipient requires an active organization-bound Agent Passport V2.');
  const mandate = mandates.mandates.find((item) => item.mandateId === input.mandateId && item.subject.agentId === input.agentId && item.subject.passportId === input.passportId && item.status === 'active');
  if (!mandate) throw new Error('Context recipient mandate is inactive or bound to a different agent.');
  const binding = identity.bindings.find((item) => item.agent_id === input.agentId && item.connection_state === 'connected');
  if (!binding) throw new Error('Context recipient requires an active runtime binding for the passport agent.');
  const assignment = collaboration.workplace.assignments.find((item) => item.id === input.taskId && item.assigneeId === binding.binding_id && item.mandateId === input.mandateId);
  if (!assignment) throw new Error('Context Grant task is not assigned to the recipient runtime and mandate.');
}
