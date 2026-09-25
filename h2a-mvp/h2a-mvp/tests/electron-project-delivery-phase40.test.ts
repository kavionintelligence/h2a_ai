import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

const root = process.cwd(); let temporaryRoot = ''; let dataRoot = ''; let projectRoot = ''; let application: ElectronApplication | undefined;
afterAll(async () => { await application?.close(); if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }, 30_000);

describe('Phase 40 Electron governed project delivery', () => {
  it('registers a real Git project through Control, reflects it in Office, and restores it after restart', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase40-electron-')); dataRoot = join(temporaryRoot, 'session'); projectRoot = join(temporaryRoot, 'website');
    execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
    await mkdir(join(projectRoot, 'src'), { recursive: true }); await writeFile(join(projectRoot, 'src', 'index.html'), '<main>Website</main>\n'); await writeFile(join(projectRoot, 'package.json'), '{"scripts":{"lint":"node -e \\"process.exit(0)\\"","typecheck":"node -e \\"process.exit(0)\\"","test":"node -e \\"process.exit(0)\\"","build":"node -e \\"process.exit(0)\\""}}\n');
    git(['init', '-b', 'main']); git(['config', 'user.email', 'h2a@example.invalid']); git(['config', 'user.name', 'H2A Electron']); git(['add', '.']); git(['commit', '-m', 'base']);
    let page = await launch(); const pageErrors: string[] = []; page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.getByRole('button', { name: 'Control', exact: true }).click(); await page.getByRole('button', { name: 'Command Floor', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Multi-agent project delivery' }); await expect.poll(async () => panel.count()).toBe(1);
    await panel.getByLabel('Project name').fill('Phase 40 website'); await panel.getByLabel('Canonical local Git root').fill(projectRoot); await panel.getByRole('button', { name: 'Register project' }).click();
    await expect.poll(async () => panel.innerText(), { timeout: 30_000 }).toContain('git'); await expect.poll(async () => panel.innerText(), { timeout: 30_000 }).toContain('main');
    await panel.getByRole('button', { name: 'Sign root goal' }).click(); await expect.poll(async () => panel.innerText()).toContain('sha256:');
    await expect.poll(async () => page.evaluate(async () => { const api = window.h2a; if (!api) return 0; const attached = await api.attachControlPlane({ client_id: 'phase40-canonical-probe', protocol_version: 1, requested_capabilities: ['workspace.observe'] }); const lease = { host_instance_id: attached.host_instance_id, lease_id: attached.lease_id, client_id: attached.client_id, generation: attached.connection.generation }; const snapshot = await api.getControlPlaneSnapshot(lease); await api.detachControlPlane(lease); return snapshot.canonical.project_delivery.goals.length; }), { timeout: 10_000 }).toBe(1);
    const persisted = JSON.parse(await readFile(join(dataRoot, 'projects', 'project-delivery.json'), 'utf8')) as { data: { projects: unknown[]; goals: unknown[] } }; expect(persisted.data.projects).toHaveLength(1); expect(persisted.data.goals).toHaveLength(1);
    await page.getByRole('button', { name: 'Office', exact: true }).click(); await expect.poll(async () => page.getByRole('region', { name: 'Governed project delivery' }).count()).toBe(1); expect(await page.getByRole('region', { name: 'Governed project delivery' }).innerText()).toContain('0 active assignments');
    await application?.close(); application = undefined; page = await launch(); await page.getByRole('button', { name: 'Control', exact: true }).click(); await page.getByRole('button', { name: 'Command Floor', exact: true }).click(); await expect.poll(async () => page.getByText('Phase 40 website', { exact: true }).count()).toBe(1);
    const evidenceDirectory = join(root, 'docs', 'plan4', 'evidence', 'phase40'); await mkdir(evidenceDirectory, { recursive: true });
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) { await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1); await page.screenshot({ path: join(evidenceDirectory, `${viewport.width}x${viewport.height}-project-delivery.png`), fullPage: true }); }
    expect(pageErrors).toEqual([]);
  }, 240_000);
});

async function launch(): Promise<Page> { application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 }); const page = await application.firstWindow(); await page.waitForSelector('#main-content', { timeout: 30_000 }); await page.waitForFunction(() => document.querySelector('#main-content')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 30_000 }); return page; }
function git(args: string[]): void { execFileSync('git', args, { cwd: projectRoot, stdio: 'pipe' }); }
