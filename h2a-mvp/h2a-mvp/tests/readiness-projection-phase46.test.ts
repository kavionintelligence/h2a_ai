import { describe, expect, it } from 'vitest';
import type { ControlPlaneCanonicalState, OperatorPrerequisiteKind } from '@h2a/contracts';
import { ReadinessProjectionService } from '@h2a/operator-experience';
import { primaryReadinessPrerequisite } from '../apps/desktop/renderer/src/components/readinessPresentation';
import { phase34CanonicalState } from './fixtures/phase34-state';

const now = new Date('2026-09-01T12:00:00.000Z');
const service = new ReadinessProjectionService();

describe('Phase 46 canonical readiness projection', () => {
  it('honors expiry, exact boundary, clock skew, and stale-proof states', () => {
    expect(statuses(fixture(at(601))).get('authority-credential')).toBe('ready');
    expect(statuses(fixture(at(600))).get('authority-credential')).toBe('expiring');
    expect(statuses(fixture(at(-29))).get('runtime-attestation')).toBe('expiring');
    expect(statuses(fixture(at(-31))).get('mandate')).toBe('expired');

    const stale = fixture(at(3_600));
    (stale.guided_bootstrap.humans[0]! as unknown as { proof_status: string }).proof_status = 'stale';
    expect(statuses(stale).get('human-proof')).toBe('expired');
  });

  it('treats a known employee without a current proof as one grouped repair challenge', () => {
    const canonical = fixture(at(3_600));
    canonical.guided_bootstrap.humans[0] = {
      ...canonical.guided_bootstrap.humans[0]!,
      proof_id: null,
      proof_expires_at: null,
      proof_status: 'missing'
    };
    const command = commandFor(canonical, 'phase26.claude-code.run');
    const proof = command.prerequisites.find((item) => item.kind === 'human-proof')!;
    expect(command.status).toBe('repairable');
    expect(proof).toMatchObject({
      status: 'expired',
      reason_code: 'HUMAN_PROOF_EXPIRED',
      bound_human_id: 'human_admin',
      remediation: { kind: 'automatic-after-proof', label: 'Repair exact scope' }
    });
    const plan = service.plan(command, now)!;
    expect(plan.grouped_proof_purposes).toEqual([
      expect.objectContaining({ human_id: 'human_admin', purpose: 'repair prerequisites for Claude control review' })
    ]);
    expect(plan.operations[0]?.kind).toBe('refresh-human-proof');
  });

  it('surfaces immutable revoked authority before a repairable proof and routes to its owner', () => {
    const canonical = fixture(at(3_600));
    canonical.guided_bootstrap.humans[0] = { ...canonical.guided_bootstrap.humans[0]!, proof_id: null, proof_expires_at: null, proof_status: 'missing' };
    canonical.organization.credentials[0] = { ...canonical.organization.credentials[0]!, status: 'revoked' };
    const command = commandFor(canonical, 'phase26.claude-code.run');
    expect(command.status).toBe('blocked');
    expect(primaryReadinessPrerequisite(command)).toMatchObject({
      kind: 'authority-credential',
      status: 'revoked',
      reason_code: 'AUTHORITY_CREDENTIAL_REVOKED',
      remediation: { kind: 'operator-action', label: 'Create an authorized replacement', route: 'people-authority' }
    });
  });

  it('prefers the newest repairable expired authority over an older revoked record', () => {
    const canonical = fixture(at(3_600));
    const revoked = { ...canonical.organization.credentials[0]!, status: 'revoked' as const };
    const expired = {
      ...canonical.organization.credentials[0]!,
      credential_id: 'credential_repairable',
      issued_at: at(-3_600),
      expires_at: at(-31),
      status: 'expired' as const
    };
    canonical.organization.credentials = [revoked, expired];
    canonical.guided_bootstrap.humans[0] = { ...canonical.guided_bootstrap.humans[0]!, proof_id: null, proof_expires_at: null, proof_status: 'missing' };
    canonical.real_collaboration.lanes[0] = { ...canonical.real_collaboration.lanes[0]!, mandate_id: 'missing_mandate', assignment_id: 'missing_assignment' };

    const command = commandFor(canonical, 'phase26.claude-code.run');
    expect(command.status).toBe('partial-repair');
    expect(command.prerequisites.find((item) => item.kind === 'authority-credential')).toMatchObject({
      canonical_reference_id: 'credential_repairable',
      status: 'expired'
    });
    expect(primaryReadinessPrerequisite(command)).toMatchObject({ kind: 'human-proof', status: 'expired' });
    expect(service.plan(command, now)?.operations.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'refresh-human-proof', 'replace-authority-credential', 'replace-mandate', 'rebind-assignment'
    ]));
  });

  it('builds one exact-purpose proof group and orders dependent replacements without scope broadening', () => {
    const canonical = fixture(at(3_600));
    canonical.organization.credentials[0]!.expires_at = at(-31);
    canonical.agent_identity.attestations![0]!.expires_at = at(-31);
    canonical.mandates.mandates[0]!.expiresAt = at(-31);
    canonical.context_broker.grants[0]!.grant.expires_at = at(-31);
    const command = commandFor(canonical, 'phase27.claude-code.run');
    expect(command.status).toBe('repairable');
    const plan = service.plan(command, now)!;

    expect(plan.status).toBe('operator-required');
    expect(plan.grouped_proof_purposes).toEqual([expect.objectContaining({ human_id: 'human_admin', purpose: 'repair prerequisites for Claude bounded handoff' })]);
    expect(plan.grouped_proof_purposes[0]!.operation_ids).toHaveLength(plan.operations.length);
    expect(plan.operations.map((item) => item.kind)).toEqual([
      'refresh-human-proof', 'replace-authority-credential', 'rotate-runtime-session', 'replace-runtime-attestation',
      'replace-mandate', 'rebind-assignment', 'renew-context-grant'
    ]);

    const byKind = new Map(plan.operations.map((item) => [item.kind, item]));
    expect(byKind.get('replace-runtime-attestation')!.dependency_ids).toContain(byKind.get('rotate-runtime-session')!.operation_id);
    expect(byKind.get('rebind-assignment')!.dependency_ids).toContain(byKind.get('replace-mandate')!.operation_id);
    expect(byKind.get('renew-context-grant')!.dependency_ids).toContain(byKind.get('rebind-assignment')!.operation_id);
    for (const operation of plan.operations) {
      const source = command.prerequisites.find((item) => item.canonical_reference_id === operation.target_reference_id);
      expect(operation.replacement_reference_id).toBeNull();
      expect(operation.replacement_for_id).toBeNull();
      expect(operation.exact_scope_hash).toBe(source?.scope_hash);
      expect(operation.exact_scope).toEqual(source?.scope);
    }
  });

  it('keeps provider login and independent approval external while allowing eligible partial repair', () => {
    const canonical = fixture(at(3_600));
    canonical.organization.credentials[0]!.expires_at = at(-31);
    canonical.real_collaboration.lanes[0]!.health = 'authentication-required';
    canonical.real_collaboration.lanes[0]!.detail = 'Official provider login is required.';
    const command = commandFor(canonical, 'phase26.claude-code.run');
    expect(command.status).toBe('partial-repair');
    const plan = service.plan(command, now)!;
    expect(plan.status).toBe('partial');
    expect(plan.operations.find((item) => item.kind === 'authenticate-provider')?.status).toBe('external-action-required');
    expect(plan.operations.find((item) => item.kind === 'replace-authority-credential')?.status).toBe('operator-required');

    canonical.approvals.policies = [{ approval_policy_id: 'policy_1', status: 'active', quorum: 1, eligible_role_ids: ['role_approver'] }] as ControlPlaneCanonicalState['approvals']['policies'];
    canonical.approvals.requests = [{ approval_request_id: 'approval_1', status: 'pending', expires_at: at(600), required_resource: 'findings', required_action: 'publish', approval_policy_id: 'policy_1' }] as ControlPlaneCanonicalState['approvals']['requests'];
    const approval = commandFor(canonical, 'phase28.resume-once');
    expect(approval.status).toBe('external-action-required');
    expect(service.plan(approval, now)?.operations[0]?.kind).toBe('obtain-independent-approval');
  });

  it('fails closed for disconnected control planes and revoked peers, without mutating the revoked record', () => {
    const canonical = fixture(at(3_600));
    canonical.federation.peers = [{ peer_id: 'peer_revoked', status: 'revoked', expires_at: at(3_600), capabilities: ['task.receive'], maximum_context_fields: 3 }] as ControlPlaneCanonicalState['federation']['peers'];
    const before = structuredClone(canonical.federation.peers[0]);
    const federation = commandFor(canonical, 'phase29.send-task');
    expect(federation.status).toBe('blocked');
    expect(federation.prerequisites.find((item) => item.kind === 'federation-peer')?.status).toBe('revoked');
    expect(service.plan(federation, now)?.status).toBe('blocked');
    expect(canonical.federation.peers[0]).toEqual(before);

    const disconnected = service.project({ canonical, connection: { status: 'disconnected', read_only: true }, now });
    expect(disconnected.commands.every((item) => item.status === 'blocked')).toBe(true);
    expect(disconnected.commands.every((item) => item.prerequisites[0]?.status === 'disconnected-read-only')).toBe(true);
  });

  it('reconstructs identical generation hashes after restart and changes them for canonical repairs', () => {
    const canonical = fixture(at(-31));
    const first = service.project({ canonical, connection: connected(), now });
    const restarted = service.project({ canonical: structuredClone(canonical), connection: connected(), now });
    expect(restarted.commands.map((item) => item.generation_hash)).toEqual(first.commands.map((item) => item.generation_hash));

    canonical.organization.credentials[0]!.expires_at = at(3_600);
    const repaired = service.project({ canonical, connection: connected(), now });
    expect(commandFrom(first, 'phase26.claude-code.run').generation_hash).not.toBe(commandFrom(repaired, 'phase26.claude-code.run').generation_hash);
  });
});

