import { z } from 'zod';
import { ceremonyCorrelationSchema } from './ceremony';

export const V2_CONTRACT_VERSION = 2 as const;
export const H2A_A2A_EXTENSION_URI = 'urn:h2a:authority-envelope:v1' as const;

const id = z.string().trim().min(1).max(160);
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const signature = z.string().startsWith('ed25519:');
const publicKey = z.string().startsWith('-----BEGIN PUBLIC KEY-----');
const lifecycleStatus = z.enum(['active', 'suspended', 'revoked', 'expired']);
const riskTier = z.enum(['standard', 'sensitive', 'restricted', 'critical']);

export const runtimeTrustModeSchema = z.enum([
  'governed',
  'connected-observed',
  'external-attested',
  'unverified'
]);
export type RuntimeTrustMode = z.infer<typeof runtimeTrustModeSchema>;

export const organizationSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  organization_id: id,
  name: z.string().trim().min(2).max(160),
  policy_version: id,
  signing_root_key_id: id,
  status: z.enum(['active', 'suspended']),
  created_at: timestamp,
  updated_at: timestamp
}).strict();
export type Organization = z.infer<typeof organizationSchema>;

export const humanIdentityV2Schema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  human_id: id,
  organization_id: id,
  display_name: z.string().trim().min(2).max(100),
  status: z.enum(['active', 'locked', 'suspended', 'terminated', 'revoked']),
  active_membership_id: id.optional(),
  current_enrollment_id: id.optional(),
  created_at: timestamp,
  updated_at: timestamp
}).strict();
export type HumanIdentityV2 = z.infer<typeof humanIdentityV2Schema>;

export const employmentMembershipSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  membership_id: id,
  organization_id: id,
  human_id: id,
  employee_id: id,
  department: z.string().trim().min(1).max(120),
  manager_membership_id: id.optional(),
  role_ids: z.array(id).max(32),
  status: z.enum(['active', 'suspended', 'transferred', 'terminated']),
  effective_from: timestamp,
  effective_until: timestamp.optional(),
  updated_at: timestamp
}).strict();
export type EmploymentMembership = z.infer<typeof employmentMembershipSchema>;

export const authorityRoleSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  role_id: id,
  organization_id: id,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(500),
  authority_scopes: z.array(z.object({
    resource: id,
    actions: z.array(id).min(1).max(64),
    max_amount: z.number().nonnegative().optional(),
    max_records: z.number().int().positive().optional()
  }).strict()).min(1).max(64),
  approval_powers: z.array(id).max(64),
  status: z.enum(['active', 'retired']),
  updated_at: timestamp
}).strict();
export type AuthorityRole = z.infer<typeof authorityRoleSchema>;

export const humanAuthorityCredentialSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  credential_id: id,
  organization_id: id,
  membership_id: id,
  role_ids: z.array(id).min(1).max(32),
  resource_constraints: z.array(id).max(100),
  action_constraints: z.array(id).max(100),
  approval_policy_ids: z.array(id).max(32),
  issued_at: timestamp,
  expires_at: timestamp,
  status: lifecycleStatus,
  canonical_hash: sha256,
  organization_signature: signature
}).strict();
export type HumanAuthorityCredential = z.infer<typeof humanAuthorityCredentialSchema>;

export const authorityActorSchema = z.object({
  membership_id: id,
  human_proof_id: id,
  authority_credential_id: id
}).strict();
export type AuthorityActor = z.infer<typeof authorityActorSchema>;

