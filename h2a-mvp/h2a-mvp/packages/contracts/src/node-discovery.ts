import { z } from 'zod';
import { federationNodeIdentitySchema } from './federation';

const id = z.string().trim().min(1).max(240);
const iso = z.string().datetime({ offset: true });
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const nodeDiscoveryModeSchema = z.enum(['same-host', 'secure-lan', 'future-directory']);
export type NodeDiscoveryMode = z.infer<typeof nodeDiscoveryModeSchema>;

export const nodeDiscoveryAdvertisedFieldSchema = z.enum([
  'node_id', 'organization_id', 'display_name', 'endpoint_policy',
  'capabilities', 'key_fingerprint', 'pairing_code_hint', 'agent_catalog', 'expires_at'
]);
export type NodeDiscoveryAdvertisedField = z.infer<typeof nodeDiscoveryAdvertisedFieldSchema>;

export const discoveredAgentAdvertisementSchema = z.object({
  agent_id: id,
  runtime_binding_id: id,
  passport_id: id,
  runtime_session_id: id,
  runtime_attestation_id: id,
  human_owner_id: id,
  display_name: z.string().trim().min(1).max(120),
  provider: z.enum(['claude-code', 'openai-codex', 'gemini-antigravity', 'custom-cli']),
  capabilities: z.array(id).max(100),
  status: z.enum(['ready', 'offline'])
}).strict();
export type DiscoveredAgentAdvertisement = z.infer<typeof discoveredAgentAdvertisementSchema>;

export const discoveredNodeSchema = z.object({
  discovery_id: id,
  mode: nodeDiscoveryModeSchema,
  node_id: id,
  organization_id: id,
  display_name: z.string().trim().min(2).max(120),
  endpoint_policy: z.enum(['loopback-only', 'https-required']),
  capabilities: z.array(z.enum(['task.receive', 'context.receive', 'message.receive', 'heartbeat', 'ack', 'revocation'])).min(1).max(20),
  key_fingerprint: hash,
  pairing_code_hint: z.string().regex(/^[A-Z0-9]{4}$/u),
  advertised_fields: z.array(nodeDiscoveryAdvertisedFieldSchema).min(1).max(9),
  discovered_at: iso,
  expires_at: iso,
  trust_status: z.literal('unconfirmed'),
  search_names: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  connection_code: z.string().regex(/^[A-Z0-9]{8}$/u).optional(),
  agents: z.array(discoveredAgentAdvertisementSchema).max(100).default([])
}).strict().superRefine((value, context) => {
  const advertised = new Set(value.advertised_fields);
  for (const required of ['node_id', 'organization_id', 'display_name', 'key_fingerprint', 'expires_at'] as const) {
    if (!advertised.has(required)) context.addIssue({ code: 'custom', message: `Discovery metadata must advertise ${required}.` });
  }
});
export type DiscoveredNode = z.infer<typeof discoveredNodeSchema>;

export const signedNodePresenceSchema = z.object({
  schema_version: z.literal(1),
  discovery_id: id,
  mode: z.enum(['same-host', 'secure-lan']),
  node: federationNodeIdentitySchema,
  search_names: z.array(z.string().trim().min(1).max(120)).max(20),
  agents: z.array(discoveredAgentAdvertisementSchema).max(100).default([]),
  connection_code: z.string().regex(/^[A-Z0-9]{8}$/u),
  pairing_code_hint: z.string().regex(/^[A-Z0-9]{4}$/u),
  issued_at: iso,
  expires_at: iso,
  canonical_hash: hash,
  node_signature: z.string().regex(/^ed25519:[A-Za-z0-9+/=]+$/u)
}).strict();
export type SignedNodePresence = z.infer<typeof signedNodePresenceSchema>;

export const nodeDiscoverySnapshotSchema = z.object({
  schema_version: z.literal(1),
  mode: nodeDiscoveryModeSchema,
  availability: z.enum(['available', 'disabled', 'not-implemented']),
  nodes: z.array(discoveredNodeSchema).max(200),
  telemetry: z.literal('disabled'),
  generated_at: iso
}).strict().superRefine((value, context) => {
  if (value.mode === 'future-directory' && value.availability !== 'not-implemented') {
    context.addIssue({ code: 'custom', message: 'Future directory lookup cannot be represented as available in the local MVP.' });
  }
});
export type NodeDiscoverySnapshot = z.infer<typeof nodeDiscoverySnapshotSchema>;

export const refreshNodeDiscoveryRequestSchema = z.object({
  search: z.string().trim().max(120).default('')
}).strict();
export type RefreshNodeDiscoveryRequest = z.infer<typeof refreshNodeDiscoveryRequestSchema>;
