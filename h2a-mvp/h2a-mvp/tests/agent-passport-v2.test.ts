import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verify } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { activeBiometricModelSet, type CreateAgentRequest, type HumanAuthorityContext, type HumanProofState, type WorkplaceSnapshot } from '@h2a/contracts';
import { LocalProviderSecretStore, type ProviderSecretProtector } from '@h2a/agents';
import type { BchFuzzyExtractorPort, BchRegistrationResult } from '@h2a/biometrics';
import { canonicalize, LocalAuthorityEventLedger } from '@h2a/evidence';
import { AgentIdentityService, HumanProofService, type HumanProofStatePort, type SponsorAuthorityPort } from '@h2a/identity';
import type { WorkplaceRepository } from '@h2a/storage';

const roots: string[] = [];
const clock = () => new Date('2026-08-21T03:00:00.000Z');
const protector: ProviderSecretProtector = { encrypt: async (value) => `encrypted:${value}`, decrypt: async (value) => value.replace('encrypted:', '') };

afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))));

describe('Phase 14 Agent Passport V2 and runtime attestation', () => {
  it('fails closed when the sponsoring employee lacks passport issuance authority', async () => {
    const root = await createRoot();
    const ledger = new LocalAuthorityEventLedger(root, 'traces/agent-v2-test.jsonl', clock);
    const denied: SponsorAuthorityPort = { authorizeProtectedOperation: async () => { throw new Error('Protected operation denied: RESOURCE_NOT_AUTHORIZED.'); } };
    const service = await createService(root, ledger, denied);
    await expect(service.createAgent(v2Request())).rejects.toThrow('RESOURCE_NOT_AUTHORIZED');
    expect((await service.getState()).passportsV2).toEqual([]);
  });

  it('requires sponsor authority and issues an organization-signed passport plus key-proven runtime session', async () => {
    const fixture = await createFixture(true);
    const state = await fixture.service.createAgent(v2Request());
    const passport = state.passportsV2?.[0];
    const attestation = state.attestations?.[0];
    const session = state.runtimeSessions?.[0];

    expect(fixture.authority.calls[0]).toMatchObject({ resource: 'agent-passport', action: 'issue' });
    expect(passport).toMatchObject({ schema_version: 2, sponsor_human_id: 'human_admin', risk_tier: 'restricted', status: 'active' });
    expect(attestation).toMatchObject({ passport_id: passport?.passport_id, trust_mode: 'connected-observed' });
    expect(session).toMatchObject({ passport_id: passport?.passport_id, state: 'ready', runtime_attestation_id: attestation?.attestation_id });
    const envelope = JSON.parse(await readFile(join(fixture.root, 'settings/organization-signing-key-v2.json'), 'utf8')) as { data: { public_key_pem: string } };
    const { canonical_hash: _hash, organization_signature, ...unsigned } = passport!;
    void _hash;
    expect(verify(null, Buffer.from(canonicalize(unsigned), 'utf8'), envelope.data.public_key_pem, Buffer.from(organization_signature.slice('ed25519:'.length), 'base64'))).toBe(true);
    expect(await readFile(join(fixture.root, 'passports/registry-v2.json'), 'utf8')).not.toContain('PRIVATE KEY');
    expect(await readFile(join(fixture.root, 'runtime/attestations-v2.json'), 'utf8')).not.toContain('PRIVATE KEY');
  });

  it('cannot attest a copied passport without the workload private key', async () => {
    const source = await createFixture(true);
    const sourceState = await source.service.createAgent(v2Request());
    const target = await createFixture(true);
    for (const relativePath of ['settings/organization-signing-key-v2.json', 'passports/registry.json', 'passports/registry-v2.json', 'workplace/runtime-bindings.json']) {
      await cp(join(source.root, relativePath), join(target.root, relativePath), { force: true });
    }
    const passport = sourceState.passportsV2![0];
    const binding = sourceState.bindings[0];
    await expect(target.service.attestRuntime(attestRequest(passport.passport_id, binding.binding_id))).rejects.toThrow('copied passport records cannot attest');
  });

  it('rotates session keys, revokes the prior session, and refuses an unearned governed label', async () => {
    const fixture = await createFixture(true);
    let state = await fixture.service.createAgent(v2Request());
    const passport = state.passportsV2![0];
    const binding = state.bindings[0];
    const firstSession = state.runtimeSessions![0];
    const firstAttestation = state.attestations![0];
    state = await fixture.service.attestRuntime(attestRequest(passport.passport_id, binding.binding_id));
    expect(state.runtimeSessions?.find((item) => item.runtime_session_id === firstSession.runtime_session_id)?.state).toBe('revoked');
    expect(state.runtimeSessions?.[0].runtime_session_id).not.toBe(firstSession.runtime_session_id);
    expect(state.attestations?.[0].session_public_key).not.toBe(firstAttestation.session_public_key);
    await expect(fixture.service.attestRuntime({ ...attestRequest(passport.passport_id, binding.binding_id), trustMode: 'governed' })).rejects.toThrow('Phase 16');
  });

  it('preserves collaboration-owned mandate and work state while rotating runtime attestation', async () => {
    const fixture = await createFixture(true);
    let state = await fixture.service.createAgent(v2Request());
    const passport = state.passportsV2![0];
    const binding = state.bindings[0];
    const snapshot = await fixture.workplace.getSnapshot();
    await fixture.workplace.replaceAgents(snapshot.agents.map((agent) => agent.passportId === passport.passport_id ? { ...agent, mandateId: 'mnd_active_review', mandateLabel: 'Active review mandate', status: 'working', currentAction: 'Review signed controls', progress: 40 } : agent));

    state = await fixture.service.attestRuntime(attestRequest(passport.passport_id, binding.binding_id));
    expect(state.runtimeSessions?.[0]).toMatchObject({ state: 'ready', passport_id: passport.passport_id });
    expect((await fixture.workplace.getSnapshot()).agents.find((agent) => agent.passportId === passport.passport_id)).toMatchObject({ mandateId: 'mnd_active_review', mandateLabel: 'Active review mandate', status: 'working', currentAction: 'Review signed controls', progress: 40 });
  });

  it('invalidates runtime sessions when sponsor-authorized passport lifecycle changes', async () => {
    const fixture = await createFixture(true);
    let state = await fixture.service.createAgent(v2Request());
    state = await fixture.service.updatePassport({ passportId: state.passports[0].passport_id, action: 'suspend', sponsorAuthority: sponsorAuthority() });
    expect(state.passportsV2?.[0].status).toBe('suspended');
    expect(state.runtimeSessions?.[0].state).toBe('suspended');
    state = await fixture.service.updatePassport({ passportId: state.passports[0].passport_id, action: 'reactivate', sponsorAuthority: sponsorAuthority() });
    expect(state.passportsV2?.[0].status).toBe('active');
    expect(state.runtimeSessions?.[0].state).toBe('suspended');
  });

  it('migrates an enriched V1 passport once and preserves its workload key binding', async () => {
    const root = await createRoot();
    const ledger = new LocalAuthorityEventLedger(root, 'traces/agent-v2-test.jsonl', clock);
    const legacy = await createService(root, ledger, undefined);
    const legacyState = await legacy.createAgent({ name: 'Legacy Analyst', role: 'Analyst', provider: 'scripted', model: 'coordinator-v0', workspace: 'C:\\H2A\\workspace', capabilities: ['research.public'] });
    const authority = new AllowAuthority();
    const upgraded = await createService(root, ledger, authority);
    const request = { organizationId: 'org_hp_demo', sponsorAuthority: sponsorAuthority(), mappings: [{ passportId: legacyState.passports[0].passport_id, connectorManifestId: 'connector_scripted_v1', purpose: 'Preserve the approved legacy analyst identity.', riskTier: 'standard' as const, expiresAt: '2026-09-21T03:00:00.000Z' }] };
    const first = await upgraded.migrateV1Passports(request);
    const second = await upgraded.migrateV1Passports(request);
    expect(first.passports).toHaveLength(1);
    expect(first.receipts).toHaveLength(1);
    expect(second.receipts).toHaveLength(1);
    expect(first.passports[0].workload_public_key).toBe(legacyState.passports[0].workload_public_key);
  });
});

