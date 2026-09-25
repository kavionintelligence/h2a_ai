import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
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
}, 30_000);

describe('Phase 43 release integration in production Electron', () => {
  it('keeps final acceptance fail-closed and prepares a clean required-liveness root', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase43-electron-'));
    const dataRoot = join(temporaryRoot, 'candidate');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    const launch = async (activeRoot = dataRoot) => electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: activeRoot, NODE_ENV: 'production' }, timeout: 30_000 });
    application = await launch();
    let page = await application.firstWindow();
    await page.waitForSelector('.office-shell', { timeout: 30_000 });
    expect(await page.locator('[data-control-id="office.tour.chapter"]').count()).toBe(7);
    expect(await page.locator('[data-control-id="office.tour.open-trace"]').isDisabled()).toBe(true);

    await page.getByRole('button', { name: 'Control', exact: true }).click();
    await page.getByRole('button', { name: 'Demo Gate', exact: true }).click();
    await expect.poll(async () => page.getByText('Operator acceptance workspace').count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Export package' }).isDisabled()).toBe(true);
    expect(await page.locator('.acceptance-banner').innerText()).toContain('0 of 11 gates passed');

    await page.getByRole('button', { name: 'New clean session' }).click();
    await expect.poll(async () => page.getByText('Clean session prepared').count()).toBe(1);
    const receiptText = await page.locator('.phase44-session-receipt').innerText();
    const pathMatch = receiptText.match(/[A-Z]:\\[^\r\n]*phase44-[^\r\n]*/u);
    expect(pathMatch).toBeTruthy();
    const session = JSON.parse(await readFile(join(pathMatch![0]!, 'SESSION.json'), 'utf8'));
    expect(session).toMatchObject({ preview_data: false, prepopulated_success: false });

    await application.close(); application = await launch(pathMatch![0]!); page = await application.firstWindow();
    await page.waitForSelector('.office-shell', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Control', exact: true }).click();
    await page.getByRole('button', { name: 'Demo Gate', exact: true }).click();
    await expect.poll(async () => page.locator('.acceptance-banner').innerText()).toContain('0 of 11 gates passed');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    expect(await page.locator('.system-panel').first().innerText()).toContain('required');

    await application.close(); application = await launch(); page = await application.firstWindow();
    await page.waitForSelector('.app-shell', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Demo Gate', exact: true }).click();

    await page.getByRole('button', { name: 'Require liveness' }).click();
    await expect.poll(async () => page.locator('.acceptance-page').count()).toBe(1);
    await expect.poll(async () => page.getByRole('button', { name: 'Require liveness' }).count()).toBe(0);
    await expect.poll(async () => page.locator('.phase44-readiness-grid .phase44-fact').count()).toBe(4);
    const config = JSON.parse(await readFile(join(dataRoot, 'settings/feature-config.json'), 'utf8'));
    expect(config.data.livenessMode).toBe('required');

    const evidenceDirectory = join(root, 'docs', 'plan4', 'evidence', 'phase43');
    await mkdir(evidenceDirectory, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: join(evidenceDirectory, '1440x900-final-gate.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true);
    await page.screenshot({ path: join(evidenceDirectory, '390x844-final-gate.png'), fullPage: true });

    await application.close(); application = await launch(); page = await application.firstWindow();
    await page.waitForSelector('.app-shell', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    expect(await page.locator('.system-panel').first().innerText()).toContain('required');
  }, 180_000);
});
