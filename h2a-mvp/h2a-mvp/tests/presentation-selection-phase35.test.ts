import { describe, expect, it } from 'vitest';
import { retainSelectedAgentId } from '../apps/desktop/renderer/src/control-plane/selectionState';
import { phase34CanonicalState } from './fixtures/phase34-state';

describe('Phase 35 presentation-neutral selection', () => {
  it('retains a valid selected agent across 100 canonical shell refreshes and falls back only when absent', () => {
    const original = phase34CanonicalState().collaboration.workplace.agents[0]!;
    const second = { ...original, id: 'arb_phase35_second', passportId: 'agtp_phase35_second', name: 'Second Phase 35 Agent' };
    const agents = [original, second];
    let selected = second.id;

    for (let index = 0; index < 100; index += 1) selected = retainSelectedAgentId(selected, agents);

    expect(selected).toBe(second.id);
    expect(retainSelectedAgentId(selected, [original])).toBe(original.id);
    expect(retainSelectedAgentId(selected, [])).toBe('');
  });
});
