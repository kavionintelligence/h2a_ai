import { controlPlaneCanonicalStateSchema, demoCollaborationState, demoSystemStatus, type AgentIdentityState, type AuthorityApprovalState, type CeremonyState, type ContextBrokerState, type ControlPlaneCanonicalState, type EnterpriseOverviewState, type EvidenceExplorerState, type FederationState, type FinalAcceptanceState, type GuidedBootstrapState, type MandateState, type OrganizationAuthorityState, type ScenarioState } from '@h2a/contracts';

const generatedAt = '2026-08-26T12:00:00.000Z';

export const emptyEvidenceState: EvidenceExplorerState = {
  generatedAt,
  integrity: { status: 'verified', recordCount: 0, headHash: null },
  totalEvents: 0,
  matchedEvents: 0,
  events: [],
  availableEventTypes: [],
  availableReasonCodes: [],
  controls: []
};

export const emptyAcceptanceState: FinalAcceptanceState = {
  schema_version: 2,
  generated_at: generatedAt,
  manifest: {
    schema_version: 2,
    manifest_id: 'phase34-control-plane-test',
    session_id: 'phase34-test',
    trace_prefix: 'phase34_',
    required_providers: ['claude-code', 'openai-codex', 'gemini-antigravity'],
    accepted_frameworks: ['mcp'],
    minimum_humans: 2,
    biometric_record_range: [20, 70],
    trust_ceiling: 'connected-observed',
    created_at: generatedAt
  },
  status: 'blocked',
  shared_trace_id: null,
  completion: { passed: 0, total: 11 },
  gates: ['two-human-ceremony', 'organization-authority', 'workload-identity', 'shared-provider-task', 'external-framework', 'context-minimization', 'authority-escalation', 'runtime-containment', 'adversarial-controls', 'restart-recovery', 'evidence-reconstruction'].map((gate_id) => ({ gate_id, title: gate_id.replaceAll('-', ' '), status: 'pending', summary: 'No persisted acceptance evidence is available.', evidence_refs: [] })) as FinalAcceptanceState['gates'],
  attacks: ['replay', 'forged-approval', 'over-broad-delegation', 'context-leakage', 'tamper', 'provider-failure'].map((attack_id) => ({ attack_id, status: 'not-observed', reason_codes: [], evidence_refs: [] })) as FinalAcceptanceState['attacks'],
  evidence_integrity: 'verified',
  phase44_readiness: { clean_session: false, required_liveness_mode: false, liveness_verified_human_ids: [], approval_withdrawal_evidence_ref: null, project_integration_evidence_ref: null, package_eligible: false },
  blockers: ['Run the Phase 44 operator ceremony.']
};

