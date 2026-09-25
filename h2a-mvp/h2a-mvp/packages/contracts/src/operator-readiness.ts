import { z } from 'zod';

const id = z.string().trim().min(1).max(240);
const text = z.string().trim().min(1).max(1000);
const iso = z.string().datetime({ offset: true });
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const exactAuthorityScopeSchema = z.object({
  resources: z.array(id).max(200), actions: z.array(id).max(200), fields: z.array(id).max(200),
  paths: z.array(z.string().trim().min(1).max(1000)).max(200), commands: z.array(id).max(200), capabilities: z.array(id).max(200),
  duration_seconds: z.number().int().nonnegative().nullable(), quorum: z.number().int().positive().nullable(), policy_bindings: z.array(id).max(100)
}).strict();
export type ExactAuthorityScope = z.infer<typeof exactAuthorityScopeSchema>;

export const operatorPrerequisiteKindSchema = z.enum([
  'human-proof', 'membership', 'authority-credential', 'agent-passport', 'runtime-session', 'runtime-attestation', 'mandate', 'assignment',
  'context-grant', 'provider', 'federation-peer', 'approval-policy', 'validation', 'evidence-integrity', 'control-plane'
]);
export type OperatorPrerequisiteKind = z.infer<typeof operatorPrerequisiteKindSchema>;

export const operatorPrerequisiteStatusSchema = z.enum([
  'ready', 'expiring', 'expired', 'revoked', 'authentication-required', 'dependency-missing', 'approval-required', 'disconnected-read-only'
]);
export type OperatorPrerequisiteStatus = z.infer<typeof operatorPrerequisiteStatusSchema>;

export const operatorPrerequisiteSchema = z.object({
  prerequisite_id: id, kind: operatorPrerequisiteKindSchema, canonical_reference_id: id.nullable(), replacement_for_id: id.nullable(), bound_human_id: id.nullable(),
  status: operatorPrerequisiteStatusSchema, expires_at: iso.nullable(), expires_in_seconds: z.number().int().nullable(), reason_code: id,
  impact: text, scope: exactAuthorityScopeSchema, scope_hash: hash, affected_control_ids: z.array(id).min(1).max(50), evidence_refs: z.array(id).max(200),
  source_route: z.enum(['office', 'command-floor', 'human-proof', 'people-authority', 'authority-inbox', 'mandates', 'context-broker', 'federation', 'evidence', 'demo-gate', 'settings']),
  remediation: z.object({ kind: z.enum(['automatic-after-proof', 'operator-action', 'external-action', 'none']), label: text, route: id.nullable() }).strict()
}).strict().superRefine((value, context) => {
  if (value.status === 'ready' && value.remediation.kind !== 'none') context.addIssue({ code: 'custom', message: 'Ready prerequisites cannot advertise remediation.' });
  if (value.status === 'revoked' && value.replacement_for_id !== null) context.addIssue({ code: 'custom', message: 'A revoked record is immutable; replacement lineage belongs to the replacement.' });
});
export type OperatorPrerequisite = z.infer<typeof operatorPrerequisiteSchema>;

export const operatorReadinessSchema = z.object({
  schema_version: z.literal(2), readiness_id: id, subject_id: id, command_id: id, command_label: text,
  status: z.enum(['ready', 'repairable', 'partial-repair', 'operator-action-required', 'external-action-required', 'blocked']), prerequisites: z.array(operatorPrerequisiteSchema).max(100),
  repair_plan_id: id.nullable(), trust_ceiling: z.literal('connected-observed'), evaluated_at: iso, generation_hash: hash
}).strict().superRefine((value, context) => {
  const ids = value.prerequisites.map((item) => item.prerequisite_id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Readiness prerequisite IDs must be unique.' });
  const statuses = value.prerequisites.map((item) => item.status);
  if (value.status === 'ready' && statuses.some((status) => status !== 'ready')) context.addIssue({ code: 'custom', message: 'Ready commands cannot contain an unresolved prerequisite.' });
  if (value.status === 'repairable' && !statuses.some((status) => ['expiring', 'expired'].includes(status))) context.addIssue({ code: 'custom', message: 'Repairable commands require an exact-scope repair candidate.' });
  if (value.status === 'partial-repair' && (!statuses.some((status) => ['expiring', 'expired'].includes(status)) || !statuses.some((status) => ['authentication-required', 'dependency-missing', 'approval-required'].includes(status)))) context.addIssue({ code: 'custom', message: 'Partial repair requires both an exact-scope repair and an external prerequisite.' });
  if (value.status === 'operator-action-required' && !statuses.some((status) => ['expiring', 'expired'].includes(status))) context.addIssue({ code: 'custom', message: 'Operator-action commands require a non-automatable lifecycle prerequisite.' });
  if (value.status === 'external-action-required' && !statuses.some((status) => ['authentication-required', 'dependency-missing', 'approval-required'].includes(status))) context.addIssue({ code: 'custom', message: 'External-action commands require an explicit external prerequisite.' });
  if (value.status === 'blocked' && !statuses.some((status) => ['revoked', 'disconnected-read-only'].includes(status))) context.addIssue({ code: 'custom', message: 'Blocked commands require a fail-closed prerequisite.' });
});
export type OperatorReadiness = z.infer<typeof operatorReadinessSchema>;

export const operatorReadinessStateSchema = z.object({
  schema_version: z.literal(1), generated_at: iso, clock_skew_tolerance_seconds: z.number().int().min(0).max(300),
  commands: z.array(operatorReadinessSchema).max(500), active_repair_plan_id: id.nullable()
}).strict();
export type OperatorReadinessState = z.infer<typeof operatorReadinessStateSchema>;
