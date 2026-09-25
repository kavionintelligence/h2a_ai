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

describe('Phase 48 Electron coworker pairing', () => {
  it('renders the same simplified pairing surface in Office and Control without overflow', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase48-electron-'));
    const dataRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production', H2A_DISCOVERY_PATH: join(temporaryRoot, 'discovery') }, timeout: 30_000 });
    const page = await application.firstWindow();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForSelector('#main-content', { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#main-content')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 30_000 });

    const officePanel = page.locator('.coworker-pairing-compact');
    await expect.poll(async () => officePanel.count()).toBe(1);
    const addCoworker = officePanel.getByRole('button', { name: 'Add coworker' });
    const hitTarget = await addCoworker.evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      const target = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      const executive = document.querySelector('.executive-tour')?.getBoundingClientRect();
      const panel = document.querySelector('.coworker-pairing-compact')?.getBoundingClientRect();
      return { button: button.tagName, bounds: { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right }, panel: panel && { top: panel.top, bottom: panel.bottom }, executive: executive && { top: executive.top, bottom: executive.bottom }, target: target?.tagName, targetControl: target?.closest('button')?.getAttribute('data-control-id'), targetText: target?.closest('button')?.textContent?.trim(), contained: button.contains(target) };
    });
    expect(hitTarget.contained, `Add coworker hit target: ${JSON.stringify(hitTarget)}`).toBe(true);
    await addCoworker.click();
    await expect.poll(async () => page.getByRole('dialog', { name: 'Add coworker' }).count()).toBe(1);
    await expect.poll(async () => page.getByText('Global lookup disabled').count()).toBeGreaterThan(0);
    const evidence = join(root, 'docs', 'plan5', 'evidence', 'phase48');
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, '1440x900-office-add-coworker.png'), fullPage: true });
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Control', exact: true }).click();
    await page.getByRole('button', { name: 'Federation', exact: true }).click();
    await expect.poll(async () => page.locator('.coworker-pairing:not(.coworker-pairing-compact)').count()).toBe(1);
    await page.screenshot({ path: join(evidence, '1440x900-control-coworkers.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.coworker-pairing, .coworker-pairing *')].flatMap((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.right > document.documentElement.clientWidth + 1 || bounds.left < -1
        ? [{ tag: element.tagName, className: String(element.className), left: Math.round(bounds.left), right: Math.round(bounds.right) }]
        : [];
    }).slice(0, 12));
    expect(overflow, `Horizontal overflow at 390px: ${JSON.stringify(overflow)}`).toEqual([]);
    await page.screenshot({ path: join(evidence, '390x844-control-coworkers.png'), fullPage: true });
    expect(pageErrors).toEqual([]);
  }, 180_000);
});
