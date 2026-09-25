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
import type { BchFuzzyExtractorPort, BchRegistrationResult } from '@h2a/biometrics';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { HumanProofService, type HumanProofStatePort } from '@h2a/identity';
import { MandateService, type ProtectedHumanAuthorityPort } from '@h2a/mandates';
import { AtomicFileStore, LocalWorkplaceRepository, VersionedJsonRepository } from '@h2a/storage';

const temporaryDirectories: string[] = [];

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))));

describe('Phase 7 mandate and policy runtime', () => {
  it('requires current Human Proof to create signed authority', async () => {
    const fixture = await createFixture(false);
    await expect(fixture.service.create(rootRequest())).rejects.toThrow('current Human Proof');
  });

  it('keeps the complete signed objective while bounding the workplace mandate label', async () => {
    const fixture = await createFixture();
    const objective = `Deliver governed project output ${'with exact signed authority '.repeat(10)}`.trim();
    const state = await fixture.service.create({ ...rootRequest(), objective });
    const agent = (await fixture.workplace.getSnapshot()).agents.find((item) => item.passportId === 'agtp_root');

    expect(state.mandates[0]?.objective).toBe(objective);
    expect(agent?.mandateLabel.length).toBe(160);
    expect(objective.startsWith(agent?.mandateLabel ?? '')).toBe(true);
  });

  it('enforces the Phase 13 human authority port before issuing a mandate', async () => {
    const deniedAuthority = new FixedProtectedAuthority(false);
    const denied = await createFixture(true, undefined, deniedAuthority);
    await expect(denied.service.create({ ...rootRequest(), humanAuthority: authorityContext() })).rejects.toThrow('RESOURCE_NOT_ALLOWED');
    expect(deniedAuthority.requests).toEqual([{ resource: 'mandate', action: 'issue', requiredApprovalPower: undefined }]);

    const allowedAuthority = new FixedProtectedAuthority(true);
    const allowed = await createFixture(true, undefined, allowedAuthority);
    let state = await allowed.service.create({ ...rootRequest(), humanAuthority: authorityContext() });
    expect(state.mandates[0].issuer).toMatchObject({ humanId: 'human_authorized', humanProofId: 'proof_authorized' });
    state = await allowed.service.authorize(action(state.mandates[0].mandateId, 'payment.execute', 'phase13-approval', 100));
    state = await allowed.service.resolveApproval({ approvalRequestId: state.approvals[0].approvalRequestId, action: 'approve', humanAuthority: authorityContext() });
    expect(state.approvals[0].status).toBe('approved');
    expect(allowedAuthority.requests.at(-1)).toEqual({ resource: 'mandate', action: 'approve', requiredApprovalPower: 'mandate.approve' });
  });

  it('evaluates scope and limits deterministically and pauses sensitive actions', async () => {
    const fixture = await createFixture();
    let state = await fixture.service.create(rootRequest());
    const root = state.mandates[0];
    expect(root.signature).toMatchObject({ algorithm: 'Ed25519', value: expect.stringMatching(/^ed25519:/), canonicalHash: expect.stringMatching(/^sha256:/) });

    state = await fixture.service.authorize(action(root.mandateId, 'invoice.read', 'read-1', 500));
    expect(state.decisions[0]).toMatchObject({ decision: 'ALLOW', reasonCode: 'AUTHORIZED' });

    state = await fixture.service.authorize(action(root.mandateId, 'invoice.read', 'read-2', 1500));
    expect(state.decisions[0]).toMatchObject({ decision: 'DENY', reasonCode: 'AMOUNT_EXCEEDS_MANDATE' });

    state = await fixture.service.authorize(action('mnd_missing', 'invoice.read', 'missing-1', 100));
    expect(state.decisions[0]).toMatchObject({ decision: 'DENY', reasonCode: 'MANDATE_NOT_FOUND' });

    state = await fixture.service.authorize(action(root.mandateId, 'payment.execute', 'pay-1', 500));
    expect(state.decisions[0]).toMatchObject({ decision: 'REQUIRES_HUMAN_APPROVAL', reasonCode: 'HUMAN_APPROVAL_REQUIRED' });
    expect(state.approvals[0].status).toBe('pending');

    state = await fixture.service.resolveApproval({ approvalRequestId: state.approvals[0].approvalRequestId, action: 'approve' });
    expect(state.approvals[0]).toMatchObject({ status: 'approved', humanProofId: 'hp_current' });
    expect(state.decisions[0]).toMatchObject({ decision: 'ALLOW', reasonCode: 'AUTHORIZED' });
  });

  it('treats approval-only actions as paused authority instead of ordinary allowed scope', async () => {
    const fixture = await createFixture();
    const request = rootRequest();
    const state = await fixture.service.create({ ...request, actions: ['invoice.read'], approvalActions: ['payment.execute'] });
    const evaluated = await fixture.service.authorize(action(state.mandates[0].mandateId, 'payment.execute', 'approval-only-1', 500));
    expect(evaluated.decisions[0]).toMatchObject({ decision: 'REQUIRES_HUMAN_APPROVAL', reasonCode: 'HUMAN_APPROVAL_REQUIRED' });
    expect(evaluated.approvals).toHaveLength(1);
  });

  it('rejects authority expansion and accepts a narrower child mandate', async () => {
    const fixture = await createFixture();
    let state = await fixture.service.create(rootRequest());
    const parent = state.mandates[0];
    await expect(fixture.service.delegate({ ...childRequest(parent.mandateId), limits: { maxAmount: 1500, maxRecords: 10, maxDurationMinutes: 30, parameterEquals: { tenant: 'hp-demo' } } })).rejects.toThrow('CHILD_EXPANDS_PARENT_AUTHORITY');

    state = await fixture.service.delegate(childRequest(parent.mandateId));
    expect(state.mandates[1]).toMatchObject({ parentMandateId: parent.mandateId, depth: 1, actions: ['invoice.read'] });
    expect(state.delegations).toHaveLength(1);
  });

  it('fails closed on expiry and cascading revocation blocks descendants and work', async () => {
    let now = new Date('2026-08-20T13:00:00.000Z');
    const fixture = await createFixture(true, () => now);
    let state = await fixture.service.create(rootRequest());
    const parent = state.mandates[0];
    state = await fixture.service.delegate(childRequest(parent.mandateId));
    const child = state.mandates[1];
    const snapshot = await fixture.workplace.getSnapshot();
    await fixture.workplace.replaceAssignments(snapshot.assignments.map((item, index) => index === 0 ? { ...item, mandateId: child.mandateId } : item));

    now = new Date('2026-08-20T14:01:00.000Z');
    state = await fixture.service.authorize(action(parent.mandateId, 'invoice.read', 'expired-1', 100));
    expect(state.decisions[0]).toMatchObject({ decision: 'DENY', reasonCode: 'MANDATE_EXPIRED' });

    now = new Date('2026-08-20T13:30:00.000Z');
    state = await fixture.service.updateLifecycle({ mandateId: parent.mandateId, action: 'revoke' });
    expect(state.mandates.map((item) => item.status)).toEqual(['revoked', 'revoked']);
    const contained = await fixture.workplace.getSnapshot();
    expect(contained.assignments[0].status).toBe('blocked');
    expect(contained.agents.find((item) => item.passportId === 'agtp_child')?.status).toBe('blocked');
    state = await fixture.service.authorize(action(parent.mandateId, 'invoice.read', 'revoked-1', 100));
    expect(state.decisions[0]).toMatchObject({ decision: 'DENY', reasonCode: 'MANDATE_REVOKED' });
  });
});