export const bootstrapOrganizationRequestSchema = z.object({
  organization_id: id,
  name: z.string().trim().min(2).max(160),
  policy_version: id,
  human_id: id,
  membership_id: id,
  human_proof_id: id,
  employee_id: id,
  department: z.string().trim().min(1).max(120),
  credential_expires_at: timestamp,
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type BootstrapOrganizationRequest = z.infer<typeof bootstrapOrganizationRequestSchema>;

export const createAuthorityRoleRequestSchema = z.object({
  actor: authorityActorSchema,
  role_id: id,
  organization_id: id,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(500),
  authority_scopes: authorityRoleSchema.shape.authority_scopes,
  approval_powers: z.array(id).max(64),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type CreateAuthorityRoleRequest = z.infer<typeof createAuthorityRoleRequestSchema>;

export const joinMembershipRequestSchema = z.object({
  actor: authorityActorSchema,
  organization_id: id,
  membership_id: id,
  human_id: id,
  employee_id: id,
  department: z.string().trim().min(1).max(120),
  manager_membership_id: id.optional(),
  role_ids: z.array(id).max(32),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type JoinMembershipRequest = z.infer<typeof joinMembershipRequestSchema>;

export const membershipLifecycleRequestSchema = z.object({
  actor: authorityActorSchema,
  membership_id: id,
  action: z.enum(['suspend', 'reactivate', 'transfer', 'terminate', 'assign-roles']),
  department: z.string().trim().min(1).max(120).optional(),
  manager_membership_id: id.optional(),
  role_ids: z.array(id).max(32).optional(),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict().superRefine((request, context) => {
  if (request.action === 'transfer' && !request.department) {
    context.addIssue({ code: 'custom', message: 'department is required for transfer.' });
  }
  if (request.action === 'assign-roles' && !request.role_ids?.length) {
    context.addIssue({ code: 'custom', message: 'role_ids are required for role assignment.' });
  }
});
export type MembershipLifecycleRequest = z.infer<typeof membershipLifecycleRequestSchema>;

export const issueAuthorityCredentialRequestSchema = z.object({
  actor: authorityActorSchema,
  organization_id: id,
  membership_id: id,
  role_ids: z.array(id).min(1).max(32),
  resource_constraints: z.array(id).max(100),
  action_constraints: z.array(id).max(100),
  approval_policy_ids: z.array(id).max(32),
  expires_at: timestamp,
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type IssueAuthorityCredentialRequest = z.infer<typeof issueAuthorityCredentialRequestSchema>;

export const recoverAdministratorCredentialRequestSchema = z.object({
  organization_id: id,
  membership_id: id,
  human_proof_id: id,
  expires_at: timestamp,
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type RecoverAdministratorCredentialRequest = z.infer<typeof recoverAdministratorCredentialRequestSchema>;

export const repairAuthorityCredentialRequestSchema = z.object({
  organization_id: id,
  membership_id: id,
  human_proof_id: id,
  replaces_credential_id: id,
  proof_purpose: z.string().trim().min(2).max(300),
  command_id: id,
  expires_at: timestamp,
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type RepairAuthorityCredentialRequest = z.infer<typeof repairAuthorityCredentialRequestSchema>;

export const authorityCredentialLifecycleRequestSchema = z.object({
  actor: authorityActorSchema,
  credential_id: id,
  action: z.enum(['suspend', 'reactivate', 'revoke'])
}).strict();
export type AuthorityCredentialLifecycleRequest = z.infer<typeof authorityCredentialLifecycleRequestSchema>;

export const humanAuthorityReasonCodeSchema = z.enum([
  'AUTHORIZED',
  'ORGANIZATION_UNAVAILABLE',
  'HUMAN_PROOF_REQUIRED',
  'HUMAN_PROOF_SUBJECT_MISMATCH',
  'MEMBERSHIP_NOT_FOUND',
  'MEMBERSHIP_INACTIVE',
  'CREDENTIAL_NOT_FOUND',
  'CREDENTIAL_INACTIVE',
  'CREDENTIAL_EXPIRED',
  'CREDENTIAL_SIGNATURE_INVALID',
  'ROLE_INACTIVE',
  'RESOURCE_NOT_ALLOWED',
  'ACTION_NOT_ALLOWED',
  'AMOUNT_EXCEEDS_ROLE',
  'RECORD_LIMIT_EXCEEDED',
  'APPROVAL_POWER_REQUIRED'
]);
export type HumanAuthorityReasonCode = z.infer<typeof humanAuthorityReasonCodeSchema>;

export const evaluateHumanAuthorityRequestSchema = z.object({
  organization_id: id,
  membership_id: id,
  human_proof_id: id,
  authority_credential_id: id,
  resource: id,
  action: id,
  amount: z.number().nonnegative().optional(),
  records: z.number().int().positive().optional(),
  required_approval_power: id.optional(),
  purpose: z.string().trim().min(2).max(300)
}).strict();
export type EvaluateHumanAuthorityRequest = z.infer<typeof evaluateHumanAuthorityRequestSchema>;

export const humanAuthorityDecisionSchema = z.object({
  decision_id: id,
  trace_id: id,
  organization_id: id,
  membership_id: id,
  human_proof_id: id,
  authority_credential_id: id,
  resource: id,
  action: id,
  decision: z.enum(['ALLOW', 'DENY']),
  reason_code: humanAuthorityReasonCodeSchema,
  matched_role_ids: z.array(id).max(32),
  evaluated_at: timestamp
}).strict();
export type HumanAuthorityDecision = z.infer<typeof humanAuthorityDecisionSchema>;

export const humanAssuranceSummarySchema = z.object({
  human_id: id,
  membership_id: id,
  human_proof_id: id,
  purpose: z.string().trim().min(2).max(300).optional(),
  expires_at: timestamp
}).strict();
export type HumanAssuranceSummary = z.infer<typeof humanAssuranceSummarySchema>;

export const organizationAuthorityStateSchema = z.object({
  organizations: z.array(organizationSchema),
  memberships: z.array(employmentMembershipSchema),
  roles: z.array(authorityRoleSchema),
  credentials: z.array(humanAuthorityCredentialSchema),
  assurance: z.array(humanAssuranceSummarySchema),
  decisions: z.array(humanAuthorityDecisionSchema).max(200)
}).strict();
export type OrganizationAuthorityState = z.infer<typeof organizationAuthorityStateSchema>;

export const biometricTokenSetPolicySchema = z.object({
  policy_id: id,
  token_set_size: z.number().int().min(20).max(70),
  required_matches: z.number().int().min(1).max(70),
  bch_error_tolerance: z.number().int().positive(),
  proof_ttl_seconds: z.number().int().min(30).max(3600),
  quality_threshold: z.number().min(0).max(1),
  liveness_threshold: z.number().min(0).max(1),
  minimum_distance_cm: z.number().positive(),
  maximum_distance_cm: z.number().positive(),
  calibration_status: z.enum(['demo-unmeasured', 'measured'])
}).strict().refine((policy) => policy.required_matches <= policy.token_set_size, {
  message: 'required_matches cannot exceed token_set_size.'
}).refine((policy) => policy.minimum_distance_cm < policy.maximum_distance_cm, {
  message: 'minimum_distance_cm must be less than maximum_distance_cm.'
});
export type BiometricTokenSetPolicy = z.infer<typeof biometricTokenSetPolicySchema>;

export const biometricEnrollmentV2Schema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  enrollment_id: id,
  organization_id: id,
  human_id: id,
  version: z.number().int().positive(),
  provider: z.literal('local-face-bch'),
  modality: z.literal('face'),
  model_set_hash: sha256,
  policy: biometricTokenSetPolicySchema,
  protected_record_refs: z.array(id).min(20).max(70),
  public_record_hashes: z.array(sha256).min(20).max(70),
  status: lifecycleStatus,
  created_at: timestamp,
  rotated_from_enrollment_id: id.optional(),
  canonical_hash: sha256,
  organization_signature: signature
}).strict().refine((record) => record.protected_record_refs.length === record.policy.token_set_size, {
  message: 'protected_record_refs must match token_set_size.'
}).refine((record) => record.public_record_hashes.length === record.policy.token_set_size, {
  message: 'public_record_hashes must match token_set_size.'
});
export type BiometricEnrollmentV2 = z.infer<typeof biometricEnrollmentV2Schema>;

export const humanProofV2Schema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  human_proof_id: id,
  human_id: id,
  organization_id: id,
  membership_id: id,
  enrollment_id: id,
  enrollment_version: z.number().int().positive(),
  policy_hash: sha256,
  purpose: z.string().trim().min(2).max(300),
  nonce: id,
  assurance_level: z.enum(['substantial', 'high']),
  verification_methods: z.array(z.enum(['face', 'liveness', 'distance', 'bch'])).min(3).max(4),
  matched_record_count: z.number().int().positive(),
  verified_at: timestamp,
  expires_at: timestamp,
  provider_attestation_hash: sha256,
  canonical_hash: sha256,
  organization_signature: signature
}).strict().refine((proof) => ['face', 'distance', 'bch'].every((method) => proof.verification_methods.includes(method as 'face' | 'distance' | 'bch')), {
  message: 'Human Proof V2 must include face, distance, and BCH verification.'
}).refine((proof) => proof.assurance_level !== 'high' || proof.verification_methods.includes('liveness'), {
  message: 'High-assurance Human Proof V2 requires liveness verification.'
});
export type HumanProofV2 = z.infer<typeof humanProofV2Schema>;

const biometricBitsV2Schema = z.array(z.union([z.literal(0), z.literal(1)])).length(4096);

export const captureAssessmentV2Schema = z.object({
  quality_score: z.number().min(0).max(1),
  liveness_score: z.number().min(0).max(1),
  distance_cm: z.number().positive(),
  face_count: z.number().int().nonnegative(),
  captured_at: timestamp
}).strict();
export type CaptureAssessmentV2 = z.infer<typeof captureAssessmentV2Schema>;

export const biometricCaptureV2Schema = z.object({
  sample: biometricBitsV2Schema,
  assessment: captureAssessmentV2Schema
}).strict();
export type BiometricCaptureV2 = z.infer<typeof biometricCaptureV2Schema>;

export const enrollHumanV2RequestSchema = z.object({
  organization_id: id,
  human_id: id,
  membership_id: id,
  display_name: z.string().trim().min(2).max(100),
  policy: biometricTokenSetPolicySchema,
  captures: z.array(biometricCaptureV2Schema).min(20).max(70)
}).strict().refine((request) => request.captures.length === request.policy.token_set_size, {
  message: 'captures must match policy token_set_size.'
});
export type EnrollHumanV2Request = z.infer<typeof enrollHumanV2RequestSchema>;

export const verifyHumanV2RequestSchema = z.object({
  organization_id: id,
  human_id: id,
  membership_id: id,
  purpose: z.string().trim().min(2).max(300),
  nonce: id,
  capture: biometricCaptureV2Schema
}).strict();
export type VerifyHumanV2Request = z.infer<typeof verifyHumanV2RequestSchema>;

export const biometricEnrollmentLifecycleRequestSchema = z.object({
  enrollment_id: id,
  action: z.enum(['revoke'])
}).strict();
export type BiometricEnrollmentLifecycleRequest = z.infer<typeof biometricEnrollmentLifecycleRequestSchema>;

export const humanIdentityV2StateSchema = z.object({
  identities: z.array(humanIdentityV2Schema),
  enrollments: z.array(biometricEnrollmentV2Schema),
  active_proofs: z.array(humanProofV2Schema),
  selected_human_id: id.nullable(),
  last_result: z.object({
    human_id: id,
    decision: z.enum(['verified', 'rejected']),
    reason_code: z.enum([
      'NO_ACTIVE_ENROLLMENT', 'IDENTITY_UNAVAILABLE', 'MEMBERSHIP_MISMATCH',
      'CAPTURE_POLICY_FAILED', 'BIOMETRIC_MISMATCH', 'NONCE_REPLAY', 'LOCKED_OUT'
    ]).optional(),
    matched_record_count: z.number().int().nonnegative(),
    attempted_at: timestamp
  }).strict().nullable()
}).strict();
export type HumanIdentityV2State = z.infer<typeof humanIdentityV2StateSchema>;

export const agentPassportV2Schema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  passport_id: id,
  agent_id: id,
  organization_id: id,
  sponsor_human_id: id,
  sponsor_membership_id: id,
  issuance_human_proof_id: id,
  issuance_authority_credential_id: id,
  connector_manifest_id: id,
  name: z.string().trim().min(2).max(80),
  role: z.string().trim().min(2).max(120),
  purpose: z.string().trim().min(8).max(1000),
  risk_tier: riskTier,
  capabilities: z.array(id).min(1).max(64),
  workload_public_key: publicKey,
  status: lifecycleStatus,
  issued_at: timestamp,
  expires_at: timestamp,
  canonical_hash: sha256,
  organization_signature: signature
}).strict();
export type AgentPassportV2 = z.infer<typeof agentPassportV2Schema>;

export const runtimeAttestationSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  attestation_id: id,
  passport_id: id,
  connector_manifest_id: id,
  provider: id,
  adapter_version: id,
  executable_hash: sha256.optional(),
  process_id: z.number().int().positive().optional(),
  session_public_key: publicKey,
  challenge_nonce: id,
  challenge_signature: signature,
  trust_mode: runtimeTrustModeSchema,
  trust_evidence_refs: z.array(id).max(64),
  issued_at: timestamp,
  expires_at: timestamp,
  canonical_hash: sha256,
  organization_signature: signature
}).strict();
export type RuntimeAttestation = z.infer<typeof runtimeAttestationSchema>;

export const mandateV2Schema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  mandate_id: id,
  version: z.number().int().positive(),
  parent_mandate_id: id.optional(),
  organization_id: id,
  issuer_human_id: id,
  issuer_membership_id: id,
  issuer_authority_credential_id: id,
  issuer_human_proof_id: id,
  subject_agent_id: id,
  subject_passport_id: id,
  objective: z.string().trim().min(8).max(2000),
  resources: z.array(id).min(1).max(100),
  actions: z.array(id).min(1).max(100),
  prohibited_actions: z.array(id).max(100),
  allowed_context_classes: z.array(id).max(100),
  approval_policy_id: id.optional(),
  delegation_depth_remaining: z.number().int().min(0).max(8),
  issued_at: timestamp,
  expires_at: timestamp,
  status: lifecycleStatus,
  canonical_hash: sha256,
  issuer_signature: signature
}).strict();
export type MandateV2 = z.infer<typeof mandateV2Schema>;

export const approvalPolicySchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  approval_policy_id: id,
  organization_id: id,
  name: z.string().trim().min(2).max(160),
  eligible_role_ids: z.array(id).min(1).max(32),
  quorum: z.number().int().min(1).max(10),
  separation_of_duty: z.boolean(),
  risk_tiers: z.array(riskTier).min(1),
  proof_purpose: z.string().trim().min(2).max(300),
  decision_ttl_seconds: z.number().int().min(30).max(86400),
  status: z.enum(['active', 'retired']),
  updated_at: timestamp
}).strict();
export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;

export const approvalRequestV2Schema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  approval_request_id: id,
  organization_id: id,
  task_id: id,
  requesting_human_id: id,
  requesting_agent_id: id,
  mandate_id: id,
  required_resource: id,
  required_action: id,
  requested_effect_hash: sha256,
  review_context_grant_id: id,
  approval_policy_id: id,
  eligible_membership_ids: z.array(id).min(1).max(100),
  status: z.enum(['pending', 'approved', 'rejected', 'expired', 'withdrawn', 'invalidated']),
  requested_at: timestamp,
  expires_at: timestamp
}).strict();
export type ApprovalRequestV2 = z.infer<typeof approvalRequestV2Schema>;

