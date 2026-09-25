import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { HumanIdentityV2, HumanIdentityV2State, HumanProofV2, OrganizationAuthorityState } from '@h2a/contracts';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import { MultiHumanApprovalService, OrganizationAuthorityService, type HumanIdentityV2StatePort } from '@h2a/organization';

const roots: string[] = [];
const start = new Date('2026-08-21T00:00:00.000Z');
const purpose = 'approve restricted H2A action';

afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('Phase 18 multi-human approval', () => {
  it('routes only to eligible employees, enforces separation of duty and quorum, then resumes exactly once', async () => {
    const fixture = await setup();
    let state = await fixture.approvals.requestEscalation(escalation());
    const request = state.requests[0];
    expect(request.status).toBe('pending');
    expect(request.eligible_membership_ids).toEqual(['membership_security_1', 'membership_security_2']);
    expect(fixture.executions).toBe(0);

    await expect(fixture.approvals.submitDecision({ approval_request_id: request.approval_request_id, approver: actor(fixture.organization, 'membership_requester', 'proof_requester'), decision: 'approve', conditions: [] })).rejects.toThrow(/not an eligible approver|Separation of duty/);
    await expect(fixture.approvals.submitDecision({ approval_request_id: request.approval_request_id, approver: actor(fixture.organization, 'membership_outsider', 'proof_outsider'), decision: 'approve', conditions: [] })).rejects.toThrow('not an eligible approver');

    state = await fixture.approvals.submitDecision({ approval_request_id: request.approval_request_id, approver: actor(fixture.organization, 'membership_security_1', 'proof_security_1'), decision: 'approve', conditions: ['Bound to the requested effect hash.'] });
    expect(state.requests[0].status).toBe('pending');
    expect(state.resumes).toHaveLength(0);

    state = await fixture.approvals.submitDecision({ approval_request_id: request.approval_request_id, approver: actor(fixture.organization, 'membership_security_2', 'proof_security_2'), decision: 'approve', conditions: [] });
    expect(state.requests[0].status).toBe('approved');
    expect(state.mandate_extensions[0]).toMatchObject({ parent_mandate_id: 'mnd_parent', agent_id: 'runtime-noah', resource: 'restricted-records', action: 'read', delegation_depth_remaining: 0, status: 'active' });
    expect(state.decisions.map((item) => item.approver_human_id)).toEqual(['human_security_1', 'human_security_2']);
    expect(state.resumes[0]).toMatchObject({ status: 'ready', attempts: 0 });

    state = await fixture.approvals.consumeResume({ approval_request_id: request.approval_request_id, idempotency_key: 'resume_once_001' });
    expect(state.resumes[0]).toMatchObject({ status: 'completed', attempts: 1 });
    expect(state.mandate_extensions[0].status).toBe('consumed');
    expect(fixture.executions).toBe(1);
    await fixture.approvals.consumeResume({ approval_request_id: request.approval_request_id, idempotency_key: 'resume_once_001' });
    expect(fixture.executions).toBe(1);

    const quorumEvent = (await fixture.ledger.list()).find((event) => event.event_type === 'APPROVAL_QUORUM_REACHED');
    expect(quorumEvent?.payload).toMatchObject({ requesting_human_id: 'human_requester', requesting_agent_id: 'runtime-noah', approver_human_ids: ['human_security_1', 'human_security_2'] });
  });

  it('rejects wrong-purpose proof and makes rejection terminal', async () => {
    const fixture = await setup();
    const request = (await fixture.approvals.requestEscalation(escalation())).requests[0];
    fixture.identities.purposeOverrides.set('human_security_1', 'general login');
    await expect(fixture.approvals.submitDecision({ approval_request_id: request.approval_request_id, approver: actor(fixture.organization, 'membership_security_1', 'proof_security_1'), decision: 'approve', conditions: [] })).rejects.toThrow('Fresh Human Proof required');
    fixture.identities.purposeOverrides.delete('human_security_1');
    const state = await fixture.approvals.submitDecision({ approval_request_id: request.approval_request_id, approver: actor(fixture.organization, 'membership_security_1', 'proof_security_1'), decision: 'reject', conditions: ['Insufficient business justification.'] });
    expect(state.requests[0].status).toBe('rejected');
    await expect(fixture.approvals.consumeResume({ approval_request_id: request.approval_request_id, idempotency_key: 'resume_once_001' })).rejects.toThrow('not ready');
    expect(fixture.executions).toBe(0);
  });

  it('requires exact-purpose requester proof before withdrawing an open approval', async () => {
    const fixture = await setup();
    const request = (await fixture.approvals.requestEscalation(escalation())).requests[0];
    await expect(fixture.approvals.withdraw({ approval_request_id: request.approval_request_id, requesting_human_id: 'human_requester', human_proof_id: 'proof_requester' })).rejects.toThrow('Fresh Human Proof required');
    fixture.identities.purposeOverrides.set('human_requester', 'withdraw protected approval request');
    const state = await fixture.approvals.withdraw({ approval_request_id: request.approval_request_id, requesting_human_id: 'human_requester', human_proof_id: 'proof_requester' });
    expect(state.requests[0].status).toBe('withdrawn');
    const event = (await fixture.ledger.list()).find((item) => item.event_type === 'APPROVAL_INVALIDATED_V2');
    expect(event?.payload.status).toBe('withdrawn');
  });
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'h2a-approval-'));
  roots.push(root);
  const ledger = new LocalAuthorityEventLedger(root, 'traces/approval-test.jsonl', () => start);
  const identities = new IdentityFixture();
  const organizationService = new OrganizationAuthorityService(root, ledger, identities, () => start);
  await organizationService.initialize();
  let organization = await organizationService.bootstrap({ organization_id: 'org_hp_demo', name: 'HP Enterprise Demo', policy_version: 'policy_2026_01', human_id: 'human_admin', membership_id: 'membership_admin', human_proof_id: 'proof_admin', employee_id: 'E-100', department: 'Security', credential_expires_at: '2026-08-22T00:00:00.000Z' });
  const admin = actor(organization, 'membership_admin', 'proof_admin');
  organization = await organizationService.createRole({ actor: admin, role_id: 'role_security_approver', organization_id: 'org_hp_demo', name: 'Security Approver', description: 'Co-signs restricted data access.', authority_scopes: [{ resource: 'restricted-records', actions: ['read'], max_records: 10 }], approval_powers: ['restricted.read.approve'] });
  organization = await organizationService.createRole({ actor: admin, role_id: 'role_requester', organization_id: 'org_hp_demo', name: 'Requester', description: 'Requests restricted workflows without approval power.', authority_scopes: [{ resource: 'restricted-records', actions: ['request'] }], approval_powers: [] });
  organization = await organizationService.createRole({ actor: admin, role_id: 'role_outsider', organization_id: 'org_hp_demo', name: 'Auditor', description: 'Observes evidence but cannot approve.', authority_scopes: [{ resource: 'evidence', actions: ['read'] }], approval_powers: [] });
  for (const [membership, human, role] of [
    ['membership_requester', 'human_requester', 'role_requester'],
    ['membership_security_1', 'human_security_1', 'role_security_approver'],
    ['membership_security_2', 'human_security_2', 'role_security_approver'],
    ['membership_outsider', 'human_outsider', 'role_outsider']
  ] as const) {
    organization = await organizationService.joinMembership({ actor: admin, organization_id: 'org_hp_demo', membership_id: membership, human_id: human, employee_id: `E-${human}`, department: 'Security', manager_membership_id: 'membership_admin', role_ids: [role] });
    organization = await organizationService.issueCredential({ actor: admin, organization_id: 'org_hp_demo', membership_id: membership, role_ids: [role], resource_constraints: [], action_constraints: [], approval_policy_ids: role === 'role_security_approver' ? ['policy_restricted'] : [], expires_at: '2026-08-22T00:00:00.000Z' });
  }
  let executions = 0;
  const approvals = new MultiHumanApprovalService(root, ledger, identities, organizationService, { resume: async () => ({ execution: ++executions }) }, () => start);
  await approvals.initialize();
  await approvals.createPolicy({ actor: admin, organization_id: 'org_hp_demo', approval_policy_id: 'policy_restricted', name: 'Restricted record quorum', eligible_role_ids: ['role_security_approver'], quorum: 2, separation_of_duty: true, risk_tiers: ['restricted'], proof_purpose: purpose, decision_ttl_seconds: 300 });
  organization = await organizationService.getState();
  return { approvals, organization, organizationService, identities, ledger, get executions() { return executions; } };
}