function rootRequest() {
  return {
    agentId: 'agent_root', objective: 'Approve invoice evidence for the HP demo', resources: ['invoice:9182'],
    actions: ['invoice.read', 'payment.execute'], prohibitedActions: ['vendor.delete'],
    limits: { maxAmount: 1000, maxRecords: 10, maxDurationMinutes: 30, parameterEquals: { tenant: 'hp-demo' } },
    allowedFields: ['invoiceId', 'amount'], approvalActions: ['payment.execute'],
    delegation: { allowed: true, allowedAgentIds: ['agent_child'], maxDepth: 1 }, expiresAt: '2026-08-20T14:00:00.000Z'
  };
}

function childRequest(parentMandateId: string) {
  return {
    ...rootRequest(), parentMandateId, fromAgentId: 'agent_root', agentId: 'agent_child',
    actions: ['invoice.read'], limits: { maxAmount: 500, maxRecords: 5, maxDurationMinutes: 15, parameterEquals: { tenant: 'hp-demo' } },
    approvalActions: [], delegation: { allowed: false, allowedAgentIds: [], maxDepth: 1 }, expiresAt: '2026-08-20T13:50:00.000Z'
  };
}

function action(mandateId: string, requestedAction: string, idempotencyKey: string, amount: number) {
  return { agentId: 'agent_root', mandateId, resource: 'invoice:9182', action: requestedAction, parameters: { amount, records: 1, durationMinutes: 5, tenant: 'hp-demo' }, requestedFields: ['invoiceId'], idempotencyKey };
}

