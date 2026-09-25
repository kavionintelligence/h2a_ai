import { describe, expect, it } from 'vitest';
import type { AgentIdentityState, CollaborationState, MandateState } from '@h2a/contracts';
import { assertContextRecipientBinding } from '@h2a/resources';

describe('Phase 27 context recipient binding', () => {
  it('traverses durable passport agent to runtime binding before matching the assignment', () => {
    const identity = {
      passportsV2: [{ passport_id: 'passport_claude', agent_id: 'agent_claude', organization_id: 'org_hp_demo', status: 'active' }],
      bindings: [{ binding_id: 'runtime_claude', agent_id: 'agent_claude', connection_state: 'connected' }]
    } as AgentIdentityState;
    const mandates = { mandates: [{ mandateId: 'mandate_claude', subject: { agentId: 'agent_claude', passportId: 'passport_claude' }, status: 'active' }] } as MandateState;
    const collaboration = { workplace: { assignments: [{ id: 'assignment_claude', assigneeId: 'runtime_claude', mandateId: 'mandate_claude' }] } } as CollaborationState;

    expect(() => assertContextRecipientBinding({ organizationId: 'org_hp_demo', taskId: 'assignment_claude', mandateId: 'mandate_claude', agentId: 'agent_claude', passportId: 'passport_claude' }, identity, mandates, collaboration)).not.toThrow();
  });

  it('rejects an assignment owned by another runtime', () => {
    const identity = { passportsV2: [{ passport_id: 'passport_claude', agent_id: 'agent_claude', organization_id: 'org_hp_demo', status: 'active' }], bindings: [{ binding_id: 'runtime_claude', agent_id: 'agent_claude', connection_state: 'connected' }] } as AgentIdentityState;
    const mandates = { mandates: [{ mandateId: 'mandate_claude', subject: { agentId: 'agent_claude', passportId: 'passport_claude' }, status: 'active' }] } as MandateState;
    const collaboration = { workplace: { assignments: [{ id: 'assignment_claude', assigneeId: 'runtime_other', mandateId: 'mandate_claude' }] } } as CollaborationState;

    expect(() => assertContextRecipientBinding({ organizationId: 'org_hp_demo', taskId: 'assignment_claude', mandateId: 'mandate_claude', agentId: 'agent_claude', passportId: 'passport_claude' }, identity, mandates, collaboration)).toThrow('recipient runtime');
  });
});
