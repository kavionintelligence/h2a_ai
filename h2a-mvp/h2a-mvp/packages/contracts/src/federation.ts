import { z } from 'zod';
import { governedAgentMessageSchema } from './context-broker';
import { authorityActorSchema, taskEnvelopeSchema } from './v2';
import { ceremonyCorrelationSchema } from './ceremony';

const id = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const signature = z.string().regex(/^ed25519:[A-Za-z0-9+/]+={0,2}$/);
const publicKey = z.string().startsWith('-----BEGIN PUBLIC KEY-----').max(4000);
const endpoint = z.string().url().max(1000).refine((value) => !new URL(value).username && !new URL(value).password, 'Federation endpoints cannot contain credentials.');

export const federationCapabilitySchema = z.enum([
  'task.receive', 'context.receive', 'message.receive', 'heartbeat', 'ack', 'revocation'
]);
export type FederationCapability = z.infer<typeof federationCapabilitySchema>;

export const federationNodeIdentitySchema = z.object({
  schema_version: z.literal(2),
  node_id: id,
  organization_id: id,
  display_name: z.string().trim().min(2).max(120),
  public_key_pem: publicKey,
  key_fingerprint: sha256,
  endpoint,
  endpoint_policy: z.enum(['loopback-only', 'https-required']),
  tls_certificate_fingerprint: sha256.optional(),
  capabilities: z.array(federationCapabilitySchema).min(1).max(20),
  status: z.enum(['active', 'offline', 'revoked']),
  created_at: timestamp,
  updated_at: timestamp,
  canonical_hash: sha256,
  node_signature: signature
}).strict();
export type FederationNodeIdentity = z.infer<typeof federationNodeIdentitySchema>;

export const federationInvitationSchema = z.object({
  schema_version: z.literal(2),
  invitation_id: id,
  inviter_node: federationNodeIdentitySchema,
  invited_organization_id: id.optional(),
  allowed_capabilities: z.array(federationCapabilitySchema).min(1).max(20),
  maximum_context_fields: z.number().int().min(1).max(200),
  nonce: id,
  issued_at: timestamp,
  expires_at: timestamp,
  status: z.enum(['open', 'used', 'revoked', 'expired']),
  canonical_hash: sha256,
  node_signature: signature
}).strict();
export type FederationInvitation = z.infer<typeof federationInvitationSchema>;

export const federationRegistrationSchema = z.object({
  schema_version: z.literal(2),
  registration_id: id,
  invitation_id: id,
  invitation_nonce: id,
  joining_node: federationNodeIdentitySchema,
  requested_capabilities: z.array(federationCapabilitySchema).min(1).max(20),
  created_at: timestamp,
  canonical_hash: sha256,
  node_signature: signature
}).strict();
export type FederationRegistration = z.infer<typeof federationRegistrationSchema>;

export const federationAcceptanceSchema = z.object({
  schema_version: z.literal(2),
  acceptance_id: id,
  peer_id: id,
  invitation_id: id,
  registration_id: id,
  host_node: federationNodeIdentitySchema,
  joining_node_id: id,
  accepted_capabilities: z.array(federationCapabilitySchema).min(1).max(20),
  maximum_context_fields: z.number().int().min(1).max(200),
  accepted_at: timestamp,
  expires_at: timestamp,
  canonical_hash: sha256,
  node_signature: signature
}).strict();
export type FederationAcceptance = z.infer<typeof federationAcceptanceSchema>;

export const federationPeerSchema = z.object({
  schema_version: z.literal(2),
  peer_id: id,
  invitation_id: id,
  local_node_id: id,
  remote_node: federationNodeIdentitySchema,
  pinned_key_fingerprint: sha256,
  pinned_tls_certificate_fingerprint: sha256.optional(),
  capabilities: z.array(federationCapabilitySchema).min(1).max(20),
  maximum_context_fields: z.number().int().min(1).max(200),
  status: z.enum(['pending', 'active', 'offline', 'revoked', 'expired']),
  outbound_sequence: z.number().int().nonnegative(),
  inbound_sequence: z.number().int().nonnegative(),
  last_heartbeat_at: timestamp.optional(),
  accepted_at: timestamp,
  expires_at: timestamp,
  updated_at: timestamp
}).strict();
export type FederationPeer = z.infer<typeof federationPeerSchema>;

