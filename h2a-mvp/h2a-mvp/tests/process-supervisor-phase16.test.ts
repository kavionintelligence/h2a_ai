import { mkdtemp } from 'node:fs/promises';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveProviderAdapter, LiveProviderRegistryPort, LiveRuntimeAuthorityPort } from '@h2a/agents';
import { ProcessSupervisor } from '@h2a/agents';
import type { LiveProviderId, LiveProviderStatus, LiveRunRecord, StartLiveRunRequest } from '@h2a/contracts';
import { LocalAuthorityEventLedger } from '@h2a/evidence';

const supervisors: ProcessSupervisor[] = [];
afterEach(async () => { await Promise.all(supervisors.splice(0).map((supervisor) => supervisor.shutdown())); });

describe('Phase 16 Process Supervisor', () => {
  it('runs inside the approved workspace, strips unrelated environment, streams output, and records evidence', async () => {
    const fixture = await createFixture(`console.log(JSON.stringify({kind:'result',text:'real child output',secret:process.env.H2A_TEST_SECRET_SENTINEL??'absent'}))`);
    process.env.H2A_TEST_SECRET_SENTINEL = 'must-not-cross';
    try {
      const started = await fixture.supervisor.start(request(fixture.workspace));
      const runId = started.runs[0].run_id;
      const state = await waitFor(fixture.supervisor, runId, 'succeeded');
      expect(state.runs[0]).toMatchObject({ status: 'succeeded', trust_mode: 'connected-observed', termination_reason: 'PROVIDER_COMPLETED' });
      expect(state.output.map((item) => item.content).join('\n')).toContain('real child output');
      expect(state.output.map((item) => item.content).join('\n')).toContain('"secret":"absent"');
      expect(state.runs[0].environment_keys).not.toContain('H2A_TEST_SECRET_SENTINEL');
      expect(fixture.authority.requests).toHaveLength(1);
      expect((await fixture.ledger.list()).map((event) => event.event_type)).toEqual(expect.arrayContaining(['LIVE_RUNTIME_STARTED', 'LIVE_RUNTIME_SUCCEEDED']));
    } finally {
      delete process.env.H2A_TEST_SECRET_SENTINEL;
    }
  });

  it('rejects a workspace outside approved roots before process launch', async () => {
    const fixture = await createFixture(`console.log('should not run')`);
    await expect(fixture.supervisor.start(request(tmpdir()))).rejects.toThrow('escapes the approved roots');
    expect(fixture.authority.requests).toHaveLength(0);
  });

  it.each([
    ['operator cancellation', async (supervisor: ProcessSupervisor, runId: string) => supervisor.cancel(runId, 'Test cancellation'), 'cancelled'],
    ['passport revocation', async (supervisor: ProcessSupervisor) => supervisor.revokePassport('passport_live'), 'revoked'],
    ['binding revocation', async (supervisor: ProcessSupervisor) => supervisor.revokeBinding('binding_live'), 'revoked'],
    ['session revocation', async (supervisor: ProcessSupervisor) => supervisor.revokeSession('session_live'), 'revoked']
  ])('terminates the actual process tree on %s', async (_label, terminate, expectedStatus) => {
    const fixture = await createFixture(`console.log('started'); setInterval(()=>{},1000)`);
    const started = await fixture.supervisor.start(request(fixture.workspace));
    const run = started.runs[0];
    expect(run.process_id).toBeTypeOf('number');
    await terminate(fixture.supervisor, run.run_id);
    const state = await waitFor(fixture.supervisor, run.run_id, expectedStatus);
    expect(state.runs[0].status).toBe(expectedStatus);
    expect(isProcessAlive(run.process_id!)).toBe(false);
  });

  it('fails closed when runtime authority is inactive', async () => {
    const fixture = await createFixture(`console.log('should not run')`, true);
    await expect(fixture.supervisor.start(request(fixture.workspace))).rejects.toThrow('Runtime authority is inactive');
    expect((await fixture.supervisor.getState()).runs).toHaveLength(0);
  });

  it('kills a real process when the execution timeout expires', async () => {
    const fixture = await createFixture(`console.log('waiting'); setInterval(()=>{},1000)`);
    const started = await fixture.supervisor.start({ ...request(fixture.workspace), timeout_seconds: 10 });
    const run = started.runs[0];
    const state = await waitFor(fixture.supervisor, run.run_id, 'timed-out', 240);
    expect(state.runs[0]).toMatchObject({ status: 'timed-out', termination_reason: 'EXECUTION_TIMEOUT' });
    expect(isProcessAlive(run.process_id!)).toBe(false);
  }, 15_000);

  it('executes a real failing control process and persists provider failure evidence', async () => {
    const fixture = await createFixture(`console.log('unused fixture adapter')`);
    const started = await fixture.supervisor.startFailureProbe(request(fixture.workspace));
    const run = started.runs[0];
    const state = await waitFor(fixture.supervisor, run.run_id, 'failed');
    expect(state.runs[0]).toMatchObject({ status: 'failed', termination_reason: 'PROVIDER_EXIT_NONZERO', exit_code: 17 });
    expect((await fixture.ledger.list()).some((event) => event.event_type === 'LIVE_RUNTIME_FAILED' && event.payload.termination_reason === 'PROVIDER_EXIT_NONZERO')).toBe(true);
  });

  it('recovers an armed containment process as HOST_PROCESS_RESTARTED with ledger evidence', async () => {
    const fixture = await createFixture(`console.log('unused fixture adapter')`);
    const started = await fixture.supervisor.startContainmentProbe(request(fixture.workspace));
    const run = started.runs[0];
    await fixture.supervisor.prepareForHostRestart(run.run_id);
    const recovered = new ProcessSupervisor(fixture.dataPath, fixture.ledger, fixture.authority, new FixtureRegistry(), [fixture.workspace]);
    supervisors.push(recovered);
    const state = await recovered.initialize();
    expect(state.runs.find((item) => item.run_id === run.run_id)).toMatchObject({ status: 'failed', termination_reason: 'HOST_PROCESS_RESTARTED' });
    expect((await fixture.ledger.list()).some((event) => event.event_type === 'LIVE_RUNTIME_FAILED' && event.payload.termination_reason === 'HOST_PROCESS_RESTARTED')).toBe(true);
  });

  it('records a missing executable as a failed run and permits the next explicit start', async () => {
    const fixture = await createFixture(`console.log('fresh child started')`);
    fixture.adapter.executable = join(fixture.workspace, 'provider-does-not-exist.exe');
    const failed = await fixture.supervisor.start(request(fixture.workspace));
    const failedId = failed.runs[0].run_id;
    expect(failed.runs[0]).toMatchObject({ status: 'failed', termination_reason: 'PROCESS_SPAWN_FAILED' });
    expect(failed.runs[0].process_id).toBeUndefined();
    fixture.adapter.executable = process.execPath;
    const started = await fixture.supervisor.start(request(fixture.workspace));
    const freshId = started.runs[0].run_id;
    expect(freshId).not.toBe(failedId);
    const completed = await waitFor(fixture.supervisor, freshId, 'succeeded');
    expect(completed.runs.find((run) => run.run_id === failedId)?.status).toBe('failed');
    expect((await fixture.ledger.list()).some((event) => event.event_type === 'LIVE_RUNTIME_FAILED' && event.payload.termination_reason === 'PROCESS_SPAWN_FAILED')).toBe(true);
  });

  it('handles a real child exiting before a large prompt flushes, without replaying it', async () => {
    const fixture = await createFixture(`process.exit(17)`);
    fixture.adapter.stdin = 'bounded test payload\n'.repeat(100_000);
    const failed = await fixture.supervisor.start({ ...request(fixture.workspace), timeout_seconds: 10 });
    expect(failed.runs[0].status).toBe('failed');
    // Exit and pipe-close callbacks may race; both must fail the one invocation.
    expect(failed.runs[0].termination_reason).toMatch(/^(?:PROCESS_PIPE_|PROVIDER_EXIT_NONZERO$)/u);
    const failedId = failed.runs[0].run_id;
    const events = await fixture.ledger.list();
    expect(events.filter((event) => event.event_type === 'LIVE_RUNTIME_STARTED' && event.subject?.id === failedId)).toHaveLength(1);
    expect(events.filter((event) => event.event_type === 'LIVE_RUNTIME_FAILED' && event.subject?.id === failedId)).toHaveLength(1);
    fixture.adapter.stdin = undefined;
    fixture.adapter.script = `console.log('explicit replacement invocation')`;
    const fresh = await fixture.supervisor.start(request(fixture.workspace));
    await waitFor(fixture.supervisor, fresh.runs[0].run_id, 'succeeded');
  }, 20_000);

  it.each(['EPIPE', 'EAGAIN', 'ERR_STREAM_DESTROYED'])('persists asynchronous %s once, releases the child, and allows an explicit replacement run', async (code) => {
    const fixture = await createFixture(`console.log('waiting for operator'); setInterval(()=>{},1000)`);
    const started = await fixture.supervisor.start(request(fixture.workspace));
    const run = started.runs[0];
    const active = (fixture.supervisor as unknown as { active: Map<string, { child: ChildProcessWithoutNullStreams }> }).active.get(run.run_id);
    expect(active).toBeDefined();
    expect(() => active!.child.stdin.emit('error', Object.assign(new Error(`input failure ${code}`), { code }))).not.toThrow();
    const failed = await waitFor(fixture.supervisor, run.run_id, 'failed');
    expect(failed.runs.find((record) => record.run_id === run.run_id)).toMatchObject({ status: 'failed', termination_reason: `PROCESS_PIPE_${code}` });
    expect(isProcessAlive(run.process_id!)).toBe(false);
    // Late duplicate stream callbacks must remain handled without another completion or implicit retry.
    expect(() => active!.child.stdin.emit('error', Object.assign(new Error('late pipe error'), { code: 'EPIPE' }))).not.toThrow();
    expect((await fixture.ledger.list()).filter((event) => event.event_type === 'LIVE_RUNTIME_FAILED' && event.subject?.id === run.run_id)).toHaveLength(1);
    fixture.adapter.script = `console.log('explicit replacement invocation')`;
    const fresh = await fixture.supervisor.start(request(fixture.workspace));
    expect(fresh.runs[0].run_id).not.toBe(run.run_id);
    await waitFor(fixture.supervisor, fresh.runs[0].run_id, 'succeeded');
  });

  it('fails closed when stdin is destroyed during persistence before end is called', async () => {
    const fixture = await createFixture(`setInterval(()=>{},1000)`);
    fixture.adapter.stdin = 'must not be written to a dead pipe';
    const internal = fixture.supervisor as unknown as {
      replaceRun(record: LiveRunRecord): Promise<void>;
      active: Map<string, { child: ChildProcessWithoutNullStreams }>;
    };
    const replace = internal.replaceRun.bind(internal);
    let write: ReturnType<typeof vi.spyOn> | undefined;
    const hook = vi.spyOn(internal, 'replaceRun').mockImplementation(async (record) => {
      await replace(record);
      if (record.status === 'running') {
        const child = internal.active.get(record.run_id)!.child;
        write = vi.spyOn(child.stdin, 'end');
        child.stdin.destroy();
      }
    });
    try {
      const result = await fixture.supervisor.start(request(fixture.workspace));
      expect(result.runs[0]).toMatchObject({ status: 'failed', termination_reason: 'PROCESS_PIPE_EPIPE' });
      expect(write).not.toHaveBeenCalled();
      expect(internal.active.size).toBe(0);
    } finally { hook.mockRestore(); }
  });

  it('settles start when the pipe errors without invoking its pending end callback', async () => {
    const fixture = await createFixture(`setInterval(()=>{},1000)`);
    fixture.adapter.stdin = 'send this at most once';
    const internal = fixture.supervisor as unknown as {
      replaceRun(record: LiveRunRecord): Promise<void>;
      active: Map<string, { child: ChildProcessWithoutNullStreams }>;
    };
    const replace = internal.replaceRun.bind(internal);
    let writes = 0;
    const hook = vi.spyOn(internal, 'replaceRun').mockImplementation(async (record) => {
      await replace(record);
      if (record.status === 'running') {
        const child = internal.active.get(record.run_id)!.child;
        vi.spyOn(child.stdin, 'end').mockImplementation(() => {
          writes += 1;
          queueMicrotask(() => child.stdin.emit('error', Object.assign(new Error('pipe callback was lost'), { code: 'EPIPE' })));
          return child.stdin;
        });
      }
    });
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        fixture.supervisor.start(request(fixture.workspace)),
        new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => reject(new Error('start hung after a pipe error')), 2000); })
      ]);
      expect(result.runs[0]).toMatchObject({ status: 'failed', termination_reason: 'PROCESS_PIPE_EPIPE' });
      expect(writes).toBe(1);
      expect(internal.active.size).toBe(0);
    } finally { clearTimeout(deadline); hook.mockRestore(); }
  });
});

