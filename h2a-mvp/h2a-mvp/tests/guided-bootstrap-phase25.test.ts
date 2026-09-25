import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activeBiometricModelSet,
  type BiometricEnrollmentV2,
  type CeremonyCorrelation,
  type CeremonyResourceKind,
  type FinalAcceptanceState,
  type FrameworkConnectorState,
  type HumanIdentityV2,
  type HumanIdentityV2State,
  type HumanProofState,
  type HumanProofV2,
  type LiveRuntimeState,
  type RealCollaborationState
} from '@h2a/contracts';
import { GuidedBootstrapCoordinator } from '@h2a/bootstrap';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { AgentIdentityService, HumanProofService, type HumanProofStatePort } from '@h2a/identity';
import { MandateService } from '@h2a/mandates';
import { OrganizationAuthorityService, type HumanIdentityV2StatePort } from '@h2a/organization';
import { AgentCollaborationService, authorityRenewalBlocked, LocalProviderSecretStore, RealCollaborationCoordinator } from '@h2a/agents';
import { LocalWorkplaceRepository } from '@h2a/storage';

const roots: string[] = [];
const now = new Date('2026-08-22T03:00:00.000Z');
const clock = () => new Date(now);
const ceremony: CeremonyCorrelation = { ceremony_id: 'ceremony_phase25', trace_id: 'phase22_phase25_test', idempotency_key: 'prepare_phase25' };

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))));

