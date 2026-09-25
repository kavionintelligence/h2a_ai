import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { employeeWorkspaceFixture } from './helpers/employeeWorkspaceFixture';
import { signInProductionEmployee } from './helpers/electronEmployeeSignIn';

const root = process.cwd();
let temporaryRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => {
  await application?.close();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}, 30_000);

describe('Phase 42 Electron product quality', () => {
  it('keeps Office and Control responsive, accessible, synchronized, and locally observable', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase42-electron-'));
    const dataRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    const fixture = await employeeWorkspaceFixture(dataRoot, { realBch: true, initialDate: new Date(Date.now() - 60_000) });
    application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 });
    const page = await application.firstWindow();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await signInProductionEmployee(page, 'TEST-1', fixture.verification(1, 'sign in to H2A employee workspace'));
    await page.getByRole('button', { name: 'Control console', exact: true }).click();
    await page.waitForSelector('#main-content[aria-busy="false"]', { timeout: 60_000 });
    await expect.poll(async () => page.locator('.pixel-office').getAttribute('data-render-state')).toBe('ready');

    const officeIds = await page.locator('.office-shell button[data-control-id]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-control-id')));
    for (const id of ['presentation.office', 'presentation.control', 'office.camera.zoom-in', 'office.camera.zoom-out', 'office.camera.pan-left', 'office.camera.pan-up', 'office.camera.pan-down', 'office.camera.pan-right', 'office.camera.reset', 'office.refresh']) expect(officeIds).toContain(id);
    for (const name of ['Zoom in', 'Zoom out', 'Pan left', 'Pan up', 'Pan down', 'Pan right', 'Reset camera']) await page.getByRole('button', { name, exact: true }).click();

    await page.getByRole('button', { name: 'Office', exact: true }).focus();
    await page.keyboard.press('End');
    await expect.poll(async () => page.locator('.app-shell').count()).toBe(1);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect.poll(async () => page.locator('.local-diagnostics').getAttribute('data-diagnostics-telemetry')).toBe('disabled');
    await expect.poll(async () => page.locator('.diagnostics-grid').innerText(), { timeout: 15_000 }).toContain('DOM nodes');
    expect(await page.locator('.local-diagnostics').innerText()).toContain('No telemetry endpoint, persistence, or export is configured.');

    const evidenceDirectory = join(root, 'docs', 'plan4', 'evidence', 'phase42');
    await mkdir(evidenceDirectory, { recursive: true });
    const viewports = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      expect(await overflow(page), `Control overflow at ${viewport.width}x${viewport.height}`).toEqual([]);
      expect(await clippedButtons(page), `Control button clipping at ${viewport.width}x${viewport.height}`).toEqual([]);
      await page.screenshot({ path: join(evidenceDirectory, `${viewport.width}x${viewport.height}-control.png`), fullPage: true });
      await page.getByRole('button', { name: 'Office', exact: true }).click();
      await expect.poll(async () => page.locator('.office-shell').count(), { timeout: 30_000 }).toBe(1);
      expect(await overflow(page), `Office overflow at ${viewport.width}x${viewport.height}`).toEqual([]);
      expect(await clippedButtons(page), `Office button clipping at ${viewport.width}x${viewport.height}`).toEqual([]);
      await page.screenshot({ path: join(evidenceDirectory, `${viewport.width}x${viewport.height}-office.png`), fullPage: true });
      await page.getByRole('button', { name: 'Control', exact: true }).click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
    }

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Office', exact: true }).click();
    await expect.poll(async () => page.locator('.pixel-office').getAttribute('data-motion'), { timeout: 30_000 }).toBe('reduced');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');
    expect(pageErrors).toEqual([]);
  }, 300_000);
});

async function overflow(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => {
    const pageOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      ? [{ tag: 'HTML', className: 'document-overflow', left: 0, right: document.documentElement.scrollWidth }]
      : [];
    const escaped = [...document.querySelectorAll<HTMLElement>('body *')].flatMap((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (style.position === 'fixed' || bounds.width === 0 || bounds.height === 0) return [];
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.body) {
      const overflowX = getComputedStyle(ancestor).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden' || overflowX === 'clip') return [];
      ancestor = ancestor.parentElement;
    }
    return bounds.right > document.documentElement.clientWidth + 2 || bounds.left < -2
      ? [{ tag: element.tagName, className: String(element.className), left: Math.round(bounds.left), right: Math.round(bounds.right) }]
      : [];
    });
    return [...pageOverflow, ...escaped].slice(0, 12);
  });
}

async function clippedButtons(page: Page): Promise<string[]> {
  return page.locator('button:visible').evaluateAll((buttons) => buttons.flatMap((button) => {
    const element = button as HTMLElement;
    return element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2 ? [element.getAttribute('aria-label') ?? element.textContent?.trim() ?? 'button'] : [];
  }));
}
