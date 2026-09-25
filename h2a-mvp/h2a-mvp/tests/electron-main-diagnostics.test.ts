import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

const project = process.cwd();
const artifactRoot = resolve('../../.test-artifacts', `electron-main-diagnostics-${Date.now()}`);
const dataRoot = join(artifactRoot, 'data');
const diagnosticPath = join(dataRoot, '.electron-user-data', 'logs', 'main.jsonl');
let application: ElectronApplication | undefined;
let page: Page | undefined;
let stdout = '', stderr = '';
const lifecycle: unknown[] = [];
const rendererErrors: string[] = [];

type Diagnostic = { message: string; error?: { name: string; code?: string; message: string } };
async function diagnostics(): Promise<Diagnostic[]> {
  const text = await readFile(diagnosticPath, 'utf8').catch(() => '');
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Diagnostic);
}
async function eventually(predicate: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(message);
}

afterAll(async () => {
  if (page && !page.isClosed()) await page.screenshot({ path: join(artifactRoot, 'final-window.png'), fullPage: true }).catch(() => {});
  await application?.close().catch(() => {});
  await mkdir(artifactRoot, { recursive: true });
  await Promise.all([
    writeFile(join(artifactRoot, 'stdout.log'), stdout), writeFile(join(artifactRoot, 'stderr.log'), stderr),
    writeFile(join(artifactRoot, 'result.json'), JSON.stringify({ artifactRoot, dataRoot, lifecycle, rendererErrors, diagnostics: await diagnostics() }, null, 2))
  ]);
  console.log(`Electron main-process pipe regression evidence: ${artifactRoot}`);
});

describe('actual Electron main-process diagnostics after launcher disconnection', () => {
  it('stays alive through repeated failed refreshes and recovers after the observed state is restored', async () => {
    await mkdir(artifactRoot, { recursive: true });
    execFileSync(process.execPath, [join(project, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: project, stdio: 'pipe' });
    application = await electron.launch({ args: ['.'], cwd: project, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30000 });
    const child = application.process();
    lifecycle.push({ type: 'launch', pid: child.pid });
    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
    child.on('exit', (code, signal) => lifecycle.push({ type: 'exit', code, signal }));
    page = await application.firstWindow();
    page.on('crash', () => lifecycle.push({ type: 'renderer-crash' }));
    page.on('close', () => lifecycle.push({ type: 'window-close' }));
    page.on('pageerror', (error) => rendererErrors.push(String(error)));
    // Current production starts at employee authentication; do not bypass that boundary.
    await page.getByRole('button', { name: 'Verify employee', exact: true }).waitFor({ timeout: 30000 });
    const initialSetup = await page.evaluate(() => (window as unknown as { h2aEmployee: { setupStatus(): Promise<{ available: boolean }> } }).h2aEmployee.setupStatus());
    expect(initialSetup.available).toBe(true);
    await page.screenshot({ path: join(artifactRoot, 'initial-window.png') });
    const configPath = join(dataRoot, 'settings', 'feature-config.json');
    const originalConfig = await readFile(configPath, 'utf8');
    const envelope = JSON.parse(originalConfig) as { updatedAt: string; data: Record<string, unknown> };

    // Close the launcher's real pipe reader before the filesystem watcher reports an error.
    // No console/stream mocks or main-process production hooks are installed.
    child.stderr!.destroy();
    lifecycle.push({ type: 'launcher-stderr-reader-closed' });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = (await diagnostics()).filter((record) => record.message === 'Control-plane refresh failed.').length;
      await writeFile(configPath, `${JSON.stringify({ ...envelope, updatedAt: new Date().toISOString(), data: { ...envelope.data, agentMode: `invalid-pipe-regression-${attempt}` } }, null, 2)}\n`);
      await eventually(async () => (await diagnostics()).filter((record) => record.message === 'Control-plane refresh failed.').length > before, 'The real control-plane watcher did not persist its failed refresh.');
      expect(child.exitCode).toBeNull();
      expect(page.isClosed()).toBe(false);
    }
    const errors = await diagnostics();
    expect(errors.some((record) => record.message === 'Control-plane refresh failed.' && record.error?.message.includes('agentMode'))).toBe(true);
    expect(errors.some((record) => record.message.includes('Diagnostic output pipe unavailable') && ['EPIPE', 'ECONNRESET', 'ERR_STREAM_DESTROYED'].includes(record.error?.code ?? ''))).toBe(true);

    await writeFile(configPath, originalConfig);
    await eventually(async () => {
      try { return (await page!.evaluate(() => (window as unknown as { h2aEmployee: { setupStatus(): Promise<{ available: boolean }> } }).h2aEmployee.setupStatus())).available; }
      catch { return false; }
    }, 'Public setup IPC did not recover after the real config was restored.');
    await page.waitForTimeout(500);
    const recoveredErrorCount = (await diagnostics()).filter((record) => record.message === 'Control-plane refresh failed.').length;
    // Another legitimate filesystem change exercises the watcher after successful restoration.
    await writeFile(configPath, `${JSON.stringify({ ...envelope, updatedAt: new Date().toISOString() }, null, 2)}\n`);
    await page.waitForTimeout(600);
    expect((await diagnostics()).filter((record) => record.message === 'Control-plane refresh failed.').length).toBe(recoveredErrorCount);
    expect(child.exitCode).toBeNull();
    expect(page.isClosed()).toBe(false);
    expect(rendererErrors).toEqual([]);
    const denied = await page.evaluate(async () => {
      try { await (window as unknown as { h2a: { getSystemStatus(): Promise<unknown> } }).h2a.getSystemStatus(); return 'unexpected authority'; }
      catch (error) { return String(error); }
    });
    expect(denied).not.toBe('unexpected authority');
    lifecycle.push({ type: 'recovered', failedRefreshes: recoveredErrorCount, originalErrorsPersisted: true, administratorBoundaryPreserved: true });
  }, 60000);
});
