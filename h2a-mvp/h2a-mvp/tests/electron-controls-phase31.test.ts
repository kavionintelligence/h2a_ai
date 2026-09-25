import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import type { ConnectorManifest } from '@h2a/contracts';
import { canonicalize, hashCanonical } from '@h2a/evidence';

const root = process.cwd();
const routes = ['Command Floor', 'Human Proof', 'People & Authority', 'Authority Inbox', 'Mandates', 'Context Broker', 'Federation', 'Evidence', 'Demo Gate', 'Settings'];
const viewports = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }];
let temporaryRoot = '';
let sessionRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => {
  await application?.close();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('Phase 31 every page and control acceptance', () => {
  it('exercises safe controls and verifies every route at all target viewports', async () => {
    const page = await launch();
    const evidenceDirectory = join(root, 'docs/plan3/evidence/phase31');
    await mkdir(evidenceDirectory, { recursive: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      for (const route of routes) {
        await navigate(page, route);
        expect(await page.locator('main button:visible').evaluateAll((buttons) => buttons.filter((button) => !(button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent?.trim() ?? '')).length), `${viewport.width}x${viewport.height}:${route}: unnamed button`).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${viewport.width}x${viewport.height}:${route}: horizontal overflow`).toBeLessThanOrEqual(1);
        expect(await page.locator('main button:visible').evaluateAll((buttons) => buttons.filter((button) => button.clientWidth > 0 && button.scrollWidth - button.clientWidth > 2).length), `${viewport.width}x${viewport.height}:${route}: clipped button`).toBe(0);
        expect(await page.locator('body').innerText()).not.toMatch(/proof_preview_admin|trace_supplier_review|PREVIEWPUBLICKEYMATERIAL/iu);
        const slug = route.toLowerCase().replaceAll(' & ', '-').replaceAll(' ', '-');
        await page.screenshot({ path: join(evidenceDirectory, `${viewport.width}x${viewport.height}-${slug}.png`), fullPage: true });
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await navigate(page, 'Command Floor');
    await page.getByRole('button', { name: 'Add agent' }).click();
    await expect.poll(async () => page.getByRole('dialog').isVisible()).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(async () => page.getByRole('dialog').count()).toBe(0);
    await expect.poll(async () => page.getByText('No agents are registered').count()).toBe(1);

    await navigate(page, 'Authority Inbox');
    await page.getByRole('button', { name: 'New policy' }).click();
    await expect.poll(async () => page.getByRole('dialog').count()).toBe(1);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(async () => page.getByRole('dialog').count()).toBe(0);
    await expect.poll(async () => page.getByRole('button', { name: /Escalate action unavailable/u }).isDisabled()).toBe(true);

    await navigate(page, 'Context Broker');
    for (const tab of ['grants', 'disclosures', 'artifacts', 'messages']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect.poll(async () => page.getByRole('tab', { name: tab, exact: true }).getAttribute('aria-selected')).toBe('true');
    }
    await page.getByRole('button', { name: 'Add artifact' }).click();
    await expect.poll(async () => page.getByRole('dialog').count()).toBe(1);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(async () => page.getByRole('dialog').count()).toBe(0);

    await navigate(page, 'Federation');
    for (const name of ['Join node', 'Configure node']) {
      await page.getByRole('button', { name }).click();
      await expect.poll(async () => page.getByRole('dialog').count()).toBe(1);
      await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    }
    await expect.poll(async () => page.getByRole('button', { name: /Invite node unavailable/u }).isDisabled()).toBe(true);

    await navigate(page, 'Settings');
    await page.getByRole('button', { name: 'Probe connector dependencies' }).click();
    await expect.poll(async () => page.getByText('MCP Gateway').count()).toBeGreaterThan(0);
  }, 240_000);

  it('imports a publisher-signed connector through Settings and preserves it after restart', async () => {
    let page = await currentPage();
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
    await navigate(page, 'Settings');
    const publisher = keyPair();
    const runtime = keyPair();
    const manifest = signManifest({
      schema_version: 2,
      connector_manifest_id: 'connector_phase31_acceptance',
      name: 'Phase 31 Acceptance Connector',
      provider: 'phase31-acceptance',
      adapter_version: '1.0.0',
      protocol: 'local-cli',
      auth_method: 'none',
      trust_ceiling: 'connected-observed',
      capabilities: ['task.receive', 'result.return'],
      executable: process.execPath,
      h2a_extension_required: true,
      status: 'available'
    }, publisher.privateKeyPem);

    await page.getByRole('button', { name: 'Import signed connector' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Signed Connector Manifest JSON').fill(JSON.stringify(manifest));
    await dialog.getByLabel('Publisher public key PEM').fill(publisher.publicKeyPem);
    await dialog.getByLabel('Runtime public key PEM').fill(runtime.publicKeyPem);
    await dialog.getByRole('button', { name: 'Verify and import' }).click();
    await expect.poll(async () => page.getByText('Phase 31 Acceptance Connector').count()).toBe(1);
    await expect.poll(async () => page.getByText('connector_phase31_acceptance').count()).toBe(1);

    await application?.close();
    application = undefined;
    page = await launchExisting();
    await navigate(page, 'Settings');
    await page.getByRole('button', { name: 'Probe connector dependencies' }).click();
    await expect.poll(async () => page.getByText('Phase 31 Acceptance Connector').count(), { timeout: 15_000 }).toBe(1);
  }, 90_000);
});

async function launch(): Promise<Page> {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase31-electron-'));
  sessionRoot = join(temporaryRoot, 'session');
  execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', sessionRoot], { cwd: root, stdio: 'pipe' });
  return launchExisting();
}

async function launchExisting(): Promise<Page> {
  application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: sessionRoot, NODE_ENV: 'production' }, timeout: 30_000 });
  const page = await application.firstWindow();
  await page.getByRole('button', { name: 'Control', exact: true }).click();
  await page.waitForSelector('aside[aria-label="Primary navigation"]', { timeout: 30_000 });
  return page;
}

async function currentPage(): Promise<Page> {
  if (!application) throw new Error('Phase 31 Electron application is not running.');
  return application.firstWindow();
}

async function navigate(page: Page, route: string): Promise<void> {
  await page.getByRole('button', { name: route, exact: true }).click();
  await expect.poll(async () => page.locator('header.topbar h1').textContent()).toBe(route);
  await expect.poll(async () => page.locator('#main-content').getAttribute('aria-busy')).toBe('false');
}

function keyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const pair = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  };
}

function signManifest(unsigned: Omit<ConnectorManifest, 'canonical_hash' | 'publisher_signature'>, privateKeyPem: string): ConnectorManifest {
  return { ...unsigned, canonical_hash: hashCanonical(unsigned), publisher_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), privateKeyPem).toString('base64')}` };
}