export const federatedPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('task'),
    task: taskEnvelopeSchema,
    context_projection: z.record(z.string(), z.unknown()),
    context_field_names: z.array(id).max(200),
    projection_hash: sha256
  }).strict(),
  z.object({ type: z.literal('governed-message'), message: governedAgentMessageSchema }).strict(),
  z.object({ type: z.literal('heartbeat'), sent_at: timestamp }).strict(),
  z.object({
    type: z.literal('ack'),
    acknowledged_envelope_id: id,
    status: z.enum(['accepted', 'completed', 'rejected']),
    received_context_fields: z.array(id).max(200).default([]),
    output_ref: id.optional(),
    output_hash: sha256.optional(),
    reason_code: id
  }).strict(),
  z.object({ type: z.literal('revocation'), peer_id: id, reason_code: id, revoked_at: timestamp }).strict()
]);
export type FederatedPayload = z.infer<typeof federatedPayloadSchema>;

export const federationEnvelopeSchema = z.object({
  schema_version: z.literal(2),
  envelope_id: id,
  peer_id: id,
  sender_node_id: id,
  recipient_node_id: id,
  origin_organization_id: id,
  trace_id: id,
  ceremony_id: id.optional(),
  idempotency_key: id.optional(),
  task_id: id.optional(),
  mandate_id: id.optional(),
  context_grant_id: id.optional(),
  payload: federatedPayloadSchema,
  payload_hash: sha256,
  sequence: z.number().int().positive(),
  nonce: id,
  issued_at: timestamp,
  expires_at: timestamp,
  canonical_hash: sha256,
  sender_signature: signature
}).strict().superRefine((value, context) => {
  if (JSON.stringify(value.payload).length > 512_000) context.addIssue({ code: 'custom', message: 'Federation payload exceeds 512000 characters.' });
  if (value.payload.type === 'task') {
    if (value.task_id !== value.payload.task.task_id || value.mandate_id !== value.payload.task.mandate_id || value.context_grant_id !== value.payload.task.context_grant_id) {
      context.addIssue({ code: 'custom', message: 'Federation task authority references must match the signed Task Envelope.' });
    }
  }
});
export type FederationEnvelope = z.infer<typeof federationEnvelopeSchema>;

export const federationEnvelopeReceiptSchema = z.object({
  receipt_id: id,
  envelope_id: id,
  peer_id: id,
  sender_node_id: id,
  recipient_node_id: id,
  payload_type: z.enum(['task', 'governed-message', 'heartbeat', 'ack', 'revocation']),
  payload_hash: sha256,
  trace_id: id,
  task_id: id.optional(),
  sequence: z.number().int().positive(),
  nonce: id,
  decision: z.enum(['accepted', 'rejected']),
  reason_code: id,
  acknowledged_envelope_id: id.optional(),
  acknowledgement_status: z.enum(['accepted', 'completed', 'rejected']).optional(),
  output_ref: id.optional(),
  output_hash: sha256.optional(),
  received_at: timestamp
}).strict();
export type FederationEnvelopeReceipt = z.infer<typeof federationEnvelopeReceiptSchema>;

export const federationStateSchema = z.object({
  local_node: federationNodeIdentitySchema.nullable(),
  invitations: z.array(federationInvitationSchema).max(200),
  registrations: z.array(federationRegistrationSchema).max(200),
  acceptances: z.array(federationAcceptanceSchema).max(200),
  peers: z.array(federationPeerSchema).max(200),
  receipts: z.array(federationEnvelopeReceiptSchema).max(500),
  remote_listener_enabled: z.boolean()
}).strict();
export type FederationState = z.infer<typeof federationStateSchema>;

