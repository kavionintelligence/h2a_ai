import { z } from 'zod';
import { ceremonyCorrelationSchema } from './ceremony';
import { federationAcceptanceSchema, federationCapabilitySchema, federationInvitationSchema, federationRegistrationSchema } from './federation';
import { nodeDiscoverySnapshotSchema } from './node-discovery';
import { authorityActorSchema } from './v2';

const id = z.string().trim().min(1).max(240);
const iso = z.string().datetime({ offset: true });
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const federationPairingStatusSchema = z.enum([
  'discovered', 'requested', 'local-proof-required', 'remote-proof-required',
  'comparison-required', 'local-confirmed', 'remote-confirmed', 'activating',
  'active', 'offline', 'failed', 'expired', 'cancelled', 'revoked', 'replacement-required'
]);
export type FederationPairingStatus = z.infer<typeof federationPairingStatusSchema>;

export const federationPairingSchema = z.object({
  schema_version: z.literal(1),
  pairing_id: id,
  discovery_id: id,
  local_node_id: id,
  remote_node_id: id,
  local_organization_id: id,
  remote_organization_id: id,
  requested_capabilities: z.array(federationCapabilitySchema).min(1).max(20),
  maximum_context_fields: z.number().int().min(1).max(200),
  status: federationPairingStatusSchema,
  local_proof_id: id.nullable(),
  remote_proof_id: id.nullable(),
  comparison_code: z.string().regex(/^[0-9]{6}$/u).nullable(),
  transcript_hash: hash,
  local_confirmed_at: iso.nullable(),
  remote_confirmed_at: iso.nullable(),
  invitation_id: id.nullable(),
  registration_id: id.nullable(),
  acceptance_id: id.nullable(),
  local_peer_id: id.nullable(),
  remote_peer_id: id.nullable(),
  reason_code: id.nullable(),
  evidence_refs: z.array(id).max(200),
  expires_at: iso,
  updated_at: iso,
  trust_ceiling: z.literal('connected-observed')
}).strict().superRefine((value, context) => {
  const comparisonStates: FederationPairingStatus[] = ['comparison-required', 'local-confirmed', 'remote-confirmed', 'activating', 'active'];
  if (comparisonStates.includes(value.status) && value.comparison_code === null) {
    context.addIssue({ code: 'custom', message: 'Mutual confirmation states require a comparison code.' });
  }
  if (value.status === 'active' && [value.local_proof_id, value.remote_proof_id, value.local_confirmed_at, value.remote_confirmed_at, value.local_peer_id, value.remote_peer_id].some((item) => item === null)) {
    context.addIssue({ code: 'custom', message: 'Active pairings require both proofs, confirmations, and canonical peers.' });
  }
});
export type FederationPairing = z.infer<typeof federationPairingSchema>;

export const federationPairingViewSchema = z.object({
  pairing: federationPairingSchema,
  direction: z.enum(['outgoing', 'incoming']),
  remote_display_name: z.string().trim().min(1).max(120),
  remote_key_fingerprint: hash,
  connection_code: z.string().regex(/^[A-Z0-9]{8}$/u),
  local_confirmed: z.boolean(),
  remote_confirmed: z.boolean(),
  invitation: federationInvitationSchema.nullable(),
  registration: federationRegistrationSchema.nullable(),
  acceptance: federationAcceptanceSchema.nullable()
}).strict();
export type FederationPairingView = z.infer<typeof federationPairingViewSchema>;

export const federationPairingStateSchema = z.object({
  schema_version: z.literal(1),
  discovery: nodeDiscoverySnapshotSchema,
  pairings: z.array(federationPairingViewSchema).max(200),
  public_directory: z.literal('disabled'),
  global_username_lookup: z.literal('disabled'),
  secure_lan: z.object({
    enabled: z.boolean(),
    policy: z.enum(['disabled', 'https-pinned-only']),
    implementation: z.literal('node-built-in-udp-multicast'),
    dependency_license: z.literal('Node.js built-in / MIT')
  }).strict(),
  generated_at: iso,
  trust_ceiling: z.literal('connected-observed')
}).strict();
export type FederationPairingState = z.infer<typeof federationPairingStateSchema>;

const pairingCommandBase = z.object({
  actor: authorityActorSchema,
  ceremony: ceremonyCorrelationSchema.optional()
});

export const createFederationPairingRequestSchema = pairingCommandBase.extend({
  discovery_id: id,
  requested_capabilities: z.array(federationCapabilitySchema).min(1).max(20),
  maximum_context_fields: z.number().int().min(1).max(200),
  idempotency_key: id
}).strict();
export type CreateFederationPairingRequest = z.infer<typeof createFederationPairingRequestSchema>;

export const acceptFederationPairingRequestSchema = pairingCommandBase.extend({ pairing_id: id }).strict();
export type AcceptFederationPairingRequest = z.infer<typeof acceptFederationPairingRequestSchema>;

export const confirmFederationPairingRequestSchema = pairingCommandBase.extend({
  pairing_id: id,
  comparison_code: z.string().regex(/^[0-9]{6}$/u)
}).strict();
export type ConfirmFederationPairingRequest = z.infer<typeof confirmFederationPairingRequestSchema>;

export const cancelFederationPairingRequestSchema = pairingCommandBase.extend({ pairing_id: id }).strict();
export type CancelFederationPairingRequest = z.infer<typeof cancelFederationPairingRequestSchema>;
