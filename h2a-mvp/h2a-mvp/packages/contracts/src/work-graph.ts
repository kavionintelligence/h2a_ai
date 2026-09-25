import { z } from 'zod';
import { authorityActorSchema } from './v2';
import { exactAuthorityScopeSchema } from './operator-readiness';
import { collaborativeGoalSchema } from './collaborative-goal';

const id = z.string().trim().min(1).max(240);
const text = z.string().trim().min(1).max(4000);
const iso = z.string().datetime({ offset: true });

export const workNodeStatusSchema = z.enum([
  'draft', 'ready', 'waiting', 'running', 'approval-required', 'succeeded',
  'failed', 'denied', 'cancelled', 'revoked', 'replacement-required'
]);
export type WorkNodeStatus = z.infer<typeof workNodeStatusSchema>;

export const workGraphNodeSchema = z.object({
  node_id: id,
  title: z.string().trim().min(1).max(160),
  objective: text,
  human_owner_id: id,
  agent_id: id,
  runtime_binding_id: id,
  execution_target: z.enum(['local', 'paired-node']),
  remote_peer_id: id.nullable(),
  passport_id: id.nullable(),
  runtime_session_id: id.nullable(),
  runtime_attestation_id: id.nullable(),
  mandate_id: id.nullable(),
  context_grant_id: id.nullable(),
  project_assignment_id: id.nullable(),
  workplace_assignment_id: id.nullable(),
  worktree_lease_id: id.nullable(),
  mailbox_route_id: id.nullable(),
  provider: z.enum(['claude-code', 'openai-codex', 'gemini-antigravity', 'custom-cli']),
  allowed_context_fields: z.array(id).max(200),
  withheld_context_fields: z.array(id).max(200),
  allowed_paths: z.array(z.string().trim().min(1).max(500)).max(200),
  allowed_tools: z.array(id).max(100),
  allowed_network_hosts: z.array(z.string().trim().min(1).max(253)).max(100),
  expected_outputs: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
  validation_commands: z.array(id).max(30),
  mandate_scope: exactAuthorityScopeSchema,
  mandate_expires_at: iso,
  approval_policy_ids: z.array(id).max(30),
  replacement_for_node_id: id.nullable(),
  status: workNodeStatusSchema,
  reason_code: id.nullable(),
  output_ref: id.nullable().optional(),
  output_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/u).nullable().optional(),
  evidence_refs: z.array(id).max(200)
}).strict();
export type WorkGraphNode = z.infer<typeof workGraphNodeSchema>;

export const workGraphDependencyEdgeSchema = z.object({
  edge_id: id,
  predecessor_node_id: id,
  successor_node_id: id,
  condition: z.enum(['succeeded', 'approved', 'acknowledged']),
  on_unsatisfied: z.enum(['wait', 'deny'])
}).strict().refine((value) => value.predecessor_node_id !== value.successor_node_id, 'Dependency edges cannot reference the same node.');
export type WorkGraphDependencyEdge = z.infer<typeof workGraphDependencyEdgeSchema>;

export const approvalCheckpointSchema = z.object({
  checkpoint_id: id,
  before_node_id: id,
  policy_id: id,
  proof_purpose: z.string().trim().min(1).max(1000),
  status: z.enum(['not-required', 'pending', 'approved', 'rejected', 'expired']),
  approval_request_id: id.nullable()
}).strict();
export type ApprovalCheckpoint = z.infer<typeof approvalCheckpointSchema>;

export const workGraphSchema = z.object({
  schema_version: z.literal(1),
  graph_id: id,
  goal_id: id,
  trace_id: id,
  status: z.enum(['draft', 'validated', 'approved', 'running', 'blocked', 'completed', 'cancelled']),
  nodes: z.array(workGraphNodeSchema).min(1).max(100),
  dependency_edges: z.array(workGraphDependencyEdgeSchema).max(500),
  approval_checkpoints: z.array(approvalCheckpointSchema).max(100),
  revision: z.number().int().positive(),
  plan_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  proposed_by: z.enum(['deterministic-h2a', 'connected-provider']),
  provider_proposal_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/u).nullable(),
  approved_by_human_id: id.nullable(),
  approved_human_proof_id: id.nullable(),
  created_at: iso,
  updated_at: iso,
  trust_ceiling: z.literal('connected-observed')
}).strict().superRefine((value, context) => {
  const nodeIds = value.nodes.map((node) => node.node_id);
  const edgeIds = value.dependency_edges.map((edge) => edge.edge_id);
  if (new Set(nodeIds).size !== nodeIds.length) context.addIssue({ code: 'custom', message: 'Work node IDs must be unique.' });
  if (new Set(edgeIds).size !== edgeIds.length) context.addIssue({ code: 'custom', message: 'Dependency edge IDs must be unique.' });
  const known = new Set(nodeIds);
  for (const edge of value.dependency_edges) {
    if (!known.has(edge.predecessor_node_id) || !known.has(edge.successor_node_id)) context.addIssue({ code: 'custom', message: `Dependency edge ${edge.edge_id} references a missing node.` });
  }
  for (const checkpoint of value.approval_checkpoints) {
    if (!known.has(checkpoint.before_node_id)) context.addIssue({ code: 'custom', message: `Approval checkpoint ${checkpoint.checkpoint_id} references a missing node.` });
  }
  for (const node of value.nodes) {
    if ((node.execution_target === 'paired-node') !== (node.remote_peer_id !== null)) context.addIssue({ code: 'custom', message: `Node ${node.node_id} has an invalid remote peer binding.` });
    if (node.allowed_context_fields.some((field) => node.withheld_context_fields.includes(field))) context.addIssue({ code: 'custom', message: `Node ${node.node_id} cannot both release and withhold a context field.` });
    if (node.status !== 'draft' && value.status !== 'draft' && [node.passport_id, node.runtime_session_id, node.mandate_id, node.project_assignment_id, node.workplace_assignment_id, node.mailbox_route_id].some((item) => item === null)) context.addIssue({ code: 'custom', message: `Provisioned node ${node.node_id} is missing canonical authority or routing references.` });
  }
});
export type WorkGraph = z.infer<typeof workGraphSchema>;

