import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import type { BchFuzzyExtractorPort, BchRegistrationResult } from '@h2a/biometrics';
import type { BiometricTokenSetPolicy, EnrollHumanV2Request } from '@h2a/contracts';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { HumanIdentityV2Service } from '@h2a/identity';

const root = process.cwd();
let temporaryRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => { await application?.close(); if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

describe('Phase 25 production Electron guided bootstrap', () => {
  it('completes all non-camera setup through controls and reconstructs the graph after restart', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase25-electron-'));
    const sessionRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', sessionRoot], { cwd: root, stdio: 'pipe' });
    await prepareTwoHumans(sessionRoot);

    application = await launch(sessionRoot);
    let page = await application.firstWindow();
    await page.getByRole('button', { name: 'Demo Gate', exact: true }).click();
    await runGuidedStep(page, 'Create ceremony', 'Ceremony session created');
    await runGuidedStep(page, 'Assess prerequisites', 'Prerequisites assessed');
    await runGuidedStep(page, 'Validate two humans', 'Human readiness');
    await runGuidedStep(page, 'Configure authority', 'Organization authority');
    await runGuidedStep(page, 'Create participants', 'Participants\n4/4');
    await runGuidedStep(page, 'Issue mandates and tasks', 'Assignments\n4/4');
    const ceremonyId = await page.locator('.ceremony-identity code').first().textContent();
    const traceId = await page.locator('.ceremony-identity code').nth(1).textContent();

    await application.close(); application = await launch(sessionRoot); page = await application.firstWindow();
    await page.getByRole('button', { name: 'Demo Gate', exact: true }).click();
    expect(await page.locator('.ceremony-identity code').first().textContent()).toBe(ceremonyId);
    expect(await page.locator('.ceremony-identity code').nth(1).textContent()).toBe(traceId);
    await expect.poll(async () => page.locator('.bootstrap-summary').innerText()).toContain('Participants\n4/4');
    await page.getByRole('button', { name: 'Confirm restart recovery', exact: true }).click();
    await expect.poll(async () => page.locator('.bootstrap-step-grid').innerText()).toContain('Restart recovery');
    await expect.poll(async () => page.locator('.bootstrap-step-grid').innerText()).toContain('PASSED');

    const evidenceDirectory = join(root, 'docs/plan3/evidence/phase25'); await mkdir(evidenceDirectory, { recursive: true });
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.locator('.bootstrap-workspace').waitFor({ state: 'visible' });
      await page.locator('.workspace-loading').waitFor({ state: 'detached' });
      const overflow = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        root: {
          html: [document.documentElement.clientWidth, document.documentElement.scrollWidth, Math.round(document.documentElement.getBoundingClientRect().width)],
          body: [document.body.clientWidth, document.body.scrollWidth, Math.round(document.body.getBoundingClientRect().width)],
          app: [document.getElementById('root')?.clientWidth, document.getElementById('root')?.scrollWidth, Math.round(document.getElementById('root')?.getBoundingClientRect().width ?? 0)]
        },
        elements: Array.from(document.querySelectorAll<HTMLElement>('body *')).map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName.toLowerCase(), className: element.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: getComputedStyle(element).overflowX };
        }).filter((item) => item.left < -1 || item.right > document.documentElement.clientWidth + 1 || (item.scrollWidth > item.clientWidth + 1 && item.overflowX === 'visible')).slice(0, 20)
      }));
      expect(overflow.width, `${viewport.width}x${viewport.height} ${JSON.stringify(overflow.root)} ${JSON.stringify(overflow.elements)}`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: join(evidenceDirectory, `${viewport.width}x${viewport.height}-guided-bootstrap.png`), fullPage: true });
    }
  }, 360_000);
});

