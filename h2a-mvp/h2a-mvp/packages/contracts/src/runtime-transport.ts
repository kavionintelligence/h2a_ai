import { z } from 'zod';
import { liveProviderIdSchema } from './live-runtime';
import { runtimeTrustModeSchema } from './v2';

const id = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const runtimeTransportKindSchema = z.enum(['structured-cli', 'framework-stdio', 'interactive-pty']);
export type RuntimeTransportKind = z.infer<typeof runtimeTransportKindSchema>;

export const runtimeTelemetryKindSchema = z.enum([
  'started', 'output-reference', 'activity', 'awaiting-input', 'turn-complete', 'failed', 'cancelled', 'exited'
]);
export type RuntimeTelemetryKind = z.infer<typeof runtimeTelemetryKindSchema>;

export const terminalSessionStatusSchema = z.enum(['starting', 'running', 'awaiting-input', 'exited', 'failed', 'cancelled', 'revoked']);
export type TerminalSessionStatus = z.infer<typeof terminalSessionStatusSchema>;

export const terminalPurposeSchema = z.enum(['login-consent', 'interactive-session']);
export type TerminalPurpose = z.infer<typeof terminalPurposeSchema>;

export const terminalConfigurationScopeSchema = z.enum(['agent-isolated', 'host-provider-default']);

export const terminalSessionSchema = z.object({
  session_id: id,
  run_id: id,
  provider: liveProviderIdSchema,
  transport: z.literal('interactive-pty'),
  purpose: terminalPurposeSchema,
  agent_id: id,
  passport_id: id,
  binding_id: id,
  runtime_session_id: id,
  mandate_id: id,
  trace_id: id,
  workspace_path: z.string().trim().min(1).max(1000),
  executable_version: z.string().max(200).optional(),
  argument_policy: z.array(id).max(30),
  configuration_scope: terminalConfigurationScopeSchema,
  trust_mode: runtimeTrustModeSchema,
  status: terminalSessionStatusSchema,
  process_id: z.number().int().positive().optional(),
  cols: z.number().int().min(20).max(400),
  rows: z.number().int().min(5).max(200),
  first_cursor: z.number().int().nonnegative(),
  last_cursor: z.number().int().nonnegative(),
  output_hash: hash,
  termination_reason: id.optional(),
  started_at: timestamp,
  completed_at: timestamp.optional(),
  updated_at: timestamp
}).strict();
export type TerminalSession = z.infer<typeof terminalSessionSchema>;

export const terminalReplayEventSchema = z.object({
  event_id: id,
  session_id: id,
  run_id: id,
  cursor: z.number().int().positive(),
  kind: runtimeTelemetryKindSchema,
  content: z.string().max(4000).optional(),
  content_hash: hash,
  byte_count: z.number().int().nonnegative(),
  created_at: timestamp
}).strict();
export type TerminalReplayEvent = z.infer<typeof terminalReplayEventSchema>;

export const terminalLeaseCapabilitySchema = z.enum(['observe', 'interact', 'control']);
export type TerminalLeaseCapability = z.infer<typeof terminalLeaseCapabilitySchema>;

export const terminalAttachmentLeaseSchema = z.object({
  lease_id: id,
  session_id: id,
  client_id: id,
  generation: id,
  capabilities: z.array(terminalLeaseCapabilitySchema).min(1).max(3),
  issued_at: timestamp,
  expires_at: timestamp,
  detached_at: timestamp.optional(),
  revoked_reason: id.optional()
}).strict();
export type TerminalAttachmentLease = z.infer<typeof terminalAttachmentLeaseSchema>;

export const runtimeAttachmentStateSchema = z.object({
  transports: z.array(z.object({
    kind: runtimeTransportKindSchema,
    available: z.boolean(),
    detail: z.string().max(1000)
  }).strict()).length(3),
  sessions: z.array(terminalSessionSchema).max(100),
  leases: z.array(terminalAttachmentLeaseSchema).max(200),
  events: z.array(terminalReplayEventSchema).max(2000),
  trust_ceiling: runtimeTrustModeSchema
}).strict();
export type RuntimeAttachmentState = z.infer<typeof runtimeAttachmentStateSchema>;

export const startTerminalSessionRequestSchema = z.object({
  provider: liveProviderIdSchema,
  purpose: terminalPurposeSchema,
  agent_id: id,
  passport_id: id,
  binding_id: id,
  runtime_session_id: id,
  mandate_id: id,
  trace_id: id,
  workspace_path: z.string().trim().min(1).max(1000),
  cols: z.number().int().min(20).max(400).default(100),
  rows: z.number().int().min(5).max(200).default(28)
}).strict();
export type StartTerminalSessionRequest = z.infer<typeof startTerminalSessionRequestSchema>;

export const attachTerminalRequestSchema = z.object({
  session_id: id,
  client_id: id,
  requested_capabilities: z.array(terminalLeaseCapabilitySchema).min(1).max(3),
  ttl_seconds: z.number().int().min(5).max(120).default(30)
}).strict();
export type AttachTerminalRequest = z.infer<typeof attachTerminalRequestSchema>;

export const terminalLeaseRequestSchema = z.object({
  lease_id: id,
  session_id: id,
  client_id: id,
  generation: id
}).strict();
export type TerminalLeaseRequest = z.infer<typeof terminalLeaseRequestSchema>;

export const terminalInputRequestSchema = terminalLeaseRequestSchema.extend({ data: z.string().min(1).max(8000) }).strict();
export type TerminalInputRequest = z.infer<typeof terminalInputRequestSchema>;

export const terminalResizeRequestSchema = terminalLeaseRequestSchema.extend({
  cols: z.number().int().min(20).max(400), rows: z.number().int().min(5).max(200)
}).strict();
export type TerminalResizeRequest = z.infer<typeof terminalResizeRequestSchema>;

export const terminalCancelRequestSchema = terminalLeaseRequestSchema.extend({ reason: z.string().trim().min(2).max(500) }).strict();
export type TerminalCancelRequest = z.infer<typeof terminalCancelRequestSchema>;

export const terminalReplayRequestSchema = terminalLeaseRequestSchema.extend({ after_cursor: z.number().int().nonnegative() }).strict();
export type TerminalReplayRequest = z.infer<typeof terminalReplayRequestSchema>;

export const terminalReplayResponseSchema = z.object({
  mode: z.enum(['events', 'snapshot-required']),
  session: terminalSessionSchema,
  events: z.array(terminalReplayEventSchema).max(500),
  first_available_cursor: z.number().int().nonnegative(),
  last_cursor: z.number().int().nonnegative()
}).strict();
export type TerminalReplayResponse = z.infer<typeof terminalReplayResponseSchema>;
