import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  approveWorkGraphRequestSchema,
  collaborativeGoalSchema,
  composeCollaborativeGoalRequestSchema,
  editWorkGraphRequestSchema,
  goalWorkGraphStateSchema,
  proposeWorkGraphRequestSchema,
  reassignWorkGraphNodeRequestSchema,
  renewWorkGraphNodeRequestSchema,
  runWorkGraphRequestSchema,
  workGraphDependencyEdgeSchema,
  workGraphNodeCommandRequestSchema,
  workGraphNodeSchema,
  workGraphPlanDiffSchema,
  workGraphSchema,
  type ApproveWorkGraphRequest,
  type CollaborativeGoal,
  type ComposeCollaborativeGoalRequest,
  type EditWorkGraphRequest,
  type GoalWorkGraphState,
  type ProposeWorkGraphRequest,
  type ReassignWorkGraphNodeRequest,
  type RenewWorkGraphNodeRequest,
  type RunWorkGraphRequest,
  type WorkGraph,
  type WorkGraphAgentCandidate,
  type WorkGraphNode,
  type WorkGraphNodeCommandRequest
} from '@h2a/contracts';
import { hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const storedStateSchema = goalWorkGraphStateSchema.omit({ candidates: true });
type StoredState = z.infer<typeof storedStateSchema>;

export interface WorkGraphProvisionResult {
  passport_id: string;
  runtime_session_id: string;
  mandate_id: string;
  context_grant_id: string | null;
  project_assignment_id: string;
  workplace_assignment_id: string;
  worktree_lease_id: string | null;
  mailbox_route_id: string;
  evidence_refs: string[];
}

export interface WorkGraphRenewalResult extends WorkGraphProvisionResult {
  mandate_expires_at: string;
  replaced_mandate_id: string;
  replaced_project_assignment_id: string;
}

export interface WorkGraphRunResult {
  status: 'running' | 'succeeded' | 'failed' | 'waiting';
  reason_code: string | null;
  evidence_refs: string[];
  output_ref?: string | null;
  output_hash?: string | null;
}

export interface GoalWorkGraphPorts {
  candidates(): Promise<WorkGraphAgentCandidate[]>;
  assertProject(projectId: string): Promise<void>;
  planningScope(projectId: string, organizationId: string): Promise<{ editable_paths: string[]; network_hosts: string[]; validation_commands: string[]; context_fields: string[] }>;
  authorizeApproval(actor: ApproveWorkGraphRequest['actor'], organizationId: string): Promise<{ humanId: string; humanProofId: string }>;
  provisionNode(input: { goal: CollaborativeGoal; graph: WorkGraph; node: WorkGraphNode; actor: ApproveWorkGraphRequest['actor'] }): Promise<WorkGraphProvisionResult>;
  renewNode?(input: { goal: CollaborativeGoal; graph: WorkGraph; node: WorkGraphNode; actor: RenewWorkGraphNodeRequest['actor'] }): Promise<WorkGraphRenewalResult>;
  runNode(input: { goal: CollaborativeGoal; graph: WorkGraph; node: WorkGraphNode; actor?: WorkGraphNodeCommandRequest['actor'] }): Promise<WorkGraphRunResult>;
  recoverNode?(input: { goal: CollaborativeGoal; graph: WorkGraph; node: WorkGraphNode }): Promise<WorkGraphRunResult | null>;
  cancelNode(input: { goal: CollaborativeGoal; graph: WorkGraph; node: WorkGraphNode; actor?: WorkGraphNodeCommandRequest['actor'] }): Promise<string[]>;
  revokeNode(input: { goal: CollaborativeGoal; graph: WorkGraph; node: WorkGraphNode; actor?: WorkGraphNodeCommandRequest['actor'] }): Promise<string[]>;
}

export class GoalWorkGraphCoordinator {
  private readonly repository: VersionedJsonRepository<'h2a.v1.goal-work-graphs', StoredState>;
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly ports: GoalWorkGraphPorts,
    private readonly clock: () => Date = () => new Date()
  ) {
    const initialData: StoredState = { schema_version: 1, goals: [], graphs: [], diffs: [], generated_at: clock().toISOString(), trust_ceiling: 'connected-observed' };
    this.repository = new VersionedJsonRepository(new AtomicFileStore(dataPath), 'projects/goal-work-graphs-v1.json', 'h2a.v1.goal-work-graphs', storedStateSchema, { initialData, clock });
  }

  public async initialize(): Promise<GoalWorkGraphState> {
    const state = await this.repository.read();
    const now = this.clock().toISOString();
    const interrupted = state.graphs.map((graph) => ({
      ...graph,
      status: graph.status === 'running' ? 'blocked' as const : graph.status,
      nodes: graph.nodes.map((node) => node.status === 'running' ? workGraphNodeSchema.parse({ ...node, status: 'waiting', reason_code: 'HOST_PROCESS_RESTARTED' }) : node),
      updated_at: graph.status === 'running' || graph.nodes.some((node) => node.status === 'running') ? now : graph.updated_at
    }));
    if (hashCanonical(interrupted) !== hashCanonical(state.graphs)) await this.repository.write({ ...state, graphs: interrupted, generated_at: now });
    return this.getState();
  }

  public getState(): Promise<GoalWorkGraphState> {
    return this.serialize(async () => {
      const stored = await this.reconcile(await this.repository.read());
      return goalWorkGraphStateSchema.parse({ ...stored, candidates: await this.ports.candidates(), generated_at: this.clock().toISOString() });
    });
  }

  public composeGoal(request: ComposeCollaborativeGoalRequest): Promise<GoalWorkGraphState> {
    return this.serialize(async () => {
      const input = composeCollaborativeGoalRequestSchema.parse(request);
      await this.ports.assertProject(input.project_id);
      const now = this.clock().toISOString();
      const goal = collaborativeGoalSchema.parse({ schema_version: 1, goal_id: `collaborative_goal_${randomUUID()}`, ...input, status: 'draft', created_at: now, updated_at: now });
      const state = await this.repository.read();
      await this.repository.write({ ...state, goals: [...state.goals, goal], generated_at: now });
      await this.record(goal.trace_id, goal.goal_id, 'GOAL_COMPOSED', { project_id: goal.project_id, sensitivity: goal.sensitivity, expected_outputs: goal.expected_outputs });
      return this.stateUnlocked();
    });
  }

  public proposeGraph(request: ProposeWorkGraphRequest): Promise<GoalWorkGraphState> {
    return this.serialize(async () => {
      const input = proposeWorkGraphRequestSchema.parse(request);
      const state = await this.repository.read();
      const goal = required(state.goals.find((item) => item.goal_id === input.goal_id), 'Collaborative goal was not found.');
      if (state.graphs.some((item) => item.goal_id === goal.goal_id && !['cancelled', 'completed'].includes(item.status))) throw new Error('An active work graph already exists for this goal.');
      const candidates = await this.ports.candidates();
      const planningScope = await this.ports.planningScope(goal.project_id, goal.organization_id);
      const proposal = input.provider_proposal === undefined
        ? deterministicProposal(goal, candidates, planningScope, this.clock)
        : validateProviderProposal(input.provider_proposal, goal, candidates, this.clock);
      validateGraphSecurity(proposal, candidates);
      const nextGoal = collaborativeGoalSchema.parse({ ...goal, status: 'planned', updated_at: this.clock().toISOString() });
      await this.repository.write({ ...state, goals: replaceBy(state.goals, goal.goal_id, 'goal_id', nextGoal), graphs: [...state.graphs, proposal], generated_at: this.clock().toISOString() });
      await this.record(goal.trace_id, proposal.graph_id, 'WORK_GRAPH_PROPOSED', { goal_id: goal.goal_id, revision: proposal.revision, plan_hash: proposal.plan_hash, proposed_by: proposal.proposed_by });
      return this.stateUnlocked();
    });
  }

  public editGraph(request: EditWorkGraphRequest): Promise<GoalWorkGraphState> {
    return this.serialize(async () => {
      const input = editWorkGraphRequestSchema.parse(request);
      const state = await this.repository.read();
      const current = required(state.graphs.find((item) => item.graph_id === input.graph_id), 'Work graph was not found.');
      if (current.status !== 'draft' || current.revision !== input.expected_revision) throw new Error('WORK_GRAPH_STALE_REVISION');
      const candidates = await this.ports.candidates();
      const now = this.clock().toISOString();
      const unsigned = { ...current, nodes: input.nodes, dependency_edges: input.dependency_edges, approval_checkpoints: input.approval_checkpoints, revision: current.revision + 1, updated_at: now };
      const next = workGraphSchema.parse({ ...unsigned, plan_hash: graphHash(unsigned) });
      validateGraphSecurity(next, candidates);
      assertAcyclic(next);
      const diff = diffGraphs(current, next, now);
      await this.repository.write({ ...state, graphs: replaceBy(state.graphs, current.graph_id, 'graph_id', next), diffs: [...state.diffs, diff], generated_at: now });
      await this.record(next.trace_id, next.graph_id, 'WORK_GRAPH_EDITED', { revision: next.revision, plan_hash: next.plan_hash, diff_id: diff.diff_id, changed_node_ids: diff.changed_node_ids });
      return this.stateUnlocked();
    });
  }

  public approveGraph(request: ApproveWorkGraphRequest): Promise<GoalWorkGraphState> {
    return this.serialize(async () => {
      const input = approveWorkGraphRequestSchema.parse(request);
      let state = await this.repository.read();
      const current = required(state.graphs.find((item) => item.graph_id === input.graph_id), 'Work graph was not found.');
      if (current.status === 'approved' || current.status === 'running' || current.status === 'completed') return this.stateUnlocked();
      if (current.status !== 'draft' || current.revision !== input.expected_revision) throw new Error('WORK_GRAPH_STALE_REVISION');
      const goal = required(state.goals.find((item) => item.goal_id === current.goal_id), 'Collaborative goal was not found.');
      const candidates = await this.ports.candidates();
      validateGraphSecurity(current, candidates);
      assertAcyclic(current);
      if (current.nodes.some((node) => new Date(node.mandate_expires_at).getTime() <= this.clock().getTime())) throw new Error('WORK_GRAPH_AUTHORITY_EXPIRED');
      const proof = await this.ports.authorizeApproval(input.actor, goal.organization_id);
      const provisioned: WorkGraphNode[] = [];
      for (const node of topologicalNodes(current)) {
        if (node.status === 'replacement-required') { provisioned.push(node); continue; }
        if ([node.mandate_id, node.project_assignment_id, node.workplace_assignment_id, node.mailbox_route_id].every(Boolean)) {
          provisioned.push(workGraphNodeSchema.parse({ ...node, status: dependenciesOf(current, node.node_id).length === 0 ? 'ready' : 'waiting', reason_code: dependenciesOf(current, node.node_id).length === 0 ? null : 'DEPENDENCY_WAITING' }));
          continue;
        }
        const result = await this.ports.provisionNode({ goal, graph: current, node, actor: input.actor });
        provisioned.push(workGraphNodeSchema.parse({ ...node, ...result, status: dependenciesOf(current, node.node_id).length === 0 ? 'ready' : 'waiting', reason_code: dependenciesOf(current, node.node_id).length === 0 ? null : 'DEPENDENCY_WAITING', evidence_refs: unique([...node.evidence_refs, ...result.evidence_refs]) }));
      }
      const now = this.clock().toISOString();
      const approved = workGraphSchema.parse({ ...current, status: 'approved', nodes: current.nodes.map((node) => provisioned.find((item) => item.node_id === node.node_id)!), approved_by_human_id: proof.humanId, approved_human_proof_id: proof.humanProofId, updated_at: now });
      const approvedGoal = collaborativeGoalSchema.parse({ ...goal, status: 'approved', updated_at: now });
      state = await this.repository.write({ ...state, goals: replaceBy(state.goals, goal.goal_id, 'goal_id', approvedGoal), graphs: replaceBy(state.graphs, current.graph_id, 'graph_id', approved), generated_at: now });
      await this.record(goal.trace_id, approved.graph_id, 'WORK_GRAPH_APPROVED', { revision: approved.revision, plan_hash: approved.plan_hash, human_proof_id: proof.humanProofId, node_authority: approved.nodes.map((node) => ({ node_id: node.node_id, passport_id: node.passport_id, mandate_id: node.mandate_id, context_grant_id: node.context_grant_id, assignment_id: node.project_assignment_id, remote_peer_id: node.remote_peer_id })) });
      return goalWorkGraphStateSchema.parse({ ...state, candidates, generated_at: now });
    });
  }

  public runNode(request: WorkGraphNodeCommandRequest): Promise<GoalWorkGraphState> {
    return this.serialize(async () => {
      const input = workGraphNodeCommandRequestSchema.parse(request);
      const state = await this.repository.read();
      const graph = required(state.graphs.find((item) => item.graph_id === input.graph_id), 'Work graph was not found.');
      if (!['approved', 'running', 'blocked'].includes(graph.status)) throw new Error('WORK_GRAPH_NOT_APPROVED');
      const node = required(graph.nodes.find((item) => item.node_id === input.node_id), 'Work graph node was not found.');
      if (!['ready', 'failed', 'cancelled', 'waiting'].includes(node.status)) throw new Error('WORK_GRAPH_NODE_NOT_RUNNABLE');
      if (new Date(node.mandate_expires_at).getTime() <= this.clock().getTime()) throw new Error('WORK_GRAPH_AUTHORITY_EXPIRED');
      const candidate = required((await this.ports.candidates()).find((item) => item.agent_id === node.agent_id && item.remote_peer_id === node.remote_peer_id), 'WORK_GRAPH_AGENT_UNAVAILABLE');
      if (candidate.status !== 'ready') throw new Error(`WORK_GRAPH_AGENT_UNAVAILABLE:${candidate.reason_code ?? candidate.status}`);
      assertCandidateCanRun(node, candidate);
      const unresolved = dependenciesOf(graph, node.node_id).filter((id) => graph.nodes.find((item) => item.node_id === id)?.status !== 'succeeded');
      if (unresolved.length > 0) throw new Error(`WORK_GRAPH_DEPENDENCY_WAITING:${unresolved.join(',')}`);
      const goal = required(state.goals.find((item) => item.goal_id === graph.goal_id), 'Collaborative goal was not found.');
      const result = await this.ports.runNode({ goal, graph, node, actor: input.actor });
      const now = this.clock().toISOString();
      let nodes = graph.nodes.map((item) => item.node_id === node.node_id ? workGraphNodeSchema.parse({ ...item, status: result.status, reason_code: result.reason_code, output_ref: result.output_ref ?? item.output_ref ?? null, output_hash: result.output_hash ?? item.output_hash ?? null, evidence_refs: unique([...item.evidence_refs, ...result.evidence_refs]) }) : item);
      nodes = nodes.map((item) => item.status === 'waiting' && item.reason_code === 'DEPENDENCY_WAITING' && dependenciesOf(graph, item.node_id).every((id) => nodes.find((candidate) => candidate.node_id === id)?.status === 'succeeded') ? workGraphNodeSchema.parse({ ...item, status: 'ready', reason_code: null }) : item);
      const completed = nodes.every((item) => item.status === 'succeeded');
      const nextGraph = workGraphSchema.parse({ ...graph, nodes, status: completed ? 'completed' : result.status === 'failed' ? 'blocked' : 'running', updated_at: now });
      const nextGoal = collaborativeGoalSchema.parse({ ...goal, status: completed ? 'completed' : result.status === 'failed' ? 'blocked' : 'running', updated_at: now });
      await this.repository.write({ ...state, goals: replaceBy(state.goals, goal.goal_id, 'goal_id', nextGoal), graphs: replaceBy(state.graphs, graph.graph_id, 'graph_id', nextGraph), generated_at: now });
      await this.record(goal.trace_id, node.node_id, 'WORK_GRAPH_NODE_RUN', { graph_id: graph.graph_id, status: result.status, reason_code: result.reason_code, output_ref: result.output_ref, output_hash: result.output_hash, predecessor_hashes: dependenciesOf(graph, node.node_id).flatMap((id) => graph.nodes.find((item) => item.node_id === id)?.output_hash ? [graph.nodes.find((item) => item.node_id === id)!.output_hash!] : []) });
      return this.stateUnlocked();
    });
  }

  public async runReadyGraph(request: RunWorkGraphRequest): Promise<GoalWorkGraphState> {
    const input = runWorkGraphRequestSchema.parse(request);
    const attempted = new Set<string>();
    for (let pass = 0; pass < 100; pass += 1) {
      const state = await this.getState();
      const graph = required(state.graphs.find((item) => item.graph_id === input.graph_id), 'Work graph was not found.');
      if (!['approved', 'running', 'blocked'].includes(graph.status)) return state;
      const runnable = graph.nodes.filter((node) => {
        if (attempted.has(node.node_id) || !['ready', 'failed', 'cancelled'].includes(node.status)) return false;
        if (Date.parse(node.mandate_expires_at) <= this.clock().getTime()) return false;
        return dependenciesOf(graph, node.node_id).every((id) => graph.nodes.find((candidate) => candidate.node_id === id)?.status === 'succeeded');
      });
      if (runnable.length === 0) return state;
      for (const node of runnable) {
        attempted.add(node.node_id);
        await this.runNode({ graph_id: graph.graph_id, node_id: node.node_id, actor: input.actor });
      }
    }
    throw new Error('WORK_GRAPH_AUTOMATION_LIMIT');
  }

  public renewNode(request: RenewWorkGraphNodeRequest): Promise<GoalWorkGraphState> {
    return this.serialize(async () => {
      const input = renewWorkGraphNodeRequestSchema.parse(request);
      const state = await this.repository.read();
      const graph = required(state.graphs.find((item) => item.graph_id === input.graph_id), 'Work graph was not found.');
      const node = required(graph.nodes.find((item) => item.node_id === input.node_id), 'Work graph node was not found.');
      const goal = required(state.goals.find((item) => item.goal_id === graph.goal_id), 'Collaborative goal was not found.');
      if (!['approved', 'running', 'blocked'].includes(graph.status)) throw new Error('WORK_GRAPH_NOT_APPROVED');
      if (['succeeded', 'revoked', 'replacement-required'].includes(node.status)) throw new Error('WORK_GRAPH_AUTHORITY_NOT_RENEWABLE');
      if (new Date(node.mandate_expires_at).getTime() > this.clock().getTime()) throw new Error('WORK_GRAPH_AUTHORITY_STILL_ACTIVE');
      if (!this.ports.renewNode) throw new Error('WORK_GRAPH_AUTHORITY_RENEWAL_UNAVAILABLE');
      const proof = await this.ports.authorizeApproval(input.actor, goal.organization_id);
      const renewed = await this.ports.renewNode({ goal, graph, node, actor: input.actor });
      const { replaced_mandate_id, replaced_project_assignment_id, ...replacement } = renewed;
      const dependenciesReady = dependenciesOf(graph, node.node_id).every((id) => graph.nodes.find((item) => item.node_id === id)?.status === 'succeeded');
      const nextNode = workGraphNodeSchema.parse({
        ...node,
        ...replacement,
        mandate_expires_at: renewed.mandate_expires_at,
        status: dependenciesReady ? 'ready' : 'waiting',
        reason_code: dependenciesReady ? null : 'DEPENDENCY_WAITING',
        evidence_refs: unique([...node.evidence_refs, ...renewed.evidence_refs])
      });
      const now = this.clock().toISOString();
      const nodes = graph.nodes.map((item) => item.node_id === node.node_id ? nextNode : item);
      const nextGraph = workGraphSchema.parse({ ...graph, nodes, status: nodes.some((item) => item.status === 'succeeded') ? 'running' : 'approved', updated_at: now });
      const nextGoal = collaborativeGoalSchema.parse({ ...goal, status: nextGraph.status === 'running' ? 'running' : 'approved', updated_at: now });
      await this.repository.write({ ...state, goals: replaceBy(state.goals, goal.goal_id, 'goal_id', nextGoal), graphs: replaceBy(state.graphs, graph.graph_id, 'graph_id', nextGraph), generated_at: now });
      await this.record(goal.trace_id, node.node_id, 'WORK_GRAPH_NODE_AUTHORITY_RENEWED', {
        graph_id: graph.graph_id,
        human_proof_id: proof.humanProofId,
        replaced_mandate_id,
        replacement_mandate_id: renewed.mandate_id,
        replaced_project_assignment_id,
        replacement_project_assignment_id: renewed.project_assignment_id,
        exact_scope_hash: hashCanonical(node.mandate_scope),
        expires_at: renewed.mandate_expires_at
      });
      return this.stateUnlocked();
    });
  }

  private async reconcile(state: StoredState): Promise<StoredState> {
    if (!this.ports.recoverNode) return state;
    let changed = false;
    const goals = [...state.goals];
    const graphs: WorkGraph[] = [];
    for (const graph of state.graphs) {
      const goal = state.goals.find((item) => item.goal_id === graph.goal_id);
      if (!goal || !['approved', 'running', 'blocked'].includes(graph.status)) { graphs.push(graph); continue; }
      let nodes = [...graph.nodes];
      for (const node of graph.nodes) {
        if (!['waiting', 'running'].includes(node.status)) continue;
        if (!['REMOTE_TASK_ACCEPTED_WAITING_FOR_SIGNED_RESULT', 'HOST_PROCESS_RESTARTED'].includes(node.reason_code ?? '')) continue;
        const result = await this.ports.recoverNode({ goal, graph: { ...graph, nodes }, node });
        if (!result || (result.status === node.status && result.reason_code === node.reason_code)) continue;
        changed = true;
        nodes = nodes.map((item) => item.node_id === node.node_id ? workGraphNodeSchema.parse({
          ...item,
          status: result.status,
          reason_code: result.reason_code,
          output_ref: result.output_ref ?? item.output_ref ?? null,
          output_hash: result.output_hash ?? item.output_hash ?? null,
          evidence_refs: unique([...item.evidence_refs, ...result.evidence_refs])
        }) : item);
        await this.record(goal.trace_id, node.node_id, 'WORK_GRAPH_NODE_RECOVERED', { graph_id: graph.graph_id, status: result.status, reason_code: result.reason_code, output_ref: result.output_ref, output_hash: result.output_hash });
      }
      nodes = nodes.map((item) => item.status === 'waiting' && item.reason_code === 'DEPENDENCY_WAITING' && dependenciesOf(graph, item.node_id).every((id) => nodes.find((candidate) => candidate.node_id === id)?.status === 'succeeded') ? workGraphNodeSchema.parse({ ...item, status: 'ready', reason_code: null }) : item);
      const completed = nodes.every((item) => item.status === 'succeeded');
      const failed = nodes.some((item) => ['failed', 'denied', 'revoked', 'replacement-required'].includes(item.status));
      const nextStatus = completed ? 'completed' as const : failed ? 'blocked' as const : graph.status;
      const next = workGraphSchema.parse({ ...graph, nodes, status: nextStatus, updated_at: changed ? this.clock().toISOString() : graph.updated_at });
      graphs.push(next);
      if (completed || failed) {
        const index = goals.findIndex((item) => item.goal_id === goal.goal_id);
        if (index >= 0) goals[index] = collaborativeGoalSchema.parse({ ...goal, status: completed ? 'completed' : 'blocked', updated_at: next.updated_at });
      }
    }
    if (!changed) return state;
    return this.repository.write({ ...state, goals, graphs, generated_at: this.clock().toISOString() });
  }

  public cancelNode(request: WorkGraphNodeCommandRequest): Promise<GoalWorkGraphState> { return this.lifecycle(request, 'cancelled'); }
  public revokeNode(request: WorkGraphNodeCommandRequest): Promise<GoalWorkGraphState> { return this.lifecycle(request, 'revoked'); }

  public reassignNode(request: ReassignWorkGraphNodeRequest): Promise<GoalWorkGraphState> {
    return this.serialize(async () => {
      const input = reassignWorkGraphNodeRequestSchema.parse(request);
      const state = await this.repository.read();
      const graph = required(state.graphs.find((item) => item.graph_id === input.graph_id), 'Work graph was not found.');
      const current = required(graph.nodes.find((item) => item.node_id === input.node_id), 'Work graph node was not found.');
      if (['running', 'succeeded'].includes(current.status)) throw new Error('Active or accepted work must be cancelled before reassignment.');
      const candidate = required((await this.ports.candidates()).find((item) => item.candidate_id === input.candidate_id), 'Replacement agent candidate was not found.');
      if (candidate.status !== 'ready') throw new Error('Replacement agent is not ready.');
      if (current.allowed_tools.some((tool) => !candidate.capabilities.includes(tool))) throw new Error('WORK_GRAPH_CAPABILITY_ESCALATION');
      const now = this.clock().toISOString();
      const replacement = workGraphNodeSchema.parse({ ...current, node_id: `work_node_${randomUUID()}`, human_owner_id: candidate.human_owner_id, agent_id: candidate.agent_id, runtime_binding_id: candidate.runtime_binding_id, execution_target: candidate.execution_target, remote_peer_id: candidate.remote_peer_id, passport_id: candidate.passport_id, runtime_session_id: candidate.runtime_session_id, runtime_attestation_id: candidate.runtime_attestation_id, mandate_id: null, context_grant_id: null, project_assignment_id: null, workplace_assignment_id: null, worktree_lease_id: null, mailbox_route_id: null, provider: candidate.provider, replacement_for_node_id: current.node_id, status: 'draft', reason_code: null, evidence_refs: [] });
      const nodes = graph.nodes.map((item) => item.node_id === current.node_id ? workGraphNodeSchema.parse({ ...item, status: 'replacement-required', reason_code: 'REASSIGNED' }) : item).concat(replacement);
      const edges = graph.dependency_edges.map((edge) => workGraphDependencyEdgeSchema.parse({ ...edge, predecessor_node_id: edge.predecessor_node_id === current.node_id ? replacement.node_id : edge.predecessor_node_id, successor_node_id: edge.successor_node_id === current.node_id ? replacement.node_id : edge.successor_node_id }));
      const unsigned = { ...graph, status: 'draft' as const, nodes, dependency_edges: edges, revision: graph.revision + 1, approved_by_human_id: null, approved_human_proof_id: null, updated_at: now };
      const next = workGraphSchema.parse({ ...unsigned, plan_hash: graphHash(unsigned) });
      const diff = diffGraphs(graph, next, now);
      await this.repository.write({ ...state, graphs: replaceBy(state.graphs, graph.graph_id, 'graph_id', next), diffs: [...state.diffs, diff], generated_at: now });
      await this.record(graph.trace_id, replacement.node_id, 'WORK_GRAPH_NODE_REASSIGNED', { graph_id: graph.graph_id, replacement_for_node_id: current.node_id, candidate_id: candidate.candidate_id, diff_id: diff.diff_id });
      return this.stateUnlocked();
    });
  }

  private lifecycle(request: WorkGraphNodeCommandRequest, action: 'cancelled' | 'revoked'): Promise<GoalWorkGraphState> {
    return this.serialize(async () => {
      const input = workGraphNodeCommandRequestSchema.parse(request);
      const state = await this.repository.read();
      const graph = required(state.graphs.find((item) => item.graph_id === input.graph_id), 'Work graph was not found.');
      const node = required(graph.nodes.find((item) => item.node_id === input.node_id), 'Work graph node was not found.');
      const goal = required(state.goals.find((item) => item.goal_id === graph.goal_id), 'Collaborative goal was not found.');
      const evidenceRefs = action === 'cancelled' ? await this.ports.cancelNode({ goal, graph, node, actor: input.actor }) : await this.ports.revokeNode({ goal, graph, node, actor: input.actor });
      const now = this.clock().toISOString();
      const nodes = graph.nodes.map((item) => item.node_id === node.node_id ? workGraphNodeSchema.parse({ ...item, status: action, reason_code: action === 'cancelled' ? 'OPERATOR_CANCELLED' : 'MANDATE_REVOKED', evidence_refs: unique([...item.evidence_refs, ...evidenceRefs]) }) : item);
      const next = workGraphSchema.parse({ ...graph, status: graph.status === 'draft' ? 'draft' : 'blocked', nodes, updated_at: now });
      await this.repository.write({ ...state, graphs: replaceBy(state.graphs, graph.graph_id, 'graph_id', next), generated_at: now });
      await this.record(graph.trace_id, node.node_id, action === 'cancelled' ? 'WORK_GRAPH_NODE_CANCELLED' : 'WORK_GRAPH_NODE_REVOKED', { graph_id: graph.graph_id, evidence_refs: evidenceRefs });
      return this.stateUnlocked();
    });
  }

  private async stateUnlocked(): Promise<GoalWorkGraphState> {
    const stored = await this.repository.read();
    return goalWorkGraphStateSchema.parse({ ...stored, candidates: await this.ports.candidates(), generated_at: this.clock().toISOString() });
  }

  private record(traceId: string, subjectId: string, projectEventType: string, payload: Record<string, unknown>) {
    return this.evidence.append({ trace_id: traceId, actor: { type: 'system', id: 'h2a-goal-work-graph' }, subject: { type: 'assignment', id: subjectId }, event_type: 'WORKFLOW_COMPLETED', payload: { project_event_type: projectEventType, ...payload } });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function deterministicProposal(goal: CollaborativeGoal, candidates: WorkGraphAgentCandidate[], planning: Awaited<ReturnType<GoalWorkGraphPorts['planningScope']>>, clock: () => Date): WorkGraph {
  const ready = candidates.filter((item) => item.status === 'ready');
  if (ready.length === 0) throw new Error('No ready local or paired-node agent is available.');
  const roles = [
    { key: 'research', title: 'Research product content', provider: ['custom-cli', 'gemini-antigravity'], paths: [] as string[], hosts: planning.network_hosts, fieldCount: 2 },
    { key: 'ui', title: 'Design the storefront UI', provider: ['claude-code', 'gemini-antigravity'], paths: planning.editable_paths, hosts: [] as string[], fieldCount: 1 },
    { key: 'implementation', title: 'Implement the storefront', provider: ['openai-codex', 'claude-code'], paths: planning.editable_paths, hosts: [] as string[], fieldCount: 2 },
    { key: 'qa', title: 'Validate accessibility and quality', provider: ['gemini-antigravity', 'custom-cli'], paths: planning.editable_paths, hosts: [] as string[], fieldCount: 1 }
  ];
  const graphId = `work_graph_${randomUUID()}`;
  const expires = goal.deadline ?? new Date(clock().getTime() + 2 * 60 * 60_000).toISOString();
  const nodes = roles.map((role, index) => {
    const candidate = selectCandidate(ready, role.provider, index);
    const tools = candidate.capabilities.slice(0, Math.max(1, Math.min(3, candidate.capabilities.length)));
    const fields = candidate.execution_target === 'local' ? planning.context_fields.slice(0, role.fieldCount) : [];
    const withheld = planning.context_fields.filter((field) => !fields.includes(field));
    const commands = role.key === 'qa' ? planning.validation_commands : [];
    const scope = { resources: [`project:${goal.project_id}`], actions: tools, fields, paths: role.paths, commands, capabilities: tools, duration_seconds: Math.max(60, Math.floor((new Date(expires).getTime() - clock().getTime()) / 1000)), quorum: goal.sensitivity === 'restricted' ? 1 : null, policy_bindings: goal.sensitivity === 'restricted' ? ['project.integration.approval'] : [] };
    return workGraphNodeSchema.parse({ node_id: `work_node_${role.key}_${randomUUID()}`, title: role.title, objective: `${goal.objective}: ${role.title}`, human_owner_id: candidate.human_owner_id, agent_id: candidate.agent_id, runtime_binding_id: candidate.runtime_binding_id, execution_target: candidate.execution_target, remote_peer_id: candidate.remote_peer_id, passport_id: candidate.passport_id, runtime_session_id: candidate.runtime_session_id, runtime_attestation_id: candidate.runtime_attestation_id, mandate_id: null, context_grant_id: null, project_assignment_id: null, workplace_assignment_id: null, worktree_lease_id: null, mailbox_route_id: null, provider: candidate.provider, allowed_context_fields: fields, withheld_context_fields: withheld, allowed_paths: role.paths, allowed_tools: tools, allowed_network_hosts: role.hosts, expected_outputs: [`${role.title} output`], validation_commands: commands, mandate_scope: scope, mandate_expires_at: expires, approval_policy_ids: scope.policy_bindings, replacement_for_node_id: null, status: 'draft', reason_code: null, evidence_refs: [] });
  });
  const byKey = Object.fromEntries(roles.map((role, index) => [role.key, nodes[index]!.node_id]));
  const edges = [
    edge(byKey.research!, byKey.implementation!), edge(byKey.ui!, byKey.implementation!), edge(byKey.implementation!, byKey.qa!)
  ];
  const now = clock().toISOString();
  const unsigned = { schema_version: 1 as const, graph_id: graphId, goal_id: goal.goal_id, trace_id: goal.trace_id, status: 'draft' as const, nodes, dependency_edges: edges, approval_checkpoints: goal.sensitivity === 'restricted' ? [{ checkpoint_id: `checkpoint_${randomUUID()}`, before_node_id: byKey.implementation!, policy_id: 'project.integration.approval', proof_purpose: 'approve collaborative work graph', status: 'pending' as const, approval_request_id: null }] : [], revision: 1, proposed_by: 'deterministic-h2a' as const, provider_proposal_hash: null, approved_by_human_id: null, approved_human_proof_id: null, created_at: now, updated_at: now, trust_ceiling: 'connected-observed' as const };
  return workGraphSchema.parse({ ...unsigned, plan_hash: graphHash(unsigned) });
}

function validateProviderProposal(value: unknown, goal: CollaborativeGoal, candidates: WorkGraphAgentCandidate[], clock: () => Date): WorkGraph {
  const proposal = z.object({ assignments: z.array(z.object({ title: z.string().min(1).max(160), objective: z.string().min(1).max(4000), candidate_id: z.string().min(1).max(240), allowed_context_fields: z.array(z.string().min(1).max(240)).max(200), withheld_context_fields: z.array(z.string().min(1).max(240)).max(200), allowed_paths: z.array(z.string().min(1).max(500)).max(200), allowed_tools: z.array(z.string().min(1).max(240)).max(100), allowed_network_hosts: z.array(z.string().min(1).max(253)).max(100), expected_outputs: z.array(z.string().min(1).max(500)).min(1).max(30), validation_commands: z.array(z.string().min(1).max(240)).max(30), depends_on_indexes: z.array(z.number().int().nonnegative()).max(30) }).strict()).min(1).max(100) }).strict().parse(value);
  const graphId = `work_graph_${randomUUID()}`;
  const expires = goal.deadline ?? new Date(clock().getTime() + 2 * 60 * 60_000).toISOString();
  const nodes = proposal.assignments.map((assignment) => {
    const candidateId = assignment.candidate_id;
    const nodeInput = { title: assignment.title, objective: assignment.objective, allowed_context_fields: assignment.allowed_context_fields, withheld_context_fields: assignment.withheld_context_fields, allowed_paths: assignment.allowed_paths, allowed_tools: assignment.allowed_tools, allowed_network_hosts: assignment.allowed_network_hosts, expected_outputs: assignment.expected_outputs, validation_commands: assignment.validation_commands };
    const candidate = required(candidates.find((item) => item.candidate_id === candidateId), 'Provider proposal references an unknown agent candidate.');
    const scope = { resources: [`project:${goal.project_id}`], actions: assignment.allowed_tools, fields: assignment.allowed_context_fields, paths: assignment.allowed_paths, commands: assignment.validation_commands, capabilities: assignment.allowed_tools, duration_seconds: Math.max(60, Math.floor((new Date(expires).getTime() - clock().getTime()) / 1000)), quorum: goal.sensitivity === 'restricted' ? 1 : null, policy_bindings: goal.sensitivity === 'restricted' ? ['project.integration.approval'] : [] };
    return workGraphNodeSchema.parse({ node_id: `work_node_${randomUUID()}`, human_owner_id: candidate.human_owner_id, agent_id: candidate.agent_id, runtime_binding_id: candidate.runtime_binding_id, execution_target: candidate.execution_target, remote_peer_id: candidate.remote_peer_id, passport_id: candidate.passport_id, runtime_session_id: candidate.runtime_session_id, runtime_attestation_id: candidate.runtime_attestation_id, mandate_id: null, context_grant_id: null, project_assignment_id: null, workplace_assignment_id: null, worktree_lease_id: null, mailbox_route_id: null, provider: candidate.provider, ...nodeInput, mandate_scope: scope, mandate_expires_at: expires, approval_policy_ids: scope.policy_bindings, replacement_for_node_id: null, status: 'draft', reason_code: null, evidence_refs: [] });
  });
  const edges = proposal.assignments.flatMap((assignment, successor) => assignment.depends_on_indexes.map((predecessor) => {
    if (!nodes[predecessor]) throw new Error('Provider proposal dependency index is invalid.');
    return edge(nodes[predecessor]!.node_id, nodes[successor]!.node_id);
  }));
  const now = clock().toISOString();
  const unsigned = { schema_version: 1 as const, graph_id: graphId, goal_id: goal.goal_id, trace_id: goal.trace_id, status: 'draft' as const, nodes, dependency_edges: edges, approval_checkpoints: [], revision: 1, proposed_by: 'connected-provider' as const, provider_proposal_hash: hashCanonical(value), approved_by_human_id: null, approved_human_proof_id: null, created_at: now, updated_at: now, trust_ceiling: 'connected-observed' as const };
  const graph = workGraphSchema.parse({ ...unsigned, plan_hash: graphHash(unsigned) });
  assertAcyclic(graph);
  return graph;
}

function validateGraphSecurity(graph: WorkGraph, candidates: WorkGraphAgentCandidate[]): void {
  for (const node of graph.nodes) {
    const candidate = required(candidates.find((item) => item.agent_id === node.agent_id && item.remote_peer_id === node.remote_peer_id), `Agent candidate is not currently registered: ${node.agent_id}.`);
    if (candidate.status !== 'ready') throw new Error(`Agent ${candidate.display_name} is unavailable: ${candidate.reason_code ?? candidate.status}.`);
    assertCandidateCanRun(node, candidate);
    if (node.allowed_paths.some((path) => path === '*' || path === '**' || path.startsWith('/') || /^[A-Za-z]:\\/u.test(path) || path.includes('..'))) throw new Error('WORK_GRAPH_PATH_SCOPE_DENIED');
    if (node.allowed_network_hosts.some((host) => host === '*' || host.includes('/') || host.includes('://'))) throw new Error('WORK_GRAPH_NETWORK_SCOPE_DENIED');
    if (node.allowed_context_fields.some((field) => /secret|password|token|private[_-]?key|biometric/iu.test(field))) throw new Error('WORK_GRAPH_CONTEXT_SCOPE_DENIED');
    if (node.allowed_tools.some((tool) => /shell|powershell|cmd|bash|yolo|bypass/iu.test(tool))) throw new Error('WORK_GRAPH_TOOL_SCOPE_DENIED');
    if (hashCanonical(node.mandate_scope.paths) !== hashCanonical(node.allowed_paths) || hashCanonical(node.mandate_scope.fields) !== hashCanonical(node.allowed_context_fields) || hashCanonical(node.mandate_scope.actions) !== hashCanonical(node.allowed_tools)) throw new Error('WORK_GRAPH_MANDATE_SCOPE_MISMATCH');
  }
  assertAcyclic(graph);
  for (let left = 0; left < graph.nodes.length; left += 1) {
    for (let right = left + 1; right < graph.nodes.length; right += 1) {
      const first = graph.nodes[left]!; const second = graph.nodes[right]!;
      if (first.allowed_paths.length === 0 || second.allowed_paths.length === 0) continue;
      if (dependsTransitively(graph, first.node_id, second.node_id) || dependsTransitively(graph, second.node_id, first.node_id)) continue;
      if (first.allowed_paths.some((path) => second.allowed_paths.includes(path))) throw new Error(`WORK_GRAPH_CONCURRENT_PATH_CONFLICT:${first.node_id}:${second.node_id}`);
    }
  }
}

function assertCandidateCanRun(node: WorkGraphNode, candidate: WorkGraphAgentCandidate): void {
  if (node.provider !== candidate.provider) throw new Error('WORK_GRAPH_PROVIDER_BINDING_MISMATCH');
  if (node.allowed_tools.some((tool) => !candidate.capabilities.includes(tool) && !['read', 'edit', 'write', 'test', 'governed-fetch'].includes(tool))) throw new Error('WORK_GRAPH_CAPABILITY_ESCALATION');
  if (node.execution_target !== candidate.execution_target) throw new Error('WORK_GRAPH_EXECUTION_TARGET_MISMATCH');
}

function assertAcyclic(graph: WorkGraph): void {
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) throw new Error('WORK_GRAPH_CYCLE_DETECTED');
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const dependency of dependenciesOf(graph, nodeId)) visit(dependency);
    visiting.delete(nodeId); visited.add(nodeId);
  };
  graph.nodes.forEach((node) => visit(node.node_id));
}

