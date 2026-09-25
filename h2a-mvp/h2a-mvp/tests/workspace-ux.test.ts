import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ContextDisclosure, WorkGraph, WorkGraphNode } from '@h2a/contracts';
import { phase34CanonicalState } from './fixtures/phase34-state';
import { nodeCanRun, nodeStatus, purposeActor, roomDisclosures, timeRemaining } from '../apps/desktop/renderer/src/features/workspace/workspaceModel';
import { WorkspaceExperience } from '../apps/desktop/renderer/src/features/workspace/WorkspaceExperience';

const now = Date.parse('2026-09-06T10:00:00Z');
export function workspaceTestNode(id = 'node_ui'): WorkGraphNode {
  return { node_id: id, title: 'Design the storefront', objective: 'Prepare the permitted website design.', human_owner_id: 'human_test', agent_id: 'agent_test', runtime_binding_id: 'binding_test', execution_target: 'local', remote_peer_id: null, passport_id: 'passport_test', runtime_session_id: 'session_test', runtime_attestation_id: 'attestation_test', mandate_id: 'mandate_test', context_grant_id: 'grant_test', project_assignment_id: 'assignment_test', workplace_assignment_id: 'workplace_test', worktree_lease_id: null, mailbox_route_id: 'mailbox_test', provider: 'claude-code', allowed_context_fields: ['case_id'], withheld_context_fields: ['private_notes'], allowed_paths: ['src/**'], allowed_tools: ['findings.write'], allowed_network_hosts: [], expected_outputs: ['Design proposal'], validation_commands: [], mandate_scope: { resources: [], actions: [], fields: [], paths: [], commands: [], capabilities: [], duration_seconds: null, quorum: null, policy_bindings: [] }, mandate_expires_at: '2026-09-06T11:00:00Z', approval_policy_ids: [], replacement_for_node_id: null, status: 'ready', reason_code: null, output_ref: null, output_hash: null, evidence_refs: [] };
}
function testGraph(node = workspaceTestNode()): WorkGraph {
  return { schema_version: 1, graph_id: 'graph_test', goal_id: 'goal_test', trace_id: 'trace_test', status: 'approved', nodes: [node], dependency_edges: [], approval_checkpoints: [], revision: 1, plan_hash: `sha256:${'a'.repeat(64)}`, proposed_by: 'deterministic-h2a', provider_proposal_hash: null, approved_by_human_id: 'human_test', approved_human_proof_id: 'proof_test', created_at: '2026-09-06T09:00:00Z', updated_at: '2026-09-06T09:00:00Z', trust_ceiling: 'connected-observed' };
}
afterEach(() => vi.unstubAllGlobals());

