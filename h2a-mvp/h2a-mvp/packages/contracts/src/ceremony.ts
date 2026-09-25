import { z } from 'zod';

const id = z.string().trim().min(1).max(240);
const timestamp = z.string().datetime({ offset: true });

export const ceremonyStepStatusSchema = z.enum([
  'not-ready', 'ready', 'running', 'passed', 'failed', 'user-action-required', 'superseded'
]);
export type CeremonyStepStatus = z.infer<typeof ceremonyStepStatusSchema>;

export const ceremonyStepIdSchema = z.enum([
  'session-created', 'prerequisites-assessed', 'organization-authority', 'workload-identity',
  'shared-provider-task', 'external-framework', 'context-minimization', 'authority-escalation',
  'runtime-containment', 'adversarial-controls', 'restart-recovery', 'evidence-reconstruction'
]);
export type CeremonyStepId = z.infer<typeof ceremonyStepIdSchema>;

export const ceremonyParticipantSchema = z.object({
  participant_id: id,
  kind: z.enum(['human', 'agent', 'framework', 'federation-node']),
  subject_id: id,
  display_name: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(160),
  status: z.enum(['candidate', 'ready', 'blocked', 'superseded']),
  evidence_refs: z.array(id).max(100)
}).strict();
export type CeremonyParticipant = z.infer<typeof ceremonyParticipantSchema>;

export const ceremonyResourceKindSchema = z.enum([
  'human-proof', 'authority-membership', 'authority-credential', 'agent-passport', 'runtime-session',
  'mandate', 'assignment', 'context-grant', 'approval', 'live-run', 'connector-run', 'federation-envelope'
]);
export type CeremonyResourceKind = z.infer<typeof ceremonyResourceKindSchema>;

export const ceremonyResourceBindingSchema = z.object({
  kind: ceremonyResourceKindSchema,
  resource_id: id,
  ceremony_id: id,
  trace_id: z.string().trim().startsWith('phase22_').max(240),
  bound_at: timestamp
}).strict();
export type CeremonyResourceBinding = z.infer<typeof ceremonyResourceBindingSchema>;

export const ceremonyStepSchema = z.object({
  step_id: ceremonyStepIdSchema,
  title: z.string().trim().min(2).max(160),
  status: ceremonyStepStatusSchema,
  blocker: z.string().trim().min(2).max(1000).nullable(),
  attempts: z.number().int().nonnegative(),
  idempotency_keys: z.array(id).max(100),
  evidence_refs: z.array(id).max(200),
  started_at: timestamp.nullable(),
  completed_at: timestamp.nullable()
}).strict();
export type CeremonyStep = z.infer<typeof ceremonyStepSchema>;

export const ceremonySessionSchema = z.object({
  schema_version: z.literal(1),
  ceremony_id: id,
  trace_id: z.string().trim().startsWith('phase22_').max(240),
  title: z.string().trim().min(2).max(160),
  status: z.enum(['active', 'completed', 'failed', 'superseded']),
  create_idempotency_key: id,
  participants: z.array(ceremonyParticipantSchema).max(100),
  resources: z.array(ceremonyResourceBindingSchema).max(1000),
  steps: z.array(ceremonyStepSchema).length(12),
  created_at: timestamp,
  updated_at: timestamp
}).strict();
export type CeremonySession = z.infer<typeof ceremonySessionSchema>;

export const ceremonyStateSchema = z.object({
  schema_version: z.literal(1),
  active_ceremony_id: id.nullable(),
  sessions: z.array(ceremonySessionSchema).max(50)
}).strict();
export type CeremonyState = z.infer<typeof ceremonyStateSchema>;

export const createCeremonySessionRequestSchema = z.object({
  title: z.string().trim().min(2).max(160),
  idempotency_key: id
}).strict();
export type CreateCeremonySessionRequest = z.infer<typeof createCeremonySessionRequestSchema>;

export const runCeremonyStepRequestSchema = z.object({
  ceremony_id: id,
  step_id: z.literal('prerequisites-assessed'),
  idempotency_key: id
}).strict();
export type RunCeremonyStepRequest = z.infer<typeof runCeremonyStepRequestSchema>;

export const ceremonyCorrelationSchema = z.object({
  ceremony_id: id,
  trace_id: z.string().trim().startsWith('phase22_').max(240),
  idempotency_key: id
}).strict();
export type CeremonyCorrelation = z.infer<typeof ceremonyCorrelationSchema>;
