import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { GoalWorkGraphCoordinator, type GoalWorkGraphPorts } from '@h2a/projects';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import type { EmployeeWorkspaceApi, VerifyHumanV2Request } from '@h2a/contracts';
import { employeeWorkspaceFixture } from './helpers/employeeWorkspaceFixture';

const root = process.cwd();
let temporaryRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => {
  await application?.close();
  if (temporaryRoot && resolve(temporaryRoot).startsWith(resolve(tmpdir()) + sep)) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}, 30_000);

describe('simplified workspace in production Electron', () => {
  it('renders the real five-screen workspace after trusted employee sign-in without mutating the plan', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-workspace-ux-'));
    const dataRoot = join(temporaryRoot, 'session');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    const fixture = await employeeWorkspaceFixture(dataRoot, { realBch: true, initialDate: new Date(Date.now() - 60_000) });

    // Isolated visual fixture only. It never issues authority or invokes a provider.
    const ports: GoalWorkGraphPorts = {
      candidates: async () => [
        { candidate_id: 'test_claude', execution_target: 'local', agent_id: 'test_agent_claude', runtime_binding_id: 'test_binding_claude', display_name: 'Test design agent', provider: 'claude-code', human_owner_id: 'human_1', passport_id: 'test_passport_claude', runtime_session_id: 'test_session_claude', runtime_attestation_id: 'test_attestation_claude', remote_peer_id: null, capabilities: ['evidence.read', 'findings.write'], status: 'ready', reason_code: null },
        { candidate_id: 'test_codex', execution_target: 'local', agent_id: 'test_agent_codex', runtime_binding_id: 'test_binding_codex', display_name: 'Test coding agent', provider: 'openai-codex', human_owner_id: 'human_1', passport_id: 'test_passport_codex', runtime_session_id: 'test_session_codex', runtime_attestation_id: 'test_attestation_codex', remote_peer_id: null, capabilities: ['evidence.read', 'findings.write'], status: 'ready', reason_code: null }
      ],
      assertProject: async () => undefined,
      planningScope: async () => ({ editable_paths: ['src/**'], network_hosts: [], validation_commands: ['test'], context_fields: ['case_id', 'system_name'] }),
      authorizeApproval: async () => { throw new Error('No human acceptance in this visual test'); },
      provisionNode: async () => { throw new Error('No authority in this visual test'); },
      runNode: async () => { throw new Error('No providers in this visual test'); },
      cancelNode: async () => [],
      revokeNode: async () => []
    };
    const coordinator = new GoalWorkGraphCoordinator(dataRoot, new LocalAuthorityEventLedger(dataRoot), ports);
    await coordinator.initialize();
    const state = await coordinator.composeGoal({ organization_id: 'test_org', project_id: 'test_project', title: 'TEST ONLY - Clothing website', objective: 'Research, design, implement and validate a clothing storefront.', outcome: 'Reviewed website', constraints: ['No private customer information'], deadline: null, sensitivity: 'internal', expected_outputs: ['Design', 'Code', 'Validation'], created_by_human_id: 'human_1', trace_id: 'phase22_workspace_visual_test' });
    await coordinator.proposeGraph({ goal_id: state.goals[0]!.goal_id });
    const graphPath = join(dataRoot, 'projects/goal-work-graphs-v1.json');
    const initialGraph = await readFile(graphPath, 'utf8');

    application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 });
    const page = await application.firstWindow();
    await page.getByRole('heading', { name: 'Sign in as yourself' }).waitFor({ timeout: 60_000 });
    const challenge = await page.evaluate(async () => (window as unknown as { h2aEmployee: EmployeeWorkspaceApi }).h2aEmployee.begin('TEST-1'));
    await signIn(page, fixture.verification(1, challenge.purpose));
    await page.waitForSelector('#workspace-main[aria-busy="false"]', { timeout: 60_000 });

    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.getByRole('button', { name: /TEST ONLY - Clothing website/ }).click();
    await expect.poll(() => page.locator('.ws-graph-agent').count()).toBeGreaterThan(0);
    expect(await page.getByText('One review starts the governed workflow', { exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole('button', { name: 'Approve & start', exact: true }).isVisible()).toBe(true);
    await page.getByRole('button', { name: 'Edit plan', exact: true }).click();
    await page.locator('.ws-surface').getByRole('heading', { name: 'TEST ONLY - Clothing website', exact: true }).waitFor();
    await expectWorkspaceSurface(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    const evidence = join(root, 'docs/ux-v6/evidence');
    await mkdir(evidence, { recursive: true });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const tab of ['Flow', 'Context', 'Outputs', 'Decisions']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await expectUsableLayout(page);
        await page.screenshot({ path: join(evidence, `${viewport.width}-mission-${tab.toLowerCase()}-test-only.png`), fullPage: true });
      }
    }

    await page.getByLabel('Workspace navigation').getByRole('button', { name: 'Agent canvas', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const destination of ['Workspaces', 'People & agents', 'Company memory', 'Security map']) {
      await page.getByRole('button', { name: destination, exact: true }).click();
      await page.getByRole('heading', { name: destination, exact: true }).waitFor();
      await expectUsableLayout(page);
      await page.screenshot({ path: join(evidence, `1440-${destination.toLowerCase().replaceAll(/[^a-z]+/gu, '-')}-test-only.png`), fullPage: true });
    }

    await page.getByRole('button', { name: 'Start HP demonstration', exact: true }).click();
    await page.getByRole('region', { name: 'HP demonstration guide' }).waitFor();
    expect(await page.getByText('GUIDED ENTERPRISE STORY', { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText(/PHASE 43 \/ RELEASE INTEGRATION/u).count()).toBe(0);
    expect(await page.getByText(/PHASE 24 \/ LIVENESS/u).count()).toBe(0);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Company memory', exact: true }).click();
    await page.getByRole('button', { name: 'Sharing boundaries', exact: true }).click();
    await page.getByRole('heading', { name: 'Least-context sharing', exact: true }).waitFor();
    await expectWorkspaceSurface(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Workspaces', exact: true }).click();
    await page.getByRole('button', { name: 'Create room', exact: true }).click();
    await page.getByRole('heading', { name: 'Persistent team rooms', exact: true }).waitFor();
    await page.getByPlaceholder('Product launch').fill('TEST ONLY - Persistent room');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByText('TEST ONLY - Persistent room', { exact: true }).first().waitFor();
    await expectWorkspaceSurface(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Connect project', exact: true }).click();
    await page.getByRole('heading', { name: 'Connect a project workspace', exact: true }).waitFor();
    await expectWorkspaceSurface(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Security map', exact: true }).click();
    await page.getByRole('button', { name: 'Run security controls', exact: true }).click();
    await page.getByRole('heading', { name: 'Security controls', exact: true }).waitFor();
    await expectWorkspaceSurface(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Investigate evidence', exact: true }).click();
    await page.locator('.ws-surface-content').getByRole('heading', { name: 'Work receipts', exact: true }).waitFor();
    await expectWorkspaceSurface(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'People & agents', exact: true }).click();
    await page.getByText(/without borrowed authority/u).waitFor();
    await page.getByRole('tab', { name: 'Teams', exact: true }).click();
    await page.getByRole('tab', { name: 'Agent connections', exact: true }).click();
    expect(await page.getByRole('heading', { name: 'Claude Code', exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole('heading', { name: 'REST / webhook', exact: true }).isVisible()).toBe(true);
    await page.getByRole('tab', { name: 'People', exact: true }).click();
    await page.getByRole('button', { name: 'Connect agent', exact: true }).click();
    await page.getByText('Connect an agent in one guided flow', { exact: true }).waitFor();
    expect(await page.getByText(/PHASE 26 \/ REAL COLLABORATION/u).count()).toBe(0);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Proof', exact: true }).click();
    expect(await page.getByText('human_1', { exact: true }).count()).toBeGreaterThan(0);
    expect(await readFile(graphPath, 'utf8')).toBe(initialGraph);
    expect(pageErrors).toEqual([]);
  }, 240_000);
});

async function signIn(page: Page, verification: VerifyHumanV2Request): Promise<void> {
  await page.evaluate(async input => {
    const api = (window as unknown as { h2aEmployee: EmployeeWorkspaceApi }).h2aEmployee;
    const state = await api.verify(input);
    if (state.last_result?.decision !== 'verified') throw new Error(JSON.stringify(state.last_result));
    await api.login(state.active_proofs[0]!.human_proof_id);
  }, verification);
}

async function expectUsableLayout(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.locator('.employee-console-content').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.locator('.h2a-workspace button:visible').evaluateAll(buttons => buttons.filter(button => !button.getAttribute('aria-label')?.trim() && !button.textContent?.trim()).length)).toBe(0);
  expect(await page.locator('.h2a-workspace button:visible').evaluateAll(buttons => buttons.flatMap(button => button.scrollWidth > button.clientWidth + 2 || button.scrollHeight > button.clientHeight + 2 ? [button.getAttribute('aria-label') ?? button.textContent] : []))).toEqual([]);
}

async function expectWorkspaceSurface(page: Page): Promise<void> {
  const surface = page.locator('.ws-surface');
  await surface.waitFor();
  expect(await surface.getByText(/PHASE \d+/u).count()).toBe(0);
  expect(await surface.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
}
