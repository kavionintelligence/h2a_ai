import { verify as verifyBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalize, LocalAuthorityEventLedger } from '@h2a/evidence';
import { OrganizationAuthorityService, type HumanIdentityV2StatePort } from '@h2a/organization';
import { AtomicFileStore } from '@h2a/storage';
import type { AuthorityActor, HumanIdentityV2, HumanIdentityV2State, HumanProofV2, OrganizationAuthorityState } from '@h2a/contracts';

const temporaryDirectories: string[] = [];
const now = new Date('2026-08-21T00:00:00.000Z');

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))));

describe('Phase 13 organization and human authority', () => {
  it('bootstraps from current biometric assurance and issues a signed administrator credential', async () => {
    const fixture = await createFixture();
    const state = await bootstrap(fixture.service);

    expect(state.organizations).toEqual([expect.objectContaining({ organization_id: 'org_hp_demo', status: 'active' })]);
    expect(state.memberships).toEqual([expect.objectContaining({ membership_id: 'membership_admin', human_id: 'human_admin', role_ids: ['role_authority_admin'] })]);
    expect(state.roles[0]).toMatchObject({ role_id: 'role_authority_admin', approval_powers: ['mandate.approve', 'context.grant.issue', 'federation.node.manage', 'federation.peer.invite', 'federation.peer.join', 'federation.peer.approve', 'federation.peer.revoke'] });
    expect(state.roles[0].authority_scopes).toContainEqual({ resource: 'project-work-graph', actions: ['approve'] });
    expect(state.roles[0].authority_scopes).toContainEqual({ resource: 'federation-envelope', actions: ['listen', 'send'] });
    expect(state.credentials[0]).toMatchObject({ membership_id: 'membership_admin', status: 'active', canonical_hash: expect.stringMatching(/^sha256:/), organization_signature: expect.stringMatching(/^ed25519:/) });

    const keyEnvelope = JSON.parse((await fixture.store.read('settings/organization-signing-key-v2.json')) ?? '{}') as { data: { public_key_pem: string } };
    const credential = state.credentials[0];
    const unsigned = { schema_version: credential.schema_version, credential_id: credential.credential_id, organization_id: credential.organization_id, membership_id: credential.membership_id, role_ids: credential.role_ids, resource_constraints: credential.resource_constraints, action_constraints: credential.action_constraints, approval_policy_ids: credential.approval_policy_ids, issued_at: credential.issued_at, expires_at: credential.expires_at, status: credential.status };
    const signature = credential.organization_signature;
    expect(verifyBytes(null, Buffer.from(canonicalize(unsigned)), keyEnvelope.data.public_key_pem, Buffer.from(signature.slice('ed25519:'.length), 'base64'))).toBe(true);
    expect((await fixture.ledger.list()).map((event) => event.event_type)).toEqual(['ORGANIZATION_BOOTSTRAPPED']);
  });

  it('authorizes exact work-graph approval for an active administrator', async () => {
    const fixture = await createFixture();
    const state = await bootstrap(fixture.service);

    await expect(fixture.service.authorizeProtectedOperation(
      {
        organizationId: 'org_hp_demo',
        membershipId: 'membership_admin',
        humanProofId: 'proof_admin',
        authorityCredentialId: state.credentials[0]!.credential_id
      },
      'project-work-graph',
      'approve'
    )).resolves.toMatchObject({ humanId: 'human_admin', humanProofId: 'proof_admin' });
  });

  it('allows scoped work but denies an authenticated employee without mandate authority', async () => {
    const fixture = await createFixture();
    let state = await bootstrap(fixture.service);
    const admin = actor(state);
    state = await fixture.service.createRole({
      actor: admin,
      role_id: 'role_records_analyst',
      organization_id: 'org_hp_demo',
      name: 'Records Analyst',
      description: 'Reads bounded employee records without mandate issuance or approval authority.',
      authority_scopes: [{ resource: 'records', actions: ['read'], max_records: 25 }],
      approval_powers: []
    });
    state = await fixture.service.joinMembership({ actor: admin, organization_id: 'org_hp_demo', membership_id: 'membership_analyst', human_id: 'human_analyst', employee_id: 'E-200', department: 'Security Operations', manager_membership_id: 'membership_admin', role_ids: ['role_records_analyst'] });
    state = await fixture.service.issueCredential({ actor: admin, organization_id: 'org_hp_demo', membership_id: 'membership_analyst', role_ids: ['role_records_analyst'], resource_constraints: [], action_constraints: [], approval_policy_ids: [], expires_at: '2026-08-22T00:00:00.000Z' });
    const analystCredential = state.credentials.find((item) => item.membership_id === 'membership_analyst' && item.status === 'active')!;

    state = await fixture.service.evaluate({ organization_id: 'org_hp_demo', membership_id: 'membership_analyst', human_proof_id: 'proof_analyst', authority_credential_id: analystCredential.credential_id, resource: 'records', action: 'read', records: 10, purpose: 'read bounded records' });
    expect(state.decisions[0]).toMatchObject({ decision: 'ALLOW', reason_code: 'AUTHORIZED', matched_role_ids: ['role_records_analyst'] });

    state = await fixture.service.evaluate({ organization_id: 'org_hp_demo', membership_id: 'membership_analyst', human_proof_id: 'proof_analyst', authority_credential_id: analystCredential.credential_id, resource: 'mandate', action: 'issue', purpose: 'issue protected mandate' });
    expect(state.decisions[0]).toMatchObject({ decision: 'DENY', reason_code: 'RESOURCE_NOT_ALLOWED' });

    state = await fixture.service.evaluate({ organization_id: 'org_hp_demo', membership_id: 'membership_analyst', human_proof_id: 'proof_analyst', authority_credential_id: analystCredential.credential_id, resource: 'mandate', action: 'approve', required_approval_power: 'mandate.approve', purpose: 'approve protected mandate' });
    expect(state.decisions[0]).toMatchObject({ decision: 'DENY' });
  });

  it('enforces role limits, transfer re-authorization, suspension, termination, and credential expiry', async () => {
    let clock = new Date(now);
    const fixture = await createFixture(() => clock);
    let state = await bootstrap(fixture.service);
    const admin = actor(state);
    state = await fixture.service.createRole({ actor: admin, role_id: 'role_procurement', organization_id: 'org_hp_demo', name: 'Procurement Reviewer', description: 'Reviews bounded procurement effects.', authority_scopes: [{ resource: 'purchase', actions: ['approve'], max_amount: 5000 }], approval_powers: ['purchase.approve'] });
    state = await fixture.service.joinMembership({ actor: admin, organization_id: 'org_hp_demo', membership_id: 'membership_analyst', human_id: 'human_analyst', employee_id: 'E-200', department: 'Procurement', manager_membership_id: 'membership_admin', role_ids: ['role_procurement'] });
    state = await fixture.service.issueCredential({ actor: admin, organization_id: 'org_hp_demo', membership_id: 'membership_analyst', role_ids: ['role_procurement'], resource_constraints: [], action_constraints: [], approval_policy_ids: [], expires_at: '2026-08-21T01:00:00.000Z' });
    const credential = state.credentials.find((item) => item.membership_id === 'membership_analyst' && item.status === 'active')!;
    state = await fixture.service.evaluate({ organization_id: 'org_hp_demo', membership_id: 'membership_analyst', human_proof_id: 'proof_analyst', authority_credential_id: credential.credential_id, resource: 'purchase', action: 'approve', amount: 6000, required_approval_power: 'purchase.approve', purpose: 'approve purchase' });
    expect(state.decisions[0].reason_code).toBe('AMOUNT_EXCEEDS_ROLE');

    state = await fixture.service.updateMembership({ actor: admin, membership_id: 'membership_analyst', action: 'transfer', department: 'Risk', manager_membership_id: 'membership_admin', role_ids: ['role_procurement'] });
    expect(state.memberships.find((item) => item.membership_id === 'membership_analyst')?.status).toBe('transferred');
    expect(state.credentials.find((item) => item.credential_id === credential.credential_id)?.status).toBe('revoked');
    state = await fixture.service.updateMembership({ actor: admin, membership_id: 'membership_analyst', action: 'reactivate' });
    expect(state.memberships.find((item) => item.membership_id === 'membership_analyst')?.status).toBe('active');

    state = await fixture.service.issueCredential({ actor: admin, organization_id: 'org_hp_demo', membership_id: 'membership_analyst', role_ids: ['role_procurement'], resource_constraints: [], action_constraints: [], approval_policy_ids: [], expires_at: '2026-08-21T01:00:00.000Z' });
    const replacement = state.credentials.find((item) => item.membership_id === 'membership_analyst' && item.status === 'active')!;
    clock = new Date('2026-08-21T01:01:00.000Z');
    state = await fixture.service.evaluate({ organization_id: 'org_hp_demo', membership_id: 'membership_analyst', human_proof_id: 'proof_analyst', authority_credential_id: replacement.credential_id, resource: 'purchase', action: 'approve', amount: 100, purpose: 'approve purchase' });
    expect(state.decisions[0].reason_code).toBe('HUMAN_PROOF_REQUIRED');
    expect(state.credentials.find((item) => item.credential_id === replacement.credential_id)?.status).toBe('expired');
  });

  it('fails closed when a persisted credential is altered without a valid signature', async () => {
    const fixture = await createFixture();
    let state = await bootstrap(fixture.service);
    const credential = state.credentials[0];
    const envelope = JSON.parse((await fixture.store.read('authority/credentials-v2.json')) ?? '{}') as { data: Array<Record<string, unknown>> };
    envelope.data[0].action_constraints = ['records.read'];
    await fixture.store.write('authority/credentials-v2.json', `${JSON.stringify(envelope, null, 2)}\n`);

    state = await fixture.service.evaluate({ organization_id: 'org_hp_demo', membership_id: 'membership_admin', human_proof_id: 'proof_admin', authority_credential_id: credential.credential_id, resource: 'mandate', action: 'issue', purpose: 'issue protected mandate' });
    expect(state.decisions[0]).toMatchObject({ decision: 'DENY', reason_code: 'CREDENTIAL_SIGNATURE_INVALID' });
  });

  it('recovers a short-lived administrator credential only from exact-purpose Human Proof', async () => {
    const fixture = await createFixture();
    let state = await bootstrap(fixture.service);
    const original = state.credentials[0];
    state = await fixture.service.updateCredential({ actor: actor(state), credential_id: original.credential_id, action: 'revoke' });

    state = await fixture.service.recoverAdministratorCredential({
      organization_id: 'org_hp_demo',
      membership_id: 'membership_admin',
      human_proof_id: 'proof_admin',
      expires_at: '2026-08-21T02:00:00.000Z'
    });

    const recovered = state.credentials.find((item) => item.status === 'active');
    expect(recovered).toMatchObject({ membership_id: 'membership_admin', role_ids: ['role_authority_admin'], resource_constraints: [], action_constraints: [], expires_at: '2026-08-21T02:00:00.000Z' });
    expect(recovered?.canonical_hash).toMatch(/^sha256:/);
    expect(recovered?.organization_signature).toMatch(/^ed25519:/);
    expect((await fixture.ledger.list()).at(-1)).toMatchObject({ event_type: 'AUTHORITY_CREDENTIAL_ISSUED', payload: { recovery: 'exact-purpose-human-proof', human_proof_id: 'proof_admin' } });
    await expect(fixture.service.authorizeProtectedOperation({ organizationId: 'org_hp_demo', membershipId: 'membership_admin', humanProofId: 'proof_admin', authorityCredentialId: recovered!.credential_id }, 'federation-envelope', 'listen', 'federation.node.manage')).resolves.toMatchObject({ humanId: 'human_admin' });
    await expect(fixture.service.authorizeProtectedOperation({ organizationId: 'org_hp_demo', membershipId: 'membership_admin', humanProofId: 'proof_admin', authorityCredentialId: recovered!.credential_id }, 'federation-envelope', 'delete', 'federation.node.manage')).rejects.toThrow('ACTION_NOT_ALLOWED');
    await expect(fixture.service.recoverAdministratorCredential({ organization_id: 'org_hp_demo', membership_id: 'membership_admin', human_proof_id: 'proof_admin', expires_at: '2026-08-21T02:00:00.000Z' })).rejects.toThrow('already exists');
  });

  it('persists an immutable exact-scope replacement credential without broadening authority', async () => {
    let clock = new Date(now);
    const fixture = await createFixture(() => clock);
    let state = await fixture.service.bootstrap({ organization_id: 'org_hp_demo', name: 'HP Enterprise Demo', policy_version: 'policy_2026_01', human_id: 'human_admin', membership_id: 'membership_admin', human_proof_id: 'proof_admin', employee_id: 'E-100', department: 'Enterprise Security', credential_expires_at: '2026-08-21T00:30:00.000Z' });
    const original = state.credentials[0]!;
    clock = new Date('2026-08-21T00:31:00.000Z');
    state = await fixture.service.repairCredentialExactScope({
      organization_id: 'org_hp_demo', membership_id: 'membership_admin', human_proof_id: 'proof_repair',
      replaces_credential_id: original.credential_id, proof_purpose: 'repair prerequisites for Claude control review',
      command_id: 'phase26.claude-code.run', expires_at: '2026-08-21T01:01:00.000Z'
    });
    const replacement = state.credentials.find((item) => item.credential_id !== original.credential_id)!;
    expect(state.credentials.find((item) => item.credential_id === original.credential_id)?.status).toBe('expired');
    expect(replacement.credential_id).not.toBe(original.credential_id);
    expect({ roles: replacement.role_ids, resources: replacement.resource_constraints, actions: replacement.action_constraints, policies: replacement.approval_policy_ids })
      .toEqual({ roles: original.role_ids, resources: original.resource_constraints, actions: original.action_constraints, policies: original.approval_policy_ids });
    expect((await fixture.ledger.list()).at(-1)).toMatchObject({ event_type: 'AUTHORITY_CREDENTIAL_ISSUED', payload: { repair_mode: 'exact-scope-replacement', replacement_for_id: original.credential_id, command_id: 'phase26.claude-code.run' } });

    const restarted = new OrganizationAuthorityService(fixture.root, fixture.ledger, new IdentityFixture(), () => clock);
    await restarted.initialize();
    const persisted = await restarted.getState();
    expect(persisted.credentials.map((item) => item.credential_id)).toEqual(expect.arrayContaining([original.credential_id, replacement.credential_id]));
    clock = new Date('2026-08-21T01:02:00.000Z');
    await expect(restarted.repairCredentialExactScope({ organization_id: 'org_hp_demo', membership_id: 'membership_admin', human_proof_id: 'proof_repair', replaces_credential_id: original.credential_id, proof_purpose: 'repair prerequisites for Claude control review', command_id: 'phase26.claude-code.run', expires_at: '2026-08-21T02:01:00.000Z' })).rejects.toThrow('READINESS_CREDENTIAL_DURATION_BROADENED');
  });
});

