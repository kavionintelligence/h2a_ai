import { z } from 'zod';
import { ceremonyCorrelationSchema } from './ceremony';

const id = z.string().trim().min(1).max(240);
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const guidedBootstrapStepIdSchema = z.enum([
  'human-readiness', 'organization-authority', 'workload-identity', 'mandates-and-tasks', 'restart-recovery'
]);
export type GuidedBootstrapStepId = z.infer<typeof guidedBootstrapStepIdSchema>;

export const guidedBootstrapStepSchema = z.object({
  step_id: guidedBootstrapStepIdSchema,
  title: z.string().trim().min(2).max(160),
  status: z.enum(['not-ready', 'ready', 'running', 'passed', 'failed', 'user-action-required']),
  blocker: z.string().trim().min(2).max(1000).nullable(),
  evidence_refs: z.array(id).max(200)
}).strict();

export const guidedBootstrapHumanSchema = z.object({
  human_id: id,
  display_name: z.string().trim().min(2).max(100),
  membership_id: id,
  enrollment_id: id,
  token_set_size: z.number().int().min(20).max(70),
  required_matches: z.number().int().positive(),
  model_set_hash: sha256,
  proof_id: id.nullable(),
  proof_expires_at: timestamp.nullable(),
  proof_status: z.enum(['missing', 'expired', 'fresh']),
  assurance_level: z.enum(['substantial', 'high']).nullable()
}).strict();
export type GuidedBootstrapHuman = z.infer<typeof guidedBootstrapHumanSchema>;

export const guidedBootstrapParticipantLaneSchema = z.enum(['openai-codex', 'claude-code', 'gemini-antigravity', 'framework']);
export type GuidedBootstrapParticipantLane = z.infer<typeof guidedBootstrapParticipantLaneSchema>;

export const guidedBootstrapParticipantSchema = z.object({
  lane: guidedBootstrapParticipantLaneSchema,
  name: z.string().trim().min(2).max(80),
  provider: id,
  agent_id: id.nullable(),
  binding_id: id.nullable(),
  passport_id: id.nullable(),
  runtime_session_id: id.nullable(),
  status: z.enum(['missing', 'ready', 'blocked']),
  blocker: z.string().trim().min(2).max(1000).nullable()
}).strict();
export type GuidedBootstrapParticipant = z.infer<typeof guidedBootstrapParticipantSchema>;

export const guidedBootstrapStateSchema = z.object({
  schema_version: z.literal(1),
  ceremony_id: id.nullable(),
  trace_id: z.string().trim().startsWith('phase22_').max(240).nullable(),
  status: z.enum(['not-started', 'in-progress', 'ready', 'blocked']),
  administrator_human_id: id.nullable(),
  operator_human_id: id.nullable(),
  cross_person_test_status: z.enum(['passed', 'pending']),
  humans: z.array(guidedBootstrapHumanSchema).max(2),
  organization_id: id.nullable(),
  operator_role_id: id.nullable(),
  approver_role_id: id.nullable(),
  operator_credential_id: id.nullable(),
  approver_credential_id: id.nullable(),
  participants: z.array(guidedBootstrapParticipantSchema).length(4),
  root_mandate_id: id.nullable(),
  child_mandate_ids: z.array(id).max(3),
  assignment_ids: z.array(id).max(4),
  steps: z.array(guidedBootstrapStepSchema).length(5),
  completed_idempotency_keys: z.array(id).max(200),
  last_error: z.string().trim().min(2).max(1000).nullable(),
  updated_at: timestamp
}).strict();
export type GuidedBootstrapState = z.infer<typeof guidedBootstrapStateSchema>;

export const prepareGuidedBootstrapRequestSchema = z.object({
  ceremony: ceremonyCorrelationSchema,
  administrator_human_id: id,
  operator_human_id: id
}).strict().refine((value) => value.administrator_human_id !== value.operator_human_id, {
  message: 'Administrator and operator must be different enrolled humans.'
});
export type PrepareGuidedBootstrapRequest = z.infer<typeof prepareGuidedBootstrapRequestSchema>;

export const runGuidedBootstrapStepRequestSchema = z.object({
  ceremony: ceremonyCorrelationSchema,
  step_id: z.enum(['organization-authority', 'workload-identity', 'mandates-and-tasks', 'restart-recovery'])
}).strict();
export type RunGuidedBootstrapStepRequest = z.infer<typeof runGuidedBootstrapStepRequestSchema>;
