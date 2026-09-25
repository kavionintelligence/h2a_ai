import { z } from 'zod';

const identifierSchema = z.string().trim().min(1).max(240);
const textSchema = z.string().trim().min(1).max(1000);

export const guidedWorkflowIdSchema = z.enum([
  'set-up-people',
  'connect-agents',
  'run-governed-task',
  'approve-protected-action',
  'connect-friend-node',
  'prepare-hp-demonstration'
]);
export type GuidedWorkflowId = z.infer<typeof guidedWorkflowIdSchema>;

export const guidedWorkflowDestinationSchema = z.enum([
  'command-floor', 'human-proof', 'people-authority', 'authority-inbox', 'mandates',
  'context-broker', 'federation', 'evidence', 'demo-gate', 'settings'
]);
export type GuidedWorkflowDestination = z.infer<typeof guidedWorkflowDestinationSchema>;

export const guidedWorkflowStepStatusSchema = z.enum([
  'not-started', 'ready', 'running', 'awaiting-human', 'awaiting-approval',
  'awaiting-configuration', 'succeeded', 'failed', 'denied', 'revoked', 'expired'
]);
export type GuidedWorkflowStepStatus = z.infer<typeof guidedWorkflowStepStatusSchema>;

export const guidedWorkflowActionSchema = z.object({
  action_id: identifierSchema,
  kind: z.enum(['navigate', 'orchestrate', 'retry']),
  label: z.string().trim().min(1).max(120),
  reason: textSchema,
  destination: guidedWorkflowDestinationSchema,
  operation_key: identifierSchema,
  proof_purpose: textSchema.nullable(),
  proof_human_id: identifierSchema.nullable()
}).strict();
export type GuidedWorkflowAction = z.infer<typeof guidedWorkflowActionSchema>;

export const guidedWorkflowDependencyEdgeSchema = z.object({
  edge_id: identifierSchema,
  predecessor_step_id: identifierSchema,
  successor_step_id: identifierSchema,
  condition: z.literal('succeeded'),
  on_unsatisfied: z.literal('block')
}).strict().refine((value) => value.predecessor_step_id !== value.successor_step_id, 'Workflow dependencies cannot reference the same step.');
export type GuidedWorkflowDependencyEdge = z.infer<typeof guidedWorkflowDependencyEdgeSchema>;

export const guidedWorkflowStepSchema = z.object({
  step_id: identifierSchema,
  title: z.string().trim().min(1).max(160),
  status: guidedWorkflowStepStatusSchema,
  reason_code: identifierSchema,
  prerequisites: z.array(identifierSchema).max(20),
  evidence_refs: z.array(identifierSchema).max(200),
  action: guidedWorkflowActionSchema.nullable()
}).strict();
export type GuidedWorkflowStep = z.infer<typeof guidedWorkflowStepSchema>;

export const guidedWorkflowSchema = z.object({
  workflow_id: guidedWorkflowIdSchema,
  title: z.string().trim().min(1).max(160),
  summary: textSchema,
  status: z.enum(['not-started', 'in-progress', 'blocked', 'complete']),
  active_step_id: identifierSchema.nullable(),
  completed_steps: z.number().int().nonnegative(),
  total_steps: z.number().int().positive(),
  steps: z.array(guidedWorkflowStepSchema).min(1).max(20),
  dependency_edges: z.array(guidedWorkflowDependencyEdgeSchema).max(100),
  updated_at: z.string().datetime({ offset: true })
}).strict();
export type GuidedWorkflow = z.infer<typeof guidedWorkflowSchema>;

export const guidedWorkflowStateSchema = z.object({
  schema_version: z.literal(1),
  selected_workflow_id: guidedWorkflowIdSchema,
  workflows: z.array(guidedWorkflowSchema).length(6),
  next_action: guidedWorkflowActionSchema.nullable(),
  active_step: guidedWorkflowStepSchema.nullable(),
  generated_at: z.string().datetime({ offset: true })
}).strict();
export type GuidedWorkflowState = z.infer<typeof guidedWorkflowStateSchema>;
