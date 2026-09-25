import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LiveProviderAdapterRegistry,
  RuntimeAttachmentService,
  RuntimeTransportRegistry,
  type LiveProviderAdapter,
  type LiveProviderRegistryPort,
  type LiveRuntimeAuthorityPort,
  type ProviderInvocation,
  type PtyFactoryPort,
  type PtyProcessPort
} from '@h2a/agents';
import type { LiveProviderStatus, StartLiveRunRequest, TerminalAttachmentLease } from '@h2a/contracts';
import { LocalAuthorityEventLedger } from '@h2a/evidence';

const services: RuntimeAttachmentService[] = [];
const roots: string[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.shutdown();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

describe('Phase 39 hybrid runtime transport', () => {
  it('keeps structured CLI as default and exposes fixed safe official interactive policies', () => {
    const registry = new LiveProviderAdapterRegistry();
    const statuses = registry.probe();
    for (const provider of ['claude-code', 'openai-codex', 'gemini-antigravity'] as const) {
      const adapter = registry.get(provider);
      const status = statuses.find((item) => item.provider === provider);
      expect(status?.health).not.toBe('dependency-missing');
      expect(status?.executable).toBeTruthy();
      expect(status?.version).toBeTruthy();
      for (const purpose of ['login-consent', 'interactive-session'] as const) {
        const invocation = adapter.buildInteractiveInvocation?.(purpose, process.cwd());
        expect(invocation).toBeDefined();
        expect(invocation!.args.join(' ')).not.toMatch(/dangerously|bypass|skip.permissions|yolo|auto.approve/iu);
        expect(invocation!.argumentPolicy.some((policy) => purpose === 'login-consent' ? policy.includes('login-consent') : policy === 'interactive')).toBe(true);
      }
    }
    expect(new RuntimeTransportRegistry(new FakePtyFactory()).descriptors().map((item) => item.kind)).toEqual(['structured-cli', 'framework-stdio', 'interactive-pty']);
  });

  it('supports multiple observers, one input owner, resize, detach without termination, replay, and control cancellation', async () => {
    const fixture = await createFixture();
    const state = await fixture.service.start(startRequest(fixture.workspace));
    const session = state.sessions[0];
    const observerA = await fixture.service.attach({ session_id: session.session_id, client_id: 'observer-a', requested_capabilities: ['observe'], ttl_seconds: 30 });
    await fixture.service.attach({ session_id: session.session_id, client_id: 'observer-b', requested_capabilities: ['observe'], ttl_seconds: 30 });
    const owner = await fixture.service.attach({ session_id: session.session_id, client_id: 'operator', requested_capabilities: ['observe', 'interact', 'control'], ttl_seconds: 30 });
    await expect(fixture.service.attach({ session_id: session.session_id, client_id: 'other', requested_capabilities: ['interact'], ttl_seconds: 30 })).rejects.toThrow('TERMINAL_INTERACT_OWNED');

    fixture.pty.emit('provider activity\r\nawaiting input\r\n');
    await waitFor(async () => (await fixture.service.getState()).events.some((event) => event.kind === 'awaiting-input'));
    const replay = await fixture.service.replay({ ...key(observerA), after_cursor: 0 });
    expect(replay.events.map((event) => event.content).join('')).toContain('provider activity');
    await fixture.service.write({ ...key(owner), data: 'approved\r' });
    await fixture.service.resize({ ...key(owner), cols: 132, rows: 42 });
    expect(fixture.pty.writes).toContain('approved\r');
    expect(fixture.pty.size).toEqual({ cols: 132, rows: 42 });
    await fixture.service.detach(key(observerA));
    expect(fixture.pty.killed).toBe(false);
    const reattached = await fixture.service.attach({ session_id: session.session_id, client_id: 'renderer-reload', requested_capabilities: ['observe'], ttl_seconds: 30 });
    expect((await fixture.service.replay({ ...key(reattached), after_cursor: 0 })).events.length).toBeGreaterThan(0);
    expect(fixture.pty.killed).toBe(false);
    await fixture.service.cancel({ ...key(owner), reason: 'Phase 39 cancellation proof.' });
    expect(fixture.pty.killed).toBe(true);
    expect((await fixture.service.getState()).sessions[0]).toMatchObject({ status: 'cancelled', termination_reason: 'OPERATOR_CANCELLED:Phase 39 cancellation proof.' });
  });

  it('fails stale leases and terminates the PTY when live authority expires', async () => {
    let now = new Date('2026-08-27T10:00:00.000Z');
    const fixture = await createFixture(() => now);
    const session = (await fixture.service.start(startRequest(fixture.workspace))).sessions[0];
    const stale = await fixture.service.attach({ session_id: session.session_id, client_id: 'stale', requested_capabilities: ['observe', 'interact'], ttl_seconds: 5 });
    now = new Date(now.getTime() + 6_000);
    await expect(fixture.service.write({ ...key(stale), data: 'blocked' })).rejects.toThrow('TERMINAL_LEASE_STALE');
    const owner = await fixture.service.attach({ session_id: session.session_id, client_id: 'current', requested_capabilities: ['observe', 'interact'], ttl_seconds: 30 });
    fixture.authority.deny = true;
    await expect(fixture.service.write({ ...key(owner), data: 'blocked' })).rejects.toThrow('Runtime authority is inactive');
    await expect(fixture.service.cancel({ ...key(owner), reason: 'must remain blocked' })).rejects.toThrow('TERMINAL_LEASE_STALE');
    expect(fixture.pty.killed).toBe(true);
    expect((await fixture.service.getState()).sessions[0].status).toBe('revoked');
  });

  it('applies bounded backpressure and marks an interrupted host session failed on restart', async () => {
    const fixture = await createFixture(() => new Date(), { maxEvents: 20, maxSessionEvents: 3, maxPendingBytes: 1024 });
    const session = (await fixture.service.start(startRequest(fixture.workspace))).sessions[0];
    fixture.pty.emit('x'.repeat(2048));
    await waitFor(async () => (await fixture.service.getState()).events.some((event) => event.content === '[OUTPUT_BACKPRESSURE_APPLIED]'));
    fixture.pty.emit('one\r\n');
    await waitFor(async () => (await fixture.service.getState()).sessions[0].last_cursor >= 3);
    fixture.pty.emit('two\r\n');
    fixture.pty.emit('three\r\n');
    fixture.pty.emit('four\r\n');
    await waitFor(async () => (await fixture.service.getState()).sessions[0].last_cursor >= 6);
    const observer = await fixture.service.attach({ session_id: session.session_id, client_id: 'late-renderer', requested_capabilities: ['observe'], ttl_seconds: 30 });
    const gap = await fixture.service.replay({ ...key(observer), after_cursor: 1 });
    expect(gap).toMatchObject({ mode: 'snapshot-required', events: [] });
    await fixture.service.flushPersistence();
    const recovered = new RuntimeAttachmentService(fixture.root, fixture.ledger, fixture.authority, fixture.registry, new RuntimeTransportRegistry(new FakePtyFactory()), [fixture.workspace]);
    services.push(recovered);
    const state = await recovered.initialize();
    expect(state.sessions.find((item) => item.session_id === session.session_id)).toMatchObject({ status: 'failed', termination_reason: 'HOST_PROCESS_RESTARTED' });
    expect((await fixture.ledger.list()).some((event) => event.event_type === 'RUNTIME_ATTACHMENT_STARTED')).toBe(true);
  });

  it.runIf(process.platform === 'win32')('spawns a real Windows ConPTY, writes and resizes it, then kills its process tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2a-phase39-conpty-'));
    roots.push(root);
    const workspace = join(root, 'workspace');
    await mkdir(workspace);
    const ledger = new LocalAuthorityEventLedger(root);
    const authority = new FixtureAuthority();
    const adapter = new CmdAdapter();
    const registry: LiveProviderRegistryPort = { get: () => adapter, probe: () => [adapter.probe()] };
    const service = new RuntimeAttachmentService(root, ledger, authority, registry, new RuntimeTransportRegistry(), [workspace]);
    services.push(service);
    await service.initialize();
    const session = (await service.start(startRequest(workspace))).sessions[0];
    const lease = await service.attach({ session_id: session.session_id, client_id: 'windows-test', requested_capabilities: ['observe', 'interact', 'control'], ttl_seconds: 30 });
    await service.write({ ...key(lease), data: 'echo PHASE39_WINDOWS_PTY\r' });
    await service.resize({ ...key(lease), cols: 120, rows: 36 });
    await waitFor(async () => (await service.getState()).events.some((event) => event.content?.includes('PHASE39_WINDOWS_PTY')));
    await service.cancel({ ...key(lease), reason: 'Real ConPTY cancellation.' });
    expect((await service.getState()).sessions[0].status).toBe('cancelled');
  }, 30_000);
});

