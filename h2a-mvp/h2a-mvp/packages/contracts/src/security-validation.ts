import { z } from 'zod';
import { finalAcceptanceAttackIdSchema } from './final-acceptance';

const id = z.string().trim().min(1).max(240);
const timestamp = z.string().datetime({ offset: true });

export const securityValidationResultSchema = z.object({
  control_id: finalAcceptanceAttackIdSchema,
  status: z.enum(['not-run', 'running', 'blocked', 'control-failed']),
  reason_code: id.optional(),
  evidence_ref: id.optional(),
  tested_at: timestamp.optional()
}).strict();
export type SecurityValidationResult = z.infer<typeof securityValidationResultSchema>;

export const containmentProofSchema = z.object({
  control_id: z.enum(['operator-cancel', 'authority-revocation', 'restart-recovery']),
  status: z.enum(['not-run', 'armed', 'running', 'passed', 'failed']),
  run_id: id.optional(),
  reason_code: id.optional(),
  evidence_ref: id.optional(),
  tested_at: timestamp.optional()
}).strict();
export type ContainmentProof = z.infer<typeof containmentProofSchema>;

export const securityValidationStateSchema = z.object({
  schema_version: z.literal(1),
  ceremony_id: id.nullable(),
  trace_id: id.nullable(),
  trust_ceiling: z.literal('connected-observed'),
  status: z.enum(['blocked', 'ready', 'in-progress', 'passed']),
  attacks: z.array(securityValidationResultSchema).length(6),
  containment: z.array(containmentProofSchema).length(3),
  evidence_integrity: z.enum(['verified', 'warning', 'failed']),
  updated_at: timestamp
}).strict();
export type SecurityValidationState = z.infer<typeof securityValidationStateSchema>;

export const runSecurityAttackRequestSchema = z.object({ attack_id: finalAcceptanceAttackIdSchema }).strict();
export type RunSecurityAttackRequest = z.infer<typeof runSecurityAttackRequestSchema>;

export const runContainmentControlRequestSchema = z.object({
  control_id: z.enum(['operator-cancel', 'authority-revocation', 'restart-recovery'])
}).strict();
export type RunContainmentControlRequest = z.infer<typeof runContainmentControlRequestSchema>;
