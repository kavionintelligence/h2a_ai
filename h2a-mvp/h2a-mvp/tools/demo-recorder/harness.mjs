/**
 * Shared harness for the H2A demonstration recorder.
 *
 * Every helper here drives the real Electron product surface through Playwright.
 * Nothing in this file fabricates product state: identity, authority, agent,
 * mandate, context, approval, and evidence records are produced by the same
 * `window.h2a` control-plane API and the same `data-control-id` controls that a
 * live operator would use.
 */
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

export const VIEWPORT = { width: 1440, height: 900 };
export const ORGANIZATION_ID = 'org_hp_demo';
export const ADMIN = { humanId: 'human_admin', membershipId: 'membership_admin', displayName: 'Priya Approver', seed: 1 };
export const OPERATOR = { humanId: 'human_operator', membershipId: 'membership_operator', displayName: 'Varun Operator', seed: 101 };

export const PROOF_POLICY = {
  policy_id: 'demo-face-v2-20',
  token_set_size: 20,
  required_matches: 1,
  bch_error_tolerance: 1800,
  proof_ttl_seconds: 300,
  quality_threshold: 0.65,
  liveness_threshold: 0.75,
  minimum_distance_cm: 35,
  maximum_distance_cm: 85,
  calibration_status: 'demo-unmeasured'
};

/**
 * The IDE extension host exports ELECTRON_RUN_AS_NODE=1, which makes the
 * Electron binary behave as plain Node and refuse to boot the desktop app.
 * Strip it (and the VS Code IPC handles) before launching.
 */
export function launchEnv(dataRoot, extra = {}) {
  const env = { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production', ...extra };
  for (const key of Object.keys(env)) {
    if (key === 'ELECTRON_RUN_AS_NODE' || key.startsWith('VSCODE_')) delete env[key];
  }
  return env;
}

export async function launchApp({ projectRoot, dataRoot, videoDir, extraEnv }) {
  const application = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: launchEnv(dataRoot, extraEnv),
    recordVideo: videoDir ? { dir: videoDir, size: VIEWPORT } : undefined,
    timeout: 120_000
  });
  const page = await application.firstWindow();
  await page.setViewportSize(VIEWPORT);
  await waitForShell(page);
  return { application, page };
}

export async function waitForShell(page) {
  await page.waitForSelector('#main-content', { timeout: 120_000 });
  await page
    .waitForFunction(() => document.querySelector('#main-content')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 120_000 })
    .catch(() => undefined);
}

export async function reloadShell(page) {
  await page.reload();
  await waitForShell(page);
}

/* ------------------------------------------------------------------ *
 * On-screen caption overlay (renderer-only, pointer-events: none)     *
 * ------------------------------------------------------------------ */

const OVERLAY_ID = 'h2a-demo-caption-overlay';

export async function installOverlay(page, scene) {
  await page.evaluate(
    ({ overlayId, title, subtitle }) => {
      document.getElementById(overlayId)?.remove();
      const host = document.createElement('div');
      host.id = overlayId;
      host.setAttribute('data-demo-overlay', 'true');
      host.style.cssText = [
        'position:fixed', 'inset:auto 0 0 0', 'z-index:2147483647', 'pointer-events:none',
        'font:500 14px/1.45 "Segoe UI",system-ui,sans-serif', 'padding:14px 20px 16px',
        'background:linear-gradient(to top,rgba(8,11,18,0.96),rgba(8,11,18,0.78) 70%,rgba(8,11,18,0))',
        'color:#f4f7fb', 'display:flex', 'flex-direction:column', 'gap:4px'
      ].join(';');
      const heading = document.createElement('div');
      heading.style.cssText = 'font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8fb4ff;font-weight:700';
      heading.textContent = title;
      const step = document.createElement('div');
      step.id = `${overlayId}-step`;
      step.style.cssText = 'font-size:17px;font-weight:600;color:#ffffff';
      step.textContent = subtitle;
      const note = document.createElement('div');
      note.id = `${overlayId}-note`;
      note.style.cssText = 'font-size:12.5px;color:#b9c6d9;min-height:17px';
      note.textContent = '';
      host.append(heading, step, note);
      document.body.append(host);
    },
    { overlayId: OVERLAY_ID, title: scene.title, subtitle: scene.subtitle ?? '' }
  );
}

