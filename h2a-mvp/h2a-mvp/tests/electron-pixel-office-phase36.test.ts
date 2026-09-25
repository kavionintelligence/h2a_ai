import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication } from 'playwright';

const root = process.cwd();
let temporaryRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => {
  await application?.close();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('Phase 36 Pixi office acceptance', () => {
  it('renders nonblank at all required viewports and exposes equivalent DOM entities', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase36-electron-'));
    const dataRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 });
    const page = await application.firstWindow();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.waitForSelector('.pixel-office-canvas[data-render-state="ready"]', { timeout: 30_000 });

    expect(await page.getByRole('region', { name: 'Office entities' }).count()).toBe(1);
    expect(await page.locator('.office-entity-list [data-entity-kind="zone"]').count()).toBe(6);
    expect(await page.locator('.office-entity-list [data-entity-kind="station"]').count()).toBe(6);
    expect(await page.getByRole('toolbar', { name: 'Office camera' }).getByRole('button').count()).toBe(7);

    const evidenceDirectory = join(root, 'docs', 'plan4', 'evidence', 'phase36');
    await mkdir(evidenceDirectory, { recursive: true });
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 }
    ]) {
      await page.setViewportSize(viewport);
      await expect.poll(async () => page.locator('.pixel-office-canvas').getAttribute('data-render-state')).toBe('ready');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${viewport.width}x${viewport.height} horizontal overflow`).toBeLessThanOrEqual(1);
      const canvasShot = await page.locator('.pixel-office-canvas').screenshot();
      expect(nonblankColorCount(canvasShot), `${viewport.width}x${viewport.height} canvas colors`).toBeGreaterThan(12);
      await page.locator('#main-content').focus();
      await page.screenshot({ path: join(evidenceDirectory, `${viewport.width}x${viewport.height}-office.png`), fullPage: true });
    }
    expect(pageErrors).toEqual([]);
  }, 120_000);

  it('supports zoom, pan, reset, resize, context recovery, remount, idle, and reduced motion', async () => {
    if (!application) throw new Error('Phase 36 Electron application is not running.');
    const page = await application.firstWindow();
    await page.setViewportSize({ width: 1024, height: 768 });
    const canvas = page.locator('.pixel-office-canvas');
    await expect.poll(async () => canvas.getAttribute('data-render-state')).toBe('ready');
    await expect.poll(async () => canvas.getAttribute('data-ticker-state')).toBe('idle');

    await page.getByRole('button', { name: 'Reset camera' }).click();
    const initialZoom = Number(await canvas.getAttribute('data-camera-zoom'));
    await page.getByRole('button', { name: 'Zoom in' }).click();
    expect(Number(await canvas.getAttribute('data-camera-zoom'))).toBeGreaterThan(initialZoom);
    const initialX = await canvas.getAttribute('data-camera-x');
    await page.getByRole('button', { name: 'Pan right' }).click();
    expect(await canvas.getAttribute('data-camera-x')).not.toBe(initialX);
    await page.getByRole('button', { name: 'Reset camera' }).click();
    expect(Number(await canvas.getAttribute('data-camera-zoom'))).toBe(initialZoom);

    const beforeResize = await canvas.boundingBox();
    await page.setViewportSize({ width: 768, height: 1024 });
    const afterResize = await canvas.boundingBox();
    expect(afterResize?.width).not.toBe(beforeResize?.width);
    expect(nonblankColorCount(await canvas.screenshot())).toBeGreaterThan(12);

    const oldCanvas = await canvas.elementHandle();
    await canvas.evaluate((element) => element.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    await expect.poll(async () => oldCanvas?.evaluate((element) => element.isConnected)).toBe(false);
    await expect.poll(async () => page.locator('.pixel-office-canvas').getAttribute('data-render-state'), { timeout: 30_000 }).toBe('ready');
    expect(nonblankColorCount(await page.locator('.pixel-office-canvas').screenshot())).toBeGreaterThan(12);

    await page.getByRole('button', { name: 'Control', exact: true }).click();
    await expect.poll(async () => page.locator('.app-shell').count()).toBe(1);
    await page.getByRole('button', { name: 'Office', exact: true }).click();
    await expect.poll(async () => page.locator('.pixel-office-canvas').getAttribute('data-render-state')).toBe('ready');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(async () => page.locator('.pixel-office').getAttribute('data-motion')).toBe('reduced');
    await expect.poll(async () => page.locator('.pixel-office-canvas').getAttribute('data-ticker-state')).toBe('idle');
    expect(await page.locator('button:visible').evaluateAll((buttons) => buttons.filter((button) => !(button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent?.trim() ?? '')).length)).toBe(0);
  }, 120_000);
});

function nonblankColorCount(buffer: Buffer): number {
  const image = PNG.sync.read(buffer);
  const colors = new Set<string>();
  const stride = Math.max(1, Math.floor(Math.min(image.width, image.height) / 80));
  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      const offset = (image.width * y + x) * 4;
      if (image.data[offset + 3] === 0) continue;
      colors.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`);
    }
  }
  return colors.size;
}