async function createFixture(hasProof = true, clock: (() => Date) | undefined = () => new Date('2026-08-20T13:00:00.000Z'), authority?: ProtectedHumanAuthorityPort) {
  const activeClock = clock ?? (() => new Date('2026-08-20T13:00:00.000Z'));
  const root = await mkdtemp(join(tmpdir(), 'h2a-mandate-'));
  temporaryDirectories.push(root);
  const ledger = new LocalAuthorityEventLedger(root, 'traces/mandate-test.jsonl', activeClock);
  await new HumanProofService(root, ledger, new NoopBch(), activeClock).initialize();
  const passportRepository = new VersionedJsonRepository(new AtomicFileStore(root), 'passports/registry.json', 'h2a.agents.passports', z.array(agentPassportSchema), { initialData: [], clock: activeClock });
  await passportRepository.write([passport('agent_root', 'agtp_root'), passport('agent_child', 'agtp_child')]);
  const workplace = new LocalWorkplaceRepository(root, activeClock);
  await Promise.all([
    workplace.replaceAgents(demoWorkplaceSnapshot.agents.slice(0, 2).map((agent, index) => ({ ...agent, passportId: index === 0 ? 'agtp_root' : 'agtp_child', mandateId: 'mnd_unassigned', mandateLabel: 'Mandate required' }))),
    workplace.replaceAssignments(structuredClone(demoWorkplaceSnapshot.assignments)),
    workplace.replaceRecentEvents([])
  ]);
  const service = new MandateService(root, ledger, new FixedHumanProof(hasProof, activeClock), workplace, activeClock, authority);
  await service.initialize();
  return { service, ledger, workplace };
}

function passport(agentId: string, passportId: string): AgentPassport {
  return { passport_id: passportId, agent_id: agentId, name: agentId, role: 'Demo agent', owner_org: 'h2a-demo', owner_human_id: 'human_primary', owner_human_proof_id: 'hp_current', runtime: 'scripted', capabilities: ['invoice.read', 'payment.execute'], status: 'active', workload_public_key: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----', issued_at: '2026-08-20T12:00:00.000Z', updated_at: '2026-08-20T12:00:00.000Z', passport_signature: 'ed25519:test' };
}

class FixedHumanProof implements HumanProofStatePort {
  public constructor(private readonly active: boolean, private readonly clock: () => Date) {}
  public async getState(): Promise<HumanProofState> {
    return { identity: { human_id: 'human_primary', display_name: 'Demo Principal', status: 'active', enrolled_at: '2026-08-20T10:00:00.000Z' }, enrollment: null, recentAttempts: [], failedAttempts: 0, lockedUntil: null, modelSet: activeBiometricModelSet, activeProof: this.active ? { human_proof_id: 'hp_current', subject_id: 'human_primary', provider: 'local-face-bch', verification_methods: ['face', 'liveness'], assurance_level: 'high', verified_at: this.clock().toISOString(), expires_at: new Date(this.clock().getTime() + 300_000).toISOString(), provider_attestation_hash: `sha256:${'a'.repeat(64)}`, h2a_signature: 'ed25519:test' } : null };
  }
}

class NoopBch implements BchFuzzyExtractorPort {
  public async register(): Promise<BchRegistrationResult> { return { salt: 'a'.repeat(64), records: [] }; }
  public async verify() { return []; }
}

function authorityContext() { return { organizationId: 'org_hp_demo', membershipId: 'membership_authorized', humanProofId: 'proof_authorized', authorityCredentialId: 'credential_authorized' }; }

class FixedProtectedAuthority implements ProtectedHumanAuthorityPort {
  public readonly requests: Array<{ resource: string; action: string; requiredApprovalPower?: string }> = [];
  public constructor(private readonly allowed: boolean) {}
  public async authorizeProtectedOperation(_context: Parameters<ProtectedHumanAuthorityPort['authorizeProtectedOperation']>[0], resource: string, action: string, requiredApprovalPower?: string): Promise<{ humanId: string; humanProofId: string }> {
    this.requests.push({ resource, action, requiredApprovalPower });
    if (!this.allowed) throw new Error('Protected operation denied: RESOURCE_NOT_ALLOWED.');
    return { humanId: 'human_authorized', humanProofId: 'proof_authorized' };
  }
}
