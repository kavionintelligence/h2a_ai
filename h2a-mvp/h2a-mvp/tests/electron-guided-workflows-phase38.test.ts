import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

const root = process.cwd();
let temporaryRoot = '';
let dataRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => {
  await closeApplication();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}, 30_000);

describe('Phase 38 Electron guided operator workflow', () => {
  it('shows one exact next action, preserves workflow selection, and returns from prerequisite detours', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase38-electron-'));
    dataRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    let page = await launch();

    const dock = page.getByRole('contentinfo', { name: 'Office next action' });
    await expect.poll(async () => dock.count()).toBe(1);
    await expect.poll(async () => page.locator('[data-control-id="office.workflow.continue"]').count()).toBe(1);
    expect(await page.locator('.guided-workflow-dock').getAttribute('data-step-id')).toBe('enroll-two-humans');
    expect(await page.locator('.guided-workflow-next small').textContent()).toContain('Human Proof');

    await page.getByRole('combobox', { name: 'Guided workflow' }).selectOption('connect-friend-node');
    await expect.poll(async () => page.locator('.guided-workflow-dock').getAttribute('data-workflow-id')).toBe('connect-friend-node');
    await page.locator('[data-control-id="office.workflow.continue"]').click();
    await expect.poll(async () => page.locator('header.topbar h1').textContent()).toBe('Federation');
    await expect.poll(async () => page.locator('.workflow-detour-banner').count()).toBe(1);
    expect(await page.locator('.workflow-detour-banner').textContent()).toContain('Create this installation identity');
    await page.getByRole('button', { name: 'Return to Office workflow' }).click();
    await expect.poll(async () => page.locator('.office-shell').count()).toBe(1);
    expect(await page.locator('.guided-workflow-dock').getAttribute('data-step-id')).toBe('configure-node');

    await page.getByRole('combobox', { name: 'Guided workflow' }).selectOption('set-up-people');
    await page.locator('[data-control-id="office.workflow.continue"]').click();
    await expect.poll(async () => page.locator('header.topbar h1').textContent()).toBe('Human Proof');
    expect(await page.locator('.verification-purpose').first().textContent()).toBe('Purpose: authorize H2A command floor');
    await page.getByRole('button', { name: 'Return to Office workflow' }).click();
    await expect.poll(async () => page.locator('.office-shell').count()).toBe(1);

    await page.getByRole('combobox', { name: 'Guided workflow' }).selectOption('prepare-hp-demonstration');
    await expect.poll(async () => page.locator('.guided-workflow-dock').getAttribute('data-workflow-id')).toBe('prepare-hp-demonstration');
    const preferences = JSON.parse(await readFile(join(dataRoot, 'settings', 'appearance-preferences.json'), 'utf8'));
    expect(preferences.data.selected_workflow_id).toBe('prepare-hp-demonstration');
    await closeApplication();
    page = await launch();
    await expect.poll(async () => page.locator('.guided-workflow-dock').getAttribute('data-workflow-id')).toBe('prepare-hp-demonstration');
    expect(await page.locator('[data-control-id="office.workflow.continue"]').count()).toBe(1);
  }, 180_000);

  it('keeps the dock readable and keyboard-operable at all required viewports', async () => {
    if (!application) throw new Error('Phase 38 Electron application is not running.');
    const page = await application.firstWindow();
    const evidenceDirectory = join(root, 'docs', 'plan4', 'evidence', 'phase38');
    await mkdir(evidenceDirectory, { recursive: true });
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${viewport.width}x${viewport.height} overflow`).toBeLessThanOrEqual(1);
      expect(await page.locator('button:visible').evaluateAll((buttons) => buttons.filter((button) => !(button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent?.trim() ?? '')).length)).toBe(0);
      await expect.poll(async () => page.getByRole('combobox', { name: 'Guided workflow' }).isEnabled()).toBe(true);
      await page.getByRole('combobox', { name: 'Guided workflow' }).focus();
      expect(await page.getByRole('combobox', { name: 'Guided workflow' }).evaluate((element) => element === document.activeElement)).toBe(true);
      await page.screenshot({ path: join(evidenceDirectory, `${viewport.width}x${viewport.height}-workflow.png`), fullPage: true });
    }
  }, 90_000);
});

async function launch(): Promise<Page> {
  application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 });
  const page = await application.firstWindow();
  await page.waitForSelector('#main-content', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('#main-content')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 30_000 });
  return page;
}

async function closeApplication(): Promise<void> {
  const current = application;
  application = undefined;
  await current?.close();
}