describe('Phase 25 guided enterprise bootstrap', () => {
  it('allows expired authority renewal after completed runs but blocks active execution', () => {
    const lane = { status: 'succeeded', run_id: 'historical_run' } as RealCollaborationState['lanes'][number];
    expect(authorityRenewalBlocked([lane])).toBe(false);
    expect(authorityRenewalBlocked([{ ...lane, status: 'running' }])).toBe(true);
  });
  it('builds and reconstructs two-human authority, four workload identities, mandates, and assignments through real services', async () => {
    const fixture = await createFixture();
    let state = await fixture.coordinator.prepare({ ceremony, administrator_human_id: 'human_admin', operator_human_id: 'human_operator' });
    expect(state.steps[0].status).toBe('passed');

    state = await fixture.coordinator.runStep({ ceremony: key('authority'), step_id: 'organization-authority' });
    expect(state.steps[1].status).toBe('passed');
    expect(state.operator_credential_id).toBeTruthy();
    expect(state.approver_credential_id).toBeTruthy();

    state = await fixture.coordinator.runStep({ ceremony: key('participants'), step_id: 'workload-identity' });
    expect(state.participants.every((participant) => participant.status === 'ready')).toBe(true);
    expect(new Set((await fixture.agents.getState()).passportsV2?.map((passport) => passport.workload_public_key)).size).toBe(4);

    state = await fixture.coordinator.runStep({ ceremony: key('mandates'), step_id: 'mandates-and-tasks' });
    expect(state.root_mandate_id).toBeTruthy();
    expect(state.child_mandate_ids).toHaveLength(3);
    expect(state.assignment_ids).toHaveLength(4);

    const claudeBinding = state.participants.find((participant) => participant.lane === 'claude-code')?.binding_id;
    expect(claudeBinding).toBeTruthy();
    await fixture.collaboration.createAssignment({ title: 'Restricted findings publication', objective: 'A later-phase assignment sharing the ceremony trace.', assigneeId: claudeBinding!, risk: 'restricted', priority: 1, dependsOn: [], requestedAction: 'findings.publish', ceremony: key('phase28-assignment') });

    const restarted = new GuidedBootstrapCoordinator(fixture.root, fixture.ledger, fixture.ports, fixture.root, clock);
    await restarted.initialize();
    state = await restarted.runStep({ ceremony: key('restart'), step_id: 'restart-recovery' });
    expect(state.status).toBe('ready');
    expect(state.assignment_ids).toHaveLength(4);
    expect(state.steps.every((step) => step.status === 'passed')).toBe(true);
    expect(fixture.ceremony.bindings.filter((binding) => binding.kind === 'agent-passport')).toHaveLength(4);
    expect((await fixture.ledger.list()).filter((event) => event.trace_id === ceremony.trace_id).length).toBeGreaterThan(20);
  });

  it('creates the single signed organization authority root when Phase 44 starts clean', async () => {
    const fixture = await createFixture('2026-08-22T04:00:00.000Z', false);
    expect((await fixture.organization.getState()).organizations).toHaveLength(0);

    await fixture.coordinator.prepare({ ceremony, administrator_human_id: 'human_admin', operator_human_id: 'human_operator' });
    const state = await fixture.coordinator.runStep({ ceremony: key('clean-authority'), step_id: 'organization-authority' });
    const authority = await fixture.organization.getState();

    expect(state.steps[1].status).toBe('passed');
    expect(authority.organizations.filter((item) => item.status === 'active')).toHaveLength(1);
    expect(authority.memberships.filter((item) => item.status === 'active')).toHaveLength(2);
    expect(authority.memberships.find((item) => item.human_id === 'human_admin')?.role_ids).toEqual(expect.arrayContaining(['role_authority_admin', 'role_h2a_security_approver']));
    expect(authority.memberships.find((item) => item.human_id === 'human_operator')?.role_ids).toEqual(['role_h2a_operator']);
    expect(authority.credentials.filter((item) => item.status === 'active').length).toBeGreaterThanOrEqual(2);
    expect((await fixture.ledger.list()).some((event) => event.trace_id === ceremony.trace_id && event.event_type === 'ORGANIZATION_BOOTSTRAPPED')).toBe(true);
  });

  it('rejects duplicate humans and stale proof before any authority mutation', async () => {
    const duplicate = await createFixture();
    await expect(duplicate.coordinator.prepare({ ceremony, administrator_human_id: 'human_admin', operator_human_id: 'human_admin' })).rejects.toThrow('different');
    expect((await duplicate.organization.getState()).memberships).toHaveLength(1);

    const stale = await createFixture();
    stale.humans.proofExpiry = '2026-08-22T02:59:00.000Z';
    await expect(stale.coordinator.prepare({ ceremony, administrator_human_id: 'human_admin', operator_human_id: 'human_operator' })).rejects.toThrow('fresh Human Proof');
    expect((await stale.organization.getState()).roles).toHaveLength(1);
  });

  it('rejects out-of-order execution before mutating workload identity', async () => {
    const fixture = await createFixture();
    await fixture.coordinator.prepare({ ceremony, administrator_human_id: 'human_admin', operator_human_id: 'human_operator' });
    await expect(fixture.coordinator.runStep({ ceremony: key('out-of-order'), step_id: 'workload-identity' })).rejects.toThrow('preceding Phase 25 step');
    expect((await fixture.agents.getState()).passportsV2).toHaveLength(0);
  });

  it('is idempotent and rejects a participant record owned by the wrong sponsor', async () => {
    const fixture = await createFixture();
    const first = await fixture.coordinator.prepare({ ceremony, administrator_human_id: 'human_admin', operator_human_id: 'human_operator' });
    const repeated = await fixture.coordinator.prepare({ ceremony, administrator_human_id: 'human_admin', operator_human_id: 'human_operator' });
    expect(repeated.completed_idempotency_keys).toEqual(first.completed_idempotency_keys);

    await fixture.coordinator.runStep({ ceremony: key('authority'), step_id: 'organization-authority' });
    fixture.agentsOverride = {
      ...(await fixture.agents.getState()),
      passportsV2: [{
        schema_version: 2, passport_id: 'passport_wrong', agent_id: 'agent_wrong', organization_id: 'org_hp_demo', sponsor_human_id: 'human_operator', sponsor_membership_id: 'membership_operator', issuance_human_proof_id: 'proof_operator', issuance_authority_credential_id: 'credential_wrong', connector_manifest_id: 'connector_openai-codex_v1', name: 'H2A Codex Coordinator', role: 'Security review coordinator', purpose: 'Wrong sponsor fixture for fail-closed verification.', risk_tier: 'restricted', capabilities: ['evidence.read'], workload_public_key: '-----BEGIN PUBLIC KEY-----\nwrong\n-----END PUBLIC KEY-----', status: 'active', issued_at: now.toISOString(), expires_at: '2026-09-22T03:00:00.000Z', canonical_hash: digest('7'), organization_signature: 'ed25519:test'
      }]
    };
    await expect(fixture.coordinator.runStep({ ceremony: key('wrong-sponsor'), step_id: 'workload-identity' })).rejects.toThrow('wrong sponsor');
  });

  it('replaces expired Phase 26 authority through fresh human proof and reconstructs it after restart', async () => {
    const fixture = await createFixture();
    await fixture.coordinator.prepare({ ceremony, administrator_human_id: 'human_admin', operator_human_id: 'human_operator' });
    await fixture.coordinator.runStep({ ceremony: key('authority'), step_id: 'organization-authority' });
    await fixture.coordinator.runStep({ ceremony: key('participants'), step_id: 'workload-identity' });
    await fixture.coordinator.runStep({ ceremony: key('mandates'), step_id: 'mandates-and-tasks' });
    await fixture.coordinator.runStep({ ceremony: key('restart'), step_id: 'restart-recovery' });
    const expiredIds = (await fixture.mandates.getState()).mandates.map((item) => item.mandateId);
    const lateClock = () => new Date('2026-08-22T12:00:00.000Z');
    const runtime: LiveRuntimeState = {
      providers: [
        provider('claude-code', '2.1.216'),
        provider('gemini-antigravity', '1.1.18'),
        provider('openai-codex', 'codex-cli 0.148.0')
      ],
      runs: [], output: []
    };
    const frameworks = {
      declarations: [{ connector_id: 'connector_mcp', kind: 'mcp', name: 'Official MCP SDK', protocol: 'mcp', adapter_version: '1.30.0', trust_ceiling: 'connected-observed', capabilities: ['task.receive'], health: 'ready', detail: 'Official MCP SDK is ready.', setup_document: 'docs/plan3/PHASE_26_REAL_PROVIDER_AND_FRAMEWORK_COLLABORATION.md', endpoint_policy: 'none', checked_at: lateClock().toISOString() }],
      protocol: {} as FrameworkConnectorState['protocol'], collaboration_runs: []
    } satisfies FrameworkConnectorState;
    const participantIdentity = await fixture.agents.getState();
    for (const passport of participantIdentity.passportsV2 ?? []) {
      const binding = participantIdentity.bindings.find((item) => item.agent_id === passport.agent_id)!;
      await fixture.agents.attestRuntime({ passportId: passport.passport_id, bindingId: binding.binding_id, connectorManifestId: passport.connector_manifest_id, adapterVersion: 'h2a-local-v1', trustMode: 'connected-observed', trustEvidenceRefs: [], expiresAt: '2026-08-22T20:00:00.000Z' });
    }
    const ports = { bootstrap: fixture.coordinator, humans: fixture.humans, organization: fixture.organization, ceremony: fixture.ceremony, agents: fixture.agents, mandates: fixture.mandates, collaboration: fixture.collaboration, runtime: { getState: async () => runtime, start: async () => { throw new Error('not used'); }, cancel: async () => { throw new Error('not used'); } }, frameworks: { getState: async () => frameworks, execute: async () => { throw new Error('not used'); } } };
    const coordinator = new RealCollaborationCoordinator(fixture.root, fixture.ledger, ports, fixture.root, lateClock);
    await coordinator.initialize();
    let state = await coordinator.prepare({ ceremony: { ...ceremony, idempotency_key: 'phase26_preflight' }, framework_kind: 'mcp' });
    expect(state.lanes.every((lane) => lane.status === 'not-ready' && lane.mandate_id === null)).toBe(true);

    await expect(coordinator.replaceAuthority({ ceremony: { ...ceremony, idempotency_key: 'phase26_replace_stale' } })).rejects.toThrow('Fresh Administrator / Approver Human Proof');
    expect((await fixture.mandates.getState()).mandates.map((item) => item.mandateId)).toEqual(expiredIds);

    fixture.humans.proofExpiry = '2026-08-22T13:00:00.000Z';
    state = await coordinator.replaceAuthority({ ceremony: { ...ceremony, idempotency_key: 'phase26_replace' } });
    expect(state.status).toBe('ready');
    expect(state.lanes.every((lane) => lane.status === 'ready' && lane.mandate_id && lane.assignment_id)).toBe(true);
    const replacementIds = state.lanes.map((lane) => lane.mandate_id!);
    expect(replacementIds.every((id) => !expiredIds.includes(id))).toBe(true);
    const reboundWorkplace = await fixture.collaboration.getState();
    for (const lane of state.lanes) {
      expect(reboundWorkplace.workplace.assignments.find((item) => item.id === lane.assignment_id)?.mandateId).toBe(lane.mandate_id);
      expect(reboundWorkplace.workplace.agents.find((item) => item.id === lane.binding_id)?.mandateId).toBe(lane.mandate_id);
    }
    const allMandates = (await fixture.mandates.getState()).mandates;
    expect(allMandates).toHaveLength(8);
    expect(expiredIds.every((id) => allMandates.some((item) => item.mandateId === id))).toBe(true);

    await coordinator.replaceAuthority({ ceremony: { ...ceremony, idempotency_key: 'phase26_replace_repeat' } });
    expect((await fixture.mandates.getState()).mandates).toHaveLength(8);
    const restarted = new RealCollaborationCoordinator(fixture.root, fixture.ledger, ports, fixture.root, lateClock);
    await restarted.initialize();
    state = await restarted.getState();
    expect(state.status).toBe('ready');
    expect(new Set(state.lanes.map((lane) => lane.mandate_id))).toEqual(new Set(replacementIds));
    const restartedWorkplace = await fixture.collaboration.getState();
    expect(state.lanes.every((lane) => restartedWorkplace.workplace.assignments.some((item) => item.id === lane.assignment_id && item.mandateId === lane.mandate_id))).toBe(true);
    expect(state.lanes.every((lane) => restartedWorkplace.workplace.agents.some((item) => item.id === lane.binding_id && item.mandateId === lane.mandate_id))).toBe(true);
    expect((await fixture.ledger.list()).some((event) => event.event_type === 'REAL_COLLABORATION_AUTHORITY_REPLACED' && event.trace_id === ceremony.trace_id)).toBe(true);
  });
});