export const approvalDecisionSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  approval_decision_id: id,
  approval_request_id: id,
  organization_id: id,
  approver_human_id: id,
  approver_membership_id: id,
  human_proof_id: id,
  authority_credential_id: id,
  decision: z.enum(['approved', 'rejected', 'narrowed']),
  conditions: z.array(z.string().trim().min(1).max(500)).max(32),
  resulting_mandate_id: id.optional(),
  decided_at: timestamp,
  expires_at: timestamp,
  canonical_hash: sha256,
  approver_signature: signature
}).strict();
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const approvalMandateExtensionSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  mandate_id: id,
  parent_mandate_id: id,
  approval_request_id: id,
  organization_id: id,
  task_id: id,
  agent_id: id,
  resource: id,
  action: id,
  requested_effect_hash: sha256,
  delegation_depth_remaining: z.literal(0),
  status: z.enum(['active', 'consumed', 'revoked', 'expired']),
  issued_at: timestamp,
  expires_at: timestamp,
  canonical_hash: sha256,
  organization_signature: signature
}).strict();
export type ApprovalMandateExtension = z.infer<typeof approvalMandateExtensionSchema>;

export const approvalResumeRecordSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  resume_id: id,
  approval_request_id: id,
  mandate_id: id,
  idempotency_key: id,
  status: z.enum(['ready', 'executing', 'completed', 'failed', 'invalidated']),
  attempts: z.number().int().min(0).max(1),
  created_at: timestamp,
  started_at: timestamp.optional(),
  completed_at: timestamp.optional(),
  output_hash: sha256.optional(),
  error: z.string().trim().min(1).max(1000).optional()
}).strict();
export type ApprovalResumeRecord = z.infer<typeof approvalResumeRecordSchema>;

