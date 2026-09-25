import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FinalAcceptanceService, LocalAuthorityEventLedger, type FinalAcceptancePorts } from '@h2a/evidence';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('Phase 22 final acceptance gate', () => {
  it('stays blocked until persisted ceremony evidence satisfies every gate', async () => {
    const { service } = await fixture();
    const state = await service.initialize();
    expect(state.status).toBe('blocked');
    expect(state.completion).toEqual({ passed: 0, total: 11 });
    expect(state.gates.find((gate) => gate.gate_id === 'two-human-ceremony')?.status).toBe('user-action-required');
    expect(state.gates.find((gate) => gate.gate_id === 'shared-provider-task')?.status).toBe('user-action-required');
    expect(state.blockers.length).toBeGreaterThanOrEqual(11);
    expect(state.phase44_readiness.package_eligible).toBe(false);
  });

  it('recognizes only persisted Phase 22 attack evidence and blocks an incomplete package', async () => {
    const { ledger, service } = await fixture();
    const trace_id = 'phase22_red_team';
    const events = [
      ['FEDERATION_ENVELOPE_REJECTED', 'FEDERATION_NONCE_REPLAY'],
      ['APPROVAL_REJECTED_V2', 'APPROVAL_SIGNATURE_INVALID'],
      ['DELEGATION_DENIED', 'CHILD_EXPANDS_PARENT_AUTHORITY'],
      ['CONTEXT_DISCLOSURE_DENIED', 'CONTEXT_SCOPE_DENIED'],
      ['FEDERATION_ENVELOPE_REJECTED', 'PAYLOAD_HASH_INVALID'],
      ['LIVE_RUNTIME_FAILED', 'PROVIDER_FAILURE']
    ] as const;
    for (const [event_type, reason_code] of events) {
      await ledger.append({ trace_id, actor: { type: 'system', id: 'phase22-red-team' }, subject: { type: 'outcome', id: reason_code }, event_type, payload: { reason_code } });
    }
    const state = await service.getState();
    expect(state.attacks.every((attack) => attack.status === 'blocked')).toBe(true);
    expect(state.gates.find((gate) => gate.gate_id === 'adversarial-controls')?.status).toBe('passed');

    await expect(service.exportPackage()).rejects.toThrow('FINAL_ACCEPTANCE_PACKAGE_NOT_ELIGIBLE');
    expect((await ledger.list()).some((event) => event.event_type === 'FINAL_ACCEPTANCE_PACKAGE_EXPORTED')).toBe(false);
  });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase22-')); roots.push(root);
  const ledger = new LocalAuthorityEventLedger(root);
  const empty = {
    humans: { identities: [], enrollments: [], active_proofs: [], selected_human_id: null, last_result: null },
    organization: { organizations: [], memberships: [], roles: [], credentials: [], assurance: [], decisions: [] },
    agents: { passports: [], passportsV2: [], bindings: [], providers: [], credentials: [], humanProofRequired: true, attestations: [], runtimeSessions: [] },
    approvals: { policies: [], requests: [], request_contexts: [], decisions: [], mandate_extensions: [], resumes: [] },
    context: { artifacts: [], grants: [], disclosures: [], messages: [] },
    connectors: { declarations: [], protocol: { connectors: [], deliveries: [], dead_letter_count: 0 }, collaboration_runs: [] },
    live: { providers: [], runs: [], output: [] },
    enterprise: { schema_version: 2, generated_at: new Date().toISOString(), posture: {}, nodes: [], edges: [], traces: [], seams: [], claims: [] }
  };
  const ports = Object.fromEntries(Object.entries(empty).map(([key, value]) => [key, { getState: async () => value }])) as unknown as FinalAcceptancePorts;
  return { root, ledger, service: new FinalAcceptanceService(root, ledger, ports, () => new Date('2026-08-21T18:00:00.000Z')) };
}
