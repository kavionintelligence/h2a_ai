import { z } from 'zod';
import { exactAuthorityScopeSchema } from './operator-readiness';

const id = z.string().trim().min(1).max(240);
const text = z.string().trim().min(1).max(1000);
const iso = z.string().datetime({ offset: true });
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const repairOperationKindSchema = z.enum([
  'refresh-human-proof', 'replace-authority-credential', 'rotate-runtime-session', 'replace-runtime-attestation', 'replace-mandate',
  'rebind-assignment', 'renew-context-grant', 'authenticate-provider', 'install-dependency', 'obtain-independent-approval',
  'replace-federation-peer', 'reattach-control-plane'
]);
export type RepairOperationKind = z.infer<typeof repairOperationKindSchema>;

export const repairOperationSchema = z.object({
  operation_id: id, kind: repairOperationKindSchema, target_reference_id: id, replacement_reference_id: id.nullable(),
  replacement_for_id: id.nullable(), exact_scope: exactAuthorityScopeSchema, exact_scope_hash: hash,
  proof_human_id: id.nullable(), proof_purpose: text.nullable(), dependency_ids: z.array(id).max(30),
  status: z.enum(['eligible', 'operator-required', 'external-action-required', 'blocked', 'completed', 'failed']),
  reason_code: id, impact: text, evidence_refs: z.array(id).max(200)
}).strict().superRefine((value, context) => {
  if ((value.proof_human_id === null) !== (value.proof_purpose === null)) context.addIssue({ code: 'custom', message: 'Proof human and purpose must be present together.' });
  if (value.replacement_reference_id && value.replacement_reference_id === value.target_reference_id) context.addIssue({ code: 'custom', message: 'Replacement records must have a distinct canonical ID.' });
  if (value.replacement_reference_id && value.replacement_for_id !== value.target_reference_id) context.addIssue({ code: 'custom', message: 'Replacement records must retain immutable replacement lineage.' });
});
export type RepairOperation = z.infer<typeof repairOperationSchema>;

export const repairPlanSchema = z.object({
  schema_version: z.literal(2), repair_plan_id: id, readiness_id: id, readiness_generation_hash: hash, command_id: id,
  status: z.enum(['ready', 'operator-required', 'external-action-required', 'blocked', 'partial', 'completed', 'failed']),
  operations: z.array(repairOperationSchema).min(1).max(100),
  grouped_proof_purposes: z.array(z.object({ human_id: id, purpose: text, operation_ids: z.array(id).min(1).max(50) }).strict()).max(20),
  created_at: iso, updated_at: iso, completed_at: iso.nullable()
}).strict();
export type RepairPlan = z.infer<typeof repairPlanSchema>;

export const repairPlanStateSchema = z.object({ schema_version: z.literal(1), plans: z.array(repairPlanSchema).max(500) }).strict();
export type RepairPlanState = z.infer<typeof repairPlanStateSchema>;

export const executeRepairPlanRequestSchema = z.object({
  repair_plan_id: id, expected_readiness_id: id, expected_generation_hash: hash, operation_ids: z.array(id).max(100).optional()
}).strict();
export type ExecuteRepairPlanRequest = z.infer<typeof executeRepairPlanRequestSchema>;
