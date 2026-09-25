import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  liveRunRecordSchema,
  liveRuntimeStateSchema,
  runtimeOutputRecordSchema,
  startLiveRunRequestSchema,
  type LiveRunRecord,
  type LiveRunStatus,
  type LiveRuntimeState,
  type RuntimeOutputRecord,
  type StartLiveRunRequest
} from '@h2a/contracts';
import { hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';
import { LiveProviderAdapterRegistry, type LiveProviderRegistryPort } from './liveProviderAdapters';

const runsSchema = z.array(liveRunRecordSchema);
const outputSchema = z.array(runtimeOutputRecordSchema);

export interface LiveRuntimeAuthorityPort {
  assertActive(request: StartLiveRunRequest): Promise<void>;
}

interface ActiveRun {
  child: ChildProcessWithoutNullStreams;
  record: LiveRunRecord;
  outputLines: string[];
  sequence: number;
  timeout: NodeJS.Timeout;
  completion?: Promise<void>;
}

export class ProcessSupervisor {
  private readonly runs: VersionedJsonRepository<'h2a.runtime.live-runs', LiveRunRecord[]>;
  private readonly output: VersionedJsonRepository<'h2a.runtime.live-output', RuntimeOutputRecord[]>;
  private readonly active = new Map<string, ActiveRun>();
  private persistenceQueue: Promise<void> = Promise.resolve();
  private backgroundFailure?: Error;

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly authority: LiveRuntimeAuthorityPort,
    private readonly adapters: LiveProviderRegistryPort = new LiveProviderAdapterRegistry(),
    private readonly workspaceRoots: string[] = [process.cwd()],
    private readonly clock: () => Date = () => new Date()
  ) {
    const store = new AtomicFileStore(dataPath);
    this.runs = new VersionedJsonRepository(store, 'runtime/live-runs.json', 'h2a.runtime.live-runs', runsSchema, { initialData: [], clock });
    this.output = new VersionedJsonRepository(store, 'runtime/live-output.json', 'h2a.runtime.live-output', outputSchema, { initialData: [], clock });
  }

  public async initialize(): Promise<LiveRuntimeState> {
    const records = await this.runs.read();
    const now = this.clock().toISOString();
    const interrupted = records.filter((record) => ['starting', 'running'].includes(record.status));
    const recovered = records.map((record) => ['starting', 'running'].includes(record.status)
      ? liveRunRecordSchema.parse({ ...record, status: 'failed', termination_reason: 'HOST_PROCESS_RESTARTED', completed_at: now, updated_at: now, process_id: undefined })
      : record);
    if (interrupted.length) {
      await this.runs.write(recovered);
      for (const record of recovered.filter((item) => interrupted.some((prior) => prior.run_id === item.run_id))) await this.recordCompletion(record);
    }
    await this.output.read();
    return this.getState();
  }

  public async getState(): Promise<LiveRuntimeState> {
    if (this.backgroundFailure) { const failure = this.backgroundFailure; this.backgroundFailure = undefined; throw failure; }
    const [runs, output] = await Promise.all([this.runs.read(), this.output.read()]);
    const providers = this.adapters.probe().map((provider) => {
      const latest = runs.find((run) => run.provider === provider.provider);
      if (latest?.termination_reason === 'AUTHENTICATION_REQUIRED') return { ...provider, health: 'authentication-required' as const, detail: 'The latest official CLI invocation reported that authentication is required.' };
      return provider;
    });
    return liveRuntimeStateSchema.parse({ providers, runs: runs.slice(0, 100), output: output.slice(-500) });
  }

  public async start(request: StartLiveRunRequest): Promise<LiveRuntimeState> {
    const input = startLiveRunRequestSchema.parse(request);
    const workspace = validateWorkspace(input.workspace_path, this.workspaceRoots);
    await this.authority.assertActive(input);
    const adapter = this.adapters.get(input.provider);
    const provider = adapter.probe();
    if (!provider.executable || provider.health === 'dependency-missing' || provider.health === 'disabled') throw new Error(provider.detail);
    if ([...this.active.values()].some((active) => active.record.runtime_session_id === input.runtime_session_id)) throw new Error('Runtime session already has an active provider process.');
    const invocation = adapter.buildInvocation({ ...input, workspace_path: workspace });
    const environment = invocationEnvironment();
    const now = this.clock().toISOString();
    const record = liveRunRecordSchema.parse({
      run_id: `run_${randomUUID()}`, provider: input.provider, agent_id: input.agent_id,
      passport_id: input.passport_id, binding_id: input.binding_id, runtime_session_id: input.runtime_session_id,
      mandate_id: input.mandate_id, trace_id: input.trace_id, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key, workspace_path: workspace,
      executable: invocation.executable, executable_version: invocation.version,
      argument_policy: invocation.argumentPolicy, environment_keys: Object.keys(environment).sort(),
      prompt_hash: hashCanonical(input.prompt), trust_mode: 'connected-observed', status: 'starting',
      started_at: now, updated_at: now
    });
    await this.prependRun(record);
    await this.evidence.append({ trace_id: input.trace_id, actor: { type: 'agent', id: input.agent_id }, subject: { type: 'live_runtime_run', id: record.run_id }, mandate_id: input.mandate_id, event_type: 'LIVE_RUNTIME_STARTED', payload: runtimeEvidence(record) });

    try {
      const child = spawn(invocation.executable, invocation.args, {
        cwd: workspace, env: environment, windowsHide: true,
        detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe']
      });
      // Observe spawn errors before any awaited persistence or PID check.
      await this.waitForSpawn(child);
      if (!child.pid) throw new Error('Provider process did not expose a process ID.');
      const running = liveRunRecordSchema.parse({ ...record, status: 'running', process_id: child.pid, updated_at: this.clock().toISOString() });
      const timeout = setTimeout(() => this.observe(this.terminate(record.run_id, 'timed-out', 'EXECUTION_TIMEOUT')), input.timeout_seconds * 1000);
      const active: ActiveRun = { child, record: running, outputLines: [], sequence: 0, timeout };
      this.active.set(record.run_id, active);
      this.observeStreams(active);
      child.once('exit', (code) => {
        if (!this.active.has(record.run_id)) return;
        const combined = active.outputLines.join('\n');
        const authRequired = /not authenticated|authentication required|please (?:log|sign) in|missing.*(?:api key|credential)|unauthorized|auth method/iu.test(combined);
        const reason = authRequired ? 'AUTHENTICATION_REQUIRED' : code === 0 ? 'PROVIDER_COMPLETED' : 'PROVIDER_EXIT_NONZERO';
        active.completion = this.complete(record.run_id, code === 0 ? 'succeeded' : 'failed', code, reason, adapter.extractSummary(active.outputLines));
        this.observe(active.completion);
      });
      await this.replaceRun(running);
      await this.endInput(active, invocation.stdin);
      await this.appendOutput(record.run_id, 0, 'lifecycle', `Started ${input.provider} under ${record.trust_mode} policy.`);
      return this.getState();
    } catch (error) {
      const active = this.active.get(record.run_id);
      if (active) await this.failProcess(active, error);
      else if (!(await this.runs.read()).some(run => run.run_id === record.run_id && !['starting', 'running'].includes(run.status))) await this.completeDetached(record, 'failed', 'PROCESS_SPAWN_FAILED', errorMessage(error));
      return this.getState();
    }
  }

  public async cancel(runId: string, reason: string): Promise<LiveRuntimeState> {
    await this.terminate(runId, 'cancelled', `OPERATOR_CANCELLED:${reason}`);
    return this.getState();
  }

  public startFailureProbe(request: StartLiveRunRequest): Promise<LiveRuntimeState> {
    return this.startBuiltInProbe(request, "process.stderr.write('phase30 provider failure probe\\n'); process.exit(17);", 'phase30-provider-failure');
  }

  public startContainmentProbe(request: StartLiveRunRequest): Promise<LiveRuntimeState> {
    return this.startBuiltInProbe(request, "process.stdout.write('phase30 containment probe active\\n'); setInterval(() => {}, 1000);", 'phase30-containment');
  }

  public async prepareForHostRestart(runId: string): Promise<void> {
    const active = this.active.get(runId);
    if (!active) throw new Error('An active restart-recovery probe was not found.');
    clearTimeout(active.timeout);
    const pid = active.child.pid ?? active.record.process_id;
    if (pid) killProcessTree(pid);
    this.active.delete(runId);
    await this.appendOutput(runId, active.sequence + 1, 'lifecycle', 'Host restart checkpoint armed; persisted run intentionally remains active.');
  }

  public async revokePassport(passportId: string, reason = 'PASSPORT_REVOKED'): Promise<void> {
    await Promise.all([...this.active.values()].filter((active) => active.record.passport_id === passportId).map((active) => this.terminate(active.record.run_id, 'revoked', reason)));
  }

  public async revokeBinding(bindingId: string, reason = 'RUNTIME_BINDING_REVOKED'): Promise<void> {
    await Promise.all([...this.active.values()].filter((active) => active.record.binding_id === bindingId).map((active) => this.terminate(active.record.run_id, 'revoked', reason)));
  }

  public async revokeSession(runtimeSessionId: string, reason = 'RUNTIME_SESSION_REVOKED'): Promise<void> {
    await Promise.all([...this.active.values()].filter((active) => active.record.runtime_session_id === runtimeSessionId).map((active) => this.terminate(active.record.run_id, 'revoked', reason)));
  }

  public async shutdown(): Promise<void> {
    await Promise.all([...this.active.keys()].map((runId) => this.terminate(runId, 'cancelled', 'APPLICATION_SHUTDOWN')));
  }

  private async capture(active: ActiveRun, kind: 'stdout' | 'stderr', raw: string): Promise<void> {
    for (const line of raw.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean)) {
      const content = redact(line).slice(0, 4000);
      active.outputLines.push(content);
      if (active.outputLines.length > 500) active.outputLines.shift();
      active.sequence += 1;
      await this.appendOutput(active.record.run_id, active.sequence, looksStructured(content) ? 'provider-event' : kind, content);
    }
  }

  private async startBuiltInProbe(request: StartLiveRunRequest, script: string, argumentPolicy: string): Promise<LiveRuntimeState> {
    const input = startLiveRunRequestSchema.parse(request);
    const workspace = validateWorkspace(input.workspace_path, this.workspaceRoots);
    await this.authority.assertActive(input);
    const now = this.clock().toISOString();
    const record = liveRunRecordSchema.parse({
      run_id: `run_${randomUUID()}`, provider: input.provider, agent_id: input.agent_id, passport_id: input.passport_id,
      binding_id: input.binding_id, runtime_session_id: input.runtime_session_id, mandate_id: input.mandate_id, trace_id: input.trace_id,
      ceremony_id: input.ceremony?.ceremony_id ?? input.ceremony_id, idempotency_key: input.ceremony?.idempotency_key ?? input.idempotency_key,
      workspace_path: workspace, executable: process.execPath, executable_version: process.version,
      argument_policy: [argumentPolicy], environment_keys: Object.keys(invocationEnvironment()).sort(), prompt_hash: hashCanonical(input.prompt),
      trust_mode: 'connected-observed', status: 'starting', started_at: now, updated_at: now
    });
    await this.prependRun(record);
    await this.evidence.append({ trace_id: input.trace_id, actor: { type: 'agent', id: input.agent_id }, subject: { type: 'live_runtime_run', id: record.run_id }, mandate_id: input.mandate_id, event_type: 'LIVE_RUNTIME_STARTED', payload: runtimeEvidence(record) });
    const child = spawn(process.execPath, ['-e', script], { cwd: workspace, env: invocationEnvironment(), windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    await this.waitForSpawn(child);
    if (!child.pid) throw new Error('Control process did not expose a process ID.');
    const running = liveRunRecordSchema.parse({ ...record, status: 'running', process_id: child.pid, updated_at: this.clock().toISOString() });
    const timeout = setTimeout(() => this.observe(this.terminate(record.run_id, 'timed-out', 'EXECUTION_TIMEOUT')), input.timeout_seconds * 1000);
    const active: ActiveRun = { child, record: running, outputLines: [], sequence: 0, timeout };
    this.active.set(record.run_id, active);
    this.observeStreams(active);
    child.once('exit', (code) => {
      if (!this.active.has(record.run_id)) return;
      active.completion = this.complete(record.run_id, code === 0 ? 'succeeded' : 'failed', code, code === 0 ? 'PROVIDER_COMPLETED' : 'PROVIDER_EXIT_NONZERO', active.outputLines.join('\n'));
      this.observe(active.completion);
    });
    await this.replaceRun(running);
    await this.endInput(active);
    await this.appendOutput(record.run_id, 0, 'lifecycle', `Started ${argumentPolicy} under connected-observed policy.`);
    return this.getState();
  }

  private waitForSpawn(child: ChildProcessWithoutNullStreams): Promise<void> {
    return new Promise((resolveSpawn, reject) => {
      child.once('spawn', resolveSpawn);
      // Retain this listener after spawn: late errors must never be unhandled.
      child.on('error', reject);
    });
  }

  private observeStreams(active: ActiveRun): void {
    const failure = (error: Error) => this.observe(this.failProcess(active, error));
    active.child.on('error', failure);
    active.child.stdin.on('error', failure);
    active.child.stdout.on('error', failure);
    active.child.stderr.on('error', failure);
    active.child.stdout.on('data', (chunk: Buffer) => this.observe(this.capture(active, 'stdout', chunk.toString())));
    active.child.stderr.on('data', (chunk: Buffer) => this.observe(this.capture(active, 'stderr', chunk.toString())));
    active.child.once('close', () => {
      if (this.active.get(active.record.run_id) === active) this.observe(this.failProcess(active, new Error('Provider process closed before completion.')));
    });
  }

  private async endInput(active: ActiveRun, input?: string): Promise<void> {
    const child = active.child;
    const stream = child.stdin;
    if (active.completion) { await active.completion; return; }
    if (child.killed || child.exitCode !== null || child.signalCode !== null || stream.destroyed || stream.closed || stream.writableEnded || !stream.writable) {
      await this.failProcess(active, Object.assign(new Error('Provider input pipe is unavailable.'), { code: 'EPIPE' })); return;
    }
    try {
      await new Promise<void>((resolveInput, reject) => {
        // end() queues the bytes once; callback awaits flushing/backpressure. Never replay a prompt.
        let settled = false;
        const finish = (failure?: Error | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          stream.off('error', finish); stream.off('close', closed); child.off('close', closed); child.off('exit', closed);
          if (failure) reject(failure); else resolveInput();
        };
        const closed = () => finish(Object.assign(new Error('Provider input closed before flushing.'), { code: 'EPIPE' }));
        const timer = setTimeout(() => finish(Object.assign(new Error('Provider input did not flush within 30 seconds.'), { code: 'ETIMEDOUT' })), 30_000);
        timer.unref();
        stream.once('error', finish); stream.once('close', closed); child.once('close', closed); child.once('exit', closed);
        try { stream.end(input ?? '', finish); }
        catch (failure) { finish(failure instanceof Error ? failure : new Error(String(failure))); }
      });
    } catch (failure) { await this.failProcess(active, failure); }
    if (active.completion) await active.completion;
  }

  private failProcess(active: ActiveRun, error: unknown): Promise<void> {
    if (active.completion) return active.completion;
    if (this.active.get(active.record.run_id) !== active) return Promise.resolve();
    if (!active.child.killed && active.child.exitCode === null && active.child.signalCode === null) {
      try {
        const pid = active.child.pid ?? active.record.process_id;
        if (pid) killProcessTree(pid); else active.child.kill();
      } catch (failure) { this.backgroundFailure = failure instanceof Error ? failure : new Error(String(failure)); }
    }
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNAVAILABLE';
    active.completion = this.complete(active.record.run_id, 'failed', null, `PROCESS_PIPE_${code}`, errorMessage(error));
    return active.completion;
  }

  private observe(operation: Promise<unknown>): void {
    // Surface persistence failures through the normal status/diagnostics boundary,
    // instead of creating unhandled rejections inside child event callbacks.
    void operation.catch((error: unknown) => { this.backgroundFailure = error instanceof Error ? error : new Error(String(error)); });
  }

  private async terminate(runId: string, status: Extract<LiveRunStatus, 'cancelled' | 'timed-out' | 'revoked'>, reason: string): Promise<void> {
    const active = this.active.get(runId);
    if (!active) {
      const record = (await this.runs.read()).find((item) => item.run_id === runId);
      if (!record) throw new Error('Live runtime run was not found.');
      if (['succeeded', 'failed', 'cancelled', 'timed-out', 'revoked'].includes(record.status)) return;
      await this.completeDetached(record, status, reason, reason);
      return;
    }
    const pid = active.child.pid ?? active.record.process_id;
    if (pid) killProcessTree(pid);
    active.completion ??= this.complete(runId, status, null, reason, reason);
    await active.completion;
  }

  private async complete(runId: string, status: Exclude<LiveRunStatus, 'starting' | 'running'>, exitCode: number | null, reason: string, summary: string): Promise<void> {
    const active = this.active.get(runId);
    if (!active) return;
    clearTimeout(active.timeout);
    this.active.delete(runId);
    const completed = liveRunRecordSchema.parse({ ...active.record, status, exit_code: exitCode, process_id: undefined, termination_reason: reason, output_summary: redact(summary), completed_at: this.clock().toISOString(), updated_at: this.clock().toISOString() });
    await this.appendOutput(runId, active.sequence + 1, 'lifecycle', `${status}: ${reason}`);
    await this.recordCompletion(completed);
    await this.replaceRun(completed);
  }

  private async completeDetached(record: LiveRunRecord, status: Exclude<LiveRunStatus, 'starting' | 'running'>, reason: string, summary: string): Promise<void> {
    const completed = liveRunRecordSchema.parse({ ...record, status, termination_reason: reason, output_summary: redact(summary), completed_at: this.clock().toISOString(), updated_at: this.clock().toISOString() });
    await this.recordCompletion(completed);
    await this.replaceRun(completed);
  }

  private async recordCompletion(record: LiveRunRecord): Promise<void> {
    const eventType = record.status === 'succeeded' ? 'LIVE_RUNTIME_SUCCEEDED' : record.status === 'cancelled' ? 'LIVE_RUNTIME_CANCELLED' : record.status === 'timed-out' ? 'LIVE_RUNTIME_TIMED_OUT' : record.status === 'revoked' ? 'LIVE_RUNTIME_REVOKED' : 'LIVE_RUNTIME_FAILED';
    await this.evidence.append({ trace_id: record.trace_id, actor: { type: 'agent', id: record.agent_id }, subject: { type: 'live_runtime_run', id: record.run_id }, mandate_id: record.mandate_id, event_type: eventType, payload: { ...runtimeEvidence(record), status: record.status, termination_reason: record.termination_reason, exit_code: record.exit_code, output_hash: hashCanonical(record.output_summary ?? '') } });
  }

  private async prependRun(record: LiveRunRecord): Promise<void> {
    await this.persist(async () => { await this.runs.write([record, ...(await this.runs.read())].slice(0, 200)); });
  }

  private async replaceRun(record: LiveRunRecord): Promise<void> {
    await this.persist(async () => { await this.runs.write((await this.runs.read()).map((item) => item.run_id === record.run_id ? record : item)); });
  }

  private async appendOutput(runId: string, sequence: number, kind: RuntimeOutputRecord['kind'], content: string): Promise<void> {
    const record = runtimeOutputRecordSchema.parse({ output_id: `output_${randomUUID()}`, run_id: runId, sequence, kind, content: redact(content), created_at: this.clock().toISOString() });
    await this.persist(async () => { await this.output.write([...(await this.output.read()), record].slice(-1000)); });
  }

  private persist(operation: () => Promise<void>): Promise<void> {
    const result = this.persistenceQueue.then(operation);
    this.persistenceQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function validateWorkspace(value: string, roots: string[]): string {
  const workspace = resolve(value);
  if (!existsSync(workspace) || !statSync(workspace).isDirectory()) throw new Error('Live runtime workspace does not exist.');
  const allowed = roots.map((root) => resolve(root)).some((root) => workspace === root || workspace.startsWith(`${root}${sep}`));
  if (!allowed) throw new Error('Live runtime workspace escapes the approved roots.');
  return workspace;
}

function invocationEnvironment(): NodeJS.ProcessEnv {
  const keys = ['PATH', 'SystemRoot', 'ComSpec', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'LANG'];
  return { ...Object.fromEntries(keys.flatMap((key) => process.env[key] ? [[key, process.env[key]]] : [])), NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', H2A_RUNTIME: '1' };
}

function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, timeout: 5000 });
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already exited */ } }
}

function redact(value: string): string {
  return value
    .replace(/\b(sk-(?:ant-)?[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{12,})\b/gu, '[REDACTED_CREDENTIAL]')
    .replace(/\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret|authorization)\s*[:=]\s*)[^\s,}"']+/giu, '$1[REDACTED]')
    .slice(0, 4000);
}

function runtimeEvidence(record: LiveRunRecord): Record<string, unknown> {
  return { provider: record.provider, passport_id: record.passport_id, binding_id: record.binding_id, runtime_session_id: record.runtime_session_id, trust_mode: record.trust_mode, executable_version: record.executable_version, argument_policy: record.argument_policy, environment_keys: record.environment_keys, prompt_hash: record.prompt_hash, workspace_hash: hashCanonical(record.workspace_path), ceremony_id: record.ceremony_id, idempotency_key: record.idempotency_key };
}

function looksStructured(value: string): boolean { try { JSON.parse(value); return true; } catch { return false; } }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Live provider process failed.'; }
