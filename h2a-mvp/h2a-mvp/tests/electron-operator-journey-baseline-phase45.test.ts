import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication } from 'playwright';

const root = process.cwd();
let temporaryRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => {
  await application?.close();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}, 30_000);

describe('Phase 45 guided application baseline', () => {
  it('opens every current journey and its Control destination without changing command behavior', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase45-electron-'));
    const dataRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 });
    const page = await application.firstWindow();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForSelector('#main-content', { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#main-content')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 30_000 });

    const expectations = [
      ['set-up-people', 'enroll-two-humans', 'Human Proof'],
      ['connect-agents', 'create-ceremony', 'Demo Gate'],
      ['run-governed-task', 'bind-mandates-and-tasks', 'Demo Gate'],
      ['approve-protected-action', 'configure-policy', 'Authority Inbox'],
      ['connect-friend-node', 'configure-node', 'Federation'],
      ['prepare-hp-demonstration', 'create-clean-phase44-root', 'Demo Gate']
    ] as const;

    for (const [workflowId, stepId, destination] of expectations) {
      await page.getByRole('combobox', { name: 'Guided workflow' }).selectOption(workflowId);
      await expect.poll(async () => page.locator('.guided-workflow-dock').getAttribute('data-step-id')).toBe(stepId);
      const baselineText = await page.locator('.guided-workflow-next').textContent();
      expect(baselineText).toContain('Next destination:');
      expect(baselineText).toMatch(/[A-Z][A-Z0-9_]+/u);
      await page.locator('[data-control-id="office.workflow.continue"]').click();
      await expect.poll(async () => page.locator('header.topbar h1').textContent()).toBe(destination);
      await expect.poll(async () => page.locator('.workflow-detour-banner').count()).toBe(1);
      await page.getByRole('button', { name: 'Return to Office workflow' }).click();
      await expect.poll(async () => page.locator('.office-shell').count()).toBe(1);
    }

    const evidence = join(root, 'docs', 'plan5', 'evidence', 'phase45');
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, '1440x900-office-journey-baseline.png'), fullPage: true });
    await page.locator('[data-control-id="office.workflow.continue"]').click();
    await expect.poll(async () => page.locator('header.topbar h1').textContent()).toBe('Demo Gate');
    await page.screenshot({ path: join(evidence, '1440x900-control-destination-baseline.png'), fullPage: true });
  }, 180_000);
});

