import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  attachTerminalRequestSchema,
  runtimeAttachmentStateSchema,
  startTerminalSessionRequestSchema,
  terminalAttachmentLeaseSchema,
  terminalCancelRequestSchema,
  terminalInputRequestSchema,
  terminalLeaseRequestSchema,
  terminalReplayEventSchema,
  terminalReplayRequestSchema,
  terminalReplayResponseSchema,
  terminalResizeRequestSchema,
  terminalSessionSchema,
  type AttachTerminalRequest,
  type RuntimeAttachmentState,
  type StartLiveRunRequest,
  type StartTerminalSessionRequest,
  type TerminalAttachmentLease,
  type TerminalCancelRequest,
  type TerminalInputRequest,
  type TerminalLeaseCapability,
  type TerminalLeaseRequest,
  type TerminalReplayEvent,
  type TerminalReplayRequest,
  type TerminalReplayResponse,
  type TerminalResizeRequest,
  type TerminalSession,
  type TerminalSessionStatus
} from '@h2a/contracts';
import { hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';
import type { LiveRuntimeAuthorityPort } from './processSupervisor';
import { LiveProviderAdapterRegistry, type LiveProviderRegistryPort } from './liveProviderAdapters';
import { RuntimeTransportRegistry, type PtyProcessPort } from './runtimeTransport';

const sessionsSchema = z.array(terminalSessionSchema);
const leasesSchema = z.array(terminalAttachmentLeaseSchema);
const eventsSchema = z.array(terminalReplayEventSchema);
const MAX_EVENTS = 2000;
const MAX_SESSION_EVENTS = 500;
const MAX_PENDING_BYTES = 256 * 1024;

export interface RuntimeAttachmentLimits {
  maxEvents?: number;
  maxSessionEvents?: number;
  maxPendingBytes?: number;
}

interface ActiveTerminal {
  pty: PtyProcessPort;
  request: StartLiveRunRequest;
  pendingBytes: number;
  backpressureRecorded: boolean;
}

export class RuntimeAttachmentService {
  private readonly sessions: VersionedJsonRepository<'h2a.runtime.terminal-sessions', TerminalSession[]>;
  private readonly leases: VersionedJsonRepository<'h2a.runtime.terminal-leases', TerminalAttachmentLease[]>;
  private readonly events: VersionedJsonRepository<'h2a.runtime.terminal-events', TerminalReplayEvent[]>;
  private readonly active = new Map<string, ActiveTerminal>();
  private readonly finishing = new Set<string>();
  private readonly configurationRoot: string;
  private persistenceQueue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly authority: LiveRuntimeAuthorityPort,
    private readonly adapters: LiveProviderRegistryPort = new LiveProviderAdapterRegistry(),
    private readonly transports: RuntimeTransportRegistry = new RuntimeTransportRegistry(),
    private readonly workspaceRoots: string[] = [process.cwd()],
    private readonly clock: () => Date = () => new Date(),
    private readonly limits: RuntimeAttachmentLimits = {}
  ) {
    const store = new AtomicFileStore(dataPath);
    this.configurationRoot = join(dataPath, 'runtime', 'provider-config');
    this.sessions = new VersionedJsonRepository(store, 'runtime/terminal-sessions.json', 'h2a.runtime.terminal-sessions', sessionsSchema, { initialData: [], clock });
    this.leases = new VersionedJsonRepository(store, 'runtime/terminal-leases.json', 'h2a.runtime.terminal-leases', leasesSchema, { initialData: [], clock });
    this.events = new VersionedJsonRepository(store, 'runtime/terminal-events.json', 'h2a.runtime.terminal-events', eventsSchema, { initialData: [], clock });
  }

  public async initialize(): Promise<RuntimeAttachmentState> {
    const now = this.clock().toISOString();
    const sessions = await this.sessions.read();
    const interrupted = sessions.filter((session) => ['starting', 'running', 'awaiting-input'].includes(session.status));
    if (interrupted.length) {
      await this.sessions.write(sessions.map((session) => interrupted.some((item) => item.session_id === session.session_id)
        ? terminalSessionSchema.parse({ ...session, status: 'failed', process_id: undefined, termination_reason: 'HOST_PROCESS_RESTARTED', completed_at: now, updated_at: now })
        : session));
      for (const session of interrupted) await this.appendEvent(session.session_id, 'failed', 'HOST_PROCESS_RESTARTED');
    }
    await this.revokeAllLeases('HOST_PROCESS_RESTARTED');
    await this.events.read();
    return this.getState();
  }

  public async getState(): Promise<RuntimeAttachmentState> {
    await this.expireLeases();
    const [sessions, leases, events] = await Promise.all([this.sessions.read(), this.leases.read(), this.events.read()]);
    return runtimeAttachmentStateSchema.parse({
      transports: this.transports.descriptors(), sessions: sessions.slice(0, 100), leases: leases.slice(0, 200),
      events: events.slice(-(this.limits.maxEvents ?? MAX_EVENTS)), trust_ceiling: 'connected-observed'
    });
  }

  public async start(request: StartTerminalSessionRequest): Promise<RuntimeAttachmentState> {
    const input = startTerminalSessionRequestSchema.parse(request);
    const workspace = validateWorkspace(input.workspace_path, this.workspaceRoots);
    const authorityRequest = toAuthorityRequest(input, workspace);
    await this.authority.assertActive(authorityRequest);
    if ([...this.active.values()].some((item) => item.request.runtime_session_id === input.runtime_session_id)) {
      throw new Error('Runtime session already has an active provider process.');
    }
    const adapter = this.adapters.get(input.provider);
    if (!adapter.buildInteractiveInvocation) throw new Error(`Provider ${input.provider} does not expose an approved interactive invocation.`);
    const invocation = adapter.buildInteractiveInvocation(input.purpose, workspace);
    const now = this.clock().toISOString();
    const sessionId = `term_${randomUUID()}`;
    const runId = `run_${randomUUID()}`;
    const configurationScope = input.provider === 'openai-codex' ? 'agent-isolated' : 'host-provider-default';
    const session = terminalSessionSchema.parse({
      session_id: sessionId, run_id: runId, provider: input.provider, transport: 'interactive-pty', purpose: input.purpose,
      agent_id: input.agent_id, passport_id: input.passport_id, binding_id: input.binding_id,
      runtime_session_id: input.runtime_session_id, mandate_id: input.mandate_id, trace_id: input.trace_id,
      workspace_path: workspace, executable_version: invocation.version, argument_policy: invocation.argumentPolicy,
      configuration_scope: configurationScope, trust_mode: 'connected-observed', status: 'starting',
      cols: input.cols, rows: input.rows, first_cursor: 0, last_cursor: 0, output_hash: hashCanonical([]),
      started_at: now, updated_at: now
    });
    await this.prependSession(session);
    await this.evidence.append({
      trace_id: input.trace_id, actor: { type: 'agent', id: input.agent_id }, subject: { type: 'runtime_attachment', id: sessionId },
      mandate_id: input.mandate_id, event_type: 'RUNTIME_ATTACHMENT_STARTED',
      payload: attachmentEvidence(session)
    });
    try {
      const configurationPath = join(this.configurationRoot, safeSegment(input.agent_id), input.provider);
      if (configurationScope === 'agent-isolated') mkdirSync(configurationPath, { recursive: true });
      const terminal = this.transports.pty.spawn(invocation.executable, invocation.args, {
        name: 'xterm-256color', cols: input.cols, rows: input.rows, cwd: workspace,
        env: invocationEnvironment(input.provider === 'openai-codex' ? { CODEX_HOME: configurationPath } : {})
      });
      const running = terminalSessionSchema.parse({ ...session, process_id: terminal.pid, status: 'running', updated_at: this.clock().toISOString() });
      await this.replaceSession(running);
      this.active.set(sessionId, { pty: terminal, request: authorityRequest, pendingBytes: 0, backpressureRecorded: false });
      terminal.onData((data) => this.capture(sessionId, data));
      terminal.onExit(({ exitCode }) => { void this.complete(sessionId, exitCode === 0 ? 'exited' : 'failed', exitCode === 0 ? 'PROVIDER_EXITED' : 'PROVIDER_EXIT_NONZERO'); });
      await this.appendEvent(sessionId, 'started', `Attached ${input.provider} terminal started under connected-observed policy.`);
    } catch (error) {
      await this.completeDetached(session, 'failed', 'PTY_SPAWN_FAILED', errorMessage(error));
    }
    return this.getState();
  }

  public async attach(request: AttachTerminalRequest): Promise<TerminalAttachmentLease> {
    const input = attachTerminalRequestSchema.parse(request);
    await this.expireLeases();
    const session = (await this.sessions.read()).find((item) => item.session_id === input.session_id);
    if (!session || !['running', 'awaiting-input'].includes(session.status) || !this.active.has(session.session_id)) throw new Error('Terminal session is not active.');
    const leases = await this.leases.read();
    const now = this.clock();
    for (const capability of input.requested_capabilities.filter((value) => value !== 'observe')) {
      const owner = leases.find((lease) => !lease.detached_at && !lease.revoked_reason && new Date(lease.expires_at) > now && lease.capabilities.includes(capability));
      if (owner && owner.client_id !== input.client_id) throw new Error(`TERMINAL_${capability.toUpperCase()}_OWNED`);
    }
    const lease = terminalAttachmentLeaseSchema.parse({
      lease_id: `tlease_${randomUUID()}`, session_id: input.session_id, client_id: input.client_id, generation: `tgen_${randomUUID()}`,
      capabilities: [...new Set(input.requested_capabilities)], issued_at: now.toISOString(),
      expires_at: new Date(now.getTime() + input.ttl_seconds * 1000).toISOString()
    });
    await this.leases.write([lease, ...leases].slice(0, 200));
    return lease;
  }

  public async detach(request: TerminalLeaseRequest): Promise<void> {
    const input = terminalLeaseRequestSchema.parse(request);
    const lease = await this.assertLease(input, 'observe', true);
    await this.replaceLease({ ...lease, detached_at: this.clock().toISOString() });
  }

  public async replay(request: TerminalReplayRequest): Promise<TerminalReplayResponse> {
    const input = terminalReplayRequestSchema.parse(request);
    await this.assertLease(input, 'observe');
    const session = (await this.sessions.read()).find((item) => item.session_id === input.session_id);
    if (!session) throw new Error('Terminal session was not found.');
    const events = (await this.events.read()).filter((event) => event.session_id === input.session_id);
    const first = events[0]?.cursor ?? session.last_cursor;
    const gap = input.after_cursor > 0 && first > input.after_cursor + 1;
    return terminalReplayResponseSchema.parse({
      mode: gap ? 'snapshot-required' : 'events', session,
      events: gap ? [] : events.filter((event) => event.cursor > input.after_cursor).slice(0, 500),
      first_available_cursor: first, last_cursor: session.last_cursor
    });
  }

  public async write(request: TerminalInputRequest): Promise<void> {
    const input = terminalInputRequestSchema.parse(request);
    await this.assertLease(input, 'interact');
    const active = await this.assertAuthority(input.session_id);
    active.pty.write(input.data);
  }

  public async resize(request: TerminalResizeRequest): Promise<void> {
    const input = terminalResizeRequestSchema.parse(request);
    await this.assertLease(input, 'interact');
    const active = this.active.get(input.session_id);
    if (!active) throw new Error('Terminal process is not active.');
    active.pty.resize(input.cols, input.rows);
    const session = (await this.sessions.read()).find((item) => item.session_id === input.session_id);
    if (session) await this.replaceSession(terminalSessionSchema.parse({ ...session, cols: input.cols, rows: input.rows, updated_at: this.clock().toISOString() }));
  }

  public async cancel(request: TerminalCancelRequest): Promise<RuntimeAttachmentState> {
    const input = terminalCancelRequestSchema.parse(request);
    await this.assertLease(input, 'control');
    await this.assertAuthority(input.session_id);
    await this.terminate(input.session_id, 'cancelled', `OPERATOR_CANCELLED:${input.reason}`);
    return this.getState();
  }

  public async revokePassport(passportId: string): Promise<void> {
    await this.revokeMatching((session) => session.passport_id === passportId, 'PASSPORT_REVOKED');
  }

  public async revokeBinding(bindingId: string): Promise<void> {
    await this.revokeMatching((session) => session.binding_id === bindingId, 'RUNTIME_BINDING_REVOKED');
  }

  public async revokeSession(runtimeSessionId: string): Promise<void> {
    await this.revokeMatching((session) => session.runtime_session_id === runtimeSessionId, 'RUNTIME_SESSION_REVOKED');
  }

  public async shutdown(): Promise<void> {
    await Promise.all([...this.active.keys()].map((sessionId) => this.terminate(sessionId, 'cancelled', 'APPLICATION_SHUTDOWN')));
    await this.revokeAllLeases('APPLICATION_SHUTDOWN');
  }

  public async flushPersistence(): Promise<void> {
    await this.persistenceQueue;
  }

  private capture(sessionId: string, raw: string): void {
    const active = this.active.get(sessionId);
    if (!active) return;
    const byteCount = Buffer.byteLength(raw);
    if (active.pendingBytes + byteCount > (this.limits.maxPendingBytes ?? MAX_PENDING_BYTES)) {
      if (!active.backpressureRecorded) {
        active.backpressureRecorded = true;
        void this.appendEvent(sessionId, 'activity', '[OUTPUT_BACKPRESSURE_APPLIED]');
      }
      return;
    }
    active.pendingBytes += byteCount;
    const chunks = chunk(redact(raw), 4000);
    void Promise.all(chunks.map((content) => this.appendEvent(sessionId, telemetryKind(content), content)))
      .finally(() => { const current = this.active.get(sessionId); if (current) { current.pendingBytes = Math.max(0, current.pendingBytes - byteCount); if (current.pendingBytes === 0) current.backpressureRecorded = false; } });
  }

  private async assertAuthority(sessionId: string): Promise<ActiveTerminal> {
    const active = this.active.get(sessionId);
    if (!active) throw new Error('Terminal process is not active.');
    try { await this.authority.assertActive(active.request); }
    catch (error) {
      await this.terminate(sessionId, 'revoked', 'RUNTIME_AUTHORITY_INACTIVE');
      throw error;
    }
    return active;
  }

  private async assertLease(input: TerminalLeaseRequest, capability: TerminalLeaseCapability, allowDetached = false): Promise<TerminalAttachmentLease> {
    await this.expireLeases();
    const lease = (await this.leases.read()).find((item) => item.lease_id === input.lease_id);
    if (!lease || lease.session_id !== input.session_id || lease.client_id !== input.client_id || lease.generation !== input.generation) throw new Error('TERMINAL_LEASE_STALE');
    if ((!allowDetached && lease.detached_at) || lease.revoked_reason || new Date(lease.expires_at) <= this.clock()) throw new Error('TERMINAL_LEASE_STALE');
    if (!lease.capabilities.includes(capability)) throw new Error(`TERMINAL_${capability.toUpperCase()}_CAPABILITY_REQUIRED`);
    return lease;
  }

  private async terminate(sessionId: string, status: Extract<TerminalSessionStatus, 'cancelled' | 'revoked'>, reason: string): Promise<void> {
    if (this.finishing.has(sessionId)) return;
    this.finishing.add(sessionId);
    const active = this.active.get(sessionId);
    if (active) {
      this.active.delete(sessionId);
      killProcessTree(active.pty.pid);
      try { active.pty.kill(); } catch { /* Process tree already exited. */ }
    }
    try {
      const session = (await this.sessions.read()).find((item) => item.session_id === sessionId);
      if (!session || ['exited', 'failed', 'cancelled', 'revoked'].includes(session.status)) return;
      await this.finish(session, status, reason);
    } finally { this.finishing.delete(sessionId); }
  }

  private async complete(sessionId: string, status: Extract<TerminalSessionStatus, 'exited' | 'failed'>, reason: string): Promise<void> {
    if (this.finishing.has(sessionId)) return;
    this.finishing.add(sessionId);
    const session = (await this.sessions.read()).find((item) => item.session_id === sessionId);
    try {
      if (!session || ['exited', 'failed', 'cancelled', 'revoked'].includes(session.status)) return;
      this.active.delete(sessionId);
      await this.finish(session, status, reason);
    } finally { this.finishing.delete(sessionId); }
  }

  private async completeDetached(session: TerminalSession, status: 'failed', reason: string, detail: string): Promise<void> {
    await this.appendEvent(session.session_id, 'failed', detail);
    await this.finish(session, status, reason);
  }

  private async finish(session: TerminalSession, status: Extract<TerminalSessionStatus, 'exited' | 'failed' | 'cancelled' | 'revoked'>, reason: string): Promise<void> {
    const now = this.clock().toISOString();
    await this.appendEvent(session.session_id, status === 'cancelled' ? 'cancelled' : status === 'exited' ? 'exited' : 'failed', reason);
    const latest = (await this.sessions.read()).find((item) => item.session_id === session.session_id) ?? session;
    const completed = terminalSessionSchema.parse({ ...latest, status, process_id: undefined, termination_reason: reason, completed_at: now, updated_at: now });
    await this.replaceSession(completed);
    await this.revokeSessionLeases(session.session_id, `SESSION_${status.toUpperCase()}`);
    await this.evidence.append({
      trace_id: session.trace_id, actor: { type: 'agent', id: session.agent_id }, subject: { type: 'runtime_attachment', id: session.session_id },
      mandate_id: session.mandate_id, event_type: status === 'exited' ? 'RUNTIME_ATTACHMENT_EXITED' : status === 'cancelled' ? 'RUNTIME_ATTACHMENT_CANCELLED' : status === 'revoked' ? 'RUNTIME_ATTACHMENT_REVOKED' : 'RUNTIME_ATTACHMENT_FAILED',
      payload: { ...attachmentEvidence(completed), termination_reason: reason, output_hash: completed.output_hash }
    });
  }

  private async appendEvent(sessionId: string, kind: TerminalReplayEvent['kind'], content = ''): Promise<void> {
    await this.persist(async () => {
      const session = (await this.sessions.read()).find((item) => item.session_id === sessionId);
      if (!session) return;
      const existing = await this.events.read();
      const cursor = session.last_cursor + 1;
      const safe = redact(content).slice(0, 4000);
      const event = terminalReplayEventSchema.parse({
        event_id: `tevt_${randomUUID()}`, session_id: sessionId, run_id: session.run_id, cursor, kind,
        content: safe || undefined, content_hash: hashCanonical(safe), byte_count: Buffer.byteLength(safe), created_at: this.clock().toISOString()
      });
      const all = [...existing, event];
      const sessionEvents = all.filter((item) => item.session_id === sessionId);
      const retainedSessionIds = new Set(sessionEvents.slice(-(this.limits.maxSessionEvents ?? MAX_SESSION_EVENTS)).map((item) => item.event_id));
      const retained = all.filter((item) => item.session_id !== sessionId || retainedSessionIds.has(item.event_id)).slice(-(this.limits.maxEvents ?? MAX_EVENTS));
      await this.events.write(retained);
      const firstCursor = retained.find((item) => item.session_id === sessionId)?.cursor ?? cursor;
      const nextStatus = kind === 'awaiting-input' && session.status === 'running' ? 'awaiting-input' : kind === 'activity' && session.status === 'awaiting-input' ? 'running' : session.status;
      await this.sessions.write((await this.sessions.read()).map((item) => item.session_id === sessionId
        ? terminalSessionSchema.parse({ ...item, status: nextStatus, first_cursor: firstCursor, last_cursor: cursor, output_hash: hashCanonical([item.output_hash, event.content_hash]), updated_at: this.clock().toISOString() })
        : item));
    });
  }

  private async revokeMatching(predicate: (session: TerminalSession) => boolean, reason: string): Promise<void> {
    const sessions = (await this.sessions.read()).filter((session) => predicate(session) && ['starting', 'running', 'awaiting-input'].includes(session.status));
    await Promise.all(sessions.map((session) => this.terminate(session.session_id, 'revoked', reason)));
  }

  private async expireLeases(): Promise<void> {
    const now = this.clock();
    const leases = await this.leases.read();
    let changed = false;
    const next = leases.map((lease) => {
      if (!lease.detached_at && !lease.revoked_reason && new Date(lease.expires_at) <= now) { changed = true; return { ...lease, revoked_reason: 'LEASE_EXPIRED' }; }
      return lease;
    });
    if (changed) await this.leases.write(next.map((lease) => terminalAttachmentLeaseSchema.parse(lease)));
  }

  private async revokeAllLeases(reason: string): Promise<void> {
    const leases = await this.leases.read();
    await this.leases.write(leases.map((lease) => terminalAttachmentLeaseSchema.parse(lease.revoked_reason || lease.detached_at ? lease : { ...lease, revoked_reason: reason })));
  }

  private async revokeSessionLeases(sessionId: string, reason: string): Promise<void> {
    const leases = await this.leases.read();
    await this.leases.write(leases.map((lease) => terminalAttachmentLeaseSchema.parse(lease.session_id === sessionId && !lease.revoked_reason ? { ...lease, revoked_reason: reason } : lease)));
  }

  private async replaceLease(lease: TerminalAttachmentLease): Promise<void> {
    await this.leases.write((await this.leases.read()).map((item) => item.lease_id === lease.lease_id ? terminalAttachmentLeaseSchema.parse(lease) : item));
  }

  private async prependSession(session: TerminalSession): Promise<void> {
    await this.persist(async () => { await this.sessions.write([session, ...(await this.sessions.read())].slice(0, 100)); });
  }

  private async replaceSession(session: TerminalSession): Promise<void> {
    await this.persist(async () => { await this.sessions.write((await this.sessions.read()).map((item) => item.session_id === session.session_id ? session : item)); });
  }

  private persist(operation: () => Promise<void>): Promise<void> {
    const result = this.persistenceQueue.then(operation);
    this.persistenceQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function toAuthorityRequest(input: StartTerminalSessionRequest, workspace: string): StartLiveRunRequest {
  return {
    provider: input.provider, agent_id: input.agent_id, passport_id: input.passport_id, binding_id: input.binding_id,
    runtime_session_id: input.runtime_session_id, mandate_id: input.mandate_id, trace_id: input.trace_id,
    workspace_path: workspace, prompt: `Open approved ${input.purpose} terminal.`, timeout_seconds: 600
  };
}

function validateWorkspace(value: string, roots: string[]): string {
  const workspace = resolve(value);
  if (!existsSync(workspace) || !statSync(workspace).isDirectory()) throw new Error('Runtime attachment workspace does not exist.');
  if (!roots.map((root) => resolve(root)).some((root) => workspace === root || workspace.startsWith(`${root}${sep}`))) throw new Error('Runtime attachment workspace escapes the approved roots.');
  return workspace;
}

function invocationEnvironment(overrides: Record<string, string>): Record<string, string> {
  const keys = ['PATH', 'SystemRoot', 'ComSpec', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'LANG', 'TERM'];
  return { ...Object.fromEntries(keys.flatMap((key) => process.env[key] ? [[key, process.env[key]!]] : [])), TERM: 'xterm-256color', H2A_RUNTIME: '1', ...overrides };
}

function killProcessTree(pid: number): void {
  if (process.platform === 'win32') { spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, timeout: 5000 }); return; }
  try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already exited */ } }
}