function escalation() {
  return { organization_id: 'org_hp_demo', task_id: 'assignment_restricted_001', requesting_human_id: 'human_requester', requesting_membership_id: 'membership_requester', requesting_agent_id: 'runtime-noah', mandate_id: 'mnd_parent', required_resource: 'restricted-records', required_action: 'read', required_approval_power: 'restricted.read.approve', requested_effect_hash: digest('e'), review_context_grant_id: 'ctx_review_001', approval_policy_id: 'policy_restricted', risk_tier: 'restricted' as const, record_count: 5, idempotency_key: 'resume_once_001' };
}

function actor(state: OrganizationAuthorityState, membership: string, proofId: string) {
  return { membership_id: membership, human_proof_id: proofId, authority_credential_id: state.credentials.find((item) => item.membership_id === membership && item.status === 'active')!.credential_id };
}

class IdentityFixture implements HumanIdentityV2StatePort {
  public readonly purposeOverrides = new Map<string, string>();
  public async getState(selectedHumanId?: string): Promise<HumanIdentityV2State> {
    const people = [
      ['human_admin', 'membership_admin'], ['human_requester', 'membership_requester'],
      ['human_security_1', 'membership_security_1'], ['human_security_2', 'membership_security_2'],
      ['human_outsider', 'membership_outsider']
    ] as const;
    const selected = people.filter(([human]) => !selectedHumanId || human === selectedHumanId);
    return {
      identities: selected.map(([human, membership]) => identity(human, membership)),
      enrollments: [],
      active_proofs: selected.map(([human, membership]) => proof(`proof_${human.replace('human_', '')}`, human, membership, this.purposeOverrides.get(human) ?? (human === 'human_admin' ? 'authorize enterprise operations' : purpose))),
      selected_human_id: selectedHumanId ?? null,
      last_result: null
    };
  }
}

function identity(human: string, membership: string): HumanIdentityV2 {
  return { schema_version: 2, human_id: human, organization_id: 'org_hp_demo', display_name: human, status: 'active', active_membership_id: membership, current_enrollment_id: `enrollment_${human}`, created_at: start.toISOString(), updated_at: start.toISOString() };
}
function proof(id: string, human: string, membership: string, proofPurpose: string): HumanProofV2 {
  return { schema_version: 2, human_proof_id: id, human_id: human, organization_id: 'org_hp_demo', membership_id: membership, enrollment_id: `enrollment_${human}`, enrollment_version: 1, policy_hash: digest('a'), purpose: proofPurpose, nonce: `nonce_${human}`, assurance_level: 'high', verification_methods: ['face', 'liveness', 'distance', 'bch'], matched_record_count: 20, verified_at: start.toISOString(), expires_at: '2026-08-21T01:00:00.000Z', provider_attestation_hash: digest('b'), canonical_hash: digest('c'), organization_signature: 'ed25519:test' };
}
function digest(value: string): string { return `sha256:${value.repeat(64).slice(0, 64)}`; }
