import { z } from 'zod';
import { guidedWorkflowStateSchema } from './guided-workflow';

export const officeTrustCeilingSchema = z.enum(['unverified', 'connected-observed']);

export const officeEntityKindSchema = z.enum([
  'human', 'passport', 'provider', 'agent', 'framework-agent', 'assignment', 'approval',
  'context-grant', 'handoff', 'message', 'federation-peer', 'federation-envelope',
  'runtime-session', 'trace', 'alert'
]);
export type OfficeEntityKind = z.infer<typeof officeEntityKindSchema>;

export const officeEntityStatusSchema = z.enum([
  'idle', 'ready', 'queued', 'working', 'waiting', 'blocked', 'succeeded', 'failed',
  'revoked', 'offline', 'warning'
]);
export type OfficeEntityStatus = z.infer<typeof officeEntityStatusSchema>;

export const officeEntityActivitySchema = z.enum([
  'decorative-idle', 'canonical-work', 'canonical-wait', 'canonical-handoff',
  'persisted-success', 'persisted-denial', 'persisted-failure', 'inactive'
]);
export type OfficeEntityActivity = z.infer<typeof officeEntityActivitySchema>;

const officeIdSchema = z.string().trim().min(1).max(240);
const officeHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const officeEntitySchema = z.object({
  entity_id: officeIdSchema,
  kind: officeEntityKindSchema,
  primary_id: officeIdSchema,
  label: z.string().trim().min(1).max(180),
  detail: z.string().trim().min(1).max(500),
  status: officeEntityStatusSchema,
  activity: officeEntityActivitySchema,
  activity_basis: z.enum(['decorative', 'canonical-state', 'persisted-evidence']),
  source_domain: officeIdSchema,
  related_ids: z.array(officeIdSchema).max(100),
  authority_chain: z.array(officeIdSchema).max(32),
  context_fields: z.array(officeIdSchema).max(200),
  withheld_context_fields: z.array(officeIdSchema).max(200),
  predecessor_hashes: z.array(officeHashSchema).max(100),
  provider_health: officeIdSchema.nullable(),
  output_hash: officeHashSchema.nullable(),
  reason_code: officeIdSchema.nullable(),
  evidence_refs: z.array(officeIdSchema).max(500),
  trace_id: officeIdSchema.nullable(),
  selectable_agent_id: officeIdSchema.nullable(),
  updated_at: z.string().trim().min(1).max(80).nullable()
}).strict().superRefine((entity, context) => {
  if (entity.activity === 'persisted-success' && (entity.activity_basis !== 'persisted-evidence' || entity.evidence_refs.length === 0)) {
    context.addIssue({ code: 'custom', message: 'Success animation requires persisted evidence.' });
  }
  if ((entity.activity === 'persisted-denial' || entity.activity === 'persisted-failure') && entity.activity_basis !== 'persisted-evidence') {
    context.addIssue({ code: 'custom', message: 'Denial and failure animation require persisted evidence.' });
  }
});
export type OfficeEntity = z.infer<typeof officeEntitySchema>;

export const officeCollaborationSignalSchema = z.object({
  signal_id: officeIdSchema,
  target_entity_id: officeIdSchema.nullable(),
  kind: z.enum(['work-graph', 'provider-run', 'governed-message', 'least-context-handoff', 'approval-route', 'federation-envelope']),
  title: z.string().trim().min(1).max(180),
  status: officeEntityStatusSchema,
  trace_id: officeIdSchema.nullable(),
  sender_id: officeIdSchema.nullable(),
  recipient_id: officeIdSchema.nullable(),
  released_fields: z.array(officeIdSchema).max(100),
  withheld_fields: z.array(officeIdSchema).max(100),
  predecessor_hashes: z.array(officeHashSchema).max(100),
  output_hash: officeHashSchema.nullable(),
  reason_code: officeIdSchema.nullable(),
  evidence_refs: z.array(officeIdSchema).max(500),
  updated_at: z.string().trim().min(1).max(80).nullable()
}).strict();

export const officeFederationPortalSchema = z.object({
  peer_id: officeIdSchema,
  label: z.string().trim().min(1).max(180),
  state: z.enum(['offline', 'active', 'replay-blocked', 'revoked']),
  key_fingerprint: z.string().trim().min(1).max(200),
  maximum_context_fields: z.number().int().nonnegative(),
  last_reason_code: officeIdSchema.nullable()
}).strict();

export const officeStateSchema = z.object({
  schema_version: z.literal(2),
  generated_at: z.string().datetime({ offset: true }),
  runtime_mode: z.enum(['scripted-rehearsal', 'live-and-scripted']),
  trust_ceiling: officeTrustCeilingSchema,
  evidence_integrity: z.enum(['verified', 'warning', 'failed']),
  counts: z.object({
    humans: z.number().int().nonnegative(),
    agents: z.number().int().nonnegative(),
    assignments: z.number().int().nonnegative(),
    pending_approvals: z.number().int().nonnegative(),
    active_context_grants: z.number().int().nonnegative(),
    active_federation_peers: z.number().int().nonnegative()
  }).strict(),
  selected_agent_id: z.string().trim().min(1).max(160).nullable(),
  active_trace_id: z.string().trim().min(1).max(160).nullable(),
  acceptance: z.object({
    status: z.enum(['passed', 'incomplete', 'blocked']),
    passed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative()
  }).strict(),
  workflow: guidedWorkflowStateSchema,
  collaboration: z.object({
    signals: z.array(officeCollaborationSignalSchema).max(1000),
    portals: z.array(officeFederationPortalSchema).max(100)
  }).strict(),
  entities: z.array(officeEntitySchema).max(5000),
  alerts: z.object({
    total: z.number().int().nonnegative(),
    blocking: z.number().int().nonnegative()
  }).strict()
}).strict();
export type OfficeState = z.infer<typeof officeStateSchema>;
