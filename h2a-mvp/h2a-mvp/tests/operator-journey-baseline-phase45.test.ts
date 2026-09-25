import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Phase 45 operator journey baseline', () => {
  it('inventories every registered Office and Control command exactly once', async () => {
    const registry = JSON.parse(await readFile(join(root, 'docs/plan3/CONTROL_REGISTRY.json'), 'utf8')) as { controls: Array<{ control_id: string; classification: string }> };
    const baseline = await readBaseline();
    const registered = registry.controls.map((control) => control.control_id).sort();
    const inventoried = baseline.control_inventory.map((control) => control.control_id).sort();
    expect(inventoried).toEqual(registered);
    expect(new Set(inventoried).size).toBe(inventoried.length);
    expect(baseline.control_inventory.every((control) => control.domain.length > 0)).toBe(true);
    const protectedControls = registry.controls.filter((control) => ['command', 'live-connected'].includes(control.classification));
    expect(protectedControls.every((control) => inventoried.includes(control.control_id))).toBe(true);
  });

  it('derives every baseline count from its ordered control sequence', async () => {
    const baseline = await readBaseline();
    for (const journey of baseline.journeys) {
      expect(journey.current_sequence.map((event) => event.sequence)).toEqual(journey.current_sequence.map((_, index) => index + 1));
      expect(journey.baseline.operator_commands).toBe(count(journey, 'command'));
      expect(journey.baseline.route_changes).toBe(count(journey, 'route-change'));
      expect(journey.baseline.proof_attempts).toBe(count(journey, 'proof-attempt'));
      expect(journey.baseline.manual_refreshes).toBe(count(journey, 'manual-refresh'));
      expect(journey.baseline.copied_payloads).toBe(count(journey, 'copied-payload'));
      expect(journey.baseline.recoveries).toBe(count(journey, 'repair'));
    }
    expect(baseline.journeys.find((journey) => journey.journey_id === 'connect-friend-node')?.baseline.copied_payloads).toBe(3);
  });

  it('freezes click budgets, privacy exclusions, discovery non-claims, and local-only telemetry', async () => {
    const baseline = await readBaseline();
    expect(baseline.click_budgets.connect_discovered_coworker.operator_commands).toBe(3);
    expect(baseline.click_budgets.create_and_start_governed_task.operator_commands).toBe(4);
    expect(baseline.click_budgets.repair_expired_prerequisites.operator_commands).toBe(1);
    expect(baseline.click_budgets.resume_interrupted_demonstration.operator_commands).toBe(1);
    expect(baseline.click_budgets.open_technical_evidence.operator_commands).toBe(1);
    expect(baseline.privacy).toMatchObject({ telemetry_fields: ['control_id', 'action_kind', 'occurred_at'], transport: 'none', storage: 'local-minimized' });
    expect(baseline.privacy.excluded).toEqual(expect.arrayContaining(['biometric data', 'credentials', 'private keys', 'clipboard payloads']));
    expect(baseline.non_claims.join(' ')).toContain('No global username');
    expect(baseline.non_claims.join(' ')).toContain('Trust remains connected-observed');
  });
});

interface Baseline {
  control_inventory: Array<{ control_id: string; domain: string }>;
  journeys: Array<{ journey_id: string; current_sequence: Array<{ sequence: number; control_id: string; action_kind: string }>; baseline: Record<string, number> }>;
  click_budgets: Record<string, { operator_commands: number }>;
  privacy: { telemetry_fields: string[]; excluded: string[]; transport: string; storage: string };
  non_claims: string[];
}

async function readBaseline(): Promise<Baseline> {
  return JSON.parse(await readFile(join(root, 'docs/plan5/evidence/phase45/operator-journey-baseline.json'), 'utf8')) as Baseline;
}

function count(journey: Baseline['journeys'][number], actionKind: string): number {
  return journey.current_sequence.filter((event) => event.action_kind === actionKind).length;
}

