import { randomUUID } from 'node:crypto';
import { HumanIdentityV2Service } from '@h2a/identity';
import { OrganizationAuthorityService } from '@h2a/organization';
import { LocalAuthorityEventLedger, hashCanonical } from '@h2a/evidence';
import { BchFuzzyExtractor, type BchFuzzyExtractorPort } from '@h2a/biometrics';
import type { VerifyHumanV2Request } from '@h2a/contracts';
import { EmployeeWorkspaceService } from '../../packages/organization/src/employeeWorkspaceService';

// Isolated automated fixture only. No camera/operator acceptance is claimed.
export const testBch: BchFuzzyExtractorPort = {
  register: async samples => ({ salt: 'TEST_ONLY', records: samples.map((sample, index) => ({ record_id: `test_${index}`, helper: 'TEST_ONLY', token: hashCanonical(sample), k2: 'TEST_ONLY' })) }),
  verify: async (sample, enrolled) => enrolled.records.map(record => ({ matched: hashCanonical(sample) === record.token, correctedErrors: 0 }))
};
const sample = (person: number, variant = 0): Array<0 | 1> => Array.from({ length: 4096 }, (_, i) => ((i < person * 90 || i === 400 + variant) ? 1 : 0));

export async function employeeWorkspaceFixture(root: string, options?: { realBch: boolean; initialDate: Date }) {
  let now = options?.initialDate ?? new Date('2026-09-06T10:00:00.000Z');
  const clock = () => now;
  const ledger = new LocalAuthorityEventLedger(root, 'traces/tr_platform.jsonl', clock);
  const identity = new HumanIdentityV2Service(root, ledger, options?.realBch ? new BchFuzzyExtractor() : testBch, clock);
  await identity.initialize();
  const authority = new OrganizationAuthorityService(root, ledger, identity, clock);
  await authority.initialize();
  for (const person of [1, 2, 3]) {
    await identity.enroll({ organization_id: 'test_org', human_id: `human_${person}`, membership_id: `member_${person}`, display_name: `Test Employee ${person}`,
      policy: { policy_id: 'test-policy', token_set_size: 20, required_matches: 1, bch_error_tolerance: 1800, proof_ttl_seconds: 300, quality_threshold: .65, liveness_threshold: .75, minimum_distance_cm: 35, maximum_distance_cm: 85, calibration_status: 'demo-unmeasured' },
      captures: Array.from({ length: 20 }, (_, i) => ({ sample: sample(person, i), assessment: { quality_score: .95, liveness_score: .96, distance_cm: 50, face_count: 1, captured_at: new Date(now.getTime() + i).toISOString() } })) });
  }
  function verification(person: number, purpose: string): VerifyHumanV2Request {
    return { organization_id: 'test_org', human_id: `human_${person}`, membership_id: `member_${person}`, purpose, nonce: randomUUID(), capture: { sample: sample(person), assessment: { quality_score: .95, liveness_score: .96, distance_cm: 50, face_count: 1, captured_at: now.toISOString() } } };
  }
  const verified = await identity.verify(verification(1, 'bootstrap test organization'));
  const adminProof = verified.active_proofs.find(item => item.human_id === 'human_1')!;
  const credentialExpiry = new Date(now.getTime() + 86400000).toISOString();
  let organization = await authority.bootstrap({ organization_id: 'test_org', name: 'Test Organization', policy_version: 'test-policy-v1', human_id: 'human_1', membership_id: 'member_1', human_proof_id: adminProof.human_proof_id, employee_id: 'TEST-1', department: 'Technology', credential_expires_at: credentialExpiry });
  const actor = { membership_id: 'member_1', human_proof_id: adminProof.human_proof_id, authority_credential_id: organization.credentials[0].credential_id };
  organization = await authority.createRole({ actor, organization_id: 'test_org', role_id: 'role_staff', name: 'Test finance staff', description: 'Test-only limited employee role', authority_scopes: [{ resource: 'records', actions: ['read'] }], approval_powers: [] });
  for (const person of [2, 3]) {
    const role = person === 2 ? 'role_authority_admin' : 'role_staff';
    await authority.joinMembership({ actor, organization_id: 'test_org', membership_id: `member_${person}`, human_id: `human_${person}`, employee_id: `TEST-${person}`, department: person === 2 ? 'Security' : 'Finance', role_ids: [role] });
    await authority.issueCredential({ actor, organization_id: 'test_org', membership_id: `member_${person}`, role_ids: [role], resource_constraints: [], action_constraints: [], approval_policy_ids: [], expires_at: credentialExpiry });
  }
  const createService = () => new EmployeeWorkspaceService(root, identity, authority, ledger, async () => 'required', clock, async () => ({ projectIds: ['project_1'], goalIds: ['goal_1', 'goal_2'] }));
  const service = createService();
  async function login(person: number, sender = person, target = service) {
    now = new Date(now.getTime() + 2100);
    const challenge = await target.begin(sender, `human_${person}`);
    const state = await target.verifyChallenge(sender, verification(person, challenge.purpose));
    return target.login(sender, state.active_proofs[0].human_proof_id);
  }
  async function proof(person: number, purpose: string) {
    now = new Date(now.getTime() + 2100);
    const state = await identity.verify(verification(person, purpose));
    return state.active_proofs.find(item => item.human_id === `human_${person}`)!.human_proof_id;
  }
  return { root, service, identity, authority, ledger, verification, login, proof, createService, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}