export const emptyAgentIdentityState: AgentIdentityState = { passports: [], passportsV2: [], bindings: [], providers: [], credentials: [], humanProofRequired: true, attestations: [], runtimeSessions: [] };
export const emptyMandateState: MandateState = { mandates: [], delegations: [], approvals: [], decisions: [], humanProofRequired: true };
export const emptyScenarioState: ScenarioState = { definitions: [], runs: [], adapters: [] };
export const emptyOrganizationState: OrganizationAuthorityState = { organizations: [], memberships: [], roles: [], credentials: [], assurance: [], decisions: [] };
export const emptyApprovalState: AuthorityApprovalState = { policies: [], requests: [], request_contexts: [], decisions: [], mandate_extensions: [], resumes: [] };
export const emptyContextBrokerState: ContextBrokerState = { artifacts: [], grants: [], disclosures: [], messages: [] };
export const emptyFederationState: FederationState = { local_node: null, invitations: [], registrations: [], acceptances: [], peers: [], receipts: [], remote_listener_enabled: false };
export const emptyRealCollaborationState: ControlPlaneCanonicalState['real_collaboration'] = {
  schema_version: 1, ceremony_id: null, trace_id: null, status: 'not-started', workspace_path: null, framework_kind: 'mcp',
  lanes: [
    ['claude-code', 'Claude control review', 'claude-code'], ['gemini-antigravity', 'Antigravity architecture review', 'gemini-antigravity'],
    ['framework', 'Conformant framework review', 'custom-cli'], ['openai-codex', 'Codex evidence consolidation', 'openai-codex']
  ].map(([lane_id, title, provider]) => ({ lane_id, title, provider, status: 'not-ready', health: 'disabled', detail: 'Not prepared.', agent_id: null, passport_id: null, binding_id: null, runtime_session_id: null, mandate_id: null, assignment_id: null, run_id: null, output_hash: null, dependency_output_hashes: [], started_at: null, completed_at: null, error: null })) as ControlPlaneCanonicalState['real_collaboration']['lanes'],
  completed_idempotency_keys: [], last_error: null, updated_at: generatedAt
};
export const emptyLeastContextState: ControlPlaneCanonicalState['least_context'] = {
  schema_version: 1, ceremony_id: null, trace_id: null, status: 'not-started', artifact_id: null, artifact_name: null,
  lanes: ['claude-code', 'gemini-antigravity', 'framework', 'openai-codex'].map((lane_id) => ({ lane_id, title: `${lane_id} disclosure`, status: 'not-ready', agent_id: null, passport_id: null, runtime_session_id: null, mandate_id: null, assignment_id: null, connector_manifest_id: null, context_grant_id: null, requested_fields: [], released_fields: [], withheld_fields: [], transformations: {}, token_budget: 120, projected_tokens: null, use_count: 0, disclosure_id: null, delivery_id: null, handoff_message_id: null, projection_hash: null, output_hash: null, execution_kind: null, provider_output_hash: null, predecessor_hashes: [], error: null })) as ControlPlaneCanonicalState['least_context']['lanes'],
  revocation: { context_grant_id: null, disclosure_id: null, reason_code: null, provider_launch_blocked: false, passed: false }, last_error: null, updated_at: generatedAt
};
export const emptyHumanEscalationState: ControlPlaneCanonicalState['human_escalation'] = { schema_version: 1, ceremony_id: null, trace_id: null, status: 'not-started', requester_human_id: null, requester_membership_id: null, approver_human_id: null, approver_membership_id: null, policy_id: null, assignment_id: null, agent_id: null, passport_id: null, binding_id: null, runtime_session_id: null, parent_mandate_id: null, review_context_grant_id: null, requested_effect_hash: null, approval_request_id: null, run_id: null, output_hash: null, rejection_request_id: null, completed_idempotency_keys: [], last_error: null, updated_at: generatedAt };
export const emptyFederationOperatorState: ControlPlaneCanonicalState['federation_operator'] = { schema_version: 1, ceremony_id: null, trace_id: null, listener: { status: 'stopped', endpoint: null, last_error: null }, last_outbound: null, last_received_task: null, replay_proof: null, revocation_proof: null, updated_at: generatedAt };
export const emptyRuntimeAttachmentState: ControlPlaneCanonicalState['runtime_attachment'] = { transports: [{ kind: 'structured-cli', available: true, detail: 'Structured CLI ready.' }, { kind: 'framework-stdio', available: true, detail: 'Framework stdio ready.' }, { kind: 'interactive-pty', available: false, detail: 'Interactive PTY unavailable in fixture.' }], sessions: [], leases: [], events: [], trust_ceiling: 'connected-observed' };
export const emptyEnterpriseState: EnterpriseOverviewState = { schema_version: 2, generated_at: '2026-08-26T12:00:00.000Z', posture: { organizations: 0, active_humans: 0, active_credentials: 0, active_agents: 0, active_context_grants: 0, pending_approvals: 0, active_federation_peers: 0, healthy_connectors: 0, live_processes: 0, trust_modes: { unverified: 0, 'connected-observed': 0, governed: 0, 'external-attested': 0 }, evidence_integrity: 'verified', evidence_records: 0 }, nodes: [], edges: [], traces: [], replacement_seams: [], claims: [] };
export const emptyCeremonyState: CeremonyState = { schema_version: 1, active_ceremony_id: null, sessions: [] };
export const emptyBootstrapStateForTest: GuidedBootstrapState = {
  schema_version: 1, ceremony_id: null, trace_id: null, status: 'not-started', administrator_human_id: null, operator_human_id: null,
  cross_person_test_status: 'pending', humans: [], organization_id: null, operator_role_id: null, approver_role_id: null,
  operator_credential_id: null, approver_credential_id: null,
  participants: [
    ['openai-codex', 'H2A Codex Coordinator', 'openai-codex'], ['claude-code', 'H2A Claude Control Reviewer', 'claude-code'],
    ['gemini-antigravity', 'H2A Antigravity Architecture Reviewer', 'gemini-antigravity'], ['framework', 'H2A Framework Interop Agent', 'custom-cli']
  ].map(([lane, name, provider]) => ({ lane, name, provider, agent_id: null, binding_id: null, passport_id: null, runtime_session_id: null, status: 'missing', blocker: 'Participant has not been created.' })) as GuidedBootstrapState['participants'],
  root_mandate_id: null, child_mandate_ids: [], assignment_ids: [],
  steps: [
    ['human-readiness', 'Human readiness'], ['organization-authority', 'Organization authority'], ['workload-identity', 'Workload identity'], ['mandates-and-tasks', 'Mandates and tasks'], ['restart-recovery', 'Restart recovery']
  ].map(([step_id, title], index) => ({ step_id, title, status: index === 0 ? 'user-action-required' : 'not-ready', blocker: index === 0 ? 'Select and freshly verify two enrolled humans.' : 'Complete the preceding step.', evidence_refs: [] })) as GuidedBootstrapState['steps'],
  completed_idempotency_keys: [], last_error: null, updated_at: '2026-08-26T12:00:00.000Z'
};

export function phase34CanonicalState(): ControlPlaneCanonicalState {
  return controlPlaneCanonicalStateSchema.parse({
    system: demoSystemStatus,
    collaboration: demoCollaborationState,
    agent_identity: emptyAgentIdentityState,
    mandates: emptyMandateState,
    organization: emptyOrganizationState,
    approvals: emptyApprovalState,
    scenarios: emptyScenarioState,
    evidence: emptyEvidenceState,
    context_broker: emptyContextBrokerState,
    federation: emptyFederationState,
    enterprise: emptyEnterpriseState,
    final_acceptance: emptyAcceptanceState,
    ceremony: emptyCeremonyState,
    guided_bootstrap: emptyBootstrapStateForTest,
    project_delivery: { projects: [], goals: [], assignments: [], worktrees: [], sources: [], messages: [], validations: [], runs: [], review_bundles: [], integrations: [], trust_ceiling: 'connected-observed' },
    real_collaboration: emptyRealCollaborationState,
    least_context: emptyLeastContextState,
    human_escalation: emptyHumanEscalationState,
    federation_operator: emptyFederationOperatorState,
    runtime_attachment: emptyRuntimeAttachmentState
  });
}
