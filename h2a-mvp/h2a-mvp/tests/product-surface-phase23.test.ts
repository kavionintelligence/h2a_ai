import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const root = process.cwd();
const classification = z.enum(['command', 'local-ui', 'read-only', 'scripted-rehearsal', 'live-connected', 'unavailable-prerequisite']);
const registrySchema = z.object({
  schema_version: z.literal(2), phase: z.number().int().min(43), routes: z.array(z.string()).length(10), classifications: z.array(classification),
  controls: z.array(z.object({ control_id: z.string().min(3), route: z.string(), classification, source: z.string(), status: z.string(), api_method: z.string().optional(), ipc_channel: z.string().optional(), result: z.string().min(3) })),
  source_coverage: z.array(z.object({ source: z.string(), button_declarations: z.number().int().nonnegative(), default_classification: classification, families: z.array(z.string()).min(1) })),
  api_classifications: z.array(z.object({ api_method: z.string(), classification, operator_path: z.string() }))
}).strict();

async function registry() {
  return registrySchema.parse(JSON.parse(await readFile(join(root, 'docs/plan3/CONTROL_REGISTRY.json'), 'utf8')));
}

describe('Phase 23 product surface truth contract', () => {
  it('builds the Phase 27 connector as executable JavaScript instead of launching TypeScript source', async () => {
    const [config, coordinator] = await Promise.all([
      readFile(join(root, 'electron.vite.config.ts'), 'utf8'),
      readFile(join(root, 'packages/agents/src/leastContextCoordinator.ts'), 'utf8')
    ]);
    expect(config).toContain("phase27ContextAgent: resolve(root, 'packages/sdk-typescript/src/phase27ContextAgent.ts')");
    expect(coordinator).toContain("resolve(this.projectRoot, 'out/main/phase27ContextAgent.js')");
    expect(coordinator).not.toContain("'--experimental-strip-types'");
  });

  it('covers every route and every renderer source containing a button declaration', async () => {
    const value = await registry();
    const shell = await readFile(join(root, 'apps/desktop/renderer/src/components/AppShell.tsx'), 'utf8');
    const routeIds = [...shell.matchAll(/id: '([^']+)'/gu)].map((match) => match[1]);
    expect(routeIds).toEqual(value.routes);

    const renderer = join(root, 'apps/desktop/renderer/src');
    const files = await recursiveFiles(renderer);
    const actual = new Map<string, number>();
    for (const file of files.filter((item) => item.endsWith('.tsx'))) {
      const relative = file.slice(renderer.length + 1).replaceAll('\\', '/');
      const source = await readFile(file, 'utf8');
      const count = source.match(/<button\b/gu)?.length ?? 0;
      if (count) actual.set(relative, count);
    }
    expect(Object.fromEntries(actual)).toEqual(Object.fromEntries(value.source_coverage.map((item) => [item.source, item.button_declarations])));
    expect([...actual.values()].reduce((sum, count) => sum + count, 0)).toBe(value.source_coverage.reduce((sum, item) => sum + item.button_declarations, 0));
  });

  it('binds every currently connected product command to a stable control id', async () => {
    const value = await registry();
    const exempt = new Set(['workspace.retry']);
    const commands = value.controls.filter((item) => ['command', 'live-connected', 'scripted-rehearsal'].includes(item.classification) && ['connected', 'connected-observed'].includes(item.status) && !exempt.has(item.control_id));
    expect(new Set(value.controls.map((item) => item.control_id)).size).toBe(value.controls.length);
    for (const command of commands) {
      const source = await readFile(join(root, 'apps/desktop/renderer/src', command.source), 'utf8');
      expect(source, command.control_id).toContain(`data-control-id="${command.control_id}"`);
      expect(command.api_method, command.control_id).toBeTruthy();
      expect(command.ipc_channel, command.control_id).toBeTruthy();
    }
  });

  it('keeps registry API names and channels aligned with preload and main', async () => {
    const value = await registry();
    const [preload, main] = await Promise.all([
      readFile(join(root, 'apps/desktop/preload/index.ts'), 'utf8'),
      readFile(join(root, 'apps/desktop/main/index.ts'), 'utf8')
    ]);
    for (const control of value.controls.filter((item) => item.api_method && item.ipc_channel && !item.ipc_channel.includes('multiple'))) {
      for (const method of control.api_method!.split(' or ')) expect(preload, `${control.control_id}:${method}`).toContain(`${method}:`);
      for (const channel of control.ipc_channel!.split(' or ')) expect(main, `${control.control_id}:${channel}`).toContain(`ipcMain.handle('${channel}'`);
    }
    for (const item of value.api_classifications) expect(preload, item.api_method).toContain(`${item.api_method}:`);
  });

  it('uses the native desktop clipboard bridge for federation trust documents', async () => {
    const [view, preload, main] = await Promise.all([
      readFile(join(root, 'apps/desktop/renderer/src/features/federation/FederationView.tsx'), 'utf8'),
      readFile(join(root, 'apps/desktop/preload/index.ts'), 'utf8'),
      readFile(join(root, 'apps/desktop/main/index.ts'), 'utf8')
    ]);
    expect(view).toContain('window.h2a!.writeClipboardText');
    expect(view).not.toContain('navigator.clipboard');
    expect(preload).toContain("writeClipboardText: (value: string) => ipcRenderer.invoke('system:write-clipboard', value)");
    expect(main).toContain("ipcMain.handle('system:write-clipboard'");
    expect(main).toContain('clipboard.writeText(value)');
  });

  it('isolates visual fixtures and legacy test adapters from production composition', async () => {
    const [app, biometrics, agents, scenario] = await Promise.all([
      readFile(join(root, 'apps/desktop/renderer/src/App.tsx'), 'utf8'),
      readFile(join(root, 'packages/biometrics/src/index.ts'), 'utf8'),
      readFile(join(root, 'packages/agents/src/index.ts'), 'utf8'),
      readFile(join(root, 'packages/agents/src/scenarioService.ts'), 'utf8')
    ]);
    expect(app).toContain("await import('./dev/previewFixtures')");
    expect(app).not.toMatch(/proof_preview|trace_supplier_review|PREVIEWPUBLICKEY/iu);
    expect(biometrics).not.toContain('MockHumanProofProvider');
    expect(agents).not.toContain("export * from './runtimeAdapters'");
    expect(scenario).toContain("from './runtimeAdapters'");
    expect(app).not.toContain('Scripted workplace');
  });
});

async function recursiveFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const values = await Promise.all(entries.map((entry) => entry.isDirectory() ? recursiveFiles(join(directory, entry.name)) : [join(directory, entry.name)]));
  return values.flat();
}
