import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const renderer = join(root, 'apps/desktop/renderer/src');

describe('Phase 48 simplified federation surface', () => {
  it('connects every pairing command through typed preload and main-process handlers', async () => {
    const [contracts, preload, main] = await Promise.all([
      readFile(join(root, 'packages/contracts/src/index.ts'), 'utf8'),
      readFile(join(root, 'apps/desktop/preload/index.ts'), 'utf8'),
      readFile(join(root, 'apps/desktop/main/index.ts'), 'utf8')
    ]);
    const channels = ['get-state', 'create', 'accept', 'confirm', 'cancel'];
    for (const channel of channels) {
      expect(preload).toContain(`federation-pairing:${channel}`);
      expect(main).toContain(`ipcMain.handle('federation-pairing:${channel}'`);
    }
    for (const method of ['getFederationPairingState', 'createFederationPairing', 'acceptFederationPairing', 'confirmFederationPairing', 'cancelFederationPairing']) {
      expect(contracts).toContain(method);
      expect(preload).toContain(method);
    }
    expect(main).toContain('new FederationPairingCoordinator');
    expect(main).toContain('federationPairingCoordinator.initialize()');
    expect(main).toContain('federationPairingCoordinator.close()');
  });

  it('uses the same canonical friend-request component in Office and Control without clipboard or raw JSON', async () => {
    const [panel, office, federation, registryText] = await Promise.all([
      readFile(join(renderer, 'features/federation/CoworkerPairingPanel.tsx'), 'utf8'),
      readFile(join(renderer, 'components/OfficeShell.tsx'), 'utf8'),
      readFile(join(renderer, 'features/federation/FederationView.tsx'), 'utf8'),
      readFile(join(root, 'docs/plan3/CONTROL_REGISTRY.json'), 'utf8')
    ]);
    expect(office).toContain('<CoworkerPairingPanel compact');
    expect(federation).toContain('<CoworkerPairingPanel');
    expect(panel).toContain('Global lookup disabled');
    expect(panel).toContain('Public internet and global username discovery are intentionally disabled.');
    expect(panel).toContain('COMPARE ON BOTH SCREENS');
    expect(panel).not.toMatch(/writeClipboardText|navigator\.clipboard|<textarea|Signed invitation JSON|Signed registration JSON/gu);

    const registry = JSON.parse(registryText) as { controls: Array<{ control_id: string }>; source_coverage: Array<{ source: string; button_declarations: number }> };
    const registered = new Set(registry.controls.map((item) => item.control_id));
    const ids = [...panel.matchAll(/data-control-id="([^"]+)"/gu)].map((match) => match[1]!);
    for (const id of ids) expect(registered).toContain(id);
    expect(registry.source_coverage.find((item) => item.source === 'features/federation/CoworkerPairingPanel.tsx')?.button_declarations).toBe(panel.match(/<button\b/gu)?.length ?? 0);
  });

  it('keeps the normal connection journey inside a three-command budget before proof and code confirmation', async () => {
    const panel = await readFile(join(renderer, 'features/federation/CoworkerPairingPanel.tsx'), 'utf8');
    const normalCommands = ['federation.pairing.open', 'federation.pairing.request', 'federation.pairing.accept'];
    expect(normalCommands).toHaveLength(3);
    for (const command of normalCommands) expect(panel).toContain(`data-control-id="${command}"`);
    expect(panel).toContain('federation.pairing.confirm');
    expect(panel).toContain('onHumanProofRequired');
  });
});
