import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultEvidenceQuery } from '@h2a/contracts';
import {
  EnterpriseObservabilityService,
  EvidenceAuditService,
  LocalAuthorityEventLedger,
  type EnterpriseObservationPorts
} from '@h2a/evidence';
import { LocalWorkplaceRepository } from '@h2a/storage';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('Phase 21 enterprise observability and Evidence V2', () => {
  it('resolves human, authority, agent, runtime, connector, context, approval, federation, process, and output into one complete trace', async () => {
    const root = await temporaryRoot();
    const ledger = new LocalAuthorityEventLedger(root);
    const outputHash = `sha256:${'a'.repeat(64)}`;
    await ledger.append({
      trace_id: 'trace_enterprise_review', actor: { type: 'human', id: 'human_admin' }, subject: { type: 'outcome', id: 'output_review' }, mandate_id: 'mandate_review', event_type: 'ACTION_EXECUTED',
      payload: { human_id: 'human_admin', membership_id: 'membership_admin', authority_credential_id: 'credential_admin', human_proof_id: 'proof_admin', passport_id: 'passport_reviewer', runtime_session_id: 'session_reviewer', mandate_id: 'mandate_review', context_grant_id: 'grant_review', approval_request_id: 'approval_review', connector_manifest_id: 'connector_claude', node_id: 'node_local', run_id: 'run_review', output_hash: outputHash }
    });
    const state = await new EnterpriseObservabilityService(ledger, ports(outputHash), () => new Date('2026-08-21T14:00:00.000Z')).getState();
    expect(state.schema_version).toBe(2);
    expect(state.traces).toHaveLength(1);
    expect(state.traces[0]).toMatchObject({ trace_id: 'trace_enterprise_review', resolution_status: 'complete', missing_links: [], integrity_status: 'verified' });
    expect(state.traces[0].references).toMatchObject({ human_ids: ['human_admin'], membership_ids: ['membership_admin'], authority_credential_ids: ['credential_admin'], human_proof_ids: ['proof_admin'], passport_ids: ['passport_reviewer'], runtime_ids: ['session_reviewer'], mandate_ids: ['mandate_review'], context_grant_ids: ['grant_review'], approval_ids: ['approval_review'], connector_ids: ['connector_claude'], federation_node_ids: ['node_local'], live_run_ids: ['run_review'], output_hashes: [outputHash] });
    expect(state.edges.every((edge) => state.nodes.some((node) => node.node_id === edge.from_node_id) && state.nodes.some((node) => node.node_id === edge.to_node_id))).toBe(true);
    expect(state.posture.trust_modes['connected-observed']).toBeGreaterThan(0);
    expect(state.posture.trust_modes.governed).toBe(0);
    expect(state.claims.find((claim) => claim.claim_id === 'claim_provider_control')?.status).toBe('connected-observed');
  });

  it('reports unresolved persisted links as partial without inventing entities', async () => {
    const root = await temporaryRoot(); const ledger = new LocalAuthorityEventLedger(root);
    await ledger.append({ trace_id: 'trace_missing_credential', actor: { type: 'agent', id: 'agent_reviewer' }, subject: { type: 'outcome', id: 'output_missing' }, event_type: 'ACTION_EXECUTED', payload: { human_id: 'human_admin', authority_credential_id: 'credential_not_persisted', passport_id: 'passport_reviewer', runtime_session_id: 'session_reviewer', mandate_id: 'mandate_review' } });
    const state = await new EnterpriseObservabilityService(ledger, ports(`sha256:${'b'.repeat(64)}`)).getState();
    expect(state.traces[0]).toMatchObject({ resolution_status: 'partial', missing_links: ['authority-credential'] });
    expect(state.nodes.some((node) => node.node_id === 'authority-credential:credential_not_persisted')).toBe(false);
  });

  it('bounds topology display labels without changing the canonical mandate objective', async () => {
    const root = await temporaryRoot(); const ledger = new LocalAuthorityEventLedger(root); const source = ports(`sha256:${'e'.repeat(64)}`);
    const loadMandates = source.mandates.getState;
    const longObjective = `Build the governed storefront ${'with exact retained objective '.repeat(10)}`;
    source.mandates.getState = async () => { const state = await loadMandates(); state.mandates[0]!.objective = longObjective; return state; };
    const overview = await new EnterpriseObservabilityService(ledger, source).getState();
    const mandate = overview.nodes.find((node) => node.node_id === 'mandate:mandate_review');
    expect(mandate?.label).toHaveLength(180);
    expect(mandate?.label.endsWith('...')).toBe(true);
    expect((await source.mandates.getState()).mandates[0]!.objective).toBe(longObjective);
  });

  it('preserves trace summaries with more than 100 distinct subjects', async () => {
    const root = await temporaryRoot(); const ledger = new LocalAuthorityEventLedger(root);
    for (let index = 0; index < 125; index += 1) {
      await ledger.append({
        trace_id: 'trace_accumulated_evidence',
        actor: { type: 'system', id: 'enterprise-observability-test' },
        subject: { type: 'outcome', id: `accumulated_subject_${index}` },
        event_type: 'ACTION_EXECUTED',
        payload: {}
      });
    }
    const state = await new EnterpriseObservabilityService(ledger, ports(`sha256:${'d'.repeat(64)}`)).getState();
    const trace = state.traces.find((entry) => entry.trace_id === 'trace_accumulated_evidence');
    expect(trace?.event_count).toBe(125);
    expect(trace?.subject_ids).toHaveLength(125);
    expect(trace?.subject_ids).toContain('accumulated_subject_124');
  });

  it('exports the minimized V2 topology and traces without protected values', async () => {
    const root = await temporaryRoot(); const ledger = new LocalAuthorityEventLedger(root); const workplace = new LocalWorkplaceRepository(root);
    await Promise.all([
      workplace.replaceAgents([]),
      workplace.replaceAssignments([]),
      workplace.replaceRecentEvents([])
    ]);
    await ledger.append({ trace_id: 'trace_export_v2', actor: { type: 'system', id: 'phase21-test' }, subject: { type: 'outcome', id: 'output_export' }, event_type: 'ACTION_EXECUTED', payload: { output_hash: `sha256:${'c'.repeat(64)}` } });
    const overview = await new EnterpriseObservabilityService(ledger, ports(`sha256:${'c'.repeat(64)}`)).getState();
    const audit = new EvidenceAuditService(root, ledger, workplace);
    await audit.initialize();
    audit.setEnterpriseOverviewProvider({ getState: async () => overview });
    const receipt = await audit.exportBundle(defaultEvidenceQuery);
    const contents = await readFile(join(root, receipt.relativePath), 'utf8');
    expect(receipt.privacyProfile).toBe('audit-minimized-v2');
    expect(contents).toContain('h2a.audit.bundle.v2');
    expect(contents).toContain('replacement_seams');
    expect(contents).not.toContain('PHASE21-HIDDEN-CONTEXT-VALUE');
    expect(contents).not.toMatch(/private_key|api_key|credential_value|prompt_body/iu);
  });
});

