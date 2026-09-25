import { z } from 'zod';
import { ceremonyCorrelationSchema } from './ceremony';
import { authorityActorSchema } from './v2';

const id = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const humanEscalationStateSchema = z.object({
  schema_version: z.literal(1),
  ceremony_id: id.nullable(), trace_id: id.nullable(),
  status: z.enum(['not-started', 'configuration-required', 'ready', 'approval-pending', 'approved', 'running', 'completed', 'rejection-pending', 'completed-with-rejection', 'blocked']),
  requester_human_id: id.nullable(), requester_membership_id: id.nullable(),
  approver_human_id: id.nullable(), approver_membership_id: id.nullable(),
  policy_id: id.nullable(), assignment_id: id.nullable(), agent_id: id.nullable(),
  passport_id: id.nullable(), binding_id: id.nullable(), runtime_session_id: id.nullable(),
  parent_mandate_id: id.nullable(), review_context_grant_id: id.nullable(),
  requested_effect_hash: sha256.nullable(), approval_request_id: id.nullable(),
  run_id: id.nullable(), output_hash: sha256.nullable(), rejection_request_id: id.nullable(),
  completed_idempotency_keys: z.array(id), last_error: z.string().max(2000).nullable(), updated_at: timestamp
}).strict();
export type HumanEscalationState = z.infer<typeof humanEscalationStateSchema>;

const request = z.object({ actor: authorityActorSchema, ceremony: ceremonyCorrelationSchema }).strict();
export const configureHumanEscalationRequestSchema = request;
export const startHumanEscalationRequestSchema = request;
export const startHumanEscalationRejectionRequestSchema = request;
export type ConfigureHumanEscalationRequest = z.infer<typeof request>;
export type StartHumanEscalationRequest = z.infer<typeof request>;
export type StartHumanEscalationRejectionRequest = z.infer<typeof request>;