async function createFixture(script: string, deny = false) {
  const dataPath = await mkdtemp(join(tmpdir(), 'h2a-phase16-'));
  const workspace = join(dataPath, 'workspace');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(workspace));
  const ledger = new LocalAuthorityEventLedger(dataPath);
  const authority = new FixtureAuthority(deny);
  const adapter = new FixtureAdapter(script);
  const registry: LiveProviderRegistryPort = { get: () => adapter, probe: () => [adapter.probe()] };
  const supervisor = new ProcessSupervisor(dataPath, ledger, authority, registry, [workspace]);
  supervisors.push(supervisor);
  await supervisor.initialize();
  return { dataPath, workspace, ledger, authority, supervisor, adapter };
}

class FixtureAuthority implements LiveRuntimeAuthorityPort {
  public readonly requests: StartLiveRunRequest[] = [];
  public constructor(private readonly deny: boolean) {}
  public async assertActive(requestValue: StartLiveRunRequest): Promise<void> {
    this.requests.push(requestValue);
    if (this.deny) throw new Error('Runtime authority is inactive.');
  }
}

class FixtureAdapter implements LiveProviderAdapter {
  public readonly provider = 'claude-code' as const;
  public executable = process.execPath;
  public stdin: string | undefined;
  public constructor(public script: string) {}
  public probe(): LiveProviderStatus {
    return { provider: this.provider, health: 'ready', executable: this.executable, version: process.version, detail: 'Fixture process ready.', trust_mode: 'connected-observed', checked_at: new Date().toISOString() };
  }
  public buildInvocation() { return { executable: this.executable, args: ['-e', this.script], argumentPolicy: ['test-fixture'], version: process.version, stdin: this.stdin }; }
  public extractSummary(lines: string[]) { return lines.at(-1) ?? ''; }
}

class FixtureRegistry implements LiveProviderRegistryPort {
  private readonly adapter = new FixtureAdapter(`console.log('fixture')`);
  public get(): LiveProviderAdapter { return this.adapter; }
  public probe(): LiveProviderStatus[] { return [this.adapter.probe()]; }
}

function request(workspace: string, provider: LiveProviderId = 'claude-code'): StartLiveRunRequest {
  return {
    provider, agent_id: 'agent_live', passport_id: 'passport_live', binding_id: 'binding_live',
    runtime_session_id: 'session_live', mandate_id: 'mandate_live', trace_id: 'trace_live',
    workspace_path: workspace, prompt: 'Return one bounded test result.', timeout_seconds: 30
  };
}

async function waitFor(supervisor: ProcessSupervisor, runId: string, status: string, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await supervisor.getState();
    if (state.runs.find((run) => run.run_id === runId)?.status === status) return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Run ${runId} did not reach ${status}.`);
}

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
