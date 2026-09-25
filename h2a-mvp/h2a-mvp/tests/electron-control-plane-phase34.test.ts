import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import type { H2ADesktopApi } from '@h2a/contracts';

declare global {
  interface Window {
    h2a: H2ADesktopApi;
  }
}

const root = process.cwd();
let temporaryRoot = '';
let application: ElectronApplication | undefined;

afterAll(async () => {
  await closeApplication();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('Phase 34 Electron control-plane transport', () => {
  it('shares canonical state over public IPC and isolates persisted preferences by data root', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'h2a-phase34-electron-'));
    const rootA = join(temporaryRoot, 'root-a');
    const rootB = join(temporaryRoot, 'root-b');
    createSession(rootA);
    createSession(rootB);

    let page = await launch(rootA);
    await page.setViewportSize({ width: 1440, height: 900 });
    const evidenceDirectory = join(root, 'docs/plan4/evidence/phase34');
    await mkdir(evidenceDirectory, { recursive: true });
    await page.screenshot({ path: join(evidenceDirectory, 'control-plane-connected.png'), fullPage: true });
    const first = await attachAndInspect(page, 'phase34_renderer_a');
    expect(first.snapshot.canonical.collaboration.workplace.agents).toEqual(first.legacyCollaboration.workplace.agents);
    expect(first.snapshot.canonical.collaboration.workplace.assignments).toEqual(first.legacyCollaboration.workplace.assignments);
    expect(first.snapshot.canonical.collaboration.workplace.events).toEqual(first.legacyCollaboration.workplace.events);
    expect(first.snapshot.canonical.collaboration.messages).toEqual(first.legacyCollaboration.messages);
    expect(first.snapshot.canonical.collaboration.responses).toEqual(first.legacyCollaboration.responses);
    expect(first.snapshot.office.counts.agents).toBe(first.legacyCollaboration.workplace.agents.length);
    expect(first.snapshot.connection).toMatchObject({ status: 'connected', read_only: false });
    expect(first.snapshot.appearance.presentation_mode).toBe('office');

    const localDataEvent = page.evaluate((lease) => new Promise<{ kind: string; sequence: number; agentMode: string }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Persisted local-data change was not published.')), 5_000);
      const unsubscribe = window.h2a.subscribeControlPlaneEvents(async (value) => {
        if (!value.changed_domains.includes('local-data-change')) return;
        const snapshot = await window.h2a.getControlPlaneSnapshot(lease);
        if (snapshot.canonical.system.agentMode !== 'live-cli') return;
        clearTimeout(timeout);
        unsubscribe();
        resolve({ kind: value.kind, sequence: value.sequence, agentMode: snapshot.canonical.system.agentMode });
      });
    }), first.lease);
    const configPath = join(rootA, 'settings/feature-config.json');
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { updatedAt: string; data: { agentMode: string } };
    config.updatedAt = new Date().toISOString();
    config.data.agentMode = 'live-cli';
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    const published = await localDataEvent;
    expect(published.kind).toBe('snapshot-changed');
    expect(published.sequence).toBeGreaterThan(first.snapshot.cursor);
    expect(published.agentMode).toBe('live-cli');

    const changed = await page.evaluate(async ({ lease }) => {
      const event = new Promise<{ kind: string; sequence: number }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Control-plane event was not delivered.')), 5_000);
        const unsubscribe = window.h2a.subscribeControlPlaneEvents((value) => {
          if (value.kind !== 'appearance-changed') return;
          clearTimeout(timeout);
          unsubscribe();
          resolve({ kind: value.kind, sequence: value.sequence });
        });
      });
      const snapshot = await window.h2a.executeOfficeCommand({ ...lease, command: { type: 'appearance.set', presentation_mode: 'office', reduced_motion: true } });
      return { snapshot, event: await event };
    }, { lease: first.lease });
    expect(changed.snapshot.appearance).toMatchObject({ presentation_mode: 'office', reduced_motion: true });
    expect(changed.event.kind).toBe('appearance-changed');
    expect(changed.event.sequence).toBe(changed.snapshot.cursor);
    expect(changed.event.sequence).toBeGreaterThan(first.snapshot.cursor);

    const staleDenial = await page.evaluate(async ({ lease }) => {
      try {
        await window.h2a.executeOfficeCommand({ ...lease, generation: 'generation_stale', command: { type: 'workspace.refresh' } });
        return 'unexpected-success';
      } catch (error) {
        return String(error);
      }
    }, { lease: first.lease });
    expect(staleDenial).toContain('CONTROL_PLANE_CONNECTION_STALE');

    await closeApplication();
    page = await launch(rootA);
    const restarted = await attachAndInspect(page, 'phase34_renderer_a_restart');
    expect(restarted.snapshot.host_instance_id).not.toBe(first.snapshot.host_instance_id);
    expect(restarted.snapshot.appearance).toMatchObject({ presentation_mode: 'office', reduced_motion: true });

    await page.evaluate((lease) => window.h2a.detachControlPlane(lease), restarted.lease);
    const disconnectedDenial = await page.evaluate(async (lease) => {
      try {
        await window.h2a.executeOfficeCommand({ ...lease, command: { type: 'workspace.refresh' } });
        return 'unexpected-success';
      } catch (error) {
        return String(error);
      }
    }, restarted.lease);
    expect(disconnectedDenial).toContain('CONTROL_PLANE_DISCONNECTED_READ_ONLY');

    await closeApplication();
    page = await launch(rootB);
    const isolated = await attachAndInspect(page, 'phase34_renderer_b');
    expect(isolated.snapshot.appearance).toMatchObject({ presentation_mode: 'office', reduced_motion: false });
  }, 120_000);
});

async function attachAndInspect(page: Page, clientId: string): Promise<{
  lease: { host_instance_id: string; lease_id: string; client_id: string; generation: string };
  snapshot: Awaited<ReturnType<Window['h2a']['getControlPlaneSnapshot']>>;
  legacyCollaboration: Awaited<ReturnType<Window['h2a']['getCollaborationState']>>;
}> {
  return page.evaluate(async (client_id) => {
    const attachment = await window.h2a.attachControlPlane({
      client_id,
      protocol_version: 1,
      requested_capabilities: ['workspace.observe', 'workspace.refresh', 'appearance.read', 'appearance.write']
    });
    const lease = {
      host_instance_id: attachment.host_instance_id,
      lease_id: attachment.lease_id,
      client_id: attachment.client_id,
      generation: attachment.connection.generation
    };
    const [snapshot, legacyCollaboration] = await Promise.all([
      window.h2a.getControlPlaneSnapshot(lease),
      window.h2a.getCollaborationState()
    ]);
    return { lease, snapshot, legacyCollaboration };
  }, clientId);
}

function createSession(dataRoot: string): void {
  execFileSync(process.execPath, [join(root, 'scripts/new-demo-session.mjs'), '--root', dataRoot], { cwd: root, stdio: 'pipe' });
}

async function launch(dataRoot: string): Promise<Page> {
  application = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, H2A_DATA_PATH: dataRoot, NODE_ENV: 'production' }, timeout: 30_000 });
  const page = await application.firstWindow();
  await page.waitForSelector('#main-content', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('#main-content')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 30_000 });
  return page;
}

async function closeApplication(): Promise<void> {
  const current = application;
  application = undefined;
  await current?.close();
}