function v2Request(): CreateAgentRequest {
  return { name: 'Sentinel', role: 'Security Analyst', provider: 'openai-codex', model: 'gpt-5-codex', workspace: 'C:\\H2A\\workspace', capabilities: ['code.read', 'evidence.read'], purpose: 'Inspect approved source and produce bounded security findings.', riskTier: 'restricted', connectorManifestId: 'connector_openai-codex_v1', trustMode: 'connected-observed', expiresAt: '2026-09-21T03:00:00.000Z', attestationExpiresAt: '2026-08-21T11:00:00.000Z', sponsorAuthority: sponsorAuthority() };
}

function attestRequest(passportId: string, bindingId: string) {
  return { passportId, bindingId, connectorManifestId: 'connector_openai-codex_v1', adapterVersion: 'h2a-local-v1', trustMode: 'connected-observed' as const, trustEvidenceRefs: [], expiresAt: '2026-08-21T11:00:00.000Z' };
}

function sponsorAuthority() { return { organizationId: 'org_hp_demo', membershipId: 'membership_admin', humanProofId: 'proof_admin', authorityCredentialId: 'credential_admin' }; }

async function createFixture(withAuthority: boolean) {
  const root = await createRoot();
  const ledger = new LocalAuthorityEventLedger(root, 'traces/agent-v2-test.jsonl', clock);
  const authority = new AllowAuthority();
  const workplace = new MemoryWorkplace();
  const service = await createService(root, ledger, withAuthority ? authority : undefined, workplace);
  return { root, ledger, authority, service, workplace };
}