export const approvalRequestContextSchema = z.object({
  approval_request_id: id,
  requesting_membership_id: id,
  required_approval_power: id,
  risk_tier: riskTier,
  amount: z.number().nonnegative().optional(),
  record_count: z.number().int().nonnegative().optional(),
  idempotency_key: id,
  ceremony_id: id.optional(),
  trace_id: id.optional()
}).strict();
export type ApprovalRequestContext = z.infer<typeof approvalRequestContextSchema>;

export const authorityApprovalStateSchema = z.object({
  policies: z.array(approvalPolicySchema),
  requests: z.array(approvalRequestV2Schema),
  request_contexts: z.array(approvalRequestContextSchema),
  decisions: z.array(approvalDecisionSchema),
  mandate_extensions: z.array(approvalMandateExtensionSchema),
  resumes: z.array(approvalResumeRecordSchema)
}).strict();
export type AuthorityApprovalState = z.infer<typeof authorityApprovalStateSchema>;

export const createApprovalPolicyRequestSchema = z.object({
  actor: authorityActorSchema,
  organization_id: id,
  approval_policy_id: id,
  name: z.string().trim().min(2).max(160),
  eligible_role_ids: z.array(id).min(1).max(32),
  quorum: z.number().int().min(1).max(10),
  separation_of_duty: z.boolean(),
  risk_tiers: z.array(riskTier).min(1),
  proof_purpose: z.string().trim().min(2).max(300),
  decision_ttl_seconds: z.number().int().min(30).max(86400),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type CreateApprovalPolicyRequest = z.infer<typeof createApprovalPolicyRequestSchema>;

export const requestAuthorityEscalationSchema = z.object({
  organization_id: id,
  task_id: id,
  requesting_human_id: id,
  requesting_membership_id: id,
  requesting_agent_id: id,
  mandate_id: id,
  required_resource: id,
  required_action: id,
  required_approval_power: id,
  requested_effect_hash: sha256,
  review_context_grant_id: id,
  approval_policy_id: id,
  risk_tier: riskTier,
  amount: z.number().nonnegative().optional(),
  record_count: z.number().int().nonnegative().optional(),
  idempotency_key: id,
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type RequestAuthorityEscalation = z.infer<typeof requestAuthorityEscalationSchema>;

export const submitApprovalDecisionRequestSchema = z.object({
  approval_request_id: id,
  approver: authorityActorSchema,
  decision: z.enum(['approve', 'reject']),
  conditions: z.array(z.string().trim().min(1).max(500)).max(32).default([])
}).strict();
export type SubmitApprovalDecisionRequest = z.infer<typeof submitApprovalDecisionRequestSchema>;

export const consumeApprovalResumeRequestSchema = z.object({
  approval_request_id: id,
  idempotency_key: id
}).strict();
export type ConsumeApprovalResumeRequest = z.infer<typeof consumeApprovalResumeRequestSchema>;

export const withdrawApprovalRequestSchema = z.object({
  approval_request_id: id,
  requesting_human_id: id,
  human_proof_id: id
}).strict();
export type WithdrawApprovalRequest = z.infer<typeof withdrawApprovalRequestSchema>;

export const contextGrantSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  context_grant_id: id,
  organization_id: id,
  task_id: id,
  mandate_id: id,
  recipient_agent_id: id,
  recipient_passport_id: id,
  purpose: z.string().trim().min(2).max(500),
  allowed_fields: z.array(id).max(200),
  artifact_refs: z.array(id).max(100),
  transformations: z.array(z.enum(['mask', 'summarize', 'reference', 'truncate', 'filter'])).max(16),
  withheld_field_hashes: z.array(sha256).max(200),
  token_budget: z.number().int().positive(),
  issued_at: timestamp,
  expires_at: timestamp,
  canonical_hash: sha256,
  organization_signature: signature
}).strict();
export type ContextGrant = z.infer<typeof contextGrantSchema>;

export const taskEnvelopeSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  task_id: id,
  organization_id: id,
  trace_id: id,
  ceremony_id: id.optional(),
  requestor_human_id: id,
  assigned_agent_id: id,
  passport_id: id,
  runtime_attestation_id: id,
  mandate_id: id,
  context_grant_id: id,
  objective: z.string().trim().min(8).max(4000),
  dependency_task_ids: z.array(id).max(100),
  output_contract: z.record(z.string(), z.unknown()),
  sequence: z.number().int().nonnegative(),
  idempotency_key: id,
  issued_at: timestamp,
  expires_at: timestamp,
  canonical_hash: sha256,
  organization_signature: signature
}).strict();
export type TaskEnvelope = z.infer<typeof taskEnvelopeSchema>;

