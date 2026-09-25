import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { expect, it } from 'vitest';
import { HumanIdentityV2Service } from '@h2a/identity';
import { OrganizationAuthorityService } from '@h2a/organization';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { FirstAdministratorSetup, firstAdministratorPurpose } from '../packages/organization/src/firstAdministratorSetup';
import { testBch } from './helpers/employeeWorkspaceFixture';

it('requires actual identity-service proof and sender ownership before one-time bootstrap (test biometric port)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h2a-first-administrator-'));
  try {
    const ledger = new LocalAuthorityEventLedger(root);
    const identity = new HumanIdentityV2Service(root, ledger, testBch);
    await identity.initialize();
    const authority = new OrganizationAuthorityService(root, ledger, identity);
    await authority.initialize();
    const setup = new FirstAdministratorSetup(identity, authority);
    expect(await setup.available()).toBe(true);
    const captures = Array.from({ length: 20 }, (_, variant) => ({ sample: Array.from({ length: 4096 }, (_, index) => (index === variant ? 1 : 0) as 0 | 1), assessment: { quality_score: .95, liveness_score: .95, face_count: 1, distance_cm: 50, captured_at: new Date().toISOString() } }));
    const input = { organization_id: 'test_org', human_id: 'test_human', membership_id: 'test_member', display_name: 'Test First Administrator', policy: { policy_id: 'test-policy', token_set_size: 20 as const, required_matches: 1, bch_error_tolerance: 1800, proof_ttl_seconds: 300, quality_threshold: .65, liveness_threshold: .75, minimum_distance_cm: 35, maximum_distance_cm: 85, calibration_status: 'demo-unmeasured' as const }, captures };
    await setup.enroll(input);
    await expect(setup.enroll(input)).rejects.toThrow('ALREADY_ENROLLED');
    const result = await setup.verify(7, { organization_id: input.organization_id, human_id: input.human_id, membership_id: input.membership_id, purpose: firstAdministratorPurpose, nonce: 'test-client-nonce', capture: captures[0] });
    const request = { name: 'Test First Organization', employee_id: 'TEST-ADMIN', department: 'Security', proof_id: result.active_proofs[0].human_proof_id };
    await expect(setup.commit(8, request)).rejects.toThrow('VERIFICATION_REQUIRED');
    await setup.commit(7, request);
    const state = await authority.getState();
    expect(state.organizations[0].name).toBe(request.name);
    expect(state.credentials[0].status).toBe('active');
    expect(await authority.verifyCredential(state.credentials[0])).toBe(true);
    expect(await setup.available()).toBe(false);
    await expect(setup.commit(7, request)).rejects.toThrow('SETUP_CLOSED');
    expect((await ledger.verify()).status).toBe('verified');
  } finally { if (resolve(root).startsWith(resolve(tmpdir()) + sep)) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
