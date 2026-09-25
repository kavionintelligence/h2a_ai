import { z } from 'zod';
import { ceremonyCorrelationSchema } from './ceremony';
import { authorityActorSchema } from './v2';

const id = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const leastContextLaneIdSchema = z.enum(['claude-code', 'gemini-antigravity', 'framework', 'openai-codex']);
export type LeastContextLaneId = z.infer<typeof leastContextLaneIdSchema>;

export const leastContextLaneSchema = z.object({
  lane_id: leastContextLaneIdSchema,
  title: z.string().min(2).max(160),
  status: z.enum(['not-ready', 'ready', 'running', 'acknowledged', 'denied']),
  agent_id: id.nullable(),
  passport_id: id.nullable(),
  runtime_session_id: id.nullable(),
  mandate_id: id.nullable(),
  assignment_id: id.nullable(),
  connector_manifest_id: id.nullable(),
  context_grant_id: id.nullable(),
  requested_fields: z.array(id).max(20),
  released_fields: z.array(id).max(20),
  withheld_fields: z.array(id).max(20),
  transformations: z.record(z.string(), z.enum(['value', 'mask', 'summarize', 'reference'])),
  token_budget: z.number().int().positive(),
  projected_tokens: z.number().int().nonnegative().nullable(),
  use_count: z.number().int().nonnegative(),
  disclosure_id: id.nullable(),
  delivery_id: id.nullable(),
  handoff_message_id: id.nullable(),
  projection_hash: sha256.nullable(),
  output_hash: sha256.nullable(),
  execution_kind: z.enum(['official-provider-cli', 'signed-framework-connector']).nullable().default(null),
  provider_output_hash: sha256.nullable().default(null),
  predecessor_hashes: z.array(sha256).max(20),
  error: z.string().max(1000).nullable()
}).strict();
export type LeastContextLane = z.infer<typeof leastContextLaneSchema>;

export const leastContextStateSchema = z.object({
  schema_version: z.literal(1),
  ceremony_id: id.nullable(),
  trace_id: id.nullable(),
  status: z.enum(['not-started', 'ready', 'running', 'succeeded', 'revocation-proved', 'blocked']),
  artifact_id: id.nullable(),
  artifact_name: z.string().max(160).nullable(),
  lanes: z.array(leastContextLaneSchema).length(4),
  revocation: z.object({
    context_grant_id: id.nullable(),
    disclosure_id: id.nullable(),
    reason_code: z.string().max(160).nullable(),
    provider_launch_blocked: z.boolean(),
    passed: z.boolean()
  }).strict(),
  last_error: z.string().max(1000).nullable(),
  updated_at: timestamp
}).strict();
export type LeastContextState = z.infer<typeof leastContextStateSchema>;

export const prepareLeastContextRequestSchema = z.object({
  actor: authorityActorSchema,
  ceremony: ceremonyCorrelationSchema,
  recovery_mode: z.boolean().optional(),
  artifact_name: z.string().trim().min(2).max(160),
  source_resource: z.string().trim().min(1).max(300),
  fields: z.object({
    case_id: z.string().min(1).max(1000),
    system_name: z.string().min(1).max(1000),
    owner_email: z.string().min(1).max(1000),
    control_summary: z.string().min(1).max(4000),
    recovery_secret: z.string().min(1).max(4000)
  }).strict()
}).strict();
export type PrepareLeastContextRequest = z.infer<typeof prepareLeastContextRequestSchema>;

export const runLeastContextLaneRequestSchema = z.object({ ceremony: ceremonyCorrelationSchema, lane_id: leastContextLaneIdSchema }).strict();
export type RunLeastContextLaneRequest = z.infer<typeof runLeastContextLaneRequestSchema>;

export const renewLeastContextGrantRequestSchema = z.object({ actor: authorityActorSchema, ceremony: ceremonyCorrelationSchema, lane_id: leastContextLaneIdSchema }).strict();
export type RenewLeastContextGrantRequest = z.infer<typeof renewLeastContextGrantRequestSchema>;

export const proveLeastContextRevocationRequestSchema = z.object({ actor: authorityActorSchema, ceremony: ceremonyCorrelationSchema, lane_id: leastContextLaneIdSchema }).strict();
export type ProveLeastContextRevocationRequest = z.infer<typeof proveLeastContextRevocationRequestSchema>;
