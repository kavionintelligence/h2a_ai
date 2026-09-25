import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { ActorDirectory, actorContext, type Actor } from '../apps/governance/actors';
import { GovernanceService } from '../apps/governance/service';
import { PlatformService } from '../apps/governance/platform';
import { createGovernanceServer } from '../apps/governance/server';
import { RoomRuntime, parseCliResult, validateFiles } from '../apps/governance/room-runtime';
import { exec } from '../../../vendor/claw-orchestrator/exec';
import { unzipSync, strFromU8 } from 'fflate';
import type { DiscoveryScan } from '../apps/governance/contracts';

const admin: Actor = { human_id: 'TEST-ADMIN', name: 'Test admin', team: 'Security', role: 'admin', mode: 'named-user' };
const builder: Actor = { human_id: 'TEST-BUILDER', name: 'Test builder', team: 'Engineering', role: 'builder', mode: 'named-user' };
const reviewer: Actor = { human_id: 'TEST-REVIEWER', name: 'Test reviewer', team: 'Security', role: 'reviewer', mode: 'named-user' };
const outsider: Actor = { human_id: 'TEST-OUTSIDE', name: 'Test outside', team: 'Other', role: 'builder', mode: 'named-user' };
const as = <T>(actor: Actor, operation: () => T) => actorContext.run(actor, operation);
const token = (actor: Actor) => `test-only-credential-with-entropy-${actor.human_id}`;
const generated = { summary: 'Test fixture output — not a live model result', memory: 'Use accessible labels.', files: [{ path: 'src/app.ts', content: 'export const answer = 42;\n' }] };

async function fixture(executor = vi.fn(async (_command: string, _args: string[], _options: unknown) => ({ code: 0, out: JSON.stringify({ structured_output: generated }), err: '', timedOut: false, durationMs: 10 }))) {
  const root = await mkdtemp(join(tmpdir(), 'byosync-room-test-'));
  const users = join(root, 'users.json');
  await writeFile(users, JSON.stringify([admin, builder, reviewer, outsider].map(({ mode, ...actor }) => ({ ...actor, token_hash: createHash('sha256').update(token(actor as Actor)).digest('hex') }))));
  const directory = new ActorDirectory(); await directory.initialize(users);
  const now = new Date().toISOString();
  const scan: DiscoveryScan = { scan_id: 'test-scan', correlation_id: 'test', started_at: now, completed_at: now, discovery_sources: ['endpoint-inventory'], observed_agent_ids: ['test-cli-1', 'test-cli-2'], configured_source_count: 1, errors: [],
    agents: [1, 2].map(n => ({ agent_id: `test-cli-${n}`, name: `Test CLI ${n}`, provider: 'Test only', model: null, framework: 'endpoint-inventory', endpoint: null, protocols: [], tools: [], capabilities: [], fingerprint: {},
      classification: { is_agent: false, classification: 'installed_ai_tool', confidence: 0.8, entity_type: 'coding', reasons: [], evidence: [] }, registered: false, shadow: false, discovery_sources: ['endpoint-inventory'], first_seen: now, last_seen: now, activity_status: 'active', evidence_age_seconds: 0, confidence: 0.8, evidence: [], identity_decisions: [] })) };
  const discovery = { configured: true, endpoint: 'test-only', scan: async () => scan };
  const service = new GovernanceService(root, discovery, undefined, directory); await service.initialize();
  const platform = new PlatformService(root, discovery); await platform.initialize();
  const runtime = new RoomRuntime(service, platform, executor); await runtime.initialize();
  let agentIds: string[] = [], roomId = '';
  await as(admin, async () => {
    await service.discoverAgents();
    for (const candidate of scan.agents) await service.importAgent(candidate.agent_id, scan.scan_id);
    agentIds = (await service.getState()).agents.map(agent => agent.agent_id);
    for (const id of agentIds) { await service.bind(id, builder.human_id); await service.issuePassport(id); await service.assignMandate(id, true); await runtime.bind(id, 'claude'); }
    const snapshot = await service.createRoom(agentIds[0], 'Test product room', [agentIds[1]]); roomId = snapshot.rooms[0].room_id;
    await service.setRoomMembers(roomId, [admin.human_id, builder.human_id, reviewer.human_id]);
  });
  return { root, service, platform, runtime, agentIds, roomId, executor };
}

