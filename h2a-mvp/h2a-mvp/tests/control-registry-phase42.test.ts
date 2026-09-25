import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const renderer = join(root, 'apps/desktop/renderer/src');

describe('Phase 42 product quality control registry', () => {
  it('assigns every Office, presentation, and in-place proof button a classified stable control id', async () => {
    const registry = JSON.parse(await readFile(join(root, 'docs/plan3/CONTROL_REGISTRY.json'), 'utf8')) as { controls: Array<{ control_id: string }>; source_coverage: Array<{ source: string; button_declarations: number }> };
    const registered = new Set(registry.controls.map((control) => control.control_id));
    const sources = ['components/OfficeShell.tsx', 'components/OfficeWorkspaceDrawer.tsx', 'components/PresentationModeSwitch.tsx', 'office/PixelOfficeScene.tsx', 'features/human-proof/HumanProofView.tsx'];
    for (const sourcePath of sources) {
      const source = await readFile(join(renderer, sourcePath), 'utf8');
      const buttonCount = source.match(/<button\b/gu)?.length ?? 0;
      const ids = [...source.matchAll(/<button\b[^>]*data-control-id="([^"]+)"/gu)].map((match) => match[1]!);
      expect(ids, sourcePath).toHaveLength(buttonCount);
      for (const id of ids) expect(registered, `${sourcePath}:${id}`).toContain(id);
      expect(registry.source_coverage.find((item) => item.source === sourcePath)?.button_declarations).toBe(buttonCount);
    }
  });

  it('classifies every explicit Human Proof handoff and keeps cancellation in the same modal', async () => {
    const registry = JSON.parse(await readFile(join(root, 'docs/plan3/CONTROL_REGISTRY.json'), 'utf8')) as { controls: Array<{ control_id: string }> };
    const registered = new Set(registry.controls.map((control) => control.control_id));
    for (const controlId of ['agent.proof.request', 'organization.proof.request', 'mandates.proof.request', 'federation.proof.request', 'approval.withdraw.verify', 'approval.decision.verify', 'phase28.requester.verify', 'human-proof.challenge.cancel']) {
      expect(registered).toContain(controlId);
    }
    const [dialog, humanProof] = await Promise.all([
      readFile(join(renderer, 'components/HumanProofChallengeDialog.tsx'), 'utf8'),
      readFile(join(renderer, 'features/human-proof/HumanProofView.tsx'), 'utf8')
    ]);
    expect(dialog).toContain('aria-describedby="proof-challenge-purpose"');
    expect(dialog).toContain('useRef<HTMLDialogElement>');
    expect(dialog).toContain('dialog.showModal()');
    expect(dialog).toContain('onCancel={(event) => { event.preventDefault(); onCancel(); }}');
    expect(dialog).toContain("event.key === 'Escape'");
    expect(humanProof).toContain('data-control-id="human-proof.challenge.cancel"');
    expect(humanProof).toContain('Estimated distance');
    expect(humanProof).toContain('Required range');
  });

  it('keeps performance diagnostics ephemeral and telemetry-free', async () => {
    const source = await readFile(join(renderer, 'components/LocalPerformanceDiagnostics.tsx'), 'utf8');
    expect(source).toContain('data-diagnostics-telemetry="disabled"');
    expect(source).toContain("document.querySelectorAll('*').length");
    expect(source).not.toMatch(/fetch\(|sendBeacon|WebSocket|ipcRenderer|window\.h2a|localStorage|sessionStorage/gu);
  });
});
