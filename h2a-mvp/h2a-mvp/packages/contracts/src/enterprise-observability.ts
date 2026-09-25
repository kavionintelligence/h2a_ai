import { z } from 'zod';
import { runtimeTrustModeSchema } from './v2';

const id = z.string().trim().min(1).max(240);
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const enterpriseTraceReferenceLimit = 2000;

export const enterpriseEntityKindSchema = z.enum([
  'organization', 'human', 'membership', 'authority-credential', 'human-proof', 'agent', 'passport',
  'runtime', 'connector', 'mandate', 'context-grant', 'approval', 'federation-node', 'live-run', 'output'
]);
export type EnterpriseEntityKind = z.infer<typeof enterpriseEntityKindSchema>;

export const enterpriseTopologyNodeSchema = z.object({
  node_id: id,
  kind: enterpriseEntityKindSchema,
  label: z.string().trim().min(1).max(180),
  detail: z.string().trim().min(1).max(500),
  status: id,
  organization_id: id.optional(),
  trust_mode: runtimeTrustModeSchema.optional(),
  evidence_refs: z.array(id).max(enterpriseTraceReferenceLimit)
}).strict();
export type EnterpriseTopologyNode = z.infer<typeof enterpriseTopologyNodeSchema>;

export const enterpriseRelationshipSchema = z.enum([
  'contains', 'member-of', 'authorized-by', 'proves', 'sponsors', 'identifies', 'runs-as', 'connects-through',
  'bounded-by', 'approved-by', 'federated-with', 'executed', 'produced'
]);
export type EnterpriseRelationship = z.infer<typeof enterpriseRelationshipSchema>;

export const enterpriseTopologyEdgeSchema = z.object({
  edge_id: id,
  from_node_id: id,
  to_node_id: id,
  relationship: enterpriseRelationshipSchema,
  status: id,
  evidence_refs: z.array(id).max(enterpriseTraceReferenceLimit)
}).strict();
export type EnterpriseTopologyEdge = z.infer<typeof enterpriseTopologyEdgeSchema>;

const referenceSet = z.object({
  human_ids: z.array(id).max(enterpriseTraceReferenceLimit), membership_ids: z.array(id).max(enterpriseTraceReferenceLimit), authority_credential_ids: z.array(id).max(enterpriseTraceReferenceLimit),
  human_proof_ids: z.array(id).max(enterpriseTraceReferenceLimit), passport_ids: z.array(id).max(enterpriseTraceReferenceLimit), runtime_ids: z.array(id).max(enterpriseTraceReferenceLimit),
  mandate_ids: z.array(id).max(enterpriseTraceReferenceLimit), context_grant_ids: z.array(id).max(enterpriseTraceReferenceLimit), approval_ids: z.array(id).max(enterpriseTraceReferenceLimit),
  connector_ids: z.array(id).max(enterpriseTraceReferenceLimit), federation_node_ids: z.array(id).max(enterpriseTraceReferenceLimit), live_run_ids: z.array(id).max(enterpriseTraceReferenceLimit), output_hashes: z.array(sha256).max(enterpriseTraceReferenceLimit)
}).strict();

export const enterpriseTraceSummarySchema = z.object({
  trace_id: id, started_at: timestamp, updated_at: timestamp, event_count: z.number().int().positive(),
  actor_ids: z.array(id).max(enterpriseTraceReferenceLimit), subject_ids: z.array(id).max(enterpriseTraceReferenceLimit), event_types: z.array(id).max(enterpriseTraceReferenceLimit), references: referenceSet,
  resolution_status: z.enum(['complete', 'partial', 'not-applicable']),
  missing_links: z.array(z.enum(['human', 'membership', 'authority-credential', 'human-proof', 'passport', 'runtime', 'mandate', 'context-grant', 'approval', 'connector', 'federation-node', 'output'])).max(20),
  integrity_status: z.enum(['verified', 'warning', 'failed'])
}).strict();
export type EnterpriseTraceSummary = z.infer<typeof enterpriseTraceSummarySchema>;

export const enterpriseReplacementSeamSchema = z.object({
  seam_id: id, boundary: z.string().trim().min(1).max(120), local_implementation: z.string().trim().min(1).max(300),
  replacement_target: z.string().trim().min(1).max(300), contract: z.string().trim().min(1).max(240), readiness: z.enum(['ready', 'partial', 'future'])
}).strict();
export type EnterpriseReplacementSeam = z.infer<typeof enterpriseReplacementSeamSchema>;

export const enterpriseClaimSchema = z.object({
  claim_id: id, claim: z.string().trim().min(1).max(300), status: z.enum(['verified', 'connected-observed', 'boundary', 'deferred']),
  evidence_event_types: z.array(id).max(50), matching_event_count: z.number().int().nonnegative(), challenge: z.string().trim().min(1).max(500)
}).strict();
export type EnterpriseClaim = z.infer<typeof enterpriseClaimSchema>;

export const enterprisePostureSchema = z.object({
  organizations: z.number().int().nonnegative(), active_humans: z.number().int().nonnegative(), active_credentials: z.number().int().nonnegative(),
  active_agents: z.number().int().nonnegative(), active_context_grants: z.number().int().nonnegative(), pending_approvals: z.number().int().nonnegative(),
  active_federation_peers: z.number().int().nonnegative(), healthy_connectors: z.number().int().nonnegative(), live_processes: z.number().int().nonnegative(),
  trust_modes: z.object({ unverified: z.number().int().nonnegative(), 'connected-observed': z.number().int().nonnegative(), governed: z.number().int().nonnegative(), 'external-attested': z.number().int().nonnegative() }).strict(),
  evidence_integrity: z.enum(['verified', 'warning', 'failed']), evidence_records: z.number().int().nonnegative()
}).strict();
export type EnterprisePosture = z.infer<typeof enterprisePostureSchema>;

export const enterpriseOverviewStateSchema = z.object({
  schema_version: z.literal(2), generated_at: timestamp, posture: enterprisePostureSchema,
  nodes: z.array(enterpriseTopologyNodeSchema).max(2000), edges: z.array(enterpriseTopologyEdgeSchema).max(4000), traces: z.array(enterpriseTraceSummarySchema).max(1000),
  replacement_seams: z.array(enterpriseReplacementSeamSchema).max(50), claims: z.array(enterpriseClaimSchema).max(100)
}).strict();
export type EnterpriseOverviewState = z.infer<typeof enterpriseOverviewStateSchema>;
