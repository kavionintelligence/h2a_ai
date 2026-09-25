import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { employeeWorkspaceFixture } from './helpers/employeeWorkspaceFixture';
import type { EmployeeWorkspaceApi } from '../packages/contracts/src/employeeWorkspace';

let application: ElectronApplication | undefined;
let temporaryRoot = '';
afterAll(async () => { await application?.close(); if (temporaryRoot && resolve(temporaryRoot).startsWith(resolve(tmpdir()) + sep)) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }, 30000);

it('enforces production Electron employee boundaries and logs out on restart (test vectors, not operator acceptance)', async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-electron-employee-'));
  const dataRoot = join(temporaryRoot, 'session');
  execFileSync(process.execPath, [join(process.cwd(), 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: process.cwd(), stdio: 'pipe' });
  const fixture = await employeeWorkspaceFixture(dataRoot, { realBch: true, initialDate: new Date(Date.now() - 60000) });
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' } });
  let page = await application.firstWindow();
  await page.getByRole('heading', { name: 'Sign in as yourself' }).waitFor({ timeout: 60000 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const denied = await page.evaluate(async () => { try { await window.h2a!.getOrganizationAuthorityState(); return false; } catch (error) { return String(error).includes('EMPLOYEE_SESSION_REQUIRED'); } });
  expect(denied).toBe(true);
  async function login(person: number) {
    const challenge = await page.evaluate(async person => (window as unknown as { h2aEmployee: EmployeeWorkspaceApi }).h2aEmployee.begin(`TEST-${person}`), person);
    const input = fixture.verification(person, challenge.purpose);
    return page.evaluate(async input => { const api = (window as unknown as { h2aEmployee: EmployeeWorkspaceApi }).h2aEmployee; const result = await api.verify(input); if (result.last_result?.decision !== 'verified') throw new Error(JSON.stringify(result.last_result)); return api.login(result.active_proofs[0].human_proof_id); }, input);
  }
  const staff = await login(3);
  expect(staff.session.administrator).toBe(false);
  // Direct IPC test login deliberately skips the UI's immediate completion callback.
  await page.getByText('Test Employee 3 · Finance', { exact: true }).waitFor({ timeout: 15000 });
  expect(await page.getByRole('button', { name: 'Administrator console', exact: true }).count()).toBe(0);
  expect(await page.evaluate(async () => { try { await window.h2a!.getOrganizationAuthorityState(); return false; } catch (error) { return String(error).includes('ADMINISTRATOR_CONSOLE_REQUIRED'); } })).toBe(true);
  await page.getByLabel('New room', { exact: true }).fill('TEST ONLY - Finance room');
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await page.getByRole('heading', { name: 'TEST ONLY - Finance room', exact: true }).waitFor();
  const evidence = join(process.cwd(), 'docs/ux-v5/evidence'); await mkdir(evidence, { recursive: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: join(evidence, `employee-${viewport.width}-test-only.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('heading', { name: 'Sign in as yourself' }).waitFor();
  const admin = await login(1);
  expect(admin.rooms).toEqual([]);
  await page.getByRole('button', { name: 'Administrator console', exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Administrator console', exact: true }).click();
  await page.waitForSelector('#main-content[aria-busy="false"]', { timeout: 60000 });
  expect(await page.getByText('Test Employee 1 · Administrator console', { exact: true }).isVisible()).toBe(true);
  expect(errors).toEqual([]);
  await application.close(); application = undefined;
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' } });
  page = await application.firstWindow();
  await page.getByRole('heading', { name: 'Sign in as yourself' }).waitFor({ timeout: 60000 });
  expect((await login(3)).rooms[0].title).toBe('TEST ONLY - Finance room');
}, 240000);