describe('Repository-backed room runtime', () => {
  it('attributes concurrent requests to separate humans and enforces roles over HTTP', async () => {
    const f = await fixture();
    const [left, right] = await Promise.all([as(builder, () => f.service.getState()), as(reviewer, () => f.service.getState())]);
    expect(left.session.human_id).toBe(builder.human_id); expect(right.session.human_id).toBe(reviewer.human_id);
    expect(left.agents[0].owner?.human_id).toBe(builder.human_id);
    const server = createGovernanceServer(f.service, undefined, f.platform, f.runtime);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}`;
    try {
      expect((await fetch(url + '/api/runtime')).status).toBe(401);
      const response = await fetch(url + `/api/agents/${f.agentIds[0]}/mandate`, { method: 'POST', headers: { Authorization: `Bearer ${token(builder)}`, 'Content-Type': 'application/json' }, body: '{}' });
      expect(response.status).toBe(403);
      const signIn = await fetch(url + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token(reviewer) }) });
      expect(signIn.status).toBe(200); expect(signIn.headers.get('set-cookie')).toContain('HttpOnly');
      const state = await fetch(url + '/api/state', { headers: { Authorization: `Bearer ${token(builder)}` } }).then(r => r.json());
      expect(state.session.role).toBe('builder');
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it('executes two bounded steps only after a different reviewer approves, publishes files, and gates brain context', async () => {
    const f = await fixture();
    await expect(as(outsider, () => f.runtime.request(f.roomId, 'Forbidden build', 'Build a small fixture app', f.agentIds))).rejects.toThrow('membership');
    const pending = await as(builder, () => f.runtime.request(f.roomId, 'Fixture product', 'Build a small fixture app', f.agentIds));
    const runId = pending.runs[0].run_id;
    expect(f.executor).not.toHaveBeenCalled();
    await expect(as(builder, () => f.runtime.decide(runId, true))).rejects.toThrow('Reviewer');
    await as(reviewer, () => f.runtime.decide(runId, true));
    await vi.waitFor(async () => expect((await as(reviewer, () => f.runtime.view())).runs[0].status).toBe('succeeded'), { timeout: 10000 });
    expect(f.executor).toHaveBeenCalledTimes(2);
    const calls = f.executor.mock.calls;
    expect((calls[1][2] as { input: string }).input).toContain(generated.summary);
    expect((calls[0][2] as { env: Record<string, string> }).env).not.toHaveProperty('BYOSYNC_ACCESS_TOKEN');
    await expect(as(builder, () => f.runtime.publish(runId))).rejects.toThrow('Reviewer');
    const published = await as(reviewer, () => f.runtime.publish(runId));
    expect(await readFile(join(published.runs[0].publication!, 'src/app.ts'), 'utf8')).toBe(generated.files[0].content);
    const archive = await as(builder, () => f.runtime.download(runId));
    expect(strFromU8(unzipSync(archive)['src/app.ts'])).toBe(generated.files[0].content);
    await expect(as(outsider, () => f.runtime.download(runId))).rejects.toThrow('membership');
    const proposed = await as(builder, () => f.runtime.proposeMemory(runId));
    expect((await as(builder, () => f.runtime.searchMemory(f.roomId, 'accessible'))).results).toHaveLength(0);
    await as(reviewer, () => f.service.reviewMemory(proposed.memories[0].memory_id, 'approve'));
    const brain = await as(builder, () => f.runtime.searchMemory(f.roomId, 'accessible'));
    expect(brain.results).toHaveLength(1); expect(brain.results[0].reviewed_by).toBe(reviewer.human_id);
    await expect(as(outsider, () => f.runtime.searchMemory(f.roomId, 'accessible'))).rejects.toThrow('membership');
    const outsiderState = await as(outsider, () => f.service.getState());
    expect(outsiderState.rooms).toHaveLength(0); expect(outsiderState.memories).toHaveLength(0);
    expect(outsiderState.events.some(event => event.metadata.run_id === runId)).toBe(false);
    const restored = new RoomRuntime(f.service, f.platform, f.executor); await restored.initialize();
    expect((await as(reviewer, () => restored.view())).runs[0].publication_hash).toBe(published.runs[0].publication_hash);
    const next = await as(builder, () => restored.request(f.roomId, 'Follow-on task', 'Extend the previous fixture', f.agentIds));
    expect(next.runs[1].memory_ids).toContain(proposed.memories[0].memory_id);
    expect((await f.service.ledger.verify()).status).toBe('verified');
    const poisoned = await as(builder, () => f.service.getState());
    poisoned.memories[0].content = 'Unreviewed replacement content';
    const changedState = vi.spyOn(f.service, 'getState').mockResolvedValue(poisoned);
    await expect(as(builder, () => restored.searchMemory(f.roomId, ''))).rejects.toThrow('memory integrity');
    await expect(as(builder, () => restored.request(f.roomId, 'Poisoned context', 'Do not consume modified context', f.agentIds))).rejects.toThrow('memory integrity');
    await expect(as(reviewer, () => restored.syncMemory(poisoned.memories[0].memory_id))).rejects.toThrow('memory integrity');
    changedState.mockRestore();
  }, 30000);

  it('refuses self-approval, revoked mandates and duplicate decisions', async () => {
    const f = await fixture();
    const self = await as(admin, () => f.runtime.request(f.roomId, 'Self approval test', 'Do not execute this request', f.agentIds));
    await expect(as(admin, () => f.runtime.decide(self.runs[0].run_id, true))).rejects.toThrow('different named reviewer');
    const pending = await as(builder, () => f.runtime.request(f.roomId, 'Revocation test', 'Do not execute a revoked request', f.agentIds));
    await as(admin, () => f.service.updateMandate(f.agentIds[0], 'revoke'));
    await expect(as(reviewer, () => f.runtime.decide(pending.runs[1].run_id, true))).rejects.toThrow('active mandate');
    await as(reviewer, () => f.runtime.decide(pending.runs[1].run_id, false));
    await expect(as(reviewer, () => f.runtime.decide(pending.runs[1].run_id, false))).rejects.toThrow('already decided');
    expect(f.executor).not.toHaveBeenCalled();
  });

  it('records an actual executor failure without inventing successful files or memory', async () => {
    const failure = vi.fn(async (_c: string, _a: string[], _o: unknown) => ({ code: 1, out: '', err: 'TEST-ONLY auth failure', timedOut: false, durationMs: 5 }));
    const f = await fixture(failure);
    const pending = await as(builder, () => f.runtime.request(f.roomId, 'Failure fixture', 'Test a failed CLI call', f.agentIds));
    await as(reviewer, () => f.runtime.decide(pending.runs[0].run_id, true));
    await vi.waitFor(async () => expect((await as(reviewer, () => f.runtime.view())).runs[0].status).toBe('failed'));
    expect(failure).toHaveBeenCalledTimes(1);
    await expect(as(builder, () => f.runtime.proposeMemory(pending.runs[0].run_id))).rejects.toThrow('successful real run');
    expect((await f.platform.telemetry()).length).toBe(0);
  });

  it('rejects unsafe file bundles and malformed CLI output', () => {
    for (const path of ['../outside.ts', '/tmp/x.ts', 'C:/x.ts', '.git/hooks/test', 'src/CON.ts', 'src/app.exe', 'src//app.ts']) expect(() => validateFiles([{ path, content: 'x' }])).toThrow();
    expect(() => validateFiles([{ path: 'App.ts', content: 'x' }, { path: 'app.ts', content: 'y' }])).toThrow('duplicate');
    expect(() => parseCliResult('claude', '{"is_error":true}')).toThrow();
    expect(parseCliResult('codex', JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(generated) } }))).toEqual(generated);
  });

  it('uses the vendored process wrapper for real timeout and cancellation', async () => {
    const timeout = await exec(process.execPath, ['-e', 'setTimeout(()=>{},30000)'], { timeoutMs: 100, maxCaptureBytes: 1000 });
    expect(timeout.timedOut).toBe(true);
    const controller = new AbortController();
    const pending = exec(process.execPath, ['-e', 'setTimeout(()=>{},30000)'], { signal: controller.signal, timeoutMs: 5000 });
    controller.abort(); expect((await pending).code).not.toBe(0);
  }, 15000);
});