function actor(state: OrganizationAuthorityState): AuthorityActor {
  return { membership_id: 'membership_admin', human_proof_id: 'proof_admin', authority_credential_id: state.credentials.find((item) => item.membership_id === 'membership_admin' && item.status === 'active')!.credential_id };
}

function bootstrap(service: OrganizationAuthorityService): Promise<OrganizationAuthorityState> {
  return service.bootstrap({ organization_id: 'org_hp_demo', name: 'HP Enterprise Demo', policy_version: 'policy_2026_01', human_id: 'human_admin', membership_id: 'membership_admin', human_proof_id: 'proof_admin', employee_id: 'E-100', department: 'Enterprise Security', credential_expires_at: '2026-08-22T00:00:00.000Z' });
}

async function createFixture(clock: () => Date = () => now) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-organization-'));
  temporaryDirectories.push(root);
  const ledger = new LocalAuthorityEventLedger(root, 'traces/organization-test.jsonl', clock);
  const store = new AtomicFileStore(root);
  const service = new OrganizationAuthorityService(root, ledger, new IdentityFixture(), clock);
  await service.initialize();
  return { root, ledger, store, service };
}

class IdentityFixture implements HumanIdentityV2StatePort {
  public async getState(selectedHumanId?: string): Promise<HumanIdentityV2State> {
    const identities = [
      identity('human_admin', 'membership_admin', 'Admin Operator'),
      identity('human_analyst', 'membership_analyst', 'Records Analyst')
    ].filter((item) => !selectedHumanId || item.human_id === selectedHumanId);
    const proofs = [
      proof('proof_admin', 'human_admin', 'membership_admin', 'administer trusted federation peers'),
      proof('proof_repair', 'human_admin', 'membership_admin', 'repair prerequisites for Claude control review', '2026-08-21T03:00:00.000Z'),
      proof('proof_analyst', 'human_analyst', 'membership_analyst')
    ].filter((item) => !selectedHumanId || item.human_id === selectedHumanId);
    return { identities, enrollments: [], active_proofs: proofs, selected_human_id: selectedHumanId ?? null, last_result: null };
  }
}

function identity(humanId: string, membershipId: string, displayName: string): HumanIdentityV2 {
  return { schema_version: 2 as const, human_id: humanId, organization_id: 'org_hp_demo', display_name: displayName, status: 'active' as const, active_membership_id: membershipId, current_enrollment_id: `enrollment_${humanId}`, created_at: now.toISOString(), updated_at: now.toISOString() };
}

function proof(proofId: string, humanId: string, membershipId: string, purpose = 'authorize enterprise operations', expiresAt = '2026-08-21T01:00:00.000Z'): HumanProofV2 {
  return { schema_version: 2, human_proof_id: proofId, human_id: humanId, organization_id: 'org_hp_demo', membership_id: membershipId, enrollment_id: `enrollment_${humanId}`, enrollment_version: 1, policy_hash: digest('1'), purpose, nonce: `nonce_${humanId}`, assurance_level: 'high', verification_methods: ['face', 'liveness', 'distance', 'bch'], matched_record_count: 20, verified_at: now.toISOString(), expires_at: expiresAt, provider_attestation_hash: digest('2'), canonical_hash: digest('3'), organization_signature: 'ed25519:test' };
}

function digest(value: string): string { return `sha256:${value.repeat(64).slice(0, 64)}`; }