function fixture(expiresAt: string): ControlPlaneCanonicalState {
  const canonical = structuredClone(phase34CanonicalState());
  canonical.guided_bootstrap.humans = [{ human_id: 'human_admin', display_name: 'Varun', proof_id: 'proof_admin', proof_status: 'fresh', proof_expires_at: expiresAt, token_count: 20, required_token_count: 1, model_hash: `sha256:${'1'.repeat(64)}`, role_label: 'Administrator' }] as unknown as ControlPlaneCanonicalState['guided_bootstrap']['humans'];
  canonical.organization.memberships = [{ membership_id: 'membership_admin', organization_id: 'org_hp_demo', human_id: 'human_admin', status: 'active', effective_until: expiresAt }] as ControlPlaneCanonicalState['organization']['memberships'];
  canonical.organization.credentials = [{ credential_id: 'credential_admin', membership_id: 'membership_admin', status: 'active', issued_at: at(-3_600), expires_at: expiresAt, role_ids: ['role_admin'], resource_constraints: ['repository'], action_constraints: ['review'], approval_policy_ids: ['policy_1'] }] as ControlPlaneCanonicalState['organization']['credentials'];
  canonical.agent_identity.passportsV2 = [{ passport_id: 'passport_claude', agent_id: 'agent_claude', name: 'Claude', sponsor_human_id: 'human_admin', connector_manifest_id: 'connector_claude-code_v1', status: 'active', issued_at: at(-3_600), expires_at: expiresAt, capabilities: ['review'] }] as NonNullable<ControlPlaneCanonicalState['agent_identity']['passportsV2']>;
  canonical.agent_identity.runtimeSessions = [{ runtime_session_id: 'session_claude', runtime_attestation_id: 'attestation_claude', passport_id: 'passport_claude', state: 'ready', trust_mode: 'connected-observed' }] as NonNullable<ControlPlaneCanonicalState['agent_identity']['runtimeSessions']>;
  canonical.agent_identity.attestations = [{ attestation_id: 'attestation_claude', issued_at: at(-3_600), expires_at: expiresAt, trust_mode: 'connected-observed', adapter_version: '1.0.0', trust_evidence_refs: [] }] as unknown as NonNullable<ControlPlaneCanonicalState['agent_identity']['attestations']>;
  canonical.mandates.mandates = [{ mandateId: 'mandate_claude', status: 'active', issuedAt: at(-3_600), expiresAt, resources: ['repository'], actions: ['review'], disclosure: { allowedFields: ['case_id'] }, approvals: { requiredActions: ['publish'] }, subject: { agentId: 'agent_claude', passportId: 'passport_claude' } }] as ControlPlaneCanonicalState['mandates']['mandates'];
  canonical.collaboration.workplace.assignments = [{ id: 'assignment_claude', assigneeId: 'binding_claude', mandateId: 'mandate_claude', status: 'queued', requestedAction: 'review', objective: 'Review the control evidence.' }] as ControlPlaneCanonicalState['collaboration']['workplace']['assignments'];
  canonical.real_collaboration.lanes[0] = { ...canonical.real_collaboration.lanes[0]!, status: 'ready', health: 'ready', detail: 'Official provider is ready.', agent_id: 'agent_claude', passport_id: 'passport_claude', binding_id: 'binding_claude', runtime_session_id: 'session_claude', mandate_id: 'mandate_claude', assignment_id: 'assignment_claude' };
  canonical.least_context.lanes[0] = { ...canonical.least_context.lanes[0]!, title: 'Claude bounded disclosure', status: 'ready', agent_id: 'agent_claude', passport_id: 'passport_claude', runtime_session_id: 'session_claude', mandate_id: 'mandate_claude', assignment_id: 'assignment_claude', context_grant_id: 'grant_claude' };
  canonical.context_broker.grants = [{ status: 'active', use_count: 0, maximum_uses: 2, field_rules: [], grant: { context_grant_id: 'grant_claude', issued_at: at(-3_600), expires_at: expiresAt, allowed_fields: ['case_id'], token_budget: 120 } }] as unknown as ControlPlaneCanonicalState['context_broker']['grants'];
  return canonical;
}

function commandFor(canonical: ControlPlaneCanonicalState, id: string) {
  return commandFrom(service.project({ canonical, connection: connected(), now }), id);
}
function commandFrom(state: ReturnType<ReadinessProjectionService['project']>, id: string) { return state.commands.find((item) => item.command_id === id)!; }
function statuses(canonical: ControlPlaneCanonicalState) { return new Map(commandFor(canonical, 'phase26.claude-code.run').prerequisites.map((item) => [item.kind as OperatorPrerequisiteKind, item.status])); }
function connected() { return { status: 'connected' as const, read_only: false }; }
function at(seconds: number) { return new Date(now.getTime() + seconds * 1_000).toISOString(); }
