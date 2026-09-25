import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OfficeProjectionService } from '@h2a/office';
import { phase34CanonicalState } from './fixtures/phase34-state';

const root = process.cwd();

describe('Phase 50 Office-native collaboration and recovery', () => {
  it('keeps every routine workspace in Office and reserves Control for explicit technical details', async () => {
    const [app, office, drawer] = await Promise.all([
      readFile(join(root, 'apps/desktop/renderer/src/App.tsx'), 'utf8'),
      readFile(join(root, 'apps/desktop/renderer/src/components/OfficeShell.tsx'), 'utf8'),
      readFile(join(root, 'apps/desktop/renderer/src/components/OfficeWorkspaceDrawer.tsx'), 'utf8')
    ]);
    for (const workspace of ['organization', 'agents', 'tasks', 'collaboration', 'pairing', 'approvals', 'context', 'delivery', 'security', 'evidence']) expect(office).toContain(`id: '${workspace}'`);
    expect(app).toContain("if (appearance.presentation_mode === 'office')");
    expect(app).toContain('setOfficeWorkspace(workspaceForRoute(action.destination))');
    expect(app).toContain('onNotificationRoute={(destination) => setOfficeWorkspace');
    expect(app).toContain('onReadinessRoute={(destination) => setOfficeWorkspace');
    expect(drawer).toContain('data-control-id="office.workspace.technical"');
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain("event.key === 'Escape'");
  });

  it('uses the same real domain components inside the Office drawer', async () => {
    const app = await readFile(join(root, 'apps/desktop/renderer/src/App.tsx'), 'utf8');
    for (const component of ['PeopleAuthorityView', 'CommandFloor', 'GoalWorkGraphPanel', 'OfficeCollaborationWorkspace', 'CoworkerPairingPanel', 'AuthorityInbox', 'ContextBrokerView', 'ProjectDeliveryPanel', 'SecurityValidationConsole', 'EvidenceExplorer']) expect(app).toContain(`<${component}`);
    expect(app).toContain('canonicalState={goalWorkGraph}');
    expect(app).toContain('canonicalState={projectDelivery}');
    expect(app).toContain('requestProof(');
  });

  it('projects work graph status, context, predecessors, reasons, and outputs from canonical state', () => {
    const canonical = phase34CanonicalState();
    canonical.goal_work_graph = {
      schema_version: 1, goals: [], diffs: [], candidates: [], generated_at: '2026-09-02T10:00:00.000Z', trust_ceiling: 'connected-observed',
      graphs: [{ schema_version: 1, graph_id: 'graph_1', goal_id: 'goal_1', trace_id: 'trace_1', status: 'running', revision: 1, plan_hash: `sha256:${'1'.repeat(64)}`, proposed_by: 'deterministic-h2a', provider_proposal_hash: null, approved_by_human_id: 'human_1', approved_human_proof_id: 'proof_1', created_at: '2026-09-02T10:00:00.000Z', updated_at: '2026-09-02T10:01:00.000Z', trust_ceiling: 'connected-observed', approval_checkpoints: [], dependency_edges: [], nodes: [{ node_id: 'node_1', title: 'Remote QA', objective: 'Validate the accepted implementation.', human_owner_id: 'human_1', agent_id: 'runtime-maya', runtime_binding_id: 'runtime-maya', execution_target: 'paired-node', remote_peer_id: 'peer_1', passport_id: 'passport_1', runtime_session_id: 'session_1', runtime_attestation_id: 'attestation_1', mandate_id: 'mandate_1', context_grant_id: 'grant_1', project_assignment_id: 'assignment_1', workplace_assignment_id: 'wrk_104', worktree_lease_id: null, mailbox_route_id: 'message_1', provider: 'gemini-antigravity', allowed_context_fields: ['case_id'], withheld_context_fields: ['recovery_secret'], allowed_paths: [], allowed_tools: ['test'], allowed_network_hosts: [], expected_outputs: ['Signed QA result'], validation_commands: [], mandate_scope: { resources: ['repository'], actions: ['test'], fields: ['case_id'], paths: [], commands: [], capabilities: ['test'], duration_seconds: 3600, quorum: null, policy_bindings: [] }, mandate_expires_at: '2026-09-03T10:00:00.000Z', approval_policy_ids: [], replacement_for_node_id: null, status: 'succeeded', reason_code: 'REMOTE_SIGNED_RESULT_ACCEPTED', output_ref: 'remote-result:1', output_hash: `sha256:${'2'.repeat(64)}`, evidence_refs: ['evt_result_1'] }] }]
    };
    const office = new OfficeProjectionService().project(canonical, '2026-09-02T10:02:00.000Z');
    expect(office.collaboration.signals.find((item) => item.kind === 'work-graph')).toMatchObject({ status: 'succeeded', released_fields: ['case_id'], withheld_fields: ['recovery_secret'], output_hash: `sha256:${'2'.repeat(64)}`, reason_code: 'REMOTE_SIGNED_RESULT_ACCEPTED' });
  });
});