function topologicalNodes(graph: WorkGraph): WorkGraphNode[] {
  const result: WorkGraphNode[] = []; const remaining = new Set(graph.nodes.map((node) => node.node_id));
  while (remaining.size > 0) {
    const ready = graph.nodes.filter((node) => remaining.has(node.node_id) && dependenciesOf(graph, node.node_id).every((id) => !remaining.has(id)));
    if (ready.length === 0) throw new Error('WORK_GRAPH_CYCLE_DETECTED');
    ready.forEach((node) => { result.push(node); remaining.delete(node.node_id); });
  }
  return result;
}

function dependenciesOf(graph: WorkGraph, nodeId: string): string[] { return graph.dependency_edges.filter((edge) => edge.successor_node_id === nodeId).map((edge) => edge.predecessor_node_id); }
function dependsTransitively(graph: WorkGraph, nodeId: string, possibleDependency: string, visited = new Set<string>()): boolean {
  if (visited.has(nodeId)) return false;
  visited.add(nodeId);
  const direct = dependenciesOf(graph, nodeId);
  return direct.includes(possibleDependency) || direct.some((dependency) => dependsTransitively(graph, dependency, possibleDependency, visited));
}
function edge(predecessor: string, successor: string) { return workGraphDependencyEdgeSchema.parse({ edge_id: `edge_${randomUUID()}`, predecessor_node_id: predecessor, successor_node_id: successor, condition: 'succeeded', on_unsatisfied: 'wait' }); }
function selectCandidate(candidates: WorkGraphAgentCandidate[], providers: string[], offset: number): WorkGraphAgentCandidate { return providers.map((provider) => candidates.find((item) => item.provider === provider)).find(Boolean) ?? candidates[offset % candidates.length]!; }
function graphHash(value: object): string {
  const unsigned = { ...value } as Record<string, unknown>;
  delete unsigned.plan_hash;
  return hashCanonical(unsigned);
}
function unique(values: string[]): string[] { return [...new Set(values)]; }
function required<T>(value: T | null | undefined, message: string): T { if (value === null || value === undefined) throw new Error(message); return value; }
function replaceBy<T, K extends keyof T>(values: T[], id: T[K], key: K, replacement: T): T[] { return values.map((item) => item[key] === id ? replacement : item); }