function ports(outputHash: string): EnterpriseObservationPorts {
  const now = '2026-08-21T13:00:00.000Z'; const future = '2027-08-21T13:00:00.000Z';
  return {
    organization: { getState: async () => ({ organizations: [{ schema_version: 2, organization_id: 'org_demo', name: 'Enterprise Demo', policy_version: 'policy_v2', signing_root_key_id: 'orgkey_demo', status: 'active', created_at: now, updated_at: now }], memberships: [{ schema_version: 2, membership_id: 'membership_admin', organization_id: 'org_demo', human_id: 'human_admin', employee_id: 'E-100', department: 'Security', role_ids: ['role_admin'], status: 'active', effective_from: now, updated_at: now }], roles: [], credentials: [{ schema_version: 2, credential_id: 'credential_admin', organization_id: 'org_demo', membership_id: 'membership_admin', role_ids: ['role_admin'], resource_constraints: [], action_constraints: [], approval_policy_ids: [], issued_at: now, expires_at: future, status: 'active', canonical_hash: outputHash, organization_signature: 'ed25519:dGVzdA==' }], assurance: [], decisions: [] }) },
    humans: { getState: async () => ({ identities: [{ schema_version: 2, human_id: 'human_admin', organization_id: 'org_demo', display_name: 'Enterprise Admin', status: 'active', active_membership_id: 'membership_admin', created_at: now, updated_at: now }], enrollments: [], active_proofs: [{ schema_version: 2, human_proof_id: 'proof_admin', human_id: 'human_admin', organization_id: 'org_demo', membership_id: 'membership_admin', enrollment_id: 'enrollment_admin', enrollment_version: 1, policy_hash: outputHash, purpose: 'authorize enterprise review', nonce: 'nonce_admin', assurance_level: 'high', verification_methods: ['face', 'liveness', 'distance', 'bch'], matched_record_count: 20, verified_at: now, expires_at: future, provider_attestation_hash: outputHash, canonical_hash: outputHash, organization_signature: 'ed25519:dGVzdA==' }], selected_human_id: 'human_admin', last_result: null }) },
    agents: { getState: async () => ({ passports: [], bindings: [], providers: [], credentials: [], humanProofRequired: false, passportsV2: [{ schema_version: 2, passport_id: 'passport_reviewer', agent_id: 'agent_reviewer', organization_id: 'org_demo', sponsor_human_id: 'human_admin', sponsor_membership_id: 'membership_admin', issuance_human_proof_id: 'proof_admin', issuance_authority_credential_id: 'credential_admin', connector_manifest_id: 'connector_claude', name: 'Reviewer', role: 'Security reviewer', purpose: 'Review bounded enterprise controls.', risk_tier: 'restricted', capabilities: ['controls.review'], workload_public_key: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----', status: 'active', issued_at: now, expires_at: future, canonical_hash: outputHash, organization_signature: 'ed25519:dGVzdA==' }], attestations: [], runtimeSessions: [{ schema_version: 2, runtime_session_id: 'session_reviewer', passport_id: 'passport_reviewer', connector_manifest_id: 'connector_claude', runtime_attestation_id: 'attestation_reviewer', trust_mode: 'connected-observed', state: 'working', started_at: now, last_seen_at: now, evidence_refs: [] }] }) },
    collaboration: { getState: async () => ({ workplace: { generatedAt: now, agents: [{ id: 'agent_reviewer', passportId: 'passport_reviewer', name: 'Reviewer', role: 'Security reviewer', provider: 'claude-code', model: 'claude', status: 'working', currentAction: 'Review controls', progress: 50, capabilities: ['controls.review'], mandateId: 'mandate_review', lastSeenAt: now }], assignments: [], events: [] }, messages: [], responses: [], activity: [] }) },
    mandates: { getState: async () => ({ mandates: [{ mandateId: 'mandate_review', version: 1, depth: 0, issuer: { humanId: 'human_admin', humanProofId: 'proof_admin' }, subject: { agentId: 'agent_reviewer', passportId: 'passport_reviewer' }, objective: 'Review bounded enterprise controls.', resources: ['controls'], actions: ['review'], prohibitedActions: [], limits: {}, disclosure: { allowedFields: ['control_id'] }, approvals: { requiredActions: [] }, delegation: { allowed: false, allowedAgentIds: [], maxDepth: 0 }, issuedAt: now, expiresAt: future, status: 'active', signature: { algorithm: 'Ed25519', signedBy: 'human_admin', canonicalHash: outputHash, value: 'ed25519:test' } }], delegations: [], approvals: [], decisions: [], humanProofRequired: false }) },
    approvals: { getState: async () => ({ policies: [], requests: [{ schema_version: 2, approval_request_id: 'approval_review', organization_id: 'org_demo', task_id: 'task_review', requesting_human_id: 'human_admin', requesting_agent_id: 'agent_reviewer', mandate_id: 'mandate_review', required_resource: 'controls', required_action: 'review', requested_effect_hash: outputHash, review_context_grant_id: 'grant_review', approval_policy_id: 'policy_review', eligible_membership_ids: ['membership_admin'], status: 'pending', requested_at: now, expires_at: future }], request_contexts: [], decisions: [], mandate_extensions: [], resumes: [] }) },
    context: { getState: async () => ({ artifacts: [], grants: [{ grant: { schema_version: 2, context_grant_id: 'grant_review', organization_id: 'org_demo', task_id: 'task_review', mandate_id: 'mandate_review', recipient_agent_id: 'agent_reviewer', recipient_passport_id: 'passport_reviewer', purpose: 'Review bounded enterprise controls', allowed_fields: ['control_id'], artifact_refs: ['artifact_controls'], transformations: ['reference'], withheld_field_hashes: [], token_budget: 100, issued_at: now, expires_at: future, canonical_hash: outputHash, organization_signature: 'ed25519:dGVzdA==' }, field_rules: [], status: 'active', maximum_uses: 1, use_count: 0, updated_at: now, canonical_hash: outputHash, organization_signature: 'ed25519:dGVzdA==' }], disclosures: [], messages: [] }) },
    connectors: { getState: async () => ({ declarations: [{ connector_id: 'connector_claude', kind: 'custom-cli', name: 'Claude Connector', protocol: 'local-cli', adapter_version: '1.0.0', trust_ceiling: 'connected-observed', capabilities: ['task.receive'], health: 'ready', detail: 'Ready', setup_document: 'docs/setup.md', endpoint_policy: 'none', checked_at: now }], protocol: { connectors: [], deliveries: [], dead_letter_count: 0 }, collaboration_runs: [{ run_id: 'framework_review', trace_id: 'trace_enterprise_review', mandate_id: 'mandate_review', status: 'succeeded', trust_mode: 'connected-observed', steps: [{ step_id: 'step_review', connector_kind: 'custom-cli', connector_manifest_id: 'connector_claude', delivery_id: 'delivery_review', task_id: 'task_review', status: 'acknowledged', output_hash: outputHash }], started_at: now, completed_at: now, evidence_integrity: 'verified' }] }) },
    live: { getState: async () => ({ providers: [], runs: [{ run_id: 'run_review', provider: 'claude-code', agent_id: 'agent_reviewer', passport_id: 'passport_reviewer', binding_id: 'binding_reviewer', runtime_session_id: 'session_reviewer', mandate_id: 'mandate_review', trace_id: 'trace_enterprise_review', workspace_path: 'C:\\workspace', executable: 'claude', argument_policy: ['fixed'], environment_keys: ['PATH'], prompt_hash: outputHash, trust_mode: 'connected-observed', status: 'running', process_id: 1234, started_at: now, updated_at: now }], output: [{ output_id: 'runtime_output_hidden', run_id: 'run_review', sequence: 1, kind: 'stdout', content: 'PHASE21-HIDDEN-CONTEXT-VALUE', created_at: now }] }) },
    federation: { getState: async () => ({ local_node: { schema_version: 2, node_id: 'node_local', organization_id: 'org_demo', display_name: 'Local Node', public_key_pem: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----', key_fingerprint: outputHash, endpoint: 'http://127.0.0.1:4000/h2a/federation/v2/envelopes', endpoint_policy: 'loopback-only', capabilities: ['task.receive'], status: 'active', created_at: now, updated_at: now, canonical_hash: outputHash, node_signature: 'ed25519:dGVzdA==' }, invitations: [], registrations: [], acceptances: [], peers: [], receipts: [], remote_listener_enabled: false }) }
  } as unknown as EnterpriseObservationPorts;
}

async function temporaryRoot(): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'h2a-phase21-')); roots.push(root); return root; }