export const agentMessageV2Schema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  message_id: id,
  organization_id: id,
  task_id: id,
  trace_id: id,
  sender_passport_id: id,
  recipient_passport_id: id,
  mandate_id: id,
  context_grant_id: id,
  speech_act: z.enum(['request', 'inform', 'propose', 'query', 'response', 'handoff', 'cancel']),
  content_ref: id,
  content_hash: sha256,
  sequence: z.number().int().nonnegative(),
  deduplication_id: id,
  acknowledgement_state: z.enum(['pending', 'acknowledged', 'rejected', 'expired', 'dead-letter']),
  created_at: timestamp,
  expires_at: timestamp,
  sender_signature: signature
}).strict();
export type AgentMessageV2 = z.infer<typeof agentMessageV2Schema>;

export const connectorManifestSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  connector_manifest_id: id,
  name: z.string().trim().min(2).max(160),
  provider: id,
  adapter_version: id,
  protocol: z.enum(['local-cli', 'provider-api', 'a2a-1.0', 'mcp', 'signed-webhook', 'custom-http']),
  auth_method: z.enum(['none', 'official-oauth', 'device-code', 'api-key', 'iam', 'mtls', 'signed-bearer']),
  trust_ceiling: runtimeTrustModeSchema,
  capabilities: z.array(id).min(1).max(100),
  executable: z.string().trim().min(1).max(500).optional(),
  endpoint: z.string().url().optional(),
  h2a_extension_required: z.boolean(),
  status: z.enum(['available', 'authentication-required', 'dependency-missing', 'blocked', 'disabled']),
  probed_at: timestamp.optional(),
  canonical_hash: sha256,
  publisher_signature: signature
}).strict();
export type ConnectorManifest = z.infer<typeof connectorManifestSchema>;

