import type { AgentIdentityState, AuthorityApprovalState, CollaborationState, ContextBrokerState, EnterpriseOverviewState, EvidenceExplorerState, FederationState, FinalAcceptanceState, MandateState, OrganizationAuthorityState, ScenarioState, SystemStatus } from '@h2a/contracts';
import { demoCollaborationState, demoSystemStatus } from '@h2a/contracts';
import { providerCatalogue } from '@h2a/provider-catalogue';

export { demoCollaborationState, demoSystemStatus };
export const previewAgentIdentityState: AgentIdentityState = { passports: [], passportsV2: [], bindings: [], providers: providerCatalogue, credentials: [], humanProofRequired: true, attestations: [], runtimeSessions: [] };

export const emptyMandateState: MandateState = { mandates: [], delegations: [], approvals: [], decisions: [], humanProofRequired: true };
export const emptyScenarioState: ScenarioState = { definitions: [], runs: [], adapters: [] };
export const emptyOrganizationState: OrganizationAuthorityState = { organizations: [], memberships: [], roles: [], credentials: [], assurance: [], decisions: [] };
export const emptyApprovalState: AuthorityApprovalState = { policies: [], requests: [], request_contexts: [], decisions: [], mandate_extensions: [], resumes: [] };
export const emptyContextBrokerState: ContextBrokerState = { artifacts: [], grants: [], disclosures: [], messages: [] };
export const emptyFederationState: FederationState = { local_node: null, invitations: [], registrations: [], acceptances: [], peers: [], receipts: [], remote_listener_enabled: false };
export const emptyEnterpriseState: EnterpriseOverviewState = { schema_version: 2, generated_at: new Date().toISOString(), posture: { organizations: 0, active_humans: 0, active_credentials: 0, active_agents: 0, active_context_grants: 0, pending_approvals: 0, active_federation_peers: 0, healthy_connectors: 0, live_processes: 0, trust_modes: { unverified: 0, 'connected-observed': 0, governed: 0, 'external-attested': 0 }, evidence_integrity: 'verified', evidence_records: 0 }, nodes: [], edges: [], traces: [], replacement_seams: [], claims: [] };
export const federationPreviewHash = `sha256:${'f'.repeat(64)}` as const;
export const federationPreviewNode: NonNullable<FederationState['local_node']> = { schema_version: 2, node_id: 'node_hp_command', organization_id: 'org_hp_demo', display_name: 'HP Command Node', public_key_pem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAPREVIEWPUBLICKEYMATERIAL00000000000000=\n-----END PUBLIC KEY-----', key_fingerprint: federationPreviewHash, endpoint: 'http://127.0.0.1:43120/h2a/federation/v2/envelopes', endpoint_policy: 'loopback-only', capabilities: ['task.receive', 'context.receive', 'message.receive', 'heartbeat', 'ack', 'revocation'], status: 'active', created_at: '2026-08-21T12:00:00.000Z', updated_at: '2026-08-21T12:00:00.000Z', canonical_hash: federationPreviewHash, node_signature: 'ed25519:cHJldmlldw==' };
export const federationFriendNode: NonNullable<FederationState['local_node']> = { ...federationPreviewNode, node_id: 'node_friend_security', organization_id: 'org_friend', display_name: 'Friend Security Node', key_fingerprint: `sha256:${'e'.repeat(64)}`, endpoint: 'http://127.0.0.1:43121/h2a/federation/v2/envelopes', canonical_hash: `sha256:${'d'.repeat(64)}` };
export const federationPreviewState: FederationState = { local_node: federationPreviewNode, invitations: [], registrations: [], acceptances: [], peers: [{ schema_version: 2, peer_id: 'peer_friend_security', invitation_id: 'invite_friend_security', local_node_id: federationPreviewNode.node_id, remote_node: federationFriendNode, pinned_key_fingerprint: federationFriendNode.key_fingerprint, capabilities: ['task.receive', 'context.receive', 'heartbeat', 'ack', 'revocation'], maximum_context_fields: 3, status: 'active', outbound_sequence: 4, inbound_sequence: 3, last_heartbeat_at: '2026-08-21T12:08:00.000Z', accepted_at: '2026-08-21T12:01:00.000Z', expires_at: '2026-08-22T12:01:00.000Z', updated_at: '2026-08-21T12:08:00.000Z' }], receipts: [{ receipt_id: 'receipt_preview_task', envelope_id: 'envelope_preview_task', peer_id: 'peer_friend_security', sender_node_id: federationFriendNode.node_id, recipient_node_id: federationPreviewNode.node_id, payload_type: 'task', payload_hash: federationPreviewHash, trace_id: 'trace_supplier_review', task_id: 'task_supplier_review', sequence: 3, nonce: 'nonce_preview_task', decision: 'accepted', reason_code: 'FEDERATION_ENVELOPE_ACCEPTED', received_at: '2026-08-21T12:07:00.000Z' }], remote_listener_enabled: false };
export const enterpriseOutputHash = `sha256:${'b'.repeat(64)}` as const;
export const enterprisePreviewState: EnterpriseOverviewState = {
  schema_version: 2, generated_at: '2026-08-21T13:00:00.000Z',
  posture: { organizations: 1, active_humans: 2, active_credentials: 2, active_agents: 3, active_context_grants: 1, pending_approvals: 1, active_federation_peers: 1, healthy_connectors: 3, live_processes: 1, trust_modes: { unverified: 0, 'connected-observed': 3, governed: 0, 'external-attested': 0 }, evidence_integrity: 'verified', evidence_records: 148 },
  nodes: [
    { node_id: 'organization:org_hp_demo', kind: 'organization', label: 'HP Enterprise Demo', detail: 'Policy policy_2026_01', status: 'active', organization_id: 'org_hp_demo', evidence_refs: [] },
    { node_id: 'human:human_admin', kind: 'human', label: 'Varun', detail: 'membership_admin', status: 'active', organization_id: 'org_hp_demo', evidence_refs: ['evt_human_verified'] },
    { node_id: 'membership:membership_admin', kind: 'membership', label: 'E-100', detail: 'Enterprise Security / Authority Administrator', status: 'active', organization_id: 'org_hp_demo', evidence_refs: ['evt_authority'] },
    { node_id: 'authority-credential:hac_admin', kind: 'authority-credential', label: 'Administrator credential', detail: 'role_authority_admin', status: 'active', organization_id: 'org_hp_demo', evidence_refs: ['evt_authority'] },
    { node_id: 'agent:runtime-noah', kind: 'agent', label: 'Noah', detail: 'Security analyst / claude-code', status: 'working', evidence_refs: ['evt_task'] },
    { node_id: 'passport:passport-noah-v2', kind: 'passport', label: 'Noah', detail: 'Security analyst / restricted', status: 'active', organization_id: 'org_hp_demo', evidence_refs: ['evt_passport'] },
    { node_id: 'runtime:session-noah', kind: 'runtime', label: 'Claude session', detail: 'connector_claude / attestation_noah', status: 'working', trust_mode: 'connected-observed', evidence_refs: ['evt_runtime'] },
    { node_id: 'connector:connector_claude', kind: 'connector', label: 'Claude Code', detail: 'local-cli / none', status: 'ready', trust_mode: 'connected-observed', evidence_refs: ['evt_connector'] },
    { node_id: 'mandate:mnd_security_review', kind: 'mandate', label: 'Review supplier controls', detail: 'runtime-noah / depth 0', status: 'active', evidence_refs: ['evt_mandate'] },
    { node_id: 'context-grant:ctx_supplier_review', kind: 'context-grant', label: 'Review supplier risk', detail: '2 fields / runtime-noah', status: 'active', organization_id: 'org_hp_demo', evidence_refs: ['evt_context'] },
    { node_id: 'approval:apr_preview_restricted', kind: 'approval', label: 'restricted-records:read', detail: '1 eligible / policy_restricted', status: 'pending', organization_id: 'org_hp_demo', evidence_refs: ['evt_approval'] },
    { node_id: 'federation-node:node_friend_security', kind: 'federation-node', label: 'Friend Security Node', detail: '5 capabilities / 3 fields', status: 'active', organization_id: 'org_friend', evidence_refs: ['evt_federation'] },
    { node_id: 'live-run:run_claude_review', kind: 'live-run', label: 'claude-code process', detail: 'trace_supplier_review', status: 'running', trust_mode: 'connected-observed', evidence_refs: ['evt_runtime'] },
    { node_id: `output:${enterpriseOutputHash}`, kind: 'output', label: 'Minimized output', detail: enterpriseOutputHash, status: 'recorded', evidence_refs: ['evt_output'] }
  ],
  edges: [
    { edge_id: 'edge-org-human', from_node_id: 'organization:org_hp_demo', to_node_id: 'human:human_admin', relationship: 'contains', status: 'active', evidence_refs: [] },
    { edge_id: 'edge-human-member', from_node_id: 'human:human_admin', to_node_id: 'membership:membership_admin', relationship: 'member-of', status: 'active', evidence_refs: [] },
    { edge_id: 'edge-member-credential', from_node_id: 'membership:membership_admin', to_node_id: 'authority-credential:hac_admin', relationship: 'authorized-by', status: 'active', evidence_refs: [] },
    { edge_id: 'edge-agent-passport', from_node_id: 'agent:runtime-noah', to_node_id: 'passport:passport-noah-v2', relationship: 'identifies', status: 'active', evidence_refs: [] },
    { edge_id: 'edge-passport-runtime', from_node_id: 'passport:passport-noah-v2', to_node_id: 'runtime:session-noah', relationship: 'runs-as', status: 'working', evidence_refs: [] },
    { edge_id: 'edge-runtime-connector', from_node_id: 'runtime:session-noah', to_node_id: 'connector:connector_claude', relationship: 'connects-through', status: 'working', evidence_refs: [] },
    { edge_id: 'edge-agent-mandate', from_node_id: 'agent:runtime-noah', to_node_id: 'mandate:mnd_security_review', relationship: 'authorized-by', status: 'active', evidence_refs: [] },
    { edge_id: 'edge-mandate-context', from_node_id: 'mandate:mnd_security_review', to_node_id: 'context-grant:ctx_supplier_review', relationship: 'bounded-by', status: 'active', evidence_refs: [] },
    { edge_id: 'edge-runtime-run', from_node_id: 'runtime:session-noah', to_node_id: 'live-run:run_claude_review', relationship: 'executed', status: 'running', evidence_refs: [] },
    { edge_id: 'edge-run-output', from_node_id: 'live-run:run_claude_review', to_node_id: `output:${enterpriseOutputHash}`, relationship: 'produced', status: 'recorded', evidence_refs: [] }
  ],
  traces: [{ trace_id: 'trace_supplier_review', started_at: '2026-08-21T12:00:00.000Z', updated_at: '2026-08-21T12:08:00.000Z', event_count: 18, actor_ids: ['human_admin', 'runtime-noah'], subject_ids: ['task_supplier_review'], event_types: ['HUMAN_VERIFIED_V2', 'AGENT_PASSPORT_V2_ISSUED', 'CONTEXT_DISCLOSURE_AUTHORIZED', 'LIVE_RUNTIME_STARTED'], references: { human_ids: ['human_admin'], membership_ids: ['membership_admin'], authority_credential_ids: ['hac_admin'], human_proof_ids: ['proof_admin'], passport_ids: ['passport-noah-v2'], runtime_ids: ['session-noah'], mandate_ids: ['mnd_security_review'], context_grant_ids: ['ctx_supplier_review'], approval_ids: ['apr_preview_restricted'], connector_ids: ['connector_claude'], federation_node_ids: ['node_friend_security'], live_run_ids: ['run_claude_review'], output_hashes: [enterpriseOutputHash] }, resolution_status: 'complete', missing_links: [], integrity_status: 'verified' }],
  replacement_seams: [{ seam_id: 'seam_storage', boundary: 'Persistence', local_implementation: 'Atomic JSON/JSONL repositories', replacement_target: 'MongoDB, DynamoDB, or organization data service', contract: 'Versioned repositories and state ports', readiness: 'ready' }, { seam_id: 'seam_runtime', boundary: 'Agent execution', local_implementation: 'Supervised local CLI connectors', replacement_target: 'H2A Gateway, containers, or AWS Bedrock', contract: 'Runtime adapter and signed connector protocol', readiness: 'partial' }, { seam_id: 'seam_evidence', boundary: 'Audit and retention', local_implementation: 'Hash-linked local ledger', replacement_target: 'Enterprise SIEM and immutable retention', contract: 'EvidenceLedgerPort and minimized V2 export', readiness: 'ready' }],
  claims: [{ claim_id: 'claim_human_bound', claim: 'Protected agent authority resolves to a verified human and organization membership.', status: 'verified', evidence_event_types: ['HUMAN_VERIFIED_V2', 'AGENT_PASSPORT_V2_ISSUED'], matching_event_count: 12, challenge: 'Select the trace and verify Human Proof, membership, credential, Passport, runtime, and mandate links.' }, { claim_id: 'claim_provider_control', claim: 'Host provider processes are supervised and attributable but not container-governed.', status: 'connected-observed', evidence_event_types: ['LIVE_RUNTIME_STARTED', 'LIVE_RUNTIME_CANCELLED', 'LIVE_RUNTIME_REVOKED'], matching_event_count: 4, challenge: 'Cancel or revoke the process; do not interpret host authentication as governed containment.' }, { claim_id: 'claim_backend', claim: 'Local repositories expose typed replacement seams for enterprise services.', status: 'boundary', evidence_event_types: [], matching_event_count: 0, challenge: 'Replace ports with MongoDB, KMS/HSM, IdP, or Bedrock adapters; no backend deployment is claimed.' }]
};
export const approvalPreviewState: AuthorityApprovalState = {
  policies: [{ schema_version: 2, approval_policy_id: 'policy_restricted', organization_id: 'org_hp_demo', name: 'Restricted action approval', eligible_role_ids: ['role_authority_admin'], quorum: 2, separation_of_duty: true, risk_tiers: ['restricted'], proof_purpose: 'approve restricted H2A action', decision_ttl_seconds: 300, status: 'active', updated_at: '2026-08-21T12:00:00.000Z' }],
  requests: [{ schema_version: 2, approval_request_id: 'apr_preview_restricted', organization_id: 'org_hp_demo', task_id: 'assignment-approval', requesting_human_id: 'human_analyst', requesting_agent_id: 'runtime-noah', mandate_id: 'mnd_security_review', required_resource: 'restricted-records', required_action: 'read', requested_effect_hash: `sha256:${'e'.repeat(64)}`, review_context_grant_id: 'ctx_preview_review', approval_policy_id: 'policy_restricted', eligible_membership_ids: ['membership_admin'], status: 'pending', requested_at: '2026-08-21T12:00:00.000Z', expires_at: '2026-08-21T12:05:00.000Z' }],
  request_contexts: [{ approval_request_id: 'apr_preview_restricted', requesting_membership_id: 'membership_analyst', required_approval_power: 'restricted.read.approve', risk_tier: 'restricted', record_count: 5, idempotency_key: 'resume_preview_once' }],
  decisions: [], mandate_extensions: [], resumes: []
};
export const authorityPreviewState: OrganizationAuthorityState = {
  organizations: [{ schema_version: 2, organization_id: 'org_hp_demo', name: 'HP Enterprise Demo', policy_version: 'policy_2026_01', signing_root_key_id: 'orgkey_preview', status: 'active', created_at: '2026-08-21T00:00:00.000Z', updated_at: '2026-08-21T00:00:00.000Z' }],
  memberships: [
    { schema_version: 2, membership_id: 'membership_admin', organization_id: 'org_hp_demo', human_id: 'human_admin', employee_id: 'E-100', department: 'Enterprise Security', role_ids: ['role_authority_admin'], status: 'active', effective_from: '2026-08-21T00:00:00.000Z', updated_at: '2026-08-21T00:00:00.000Z' },
    { schema_version: 2, membership_id: 'membership_analyst', organization_id: 'org_hp_demo', human_id: 'human_analyst', employee_id: 'E-200', department: 'Risk & Compliance', manager_membership_id: 'membership_admin', role_ids: ['role_records_analyst'], status: 'active', effective_from: '2026-08-21T00:00:00.000Z', updated_at: '2026-08-21T00:00:00.000Z' }
  ],
  roles: [
    { schema_version: 2, role_id: 'role_authority_admin', organization_id: 'org_hp_demo', name: 'Authority Administrator', description: 'Administers organization authority, agent identity, and protected mandates.', authority_scopes: [{ resource: 'organization', actions: ['manage'] }, { resource: 'mandate', actions: ['issue', 'approve', 'revoke'] }, { resource: 'agent-passport', actions: ['issue', 'revoke'] }, { resource: 'runtime-attestation', actions: ['issue', 'revoke'] }], approval_powers: ['mandate.approve'], status: 'active', updated_at: '2026-08-21T00:00:00.000Z' },
    { schema_version: 2, role_id: 'role_records_analyst', organization_id: 'org_hp_demo', name: 'Records Analyst', description: 'Reads bounded employee records without mandate issuance authority.', authority_scopes: [{ resource: 'records', actions: ['read'], max_records: 25 }], approval_powers: [], status: 'active', updated_at: '2026-08-21T00:00:00.000Z' }
  ],
  credentials: [{ schema_version: 2, credential_id: 'hac_preview_admin', organization_id: 'org_hp_demo', membership_id: 'membership_admin', role_ids: ['role_authority_admin'], resource_constraints: [], action_constraints: [], approval_policy_ids: [], issued_at: '2026-08-21T00:00:00.000Z', expires_at: '2026-09-20T00:00:00.000Z', status: 'active', canonical_hash: `sha256:${'a'.repeat(64)}`, organization_signature: 'ed25519:preview' }],
  assurance: [{ human_id: 'human_admin', membership_id: 'membership_admin', human_proof_id: 'proof_preview_admin', expires_at: '2026-09-20T00:00:00.000Z' }],
  decisions: []
};
export const emptyEvidenceState: EvidenceExplorerState = {
  generatedAt: new Date().toISOString(),
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
  generated_at: new Date().toISOString(),
  manifest: { schema_version: 2, manifest_id: 'phase22-hp-cto-ciso', session_id: 'preview', trace_prefix: 'phase22_', required_providers: ['claude-code', 'openai-codex', 'gemini-antigravity'], accepted_frameworks: ['mcp'], minimum_humans: 2, biometric_record_range: [20, 70], trust_ceiling: 'connected-observed', created_at: new Date().toISOString() },
  status: 'blocked', shared_trace_id: null, completion: { passed: 0, total: 11 }, evidence_integrity: 'verified',
  phase44_readiness: { clean_session: false, required_liveness_mode: false, liveness_verified_human_ids: [], approval_withdrawal_evidence_ref: null, project_integration_evidence_ref: null, package_eligible: false },
  gates: ['two-human-ceremony', 'organization-authority', 'workload-identity', 'shared-provider-task', 'external-framework', 'context-minimization', 'authority-escalation', 'runtime-containment', 'adversarial-controls', 'restart-recovery', 'evidence-reconstruction'].map((gate_id) => ({ gate_id, title: gate_id.replaceAll('-', ' '), status: 'pending', summary: 'No persisted acceptance evidence is available.', evidence_refs: [] })) as FinalAcceptanceState['gates'],
  attacks: ['replay', 'forged-approval', 'over-broad-delegation', 'context-leakage', 'tamper', 'provider-failure'].map((attack_id) => ({ attack_id, status: 'not-observed', reason_codes: [], evidence_refs: [] })) as FinalAcceptanceState['attacks'],
  blockers: ['Run the Phase 22 operator ceremony.']
};

export const previewHash = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;
export const contextPreviewState: ContextBrokerState = {
  artifacts: [{
    artifact_id: 'artifact_supplier_risk', organization_id: 'org_hp_demo', name: 'Supplier risk record', source_resource: 'supplier-records', owner_human_id: 'human_admin',
    fields: [
      { field: 'supplier_name', classification: 'internal', value_hash: previewHash('1') },
      { field: 'contact_email', classification: 'confidential', value_hash: previewHash('2') },
      { field: 'payroll_reference', classification: 'restricted', value_hash: previewHash('3') }
    ],
    encrypted_payload_ref: 'sealed_artifact_supplier_risk', status: 'active', created_at: '2026-08-21T12:00:00.000Z', updated_at: '2026-08-21T12:00:00.000Z', canonical_hash: previewHash('4'), organization_signature: 'ed25519:cHJldmlldw=='
  }],
  grants: [{
    grant: { schema_version: 2, context_grant_id: 'ctx_supplier_review', organization_id: 'org_hp_demo', task_id: 'assignment-approval', mandate_id: 'mnd_security_review', recipient_agent_id: 'runtime-noah', recipient_passport_id: 'passport-noah-v2', purpose: 'review supplier risk', allowed_fields: ['supplier_name', 'contact_email'], artifact_refs: ['artifact_supplier_risk'], transformations: ['mask'], withheld_field_hashes: [previewHash('3')], token_budget: 500, issued_at: '2026-08-21T12:01:00.000Z', expires_at: '2026-08-21T12:31:00.000Z', canonical_hash: previewHash('5'), organization_signature: 'ed25519:cHJldmlldw==' },
    field_rules: [
      { artifact_id: 'artifact_supplier_risk', field: 'supplier_name', maximum_classification: 'internal', transformation: 'value' },
      { artifact_id: 'artifact_supplier_risk', field: 'contact_email', maximum_classification: 'confidential', transformation: 'mask' }
    ],
    status: 'active', maximum_uses: 10, use_count: 1, updated_at: '2026-08-21T12:02:00.000Z', canonical_hash: previewHash('6'), organization_signature: 'ed25519:cHJldmlldw=='
  }],
  disclosures: [{
    disclosure_id: 'disclosure_supplier_review_01', organization_id: 'org_hp_demo', context_grant_id: 'ctx_supplier_review', task_id: 'assignment-approval', mandate_id: 'mnd_security_review', recipient_agent_id: 'runtime-noah', recipient_passport_id: 'passport-noah-v2', purpose: 'review supplier risk', requested_fields: ['supplier_name', 'contact_email', 'payroll_reference'], granted_fields: ['supplier_name', 'contact_email'], withheld_fields: ['payroll_reference'], transformation_by_field: { supplier_name: 'value', contact_email: 'mask' }, disclosed_value_hashes: [previewHash('1'), previewHash('2')], withheld_value_hashes: [previewHash('3')], projection_hash: previewHash('7'), reason_code: 'CONTEXT_DISCLOSURE_AUTHORIZED', status: 'authorized', idempotency_key: previewHash('8'), disclosed_at: '2026-08-21T12:02:00.000Z', canonical_hash: previewHash('9'), organization_signature: 'ed25519:cHJldmlldw=='
  }],
  messages: [{
    message_id: 'message_supplier_review_01', organization_id: 'org_hp_demo', task_id: 'assignment-approval', trace_id: 'trace_supplier_review', sender_connector_manifest_id: 'connector_claude', recipient_connector_manifest_id: 'connector_codex', sender_passport_id: 'passport-claude-v2', recipient_passport_id: 'passport-noah-v2', mandate_id: 'mnd_security_review', context_grant_id: 'ctx_supplier_review', speech_act: 'handoff', content_ref: 'artifact-ref:supplier-review-output', content_hash: previewHash('a'), sequence: 1, deduplication_id: 'dedupe_supplier_review_01', status: 'delivered', created_at: '2026-08-21T12:03:00.000Z', expires_at: '2026-08-21T12:33:00.000Z', sender_signature: 'ed25519:cHJldmlldw=='
  }]
};

export function emptyPreviewWorkspace(): [SystemStatus, CollaborationState, AgentIdentityState, MandateState, OrganizationAuthorityState, AuthorityApprovalState, ScenarioState, EvidenceExplorerState, ContextBrokerState, FederationState] {
  return [demoSystemStatus, { workplace: { generatedAt: new Date().toISOString(), agents: [], assignments: [], events: [] }, messages: [], responses: [], activity: [] }, previewAgentIdentityState, emptyMandateState, emptyOrganizationState, emptyApprovalState, emptyScenarioState, emptyEvidenceState, emptyContextBrokerState, emptyFederationState];
}
