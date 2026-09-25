import type {
  AgentIdentityState, AuthorityApprovalState, CollaborationState, ContextBrokerState,
  CeremonyState, EnterpriseOverviewState, EvidenceExplorerState, FederationState, FinalAcceptanceState, GuidedBootstrapState,
  MandateState, OrganizationAuthorityState, ScenarioState, SystemStatus, AppearancePreferences, OfficeState
} from '@h2a/contracts';
import { CURRENT_SCHEMA_VERSION } from '@h2a/contracts';
import { providerCatalogue } from '@h2a/provider-catalogue';

export const emptySystemStatus: SystemStatus = {
  appVersion: '0.1.0', storageMode: 'local-file', agentMode: 'scripted-workplace',
  humanProofMode: 'local-face-bch', livenessMode: 'demo-bypass', resourceMode: 'sandbox', evidenceIntegrity: 'verified',
  evidenceRecords: 0, evidenceHeadHash: null, schemaVersion: CURRENT_SCHEMA_VERSION, dataPath: 'Loading local workspace'
};

export const emptyAppearancePreferences: AppearancePreferences = {
  schema_version: 1,
  presentation_mode: 'office',
  reduced_motion: false,
  camera_position: { x: 0, y: 0 },
  zoom: 1,
  inspector_width: 360,
  selected_workflow_id: 'set-up-people',
  updated_at: new Date(0).toISOString()
};

export const emptyOfficeState: OfficeState = {
  schema_version: 2,
  generated_at: new Date(0).toISOString(),
  runtime_mode: 'scripted-rehearsal',
  trust_ceiling: 'unverified',
  evidence_integrity: 'verified',
  counts: { humans: 0, agents: 0, assignments: 0, pending_approvals: 0, active_context_grants: 0, active_federation_peers: 0 },
  selected_agent_id: null,
  active_trace_id: null,
  acceptance: { status: 'blocked', passed: 0, total: 0 },
  workflow: {
    schema_version: 1,
    selected_workflow_id: 'set-up-people',
    workflows: [],
    next_action: null,
    active_step: null,
    generated_at: new Date(0).toISOString()
  },
  collaboration: { signals: [], portals: [] },
  entities: [],
  alerts: { total: 0, blocking: 0 }
};

export const emptyCollaborationState: CollaborationState = {
  workplace: { generatedAt: new Date(0).toISOString(), agents: [], assignments: [], events: [] },
  messages: [], responses: [], activity: []
};
export const emptyAgentIdentityState: AgentIdentityState = { passports: [], passportsV2: [], bindings: [], providers: providerCatalogue, credentials: [], humanProofRequired: true, attestations: [], runtimeSessions: [] };
export const emptyMandateState: MandateState = { mandates: [], delegations: [], approvals: [], decisions: [], humanProofRequired: true };
export const emptyScenarioState: ScenarioState = { definitions: [], runs: [], adapters: [] };
export const emptyOrganizationState: OrganizationAuthorityState = { organizations: [], memberships: [], roles: [], credentials: [], assurance: [], decisions: [] };
export const emptyApprovalState: AuthorityApprovalState = { policies: [], requests: [], request_contexts: [], decisions: [], mandate_extensions: [], resumes: [] };
export const emptyContextBrokerState: ContextBrokerState = { artifacts: [], grants: [], disclosures: [], messages: [] };
export const emptyFederationState: FederationState = { local_node: null, invitations: [], registrations: [], acceptances: [], peers: [], receipts: [], remote_listener_enabled: false };
export const emptyEvidenceState: EvidenceExplorerState = { generatedAt: new Date(0).toISOString(), integrity: { status: 'verified', recordCount: 0, headHash: null }, totalEvents: 0, matchedEvents: 0, events: [], availableEventTypes: [], availableReasonCodes: [], controls: [] };
export const emptyEnterpriseState: EnterpriseOverviewState = { schema_version: 2, generated_at: new Date(0).toISOString(), posture: { organizations: 0, active_humans: 0, active_credentials: 0, active_agents: 0, active_context_grants: 0, pending_approvals: 0, active_federation_peers: 0, healthy_connectors: 0, live_processes: 0, trust_modes: { unverified: 0, 'connected-observed': 0, governed: 0, 'external-attested': 0 }, evidence_integrity: 'verified', evidence_records: 0 }, nodes: [], edges: [], traces: [], replacement_seams: [], claims: [] };
export const emptyAcceptanceState: FinalAcceptanceState = {
  schema_version: 2, generated_at: new Date(0).toISOString(),
  manifest: { schema_version: 2, manifest_id: 'phase22-hp-cto-ciso', session_id: 'uninitialized', trace_prefix: 'phase22_', required_providers: ['claude-code', 'openai-codex', 'gemini-antigravity'], accepted_frameworks: ['mcp'], minimum_humans: 2, biometric_record_range: [20, 70], trust_ceiling: 'connected-observed', created_at: new Date(0).toISOString() },
  status: 'blocked', shared_trace_id: null, completion: { passed: 0, total: 11 }, gates: [], attacks: [], evidence_integrity: 'verified',
  phase44_readiness: { clean_session: false, required_liveness_mode: false, liveness_verified_human_ids: [], approval_withdrawal_evidence_ref: null, project_integration_evidence_ref: null, package_eligible: false },
  blockers: ['Local acceptance state has not loaded.']
};
export const emptyCeremonyState: CeremonyState = { schema_version: 1, active_ceremony_id: null, sessions: [] };
export const emptyGuidedBootstrapState: GuidedBootstrapState = {
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
  completed_idempotency_keys: [], last_error: null, updated_at: new Date(0).toISOString()
};

export type WorkspaceStateTuple = [SystemStatus, CollaborationState, AgentIdentityState, MandateState, OrganizationAuthorityState, AuthorityApprovalState, ScenarioState, EvidenceExplorerState, ContextBrokerState, FederationState];
export const emptyWorkspaceState = (): WorkspaceStateTuple => [emptySystemStatus, emptyCollaborationState, emptyAgentIdentityState, emptyMandateState, emptyOrganizationState, emptyApprovalState, emptyScenarioState, emptyEvidenceState, emptyContextBrokerState, emptyFederationState];
