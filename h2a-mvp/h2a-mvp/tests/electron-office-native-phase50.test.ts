import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { employeeWorkspaceFixture } from './helpers/employeeWorkspaceFixture';
import { signInProductionEmployee } from './helpers/electronEmployeeSignIn';

const root = process.cwd();
let temporaryRoot = '';
let dataRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => {
  await application?.close();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}, 30_000);

describe('Phase 50 Electron Office-native operations', () => {
  it('opens every routine workspace in place, preserves selection through technical details, and stays responsive', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase50-electron-'));
    dataRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    const fixture = await employeeWorkspaceFixture(dataRoot, { realBch: true, initialDate: new Date(Date.now() - 60_000) });
    const page = await launch();
    await signInProductionEmployee(page, 'TEST-1', fixture.verification(1, 'sign in to H2A employee workspace'));
    await page.getByRole('button', { name: 'Control console', exact: true }).click();
    await page.waitForSelector('#main-content[aria-busy="false"]', { timeout: 60_000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    if (await page.getByRole('button', { name: 'Office', exact: true }).getAttribute('aria-pressed') !== 'true') {
      await page.getByRole('button', { name: 'Office', exact: true }).click();
    }
    const hotspots = page.locator('[data-control-id="office.workspace.open"]');
    await expect.poll(() => hotspots.count()).toBe(10);
    for (let index = 0; index < 10; index += 1) {
      await hotspots.nth(index).click();
      const drawer = page.locator('[data-office-workspace]');
      await expect.poll(() => drawer.isVisible()).toBe(true);
      expect(await drawer.getAttribute('role')).toBe('dialog');
      await drawer.getByRole('button', { name: /^Close /u }).click();
      await expect.poll(() => drawer.count()).toBe(0);
    }

    await page.getByRole('button', { name: /Collaboration Handoffs and outputs/u }).click();
    await expect.poll(() => page.locator('[data-office-workspace="collaboration"]').isVisible()).toBe(true);
    await page.getByRole('button', { name: 'Technical details', exact: true }).click();
    await expect.poll(() => page.getByRole('button', { name: 'Control', exact: true }).getAttribute('aria-pressed')).toBe('true');
    await page.getByRole('button', { name: 'Office', exact: true }).click();
    await expect.poll(() => page.locator('[data-office-workspace="collaboration"]').isVisible()).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('[data-office-workspace]').count()).toBe(0);

    const evidence = join(root, 'docs', 'plan5', 'evidence', 'phase50');
    await mkdir(evidence, { recursive: true });
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.getByRole('button', { name: /Tasks Composer and work graph/u }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: join(evidence, `${viewport.width}x${viewport.height}-office-tasks.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await expect.poll(() => page.locator('[data-office-workspace]').count(), { timeout: 30_000 }).toBe(0);
    }
    expect(errors).toEqual([]);
  }, 180_000);
});

async function launch(): Promise<Page> {
  application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 });
  const page = await application.firstWindow();
  return page;
}
