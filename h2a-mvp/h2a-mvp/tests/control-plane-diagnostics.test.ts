import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DurableDiagnostics } from '../apps/desktop/main/diagnostics';

const roots: string[] = [];
const reporters: DurableDiagnostics[] = [];
const pipes: Writable[] = [];
afterEach(async () => {
  for (const reporter of reporters.splice(0)) reporter.dispose();
  for (const pipe of pipes.splice(0)) pipe.destroy();
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function setupReporter(pipe = new Writable({ write(_chunk, _encoding, done) { done(); } })) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-main-diagnostics-'));
  roots.push(root); pipes.push(pipe);
  const path = join(root, 'logs', 'main.jsonl');
  const reporter = new DurableDiagnostics(path, pipe);
  reporters.push(reporter);
  return { root, path, pipe, reporter, records: async () => (await readFile(path, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as { message: string; error?: { code?: string; message: string } }) };
}

/** Run the actual main-process flush without starting Electron or replacing its body. */
async function mainRefreshHarness(refresh: () => Promise<unknown>, log: (...args: unknown[]) => void, diagnosticError = vi.fn()) {
  const path = resolve('apps/desktop/main/index.ts');
  const source = await readFile(path, 'utf8');
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'flushControlPlaneRefresh');
  if (!declaration) throw new Error('The actual main-process refresh function was not found.');
  const javascript = ts.transpileModule(declaration.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function('controlPlaneHost', 'console', 'diagnostics', `
    let controlPlaneRefreshTimer;
    let controlPlaneRefreshRunning = false;
    let controlPlaneRefreshPending = false;
    let scheduled = 0;
    function scheduleControlPlaneRefresh() { scheduled += 1; }
    ${javascript}
    return {
      request() { controlPlaneRefreshPending = true; return flushControlPlaneRefresh(); },
      state() { return { running: controlPlaneRefreshRunning, pending: controlPlaneRefreshPending, scheduled }; }
    };
  `)({ refresh }, { error: log }, { error: diagnosticError }) as {
    request(): Promise<void>;
    state(): { running: boolean; pending: boolean; scheduled: number };
  };
}

describe('Electron control-plane refresh with a disconnected launcher pipe', () => {
  it('does not let a closed stderr mask a refresh failure or reject the next refresh', async () => {
    const originalRefreshError = Object.assign(new Error('temporary state read unavailable'), { code: 'EAGAIN' });
    const closedPipeError = Object.assign(new Error('write EPIPE'), { code: 'EPIPE', syscall: 'write' });
    const unsafeConsole = vi.fn(() => { throw closedPipeError; });
    const durableReport = vi.fn();
    const refresh = vi.fn<() => Promise<unknown>>().mockRejectedValueOnce(originalRefreshError).mockResolvedValue(true);
    // The launcher's pipe is already closed before the main-process refresh flushes.
    const harness = await mainRefreshHarness(refresh, unsafeConsole, durableReport);
    await expect(harness.request()).resolves.toBeUndefined();
    expect(harness.state()).toMatchObject({ running: false, pending: false });
    expect(durableReport).toHaveBeenCalledWith('Control-plane refresh failed.', originalRefreshError);
    await expect(harness.request()).resolves.toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(unsafeConsole).not.toHaveBeenCalled();
  });

  it('continues repeated refreshes after terminal loss without writing to the dead console', async () => {
    const unsafeConsole = vi.fn(() => { throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }); });
    const refresh = vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error('malformed persisted projection'));
    const durableReport = vi.fn();
    const harness = await mainRefreshHarness(refresh, unsafeConsole, durableReport);
    for (let attempt = 0; attempt < 4; attempt += 1) await expect(harness.request()).resolves.toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(4);
    expect(durableReport).toHaveBeenCalledTimes(4);
    expect(unsafeConsole).not.toHaveBeenCalled();
    expect(harness.state()).toMatchObject({ running: false, pending: false, scheduled: 0 });
  });
});

