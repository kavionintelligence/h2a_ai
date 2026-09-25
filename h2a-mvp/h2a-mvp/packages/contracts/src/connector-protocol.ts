import { z } from 'zod';
import { connectorManifestSchema, taskEnvelopeSchema } from './v2';
import { ceremonyCorrelationSchema } from './ceremony';

const id = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const signature = z.string().regex(/^ed25519:[A-Za-z0-9+/]+={0,2}$/);

export const CONNECTOR_PROTOCOL_VERSION = '1.0' as const;

export const connectorFrameKindSchema = z.enum([
  'task', 'message', 'event', 'authorization', 'context-request',
  'context-response', 'result', 'acknowledgement', 'cancellation'
]);
export type ConnectorFrameKind = z.infer<typeof connectorFrameKindSchema>;

export const connectorFrameSchema = z.object({
  protocol_version: z.literal(CONNECTOR_PROTOCOL_VERSION),
  frame_id: id,
  kind: connectorFrameKindSchema,
  connector_manifest_id: id,
  task_id: id,
  trace_id: id,
  sequence: z.number().int().nonnegative(),
  idempotency_key: id,
  causation_id: id.optional(),
  created_at: timestamp,
  expires_at: timestamp,
  payload: z.record(z.string(), z.unknown()),
  payload_hash: sha256,
  sender_signature: signature
}).strict();
export type ConnectorFrame = z.infer<typeof connectorFrameSchema>;

export const connectorImportRequestSchema = z.object({
  manifest: connectorManifestSchema,
  publisher_public_key_pem: z.string().includes('PUBLIC KEY').max(8000),
  runtime_public_key_pem: z.string().includes('PUBLIC KEY').max(8000),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type ConnectorImportRequest = z.infer<typeof connectorImportRequestSchema>;

export const connectorHealthSchema = z.enum(['healthy', 'degraded', 'unreachable', 'disabled']);
export type ConnectorHealth = z.infer<typeof connectorHealthSchema>;

export const registeredConnectorSchema = z.object({
  manifest: connectorManifestSchema,
  publisher_public_key_pem: z.string(),
  runtime_public_key_pem: z.string(),
  imported_at: timestamp,
  health: connectorHealthSchema,
  last_health_detail: z.string().max(500),
  last_health_at: timestamp
}).strict();
export type RegisteredConnector = z.infer<typeof registeredConnectorSchema>;

export const deliveryStatusSchema = z.enum([
  'queued', 'in-flight', 'retrying', 'acknowledged', 'dead-letter', 'cancelled'
]);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const deliveryRecordSchema = z.object({
  delivery_id: id,
  connector_manifest_id: id,
  task: taskEnvelopeSchema,
  frame: connectorFrameSchema,
  status: deliveryStatusSchema,
  attempts: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
  next_attempt_at: timestamp,
  last_error: z.string().max(1000).optional(),
  result_frame: connectorFrameSchema.optional(),
  acknowledgement_frame: connectorFrameSchema.optional(),
  created_at: timestamp,
  updated_at: timestamp
}).strict();
export type DeliveryRecord = z.infer<typeof deliveryRecordSchema>;

export const connectorProtocolStateSchema = z.object({
  connectors: z.array(registeredConnectorSchema),
  deliveries: z.array(deliveryRecordSchema),
  dead_letter_count: z.number().int().nonnegative()
}).strict();
export type ConnectorProtocolState = z.infer<typeof connectorProtocolStateSchema>;

export const contextRequestPayloadSchema = z.object({
  context_grant_id: id,
  requested_fields: z.array(id).min(1).max(100),
  purpose: z.string().trim().min(2).max(500)
}).strict();
export type ContextRequestPayload = z.infer<typeof contextRequestPayloadSchema>;

export const contextResponsePayloadSchema = z.object({
  authorized: z.boolean(),
  reason_code: id,
  granted_fields: z.record(z.string(), z.unknown()),
  withheld_fields: z.array(id)
}).strict();
export type ContextResponsePayload = z.infer<typeof contextResponsePayloadSchema>;

export const connectorDeliveryResultSchema = z.object({
  result: connectorFrameSchema,
  acknowledgement: connectorFrameSchema
}).strict();
export type ConnectorDeliveryResult = z.infer<typeof connectorDeliveryResultSchema>;

export const cancelDeliveryRequestSchema = z.object({ delivery_id: id, reason: z.string().trim().min(2).max(500), ceremony: ceremonyCorrelationSchema.optional() }).strict();
export type CancelDeliveryRequest = z.infer<typeof cancelDeliveryRequestSchema>;