export const runtimeSessionSchema = z.object({
  schema_version: z.literal(V2_CONTRACT_VERSION),
  runtime_session_id: id,
  passport_id: id,
  connector_manifest_id: id,
  runtime_attestation_id: id,
  provider_session_ref: id.optional(),
  trust_mode: runtimeTrustModeSchema,
  state: z.enum(['starting', 'ready', 'working', 'suspended', 'stopping', 'stopped', 'failed', 'revoked']),
  started_at: timestamp,
  last_seen_at: timestamp,
  stopped_at: timestamp.optional(),
  evidence_refs: z.array(id).max(100)
}).strict();
export type RuntimeSession = z.infer<typeof runtimeSessionSchema>;

export const h2aA2aAuthorityEnvelopeSchema = z.object({
  extension_uri: z.literal(H2A_A2A_EXTENSION_URI),
  extension_version: z.literal('1.0'),
  organization_id: id,
  task_envelope_id: id,
  passport_id: id,
  runtime_attestation_id: id,
  mandate_id: id,
  context_grant_id: id,
  trace_id: id,
  sequence: z.number().int().nonnegative(),
  expires_at: timestamp,
  authority_bundle_hash: sha256,
  sender_signature: signature
}).strict();
export type H2AA2AAuthorityEnvelope = z.infer<typeof h2aA2aAuthorityEnvelopeSchema>;