async function createFixture(clock: () => Date = () => new Date(), limits: { maxEvents?: number; maxSessionEvents?: number; maxPendingBytes?: number } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase39-'));
  roots.push(root);
  const workspace = join(root, 'workspace');
  await mkdir(workspace);
  const ledger = new LocalAuthorityEventLedger(root);
  const authority = new FixtureAuthority();
  const pty = new FakePty();
  const factory = new FakePtyFactory(pty);
  const adapter = new FixtureAdapter();
  const registry: LiveProviderRegistryPort = { get: () => adapter, probe: () => [adapter.probe()] };
  const service = new RuntimeAttachmentService(root, ledger, authority, registry, new RuntimeTransportRegistry(factory), [workspace], clock, limits);
  services.push(service);
  await service.initialize();
  return { root, workspace, ledger, authority, pty, registry, service };
}

class FixtureAuthority implements LiveRuntimeAuthorityPort {
  public deny = false;
  public async assertActive(_request: StartLiveRunRequest): Promise<void> { if (this.deny) throw new Error('Runtime authority is inactive.'); }
}

class FixtureAdapter implements LiveProviderAdapter {
  public readonly provider = 'claude-code' as const;
  public probe(): LiveProviderStatus { return { provider: this.provider, health: 'ready', executable: process.execPath, version: process.version, detail: 'Fixture ready.', trust_mode: 'connected-observed', checked_at: new Date().toISOString() }; }
  public buildInvocation() { return { executable: process.execPath, args: [], argumentPolicy: ['fixture'] }; }
  public buildInteractiveInvocation(): ProviderInvocation { return { executable: process.execPath, args: [], argumentPolicy: ['interactive', 'fixture'], version: process.version }; }
  public extractSummary(lines: string[]) { return lines.at(-1) ?? ''; }
}

