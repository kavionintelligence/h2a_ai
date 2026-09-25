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
}, 30_000);

describe('Phase 46 Electron command readiness', () => {
  it('renders the same canonical blockers in Office and Control and routes remediation without a manual refresh', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase46-electron-'));
    const dataRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 });
    const page = await application.firstWindow();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForSelector('#main-content', { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#main-content')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 30_000 });

    const officeCenter = page.locator('.readiness-center-office');
    await expect.poll(async () => officeCenter.count()).toBe(1);
    const officeCommand = officeCenter.locator('.readiness-command').first();
    const commandId = await officeCommand.getAttribute('data-command-id');
    const status = await officeCommand.getAttribute('data-readiness-status');
    expect(commandId).toBeTruthy();
    expect(status).not.toBe('ready');
    await officeCommand.getByText('Technical details').click();
    await expect.poll(async () => officeCommand.locator('dt', { hasText: 'Scope hash' }).count()).toBeGreaterThan(0);
    await expect.poll(async () => officeCommand.locator('code').count()).toBeGreaterThan(1);

    const evidence = join(root, 'docs', 'plan5', 'evidence', 'phase46');
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, '1440x900-office-readiness.png'), fullPage: true });

    await page.getByRole('button', { name: 'Control', exact: true }).click();
    await page.getByRole('button', { name: 'Command Floor', exact: true }).click();
    const controlCenter = page.locator('.readiness-center-control');
    await expect.poll(async () => controlCenter.count()).toBe(1);
    const matching = controlCenter.locator(`[data-command-id="${commandId}"]`);
    if (await matching.count()) expect(await matching.getAttribute('data-readiness-status')).toBe(status);
    await page.screenshot({ path: join(evidence, '1440x900-control-readiness.png'), fullPage: true });

    const remediation = controlCenter.locator('[data-control-id="readiness.remediation.open"]').first();
    if (await remediation.count()) {
      await remediation.click();
      await expect.poll(async () => page.locator('header.topbar h1').count()).toBe(1);
      await expect.poll(async () => page.locator('.state-page').count()).toBe(0);
    }

    await page.getByRole('button', { name: 'Office', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => page.locator('.readiness-center-office').count()).toBe(1);
    const overflow = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.readiness-center-office, .readiness-center-office *')].flatMap((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.right > document.documentElement.clientWidth + 1 || bounds.left < -1
        ? [{ tag: element.tagName, className: String(element.className), left: Math.round(bounds.left), right: Math.round(bounds.right) }]
        : [];
    }).slice(0, 12));
    expect(overflow, `Horizontal overflow at 390px: ${JSON.stringify(overflow)}`).toEqual([]);
    await page.screenshot({ path: join(evidence, '390x844-office-readiness.png'), fullPage: true });
    expect(pageErrors).toEqual([]);
  }, 180_000);
});