describe('durable main-process diagnostics', () => {
  it('persists the original refresh failure when a real writable is closed before flush', async () => {
    const sink = new Writable({ write(_chunk, _encoding, done) { done(); } });
    sink.destroy();
    const write = vi.spyOn(sink, 'write');
    const { reporter, records } = await setupReporter(sink);
    const failure = Object.assign(new Error('control-plane projection read failed'), { code: 'EAGAIN' });
    const refresh = vi.fn<() => Promise<unknown>>().mockRejectedValueOnce(failure).mockResolvedValue(true);
    const harness = await mainRefreshHarness(refresh, () => { throw new Error('Unsafe console must not be used'); }, vi.fn((message, error) => reporter.error(String(message), error)));
    await expect(harness.request()).resolves.toBeUndefined();
    await expect(harness.request()).resolves.toBeUndefined();
    expect(write).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(reporter.getStatus().stderrDetached).toBe(true);
    expect(await records()).toContainEqual(expect.objectContaining({ message: 'Control-plane refresh failed.', error: expect.objectContaining({ code: 'EAGAIN', message: 'control-plane projection read failed' }) }));
  });

  it('consumes an asynchronous EPIPE and never writes repeated errors to that dead pipe', async () => {
    let writes = 0;
    const sink = new Writable({ write(_chunk, _encoding, done) { writes += 1; setImmediate(() => done(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))); } });
    const { reporter, records } = await setupReporter(sink);
    const closed = new Promise<void>((resolveClosed) => sink.once('close', () => resolveClosed()));
    expect(() => reporter.error('First failed refresh', new Error('source is not readable'))).not.toThrow();
    await closed;
    for (let index = 0; index < 4; index += 1) reporter.error(`Subsequent refresh ${index}`, new Error('source is still not readable'));
    expect(writes).toBe(1);
    expect(reporter.getStatus().stderrDetached).toBe(true);
    const recorded = await records();
    expect(recorded.filter((record) => record.message.startsWith('Subsequent refresh'))).toHaveLength(4);
    expect(recorded.some((record) => record.error?.code === 'EPIPE')).toBe(true);
    expect(recorded[0]?.error?.message).toBe('source is not readable');
  });

  it('respects accepted-write backpressure and resumes after drain without replaying a log', async () => {
    const output: string[] = [];
    let finishWrite: (() => void) | undefined;
    const sink = new Writable({ highWaterMark: 1, write(chunk, _encoding, done) { output.push(chunk.toString()); finishWrite = done; } });
    const { reporter, records } = await setupReporter(sink);
    reporter.error('Accepted before backpressure');
    reporter.error('Persisted while waiting for drain');
    expect(output).toHaveLength(1);
    expect(reporter.getStatus().backpressured).toBe(true);
    const drained = new Promise<void>((resolveDrain) => sink.once('drain', () => resolveDrain()));
    finishWrite!(); await drained;
    reporter.error('Accepted after drain');
    expect(output).toHaveLength(2);
    expect(output[1]).toContain('Accepted after drain');
    finishWrite!();
    expect((await records()).map((record) => record.message)).toEqual(['Accepted before backpressure', 'Persisted while waiting for drain', 'Accepted after drain']);
  });

  it('recovers from a transient EAGAIN without a hot retry loop or loss of durable records', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
    const output: string[] = [];
    const sink = new Writable({ write(chunk, _encoding, done) { output.push(chunk.toString()); done(); } });
    const write = vi.spyOn(sink, 'write').mockImplementationOnce(() => { throw Object.assign(new Error('temporarily unavailable'), { code: 'EAGAIN' }); });
    const { reporter, records } = await setupReporter(sink);
    reporter.error('Original failure');
    for (let index = 0; index < 4; index += 1) reporter.error(`During cooldown ${index}`);
    expect(write).toHaveBeenCalledTimes(1);
    expect(reporter.getStatus()).toMatchObject({ stderrDetached: false, backpressured: true });
    vi.setSystemTime(new Date('2026-09-24T18:00:01Z'));
    reporter.error('Recovered pipe');
    expect(write).toHaveBeenCalledTimes(2);
    expect(output).toHaveLength(1);
    expect(output[0]).toContain('Recovered pipe');
    expect(reporter.getStatus()).toMatchObject({ stderrDetached: false, backpressured: false });
    const recorded = await records();
    expect(recorded.some((record) => record.error?.code === 'EAGAIN')).toBe(true);
    expect(recorded.filter((record) => record.message.startsWith('During cooldown'))).toHaveLength(4);
  });

  it('treats EAGAIN on an already-destroyed stream as terminal and skips ended streams', async () => {
    const { reporter, pipe } = await setupReporter();
    const write = vi.spyOn(pipe, 'write');
    pipe.destroy();
    pipe.emit('error', Object.assign(new Error('closed descriptor'), { code: 'EAGAIN' }));
    reporter.error('No retry after stream destruction');
    expect(write).not.toHaveBeenCalled();
    expect(reporter.getStatus().stderrDetached).toBe(true);
    const ended = await setupReporter();
    ended.pipe.end();
    const endedWrite = vi.spyOn(ended.pipe, 'write');
    ended.reporter.error('No write after end');
    expect(endedWrite).not.toHaveBeenCalled();
  });

  it('keeps a late stream error handled after disposal and does not recursively log disk failure', async () => {
    const { reporter, pipe, root } = await setupReporter();
    reporter.dispose();
    expect(() => pipe.emit('error', Object.assign(new Error('late pipe close'), { code: 'EPIPE' }))).not.toThrow();
    const failedDisk = new DurableDiagnostics(root, pipe); // A directory cannot be opened as an append-only log file.
    reporters.push(failedDisk);
    expect(() => failedDisk.error('Disk unavailable')).not.toThrow();
    expect(failedDisk.getStatus().persistenceError).toBeTruthy();
  });

  it('redacts credentials from both durable records and stream output', async () => {
    const output: string[] = [];
    const { reporter, path } = await setupReporter(new Writable({ write(chunk, _encoding, done) { output.push(chunk.toString()); done(); } }));
    reporter.error('Provider api_key=private-key-value failed', new Error('Bearer secret-access-token password=secret-password sk-secretcredential1234'));
    for (const recorded of [await readFile(path, 'utf8'), output.join('')]) {
      expect(recorded).not.toContain('private-key-value');
      expect(recorded).not.toContain('secret-access-token');
      expect(recorded).not.toContain('secret-password');
      expect(recorded).not.toContain('sk-secretcredential1234');
      expect(recorded).toContain('REDACTED');
    }
  });
});
