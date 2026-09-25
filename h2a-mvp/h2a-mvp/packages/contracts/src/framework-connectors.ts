import { z } from 'zod';
import { connectorProtocolStateSchema } from './connector-protocol';
import { runtimeTrustModeSchema } from './v2';
import { ceremonyCorrelationSchema } from './ceremony';

const id = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });

export const frameworkConnectorKindSchema = z.enum([
  'n8n', 'langgraph', 'mcp', 'a2a', 'openclaw', 'custom-cli', 'custom-http',
  'openai-api', 'anthropic-api', 'gemini-api', 'bedrock-api'
]);
export type FrameworkConnectorKind = z.infer<typeof frameworkConnectorKindSchema>;

export const frameworkConnectorHealthSchema = z.enum([
  'ready', 'configuration-required', 'authentication-required', 'dependency-missing', 'degraded', 'disabled'
]);
export type FrameworkConnectorHealth = z.infer<typeof frameworkConnectorHealthSchema>;

export const frameworkConnectorDeclarationSchema = z.object({
  connector_id: id,
  kind: frameworkConnectorKindSchema,
  name: z.string().trim().min(2).max(160),
  protocol: z.enum(['local-cli', 'signed-webhook', 'custom-http', 'mcp', 'a2a-1.0', 'provider-api']),
  adapter_version: id,
  trust_ceiling: runtimeTrustModeSchema,
  capabilities: z.array(id).min(1).max(100),
  health: frameworkConnectorHealthSchema,
  detail: z.string().trim().min(2).max(1000),
  setup_document: z.string().trim().min(2).max(500),
  dependency: z.string().trim().min(1).max(200).optional(),
  endpoint_policy: z.enum(['none', 'loopback-only', 'https-required']).default('none'),
  checked_at: timestamp
}).strict();
export type FrameworkConnectorDeclaration = z.infer<typeof frameworkConnectorDeclarationSchema>;

export const frameworkCollaborationStepSchema = z.object({
  step_id: id,
  connector_kind: frameworkConnectorKindSchema,
  connector_manifest_id: id,
  delivery_id: id,
  task_id: id,
  status: z.enum(['acknowledged', 'failed']),
  output_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional()
}).strict();
export type FrameworkCollaborationStep = z.infer<typeof frameworkCollaborationStepSchema>;

export const frameworkCollaborationRunSchema = z.object({
  run_id: id,
  trace_id: id,
  ceremony_id: id.optional(),
  assignment_id: id.optional(),
  passport_id: id.optional(),
  runtime_session_id: id.optional(),
  mandate_id: id,
  status: z.enum(['succeeded', 'failed']),
  trust_mode: runtimeTrustModeSchema,
  steps: z.array(frameworkCollaborationStepSchema).min(1),
  started_at: timestamp,
  completed_at: timestamp,
  evidence_integrity: z.enum(['verified', 'warning', 'failed'])
}).strict();
export type FrameworkCollaborationRun = z.infer<typeof frameworkCollaborationRunSchema>;

export const frameworkConnectorStateSchema = z.object({
  declarations: z.array(frameworkConnectorDeclarationSchema),
  protocol: connectorProtocolStateSchema,
  collaboration_runs: z.array(frameworkCollaborationRunSchema)
}).strict();
export type FrameworkConnectorState = z.infer<typeof frameworkConnectorStateSchema>;

export const frameworkProbeRequestSchema = z.object({ kind: frameworkConnectorKindSchema.optional() }).strict();
export type FrameworkProbeRequest = z.infer<typeof frameworkProbeRequestSchema>;

export const executeFrameworkRequestSchema = z.object({
  kind: z.enum(['mcp', 'a2a', 'custom-cli']),
  organization_id: id,
  requestor_human_id: id,
  assigned_agent_id: id,
  passport_id: id,
  runtime_attestation_id: id,
  runtime_session_id: id,
  mandate_id: id,
  assignment_id: id,
  objective: z.string().trim().min(8).max(4000),
  dependency_task_ids: z.array(id).max(100),
  dependency_output_hashes: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/)).max(100),
  timeout_seconds: z.number().int().min(5).max(120).default(30),
  ceremony: ceremonyCorrelationSchema
}).strict();
export type ExecuteFrameworkRequest = z.infer<typeof executeFrameworkRequestSchema>;
