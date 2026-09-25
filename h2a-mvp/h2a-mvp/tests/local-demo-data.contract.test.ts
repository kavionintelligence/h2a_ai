import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentCollaborationService } from '@h2a/agents';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { LocalFeatureConfigRepository, LocalWorkplaceRepository } from '@h2a/storage';

const dataPath = resolve(process.cwd(), 'data', 'h2a-demo');

describe('checked-in local demo data', () => {
  it('matches the current versioned workplace and configuration schemas', async () => {
    const [snapshot, config] = await Promise.all([
      new LocalWorkplaceRepository(dataPath).getSnapshot(),
      new LocalFeatureConfigRepository(dataPath).get()
    ]);

    expect(snapshot.agents).toHaveLength(4);
    expect(snapshot.assignments).toHaveLength(4);
    expect(config).toMatchObject({
      storageMode: 'local-file',
      agentMode: 'scripted-workplace',
      resourceMode: 'sandbox'
    });
  });

  it('has a valid hash-linked authority trace', async () => {
    const result = await new LocalAuthorityEventLedger(dataPath).verify();
    expect(result).toEqual({
      status: 'verified',
      recordCount: 3,
      headHash: 'sha256:bbb54abbda7d10151897b0ba6139178e3bf494c0ac7f0b663b8a051db486582e'
    });
  });

  it('loads the checked-in collaboration messages, responses, and activity', async () => {
    const ledger = new LocalAuthorityEventLedger(dataPath);
    const state = await new AgentCollaborationService(dataPath, ledger, new LocalWorkplaceRepository(dataPath)).getState();
    expect(state.messages).toHaveLength(2);
    expect(state.responses).toHaveLength(3);
    expect(state.activity).toHaveLength(4);
    expect(state.workplace.assignments.every((assignment) => assignment.priority >= 1 && assignment.messageCount >= 0)).toBe(true);
  });
});