async function createFixture(proofExpiry = '2026-08-22T04:00:00.000Z', bootstrapAuthority = true) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase25-')); roots.push(root);
  const ledger = new LocalAuthorityEventLedger(root, 'traces/phase25.jsonl', clock);
  const humans = new IdentityFixture(proofExpiry);
  const organization = new OrganizationAuthorityService(root, ledger, humans, clock); await organization.initialize();
  if (bootstrapAuthority) await organization.bootstrap({ organization_id: 'org_hp_demo', name: 'HP Enterprise Demo', policy_version: 'policy_2026_01', human_id: 'human_admin', membership_id: 'membership_admin', human_proof_id: 'proof_admin', employee_id: 'E-100', department: 'Enterprise Security', credential_expires_at: '2026-09-22T03:00:00.000Z' });
  const workplace = new LocalWorkplaceRepository(root, clock);
  await Promise.all([workplace.replaceAgents([]), workplace.replaceAssignments([]), workplace.replaceRecentEvents([])]);
  const legacyProof = new FixedProof();
  await new HumanProofService(root, ledger, undefined, clock).initialize();
  const agents = new AgentIdentityService(root, ledger, legacyProof, workplace, new LocalProviderSecretStore(root, { encrypt: async (value: string) => value, decrypt: async (value: string) => value }, clock), clock, organization); await agents.initialize();
  const mandates = new MandateService(root, ledger, legacyProof, workplace, clock, organization); await mandates.initialize();
  const collaboration = new AgentCollaborationService(root, ledger, workplace, clock); await collaboration.initialize();
  const fakeCeremony = new CeremonyFixture();
  let agentsOverride: Awaited<ReturnType<typeof agents.getState>> | null = null;
  const ports = {
    humans,
    acceptance: { getState: async () => ({ gates: [{ gate_id: 'two-human-ceremony', status: 'passed' }] }) as FinalAcceptanceState },
    organization,
    agents: { getState: async () => agentsOverride ?? agents.getState(), createAgent: (request: Parameters<typeof agents.createAgent>[0]) => agents.createAgent(request) },
    mandates,
    collaboration,
    ceremony: fakeCeremony
  };
  const coordinator = new GuidedBootstrapCoordinator(root, ledger, ports, root, clock); await coordinator.initialize();
  return { root, ledger, humans, organization, agents, mandates, collaboration, ceremony: fakeCeremony, ports, coordinator, get agentsOverride() { return agentsOverride; }, set agentsOverride(value) { agentsOverride = value; } };
}

