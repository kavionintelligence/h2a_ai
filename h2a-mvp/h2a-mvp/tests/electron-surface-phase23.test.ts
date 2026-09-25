import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication } from 'playwright';

const root = process.cwd();
let temporaryRoot = '';
let sessionRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => {
  await application?.close();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('Phase 23 Electron product surface', () => {
  it('opens every production route with named controls and no preview state', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase23-electron-'));
    sessionRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', sessionRoot], { cwd: root, stdio: 'pipe' });
    application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: sessionRoot, NODE_ENV: 'production' }, timeout: 30_000 });
    const page = await application.firstWindow();
    await page.getByRole('button', { name: 'Control', exact: true }).click();
    await page.waitForSelector('aside[aria-label="Primary navigation"]', { timeout: 30_000 });

    const routes = ['Command Floor', 'Human Proof', 'People & Authority', 'Authority Inbox', 'Mandates', 'Context Broker', 'Federation', 'Evidence', 'Demo Gate', 'Settings'];
    const viewports = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }];
    const evidenceDirectory = join(root, 'docs/plan3/evidence/phase23');
    await mkdir(evidenceDirectory, { recursive: true });
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await page.getByRole('button', { name: route, exact: true }).click();
        await expect.poll(async () => page.locator('header.topbar h1').textContent()).toBe(route);
        const unnamed = await page.locator('main button:visible').evaluateAll((buttons) => buttons.filter((button) => !(button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent?.trim())).length);
        expect(unnamed, `${viewport.width}x${viewport.height}:${route}`).toBe(0);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${viewport.width}x${viewport.height}:${route}`).toBeLessThanOrEqual(1);
        expect(await page.locator('body').innerText()).not.toMatch(/proof_preview_admin|trace_supplier_review|PREVIEWPUBLICKEYMATERIAL/iu);
        const slug = route.toLowerCase().replaceAll(' & ', '-').replaceAll(' ', '-');
        await page.screenshot({ path: join(evidenceDirectory, `${viewport.width}x${viewport.height}-${slug}.png`), fullPage: true });
      }
    }

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect.poll(async () => page.locator('.topbar-context').innerText()).not.toContain('Scripted workplace');
    expect(await page.locator('.topbar-context').innerText()).toContain('Trust');

    await page.getByRole('button', { name: 'Context Broker', exact: true }).click();
    expect(await page.getByRole('button', { name: /Issue grant unavailable/u }).getAttribute('title')).toBe('Add an active protected artifact before issuing a Context Grant.');
    await page.getByRole('button', { name: 'Authority Inbox', exact: true }).click();
    expect(await page.getByRole('button', { name: /Escalate action unavailable/u }).getAttribute('title')).toBe('Create an active approval policy before escalating an action.');
    await page.getByRole('button', { name: 'Federation', exact: true }).click();
    expect(await page.getByRole('button', { name: /Invite node unavailable/u }).getAttribute('title')).toBe('Configure this local federation node before creating an invitation.');
  }, 180_000);
});
