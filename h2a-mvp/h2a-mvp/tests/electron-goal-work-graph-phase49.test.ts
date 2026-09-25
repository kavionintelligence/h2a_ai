import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

const root = process.cwd(); let temporaryRoot = ''; let dataRoot = ''; let projectRoot = ''; let application: ElectronApplication | undefined;
afterAll(async () => { await application?.close(); if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }, 30_000);

describe('Phase 49 Electron goal composer', () => {
  it('persists one canonical goal and presents it in Office and Control across restart', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase49-electron-')); dataRoot = join(temporaryRoot, 'session'); projectRoot = join(temporaryRoot, 'website');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    await mkdir(join(projectRoot, 'src'), { recursive: true }); await writeFile(join(projectRoot, 'src', 'index.html'), '<main>Storefront</main>\n'); await writeFile(join(projectRoot, 'package.json'), '{"scripts":{"lint":"node -e \\"process.exit(0)\\"","typecheck":"node -e \\"process.exit(0)\\"","test":"node -e \\"process.exit(0)\\"","build":"node -e \\"process.exit(0)\\""}}\n');
    git(['init', '-b', 'main']); git(['config', 'user.email', 'h2a@example.invalid']); git(['config', 'user.name', 'H2A Phase 49']); git(['add', '.']); git(['commit', '-m', 'base']);
    let page = await launch(); const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('button', { name: 'Control', exact: true }).click(); await page.getByRole('button', { name: 'Command Floor', exact: true }).click();
    await expect.poll(async () => page.getByRole('region', { name: 'Multi-agent project delivery' }).count()).toBe(1);
    await page.evaluate(async ({ rootPath }) => window.h2a?.registerProject({ display_name: 'Phase 49 storefront', root_path: rootPath, protected_paths: ['.git/**', '.env'], network_hosts: [], allowed_commands: [{ command_id: 'test', executable: 'pnpm', args: ['test'] }] }), { rootPath: projectRoot });
    await page.reload(); await page.waitForSelector('#main-content', { timeout: 30_000 }); await page.waitForFunction(() => document.querySelector('#main-content')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 30_000 });
    const graph = page.getByRole('region', { name: 'Collaborative work graph' }); await expect.poll(async () => graph.getByLabel('Project').locator('option').count(), { timeout: 30_000 }).toBe(2);
    await graph.getByLabel('Goal').fill('Build a small clothing website');
    const registeredProjectId = await page.evaluate(async () => (await window.h2a!.getProjectDeliveryState()).projects[0]!.project_id);
    await page.evaluate(async ({ projectId }) => window.h2a!.composeCollaborativeGoal({ organization_id: 'org_phase49_test', project_id: projectId, title: 'Build a small clothing website', objective: 'Research, design, implement, and validate a small clothing website.', outcome: 'A validated website change.', constraints: ['No protected values in outputs'], deadline: null, sensitivity: 'internal', expected_outputs: ['Research brief', 'UI proposal', 'Repository change', 'Validation receipts'], created_by_human_id: 'human_phase49_test', trace_id: 'tr_phase49_electron' }), { projectId: registeredProjectId });
    await page.reload(); await page.waitForSelector('#main-content', { timeout: 30_000 }); await page.waitForFunction(() => document.querySelector('#main-content')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 30_000 });
    await expect.poll(async () => graph.innerText()).toContain('Build a small clothing website'); expect(await graph.getByRole('button', { name: /2\. Propose graph/u }).isVisible()).toBe(true);
    const stored = JSON.parse(await readFile(join(dataRoot, 'projects', 'goal-work-graphs-v1.json'), 'utf8')) as { data: { goals: Array<{ title: string }> } }; expect(stored.data.goals[0]?.title).toBe('Build a small clothing website');
    await page.getByRole('button', { name: 'Office', exact: true }).click(); await page.getByRole('button', { name: /Tasks Composer and work graph/u }).click(); await expect.poll(async () => page.getByRole('region', { name: 'Collaborative work graph' }).innerText()).toContain('Build a small clothing website');
    await application?.close(); application = undefined; page = await launch(); await page.getByRole('button', { name: 'Control', exact: true }).click(); await page.getByRole('button', { name: 'Command Floor', exact: true }).click(); await expect.poll(async () => page.getByRole('region', { name: 'Collaborative work graph' }).innerText()).toContain('Build a small clothing website');
    const evidence = join(root, 'docs', 'plan5', 'evidence', 'phase49'); await mkdir(evidence, { recursive: true });
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) { await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1); await page.screenshot({ path: join(evidence, `${viewport.width}x${viewport.height}-goal-composer.png`), fullPage: true }); }
    expect(errors).toEqual([]);
  }, 180_000);
});

async function launch(): Promise<Page> { application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 }); const page = await application.firstWindow(); await page.waitForSelector('#main-content', { timeout: 30_000 }); await page.waitForFunction(() => document.querySelector('#main-content')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 30_000 }); return page; }
function git(args: string[]): void { execFileSync('git', args, { cwd: projectRoot, stdio: 'pipe' }); }