export const v2MigrationReceiptSchema = z.object({
  migration_id: id,
  source_schema_version: z.literal(1),
  target_schema_version: z.literal(V2_CONTRACT_VERSION),
  record_type: z.enum(['human-identity', 'biometric-enrollment', 'human-proof', 'agent-passport', 'mandate']),
  source_record_id: id,
  target_record_id: id,
  organization_id: id,
  status: z.enum(['migrated', 'requires-enrichment', 'rejected']),
  missing_fields: z.array(id),
  source_hash: sha256,
  target_hash: sha256.optional(),
  migrated_at: timestamp,
  migration_signature: signature
}).strict();
export type V2MigrationReceipt = z.infer<typeof v2MigrationReceiptSchema>;

export const humanIdentityV2MigrationRequestSchema = z.object({
  organization_id: id,
  memberships: z.array(z.object({
    human_id: id,
    membership_id: id
  }).strict()).max(1000)
}).strict().superRefine((request, context) => {
  const humanIds = request.memberships.map((membership) => membership.human_id);
  if (new Set(humanIds).size !== humanIds.length) {
    context.addIssue({ code: 'custom', message: 'membership mappings must contain unique human_id values.' });
  }
});
export type HumanIdentityV2MigrationRequest = z.infer<typeof humanIdentityV2MigrationRequestSchema>;

export const humanIdentityV2MigrationResultSchema = z.object({
  identities: z.array(humanIdentityV2Schema),
  receipts: z.array(v2MigrationReceiptSchema)
}).strict();
export type HumanIdentityV2MigrationResult = z.infer<typeof humanIdentityV2MigrationResultSchema>;