class CmdAdapter extends FixtureAdapter {
  public override buildInteractiveInvocation(): ProviderInvocation { return { executable: process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/q'], argumentPolicy: ['interactive', 'windows-conpty', 'no-bypass'], version: process.version }; }
}

class FakePtyFactory implements PtyFactoryPort {
  public constructor(private readonly instance = new FakePty()) {}
  public spawn(): PtyProcessPort { return this.instance; }
}

class FakePty implements PtyProcessPort {
  public readonly pid = 424242;
  public readonly writes: string[] = [];
  public size = { cols: 100, rows: 28 };
  public killed = false;
  private dataListener: (data: string) => void = () => undefined;
  private exitListener: (event: { exitCode: number }) => void = () => undefined;
  public onData(listener: (data: string) => void) { this.dataListener = listener; return { dispose: () => { this.dataListener = () => undefined; } }; }
  public onExit(listener: (event: { exitCode: number }) => void) { this.exitListener = listener; return { dispose: () => { this.exitListener = () => undefined; } }; }
  public write(data: string): void { this.writes.push(data); }
  public resize(cols: number, rows: number): void { this.size = { cols, rows }; }
  public kill(): void { this.killed = true; }
  public emit(data: string): void { this.dataListener(data); }
  public exit(exitCode: number): void { this.exitListener({ exitCode }); }
}

function startRequest(workspace: string) {
  return {
    provider: 'claude-code' as const, purpose: 'interactive-session' as const, agent_id: 'agent_phase39', passport_id: 'passport_phase39',
    binding_id: 'binding_phase39', runtime_session_id: 'runtime_phase39', mandate_id: 'mandate_phase39', trace_id: 'trace_phase39',
    workspace_path: workspace, cols: 100, rows: 28
  };
}

function key(lease: TerminalAttachmentLease) {
  return { lease_id: lease.lease_id, session_id: lease.session_id, client_id: lease.client_id, generation: lease.generation };
}

async function waitFor(check: () => Promise<boolean>, attempts = 400): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 25)); }
  throw new Error('Phase 39 condition was not observed.');
}
