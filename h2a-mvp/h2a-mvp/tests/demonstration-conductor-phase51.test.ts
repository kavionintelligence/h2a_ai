import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { CeremonyState, FinalAcceptanceExportReceipt, FinalAcceptanceState } from '@h2a/contracts';
import { DemonstrationConductorService, LocalAuthorityEventLedger } from '@h2a/evidence';

const now = '2026-09-08T08:00:00.000Z';
const traceId = 'phase22_final_conductor';
const ceremonyId = 'ceremony_final';

describe('Phase 51 demonstration conductor', () => {
  it('persists one idempotent run, stops at human boundaries, and only completes from canonical receipts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2a-phase51-'));
    const ledger = new LocalAuthorityEventLedger(root, 'traces/tr_platform.jsonl', () => new Date(now));
    let acceptance = acceptanceState(false);
    let exportCalls = 0;
    let verifyCalls = 0;
    const service = new DemonstrationConductorService(root, ledger, {
      acceptance: {
        getState: async () => acceptance,
        exportPackage: async () => {
          exportCalls += 1;
          await ledger.append({ trace_id: traceId, actor: { type: 'system', id: 'acceptance' }, subject: { type: 'outcome', id: 'phase22_export' }, event_type: 'FINAL_ACCEPTANCE_PACKAGE_EXPORTED', payload: { package_hash: hash('e') } });
          return { export_id: 'phase22_export', relative_path: 'exports/final.json', created_at: now, package_hash: hash('e'), status: 'passed', passed_gates: 11, total_gates: 11, signer_fingerprint: hash('f'), verifier_status: 'verified' } satisfies FinalAcceptanceExportReceipt;
        },
        verifyExportedPackage: async ({ relative_path }) => {
          verifyCalls += 1;
          const verified = await ledger.append({ trace_id: traceId, actor: { type: 'system', id: 'verifier' }, subject: { type: 'outcome', id: 'phase22_export' }, event_type: 'FINAL_ACCEPTANCE_PACKAGE_VERIFIED', payload: { relative_path } });
          const tamper = await ledger.append({ trace_id: traceId, actor: { type: 'system', id: 'verifier' }, subject: { type: 'outcome', id: 'phase22_export' }, event_type: 'FINAL_ACCEPTANCE_PACKAGE_TAMPER_REJECTED', payload: { reason_code: 'PACKAGE_HASH_INVALID' } });
          return { relative_path, package_hash: hash('e'), status: 'verified', tamper_test: 'rejected', tamper_reason: 'PACKAGE_HASH_INVALID', verification_evidence_ref: verified.event_id, tamper_evidence_ref: tamper.event_id, verified_at: now };
        }
      },
      ceremony: ceremonyPort(),
      requireLiveness: async () => { acceptance = acceptanceState(true); }
    }, () => new Date(now));

    await service.initialize();
    const started = await service.execute({ action: 'start', conductor_id: null, expected_canonical_cursor: null, operation_key: 'start-once' });
    expect(started.status).toBe('paused');
    expect(started.active_step_id).toBe('two-human-liveness');
    expect(started.steps.find((step) => step.step_id === 'required-liveness-policy')?.status).toBe('passed');
    expect((await service.execute({ action: 'start', conductor_id: null, expected_canonical_cursor: null, operation_key: 'start-once' })).conductor_id).toBe(started.conductor_id);

    await appendFinalEvidence(ledger);
    acceptance = acceptedState();
    let current = (await service.getState())!;
    expect(current.steps.find((step) => step.step_id === 'federation-collaboration')?.status).toBe('passed');
    expect(current.active_step_id).toBe('export-package');
    current = await service.execute({ action: 'resume', conductor_id: current.conductor_id, expected_canonical_cursor: current.canonical_cursor, operation_key: 'export-once' });
    expect(exportCalls).toBe(1);
    expect(verifyCalls).toBe(1);
    expect(current.status).toBe('completed');
    expect(current.steps.every((step) => step.status === 'passed' && step.evidence_refs.length > 0)).toBe(true);
    expect((await service.execute({ action: 'resume', conductor_id: current.conductor_id, expected_canonical_cursor: current.canonical_cursor, operation_key: 'export-once' })).status).toBe('completed');
    expect(verifyCalls).toBe(1);

    const restarted = new DemonstrationConductorService(root, ledger, {
      acceptance: { getState: async () => acceptance, exportPackage: async () => { throw new Error('duplicate export'); }, verifyExportedPackage: async () => { throw new Error('duplicate verify'); } },
      ceremony: ceremonyPort(), requireLiveness: async () => undefined
    }, () => new Date(now));
    expect((await restarted.initialize())?.status).toBe('completed');
  });

  it('does not accept a gate marked passed without source evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2a-phase51-empty-'));
    const ledger = new LocalAuthorityEventLedger(root, 'traces/tr_platform.jsonl', () => new Date(now));
    const state = acceptedState();
    state.gates[1]!.evidence_refs = [];
    const service = new DemonstrationConductorService(root, ledger, {
      acceptance: { getState: async () => state, exportPackage: async () => { throw new Error('not eligible'); }, verifyExportedPackage: async () => { throw new Error('not eligible'); } },
      ceremony: ceremonyPort(), requireLiveness: async () => undefined
    }, () => new Date(now));
    await service.initialize();
    const conductor = await service.execute({ action: 'start', conductor_id: null, expected_canonical_cursor: null, operation_key: 'missing-evidence' });
    expect(conductor.active_step_id).toBe('organization-authority');
    expect(conductor.status).toBe('paused');
  });

  it('cancels once and preserves the terminal state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2a-phase51-cancel-'));
    const ledger = new LocalAuthorityEventLedger(root, 'traces/tr_platform.jsonl', () => new Date(now));
    const service = new DemonstrationConductorService(root, ledger, {
      acceptance: { getState: async () => acceptanceState(true), exportPackage: async () => { throw new Error('not ready'); }, verifyExportedPackage: async () => { throw new Error('not ready'); } },
      ceremony: ceremonyPort(), requireLiveness: async () => undefined
    }, () => new Date(now));
    await service.initialize();
    const started = await service.execute({ action: 'start', conductor_id: null, expected_canonical_cursor: null, operation_key: 'start-cancel' });
    const cancelled = await service.execute({ action: 'cancel', conductor_id: started.conductor_id, expected_canonical_cursor: started.canonical_cursor, operation_key: 'cancel-once' });
    expect(cancelled.status).toBe('cancelled');
    expect((await service.execute({ action: 'cancel', conductor_id: cancelled.conductor_id, expected_canonical_cursor: cancelled.canonical_cursor, operation_key: 'cancel-once' })).status).toBe('cancelled');
    expect((await ledger.list()).filter((event) => event.event_type === 'DEMONSTRATION_CONDUCTOR_CANCELLED')).toHaveLength(1);
  });
});