describe('Unified workspace truthful projections', () => {
  it('does not turn a connected provider or accepted remote task into completed work', () => {
    expect(nodeStatus(workspaceTestNode(), now)).toBe('Ready to start');
    expect(nodeStatus({ ...workspaceTestNode(), status: 'waiting', reason_code: 'REMOTE_TASK_ACCEPTED_WAITING_FOR_SIGNED_RESULT' }, now)).toBe('Received; result pending');
    expect(nodeStatus({ ...workspaceTestNode(), status: 'succeeded' }, now + 7200000)).toBe('Work completed');
  });
  it('blocks expired, unapproved and dependent work but not independent siblings', () => {
    const node = workspaceTestNode(); const graph = testGraph(node);
    expect(nodeCanRun(graph, node, now)).toBe(true);
    expect(nodeCanRun(graph, node, now + 3600000)).toBe(false);
    expect(nodeCanRun(graph, { ...node, mandate_expires_at: 'invalid' }, now)).toBe(false);
    expect(nodeCanRun({ ...graph, approved_by_human_id: null }, node, now)).toBe(false);
    expect(nodeCanRun({ ...graph, status: 'draft' }, node, now)).toBe(false);
    const other = { ...workspaceTestNode('other'), status: 'revoked' as const };
    expect(nodeCanRun({ ...graph, nodes: [node, other] }, node, now)).toBe(true);
    expect(nodeCanRun({ ...graph, nodes: [node, other], dependency_edges: [{ edge_id: 'edge', predecessor_node_id: 'other', successor_node_id: node.node_id, condition: 'succeeded', on_unsatisfied: 'wait' }] }, node, now)).toBe(false);
  });
  it('requires exact person, purpose and non-expired authority when resolving an actor', () => {
    const state = phase34CanonicalState().organization;
    state.memberships = [{ schema_version: 2, membership_id: 'member_test', organization_id: 'org_test', human_id: 'human_test', employee_id: 'TEST-001', department: 'Engineering', role_ids: ['role_test'], status: 'active', effective_from: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }];
    state.assurance = [{ human_id: 'human_test', membership_id: 'member_test', human_proof_id: 'proof_test', purpose: 'approve collaborative work graph', expires_at: '2026-09-06T10:05:00Z' }];
    state.credentials = [{ schema_version: 2, credential_id: 'credential_test', organization_id: 'org_test', membership_id: 'member_test', role_ids: ['role_test'], resource_constraints: [], action_constraints: [], approval_policy_ids: [], issued_at: '2026-09-06T09:00:00Z', expires_at: '2026-09-06T11:00:00Z', status: 'active', canonical_hash: `sha256:${'a'.repeat(64)}`, organization_signature: 'test-only' }];
    expect(purposeActor(state, 'human_test', 'approve collaborative work graph', now)).toEqual({ membership_id: 'member_test', human_proof_id: 'proof_test', authority_credential_id: 'credential_test' });
    expect(purposeActor(state, 'human_test', 'approve collaborative work graph', now + 300000)).toBeUndefined();
    expect(purposeActor(state, 'unknown_person', 'approve collaborative work graph', now)).toBeUndefined();
    expect(purposeActor(state, 'human_test', 'not the verified purpose', now)).toBeUndefined();
    state.credentials[0]!.status = 'revoked';
    expect(purposeActor(state, 'human_test', 'approve collaborative work graph', now)).toBeUndefined();
    state.credentials[0]!.status = 'active';
    state.memberships[0]!.effective_until = '2026-09-06T09:59:00Z';
    expect(purposeActor(state, 'human_test', 'approve collaborative work graph', now)).toBeUndefined();
    expect(timeRemaining('bad timestamp', now)).toBe('Expiry unavailable');
    expect(timeRemaining('2026-09-06T09:59:59Z', now)).toBe('Expired');
  });
  it('does not expose unrelated disclosure records in a room', () => {
    const state = phase34CanonicalState();
    const disclosure: ContextDisclosure = { disclosure_id: 'disclosure_test', organization_id: 'org_test', context_grant_id: 'grant_test', task_id: 'workplace_test', mandate_id: 'mandate_test', recipient_agent_id: 'agent_test', recipient_passport_id: 'passport_test', purpose: 'Test scoped context', requested_fields: ['case_id', 'private_notes'], granted_fields: ['case_id'], withheld_fields: ['private_notes'], transformation_by_field: { case_id: 'value' }, disclosed_value_hashes: [], withheld_value_hashes: [], projection_hash: `sha256:${'a'.repeat(64)}`, reason_code: 'CONTEXT_GRANT_ACTIVE', status: 'authorized', idempotency_key: `sha256:${'b'.repeat(64)}`, disclosed_at: '2026-09-06T10:00:00Z', canonical_hash: `sha256:${'c'.repeat(64)}`, organization_signature: 'test-only' };
    state.context_broker.disclosures = [disclosure, { ...disclosure, disclosure_id: 'other_task', task_id: 'unrelated_task' }, { ...disclosure, disclosure_id: 'other_grant', context_grant_id: 'unrelated_grant' }];
    expect(roomDisclosures(state, testGraph()).map((item) => item.disclosure_id)).toEqual(['disclosure_test']);
  });
  it('renders the actual empty host state without invented work, people, memory, or success', () => {
    vi.stubGlobal('window', { location: { hash: '#work' } });
    const html = renderToStaticMarkup(createElement(WorkspaceExperience, { canonical: phase34CanonicalState(), connected: true, loading: false, error: '', onRefresh: async () => undefined, onOpenSurface: () => undefined, onEvidence: () => undefined, onProof: () => undefined, onClassic: () => undefined }));
    expect(html).toContain('Your next piece of work starts here');
    expect(html).toContain('Local operator workspace');
    expect(html).not.toContain('214 agents');
    expect(html).not.toContain('Maya Singh');
  });
});