class CeremonyFixture {
  public bindings: Array<{ kind: string; resourceId: string }> = [];
  public async assertBinding(ceremonyId: string, traceId: string) { if (ceremonyId !== ceremony.ceremony_id || traceId !== ceremony.trace_id) throw new Error('different ceremony'); return {}; }
  public async bindResource(_correlation: CeremonyCorrelation, kind: CeremonyResourceKind, resourceId: string) { if (!this.bindings.some((item) => item.kind === kind && item.resourceId === resourceId)) this.bindings.push({ kind, resourceId }); return {}; }
}

class IdentityFixture implements HumanIdentityV2StatePort {
  public constructor(public proofExpiry: string) {}
  public async getState(selectedHumanId?: string): Promise<HumanIdentityV2State> {
    const ids = ['human_admin', 'human_operator'];
    const identities = ids.map((id) => identity(id)).filter((item) => !selectedHumanId || item.human_id === selectedHumanId);
    const enrollments = ids.map((id) => enrollment(id)).filter((item) => !selectedHumanId || item.human_id === selectedHumanId);
    const active_proofs = ids.map((id) => proof(id, this.proofExpiry)).filter((item) => !selectedHumanId || item.human_id === selectedHumanId);
    return { identities, enrollments, active_proofs, selected_human_id: selectedHumanId ?? null, last_result: null };
  }
}

