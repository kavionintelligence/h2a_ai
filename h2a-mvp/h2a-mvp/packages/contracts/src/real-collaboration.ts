import { z } from 'zod';
import { ceremonyCorrelationSchema } from './ceremony';
import { frameworkConnectorHealthSchema } from './framework-connectors';
import { liveProviderHealthSchema } from './live-runtime';

const id = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const realCollaborationLaneIdSchema = z.enum(['claude-code', 'gemini-antigravity', 'framework', 'openai-codex']);
export type RealCollaborationLaneId = z.infer<typeof realCollaborationLaneIdSchema>;
export const realCollaborationLaneStatusSchema = z.enum(['not-ready', 'ready', 'starting', 'running', 'succeeded', 'failed', 'cancelled', 'timed-out']);

export const realCollaborationLaneSchema = z.object({
  lane_id: realCollaborationLaneIdSchema,
  title: z.string().min(2).max(160),
  provider: z.enum(['claude-code', 'gemini-antigravity', 'custom-cli', 'openai-codex']),
  status: realCollaborationLaneStatusSchema,
  health: z.union([liveProviderHealthSchema, frameworkConnectorHealthSchema]),
  detail: z.string().max(1000),
  version: z.string().max(200).optional(),
  agent_id: id.nullable(),
  passport_id: id.nullable(),
  binding_id: id.nullable(),
  runtime_session_id: id.nullable(),
  mandate_id: id.nullable(),
  assignment_id: id.nullable(),
  run_id: id.nullable(),
  output_hash: sha256.nullable(),
  dependency_output_hashes: z.array(sha256).max(10),
  started_at: timestamp.nullable(),
  completed_at: timestamp.nullable(),
  error: z.string().max(1000).nullable()
}).strict();
export type RealCollaborationLane = z.infer<typeof realCollaborationLaneSchema>;

const runnableLaneStatuses = new Set<RealCollaborationLane['status']>(['ready', 'failed', 'cancelled', 'timed-out']);
const activeLaneStatuses = new Set<RealCollaborationLane['status']>(['starting', 'running']);

export function isRealCollaborationLaneRunnable(lane: RealCollaborationLane, lanes: RealCollaborationLane[]): boolean {
  return runnableLaneStatuses.has(lane.status)
    && !lanes.some((candidate) => candidate.lane_id !== lane.lane_id && activeLaneStatuses.has(candidate.status));
}

export const realCollaborationStateSchema = z.object({
  schema_version: z.literal(1),
  ceremony_id: id.nullable(),
  trace_id: id.nullable(),
  status: z.enum(['not-started', 'preflight-required', 'ready', 'running', 'succeeded', 'blocked']),
  workspace_path: z.string().max(1000).nullable(),
  framework_kind: z.enum(['mcp', 'custom-cli']),
  lanes: z.array(realCollaborationLaneSchema).length(4),
  completed_idempotency_keys: z.array(id).max(100),
  last_error: z.string().max(1000).nullable(),
  updated_at: timestamp
}).strict();
export type RealCollaborationState = z.infer<typeof realCollaborationStateSchema>;

export const prepareRealCollaborationRequestSchema = z.object({
  ceremony: ceremonyCorrelationSchema,
  framework_kind: z.enum(['mcp', 'custom-cli']).default('mcp')
}).strict();
export type PrepareRealCollaborationRequest = z.infer<typeof prepareRealCollaborationRequestSchema>;

export const replaceRealCollaborationAuthorityRequestSchema = z.object({
  ceremony: ceremonyCorrelationSchema,
  human_proof_id: id.optional(),
  proof_purpose: z.string().trim().min(2).max(500).optional()
}).strict().superRefine((value, context) => {
  if ((value.human_proof_id === undefined) !== (value.proof_purpose === undefined)) context.addIssue({ code: 'custom', message: 'Exact-purpose authority replacement requires both proof ID and purpose.' });
});
export type ReplaceRealCollaborationAuthorityRequest = z.infer<typeof replaceRealCollaborationAuthorityRequestSchema>;

export const runRealCollaborationLaneRequestSchema = z.object({
  ceremony: ceremonyCorrelationSchema,
  lane_id: realCollaborationLaneIdSchema
}).strict();
export type RunRealCollaborationLaneRequest = z.infer<typeof runRealCollaborationLaneRequestSchema>;

export const cancelRealCollaborationLaneRequestSchema = z.object({
  ceremony: ceremonyCorrelationSchema,
  lane_id: realCollaborationLaneIdSchema,
  reason: z.string().trim().min(2).max(500)
}).strict();
export type CancelRealCollaborationLaneRequest = z.infer<typeof cancelRealCollaborationLaneRequestSchema>;