export const configureFederationNodeRequestSchema = z.object({
  actor: authorityActorSchema,
  organization_id: id,
  display_name: z.string().trim().min(2).max(120),
  endpoint,
  tls_certificate_fingerprint: sha256.optional(),
  remote_listener_enabled: z.boolean().default(false),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type ConfigureFederationNodeRequest = z.infer<typeof configureFederationNodeRequestSchema>;

export const createFederationInvitationRequestSchema = z.object({
  actor: authorityActorSchema,
  invited_organization_id: id.optional(),
  allowed_capabilities: z.array(federationCapabilitySchema).min(1).max(20),
  maximum_context_fields: z.number().int().min(1).max(200),
  expires_at: timestamp,
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type CreateFederationInvitationRequest = z.infer<typeof createFederationInvitationRequestSchema>;

export const acceptFederationInvitationRequestSchema = z.object({
  actor: authorityActorSchema,
  invitation: federationInvitationSchema,
  expected_inviter_key_fingerprint: sha256,
  requested_capabilities: z.array(federationCapabilitySchema).min(1).max(20),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type AcceptFederationInvitationRequest = z.infer<typeof acceptFederationInvitationRequestSchema>;

export const approveFederationRegistrationRequestSchema = z.object({ actor: authorityActorSchema, registration: federationRegistrationSchema, ceremony: ceremonyCorrelationSchema.optional() }).strict();
export type ApproveFederationRegistrationRequest = z.infer<typeof approveFederationRegistrationRequestSchema>;

export const activateFederationAcceptanceRequestSchema = z.object({ actor: authorityActorSchema, acceptance: federationAcceptanceSchema, ceremony: ceremonyCorrelationSchema.optional() }).strict();
export type ActivateFederationAcceptanceRequest = z.infer<typeof activateFederationAcceptanceRequestSchema>;

export const revokeFederationPeerRequestSchema = z.object({ actor: authorityActorSchema, peer_id: id, reason_code: id, ceremony: ceremonyCorrelationSchema.optional() }).strict();
export type RevokeFederationPeerRequest = z.infer<typeof revokeFederationPeerRequestSchema>;

export const sendFederationHeartbeatRequestSchema = z.object({ peer_id: id }).strict();
export type SendFederationHeartbeatRequest = z.infer<typeof sendFederationHeartbeatRequestSchema>;

export const federationOperatorStateSchema = z.object({
  schema_version: z.literal(1),
  ceremony_id: id.nullable(),
  trace_id: id.nullable(),
  listener: z.object({
    status: z.enum(['stopped', 'running', 'failed']),
    endpoint: endpoint.nullable(),
    last_error: z.string().max(1000).nullable()
  }).strict(),
  last_outbound: z.object({
    envelope_id: id,
    peer_id: id,
    payload_type: z.enum(['task', 'heartbeat', 'ack']),
    payload_hash: sha256,
    sequence: z.number().int().positive(),
    acknowledgement_envelope_id: id.nullable(),
    acknowledgement_hash: sha256.nullable(),
    status: z.enum(['sent', 'acknowledged', 'failed']),
    reason_code: id
  }).strict().nullable(),
  last_received_task: z.object({ envelope_id: id, peer_id: id, task_id: id, payload_hash: sha256, received_at: timestamp }).strict().nullable(),
  replay_proof: z.object({ envelope_id: id, blocked: z.boolean(), reason_code: id }).strict().nullable(),
  revocation_proof: z.object({ peer_id: id, blocked: z.boolean(), reason_code: id }).strict().nullable(),
  updated_at: timestamp
}).strict();
export type FederationOperatorState = z.infer<typeof federationOperatorStateSchema>;

const federationOperatorActorRequest = z.object({ actor: authorityActorSchema, ceremony: ceremonyCorrelationSchema }).strict();
export const startFederationListenerRequestSchema = federationOperatorActorRequest;
export type StartFederationListenerRequest = z.infer<typeof startFederationListenerRequestSchema>;
export const stopFederationListenerRequestSchema = federationOperatorActorRequest;
export type StopFederationListenerRequest = z.infer<typeof stopFederationListenerRequestSchema>;
export const sendFederationTaskRequestSchema = federationOperatorActorRequest.extend({ peer_id: id, lane_id: z.enum(['gemini-antigravity', 'framework', 'openai-codex']) }).strict();
export type SendFederationTaskRequest = z.infer<typeof sendFederationTaskRequestSchema>;
export const sendFederationAcknowledgementRequestSchema = federationOperatorActorRequest.extend({ peer_id: id }).strict();
export type SendFederationAcknowledgementRequest = z.infer<typeof sendFederationAcknowledgementRequestSchema>;
export const sendFederationOperatorHeartbeatRequestSchema = federationOperatorActorRequest.extend({ peer_id: id }).strict();
export type SendFederationOperatorHeartbeatRequest = z.infer<typeof sendFederationOperatorHeartbeatRequestSchema>;
export const proveFederationReplayRequestSchema = federationOperatorActorRequest;
export type ProveFederationReplayRequest = z.infer<typeof proveFederationReplayRequestSchema>;
export const proveFederationRevocationRequestSchema = federationOperatorActorRequest.extend({ peer_id: id }).strict();
export type ProveFederationRevocationRequest = z.infer<typeof proveFederationRevocationRequestSchema>;
