import { describe, expect, it } from 'vitest';
import type { GuidedBootstrapState, OrganizationAuthorityState } from '@h2a/contracts';
import { challengeFailureMessage, remainingChallengeSeconds, resolveHumanProofSubject } from '../apps/desktop/renderer/src/components/humanProofChallenge';

describe('Phase 47 identity-explicit Human Proof ceremony', () => {
  it('resolves the exact employee, organization, department, and authority roles', () => {
    const subject = resolveHumanProofSubject('human_employee_001', bootstrap(), organization());
    expect(subject).toEqual({
      humanId: 'human_employee_001',
      displayName: 'Varun',
      employeeId: 'H2A-ADMIN-01',
      organizationName: 'HP Enterprise Demo',
      department: 'Enterprise Security',
      roleNames: ['Authority Administrator'],
      enrollmentRequired: false
    });
  });

  it('states the clean-session enrollment prerequisite without inferring an identity', () => {
    const subject = resolveHumanProofSubject('human_unenrolled', { ...bootstrap(), humans: [] }, organization());
    expect(subject).toMatchObject({ displayName: 'human_unenrolled', employeeId: null, roleNames: [], enrollmentRequired: true });
  });

  it('turns stale, expired, wrong-human, route, and disconnect failures into actionable fail-closed guidance', () => {
    expect(challengeFailureMessage(new Error('HUMAN_PROOF_CHALLENGE_EXPIRED'), 'Varun')).toContain('expired');
    expect(challengeFailureMessage(new Error('HUMAN_PROOF_STALE'), 'Varun')).toContain('predates');
    expect(challengeFailureMessage(new Error('HUMAN_PROOF_BINDING_MISMATCH'), 'Varun')).toContain('does not match Varun');
    expect(challengeFailureMessage(new Error('HUMAN_PROOF_SOURCE_BINDING_MISMATCH'), 'Varun')).toContain('command changed');
    expect(challengeFailureMessage(new Error('CONTROL_PLANE_DISCONNECTED_READ_ONLY'), 'Varun')).toContain('no protected command was continued');
  });

  it('never exposes a negative challenge countdown', () => {
    expect(remainingChallengeSeconds('2026-09-01T10:01:00.000Z', Date.parse('2026-09-01T10:00:30.100Z'))).toBe(30);
    expect(remainingChallengeSeconds('2026-09-01T10:00:00.000Z', Date.parse('2026-09-01T10:00:01.000Z'))).toBe(0);
  });
});

function bootstrap(): GuidedBootstrapState {
  return {
    schema_version: 1, ceremony_id: 'ceremony_phase47', trace_id: 'phase22_phase47', status: 'ready',
    administrator_human_id: 'human_employee_001', operator_human_id: 'human_employee_002', cross_person_test_status: 'passed',
    humans: [{ human_id: 'human_employee_001', display_name: 'Varun', membership_id: 'membership_employee_001', enrollment_id: 'enrollment_001', token_set_size: 20, required_matches: 1, model_set_hash: `sha256:${'1'.repeat(64)}`, proof_id: null, proof_expires_at: null, proof_status: 'missing', assurance_level: null }],
    organization_id: 'org_hp_demo', operator_role_id: null, approver_role_id: 'role_authority_admin', operator_credential_id: null, approver_credential_id: null,
    participants: ['openai-codex', 'claude-code', 'gemini-antigravity', 'framework'].map((lane) => ({ lane: lane as 'openai-codex', name: lane, provider: lane, agent_id: null, binding_id: null, passport_id: null, runtime_session_id: null, status: 'missing' as const, blocker: 'Not configured' })),
    root_mandate_id: null, child_mandate_ids: [], assignment_ids: [],
    steps: [
      ['human-readiness', 'Human readiness'], ['organization-authority', 'Organization authority'], ['workload-identity', 'Workload identity'], ['mandates-and-tasks', 'Mandates and tasks'], ['restart-recovery', 'Restart recovery']
    ].map(([step_id, title]) => ({ step_id: step_id as 'human-readiness', title, status: 'not-ready' as const, blocker: 'Not ready', evidence_refs: [] })),
    completed_idempotency_keys: [], last_error: null, updated_at: '2026-09-01T10:00:00.000Z'
  };
}

function organization(): OrganizationAuthorityState {
  return {
    organizations: [{ schema_version: 2, organization_id: 'org_hp_demo', name: 'HP Enterprise Demo', policy_version: 'policy_2026_01', signing_root_key_id: 'key_root', status: 'active', created_at: '2026-09-01T09:00:00.000Z', updated_at: '2026-09-01T09:00:00.000Z' }],
    memberships: [{ schema_version: 2, membership_id: 'membership_employee_001', organization_id: 'org_hp_demo', human_id: 'human_employee_001', employee_id: 'H2A-ADMIN-01', department: 'Enterprise Security', role_ids: ['role_authority_admin'], status: 'active', effective_from: '2026-09-01T09:00:00.000Z', updated_at: '2026-09-01T09:00:00.000Z' }],
    roles: [{ schema_version: 2, role_id: 'role_authority_admin', organization_id: 'org_hp_demo', name: 'Authority Administrator', description: 'Administers protected authority.', authority_scopes: [{ resource: 'authority', actions: ['administer'] }], approval_powers: ['findings.approve'], status: 'active', updated_at: '2026-09-01T09:00:00.000Z' }],
    credentials: [], assurance: [], decisions: []
  };
}