async function createRoot() { const root = await mkdtemp(join(tmpdir(), 'h2a-agent-v2-')); roots.push(root); return root; }

async function createService(root: string, ledger: LocalAuthorityEventLedger, authority?: SponsorAuthorityPort, workplace: WorkplaceRepository = new MemoryWorkplace()) {
  const humanProof = new HumanProofService(root, ledger, new NoopBch(), clock);
  await humanProof.initialize();
  const service = new AgentIdentityService(root, ledger, new FixedProof(), workplace, new LocalProviderSecretStore(root, protector, clock), clock, authority);
  await service.initialize();
  return service;
}

class AllowAuthority implements SponsorAuthorityPort {
  public calls: Array<{ context?: HumanAuthorityContext; resource: string; action: string }> = [];
  public async authorizeProtectedOperation(context: HumanAuthorityContext | undefined, resource: string, action: string) { this.calls.push({ context, resource, action }); return { humanId: 'human_admin', humanProofId: 'proof_admin' }; }
}

class FixedProof implements HumanProofStatePort {
  public async getState(): Promise<HumanProofState> { return { identity: { human_id: 'human_primary', display_name: 'Legacy Owner', status: 'active', enrolled_at: '2026-08-21T02:00:00.000Z' }, enrollment: null, recentAttempts: [], failedAttempts: 0, lockedUntil: null, modelSet: activeBiometricModelSet, activeProof: { human_proof_id: 'proof_legacy', subject_id: 'human_primary', provider: 'local-face-bch', verification_methods: ['face', 'liveness'], assurance_level: 'high', verified_at: '2026-08-21T02:59:00.000Z', expires_at: '2026-08-21T03:05:00.000Z', provider_attestation_hash: `sha256:${'a'.repeat(64)}`, h2a_signature: 'ed25519:test' } }; }
}

class NoopBch implements BchFuzzyExtractorPort { public async register(): Promise<BchRegistrationResult> { return { salt: 'a'.repeat(64), records: [] }; } public async verify() { return []; } }

class MemoryWorkplace implements WorkplaceRepository {
  private snapshot: WorkplaceSnapshot = { generatedAt: clock().toISOString(), agents: [], assignments: [], events: [] };
  public async getSnapshot() { return structuredClone(this.snapshot); }
  public async replaceAgents(agents: WorkplaceSnapshot['agents']) { this.snapshot.agents = structuredClone(agents); }
  public async replaceAssignments(assignments: WorkplaceSnapshot['assignments']) { this.snapshot.assignments = structuredClone(assignments); }
  public async replaceRecentEvents(events: WorkplaceSnapshot['events']) { this.snapshot.events = structuredClone(events); }
}
