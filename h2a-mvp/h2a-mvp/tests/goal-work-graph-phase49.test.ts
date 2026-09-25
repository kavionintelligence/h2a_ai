import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GoalWorkGraphCoordinator, type GoalWorkGraphPorts } from '@h2a/projects';
import { LocalAuthorityEventLedger } from '@h2a/evidence';
import type { WorkGraphAgentCandidate } from '@h2a/contracts';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const local: WorkGraphAgentCandidate = {
  candidate_id: 'candidate_local_claude', execution_target: 'local', agent_id: 'agent_claude', runtime_binding_id: 'binding_claude', display_name: 'Claude UI',
  provider: 'claude-code', human_owner_id: 'human_admin', passport_id: 'passport_claude', runtime_session_id: 'session_claude', runtime_attestation_id: 'attestation_claude',
  remote_peer_id: null, capabilities: ['evidence.read', 'findings.write'], status: 'ready', reason_code: null
};
const remote: WorkGraphAgentCandidate = {
  candidate_id: 'candidate_remote_antigravity', execution_target: 'paired-node', agent_id: 'agent_remote', runtime_binding_id: 'binding_remote', display_name: 'Remote Antigravity',
  provider: 'gemini-antigravity', human_owner_id: 'human_coworker', passport_id: 'passport_remote', runtime_session_id: 'session_remote', runtime_attestation_id: 'attestation_remote',
  remote_peer_id: 'peer_remote', capabilities: ['evidence.read', 'findings.write'], status: 'ready', reason_code: null
};

async function fixture(
  overrides: Partial<GoalWorkGraphPorts> = {},
  clock: () => Date = () => new Date('2026-09-02T10:00:00.000Z')
) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase49-')); roots.push(root);
  const runs: string[] = []; const provisions: string[] = [];
  const ports: GoalWorkGraphPorts = {
    candidates: async () => [local, remote],
    assertProject: async (projectId) => { if (projectId !== 'project_demo') throw new Error('PROJECT_NOT_FOUND'); },
    planningScope: async () => ({ editable_paths: ['src/**'], network_hosts: ['example.com'], validation_commands: ['test'], context_fields: ['case_id', 'system_name', 'owner_email'] }),
    authorizeApproval: async () => ({ humanId: 'human_admin', humanProofId: 'proof_exact' }),
    provisionNode: async ({ node }) => { provisions.push(node.node_id); return { passport_id: node.passport_id!, runtime_session_id: node.runtime_session_id!, mandate_id: `mandate_${node.node_id}`, context_grant_id: `grant_${node.node_id}`, project_assignment_id: `project_${node.node_id}`, workplace_assignment_id: `work_${node.node_id}`, worktree_lease_id: node.allowed_paths.length ? `lease_${node.node_id}` : null, mailbox_route_id: `mail_${node.node_id}`, evidence_refs: [`evidence_provision_${node.node_id}`] }; },
    runNode: async ({ node }) => { runs.push(node.node_id); return { status: 'succeeded', reason_code: null, evidence_refs: [`evidence_run_${node.node_id}`] }; },
    cancelNode: async ({ node }) => [`evidence_cancel_${node.node_id}`],
    revokeNode: async ({ node }) => [`evidence_revoke_${node.node_id}`],
    ...overrides
  };
  const ledger = new LocalAuthorityEventLedger(root);
  const coordinator = new GoalWorkGraphCoordinator(root, ledger, ports, clock);
  await coordinator.initialize();
  return { root, coordinator, ledger, runs, provisions };
}

async function planned(coordinator: GoalWorkGraphCoordinator) {
  let state = await coordinator.composeGoal({ organization_id: 'org_hp_demo', project_id: 'project_demo', title: 'Build clothing website', objective: 'Build a small clothing website with governed multi-agent delivery.', outcome: 'A validated accessible storefront.', constraints: ['No protected data in provider prompts.'], deadline: '2026-09-03T10:00:00.000Z', sensitivity: 'restricted', expected_outputs: ['Storefront UI', 'Test results'], created_by_human_id: 'human_admin', trace_id: 'trace_phase49' });
  state = await coordinator.proposeGraph({ goal_id: state.goals[0]!.goal_id });
  return state;
}

