import { z } from 'zod';
import { authorityActorSchema, contextGrantSchema, taskEnvelopeSchema } from './v2';
import { ceremonyCorrelationSchema } from './ceremony';

const id = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const signature = z.string().regex(/^ed25519:[A-Za-z0-9+/]+={0,2}$/);

export const contextClassificationSchema = z.enum(['public', 'internal', 'confidential', 'restricted']);
export type ContextClassification = z.infer<typeof contextClassificationSchema>;

export const contextTransformationSchema = z.enum(['value', 'mask', 'summarize', 'reference']);
export type ContextTransformation = z.infer<typeof contextTransformationSchema>;

export const artifactFieldMetadataSchema = z.object({
  field: id,
  classification: contextClassificationSchema,
  value_hash: sha256
}).strict();
export type ArtifactFieldMetadata = z.infer<typeof artifactFieldMetadataSchema>;

export const contextArtifactSchema = z.object({
  artifact_id: id,
  organization_id: id,
  name: z.string().trim().min(2).max(160),
  source_resource: id,
  owner_human_id: id,
  fields: z.array(artifactFieldMetadataSchema).min(1).max(200),
  encrypted_payload_ref: id,
  status: z.enum(['active', 'revoked']),
  created_at: timestamp,
  updated_at: timestamp,
  canonical_hash: sha256,
  organization_signature: signature
}).strict();
export type ContextArtifact = z.infer<typeof contextArtifactSchema>;

export const contextFieldRuleSchema = z.object({
  artifact_id: id,
  field: id,
  maximum_classification: contextClassificationSchema,
  transformation: contextTransformationSchema
}).strict();
export type ContextFieldRule = z.infer<typeof contextFieldRuleSchema>;

export const governedContextGrantSchema = z.object({
  grant: contextGrantSchema,
  field_rules: z.array(contextFieldRuleSchema).min(1).max(200),
  status: z.enum(['active', 'revoked', 'expired']),
  maximum_uses: z.number().int().min(1).max(1000),
  use_count: z.number().int().nonnegative(),
  updated_at: timestamp,
  canonical_hash: sha256,
  organization_signature: signature
}).strict();
export type GovernedContextGrant = z.infer<typeof governedContextGrantSchema>;

export const contextDisclosureSchema = z.object({
  disclosure_id: id,
  organization_id: id,
  context_grant_id: id,
  task_id: id,
  mandate_id: id,
  recipient_agent_id: id,
  recipient_passport_id: id,
  purpose: z.string().trim().min(2).max(500),
  requested_fields: z.array(id).max(100),
  granted_fields: z.array(id).max(100),
  withheld_fields: z.array(id).max(100),
  transformation_by_field: z.record(z.string(), contextTransformationSchema),
  disclosed_value_hashes: z.array(sha256).max(100),
  withheld_value_hashes: z.array(sha256).max(100),
  projection_hash: sha256,
  reason_code: id,
  status: z.enum(['authorized', 'denied']),
  idempotency_key: sha256,
  disclosed_at: timestamp,
  canonical_hash: sha256,
  organization_signature: signature
}).strict();
export type ContextDisclosure = z.infer<typeof contextDisclosureSchema>;

export const compactedAuthorityContextSchema = z.object({
  organization_id: id,
  task_id: id,
  trace_id: id,
  requestor_human_id: id,
  assigned_agent_id: id,
  passport_id: id,
  runtime_attestation_id: id,
  mandate_id: id,
  context_grant_id: id,
  authority_hash: sha256
}).strict();
export type CompactedAuthorityContext = z.infer<typeof compactedAuthorityContextSchema>;

export const governedAgentMessageSchema = z.object({
  message_id: id,
  organization_id: id,
  task_id: id,
  trace_id: id,
  sender_connector_manifest_id: id,
  recipient_connector_manifest_id: id,
  sender_passport_id: id,
  recipient_passport_id: id,
  mandate_id: id,
  context_grant_id: id,
  speech_act: z.enum(['request', 'inform', 'propose', 'query', 'response', 'handoff', 'cancel']),
  content_ref: id,
  content_hash: sha256,
  sequence: z.number().int().nonnegative(),
  deduplication_id: id,
  status: z.enum(['queued', 'delivered', 'rejected', 'expired']),
  created_at: timestamp,
  expires_at: timestamp,
  sender_signature: signature
}).strict();
export type GovernedAgentMessage = z.infer<typeof governedAgentMessageSchema>;

export const contextBrokerStateSchema = z.object({
  artifacts: z.array(contextArtifactSchema),
  grants: z.array(governedContextGrantSchema),
  disclosures: z.array(contextDisclosureSchema).max(500),
  messages: z.array(governedAgentMessageSchema).max(500)
}).strict();
export type ContextBrokerState = z.infer<typeof contextBrokerStateSchema>;

export const createContextArtifactRequestSchema = z.object({
  actor: authorityActorSchema,
  organization_id: id,
  name: z.string().trim().min(2).max(160),
  source_resource: id,
  fields: z.array(z.object({ field: id, classification: contextClassificationSchema, value: z.unknown() }).strict()).min(1).max(200),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict().superRefine((request, context) => {
  const names = request.fields.map((item) => item.field);
  if (new Set(names).size !== names.length) context.addIssue({ code: 'custom', message: 'Artifact field names must be unique.' });
});
export type CreateContextArtifactRequest = z.infer<typeof createContextArtifactRequestSchema>;

export const issueContextGrantRequestSchema = z.object({
  actor: authorityActorSchema,
  organization_id: id,
  task_id: id,
  mandate_id: id,
  recipient_agent_id: id,
  recipient_passport_id: id,
  purpose: z.string().trim().min(2).max(500),
  field_rules: z.array(contextFieldRuleSchema).min(1).max(200),
  token_budget: z.number().int().positive().max(1_000_000),
  maximum_uses: z.number().int().min(1).max(1000),
  expires_at: timestamp,
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type IssueContextGrantRequest = z.infer<typeof issueContextGrantRequestSchema>;

export const contextGrantLifecycleRequestSchema = z.object({
  actor: authorityActorSchema,
  context_grant_id: id,
  action: z.literal('revoke'),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type ContextGrantLifecycleRequest = z.infer<typeof contextGrantLifecycleRequestSchema>;

export const inspectContextRequestSchema = z.object({
  task: taskEnvelopeSchema,
  context_grant_id: id,
  requested_fields: z.array(id).min(1).max(100),
  purpose: z.string().trim().min(2).max(500)
}).strict();
export type InspectContextRequest = z.infer<typeof inspectContextRequestSchema>;

export const recordGovernedMessageRequestSchema = governedAgentMessageSchema.omit({ status: true });
export type RecordGovernedMessageRequest = z.infer<typeof recordGovernedMessageRequestSchema>;
