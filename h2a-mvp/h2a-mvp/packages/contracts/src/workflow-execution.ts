import { z } from 'zod';

const id = z.string().trim().min(1).max(240);
const iso = z.string().datetime({ offset: true });
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const operatorActionKindSchema = z.enum([
  'command', 'route-change', 'proof-attempt', 'manual-refresh', 'copied-payload', 'repair'
]);
export type OperatorActionKind = z.infer<typeof operatorActionKindSchema>;

export const operatorActionTelemetrySchema = z.object({
  control_id: id,
  action_kind: operatorActionKindSchema,
  occurred_at: iso
}).strict();
export type OperatorActionTelemetry = z.infer<typeof operatorActionTelemetrySchema>;

export const clickBudgetMeasurementSchema = z.object({
  journey_id: id,
  session_id: id,
  events: z.array(operatorActionTelemetrySchema).max(500),
  operator_commands: z.number().int().nonnegative(),
  route_changes: z.number().int().nonnegative(),
  proof_attempts: z.number().int().nonnegative(),
  manual_refreshes: z.number().int().nonnegative(),
  copied_payloads: z.number().int().nonnegative(),
  repairs: z.number().int().nonnegative(),
  measured_at: iso,
  telemetry_storage: z.literal('local-minimized')
}).strict();
export type ClickBudgetMeasurement = z.infer<typeof clickBudgetMeasurementSchema>;

export const workflowStepAttemptSchema = z.object({
  attempt_id: id,
  node_id: id,
  attempt: z.number().int().positive(),
  status: z.enum(['running', 'paused', 'succeeded', 'failed', 'denied', 'cancelled', 'interrupted']),
  reason_code: id.nullable(),
  output_hash: hash.nullable(),
  evidence_refs: z.array(id).max(200),
  started_at: iso,
  completed_at: iso.nullable()
}).strict();
export type WorkflowStepAttempt = z.infer<typeof workflowStepAttemptSchema>;

export const workflowExecutionSchema = z.object({
  schema_version: z.literal(1),
  execution_id: id,
  graph_id: id,
  goal_id: id,
  trace_id: id,
  status: z.enum(['ready', 'running', 'paused', 'blocked', 'completed', 'cancelled', 'interrupted']),
  pause_reason_code: id.nullable(),
  active_node_ids: z.array(id).max(100),
  attempts: z.array(workflowStepAttemptSchema).max(1000),
  cancellation_requested_by: id.nullable(),
  evidence_refs: z.array(id).max(500),
  started_at: iso.nullable(),
  updated_at: iso,
  completed_at: iso.nullable(),
  trust_ceiling: z.literal('connected-observed')
}).strict();
export type WorkflowExecution = z.infer<typeof workflowExecutionSchema>;

export const operatorJourneyStepSchema = z.object({
  step_id: id,
  title: z.string().trim().min(1).max(160),
  status: z.enum(['not-started', 'ready', 'running', 'paused', 'succeeded', 'failed', 'denied', 'revoked', 'expired']),
  dependency_ids: z.array(id).max(30),
  reason_code: id,
  canonical_reference_ids: z.array(id).max(200),
  remediation_id: id.nullable()
}).strict();

export const operatorJourneySchema = z.object({
  schema_version: z.literal(1),
  journey_id: id,
  title: z.string().trim().min(1).max(160),
  status: z.enum(['not-started', 'in-progress', 'blocked', 'complete']),
  steps: z.array(operatorJourneyStepSchema).min(1).max(100),
  active_step_id: id.nullable(),
  generated_at: iso
}).strict();
export type OperatorJourney = z.infer<typeof operatorJourneySchema>;