export const workGraphPlanDiffSchema = z.object({
  diff_id: id,
  graph_id: id,
  from_revision: z.number().int().positive(),
  to_revision: z.number().int().positive(),
  added_node_ids: z.array(id).max(100),
  removed_node_ids: z.array(id).max(100),
  changed_node_ids: z.array(id).max(100),
  added_edge_ids: z.array(id).max(500),
  removed_edge_ids: z.array(id).max(500),
  before_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  after_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  created_at: iso
}).strict();
export type WorkGraphPlanDiff = z.infer<typeof workGraphPlanDiffSchema>;

export const workGraphAgentCandidateSchema = z.object({
  candidate_id: id,
  execution_target: z.enum(['local', 'paired-node']),
  agent_id: id,
  runtime_binding_id: id,
  display_name: z.string().trim().min(1).max(160),
  provider: z.enum(['claude-code', 'openai-codex', 'gemini-antigravity', 'custom-cli']),
  human_owner_id: id,
  passport_id: id.nullable(),
  runtime_session_id: id.nullable(),
  runtime_attestation_id: id.nullable(),
  remote_peer_id: id.nullable(),
  capabilities: z.array(id).max(100),
  status: z.enum(['ready', 'unavailable', 'offline', 'revoked']),
  reason_code: id.nullable()
}).strict();
export type WorkGraphAgentCandidate = z.infer<typeof workGraphAgentCandidateSchema>;

export const goalWorkGraphStateSchema = z.object({
  schema_version: z.literal(1),
  goals: z.array(collaborativeGoalSchema).max(200),
  graphs: z.array(workGraphSchema).max(200),
  diffs: z.array(workGraphPlanDiffSchema).max(1000),
  candidates: z.array(workGraphAgentCandidateSchema).max(500),
  generated_at: iso,
  trust_ceiling: z.literal('connected-observed')
}).strict();
export type GoalWorkGraphState = z.infer<typeof goalWorkGraphStateSchema>;

export const composeCollaborativeGoalRequestSchema = z.object({
  organization_id: id,
  project_id: id,
  title: z.string().trim().min(1).max(160),
  objective: text,
  outcome: text,
  constraints: z.array(z.string().trim().min(1).max(500)).max(50),
  deadline: iso.nullable(),
  sensitivity: z.enum(['public', 'internal', 'confidential', 'restricted']),
  expected_outputs: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
  created_by_human_id: id,
  trace_id: id
}).strict();
export type ComposeCollaborativeGoalRequest = z.infer<typeof composeCollaborativeGoalRequestSchema>;

export const proposeWorkGraphRequestSchema = z.object({ goal_id: id, provider_proposal: z.unknown().optional() }).strict();
export type ProposeWorkGraphRequest = z.infer<typeof proposeWorkGraphRequestSchema>;

export const editWorkGraphRequestSchema = z.object({
  graph_id: id,
  expected_revision: z.number().int().positive(),
  nodes: z.array(workGraphNodeSchema).min(1).max(100),
  dependency_edges: z.array(workGraphDependencyEdgeSchema).max(500),
  approval_checkpoints: z.array(approvalCheckpointSchema).max(100)
}).strict();
export type EditWorkGraphRequest = z.infer<typeof editWorkGraphRequestSchema>;

export const approveWorkGraphRequestSchema = z.object({ graph_id: id, expected_revision: z.number().int().positive(), actor: authorityActorSchema }).strict();
export type ApproveWorkGraphRequest = z.infer<typeof approveWorkGraphRequestSchema>;

export const workGraphNodeCommandRequestSchema = z.object({ graph_id: id, node_id: id, actor: authorityActorSchema.optional() }).strict();
export type WorkGraphNodeCommandRequest = z.infer<typeof workGraphNodeCommandRequestSchema>;

export const runWorkGraphRequestSchema = z.object({ graph_id: id, actor: authorityActorSchema.optional() }).strict();
export type RunWorkGraphRequest = z.infer<typeof runWorkGraphRequestSchema>;

export const renewWorkGraphNodeRequestSchema = z.object({ graph_id: id, node_id: id, actor: authorityActorSchema }).strict();
export type RenewWorkGraphNodeRequest = z.infer<typeof renewWorkGraphNodeRequestSchema>;

export const reassignWorkGraphNodeRequestSchema = z.object({ graph_id: id, node_id: id, candidate_id: id }).strict();
export type ReassignWorkGraphNodeRequest = z.infer<typeof reassignWorkGraphNodeRequestSchema>;