function acceptanceState(requiredLiveness: boolean): FinalAcceptanceState {
  const gateIds = ['two-human-ceremony', 'organization-authority', 'workload-identity', 'shared-provider-task', 'external-framework', 'context-minimization', 'authority-escalation', 'runtime-containment', 'adversarial-controls', 'restart-recovery', 'evidence-reconstruction'] as const;
  return {
    schema_version: 2, generated_at: now,
    manifest: { schema_version: 2, manifest_id: 'manifest_phase51', session_id: 'phase44-final-session', required_providers: ['claude-code', 'openai-codex', 'gemini-antigravity'], accepted_frameworks: ['mcp'], minimum_humans: 2, biometric_record_range: [20, 70], trace_prefix: 'phase22_', trust_ceiling: 'connected-observed', created_at: now },
    status: 'ready', shared_trace_id: traceId, completion: { passed: 0, total: 11 },
    gates: gateIds.map((gate_id) => ({ gate_id, title: gate_id, status: 'pending', summary: 'Operator evidence is required.', evidence_refs: [], operator_action: 'Complete the canonical control.' })),
    attacks: ['replay', 'forged-approval', 'over-broad-delegation', 'context-leakage', 'tamper', 'provider-failure'].map((attack_id) => ({ attack_id, status: 'not-observed', reason_codes: [], evidence_refs: [] })) as FinalAcceptanceState['attacks'],
    evidence_integrity: 'verified', phase44_readiness: { clean_session: true, required_liveness_mode: requiredLiveness, liveness_verified_human_ids: [], approval_withdrawal_evidence_ref: null, project_integration_evidence_ref: null, package_eligible: false }, blockers: ['Evidence required.']
  };
}

function acceptedState(): FinalAcceptanceState {
  const state = acceptanceState(true);
  state.status = 'passed'; state.completion.passed = 11; state.blockers = [];
  state.gates = state.gates.map((gate) => ({ ...gate, status: 'passed', evidence_refs: [`evt_gate_${gate.gate_id}`], operator_action: undefined }));
  state.attacks = state.attacks.map((attack) => ({ ...attack, status: 'blocked', reason_codes: ['CONTROL_BLOCKED'], evidence_refs: [`evt_attack_${attack.attack_id}`] }));
  state.phase44_readiness = { clean_session: true, required_liveness_mode: true, liveness_verified_human_ids: ['human_one', 'human_two'], approval_withdrawal_evidence_ref: 'evt_withdrawal', project_integration_evidence_ref: 'evt_integration', package_eligible: true };
  return state;
}

function ceremonyPort() {
  const state = { schema_version: 1, active_ceremony_id: ceremonyId, sessions: [{ ceremony_id: ceremonyId, trace_id: traceId, status: 'active' }] } as unknown as CeremonyState;
  return { getState: async () => state, createSession: async () => state };
}

async function appendFinalEvidence(ledger: LocalAuthorityEventLedger): Promise<void> {
  for (const humanId of ['human_one', 'human_two']) await ledger.append({ trace_id: `tr_human_${humanId}`, actor: { type: 'human', id: humanId }, subject: { type: 'human_proof', id: `proof_${humanId}` }, event_type: 'HUMAN_VERIFIED_V2', payload: { human_id: humanId, liveness_mode: 'required' } });
  const entries = [
    ['FEDERATION_PAIRING_ACTIVATED', {}], ['FEDERATION_ENVELOPE_ACCEPTED', { operation: 'task-acknowledged' }],
    ['FEDERATION_ENVELOPE_ACCEPTED', { operation: 'ack-received' }], ['FEDERATION_HEARTBEAT_RECORDED', {}],
    ['FEDERATION_ENVELOPE_REJECTED', { reason_code: 'FEDERATION_SEQUENCE_REPLAY' }], ['FEDERATION_PEER_REVOKED', {}],
    ['FEDERATION_ENVELOPE_REJECTED', { reason_code: 'FEDERATION_PEER_INACTIVE' }]
  ] as const;
  for (const [event_type, payload] of entries) await ledger.append({ trace_id: traceId, actor: { type: 'system', id: 'federation' }, subject: { type: 'federation_envelope', id: `envelope_${crypto.randomUUID()}` }, event_type, payload });
}

function hash(character: string): `sha256:${string}` { return `sha256:${character.repeat(64)}`; }