export async function caption(page, step, note = '') {
  await page
    .evaluate(
      ({ overlayId, step: stepText, note: noteText }) => {
        const stepNode = document.getElementById(`${overlayId}-step`);
        const noteNode = document.getElementById(`${overlayId}-note`);
        if (stepNode) stepNode.textContent = stepText;
        if (noteNode) noteNode.textContent = noteText;
      },
      { overlayId: OVERLAY_ID, step, note }
    )
    .catch(() => undefined);
}

/* ------------------------------------------------------------------ *
 * Pacing helpers - videos are for humans, so steps hold on screen     *
 * ------------------------------------------------------------------ */

export const beat = (page, ms = 900) => page.waitForTimeout(ms);

export async function narrate(page, step, note = '', hold = 2200) {
  await caption(page, step, note);
  await beat(page, hold);
}

/* ------------------------------------------------------------------ *
 * Resilient interaction helpers                                       *
 * ------------------------------------------------------------------ */

export async function clickControl(page, controlId, { index = 0, timeout = 20_000 } = {}) {
  const locator = page.locator(`[data-control-id="${controlId}"]`).nth(index);
  await locator.waitFor({ state: 'visible', timeout });
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.click({ timeout });
  await beat(page, 700);
  return true;
}

export async function tryClickControl(page, controlId, options = {}) {
  try {
    return await clickControl(page, controlId, { timeout: 6_000, ...options });
  } catch {
    return false;
  }
}

export async function tryClickButton(page, name, { exact = false, timeout = 6_000 } = {}) {
  try {
    const button = page.getByRole('button', { name, exact });
    await button.first().waitFor({ state: 'visible', timeout });
    if (!(await button.first().isEnabled())) return false;
    await button.first().click({ timeout });
    await beat(page, 700);
    return true;
  } catch {
    return false;
  }
}

export async function openWorkspace(page, label) {
  await ensureOffice(page);
  const hotspot = page.locator('[data-control-id="office.workspace.open"]').filter({ hasText: label }).first();
  await hotspot.waitFor({ state: 'visible', timeout: 30_000 });
  await hotspot.click();
  await page.locator('[data-office-workspace]').first().waitFor({ state: 'visible', timeout: 30_000 });
  await beat(page, 1200);
}

export async function closeWorkspace(page) {
  if ((await page.locator('[data-office-workspace]').count()) === 0) return;
  await page.keyboard.press('Escape');
  await page.locator('[data-office-workspace]').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
  await beat(page, 500);
}

export async function ensureOffice(page) {
  const office = page.getByRole('button', { name: 'Office', exact: true });
  if ((await office.count()) === 0) return;
  if ((await office.getAttribute('aria-pressed')) !== 'true') {
    await office.click();
    await beat(page, 900);
  }
}

export async function ensureControl(page) {
  const control = page.getByRole('button', { name: 'Control', exact: true });
  if ((await control.count()) === 0) return;
  if ((await control.getAttribute('aria-pressed')) !== 'true') {
    await control.click();
    await page.waitForSelector('aside[aria-label="Primary navigation"]', { timeout: 30_000 }).catch(() => undefined);
    await beat(page, 900);
  }
}

export async function openControlScreen(page, name) {
  await ensureControl(page);
  const item = page.getByRole('button', { name, exact: true }).first();
  await item.waitFor({ state: 'visible', timeout: 30_000 });
  await item.click();
  await beat(page, 1400);
}

/** Scroll the visible workspace/panel so long records are actually readable. */
export async function panThrough(page, selector, { steps = 3, hold = 1500 } = {}) {
  const target = page.locator(selector).first();
  if ((await target.count()) === 0) return;
  for (let index = 1; index <= steps; index += 1) {
    await target
      .evaluate((node, ratio) => {
        const scrollable = node.scrollHeight > node.clientHeight ? node : document.scrollingElement ?? document.body;
        scrollable.scrollTo({ top: (scrollable.scrollHeight - scrollable.clientHeight) * ratio, behavior: 'smooth' });
      }, index / steps)
      .catch(() => undefined);
    await beat(page, hold);
  }
}

/** Click each tab-like control inside a region so the audience sees every view. */
export async function walkTabs(page, labels, { hold = 2000 } = {}) {
  const seen = [];
  for (const label of labels) {
    const tab = page.getByRole('button', { name: label, exact: false }).first();
    if ((await tab.count()) === 0) continue;
    if (!(await tab.isVisible().catch(() => false))) continue;
    await tab.click({ timeout: 6_000 }).catch(() => undefined);
    seen.push(label);
    await beat(page, hold);
  }
  return seen;
}

