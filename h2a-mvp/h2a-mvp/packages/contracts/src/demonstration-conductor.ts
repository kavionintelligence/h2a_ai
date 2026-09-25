import { z } from 'zod';

const id = z.string().trim().min(1).max(240);
const iso = z.string().datetime({ offset: true });

export const conductorPauseKindSchema = z.enum([
  'human-proof', 'mutual-trust', 'independent-approval', 'provider-consent',
  'physical-person', 'external-machine', 'missing-dependency', 'security-denial'
]);
export type ConductorPauseKind = z.infer<typeof conductorPauseKindSchema>;

export const demonstrationConductorStepSchema = z.object({
  step_id: id,
  journey_id: id,
  title: z.string().trim().min(1).max(160),
  status: z.enum(['not-started', 'ready', 'running', 'paused', 'passed', 'failed', 'denied', 'cancelled']),
  dependency_ids: z.array(id).max(50),
  safe_automation: z.boolean(),
  pause_kind: conductorPauseKindSchema.nullable(),
  reason_code: id,
  evidence_refs: z.array(id).max(200),
  attempts: z.number().int().nonnegative()
}).strict().superRefine((value, context) => {
  if (value.safe_automation && value.pause_kind !== null) context.addIssue({ code: 'custom', message: 'Automated conductor steps cannot represent a human pause.' });
});
export type DemonstrationConductorStep = z.infer<typeof demonstrationConductorStepSchema>;

export const demonstrationConductorSchema = z.object({
  schema_version: z.literal(1),
  conductor_id: id,
  ceremony_id: id,
  trace_id: id,
  status: z.enum(['ready', 'running', 'paused', 'blocked', 'completed', 'cancelled', 'interrupted']),
  active_step_id: id.nullable(),
  steps: z.array(demonstrationConductorStepSchema).min(1).max(200),
  canonical_cursor: z.number().int().nonnegative(),
  created_at: iso,
  updated_at: iso,
  completed_at: iso.nullable(),
  trust_ceiling: z.literal('connected-observed')
}).strict();
export type DemonstrationConductor = z.infer<typeof demonstrationConductorSchema>;

export const demonstrationConductorCommandSchema = z.object({
  action: z.enum(['start', 'resume', 'retry', 'cancel']),
  conductor_id: id.nullable(),
  expected_canonical_cursor: z.number().int().nonnegative().nullable(),
  operation_key: id
}).strict().superRefine((value, context) => {
  if (value.action === 'start' && value.conductor_id !== null) {
    context.addIssue({ code: 'custom', message: 'A start command cannot target an existing conductor.' });
  }
  if (value.action !== 'start' && value.conductor_id === null) {
    context.addIssue({ code: 'custom', message: 'A conductor id is required after start.' });
  }
});
export type DemonstrationConductorCommand = z.infer<typeof demonstrationConductorCommandSchema>;