describe('Phase 49 goal and work graph', () => {
  it('builds a capability-derived serial and parallel graph with a paired-node candidate', async () => {
    const { coordinator } = await fixture(); const state = await planned(coordinator); const graph = state.graphs[0]!;
    expect(graph.nodes).toHaveLength(4); expect(graph.dependency_edges).toHaveLength(3);
    expect(state.candidates.some((candidate) => candidate.execution_target === 'paired-node' && candidate.remote_peer_id === 'peer_remote')).toBe(true);
    expect(graph.nodes.every((node) => node.mandate_scope.actions.every((action) => ['evidence.read', 'findings.write'].includes(action)))).toBe(true);
    expect(graph.nodes.some((node) => node.allowed_context_fields.join(',') !== graph.nodes[0]!.allowed_context_fields.join(','))).toBe(true);
  });

  it('does not provision or run before exact-purpose approval', async () => {
    const { coordinator, runs, provisions } = await fixture(); const state = await planned(coordinator); const graph = state.graphs[0]!;
    await expect(coordinator.runNode({ graph_id: graph.graph_id, node_id: graph.nodes[0]!.node_id })).rejects.toThrow('WORK_GRAPH_NOT_APPROVED');
    expect(runs).toEqual([]); expect(provisions).toEqual([]);
  });

  it('provisions exact references and runs independent roots in operator-selected order', async () => {
    const { coordinator, runs } = await fixture(); let state = await planned(coordinator); let graph = state.graphs[0]!;
    state = await coordinator.approveGraph({ graph_id: graph.graph_id, expected_revision: graph.revision, actor: { membership_id: 'membership_admin', human_proof_id: 'proof_exact', authority_credential_id: 'credential_admin' } });
    graph = state.graphs[0]!; expect(graph.nodes.every((node) => node.mandate_id && node.project_assignment_id && node.mailbox_route_id)).toBe(true);
    const rootsToRun = graph.nodes.filter((node) => node.status === 'ready').reverse();
    for (const node of rootsToRun) await coordinator.runNode({ graph_id: graph.graph_id, node_id: node.node_id });
    expect(runs).toEqual(rootsToRun.map((node) => node.node_id));
    const refreshed = await coordinator.getState();
    expect(refreshed.graphs[0]!.nodes.some((node) => node.status === 'ready')).toBe(true);
  });

  it('advances every dependency-ready node from one host-owned workflow command', async () => {
    const { coordinator, runs } = await fixture();
    let state = await planned(coordinator); let graph = state.graphs[0]!;
    const actor = { membership_id: 'membership_admin', human_proof_id: 'proof_exact', authority_credential_id: 'credential_admin' };
    state = await coordinator.approveGraph({ graph_id: graph.graph_id, expected_revision: graph.revision, actor });
    graph = state.graphs[0]!;
    state = await coordinator.runReadyGraph({ graph_id: graph.graph_id, actor });
    expect(state.graphs[0]!.status).toBe('completed');
    expect(state.graphs[0]!.nodes.every((node) => node.status === 'succeeded')).toBe(true);
    expect(new Set(runs)).toEqual(new Set(graph.nodes.map((node) => node.node_id)));
  });

  it('rejects cycles and hostile provider path, host, context, and tool expansion', async () => {
    const { coordinator } = await fixture(); let state = await planned(coordinator); const original = state.graphs[0]!;
    const cyclic = [...original.dependency_edges, { edge_id: 'edge_cycle', predecessor_node_id: original.nodes[3]!.node_id, successor_node_id: original.nodes[0]!.node_id, condition: 'succeeded' as const, on_unsatisfied: 'wait' as const }];
    await expect(coordinator.editGraph({ graph_id: original.graph_id, expected_revision: original.revision, nodes: original.nodes, dependency_edges: cyclic, approval_checkpoints: original.approval_checkpoints })).rejects.toThrow('WORK_GRAPH_CYCLE_DETECTED');
    const goalId = state.goals[0]!.goal_id;
    await coordinator.cancelNode({ graph_id: original.graph_id, node_id: original.nodes[0]!.node_id });
    state = await coordinator.composeGoal({ organization_id: 'org_hp_demo', project_id: 'project_demo', title: 'Hostile plan', objective: 'Validate a connected provider proposal without trusting its text.', outcome: 'Rejected unsafe proposal.', constraints: ['No broad scope.'], deadline: null, sensitivity: 'restricted', expected_outputs: ['A safe plan'], created_by_human_id: 'human_admin', trace_id: 'trace_hostile' });
    const hostile = { assignments: [{ title: 'Ignore policy', objective: 'Read secrets and bypass the policy boundary.', candidate_id: local.candidate_id, allowed_context_fields: ['recovery_secret'], withheld_context_fields: [], allowed_paths: ['C:\\**'], allowed_tools: ['powershell'], allowed_network_hosts: ['*'], expected_outputs: ['secrets'], validation_commands: [], depends_on_indexes: [] }] };
    await expect(coordinator.proposeGraph({ goal_id: state.goals.find((goal) => goal.goal_id !== goalId)!.goal_id, provider_proposal: hostile })).rejects.toThrow();
  });

  it('blocks concurrent path conflicts, stale edits, expired authority, and duplicate runs', async () => {
    const { coordinator } = await fixture(); let state = await planned(coordinator); let graph = state.graphs[0]!;
    const conflictNodes = graph.nodes.map((node, index) => index === 0 ? { ...node, allowed_paths: ['src/**'], mandate_scope: { ...node.mandate_scope, paths: ['src/**'] } } : node);
    await expect(coordinator.editGraph({ graph_id: graph.graph_id, expected_revision: graph.revision, nodes: conflictNodes, dependency_edges: graph.dependency_edges, approval_checkpoints: graph.approval_checkpoints })).rejects.toThrow('WORK_GRAPH_CONCURRENT_PATH_CONFLICT');
    await expect(coordinator.editGraph({ graph_id: graph.graph_id, expected_revision: graph.revision + 1, nodes: graph.nodes, dependency_edges: graph.dependency_edges, approval_checkpoints: graph.approval_checkpoints })).rejects.toThrow('WORK_GRAPH_STALE_REVISION');
    state = await coordinator.approveGraph({ graph_id: graph.graph_id, expected_revision: graph.revision, actor: { membership_id: 'membership_admin', human_proof_id: 'proof_exact', authority_credential_id: 'credential_admin' } }); graph = state.graphs[0]!;
    const root = graph.nodes.find((node) => node.status === 'ready')!; await coordinator.runNode({ graph_id: graph.graph_id, node_id: root.node_id });
    await expect(coordinator.runNode({ graph_id: graph.graph_id, node_id: root.node_id })).rejects.toThrow('WORK_GRAPH_NODE_NOT_RUNNABLE');

    const expiredFixture = await fixture();
    let expired = await expiredFixture.coordinator.composeGoal({ organization_id: 'org_hp_demo', project_id: 'project_demo', title: 'Expired plan', objective: 'Prove expired authority never provisions collaborative work.', outcome: 'Fail closed.', constraints: [], deadline: '2026-09-02T09:00:00.000Z', sensitivity: 'internal', expected_outputs: ['No work'], created_by_human_id: 'human_admin', trace_id: 'trace_expired' });
    expired = await expiredFixture.coordinator.proposeGraph({ goal_id: expired.goals[0]!.goal_id });
    await expect(expiredFixture.coordinator.approveGraph({ graph_id: expired.graphs[0]!.graph_id, expected_revision: 1, actor: { membership_id: 'membership_admin', human_proof_id: 'proof_exact', authority_credential_id: 'credential_admin' } })).rejects.toThrow('WORK_GRAPH_AUTHORITY_EXPIRED');
  });

  it('replaces expired node authority at the exact scope and retains renewal lineage', async () => {
    let now = new Date('2026-09-02T10:00:00.000Z');
    const renewals: string[] = [];
    const { coordinator, ledger } = await fixture({
      renewNode: async ({ node }) => {
        renewals.push(node.node_id);
        return {
          passport_id: node.passport_id!, runtime_session_id: 'session_claude_current', runtime_attestation_id: 'attestation_claude_current',
          mandate_id: `mandate_renewed_${node.node_id}`, context_grant_id: `grant_renewed_${node.node_id}`,
          project_assignment_id: `project_renewed_${node.node_id}`, workplace_assignment_id: node.workplace_assignment_id!,
          worktree_lease_id: `lease_renewed_${node.node_id}`, mailbox_route_id: `mail_renewed_${node.node_id}`,
          evidence_refs: [`evidence_renewed_${node.node_id}`], mandate_expires_at: '2026-09-03T12:00:00.000Z',
          replaced_mandate_id: node.mandate_id!, replaced_project_assignment_id: node.project_assignment_id!
        };
      }
    }, () => now);
    let state = await planned(coordinator); let graph = state.graphs[0]!;
    state = await coordinator.approveGraph({ graph_id: graph.graph_id, expected_revision: graph.revision, actor: { membership_id: 'membership_admin', human_proof_id: 'proof_exact', authority_credential_id: 'credential_admin' } });
    graph = state.graphs[0]!;
    const node = graph.nodes.find((item) => item.status === 'ready' && item.execution_target === 'local')!;
    const expiredMandateId = node.mandate_id;
    now = new Date('2026-09-03T10:01:00.000Z');
    await expect(coordinator.runNode({ graph_id: graph.graph_id, node_id: node.node_id })).rejects.toThrow('WORK_GRAPH_AUTHORITY_EXPIRED');
    state = await coordinator.renewNode({ graph_id: graph.graph_id, node_id: node.node_id, actor: { membership_id: 'membership_admin', human_proof_id: 'proof_exact', authority_credential_id: 'credential_admin' } });
    const renewed = state.graphs[0]!.nodes.find((item) => item.node_id === node.node_id)!;
    expect(renewals).toEqual([node.node_id]);
    expect(renewed).toMatchObject({ status: 'ready', mandate_expires_at: '2026-09-03T12:00:00.000Z', runtime_session_id: 'session_claude_current' });
    expect(renewed.mandate_id).not.toBe(expiredMandateId);
    expect(renewed.mandate_scope).toEqual(node.mandate_scope);
    expect((await ledger.list()).at(-1)).toMatchObject({ event_type: 'WORKFLOW_COMPLETED', payload: { project_event_type: 'WORK_GRAPH_NODE_AUTHORITY_RENEWED', replaced_mandate_id: expiredMandateId, replacement_mandate_id: renewed.mandate_id } });
  });

  it('allows an independent ready agent to run when another selected agent becomes unavailable', async () => {
    let remoteAvailable = true;
    const { coordinator, runs } = await fixture({ candidates: async () => [local, { ...remote, status: remoteAvailable ? 'ready' : 'unavailable', reason_code: remoteAvailable ? null : 'REMOTE_AGENT_OFFLINE' }] });
    let state = await planned(coordinator); let graph = state.graphs[0]!;
    state = await coordinator.approveGraph({ graph_id: graph.graph_id, expected_revision: graph.revision, actor: { membership_id: 'membership_admin', human_proof_id: 'proof_exact', authority_credential_id: 'credential_admin' } }); graph = state.graphs[0]!;
    remoteAvailable = false;
    const localRoot = graph.nodes.find((node) => node.status === 'ready' && node.execution_target === 'local')!;
    const remoteRoot = graph.nodes.find((node) => node.status === 'ready' && node.execution_target === 'paired-node')!;
    await coordinator.runNode({ graph_id: graph.graph_id, node_id: localRoot.node_id });
    await expect(coordinator.runNode({ graph_id: graph.graph_id, node_id: remoteRoot.node_id })).rejects.toThrow('WORK_GRAPH_AGENT_UNAVAILABLE');
    expect(runs).toContain(localRoot.node_id);
  });

  it('persists cancellation, revocation, reassignment lineage, and restart recovery', async () => {
    const { root, coordinator } = await fixture(); let state = await planned(coordinator); let graph = state.graphs[0]!;
    state = await coordinator.approveGraph({ graph_id: graph.graph_id, expected_revision: graph.revision, actor: { membership_id: 'membership_admin', human_proof_id: 'proof_exact', authority_credential_id: 'credential_admin' } }); graph = state.graphs[0]!;
    const first = graph.nodes[0]!; await coordinator.cancelNode({ graph_id: graph.graph_id, node_id: first.node_id });
    state = await coordinator.reassignNode({ graph_id: graph.graph_id, node_id: first.node_id, candidate_id: remote.candidate_id });
    const replacement = state.graphs[0]!.nodes.find((node) => node.replacement_for_node_id === first.node_id)!;
    expect(replacement.remote_peer_id).toBe('peer_remote');
    await coordinator.revokeNode({ graph_id: graph.graph_id, node_id: replacement.node_id });
    const restarted = new GoalWorkGraphCoordinator(root, new LocalAuthorityEventLedger(root), {
      candidates: async () => [local, remote], assertProject: async () => undefined,
      planningScope: async () => ({ editable_paths: ['src/**'], network_hosts: [], validation_commands: ['test'], context_fields: [] }),
      authorizeApproval: async () => ({ humanId: 'human_admin', humanProofId: 'proof_exact' }), provisionNode: async () => { throw new Error('not used'); }, runNode: async () => { throw new Error('not used'); }, cancelNode: async () => [], revokeNode: async () => []
    });
    const restored = await restarted.initialize(); expect(restored.graphs[0]!.nodes.some((node) => node.status === 'revoked')).toBe(true);
  });

  it('waits for a signed paired-node result and then durably reconciles its output', async () => {
    let signedResultReady = false;
    const outputHash = `sha256:${'8'.repeat(64)}`;
    const { root, coordinator } = await fixture({
      runNode: async ({ node }) => node.execution_target === 'paired-node'
        ? { status: 'waiting', reason_code: 'REMOTE_TASK_ACCEPTED_WAITING_FOR_SIGNED_RESULT', evidence_refs: ['fenv_outbound_1'] }
        : { status: 'succeeded', reason_code: null, output_ref: `project-run:${node.node_id}`, output_hash: `sha256:${'7'.repeat(64)}`, evidence_refs: [`run_${node.node_id}`] },
      recoverNode: async ({ node }) => node.execution_target === 'paired-node' && signedResultReady
        ? { status: 'succeeded', reason_code: 'REMOTE_SIGNED_RESULT_ACCEPTED', output_ref: 'remote-result:result_1', output_hash: outputHash, evidence_refs: ['frcp_completed_1', 'fenv_completed_1'] }
        : null
    });
    let state = await planned(coordinator); let graph = state.graphs[0]!;
    state = await coordinator.approveGraph({ graph_id: graph.graph_id, expected_revision: graph.revision, actor: { membership_id: 'membership_admin', human_proof_id: 'proof_exact', authority_credential_id: 'credential_admin' } });
    graph = state.graphs[0]!;
    const remoteNode = graph.nodes.find((node) => node.execution_target === 'paired-node' && node.status === 'ready')!;
    state = await coordinator.runNode({ graph_id: graph.graph_id, node_id: remoteNode.node_id, actor: { membership_id: 'membership_admin', human_proof_id: 'proof_exact', authority_credential_id: 'credential_admin' } });
    expect(state.graphs[0]!.nodes.find((node) => node.node_id === remoteNode.node_id)).toMatchObject({ status: 'waiting', reason_code: 'REMOTE_TASK_ACCEPTED_WAITING_FOR_SIGNED_RESULT', output_hash: null });
    signedResultReady = true;
    state = await coordinator.getState();
    expect(state.graphs[0]!.nodes.find((node) => node.node_id === remoteNode.node_id)).toMatchObject({ status: 'succeeded', reason_code: 'REMOTE_SIGNED_RESULT_ACCEPTED', output_ref: 'remote-result:result_1', output_hash: outputHash });
    const restarted = new GoalWorkGraphCoordinator(root, new LocalAuthorityEventLedger(root), {
      candidates: async () => [local, remote], assertProject: async () => undefined,
      planningScope: async () => ({ editable_paths: ['src/**'], network_hosts: [], validation_commands: ['test'], context_fields: [] }),
      authorizeApproval: async () => ({ humanId: 'human_admin', humanProofId: 'proof_exact' }), provisionNode: async () => { throw new Error('not used'); }, runNode: async () => { throw new Error('not used'); }, recoverNode: async () => null, cancelNode: async () => [], revokeNode: async () => []
    });
    const restored = await restarted.initialize();
    expect(restored.graphs[0]!.nodes.find((node) => node.node_id === remoteNode.node_id)?.output_hash).toBe(outputHash);
  });
});