/* ------------------------------------------------------------------ *
 * Human Proof - deterministic capture through the product API         *
 * ------------------------------------------------------------------ */

/**
 * Deterministic biometric sample generator. Identical to the vector the
 * project's own Electron acceptance tests use, so the real BCH fuzzy
 * extractor in the app performs a genuine enrollment and match.
 */
export const SAMPLE_FN = `(seed) => Array.from({ length: 4096 }, (unused, index) => ((index * 31) + seed * 17 + Math.floor(index / (seed + 1))) % 2)`;

export async function enrollHumans(page) {
  return page.evaluate(
    async ({ organizationId, people, policy, sampleSource }) => {
      const sample = eval(sampleSource);
      const state = await window.h2a.getHumanIdentityV2State();
      const enrolled = new Set(state.enrollments.filter((item) => item.status === 'active').map((item) => item.human_id));
      const created = [];
      for (const person of people) {
        if (enrolled.has(person.humanId)) continue;
        await window.h2a.enrollHumanV2({
          organization_id: organizationId,
          human_id: person.humanId,
          membership_id: person.membershipId,
          display_name: person.displayName,
          policy,
          captures: Array.from({ length: policy.token_set_size }, (unused, index) => ({
            sample: sample(person.seed + index),
            assessment: {
              quality_score: 0.9,
              liveness_score: 0.94,
              distance_cm: 58,
              face_count: 1,
              captured_at: new Date(Date.now() + index).toISOString()
            }
          }))
        });
        created.push(person.humanId);
      }
      return created;
    },
    { organizationId: ORGANIZATION_ID, people: [ADMIN, OPERATOR], policy: PROOF_POLICY, sampleSource: SAMPLE_FN }
  );
}

/** Produce a fresh, purpose-bound Human Proof for one enrolled employee. */
export async function proveHuman(page, person, purpose) {
  return page.evaluate(
    async ({ organizationId, person: subject, purpose: exactPurpose, sampleSource }) => {
      const sample = eval(sampleSource);
      const state = await window.h2a.verifyHumanV2({
        organization_id: organizationId,
        human_id: subject.humanId,
        membership_id: subject.membershipId,
        purpose: exactPurpose,
        nonce: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        capture: {
          sample: sample(subject.seed),
          assessment: {
            quality_score: 0.91,
            liveness_score: 0.95,
            distance_cm: 56,
            face_count: 1,
            captured_at: new Date().toISOString()
          }
        }
      });
      const proof = state.active_proofs.filter((item) => item.human_id === subject.humanId && item.purpose === exactPurpose).at(-1);
      return proof ? { humanProofId: proof.human_proof_id, expiresAt: proof.expires_at, purpose: proof.purpose } : null;
    },
    { organizationId: ORGANIZATION_ID, person, purpose, sampleSource: SAMPLE_FN }
  );
}

/** Fresh proofs for both employees, for the purposes the UI gates on. */
export async function refreshBothProofs(page, purpose) {
  const admin = await proveHuman(page, ADMIN, purpose);
  const operator = await proveHuman(page, OPERATOR, purpose);
  return { admin, operator };
}

/** Dismiss the camera-backed Human Proof dialog if a control opened it. */
export async function dismissProofDialog(page) {
  const dialog = page.locator('[role="dialog"]').filter({ hasText: /Human Proof|Verify protected command/u }).first();
  if ((await dialog.count()) === 0) return false;
  if (!(await dialog.isVisible().catch(() => false))) return false;
  await page.keyboard.press('Escape');
  await beat(page, 600);
  return true;
}

/* ------------------------------------------------------------------ *
 * Video bookkeeping                                                   *
 * ------------------------------------------------------------------ */

export async function collectVideo(videoDir, targetPath) {
  const files = await readdir(videoDir).catch(() => []);
  const webm = files.filter((name) => name.endsWith('.webm'));
  if (webm.length === 0) return null;
  const largest = webm.sort().at(-1);
  await rename(join(videoDir, largest), targetPath);
  for (const leftover of webm.filter((name) => name !== largest)) {
    await rm(join(videoDir, leftover), { force: true });
  }
  return targetPath;
}

export async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true }).catch(() => undefined);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
