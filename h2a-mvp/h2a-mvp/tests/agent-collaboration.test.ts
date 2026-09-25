import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { demoWorkplaceSnapshot } from '@h2a/contracts';
import { AgentCollaborationService } from '@h2a/agents';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { LocalWorkplaceRepository } from '@h2a/storage';

const temporaryDirectories: string[] = [];
const clock = () => new Date('2026-08-20T13:00:00.000Z');

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))));

describe('Phase 6 agent collaboration', () => {
  it('creates and persists an assignment with activity and evidence', async () => {
    const fixture = await createFixture();
    const state = await fixture.service.createAssignment({
      title: 'Compare policy evidence',
      objective: 'Compare the supplied evidence with the approved control statements.',
      assigneeId: 'runtime-aria',
      risk: 'standard',
      priority: 2,
      dependsOn: ['wrk_101'],
      requestedAction: 'evidence.compare'
    });
    const created = state.workplace.assignments.at(-1)!;
    expect(created).toMatchObject({ status: 'queued', assigneeId: 'runtime-aria', priority: 2, responseCount: 0, messageCount: 0 });
    expect(state.activity[0]).toMatchObject({ assignmentId: created.id, kind: 'assignment', summary: 'Assignment queued' });
    expect((await fixture.ledger.list()).at(-1)).toMatchObject({ event_type: 'WORK_ASSIGNED', subject: { type: 'assignment', id: created.id } });

    const restarted = new AgentCollaborationService(fixture.root, fixture.ledger, fixture.workplace, clock);
    expect((await restarted.getState()).workplace.assignments.at(-1)?.id).toBe(created.id);
  });

  it('binds an orchestrated assignment to its exact mandate without changing the agent default', async () => {
    const fixture = await createFixture();
    let state = await fixture.service.createAssignment({
      title: 'Exact scoped work',
      objective: 'Execute only the approved exact-scope operation.',
      assigneeId: 'runtime-aria',
      risk: 'restricted',
      priority: 1,
      dependsOn: []
    }, 'mandate_exact_scope');
    expect(state.workplace.assignments.at(-1)?.mandateId).toBe('mandate_exact_scope');
    expect(state.workplace.agents.find((item) => item.id === 'runtime-aria')?.mandateId).toBe('mnd_control_mapping');
    expect((await fixture.ledger.list()).at(-1)?.mandate_id).toBe('mandate_exact_scope');
    state = await fixture.service.updateAssignment({ assignmentId: state.workplace.assignments.at(-1)!.id, status: 'active' });
    expect(state.workplace.assignments.at(-1)?.mandateId).toBe('mandate_exact_scope');
    expect((await fixture.ledger.list()).at(-1)?.mandate_id).toBe('mandate_exact_scope');
  });

  it('enforces transitions and updates the visible agent projection', async () => {
    const fixture = await createFixture();
    let state = await fixture.service.updateAssignment({ assignmentId: 'wrk_103', status: 'active' });
    expect(state.workplace.assignments.find((item) => item.id === 'wrk_103')?.status).toBe('active');
    expect(state.workplace.agents.find((item) => item.id === 'runtime-isha')).toMatchObject({ status: 'working', currentAction: 'Research vendor disclosures' });

    await expect(fixture.service.updateAssignment({ assignmentId: 'wrk_103', status: 'queued' })).rejects.toThrow('cannot move');
    state = await fixture.service.updateAssignment({ assignmentId: 'wrk_103', status: 'complete' });
    expect(state.workplace.agents.find((item) => item.id === 'runtime-isha')).toMatchObject({ status: 'ready', progress: 100 });
  });

  it('reassigns work and carries the destination mandate reference', async () => {
    const fixture = await createFixture();
    const state = await fixture.service.updateAssignment({ assignmentId: 'wrk_103', assigneeId: 'runtime-aria' });
    expect(state.workplace.assignments.find((item) => item.id === 'wrk_103')).toMatchObject({ assigneeId: 'runtime-aria', mandateId: 'mnd_control_mapping' });
    expect(state.activity[0]).toMatchObject({ agentId: 'runtime-aria', kind: 'assignment' });
  });

  it('rebinds an assignment and its runtime projection to trusted replacement authority', async () => {
    const fixture = await createFixture();
    const state = await fixture.service.rebindAssignmentAuthority({ assignmentId: 'wrk_103', agentId: 'runtime-isha', mandateId: 'mnd_replacement' });
    expect(state.workplace.assignments.find((item) => item.id === 'wrk_103')).toMatchObject({ assigneeId: 'runtime-isha', mandateId: 'mnd_replacement' });
    expect(state.workplace.agents.find((item) => item.id === 'runtime-isha')).toMatchObject({ mandateId: 'mnd_replacement' });
    expect((await fixture.ledger.list()).at(-1)).toMatchObject({ event_type: 'WORK_AUTHORITY_REBOUND', mandate_id: 'mnd_replacement' });
  });

  it('records only assigned-agent responses and keeps full text out of evidence', async () => {
    const fixture = await createFixture();
    await expect(fixture.service.recordResponse({ assignmentId: 'wrk_101', agentId: 'runtime-maya', body: 'Unauthorized response.' })).rejects.toThrow('assigned agent');

    const body = 'Mapped 24 controls; two assertions remain evidence-gated.';
    const state = await fixture.service.recordResponse({ assignmentId: 'wrk_101', agentId: 'runtime-aria', body });
    expect(state.responses.at(-1)).toMatchObject({ assignmentId: 'wrk_101', agentId: 'runtime-aria', body });
    expect(state.workplace.assignments.find((item) => item.id === 'wrk_101')).toMatchObject({ response: body, responseCount: 2 });
    expect(await readFile(fixture.ledger.ledgerPath, 'utf8')).not.toContain(body);
    expect((await fixture.ledger.list()).at(-1)?.payload).toEqual(expect.objectContaining({ response_hash: expect.stringMatching(/^sha256:/) }));
  });

  it('delivers agent messages while evidence stores only body hashes', async () => {
    const fixture = await createFixture();
    const body = 'Please confirm the source for control AC-7 before consolidation.';
    const state = await fixture.service.sendMessage({
      assignmentId: 'wrk_101',
      fromAgentId: 'runtime-aria',
      toAgentId: 'runtime-maya',
      act: 'query',
      subject: 'Source confirmation needed',
      body
    });
    expect(state.messages).toEqual([expect.objectContaining({ body, deliveryStatus: 'delivered', traceId: expect.stringMatching(/^tr_/) })]);
    expect(state.workplace.assignments.find((item) => item.id === 'wrk_101')?.messageCount).toBe(3);
    expect(state.activity.filter((item) => item.kind === 'message')).toHaveLength(2);
    expect(await readFile(fixture.ledger.ledgerPath, 'utf8')).not.toContain(body);
    expect((await fixture.ledger.list()).at(-1)).toMatchObject({ event_type: 'WORK_MESSAGE_SENT', subject: { type: 'message' } });
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'h2a-collaboration-'));
  temporaryDirectories.push(root);
  const workplace = new LocalWorkplaceRepository(root, clock);
  await Promise.all([
    workplace.replaceAgents(structuredClone(demoWorkplaceSnapshot.agents)),
    workplace.replaceAssignments(structuredClone(demoWorkplaceSnapshot.assignments)),
    workplace.replaceRecentEvents(structuredClone(demoWorkplaceSnapshot.events))
  ]);
  const ledger = new LocalAuthorityEventLedger(root, 'traces/collaboration-test.jsonl', clock);
  const service = new AgentCollaborationService(root, ledger, workplace, clock);
  await service.initialize();
  return { root, workplace, ledger, service };
}
