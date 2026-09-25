import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { RealCollaborationCoordinator, type RealCollaborationPorts } from '../packages/agents/src/realCollaborationCoordinator';
import type { LiveRuntimeState } from '@h2a/contracts';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'h2a-refresh-persistence-')); roots.push(root);
  let currentTime = new Date('2026-09-24T18:00:00.000Z');
  const clock = () => currentTime;
  const runtime: LiveRuntimeState = { providers: [], runs: [], output: [] };
  // Only state-source ports are used by reads and preflight; no process or workload execution is faked.
  const unused = async (): Promise<never> => { throw new Error('This read-only regression must not execute a workload.'); };
  const ports = {
    bootstrap: { getState: async () => ({ steps: [{ step_id: 'restart-recovery', status: 'passed' }], assignment_ids: [] }) },
    humans: { getState: unused }, organization: { getState: unused },
    ceremony: { assertBinding: async () => undefined, bindResource: unused },
    agents: { getState: async () => ({ passportsV2: [], bindings: [], runtimeSessions: [], attestations: [] }) },
    mandates: { getState: async () => ({ mandates: [] }), create: unused, delegate: unused },
    collaboration: { getState: async () => ({ workplace: { agents: [], assignments: [] }, responses: [] }), updateAssignment: unused, rebindAssignmentAuthority: unused, recordResponse: unused },
    runtime: { getState: async () => runtime, start: unused, cancel: unused },
    frameworks: { getState: async () => ({ declarations: [], collaboration_runs: [] }), execute: unused }
  } as unknown as RealCollaborationPorts;
  const ledger = new LocalAuthorityEventLedger(root, 'traces/read-regression.jsonl', clock);
  const coordinator = new RealCollaborationCoordinator(root, ledger, ports, root, clock);
  await coordinator.initialize();
  const path = join(root, 'collaboration', 'phase26-state-v1.json');
  return { root, path, coordinator, runtime, ledger, advance: () => { currentTime = new Date(currentTime.getTime() + 1000); }, file: async () => ({ content: await readFile(path, 'utf8'), modified: (await stat(path)).mtimeMs }) };
}

describe('filesystem-driven control-plane refresh remains read-only when unchanged', () => {
  it('does not rewrite an unprepared collaboration projection as the clock advances', async () => {
    const test = await fixture();
    const before = await test.file();
    const state = await test.coordinator.getState();
    for (let index = 0; index < 5; index += 1) {
      test.advance();
      expect(await test.coordinator.getState()).toEqual(state);
      expect(await test.file()).toEqual(before);
    }
  });

  it('persists real source changes once and then stops writing unchanged preflight reads', async () => {
    const test = await fixture();
    await test.coordinator.prepare({ ceremony: { ceremony_id: 'ceremony_read_regression', trace_id: 'phase22_read_regression', idempotency_key: 'prepare_read_regression' }, framework_kind: 'mcp' });
    const initial = await test.coordinator.getState();
    const initialFile = await test.file();
    for (let index = 0; index < 4; index += 1) {
      test.advance();
      expect(await test.coordinator.getState()).toEqual(initial);
      expect(await test.file()).toEqual(initialFile);
    }

    test.runtime.providers.push({ provider: 'claude-code', health: 'ready', version: 'test-provider', detail: 'Provider became available.', trust_mode: 'connected-observed', checked_at: '2026-09-24T18:01:00.000Z' });
    test.advance();
    const changed = await test.coordinator.getState();
    expect(changed.lanes.find((lane) => lane.lane_id === 'claude-code')?.health).toBe('ready');
    expect(changed.updated_at).not.toBe(initial.updated_at);
    const changedFile = await test.file();
    expect(changedFile.content).not.toBe(initialFile.content);
    expect(JSON.parse(changedFile.content).data).toEqual(changed);
    for (let index = 0; index < 4; index += 1) {
      test.advance();
      expect(await test.coordinator.getState()).toEqual(changed);
      expect(await test.file()).toEqual(changedFile);
    }
    expect((await test.ledger.verify()).status).toBe('verified');
  });
});
