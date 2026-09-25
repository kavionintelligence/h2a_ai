import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Phase 51 conductor UI contract', () => {
  it('exposes the same conductor through the Office security map and Control acceptance view', async () => {
    const [workspace, acceptance, main, preload] = await Promise.all([
      readFile(join(root, 'apps/desktop/renderer/src/features/workspace/WorkspaceExperience.tsx'), 'utf8'),
      readFile(join(root, 'apps/desktop/renderer/src/features/acceptance/FinalAcceptanceView.tsx'), 'utf8'),
      readFile(join(root, 'apps/desktop/main/index.ts'), 'utf8'),
      readFile(join(root, 'apps/desktop/preload/index.ts'), 'utf8')
    ]);
    expect(workspace).toContain('data.demonstration_conductor');
    expect(workspace).toContain('Start HP demonstration');
    expect(acceptance).toContain('data-control-id="conductor.advance"');
    expect(acceptance).toContain("'verify-package-tamper': 'Run the independent verifier");
    expect(acceptance).toContain("'two-human-liveness': 'The named person must complete the live camera challenge.");
    expect(main).toContain("ipcMain.handle('demonstration-conductor:execute'");
    expect(preload).toContain("ipcRenderer.invoke('demonstration-conductor:execute'");
  });

  it('does not offer a skip path or imply synthetic success', async () => {
    const source = await readFile(join(root, 'apps/desktop/renderer/src/features/acceptance/FinalAcceptanceView.tsx'), 'utf8');
    expect(source).not.toContain('Skip step');
    expect(source).not.toContain('Mark passed');
    expect(source).not.toContain('demo success');
  });
});