class FixedProof implements HumanProofStatePort {
  public async getState(): Promise<HumanProofState> { return { identity: null, enrollment: null, recentAttempts: [], failedAttempts: 0, lockedUntil: null, modelSet: activeBiometricModelSet, activeProof: null }; }
}

function identity(humanId: string): HumanIdentityV2 { const membership = humanId === 'human_admin' ? 'membership_admin' : 'membership_operator'; return { schema_version: 2, human_id: humanId, organization_id: 'org_hp_demo', display_name: humanId === 'human_admin' ? 'Kink Approver' : 'Varun Operator', status: 'active', active_membership_id: membership, current_enrollment_id: `enrollment_${humanId}`, created_at: now.toISOString(), updated_at: now.toISOString() }; }
function enrollment(humanId: string): BiometricEnrollmentV2 { return { schema_version: 2, enrollment_id: `enrollment_${humanId}`, organization_id: 'org_hp_demo', human_id: humanId, version: 1, provider: 'local-face-bch', modality: 'face', model_set_hash: digest('1'), policy: { policy_id: 'demo-face-v2-20', token_set_size: 20, required_matches: 1, bch_error_tolerance: 1800, proof_ttl_seconds: 300, quality_threshold: 0.65, liveness_threshold: 0.75, minimum_distance_cm: 35, maximum_distance_cm: 85, calibration_status: 'demo-unmeasured' }, protected_record_refs: Array.from({ length: 20 }, (_, index) => `record_${humanId}_${index}`), public_record_hashes: Array.from({ length: 20 }, (_, index) => digest(String((index % 9) + 1))), status: 'active', created_at: now.toISOString(), canonical_hash: digest('2'), organization_signature: 'ed25519:test' }; }
function proof(humanId: string, expiresAt: string): HumanProofV2 { const membership = humanId === 'human_admin' ? 'membership_admin' : 'membership_operator'; return { schema_version: 2, human_proof_id: `proof_${humanId.replace('human_', '')}`, human_id: humanId, organization_id: 'org_hp_demo', membership_id: membership, enrollment_id: `enrollment_${humanId}`, enrollment_version: 1, policy_hash: digest('3'), purpose: 'authorize Phase 25 enterprise bootstrap', nonce: `nonce_${humanId}`, assurance_level: 'substantial', verification_methods: ['face', 'distance', 'bch'], matched_record_count: 20, verified_at: '2026-08-22T02:59:00.000Z', expires_at: expiresAt, provider_attestation_hash: digest('4'), canonical_hash: digest('5'), organization_signature: 'ed25519:test' }; }
function key(value: string): CeremonyCorrelation { return { ...ceremony, idempotency_key: `phase25_${value}` }; }
function digest(value: string): string { return `sha256:${value.repeat(64).slice(0, 64)}`; }
function provider(providerId: 'claude-code' | 'gemini-antigravity' | 'openai-codex', version: string): LiveRuntimeState['providers'][number] { return { provider: providerId, health: 'ready', version, detail: `${providerId} is ready.`, trust_mode: 'connected-observed', checked_at: new Date('2026-08-22T12:00:00.000Z').toISOString() }; }