function diffGraphs(before: WorkGraph, after: WorkGraph, createdAt: string) {
  const beforeNodes = new Map(before.nodes.map((node) => [node.node_id, node])); const afterNodes = new Map(after.nodes.map((node) => [node.node_id, node]));
  const beforeEdges = new Set(before.dependency_edges.map((edge) => edge.edge_id)); const afterEdges = new Set(after.dependency_edges.map((edge) => edge.edge_id));
  return workGraphPlanDiffSchema.parse({ diff_id: `work_graph_diff_${randomUUID()}`, graph_id: before.graph_id, from_revision: before.revision, to_revision: after.revision, added_node_ids: [...afterNodes.keys()].filter((id) => !beforeNodes.has(id)), removed_node_ids: [...beforeNodes.keys()].filter((id) => !afterNodes.has(id)), changed_node_ids: [...afterNodes.keys()].filter((id) => beforeNodes.has(id) && hashCanonical(beforeNodes.get(id)) !== hashCanonical(afterNodes.get(id))), added_edge_ids: [...afterEdges].filter((id) => !beforeEdges.has(id)), removed_edge_ids: [...beforeEdges].filter((id) => !afterEdges.has(id)), before_hash: before.plan_hash, after_hash: after.plan_hash, created_at: createdAt });
}