async function runGuidedStep(page: Page, buttonName: string, persistedResult: string): Promise<void> {
  const button = page.getByRole('button', { name: buttonName, exact: true });
  await expect.poll(async () => button.isVisible().catch(() => false), { timeout: 120_000 }).toBe(true);
  await expect.poll(async () => button.isEnabled().catch(() => false), { timeout: 120_000 }).toBe(true);
  await button.click({ timeout: 120_000 });
  await expect.poll(async () => page.locator('body').innerText({ timeout: 1_000 }).catch(() => ''), { timeout: 120_000 }).toContain(persistedResult);
}

async function prepareTwoHumans(sessionRoot: string): Promise<void> {
  const ledger = new LocalAuthorityEventLedger(sessionRoot);
  const humans = new HumanIdentityV2Service(sessionRoot, ledger, new DeterministicBch()); await humans.initialize();
  await humans.enroll(enrollment('human_admin', 'membership_admin', 'Kink Approver', 1));
  await humans.enroll(enrollment('human_operator', 'membership_operator', 'Varun Operator', 101));
  await humans.verify(verification('human_admin', 'membership_admin', 101, 'cross_operator_to_admin'));
  await humans.verify(verification('human_operator', 'membership_operator', 1, 'cross_admin_to_operator'));
  await humans.verify(verification('human_admin', 'membership_admin', 1, 'own_admin'));
  await humans.verify(verification('human_operator', 'membership_operator', 101, 'own_operator'));
}

async function launch(sessionRoot: string): Promise<ElectronApplication> {
  const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: sessionRoot, NODE_ENV: 'production' }, timeout: 30_000 });
  const page = await app.firstWindow(); await page.getByRole('button', { name: 'Control', exact: true }).click(); await page.waitForSelector('aside[aria-label="Primary navigation"]', { timeout: 30_000 }); return app;
}

const policy: BiometricTokenSetPolicy = { policy_id: 'demo-face-v2-20', token_set_size: 20, required_matches: 1, bch_error_tolerance: 1800, proof_ttl_seconds: 300, quality_threshold: 0.65, liveness_threshold: 0.75, minimum_distance_cm: 35, maximum_distance_cm: 85, calibration_status: 'demo-unmeasured' };
function enrollment(humanId: string, membershipId: string, displayName: string, seed: number): EnrollHumanV2Request { return { organization_id: 'org_hp_demo', human_id: humanId, membership_id: membershipId, display_name: displayName, policy, captures: Array.from({ length: 20 }, (_, index) => ({ sample: sample(seed + index), assessment: { quality_score: 0.9, liveness_score: 0.94, distance_cm: 58, face_count: 1, captured_at: new Date(Date.now() + index).toISOString() } })) }; }
function verification(humanId: string, membershipId: string, seed: number, nonce: string) { return { organization_id: 'org_hp_demo', human_id: humanId, membership_id: membershipId, purpose: 'authorize Phase 25 enterprise bootstrap', nonce, capture: { sample: sample(seed), assessment: { quality_score: 0.91, liveness_score: 0.95, distance_cm: 56, face_count: 1, captured_at: new Date().toISOString() } } }; }
function sample(seed: number): Array<0 | 1> { return Array.from({ length: 4096 }, (_, index) => (((index * 31) + seed * 17 + Math.floor(index / (seed + 1))) % 2) as 0 | 1); }
class DeterministicBch implements BchFuzzyExtractorPort { public async register(samples: number[][]): Promise<BchRegistrationResult> { return { salt: 'phase25-secret', records: samples.map((value, index) => ({ record_id: `record-${index + 1}`, helper: `helper-${fingerprint(value)}`, token: `token-${fingerprint(value)}`, k2: `k2-${index + 1}` })) }; } public async verify(value: number[], enrollmentValue: BchRegistrationResult) { const expected = `token-${fingerprint(value)}`; return enrollmentValue.records.map((record) => ({ matched: record.token === expected, correctedErrors: record.token === expected ? 0 : -1 })); } }
function fingerprint(value: number[]): string { return value.join('').slice(0, 256); }
