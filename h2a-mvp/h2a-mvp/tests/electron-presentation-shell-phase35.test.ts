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
});

describe('Phase 35 persistent Office and Control shells', () => {
  it('switches accessibly 100 times without duplicating state and persists across process restart', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase35-electron-'));
    dataRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });

    let page = await launch();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(async () => page.locator('.office-shell').count()).toBe(1);
    await expect.poll(async () => page.getByRole('button', { name: 'Office', exact: true }).getAttribute('aria-pressed')).toBe('true');
    expect(await page.getByRole('group', { name: 'Presentation mode' }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Control', exact: true }).count()).toBe(1);
    expect(await page.locator('#main-content').count()).toBe(1);

    await page.getByRole('button', { name: 'Office', exact: true }).focus();
    await page.keyboard.press('End');
    await waitForMode(page, 'control');
    await expect.poll(async () => page.getByRole('button', { name: 'Control', exact: true }).getAttribute('aria-pressed')).toBe('true');
    await page.getByRole('button', { name: 'Evidence', exact: true }).click();
    await expect.poll(async () => page.locator('header.topbar h1').textContent()).toBe('Evidence');

    await switchMode(page, 'office');
    const traceBefore = await page.locator('.office-command-dock code').textContent();
    await switchMode(page, 'control');
    await expect.poll(async () => page.locator('header.topbar h1').textContent()).toBe('Evidence');

    for (let index = 0; index < 100; index += 1) {
      await switchMode(page, index % 2 === 0 ? 'office' : 'control');
      expect(await page.locator('#main-content').count(), `switch ${index + 1}: one main region`).toBe(1);
      expect(await page.locator('.app-shell, .office-shell').count(), `switch ${index + 1}: one shell`).toBe(1);
    }
    await expect.poll(async () => page.locator('header.topbar h1').textContent()).toBe('Evidence');
    await switchMode(page, 'office');
    expect(await page.locator('.office-command-dock code').textContent()).toBe(traceBefore);

    const preferences = JSON.parse(await readFile(join(dataRoot, 'settings', 'appearance-preferences.json'), 'utf8'));
    expect(preferences.data.presentation_mode).toBe('office');
    expect(await page.locator('.office-zone').count()).toBe(6);
    expect(await page.locator('.office-entity-inspector[data-inspector-entity-id]').count()).toBe(1);

    await closeApplication();
    page = await launch();
    await expect.poll(async () => page.locator('.office-shell').count()).toBe(1);
    await switchMode(page, 'control');
    await closeApplication();
    page = await launch();
    await expect.poll(async () => page.locator('.app-shell').count()).toBe(1);
    expect(await page.locator('#main-content').count()).toBe(1);
  }, 360_000);

  it('honors reduced motion, remains responsive, and preserves Control workspace geometry', async () => {
    const page = await currentPage();
    const evidenceDirectory = join(root, 'docs', 'plan4', 'evidence', 'phase35');
    await mkdir(evidenceDirectory, { recursive: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(async () => page.locator('.app-shell').count()).toBe(1);
    const geometry = await page.evaluate(() => {
      const shell = document.querySelector('.app-shell')!.getBoundingClientRect();
      const sidebar = document.querySelector('.sidebar')!.getBoundingClientRect();
      const topbar = document.querySelector('.topbar')!.getBoundingClientRect();
      const main = document.querySelector('#main-content')!.getBoundingClientRect();
      const transition = getComputedStyle(document.querySelector('.nav-item')!).transitionDuration;
      return { clientWidth: document.documentElement.clientWidth, shell: [shell.x, shell.width], sidebar: [sidebar.x, sidebar.width], topbar: [topbar.x, topbar.y, topbar.width, topbar.height], main: [main.x, main.y, main.width], transition };
    });
    const workspaceWidth = geometry.clientWidth - 228;
    expect(geometry).toMatchObject({
      shell: [0, geometry.clientWidth],
      sidebar: [0, 228],
      topbar: [228, 0, workspaceWidth, 86],
      main: [228, 86, workspaceWidth]
    });
    expect(geometry.transition).toMatch(/0\.0*1ms|0s|1e-05s/u);
    await page.screenshot({ path: join(evidenceDirectory, '1440x900-control-parity.png'), fullPage: true });

    await switchMode(page, 'office');
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${viewport.width}x${viewport.height} overflow`).toBeLessThanOrEqual(1);
      expect(await page.locator('button:visible').evaluateAll((buttons) => buttons.filter((button) => !(button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent?.trim() ?? '')).length)).toBe(0);
      await page.screenshot({ path: join(evidenceDirectory, `${viewport.width}x${viewport.height}-office.png`), fullPage: true });
    }
  }, 90_000);
});

async function switchMode(page: Page, mode: 'office' | 'control'): Promise<void> {
  const name = mode === 'office' ? 'Office' : 'Control';
  if (await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed') === 'true') return;
  await page.getByRole('button', { name, exact: true }).click();
  await waitForMode(page, mode);
}

async function waitForMode(page: Page, mode: 'office' | 'control'): Promise<void> {
  await expect.poll(async () => page.locator(mode === 'office' ? '.office-shell' : '.app-shell').count(), { timeout: 30_000 }).toBe(1);
  await expect.poll(async () => page.getByRole('button', { name: mode === 'office' ? 'Office' : 'Control', exact: true }).getAttribute('aria-pressed'), { timeout: 30_000 }).toBe('true');
  await expect.poll(async () => page.getByRole('button', { name: mode === 'office' ? 'Office' : 'Control', exact: true }).isEnabled(), { timeout: 30_000 }).toBe(true);
}

async function launch(): Promise<Page> {
  application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 });
  const page = await application.firstWindow();
  await page.waitForSelector('#main-content', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('#main-content')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 30_000 });
  return page;
}

async function currentPage(): Promise<Page> {
  if (!application) throw new Error('Phase 35 Electron application is not running.');
  return application.firstWindow();
}

async function closeApplication(): Promise<void> {
  const current = application;
  application = undefined;
  await current?.close();
}
