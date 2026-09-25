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
import { OrganizationAuthorityService } from '@h2a/organization';

const root = process.cwd();
let temporaryRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => {
  await application?.close();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('Phase 37 Electron truthful office projection', () => {
  it('renders production-created identities and work, preserves canonical statuses on restart, and exposes inspector evidence', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase37-electron-'));
    const dataRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    await prepareTwoHumans(dataRoot);

    application = await launch(dataRoot);
    let page = await application.firstWindow();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.getByRole('button', { name: 'Demo Gate', exact: true }).click();
    await runGuidedStep(page, 'Create ceremony', 'Ceremony session created');
    await runGuidedStep(page, 'Assess prerequisites', 'Prerequisites assessed');
    await runGuidedStep(page, 'Validate two humans', 'Human readiness');
    await runGuidedStep(page, 'Configure authority', 'Organization authority');
    await runGuidedStateStep(page, 'Create participants', 'participants');
    await runGuidedStateStep(page, 'Issue mandates and tasks', 'assignment_ids');
    await page.getByRole('button', { name: 'Office', exact: true }).click();
    await page.waitForSelector('.pixel-office-canvas[data-render-state="ready"]', { timeout: 30_000 });

    expect(await page.locator('[data-office-kind="agent"], [data-office-kind="framework-agent"]').count()).toBe(4);
    expect(await page.locator('[data-office-kind="assignment"]').count()).toBe(4);
    expect(await page.locator('[data-office-kind="passport"]').count()).toBeGreaterThanOrEqual(4);
    expect(await page.locator('[data-office-kind="assignment"][data-entity-status="succeeded"]').count()).toBe(0);
    expect(await page.locator('[data-office-kind="assignment"][data-entity-activity="persisted-success"]').count()).toBe(0);

    const assignment = page.locator('[data-office-kind="assignment"]').first();
    const assignmentEntityId = await assignment.getAttribute('data-office-entity-id');
    await assignment.getByRole('button').click();
    await expect.poll(async () => page.locator('.office-entity-inspector').getAttribute('data-inspector-entity-id')).toBe(assignmentEntityId);
    const inspectorText = await page.getByRole('complementary', { name: 'Office inspector' }).innerText();
    expect(inspectorText).toContain('AUTHORITY CHAIN');
    expect(inspectorText).toContain('CANONICAL ID');
    expect(inspectorText).toContain('No persisted output hash');

    await page.locator('[data-office-kind="passport"]').first().getByRole('button').click();
    const evidenceButton = page.locator('.office-evidence-links button').first();
    expect(await evidenceButton.count()).toBe(1);
    await expect.poll(async () => evidenceButton.isEnabled(), { timeout: 30_000 }).toBe(true);
    await evidenceButton.click();
    await expect.poll(async () => page.locator('.app-shell').count(), { timeout: 30_000 }).toBe(1);
    expect(await page.locator('body').innerText()).toContain('Evidence Explorer');
    await page.getByRole('button', { name: 'Office', exact: true }).click();

    const beforeRestart = await operationalProjection(page);
    await application.close();
    application = await launch(dataRoot);
    page = await application.firstWindow();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.getByRole('button', { name: 'Office', exact: true }).click();
    await page.waitForSelector('.pixel-office-canvas[data-render-state="ready"]', { timeout: 30_000 });
    expect(await operationalProjection(page)).toEqual(beforeRestart);

    const evidenceDirectory = join(root, 'docs', 'plan4', 'evidence', 'phase37');
    await mkdir(evidenceDirectory, { recursive: true });
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(async () => page.locator('.pixel-office-canvas').getAttribute('data-render-state')).toBe('ready');
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${viewport.width}x${viewport.height} horizontal overflow`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: join(evidenceDirectory, `${viewport.width}x${viewport.height}-truthful-office.png`) });
    }
    expect(pageErrors).toEqual([]);
  }, 360_000);
});

async function operationalProjection(page: Page): Promise<Array<{ id: string | null; status: string | null; activity: string | null }>> {
  return page.locator('[data-office-entity-id]').evaluateAll((elements) => elements.map((element) => ({
    id: element.getAttribute('data-office-entity-id'), status: element.getAttribute('data-entity-status'), activity: element.getAttribute('data-entity-activity')
  })).sort((left, right) => (left.id ?? '').localeCompare(right.id ?? '')));
}

async function runGuidedStep(page: Page, buttonName: string, persistedResult: string): Promise<void> {
  const button = page.getByRole('button', { name: buttonName, exact: true });
  await expect.poll(async () => button.isEnabled().catch(() => false), { timeout: 120_000 }).toBe(true);
  await button.click({ timeout: 120_000 });
  await expect.poll(async () => page.locator('body').innerText({ timeout: 1_000 }).catch(() => ''), { timeout: 120_000 }).toContain(persistedResult);
}

async function runGuidedStateStep(page: Page, buttonName: string, field: 'participants' | 'assignment_ids'): Promise<void> {
  const button = page.getByRole('button', { name: buttonName, exact: true });
  await expect.poll(async () => button.isEnabled().catch(() => false), { timeout: 120_000 }).toBe(true);
  await button.click({ timeout: 120_000 });
  await expect.poll(async () => page.evaluate(async (key) => {
    if (!window.h2a) return 0;
    const state = await window.h2a.getGuidedBootstrapState();
    return key === 'participants' ? state.participants.filter((item) => item.status === 'ready').length : state.assignment_ids.length;
  }, field), { timeout: 120_000 }).toBe(4);
}

async function prepareTwoHumans(sessionRoot: string): Promise<void> {
  const ledger = new LocalAuthorityEventLedger(sessionRoot);
  const humans = new HumanIdentityV2Service(sessionRoot, ledger, new DeterministicBch());
  await humans.initialize();
  await humans.enroll(enrollment('human_admin', 'membership_admin', 'Kink Approver', 1));
  await humans.enroll(enrollment('human_operator', 'membership_operator', 'Varun Operator', 101));
  await humans.verify(verification('human_admin', 'membership_admin', 101, 'cross_operator_to_admin'));
  await humans.verify(verification('human_operator', 'membership_operator', 1, 'cross_admin_to_operator'));
  await humans.verify(verification('human_admin', 'membership_admin', 1, 'own_admin'));
  const state = await humans.verify(verification('human_operator', 'membership_operator', 101, 'own_operator'));
  const adminProof = state.active_proofs.find((proof) => proof.human_id === 'human_admin')!;
  const organization = new OrganizationAuthorityService(sessionRoot, ledger, humans);
  await organization.initialize();
  await organization.bootstrap({ organization_id: 'org_hp_demo', name: 'HP Enterprise Demo', policy_version: 'policy_2026_01', human_id: 'human_admin', membership_id: 'membership_admin', human_proof_id: adminProof.human_proof_id, employee_id: 'E-100', department: 'Enterprise Security', credential_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
}

async function launch(sessionRoot: string): Promise<ElectronApplication> {
  const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: sessionRoot, NODE_ENV: 'production' }, timeout: 30_000 });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Control', exact: true }).click();
  await page.waitForSelector('aside[aria-label="Primary navigation"]', { timeout: 30_000 });
  return app;
}

const policy: BiometricTokenSetPolicy = { policy_id: 'phase37-face-v2-20', token_set_size: 20, required_matches: 1, bch_error_tolerance: 1800, proof_ttl_seconds: 300, quality_threshold: 0.65, liveness_threshold: 0.75, minimum_distance_cm: 35, maximum_distance_cm: 85, calibration_status: 'demo-unmeasured' };
function enrollment(humanId: string, membershipId: string, displayName: string, seed: number): EnrollHumanV2Request { return { organization_id: 'org_hp_demo', human_id: humanId, membership_id: membershipId, display_name: displayName, policy, captures: Array.from({ length: 20 }, (_, index) => ({ sample: sample(seed + index), assessment: { quality_score: 0.9, liveness_score: 0.94, distance_cm: 58, face_count: 1, captured_at: new Date(Date.now() + index).toISOString() } })) }; }
function verification(humanId: string, membershipId: string, seed: number, nonce: string) { return { organization_id: 'org_hp_demo', human_id: humanId, membership_id: membershipId, purpose: 'authorize Phase 25 enterprise bootstrap', nonce, capture: { sample: sample(seed), assessment: { quality_score: 0.91, liveness_score: 0.95, distance_cm: 56, face_count: 1, captured_at: new Date().toISOString() } } }; }
function sample(seed: number): Array<0 | 1> { return Array.from({ length: 4096 }, (_, index) => (((index * 31) + seed * 17 + Math.floor(index / (seed + 1))) % 2) as 0 | 1); }
class DeterministicBch implements BchFuzzyExtractorPort { public async register(samples: number[][]): Promise<BchRegistrationResult> { return { salt: 'phase37-secret', records: samples.map((value, index) => ({ record_id: `record-${index + 1}`, helper: `helper-${fingerprint(value)}`, token: `token-${fingerprint(value)}`, k2: `k2-${index + 1}` })) }; } public async verify(value: number[], enrollmentValue: BchRegistrationResult) { const expected = `token-${fingerprint(value)}`; return enrollmentValue.records.map((record) => ({ matched: record.token === expected, correctedErrors: record.token === expected ? 0 : -1 })); } }
function fingerprint(value: number[]): string { return value.join('').slice(0, 256); }
