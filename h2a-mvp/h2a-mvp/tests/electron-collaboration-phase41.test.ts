import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { CURRENT_SCHEMA_VERSION } from '@h2a/contracts';
import { emptyBootstrapStateForTest } from './fixtures/phase34-state';
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

describe('Phase 41 Electron collaboration and proof surface', () => {
  it('keeps the host challenge in place across modes, renderer reload, Escape cancellation, and responsive viewports', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase41-electron-'));
    dataRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    const fixture = await employeeWorkspaceFixture(dataRoot, { realBch: true, initialDate: new Date(Date.now() - 60_000) });
    await seedProofSubject();
    const page = await launch();
    await signInProductionEmployee(page, 'TEST-1', fixture.verification(1, 'sign in to H2A employee workspace'));
    await page.getByRole('button', { name: 'Control console', exact: true }).click();
    await page.waitForSelector('#main-content[aria-busy="false"]', { timeout: 60_000 });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await expect.poll(async () => page.locator('.office-shell').count()).toBe(1);
    await expect.poll(async () => page.locator('.office-session').innerText()).toContain('CONNECTED');
    await page.getByRole('button', { name: 'Control', exact: true }).click();
    await page.getByRole('button', { name: 'Command Floor', exact: true }).click();
    await page.getByRole('button', { name: 'Add agent', exact: true }).click();
    await page.getByRole('dialog', { name: 'Add agent' }).getByRole('button', { name: /Human Proof$/u }).click();
    await expect.poll(async () => page.getByRole('dialog', { name: 'Verify protected command' }).count(), { timeout: 30_000 }).toBe(1);
    const proofDialog = page.getByRole('dialog', { name: 'Verify protected command' });
    await expect.poll(async () => proofDialog.getByText('Camera must show Test Employee 1').count()).toBe(1);
    expect(await proofDialog.getByText('Exact purpose: authorize H2A command floor').count()).toBe(1);
    expect(await proofDialog.getByRole('region', { name: 'Human Proof ceremony progress' }).locator('.proof-stage').count()).toBe(4);
    expect(await proofDialog.getByText(/^Liveness:/u).count()).toBeGreaterThan(0);
    const evidenceDirectory = join(root, 'docs', 'plan5', 'evidence', 'phase47');
    await mkdir(evidenceDirectory, { recursive: true });
    await page.screenshot({ path: join(evidenceDirectory, 'identity-explicit-proof-dialog.png'), fullPage: true });
    expect(await page.locator('.app-shell').count()).toBe(1);
    expect(await page.getByRole('dialog', { name: 'Verify protected command' }).getAttribute('data-challenge-id')).toMatch(/^proof_challenge_/u);
    const rendererClientId = await page.evaluate(() => sessionStorage.getItem('h2a.control-plane.client-id'));

    await page.reload();
    await page.getByRole('heading', { name: 'Sign in as yourself' }).waitFor({ timeout: 60_000 });
    await signInProductionEmployee(page, 'TEST-1', fixture.verification(1, 'sign in to H2A employee workspace'));
    await page.waitForSelector('#main-content[aria-busy="false"]', { timeout: 60_000 });
    await expect.poll(async () => page.getByRole('dialog', { name: 'Verify protected command' }).count(), { timeout: 30_000 }).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem('h2a.control-plane.client-id'))).toBe(rendererClientId);
    await expect.poll(async () => page.locator('.topbar-context').innerText()).toContain('connected');
    await page.keyboard.press('Escape');
    await expect.poll(async () => page.getByRole('dialog', { name: 'Verify protected command' }).count(), { timeout: 30_000 }).toBe(0);
    expect(await page.locator('.app-shell').count()).toBe(1);

    await page.getByRole('button', { name: 'Office', exact: true }).click();
    await expect.poll(async () => page.locator('.office-shell').count()).toBe(1);
    await page.getByRole('button', { name: 'Control', exact: true }).click();
    await page.getByRole('button', { name: 'Command Floor', exact: true }).click();
    expect(await page.getByRole('heading', { name: 'Command Floor' }).count()).toBe(1);

    const phase41EvidenceDirectory = join(root, 'docs', 'plan4', 'evidence', 'phase41');
    await mkdir(phase41EvidenceDirectory, { recursive: true });
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.screenshot({ path: join(phase41EvidenceDirectory, `${viewport.width}x${viewport.height}-operator-session.png`), fullPage: true });
      const overflow = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.right > document.documentElement.clientWidth + 1 || bounds.left < -1
          ? [{ tag: element.tagName, className: element.className, left: Math.round(bounds.left), right: Math.round(bounds.right), width: Math.round(bounds.width) }]
          : [];
      }).slice(0, 12));
      expect(overflow, `Horizontal overflow at ${viewport.width}px: ${JSON.stringify(overflow)}`).toEqual([]);
    }
    expect(pageErrors).toEqual([]);
  }, 240_000);
});

async function seedProofSubject(): Promise<void> {
  const state = {
    ...emptyBootstrapStateForTest,
    administrator_human_id: 'human_1',
    humans: [{
      human_id: 'human_1', display_name: 'Test Employee 1', membership_id: 'member_1',
      enrollment_id: 'enrollment_phase41_operator', token_set_size: 20, required_matches: 1,
      model_set_hash: `sha256:${'1'.repeat(64)}`, proof_id: null, proof_expires_at: null,
      proof_status: 'missing' as const, assurance_level: null
    }],
    updated_at: new Date().toISOString()
  };
  const path = join(dataRoot, 'bootstrap');
  await mkdir(path, { recursive: true });
  await writeFile(join(path, 'phase25-state-v1.json'), `${JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, kind: 'h2a.guided-bootstrap.state', updatedAt: new Date().toISOString(), data: state }, null, 2)}\n`);
}

async function launch(): Promise<Page> {
  application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 });
  const page = await application.firstWindow();
  return page;
}
