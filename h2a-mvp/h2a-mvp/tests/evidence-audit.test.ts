import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  activeBiometricModelSet,
  agentPassportSchema,
  agentRuntimeBindingSchema,
  defaultEvidenceQuery,
  demoWorkplaceSnapshot,
  humanIdentitySchema,
  humanProofSchema,
  type AgentPassport,
  type AgentRuntimeBinding,
  type HumanProof,
  type HumanProofState
} from '@h2a/contracts';
import { AgentCollaborationService, ScriptedScenarioService } from '@h2a/agents';
import type { BchFuzzyExtractorPort, BchRegistrationResult } from '@h2a/biometrics';
import { EvidenceAuditService, LocalAuthorityEventLedger, hashCanonical } from '@h2a/evidence';
import { HumanProofService, type HumanProofStatePort } from '@h2a/identity';
import { MandateService } from '@h2a/mandates';
import { AtomicFileStore, LocalWorkplaceRepository, VersionedJsonRepository } from '@h2a/storage';

const temporaryDirectories: string[] = [];
const clock = () => new Date('2026-08-20T13:00:00.000Z');

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))));

describe('Phase 9 evidence audit and export', () => {
  it('resolves protected actions through human, proof, passport, runtime, mandate, decision, and delegation records', async () => {
    const fixture = await createFixture();
    await fixture.scenarios.start({ scenarioId: 'governed-enterprise-review', rootMandateId: fixture.rootMandateId, outcome: 'normal' });
    const state = await fixture.audit.getState(defaultEvidenceQuery);
    const childExecution = state.events.find((item) => item.event.event_type === 'ACTION_EXECUTED' && item.identityChain.delegationPath.length === 1);

    expect(state.integrity.status).toBe('verified');
    expect(childExecution).toMatchObject({
      resolutionStatus: 'complete',
      missingLinks: [],
      identityChain: {
        humanId: 'human_primary', humanProofId: 'hp_current', passportId: 'agtp_child',
        durableAgentId: 'agent_child', runtimeId: 'runtime-aria'
      },
      decision: { decision: 'ALLOW', reasonCode: 'AUTHORIZED' }
    });
  });

  it('filters persisted decisions and reason codes without changing the source ledger', async () => {
    const fixture = await createFixture();
    await fixture.scenarios.start({ scenarioId: 'governed-enterprise-review', rootMandateId: fixture.rootMandateId, outcome: 'denied' });
    const state = await fixture.audit.getState({ ...defaultEvidenceQuery, decisions: ['DENY'], reasonCodes: ['ACTION_NOT_ALLOWED'] });

    expect(state.events.length).toBeGreaterThan(0);
    expect(state.events.every((item) => item.decision?.decision === 'DENY' && item.decision.reasonCode === 'ACTION_NOT_ALLOWED')).toBe(true);
    expect(state.totalEvents).toBeGreaterThan(state.matchedEvents);
  });

  it('surfaces the exact modified event and supports integrity-only investigation', async () => {
    const fixture = await createFixture();
    await fixture.scenarios.start({ scenarioId: 'governed-enterprise-review', rootMandateId: fixture.rootMandateId, outcome: 'normal' });
    const records = (await readFile(fixture.ledger.ledgerPath, 'utf8')).trim().split(/\r?\n/u).map((line) => JSON.parse(line) as Record<string, unknown>);
    const target = records[Math.floor(records.length / 2)];
    target.payload = { modified: true };
    await writeFile(fixture.ledger.ledgerPath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');

    const state = await fixture.audit.getState({ ...defaultEvidenceQuery, integrityOnly: true });
    expect(state.integrity).toMatchObject({ status: 'failed', failedEventId: target.event_id });
    expect(state.events.some((item) => item.event.event_id === target.event_id && item.integrityStatus === 'failed')).toBe(true);
  });

  it('exports a hashed privacy-minimized bundle and records the export event', async () => {
    const fixture = await createFixture();
    await fixture.scenarios.start({ scenarioId: 'governed-enterprise-review', rootMandateId: fixture.rootMandateId, outcome: 'normal' });
    const receipt = await fixture.audit.exportBundle(defaultEvidenceQuery);
    const bundle = JSON.parse(await readFile(join(fixture.root, receipt.relativePath), 'utf8')) as Record<string, unknown>;
    const recordedHash = bundle.bundleHash;
    delete bundle.bundleHash;
    const serialized = JSON.stringify(bundle);

    expect(receipt).toMatchObject({ privacyProfile: 'audit-minimized-v1', bundleHash: recordedHash });
    expect(hashCanonical(bundle)).toBe(recordedHash);
    expect(serialized).not.toContain('private_key_pem');
    expect(serialized).not.toContain('credential_ref');
    expect(serialized).not.toContain('completed Review enterprise invoice evidence');
    expect((await fixture.ledger.list()).at(-1)?.event_type).toBe('AUDIT_BUNDLE_EXPORTED');
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'h2a-audit-'));
  temporaryDirectories.push(root);
  const store = new AtomicFileStore(root);
  const ledger = new LocalAuthorityEventLedger(root, 'traces/audit-test.jsonl', clock);
  const workplace = new LocalWorkplaceRepository(root, clock);
  await new HumanProofService(root, ledger, new NoopBch(), clock).initialize();
  const proof = currentProof();
  const passports = [passport('agent_root', 'agtp_root', 'Maya'), passport('agent_child', 'agtp_child', 'Aria')];
  const bindings = [binding('runtime-maya', 'agent_root', 'Maya', 'scripted'), binding('runtime-aria', 'agent_child', 'Aria', 'openai-codex')];
  await Promise.all([
    new VersionedJsonRepository(store, 'humans/identities.json', 'h2a.humans.identities', z.array(humanIdentitySchema), { initialData: [], clock }).write([{ human_id: 'human_primary', display_name: 'Demo Principal', status: 'active', enrolled_at: '2026-08-20T10:00:00.000Z', last_verified_at: clock().toISOString() }]),
    new VersionedJsonRepository(store, 'human-proofs/proofs.json', 'h2a.human-proof.proofs', z.array(humanProofSchema), { initialData: [], clock }).write([proof]),
    new VersionedJsonRepository(store, 'passports/registry.json', 'h2a.agents.passports', z.array(agentPassportSchema), { initialData: [], clock }).write(passports),
    new VersionedJsonRepository(store, 'workplace/runtime-bindings.json', 'h2a.agents.runtime-bindings', z.array(agentRuntimeBindingSchema), { initialData: [], clock }).write(bindings),
    workplace.replaceAgents(demoWorkplaceSnapshot.agents.slice(0, 2).map((agent, index) => ({ ...agent, id: bindings[index].binding_id, passportId: passports[index].passport_id, name: passports[index].name, mandateId: 'mnd_unassigned', mandateLabel: 'Mandate required', status: 'ready' }))),
    workplace.replaceAssignments([]),
    workplace.replaceRecentEvents([])
  ]);
  const mandates = new MandateService(root, ledger, new FixedHumanProof(proof), workplace, clock);
  const collaboration = new AgentCollaborationService(root, ledger, workplace, clock);
  await Promise.all([mandates.initialize(), collaboration.initialize()]);
  let mandateState = await mandates.create(rootRequest());
  const rootMandateId = mandateState.mandates[0].mandateId;
  mandateState = await mandates.delegate(childRequest(rootMandateId));
  expect(mandateState.mandates).toHaveLength(2);
  const scenarios = new ScriptedScenarioService(root, ledger, workplace, collaboration, mandates, undefined, undefined, clock);
  await scenarios.initialize();
  const audit = new EvidenceAuditService(root, ledger, workplace, clock);
  await audit.initialize();
  return { root, ledger, workplace, mandates, collaboration, scenarios, audit, rootMandateId };
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

function passport(agentId: string, passportId: string, name: string): AgentPassport {
  return { passport_id: passportId, agent_id: agentId, name, role: 'Demo agent', owner_org: 'h2a-demo', owner_human_id: 'human_primary', owner_human_proof_id: 'hp_current', runtime: 'scripted', capabilities: ['invoice.read', 'payment.execute'], status: 'active', workload_public_key: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----', issued_at: '2026-08-20T12:00:00.000Z', updated_at: '2026-08-20T12:00:00.000Z', passport_signature: 'ed25519:test' };
}

function binding(bindingId: string, agentId: string, name: string, provider: AgentRuntimeBinding['provider']): AgentRuntimeBinding {
  return { binding_id: bindingId, agent_id: agentId, display_name: name, role: 'Demo agent', provider, model: 'demo-model', cwd: '.', status: 'idle', connection_state: 'connected', current_action: 'Ready', progress: 0, created_at: '2026-08-20T12:00:00.000Z', last_seen_at: clock().toISOString() };
}

function currentProof(): HumanProof {
  return { human_proof_id: 'hp_current', subject_id: 'human_primary', provider: 'local-face-bch', verification_methods: ['face', 'liveness'], assurance_level: 'high', verified_at: clock().toISOString(), expires_at: '2026-08-20T13:05:00.000Z', provider_attestation_hash: `sha256:${'a'.repeat(64)}`, h2a_signature: 'ed25519:test' };
}

class FixedHumanProof implements HumanProofStatePort {
  public constructor(private readonly proof: HumanProof) {}
  public async getState(): Promise<HumanProofState> {
    return { identity: { human_id: 'human_primary', display_name: 'Demo Principal', status: 'active', enrolled_at: '2026-08-20T10:00:00.000Z' }, enrollment: null, recentAttempts: [], failedAttempts: 0, lockedUntil: null, modelSet: activeBiometricModelSet, activeProof: this.proof };
  }
}

class NoopBch implements BchFuzzyExtractorPort {
  public async register(): Promise<BchRegistrationResult> { return { salt: 'a'.repeat(64), records: [] }; }
  public async verify() { return []; }
}
