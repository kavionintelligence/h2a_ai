import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  activeBiometricModelSet,
  agentPassportSchema,
  demoWorkplaceSnapshot,
  type AgentPassport,
  type HumanProofState
} from '@h2a/contracts';
import { AgentCollaborationService, ScriptedScenarioService } from '@h2a/agents';
import type { BchFuzzyExtractorPort, BchRegistrationResult } from '@h2a/biometrics';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { HumanProofService, type HumanProofStatePort } from '@h2a/identity';
import { MandateService } from '@h2a/mandates';
import { AtomicFileStore, LocalWorkplaceRepository, VersionedJsonRepository } from '@h2a/storage';

const temporaryDirectories: string[] = [];
const clock = () => new Date('2026-08-20T13:00:00.000Z');

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))));

describe('Phase 8 governed scripted scenario', () => {
  it.each([
    ['normal', 'succeeded', 'complete'],
    ['denied', 'denied', 'denied'],
    ['failure', 'failed', 'failed'],
    ['timeout', 'timed-out', 'timed-out']
  ] as const)('reproduces the %s path through real policy, persistence, and evidence', async (outcome, runStatus, stepStatus) => {
    const fixture = await createFixture();
    const state = await fixture.scenarios.start({ scenarioId: 'governed-enterprise-review', rootMandateId: fixture.rootMandateId, outcome });
    const run = state.runs[0];
    const collaboration = await fixture.collaboration.getState();
    const evidence = await fixture.ledger.list();

    expect(run.status).toBe(runStatus);
    expect(run.steps.some((step) => step.status === stepStatus)).toBe(true);
    expect(collaboration.workplace.assignments).toHaveLength(2);
    expect(evidence.some((event) => event.event_type === 'SCENARIO_STARTED')).toBe(true);
    expect(evidence.some((event) => event.event_type === 'POLICY_ALLOWED' || event.event_type === 'POLICY_DENIED')).toBe(true);
    expect((await fixture.ledger.verify()).status).toBe('verified');
    if (outcome === 'normal') {
      expect(collaboration.workplace.assignments.every((assignment) => assignment.status === 'complete')).toBe(true);
      expect(collaboration.messages).toHaveLength(1);
      expect(collaboration.responses).toHaveLength(2);
      expect(evidence.some((event) => event.event_type === 'WORKFLOW_COMPLETED')).toBe(true);
    }
  });

  it('pauses for current Human Approval and resumes the same persisted run', async () => {
    const fixture = await createFixture();
    let state = await fixture.scenarios.start({ scenarioId: 'governed-enterprise-review', rootMandateId: fixture.rootMandateId, outcome: 'approval' });
    expect(state.runs[0].status).toBe('approval-required');
    const approvalId = state.runs[0].steps[state.runs[0].currentStepIndex].approvalRequestId;
    expect(approvalId).toBeTruthy();

    await fixture.mandates.resolveApproval({ approvalRequestId: approvalId!, action: 'approve' });
    state = await fixture.scenarios.resume({ runId: state.runs[0].runId });

    expect(state.runs[0]).toMatchObject({ status: 'succeeded', requestedOutcome: 'approval' });
    expect((await fixture.collaboration.getState()).workplace.assignments.every((assignment) => assignment.status === 'complete')).toBe(true);
  });

  it('contains a revoked authority chain before any runtime execution', async () => {
    const fixture = await createFixture();
    await fixture.mandates.updateLifecycle({ mandateId: fixture.rootMandateId, action: 'revoke' });
    const state = await fixture.scenarios.start({ scenarioId: 'governed-enterprise-review', rootMandateId: fixture.rootMandateId, outcome: 'revocation' });
    const evidence = await fixture.ledger.list();

    expect(state.runs[0].status).toBe('revoked');
    expect(state.runs[0].steps[0]).toMatchObject({ status: 'revoked', reasonCode: 'MANDATE_REVOKED' });
    expect(evidence.some((event) => event.event_type === 'RUNTIME_EXECUTION_STARTED' && event.trace_id === state.runs[0].traceId)).toBe(false);
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'h2a-scenario-'));
  temporaryDirectories.push(root);
  const ledger = new LocalAuthorityEventLedger(root, 'traces/scenario-test.jsonl', clock);
  const workplace = new LocalWorkplaceRepository(root, clock);
  const passports = new VersionedJsonRepository(new AtomicFileStore(root), 'passports/registry.json', 'h2a.agents.passports', z.array(agentPassportSchema), { initialData: [], clock });
  await passports.write([passport('agent_root', 'agtp_root'), passport('agent_child', 'agtp_child')]);
  await Promise.all([
    workplace.replaceAgents(demoWorkplaceSnapshot.agents.slice(0, 2).map((agent, index) => ({ ...agent, passportId: index === 0 ? 'agtp_root' : 'agtp_child', mandateId: 'mnd_unassigned', mandateLabel: 'Mandate required', status: 'ready' }))),
    workplace.replaceAssignments([]),
    workplace.replaceRecentEvents([])
  ]);
  const proof = new FixedHumanProof();
  await new HumanProofService(root, ledger, new NoopBch(), clock).initialize();
  const mandates = new MandateService(root, ledger, proof, workplace, clock);
  const collaboration = new AgentCollaborationService(root, ledger, workplace, clock);
  await Promise.all([mandates.initialize(), collaboration.initialize()]);
  let mandateState = await mandates.create(rootRequest());
  const rootMandateId = mandateState.mandates[0].mandateId;
  mandateState = await mandates.delegate(childRequest(rootMandateId));
  expect(mandateState.mandates).toHaveLength(2);
  const scenarios = new ScriptedScenarioService(root, ledger, workplace, collaboration, mandates, undefined, undefined, clock);
  await scenarios.initialize();
  return { root, ledger, workplace, mandates, collaboration, scenarios, rootMandateId };
}

function rootRequest() {
  return {
    agentId: 'agent_root', objective: 'Review enterprise invoice evidence', resources: ['invoice:9182'],
    actions: ['invoice.read', 'payment.execute'], prohibitedActions: ['vendor.delete'],
    limits: { maxAmount: 1000, maxRecords: 10, maxDurationMinutes: 30, parameterEquals: { tenant: 'hp-demo' } },
    allowedFields: ['invoiceId', 'amount'], approvalActions: ['payment.execute'],
    delegation: { allowed: true, allowedAgentIds: ['agent_child'], maxDepth: 1 }, expiresAt: '2026-08-20T14:00:00.000Z'
  };
}

function childRequest(parentMandateId: string) {
  return {
    ...rootRequest(), parentMandateId, fromAgentId: 'agent_root', agentId: 'agent_child', actions: ['invoice.read'],
    limits: { maxAmount: 500, maxRecords: 5, maxDurationMinutes: 15, parameterEquals: { tenant: 'hp-demo' } },
    approvalActions: [], delegation: { allowed: false, allowedAgentIds: [], maxDepth: 1 }, expiresAt: '2026-08-20T13:50:00.000Z'
  };
}

function passport(agentId: string, passportId: string): AgentPassport {
  return { passport_id: passportId, agent_id: agentId, name: agentId, role: 'Demo agent', owner_org: 'h2a-demo', owner_human_id: 'human_primary', owner_human_proof_id: 'hp_current', runtime: 'scripted', capabilities: ['invoice.read', 'payment.execute'], status: 'active', workload_public_key: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----', issued_at: '2026-08-20T12:00:00.000Z', updated_at: '2026-08-20T12:00:00.000Z', passport_signature: 'ed25519:test' };
}

class FixedHumanProof implements HumanProofStatePort {
  public async getState(): Promise<HumanProofState> {
    return { identity: { human_id: 'human_primary', display_name: 'Demo Principal', status: 'active', enrolled_at: '2026-08-20T10:00:00.000Z' }, enrollment: null, recentAttempts: [], failedAttempts: 0, lockedUntil: null, modelSet: activeBiometricModelSet, activeProof: { human_proof_id: 'hp_current', subject_id: 'human_primary', provider: 'local-face-bch', verification_methods: ['face', 'liveness'], assurance_level: 'high', verified_at: clock().toISOString(), expires_at: '2026-08-20T13:05:00.000Z', provider_attestation_hash: `sha256:${'a'.repeat(64)}`, h2a_signature: 'ed25519:test' } };
  }
}

class NoopBch implements BchFuzzyExtractorPort {
  public async register(): Promise<BchRegistrationResult> { return { salt: 'a'.repeat(64), records: [] }; }
  public async verify() { return []; }
}
