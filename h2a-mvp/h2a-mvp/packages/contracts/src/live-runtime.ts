import { z } from 'zod';
import { runtimeTrustModeSchema } from './v2';
import { ceremonyCorrelationSchema } from './ceremony';

const id = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });

export const liveProviderIdSchema = z.enum(['claude-code', 'openai-codex', 'gemini-antigravity']);
export type LiveProviderId = z.infer<typeof liveProviderIdSchema>;

export const liveProviderHealthSchema = z.enum(['ready', 'degraded', 'authentication-required', 'dependency-missing', 'disabled']);
export type LiveProviderHealth = z.infer<typeof liveProviderHealthSchema>;

export const liveProviderStatusSchema = z.object({
  provider: liveProviderIdSchema,
  health: liveProviderHealthSchema,
  executable: z.string().max(1000).optional(),
  version: z.string().max(200).optional(),
  detail: z.string().max(1000),
  trust_mode: runtimeTrustModeSchema,
  checked_at: timestamp
}).strict();
export type LiveProviderStatus = z.infer<typeof liveProviderStatusSchema>;

export const liveRunStatusSchema = z.enum(['starting', 'running', 'succeeded', 'failed', 'cancelled', 'timed-out', 'revoked']);
export type LiveRunStatus = z.infer<typeof liveRunStatusSchema>;

export const startLiveRunRequestSchema = z.object({
  provider: liveProviderIdSchema,
  agent_id: id,
  passport_id: id,
  binding_id: id,
  runtime_session_id: id,
  mandate_id: id,
  trace_id: id,
  ceremony_id: id.optional(),
  idempotency_key: id.optional(),
  workspace_path: z.string().trim().min(1).max(1000),
  prompt: z.string().trim().min(8).max(8000),
  model: id.optional(),
  timeout_seconds: z.number().int().min(10).max(600).default(120),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type StartLiveRunRequest = z.infer<typeof startLiveRunRequestSchema>;

export const liveRunRecordSchema = z.object({
  run_id: id,
  provider: liveProviderIdSchema,
  agent_id: id,
  passport_id: id,
  binding_id: id,
  runtime_session_id: id,
  mandate_id: id,
  trace_id: id,
  ceremony_id: id.optional(),
  idempotency_key: id.optional(),
  workspace_path: z.string(),
  executable: z.string(),
  executable_version: z.string().optional(),
  argument_policy: z.array(id),
  environment_keys: z.array(id),
  prompt_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  trust_mode: runtimeTrustModeSchema,
  status: liveRunStatusSchema,
  process_id: z.number().int().positive().optional(),
  exit_code: z.number().int().nullable().optional(),
  termination_reason: id.optional(),
  output_summary: z.string().max(4000).optional(),
  started_at: timestamp,
  completed_at: timestamp.optional(),
  updated_at: timestamp
}).strict();
export type LiveRunRecord = z.infer<typeof liveRunRecordSchema>;

export const runtimeOutputKindSchema = z.enum(['lifecycle', 'provider-event', 'stdout', 'stderr']);
export const runtimeOutputRecordSchema = z.object({
  output_id: id,
  run_id: id,
  sequence: z.number().int().nonnegative(),
  kind: runtimeOutputKindSchema,
  content: z.string().max(4000),
  created_at: timestamp
}).strict();
export type RuntimeOutputRecord = z.infer<typeof runtimeOutputRecordSchema>;

export const liveRuntimeStateSchema = z.object({
  providers: z.array(liveProviderStatusSchema),
  runs: z.array(liveRunRecordSchema),
  output: z.array(runtimeOutputRecordSchema)
}).strict();
export type LiveRuntimeState = z.infer<typeof liveRuntimeStateSchema>;

export const cancelLiveRunRequestSchema = z.object({ run_id: id, reason: z.string().trim().min(2).max(500), ceremony: ceremonyCorrelationSchema.optional() }).strict();
export type CancelLiveRunRequest = z.infer<typeof cancelLiveRunRequestSchema>;

export const liveRuntimeProbeRequestSchema = z.object({ provider: liveProviderIdSchema.optional() }).strict();
export type LiveRuntimeProbeRequest = z.infer<typeof liveRuntimeProbeRequestSchema>;
