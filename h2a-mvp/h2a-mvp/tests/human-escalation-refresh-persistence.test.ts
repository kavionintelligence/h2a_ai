import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { HumanEscalationCoordinator, type HumanEscalationPorts } from '../packages/agents/src/humanEscalationCoordinator';
import type { ApprovalRequestV2 } from '@h2a/contracts';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture(rejected = false) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-approval-refresh-')); roots.push(root);
  let now = new Date('2026-09-24T18:00:00.000Z');
  const request = { approval_request_id: 'approval_refresh', status: rejected ? 'rejected' : 'pending' } as ApprovalRequestV2;
  const ports = { approvals: { getState: async () => ({ requests: [request], resumes: [] }) } as unknown } as HumanEscalationPorts;
  const coordinator = new HumanEscalationCoordinator(root, new LocalAuthorityEventLedger(root), ports, root, () => now);
  await coordinator.initialize();
  const path = join(root, 'authority/phase28-state-v1.json');
  const envelope = JSON.parse(await readFile(path, 'utf8'));
  envelope.data.status = rejected ? 'rejection-pending' : 'approval-pending';
  envelope.data[rejected ? 'rejection_request_id' : 'approval_request_id'] = request.approval_request_id;
  await writeFile(path, JSON.stringify(envelope));
  return { coordinator, request, advance: () => { now = new Date(now.getTime() + 1000); }, file: async () => ({ content: await readFile(path, 'utf8'), modified: (await stat(path)).mtimeMs }) };
}

describe('human approval reconciliation does not trigger its own filesystem refresh', () => {
  it('keeps pending reads stable and persists an actual approval transition exactly once', async () => {
    const test = await fixture();
    const before = await test.file();
    const pending = await test.coordinator.getState();
    for (let index = 0; index < 4; index += 1) {
      test.advance();
      expect(await test.coordinator.getState()).toEqual(pending);
      expect(await test.file()).toEqual(before);
    }
    test.request.status = 'approved'; test.advance();
    const approved = await test.coordinator.getState();
    expect(approved.status).toBe('approved');
    expect(approved.updated_at).not.toBe(pending.updated_at);
    const changed = await test.file();
    expect(JSON.parse(changed.content).data).toEqual(approved);
    for (let index = 0; index < 4; index += 1) {
      test.advance();
      expect(await test.coordinator.getState()).toEqual(approved);
      expect(await test.file()).toEqual(changed);
    }
  });

  it('publishes the durable rejected state once without repeating timestamp-only writes', async () => {
    const test = await fixture(true);
    test.advance();
    const state = await test.coordinator.getState();
    expect(state.status).toBe('completed-with-rejection');
    const stored = await test.file();
    for (let index = 0; index < 4; index += 1) {
      test.advance();
      expect(await test.coordinator.getState()).toEqual(state);
      expect(await test.file()).toEqual(stored);
    }
  });
});