function telemetryKind(content: string): TerminalReplayEvent['kind'] {
  if (/press enter|continue\?|awaiting input|select an option|login|authenticate|consent/iu.test(content)) return 'awaiting-input';
  if (/turn complete|completed|success|result/iu.test(content)) return 'turn-complete';
  if (/working|thinking|running|tool/iu.test(content)) return 'activity';
  return 'output-reference';
}

function redact(value: string): string {
  return value
    .replace(/\b(sk-(?:ant-)?[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{12,})\b/gu, '[REDACTED_CREDENTIAL]')
    .replace(/\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret|authorization)\s*[:=]\s*)[^\s,}"']+/giu, '$1[REDACTED]');
}

function chunk(value: string, size: number): string[] {
  if (!value) return [];
  const output: string[] = [];
  for (let index = 0; index < value.length; index += size) output.push(value.slice(index, index + size));
  return output;
}

function attachmentEvidence(session: TerminalSession): Record<string, unknown> {
  return {
    run_id: session.run_id, provider: session.provider, transport: session.transport, purpose: session.purpose,
    passport_id: session.passport_id, binding_id: session.binding_id, runtime_session_id: session.runtime_session_id,
    argument_policy: session.argument_policy, configuration_scope: session.configuration_scope, trust_mode: session.trust_mode
  };
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function safeSegment(value: string): string { return value.replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 120); }
