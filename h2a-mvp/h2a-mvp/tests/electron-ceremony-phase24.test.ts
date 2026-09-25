import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication } from 'playwright';

const root = process.cwd();
let temporaryRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => {
  await application?.close();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('Phase 24 public Electron ceremony path', () => {
  it('creates, assesses, and restores one ceremony trace after restart', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase24-electron-'));
    const sessionRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', sessionRoot], { cwd: root, stdio: 'pipe' });
    application = await launch(sessionRoot);
    let page = await application.firstWindow();
    await page.getByRole('button', { name: 'Demo Gate', exact: true }).click();
    await page.getByRole('button', { name: 'Create ceremony', exact: true }).click();
    const trace = (await page.locator('.ceremony-identity code').nth(1).textContent())!;
    expect(trace).toMatch(/^phase22_/u);
    await page.getByRole('button', { name: 'Assess prerequisites', exact: true }).click();
    await expect.poll(async () => page.locator('.ceremony-steps article').filter({ hasText: 'Prerequisites assessed' }).innerText()).toContain('PASSED');

    await application.close(); application = await launch(sessionRoot); page = await application.firstWindow();
    await page.getByRole('button', { name: 'Demo Gate', exact: true }).click();
    expect(await page.locator('.ceremony-identity code').nth(1).textContent()).toBe(trace);
    expect(await page.locator('.ceremony-steps article').filter({ hasText: 'Prerequisites assessed' }).innerText()).toContain('PASSED');
    const evidenceDirectory = join(root, 'docs/plan3/evidence/phase24');
    await mkdir(evidenceDirectory, { recursive: true });
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: join(evidenceDirectory, `${viewport.width}x${viewport.height}-ceremony-workspace.png`), fullPage: true });
    }
  }, 90_000);
});

async function launch(sessionRoot: string): Promise<ElectronApplication> {
  const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: sessionRoot, NODE_ENV: 'production' }, timeout: 30_000 });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Control', exact: true }).click();
  await page.waitForSelector('aside[aria-label="Primary navigation"]', { timeout: 30_000 });
  return app;
}
