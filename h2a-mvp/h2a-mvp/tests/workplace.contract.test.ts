import { describe, expect, it } from 'vitest';
import { demoWorkplaceSnapshot } from '@h2a/contracts';

describe('demo workplace contract', () => {
  it('links every assignment to a known agent and mandate', () => {
    const agentById = new Map(demoWorkplaceSnapshot.agents.map((agent) => [agent.id, agent]));

    for (const assignment of demoWorkplaceSnapshot.assignments) {
      const agent = agentById.get(assignment.assigneeId);
      expect(agent, `${assignment.id} has a known assignee`).toBeDefined();
      expect(agent?.mandateId, `${assignment.id} uses the assignee mandate`).toBe(assignment.mandateId);
    }
  });

  it('represents each executive provider lane with a durable passport', () => {
    const providers = new Set(demoWorkplaceSnapshot.agents.map((agent) => agent.provider));

    expect(providers).toEqual(
      new Set(['scripted', 'openai-codex', 'claude-code', 'gemini-antigravity'])
    );
    expect(demoWorkplaceSnapshot.agents.every((agent) => agent.passportId.startsWith('agt_'))).toBe(true);
  });

  it('marks all seeded authority events as integrity verified', () => {
    expect(demoWorkplaceSnapshot.events.length).toBeGreaterThan(0);
    expect(demoWorkplaceSnapshot.events.every((event) => event.integrity === 'verified')).toBe(true);
  });
});
