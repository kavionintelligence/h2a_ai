import { z } from 'zod';
export * from './employeeWorkspace';
import type { CancelDeliveryRequest, ConnectorImportRequest, ConnectorProtocolState } from './connector-protocol';
import type { ExecuteFrameworkRequest, FrameworkConnectorState, FrameworkProbeRequest } from './framework-connectors';
import type { CancelRealCollaborationLaneRequest, PrepareRealCollaborationRequest, RealCollaborationState, ReplaceRealCollaborationAuthorityRequest, RunRealCollaborationLaneRequest } from './real-collaboration';
import type { LeastContextState, PrepareLeastContextRequest, ProveLeastContextRevocationRequest, RenewLeastContextGrantRequest, RunLeastContextLaneRequest } from './least-context';
import type { ConfigureHumanEscalationRequest, HumanEscalationState, StartHumanEscalationRejectionRequest, StartHumanEscalationRequest } from './human-escalation';
import type { CancelLiveRunRequest, LiveRuntimeProbeRequest, LiveRuntimeState, StartLiveRunRequest } from './live-runtime';
import type { AttachTerminalRequest, RuntimeAttachmentState, StartTerminalSessionRequest, TerminalAttachmentLease, TerminalCancelRequest, TerminalInputRequest, TerminalLeaseRequest, TerminalReplayRequest, TerminalReplayResponse, TerminalResizeRequest } from './runtime-transport';
import type { CancelProjectRunRequest, CreateProjectAssignmentRequest, CreateProjectGoalRequest, FetchResearchSourceRequest, IntegrateProjectRequest, ProjectDeliveryState, RegisterProjectRequest, RequestProjectIntegrationApproval, RunProjectAssignmentRequest, RunProjectValidationRequest } from './project-delivery';
import type { ContextBrokerState, ContextGrantLifecycleRequest, CreateContextArtifactRequest, IssueContextGrantRequest } from './context-broker';
import type { AcceptFederationInvitationRequest, ActivateFederationAcceptanceRequest, ApproveFederationRegistrationRequest, ConfigureFederationNodeRequest, CreateFederationInvitationRequest, FederationOperatorState, FederationState, ProveFederationReplayRequest, ProveFederationRevocationRequest, RevokeFederationPeerRequest, SendFederationAcknowledgementRequest, SendFederationOperatorHeartbeatRequest, SendFederationTaskRequest, StartFederationListenerRequest, StopFederationListenerRequest } from './federation';
import type { AcceptFederationPairingRequest, CancelFederationPairingRequest, ConfirmFederationPairingRequest, CreateFederationPairingRequest, FederationPairingState } from './federation-pairing';
import type { RefreshNodeDiscoveryRequest } from './node-discovery';
import type { ApproveWorkGraphRequest, ComposeCollaborativeGoalRequest, EditWorkGraphRequest, GoalWorkGraphState, ProposeWorkGraphRequest, ReassignWorkGraphNodeRequest, RenewWorkGraphNodeRequest, RunWorkGraphRequest, WorkGraphNodeCommandRequest } from './work-graph';
import type { EnterpriseOverviewState } from './enterprise-observability';
import type { FinalAcceptanceExportReceipt, FinalAcceptanceState, FinalAcceptanceVerificationReceipt, Phase44SessionReceipt, VerifyFinalAcceptancePackageRequest } from './final-acceptance';
import type { DemonstrationConductor, DemonstrationConductorCommand } from './demonstration-conductor';
import type { RunContainmentControlRequest, RunSecurityAttackRequest, SecurityValidationState } from './security-validation';
import type { CeremonyState, CreateCeremonySessionRequest, RunCeremonyStepRequest } from './ceremony';
import type { GuidedBootstrapState, PrepareGuidedBootstrapRequest, RunGuidedBootstrapStepRequest } from './guided-bootstrap';
import type { ControlPlaneAttachRequest, ControlPlaneAttachResponse, ControlPlaneCommandRequest, ControlPlaneEventEnvelope, ControlPlaneLeaseRequest, ControlPlaneReplayRequest, ControlPlaneReplayResponse, ControlPlaneSnapshot } from './control-plane';
import { ceremonyCorrelationSchema } from './ceremony';
import type {
  AuthorityCredentialLifecycleRequest,
  AuthorityApprovalState,
  BiometricEnrollmentLifecycleRequest,
  BootstrapOrganizationRequest,
  CreateAuthorityRoleRequest,
  EnrollHumanV2Request,
  EvaluateHumanAuthorityRequest,
  HumanIdentityV2MigrationRequest,
  HumanIdentityV2MigrationResult,
  HumanIdentityV2State,
  IssueAuthorityCredentialRequest,
  RecoverAdministratorCredentialRequest,
  JoinMembershipRequest,
  MembershipLifecycleRequest,
  OrganizationAuthorityState,
  ConsumeApprovalResumeRequest,
  CreateApprovalPolicyRequest,
  RequestAuthorityEscalation,
  SubmitApprovalDecisionRequest,
  WithdrawApprovalRequest,
  VerifyHumanV2Request
} from './v2';
import {
  agentPassportV2Schema,
  runtimeAttestationSchema,
  runtimeSessionSchema,
  runtimeTrustModeSchema,
  v2MigrationReceiptSchema
} from './v2';

export * from './adapter-registry';
export * from './control-plane';
export * from './guided-workflow';
export * from './operator-readiness';
export * from './repair-plan';
export * from './node-discovery';
export * from './federation-pairing';
export * from './collaborative-goal';
export * from './work-graph';
export * from './workflow-execution';
export * from './demonstration-conductor';
export * from './office';
export * from './presentation';
export * from './connector-protocol';
export * from './ceremony';
export * from './context-broker';
export * from './framework-connectors';
export * from './real-collaboration';
export * from './least-context';
export * from './human-escalation';
export * from './federation';
export * from './enterprise-observability';
export * from './final-acceptance';
export * from './security-validation';
export * from './live-runtime';
export * from './runtime-transport';
export * from './project-delivery';
export * from './v2';

export const CURRENT_SCHEMA_VERSION = 1 as const;

const identifierSchema = z.string().trim().min(1).max(160);
const isoTimestampSchema = z.string().datetime({ offset: true });

export const providerIdSchema = z.enum([
  'scripted',
  'openai-codex',
  'claude-code',
  'gemini-antigravity',
  'grok-cli',
  'kimi-code',
  'qwen-cli',
  'opencode',
  'crush-cli',
  'pi-cli',
  'copilot-cli',
  'bedrock',
  'custom-cli'
]);
export type ProviderId = z.infer<typeof providerIdSchema>;

export const agentStatusSchema = z.enum([
  'working',
  'ready',
  'approval-required',
  'blocked',
  'offline'
]);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const assignmentStatusSchema = z.enum(['queued', 'active', 'approval', 'blocked', 'complete']);
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;

export const integrityStatusSchema = z.enum(['verified', 'warning', 'failed']);
export type IntegrityStatus = z.infer<typeof integrityStatusSchema>;

export const agentRuntimeSummarySchema = z.object({
  id: identifierSchema,
  passportId: identifierSchema,
  name: z.string().trim().min(1).max(80),
  initials: z.string().trim().min(1).max(4),
  role: z.string().trim().min(1).max(120),
  provider: providerIdSchema,
  providerLabel: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(160),
  status: agentStatusSchema,
  currentAction: z.string().trim().min(1).max(300),
  mandateId: identifierSchema,
  mandateLabel: z.string().trim().min(1).max(160),
  progress: z.number().int().min(0).max(100),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/)
}).strict();
export type AgentRuntimeSummary = z.infer<typeof agentRuntimeSummarySchema>;

export const workAssignmentSummarySchema = z.object({
  id: identifierSchema,
  title: z.string().trim().min(1).max(160),
  objective: z.string().trim().min(1).max(1000),
  status: assignmentStatusSchema,
  assigneeId: identifierSchema,
  mandateId: identifierSchema,
  risk: z.enum(['standard', 'sensitive', 'restricted']),
  priority: z.number().int().min(1).max(5).default(3),
  dependsOn: z.array(identifierSchema).max(24).default([]),
  requestedAction: z.string().trim().min(1).max(240).optional(),
  traceId: identifierSchema.optional(),
  createdAt: isoTimestampSchema.optional(),
  updatedAt: z.string().trim().min(1).max(80),
  response: z.string().trim().min(1).max(4000).optional(),
  responseCount: z.number().int().nonnegative().default(0),
  messageCount: z.number().int().nonnegative().default(0)
}).strict();
export type WorkAssignmentSummary = z.infer<typeof workAssignmentSummarySchema>;

export const collaborationMessageActSchema = z.enum([
  'request',
  'inform',
  'propose',
  'query',
  'response',
  'handoff'
]);
export type CollaborationMessageAct = z.infer<typeof collaborationMessageActSchema>;

export const collaborationMessageSchema = z.object({
  id: identifierSchema,
  assignmentId: identifierSchema,
  fromAgentId: identifierSchema,
  toAgentId: identifierSchema,
  act: collaborationMessageActSchema,
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4000),
  mandateId: identifierSchema,
  traceId: identifierSchema,
  createdAt: isoTimestampSchema,
  deliveryStatus: z.literal('delivered')
}).strict();
export type CollaborationMessage = z.infer<typeof collaborationMessageSchema>;

export const assignmentResponseSchema = z.object({
  id: identifierSchema,
  assignmentId: identifierSchema,
  agentId: identifierSchema,
  body: z.string().trim().min(1).max(4000),
  traceId: identifierSchema,
  createdAt: isoTimestampSchema
}).strict();
export type AssignmentResponse = z.infer<typeof assignmentResponseSchema>;

export const agentActivitySchema = z.object({
  id: identifierSchema,
  agentId: identifierSchema,
  assignmentId: identifierSchema.optional(),
  kind: z.enum(['assignment', 'status', 'message', 'response', 'runtime', 'system']),
  level: z.enum(['info', 'success', 'attention', 'error']),
  summary: z.string().trim().min(1).max(240),
  detail: z.string().trim().min(1).max(4000).optional(),
  createdAt: isoTimestampSchema
}).strict();
export type AgentActivity = z.infer<typeof agentActivitySchema>;

export const collaborationStateSchema = z.object({
  workplace: z.lazy(() => workplaceSnapshotSchema),
  messages: z.array(collaborationMessageSchema),
  responses: z.array(assignmentResponseSchema),
  activity: z.array(agentActivitySchema)
}).strict();
export type CollaborationState = z.infer<typeof collaborationStateSchema>;

export const authorityEventSummarySchema = z.object({
  id: identifierSchema,
  type: identifierSchema,
  actor: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(500),
  time: z.string().trim().min(1).max(80),
  integrity: integrityStatusSchema
}).strict();
export type AuthorityEventSummary = z.infer<typeof authorityEventSummarySchema>;

export const workplaceSnapshotSchema = z.object({
  generatedAt: isoTimestampSchema,
  agents: z.array(agentRuntimeSummarySchema),
  assignments: z.array(workAssignmentSummarySchema),
  events: z.array(authorityEventSummarySchema)
}).strict();
export type WorkplaceSnapshot = z.infer<typeof workplaceSnapshotSchema>;

export const h2aFeatureConfigSchema = z.object({
  storageMode: z.enum(['local-file', 'backend-api']),
  agentMode: z.enum(['scripted', 'scripted-workplace', 'live-cli', 'bedrock']),
  humanProofMode: z.enum([
    'mock',
    'local-face-bch',
    'biometric-token',
    'webauthn',
    'document-proof'
  ]),
  livenessMode: z.enum(['required', 'demo-bypass']).default('demo-bypass'),
  resourceMode: z.enum(['sandbox', 'external-api'])
}).strict();
export type H2AFeatureConfig = z.infer<typeof h2aFeatureConfigSchema>;

export const defaultFeatureConfig: H2AFeatureConfig = {
  storageMode: 'local-file',
  agentMode: 'scripted-workplace',
  humanProofMode: 'local-face-bch',
  livenessMode: 'demo-bypass',
  resourceMode: 'sandbox'
};

export const systemStatusSchema = h2aFeatureConfigSchema.extend({
  appVersion: z.string().trim().min(1),
  evidenceIntegrity: integrityStatusSchema,
  evidenceRecords: z.number().int().nonnegative(),
  evidenceHeadHash: z.string().nullable(),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  dataPath: z.string().trim().min(1)
}).strict();
export type SystemStatus = z.infer<typeof systemStatusSchema>;

export const authorityEventTypeSchema = z.enum([
  'AGENT_DISCOVERED',
  'AGENT_REGISTERED_IN_H2A',
  'CLASSIFIED_SHADOW',
  'CLASSIFIED_MANAGED',
  'HUMAN_BOUND',
  'PASSPORT_ISSUED',
  'ROOM_CREATED',
  'ROOM_JOINED',
  'MEMORY_PROPOSED',
  'MEMORY_REVIEWED',
  'MEMORY_PUBLISHED',
  'MEMORY_REJECTED',
  'HUMAN_VERIFIED',
  'HUMAN_PROOF_ATTEMPTED',
  'BIOMETRIC_ENROLLED',
  'HUMAN_PROOF_ATTEMPTED_V2',
  'HUMAN_VERIFIED_V2',
  'BIOMETRIC_ENROLLED_V2',
  'BIOMETRIC_ENROLLMENT_ROTATED_V2',
  'BIOMETRIC_ENROLLMENT_REVOKED_V2',
  'V2_MIGRATION_RECORDED',
  'ORGANIZATION_BOOTSTRAPPED',
  'AUTHORITY_ROLE_CREATED',
  'MEMBERSHIP_JOINED',
  'MEMBERSHIP_SUSPENDED',
  'MEMBERSHIP_REACTIVATED',
  'MEMBERSHIP_TRANSFERRED',
  'MEMBERSHIP_TERMINATED',
  'MEMBERSHIP_ROLES_ASSIGNED',
  'AUTHORITY_CREDENTIAL_ISSUED',
  'AUTHORITY_CREDENTIAL_SUSPENDED',
  'AUTHORITY_CREDENTIAL_REACTIVATED',
  'AUTHORITY_CREDENTIAL_REVOKED',
  'HUMAN_AUTHORITY_ALLOWED',
  'HUMAN_AUTHORITY_DENIED',
  'APPROVAL_POLICY_CREATED',
  'AUTHORITY_ESCALATION_REQUESTED',
  'APPROVAL_ROUTED',
  'APPROVAL_DECISION_SIGNED',
  'APPROVAL_QUORUM_REACHED',
  'APPROVAL_REJECTED_V2',
  'APPROVAL_EXPIRED_V2',
  'APPROVAL_INVALIDATED_V2',
  'APPROVAL_RESUME_RECOVERED',
  'APPROVED_ACTION_RESUMED',
  'MANDATE_PROPOSED',
  'MANDATE_CREATED',
  'MANDATE_SIGNED',
  'MANDATE_AMENDED',
  'AGENT_BOUND',
  'AGENT_RUNTIME_BOUND',
  'AGENT_PASSPORT_SUSPENDED',
  'AGENT_PASSPORT_REACTIVATED',
  'AGENT_PASSPORT_REVOKED',
  'AGENT_RUNTIME_DISCONNECTED',
  'AGENT_RUNTIME_RECONNECTED',
  'AGENT_PASSPORT_V2_ISSUED',
  'AGENT_PASSPORT_V2_MIGRATED',
  'WORKLOAD_CHALLENGE_ISSUED',
  'RUNTIME_ATTESTED',
  'RUNTIME_SESSION_ROTATED',
  'RUNTIME_SESSION_REVOKED',
  'WORK_ASSIGNED',
  'WORK_AUTHORITY_REBOUND',
  'WORK_STATUS_CHANGED',
  'WORK_MESSAGE_SENT',
  'WORK_RESPONSE_RECORDED',
  'CONNECTOR_MANIFEST_IMPORTED',
  'CONNECTOR_DELIVERY_QUEUED',
  'CONNECTOR_DELIVERY_ACKNOWLEDGED',
  'CONNECTOR_DELIVERY_RETRY_SCHEDULED',
  'CONNECTOR_DELIVERY_DEAD_LETTERED',
  'CONNECTOR_DELIVERY_CANCELLED',
  'FRAMEWORK_CONNECTOR_PROBED',
  'FRAMEWORK_COLLABORATION_COMPLETED',
  'LIVE_RUNTIME_STARTED',
  'LIVE_RUNTIME_SUCCEEDED',
  'LIVE_RUNTIME_FAILED',
  'LIVE_RUNTIME_CANCELLED',
  'LIVE_RUNTIME_TIMED_OUT',
  'LIVE_RUNTIME_REVOKED',
  'RUNTIME_ATTACHMENT_STARTED',
  'RUNTIME_ATTACHMENT_EXITED',
  'RUNTIME_ATTACHMENT_FAILED',
  'RUNTIME_ATTACHMENT_CANCELLED',
  'RUNTIME_ATTACHMENT_REVOKED',
  'DELEGATION_REQUESTED',
  'DELEGATION_CREATED',
  'DELEGATION_DENIED',
  'CONTEXT_REQUESTED',
  'CONTEXT_DISCLOSED',
  'CONTEXT_DENIED',
  'CONTEXT_ARTIFACT_CREATED',
  'CONTEXT_GRANT_ISSUED',
  'CONTEXT_GRANT_REVOKED',
  'CONTEXT_GRANT_EXPIRED',
  'CONTEXT_DISCLOSURE_AUTHORIZED',
  'CONTEXT_DISCLOSURE_DENIED',
  'GOVERNED_MESSAGE_ACCEPTED',
  'GOVERNED_MESSAGE_REJECTED',
  'FEDERATION_NODE_CONFIGURED',
  'FEDERATION_INVITATION_CREATED',
  'FEDERATION_REGISTRATION_CREATED',
  'FEDERATION_PEER_ACTIVATED',
  'FEDERATION_ENVELOPE_ACCEPTED',
  'FEDERATION_ENVELOPE_REJECTED',
  'FEDERATION_HEARTBEAT_RECORDED',
  'FEDERATION_PEER_REVOKED',
  'FEDERATION_PAIRING_REQUESTED',
  'FEDERATION_PAIRING_REMOTE_PROOF_ACCEPTED',
  'FEDERATION_PAIRING_CODE_CONFIRMED',
  'FEDERATION_PAIRING_ACTIVATED',
  'FEDERATION_PAIRING_CANCELLED',
  'ACTION_REQUESTED',
  'POLICY_ALLOWED',
  'POLICY_DENIED',
  'HUMAN_APPROVAL_REQUIRED',
  'HUMAN_APPROVED',
  'HUMAN_REJECTED',
  'SCENARIO_STARTED',
  'RUNTIME_EXECUTION_STARTED',
  'RUNTIME_EXECUTION_FAILED',
  'RUNTIME_EXECUTION_TIMED_OUT',
  'ACTION_EXECUTED',
  'MANDATE_REVOKED',
  'MANDATE_EXPIRED',
  'AUDIT_BUNDLE_EXPORTED',
  'FINAL_ACCEPTANCE_PACKAGE_EXPORTED',
  'FINAL_ACCEPTANCE_PACKAGE_VERIFIED',
  'FINAL_ACCEPTANCE_PACKAGE_TAMPER_REJECTED',
  'DEMONSTRATION_CONDUCTOR_STARTED',
  'DEMONSTRATION_CONDUCTOR_PAUSED',
  'DEMONSTRATION_CONDUCTOR_RESUMED',
  'DEMONSTRATION_CONDUCTOR_STEP_PASSED',
  'DEMONSTRATION_CONDUCTOR_CANCELLED',
  'DEMONSTRATION_CONDUCTOR_COMPLETED',
  'DEMONSTRATION_CONDUCTOR_INTERRUPTED',
  'CEREMONY_SESSION_CREATED',
  'CEREMONY_STEP_STARTED',
  'CEREMONY_STEP_PASSED',
  'CEREMONY_STEP_FAILED',
  'GUIDED_BOOTSTRAP_PREPARED',
  'GUIDED_BOOTSTRAP_STEP_PASSED',
  'GUIDED_BOOTSTRAP_STEP_FAILED',
  'REAL_COLLABORATION_PREFLIGHTED',
  'LEAST_CONTEXT_WORKFLOW_PREPARED',
  'LEAST_CONTEXT_REVOCATION_PROVED',
  'REAL_COLLABORATION_AUTHORITY_REPLACED',
  'REAL_COLLABORATION_LANE_FAILED',
  'OUTCOME_CREATED',
  'WORKFLOW_COMPLETED'
]);
export type AuthorityEventType = z.infer<typeof authorityEventTypeSchema>;

export const authorityEventInputSchema = z.object({
  trace_id: identifierSchema,
  timestamp: isoTimestampSchema.optional(),
  actor: z.object({
    type: z.enum(['human', 'agent', 'system']),
    id: identifierSchema
  }).strict(),
  subject: z.object({
    type: z.enum(['organization', 'membership', 'authority_role', 'authority_credential', 'human_identity', 'human_proof', 'agent_passport', 'runtime_binding', 'runtime_attestation', 'runtime_session', 'live_runtime_run', 'runtime_attachment', 'assignment', 'message', 'mandate', 'delegation', 'resource', 'outcome', 'ceremony', 'connector_manifest', 'connector_delivery', 'context_artifact', 'context_grant', 'context_disclosure', 'federation_node', 'federation_peer', 'federation_envelope']),
    id: identifierSchema
  }).strict().optional(),
  mandate_id: identifierSchema.optional(),
  parent_event_id: identifierSchema.optional(),
  event_type: authorityEventTypeSchema,
  payload: z.record(z.string(), z.unknown())
}).strict();
export type AuthorityEventInput = z.infer<typeof authorityEventInputSchema>;

export const authorityEventRecordSchema = authorityEventInputSchema.extend({
  event_id: identifierSchema,
  timestamp: isoTimestampSchema,
  previous_hash: z.string().nullable(),
  event_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/)
}).strict();
export type AuthorityEventRecord = z.infer<typeof authorityEventRecordSchema>;

export const biometricReasonCodeSchema = z.enum([
  'CAMERA_DENIED',
  'CAMERA_UNAVAILABLE',
  'CAPTURE_TIMEOUT',
  'FACE_NOT_FOUND',
  'MULTIPLE_FACES',
  'LOW_QUALITY',
  'DISTANCE_OUT_OF_RANGE',
  'LIVENESS_FAILED',
  'BIOMETRIC_MISMATCH',
  'MODEL_UNAVAILABLE',
  'REPLAY_DETECTED',
  'LOCKED_OUT'
]);
export type BiometricReasonCode = z.infer<typeof biometricReasonCodeSchema>;

export const captureAssessmentSchema = z.object({
  qualityScore: z.number().min(0).max(1),
  brightnessScore: z.number().min(0).max(1),
  sharpnessScore: z.number().min(0).max(1),
  distanceCm: z.number().min(1).max(500),
  livenessScore: z.number().min(0).max(1),
  faceCount: z.number().int().min(0).max(10),
  capturedAt: isoTimestampSchema
}).strict();
export type CaptureAssessment = z.infer<typeof captureAssessmentSchema>;

export const biometricModelSetSchema = z.object({
  detector: z.string().trim().min(1),
  embedding: z.string().trim().min(1),
  liveness: z.string().trim().min(1),
  bchCodec: z.string().trim().min(1),
  demoUseOnly: z.literal(true)
}).strict();
export type BiometricModelSet = z.infer<typeof biometricModelSetSchema>;

export const activeBiometricModelSet: BiometricModelSet = {
  detector: 'mediapipe-face-landmarker',
  embedding: 'sha256:9cc6e4a75f0e2bf0b1aed94578f144d15175f357bdc05e815e5c4a02b319eb4f',
  liveness: 'sha256:f292ae67adea39ed9fad05773f1993a51a5b8c833cfbcea7646e03ce78377f95',
  bchCodec: 'sha256:bed6a46aa299e8b3bc4ef8694155cb890ee50b91b42fde670062485aea00ca7a',
  demoUseOnly: true
};

const biometricBitsSchema = z.array(z.union([z.literal(0), z.literal(1)])).length(4096);

export const biometricEnrollmentRequestSchema = z.object({
  subjectId: identifierSchema,
  displayName: z.string().trim().min(2).max(100),
  assessment: captureAssessmentSchema,
  modelSet: biometricModelSetSchema,
  samples: z.array(biometricBitsSchema).min(3).max(5)
}).strict();
export type BiometricEnrollmentRequest = z.infer<typeof biometricEnrollmentRequestSchema>;

export const biometricVerificationRequestSchema = z.object({
  subjectId: identifierSchema,
  purpose: z.string().trim().min(2).max(200),
  assessment: captureAssessmentSchema,
  modelSet: biometricModelSetSchema,
  sample: biometricBitsSchema
}).strict();
export type BiometricVerificationRequest = z.infer<typeof biometricVerificationRequestSchema>;

export const humanProofFailureRequestSchema = z.object({
  subjectId: identifierSchema,
  purpose: z.string().trim().min(2).max(200),
  reasonCode: biometricReasonCodeSchema,
  assessment: captureAssessmentSchema.optional()
}).strict();
export type HumanProofFailureRequest = z.infer<typeof humanProofFailureRequestSchema>;

export const humanIdentitySchema = z.object({
  human_id: identifierSchema,
  display_name: z.string().trim().min(2).max(100),
  status: z.enum(['active', 'locked', 'revoked']),
  enrolled_at: isoTimestampSchema,
  last_verified_at: isoTimestampSchema.optional()
}).strict();
export type HumanIdentity = z.infer<typeof humanIdentitySchema>;

export const biometricEnrollmentSchema = z.object({
  enrollment_id: identifierSchema,
  subject_id: identifierSchema,
  provider: z.literal('local-face-bch'),
  modality: z.literal('face'),
  model_set: biometricModelSetSchema,
  salt_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  template_records: z.array(z.object({
    record_id: identifierSchema,
    helper_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    token_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    k2_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    created_at: isoTimestampSchema
  }).strict()).min(3),
  template_count: z.number().int().min(3),
  enrollment_assessment: captureAssessmentSchema,
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
  h2a_signature: z.string().startsWith('ed25519:')
}).strict();
export type BiometricEnrollment = z.infer<typeof biometricEnrollmentSchema>;

export const humanProofAttemptSchema = z.object({
  attempt_id: identifierSchema,
  subject_id: identifierSchema,
  provider: z.literal('local-face-bch'),
  requested_methods: z.tuple([z.literal('face'), z.literal('liveness')]),
  assessment: captureAssessmentSchema.optional(),
  matched_template_count: z.number().int().nonnegative(),
  required_template_matches: z.number().int().positive(),
  decision: z.enum(['verified', 'rejected', 'locked']),
  reason_code: biometricReasonCodeSchema.optional(),
  created_at: isoTimestampSchema,
  evidence_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/)
}).strict();
export type HumanProofAttempt = z.infer<typeof humanProofAttemptSchema>;

export const humanProofSchema = z.object({
  human_proof_id: identifierSchema,
  subject_id: identifierSchema,
  provider: z.literal('local-face-bch'),
  verification_methods: z.tuple([z.literal('face'), z.literal('liveness')]),
  assurance_level: z.literal('high'),
  verified_at: isoTimestampSchema,
  expires_at: isoTimestampSchema,
  provider_attestation_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  h2a_signature: z.string().startsWith('ed25519:')
}).strict();
export type HumanProof = z.infer<typeof humanProofSchema>;

export const humanProofStateSchema = z.object({
  identity: humanIdentitySchema.nullable(),
  enrollment: biometricEnrollmentSchema.nullable(),
  recentAttempts: z.array(humanProofAttemptSchema),
  activeProof: humanProofSchema.nullable(),
  failedAttempts: z.number().int().nonnegative(),
  lockedUntil: isoTimestampSchema.nullable(),
  modelSet: biometricModelSetSchema
}).strict();
export type HumanProofState = z.infer<typeof humanProofStateSchema>;

export const agentPassportStatusSchema = z.enum(['active', 'suspended', 'revoked', 'expired']);
export type AgentPassportStatus = z.infer<typeof agentPassportStatusSchema>;

export const agentPassportSchema = z.object({
  passport_id: identifierSchema,
  agent_id: identifierSchema,
  name: z.string().trim().min(2).max(80),
  role: z.string().trim().min(2).max(120),
  owner_org: identifierSchema,
  owner_human_id: identifierSchema,
  owner_human_proof_id: identifierSchema,
  runtime: z.enum(['scripted', 'live-cli', 'bedrock', 'external']),
  capabilities: z.array(identifierSchema).min(1).max(24),
  status: agentPassportStatusSchema,
  workload_public_key: z.string().startsWith('-----BEGIN PUBLIC KEY-----'),
  issued_at: isoTimestampSchema,
  expires_at: isoTimestampSchema.optional(),
  updated_at: isoTimestampSchema,
  passport_signature: z.string().startsWith('ed25519:')
}).strict();
export type AgentPassport = z.infer<typeof agentPassportSchema>;

export const runtimeBindingStatusSchema = z.enum(['idle', 'working', 'waiting', 'blocked', 'success', 'failed', 'offline']);
export const runtimeConnectionStateSchema = z.enum(['configured', 'connected', 'disconnected', 'revoked']);
export const agentRuntimeBindingSchema = z.object({
  binding_id: identifierSchema,
  agent_id: identifierSchema,
  display_name: z.string().trim().min(2).max(80),
  role: z.string().trim().min(2).max(120),
  provider: providerIdSchema,
  model: z.string().trim().min(1).max(160),
  command: z.string().trim().min(1).max(500).optional(),
  cwd: z.string().trim().min(1).max(500),
  status: runtimeBindingStatusSchema,
  connection_state: runtimeConnectionStateSchema,
  current_action: z.string().trim().min(1).max(300),
  progress: z.number().int().min(0).max(100),
  credential_ref: identifierSchema.optional(),
  live_session_id: identifierSchema.optional(),
  terminal_id: identifierSchema.optional(),
  created_at: isoTimestampSchema,
  last_seen_at: isoTimestampSchema
}).strict();
export type AgentRuntimeBinding = z.infer<typeof agentRuntimeBindingSchema>;

export const providerModelSchema = z.object({
  id: identifierSchema,
  label: z.string().trim().min(1).max(120),
  recommended: z.boolean().default(false)
}).strict();

export const providerDefinitionSchema = z.object({
  id: providerIdSchema,
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(300),
  execution_mode: z.enum(['scripted-workplace', 'live-cli', 'bedrock']),
  auth_mode: z.enum(['none', 'subscription', 'api-key', 'aws-credentials', 'custom']),
  availability: z.enum(['active-demo', 'adapter-ready']),
  default_command: z.string().trim().max(500).optional(),
  models: z.array(providerModelSchema).min(1)
}).strict();
export type ProviderDefinition = z.infer<typeof providerDefinitionSchema>;

export const providerCredentialMetadataSchema = z.object({
  provider: providerIdSchema,
  configured: z.boolean(),
  credential_mask: z.string().regex(/^\*{4}.{0,4}$/).optional(),
  updated_at: isoTimestampSchema.optional()
}).strict();
export type ProviderCredentialMetadata = z.infer<typeof providerCredentialMetadataSchema>;

export const createAgentRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  role: z.string().trim().min(2).max(120),
  provider: providerIdSchema,
  model: z.string().trim().min(1).max(160),
  workspace: z.string().trim().min(1).max(500),
  capabilities: z.array(identifierSchema).min(1).max(24),
  command: z.string().trim().min(1).max(500).optional(),
  credential: z.string().min(4).max(4000).optional(),
  expiresAt: isoTimestampSchema.optional(),
  purpose: z.string().trim().min(8).max(1000).optional(),
  riskTier: z.enum(['standard', 'sensitive', 'restricted', 'critical']).optional(),
  connectorManifestId: identifierSchema.optional(),
  trustMode: runtimeTrustModeSchema.optional(),
  attestationExpiresAt: isoTimestampSchema.optional(),
  sponsorAuthority: z.object({
    organizationId: identifierSchema,
    membershipId: identifierSchema,
    humanProofId: identifierSchema,
    authorityCredentialId: identifierSchema
  }).strict().optional(),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type CreateAgentRequest = z.infer<typeof createAgentRequestSchema>;

export const passportLifecycleRequestSchema = z.object({
  passportId: identifierSchema,
  action: z.enum(['suspend', 'reactivate', 'revoke']),
  sponsorAuthority: z.object({
    organizationId: identifierSchema,
    membershipId: identifierSchema,
    humanProofId: identifierSchema,
    authorityCredentialId: identifierSchema
  }).strict().optional()
}).strict();
export type PassportLifecycleRequest = z.infer<typeof passportLifecycleRequestSchema>;

export const runtimeLifecycleRequestSchema = z.object({
  bindingId: identifierSchema,
  action: z.enum(['disconnect', 'reconnect'])
}).strict();
export type RuntimeLifecycleRequest = z.infer<typeof runtimeLifecycleRequestSchema>;

export const attestAgentRuntimeRequestSchema = z.object({
  passportId: identifierSchema,
  bindingId: identifierSchema,
  connectorManifestId: identifierSchema,
  adapterVersion: identifierSchema,
  trustMode: runtimeTrustModeSchema,
  trustEvidenceRefs: z.array(identifierSchema).max(64).default([]),
  executableHash: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
  expiresAt: isoTimestampSchema,
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type AttestAgentRuntimeRequest = z.infer<typeof attestAgentRuntimeRequestSchema>;

export const migrateAgentPassportsV1RequestSchema = z.object({
  organizationId: identifierSchema,
  sponsorAuthority: z.object({
    organizationId: identifierSchema,
    membershipId: identifierSchema,
    humanProofId: identifierSchema,
    authorityCredentialId: identifierSchema
  }).strict(),
  mappings: z.array(z.object({
    passportId: identifierSchema,
    connectorManifestId: identifierSchema,
    purpose: z.string().trim().min(8).max(1000),
    riskTier: z.enum(['standard', 'sensitive', 'restricted', 'critical']),
    expiresAt: isoTimestampSchema
  }).strict()).min(1).max(1000)
}).strict();
export type MigrateAgentPassportsV1Request = z.infer<typeof migrateAgentPassportsV1RequestSchema>;

export const agentPassportV2MigrationResultSchema = z.object({
  passports: z.array(agentPassportV2Schema),
  receipts: z.array(v2MigrationReceiptSchema)
}).strict();
export type AgentPassportV2MigrationResult = z.infer<typeof agentPassportV2MigrationResultSchema>;

export const agentIdentityStateSchema = z.object({
  passports: z.array(agentPassportSchema),
  bindings: z.array(agentRuntimeBindingSchema),
  providers: z.array(providerDefinitionSchema),
  credentials: z.array(providerCredentialMetadataSchema),
  humanProofRequired: z.boolean(),
  passportsV2: z.array(agentPassportV2Schema).optional(),
  attestations: z.array(runtimeAttestationSchema).optional(),
  runtimeSessions: z.array(runtimeSessionSchema).optional(),
  migrationReceipts: z.array(v2MigrationReceiptSchema).optional()
}).strict();
export type AgentIdentityState = z.infer<typeof agentIdentityStateSchema>;

export const createAssignmentRequestSchema = z.object({
  title: z.string().trim().min(3).max(160),
  objective: z.string().trim().min(8).max(1000),
  assigneeId: identifierSchema,
  risk: z.enum(['standard', 'sensitive', 'restricted']),
  priority: z.number().int().min(1).max(5),
  dependsOn: z.array(identifierSchema).max(24).default([]),
  requestedAction: z.string().trim().min(1).max(240).optional(),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type CreateAssignmentRequest = z.infer<typeof createAssignmentRequestSchema>;

export const updateAssignmentRequestSchema = z.object({
  assignmentId: identifierSchema,
  status: assignmentStatusSchema.optional(),
  assigneeId: identifierSchema.optional()
}).strict().refine((request) => request.status !== undefined || request.assigneeId !== undefined, {
  message: 'An assignment status or assignee update is required.'
});
export type UpdateAssignmentRequest = z.infer<typeof updateAssignmentRequestSchema>;

export const recordAssignmentResponseRequestSchema = z.object({
  assignmentId: identifierSchema,
  agentId: identifierSchema,
  body: z.string().trim().min(1).max(4000)
}).strict();
export type RecordAssignmentResponseRequest = z.infer<typeof recordAssignmentResponseRequestSchema>;

export const sendCollaborationMessageRequestSchema = z.object({
  assignmentId: identifierSchema,
  fromAgentId: identifierSchema,
  toAgentId: identifierSchema,
  act: collaborationMessageActSchema,
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4000)
}).strict().refine((request) => request.fromAgentId !== request.toAgentId, {
  message: 'Sender and recipient must be different agents.'
});
export type SendCollaborationMessageRequest = z.infer<typeof sendCollaborationMessageRequestSchema>;

export const mandateStatusSchema = z.enum(['active', 'suspended', 'revoked', 'expired']);
export type MandateStatus = z.infer<typeof mandateStatusSchema>;

export const mandateRiskSchema = z.enum(['standard', 'sensitive', 'restricted']);
export type MandateRisk = z.infer<typeof mandateRiskSchema>;

const mandateLimitsSchema = z.object({
  maxAmount: z.number().nonnegative().optional(),
  maxRecords: z.number().int().positive().optional(),
  maxDurationMinutes: z.number().int().positive().optional(),
  parameterEquals: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({})
}).strict();

const mandateDelegationSchema = z.object({
  allowed: z.boolean(),
  allowedAgentIds: z.array(identifierSchema).max(50),
  maxDepth: z.number().int().min(0).max(8)
}).strict();

const mandateSignatureSchema = z.object({
  algorithm: z.literal('Ed25519'),
  signedBy: identifierSchema,
  canonicalHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  value: z.string().startsWith('ed25519:')
}).strict();

export const mandateSchema = z.object({
  mandateId: identifierSchema,
  version: z.number().int().positive(),
  parentMandateId: identifierSchema.optional(),
  depth: z.number().int().min(0).max(8),
  issuer: z.object({ humanId: identifierSchema, humanProofId: identifierSchema }).strict(),
  subject: z.object({ agentId: identifierSchema, passportId: identifierSchema }).strict(),
  objective: z.string().trim().min(8).max(1000),
  resources: z.array(identifierSchema).min(1).max(50),
  actions: z.array(identifierSchema).min(1).max(50),
  prohibitedActions: z.array(identifierSchema).max(50),
  limits: mandateLimitsSchema,
  disclosure: z.object({ allowedFields: z.array(identifierSchema).max(100) }).strict(),
  approvals: z.object({ requiredActions: z.array(identifierSchema).max(50) }).strict(),
  delegation: mandateDelegationSchema,
  issuedAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  status: mandateStatusSchema,
  signature: mandateSignatureSchema
}).strict();
export type Mandate = z.infer<typeof mandateSchema>;

export const delegationEdgeSchema = z.object({
  delegationId: identifierSchema,
  parentMandateId: identifierSchema,
  childMandateId: identifierSchema,
  fromAgentId: identifierSchema,
  toAgentId: identifierSchema,
  createdAt: isoTimestampSchema
}).strict();
export type DelegationEdge = z.infer<typeof delegationEdgeSchema>;

export const policyReasonCodeSchema = z.enum([
  'AUTHORIZED',
  'AGENT_NOT_REGISTERED',
  'AGENT_INACTIVE',
  'MANDATE_NOT_FOUND',
  'MANDATE_SIGNATURE_INVALID',
  'MANDATE_NOT_ACTIVE',
  'MANDATE_EXPIRED',
  'MANDATE_REVOKED',
  'MANDATE_SUBJECT_MISMATCH',
  'DELEGATION_CHAIN_INVALID',
  'DELEGATION_DEPTH_EXCEEDED',
  'CHILD_EXPANDS_PARENT_AUTHORITY',
  'RESOURCE_NOT_ALLOWED',
  'ACTION_NOT_ALLOWED',
  'ACTION_PROHIBITED',
  'PARAMETER_NOT_ALLOWED',
  'AMOUNT_EXCEEDS_MANDATE',
  'RECORD_LIMIT_EXCEEDED',
  'DURATION_EXCEEDS_MANDATE',
  'DISCLOSURE_NOT_ALLOWED',
  'REPLAY_DETECTED',
  'HUMAN_APPROVAL_REQUIRED',
  'HUMAN_PROOF_REQUIRED',
  'APPROVAL_REJECTED'
]);
export type PolicyReasonCode = z.infer<typeof policyReasonCodeSchema>;

export const authorizationDecisionSchema = z.enum(['ALLOW', 'DENY', 'REQUIRES_HUMAN_APPROVAL']);
export type AuthorizationDecision = z.infer<typeof authorizationDecisionSchema>;

export const authorizeActionRequestSchema = z.object({
  agentId: identifierSchema,
  mandateId: identifierSchema,
  resource: identifierSchema,
  action: identifierSchema,
  parameters: z.record(z.string(), z.unknown()).default({}),
  requestedFields: z.array(identifierSchema).max(100).default([]),
  idempotencyKey: identifierSchema,
  assignmentId: identifierSchema.optional()
  ,traceId: identifierSchema.optional()
}).strict();
export type AuthorizeActionRequest = z.infer<typeof authorizeActionRequestSchema>;

export const authorizationResultSchema = z.object({
  idempotencyKey: identifierSchema,
  mandateId: identifierSchema,
  agentId: identifierSchema,
  resource: identifierSchema,
  action: identifierSchema,
  decision: authorizationDecisionSchema,
  traceId: identifierSchema,
  reasonCode: policyReasonCodeSchema,
  obligations: z.array(identifierSchema),
  disclosure: z.array(identifierSchema),
  explanation: z.record(z.string(), z.unknown()),
  approvalRequestId: identifierSchema.optional(),
  evaluatedAt: isoTimestampSchema
}).strict();
export type AuthorizationResult = z.infer<typeof authorizationResultSchema>;

export const approvalRequestSchema = z.object({
  approvalRequestId: identifierSchema,
  mandateId: identifierSchema,
  agentId: identifierSchema,
  authorizationRequest: authorizeActionRequestSchema,
  status: z.enum(['pending', 'approved', 'rejected', 'invalidated']),
  requestedAt: isoTimestampSchema,
  resolvedAt: isoTimestampSchema.optional(),
  resolvedByHumanId: identifierSchema.optional(),
  humanProofId: identifierSchema.optional()
}).strict();
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const humanAuthorityContextSchema = z.object({
  organizationId: identifierSchema,
  membershipId: identifierSchema,
  humanProofId: identifierSchema,
  authorityCredentialId: identifierSchema
}).strict();
export type HumanAuthorityContext = z.infer<typeof humanAuthorityContextSchema>;

export const createMandateRequestSchema = z.object({
  agentId: identifierSchema,
  objective: z.string().trim().min(8).max(1000),
  resources: z.array(identifierSchema).min(1).max(50),
  actions: z.array(identifierSchema).min(1).max(50),
  prohibitedActions: z.array(identifierSchema).max(50).default([]),
  limits: mandateLimitsSchema,
  allowedFields: z.array(identifierSchema).max(100).default([]),
  approvalActions: z.array(identifierSchema).max(50).default([]),
  delegation: mandateDelegationSchema,
  expiresAt: isoTimestampSchema,
  humanAuthority: humanAuthorityContextSchema.optional(),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type CreateMandateRequest = z.infer<typeof createMandateRequestSchema>;

export const delegateMandateRequestSchema = createMandateRequestSchema.extend({
  parentMandateId: identifierSchema,
  fromAgentId: identifierSchema
}).strict();
export type DelegateMandateRequest = z.infer<typeof delegateMandateRequestSchema>;

export const mandateLifecycleRequestSchema = z.object({
  mandateId: identifierSchema,
  action: z.enum(['suspend', 'reactivate', 'revoke']),
  humanAuthority: humanAuthorityContextSchema.optional(),
  ceremony: ceremonyCorrelationSchema.optional()
}).strict();
export type MandateLifecycleRequest = z.infer<typeof mandateLifecycleRequestSchema>;

export const resolveApprovalRequestSchema = z.object({
  approvalRequestId: identifierSchema,
  action: z.enum(['approve', 'reject']),
  humanAuthority: humanAuthorityContextSchema.optional()
}).strict();
export type ResolveApprovalRequest = z.infer<typeof resolveApprovalRequestSchema>;

export const mandateStateSchema = z.object({
  mandates: z.array(mandateSchema),
  delegations: z.array(delegationEdgeSchema),
  approvals: z.array(approvalRequestSchema),
  decisions: z.array(authorizationResultSchema),
  humanProofRequired: z.boolean()
}).strict();
export type MandateState = z.infer<typeof mandateStateSchema>;

export const runtimeAdapterModeSchema = z.enum(['scripted-workplace', 'live-cli', 'bedrock']);
export type RuntimeAdapterMode = z.infer<typeof runtimeAdapterModeSchema>;

export const runtimeExecutionRequestSchema = z.object({
  executionId: identifierSchema,
  scenarioRunId: identifierSchema,
  stepId: identifierSchema,
  traceId: identifierSchema,
  agent: z.object({
    runtimeId: identifierSchema,
    passportId: identifierSchema,
    name: z.string().trim().min(1).max(80),
    role: z.string().trim().min(1).max(120),
    provider: providerIdSchema,
    model: z.string().trim().min(1).max(160)
  }).strict(),
  assignment: workAssignmentSummarySchema,
  mandateId: identifierSchema,
  action: identifierSchema,
  resource: identifierSchema,
  disclosedContext: z.record(z.string(), z.unknown()),
  profile: z.enum(['success', 'failure', 'timeout'])
}).strict();
export type RuntimeExecutionRequest = z.infer<typeof runtimeExecutionRequestSchema>;

export const runtimeExecutionResultSchema = z.object({
  executionId: identifierSchema,
  adapterMode: runtimeAdapterModeSchema,
  status: z.enum(['complete', 'failed', 'timed-out']),
  output: z.string().trim().min(1).max(4000),
  resultCode: identifierSchema,
  startedAt: isoTimestampSchema,
  completedAt: isoTimestampSchema,
  virtualDurationMs: z.number().int().nonnegative()
}).strict();
export type RuntimeExecutionResult = z.infer<typeof runtimeExecutionResultSchema>;

export const runtimeAdapterDescriptorSchema = z.object({
  mode: runtimeAdapterModeSchema,
  label: z.string().trim().min(1).max(100),
  available: z.boolean(),
  requiresCredentials: z.boolean(),
  description: z.string().trim().min(1).max(300)
}).strict();
export type RuntimeAdapterDescriptor = z.infer<typeof runtimeAdapterDescriptorSchema>;

export const scenarioOutcomeSchema = z.enum(['normal', 'denied', 'approval', 'failure', 'timeout', 'revocation']);
export type ScenarioOutcome = z.infer<typeof scenarioOutcomeSchema>;

export const scenarioRunStatusSchema = z.enum(['running', 'approval-required', 'succeeded', 'denied', 'failed', 'timed-out', 'revoked']);
export type ScenarioRunStatus = z.infer<typeof scenarioRunStatusSchema>;

export const scenarioDefinitionSchema = z.object({
  scenarioId: identifierSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  minimumAgents: z.number().int().min(2).max(10),
  supportedOutcomes: z.array(scenarioOutcomeSchema).min(1)
}).strict();
export type ScenarioDefinition = z.infer<typeof scenarioDefinitionSchema>;

export const scenarioStepSchema = z.object({
  stepId: identifierSchema,
  sequence: z.number().int().positive(),
  assignmentId: identifierSchema,
  runtimeAgentId: identifierSchema,
  mandateId: identifierSchema,
  action: identifierSchema,
  resource: identifierSchema,
  requestedFields: z.array(identifierSchema),
  parameters: z.record(z.string(), z.unknown()),
  status: z.enum(['queued', 'authorizing', 'approval-required', 'executing', 'complete', 'denied', 'failed', 'timed-out', 'revoked']),
  decisionTraceId: identifierSchema.optional(),
  reasonCode: policyReasonCodeSchema.optional(),
  approvalRequestId: identifierSchema.optional(),
  output: z.string().trim().min(1).max(4000).optional(),
  startedAt: isoTimestampSchema.optional(),
  completedAt: isoTimestampSchema.optional()
}).strict();
export type ScenarioStep = z.infer<typeof scenarioStepSchema>;

export const scenarioRunSchema = z.object({
  runId: identifierSchema,
  scenarioId: identifierSchema,
  rootMandateId: identifierSchema,
  requestedOutcome: scenarioOutcomeSchema,
  status: scenarioRunStatusSchema,
  traceId: identifierSchema,
  coordinatorRuntimeId: identifierSchema,
  steps: z.array(scenarioStepSchema).min(2),
  currentStepIndex: z.number().int().min(0),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  completedAt: isoTimestampSchema.optional()
}).strict();
export type ScenarioRun = z.infer<typeof scenarioRunSchema>;

export const startScenarioRequestSchema = z.object({
  scenarioId: identifierSchema,
  rootMandateId: identifierSchema,
  outcome: scenarioOutcomeSchema
}).strict();
export type StartScenarioRequest = z.infer<typeof startScenarioRequestSchema>;

export const resumeScenarioRequestSchema = z.object({ runId: identifierSchema }).strict();
export type ResumeScenarioRequest = z.infer<typeof resumeScenarioRequestSchema>;

export const scenarioStateSchema = z.object({
  definitions: z.array(scenarioDefinitionSchema),
  runs: z.array(scenarioRunSchema),
  adapters: z.array(runtimeAdapterDescriptorSchema)
}).strict();
export type ScenarioState = z.infer<typeof scenarioStateSchema>;

export const evidenceQuerySchema = z.object({
  search: z.string().trim().max(200).default(''),
  eventTypes: z.array(authorityEventTypeSchema).max(50).default([]),
  actorTypes: z.array(z.enum(['human', 'agent', 'system'])).max(3).default([]),
  decisions: z.array(authorizationDecisionSchema).max(3).default([]),
  reasonCodes: z.array(policyReasonCodeSchema).max(40).default([]),
  integrityOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(1000).default(250)
}).strict();
export type EvidenceQuery = z.infer<typeof evidenceQuerySchema>;
export const defaultEvidenceQuery: EvidenceQuery = { search: '', eventTypes: [], actorTypes: [], decisions: [], reasonCodes: [], integrityOnly: false, limit: 250 };

export const evidenceIntegrityReportSchema = z.object({
  status: integrityStatusSchema,
  recordCount: z.number().int().nonnegative(),
  headHash: z.string().nullable(),
  failedEventId: identifierSchema.optional(),
  reason: z.string().trim().min(1).max(500).optional()
}).strict();
export type EvidenceIntegrityReport = z.infer<typeof evidenceIntegrityReportSchema>;

export const evidenceIdentityChainSchema = z.object({
  humanId: identifierSchema.optional(),
  humanDisplayName: z.string().trim().min(1).max(100).optional(),
  humanProofId: identifierSchema.optional(),
  passportId: identifierSchema.optional(),
  durableAgentId: identifierSchema.optional(),
  agentName: z.string().trim().min(1).max(80).optional(),
  runtimeId: identifierSchema.optional(),
  provider: providerIdSchema.optional(),
  model: z.string().trim().min(1).max(160).optional(),
  mandateId: identifierSchema.optional(),
  mandateStatus: mandateStatusSchema.optional(),
  delegationPath: z.array(z.object({
    delegationId: identifierSchema,
    parentMandateId: identifierSchema,
    childMandateId: identifierSchema,
    fromAgentId: identifierSchema,
    toAgentId: identifierSchema
  }).strict()).max(8),
  assignmentId: identifierSchema.optional(),
  scenarioRunId: identifierSchema.optional()
}).strict();
export type EvidenceIdentityChain = z.infer<typeof evidenceIdentityChainSchema>;

export const evidenceInvestigationRecordSchema = z.object({
  event: authorityEventRecordSchema,
  identityChain: evidenceIdentityChainSchema,
  decision: authorizationResultSchema.optional(),
  approval: approvalRequestSchema.optional(),
  assignment: workAssignmentSummarySchema.optional(),
  resolutionStatus: z.enum(['complete', 'partial', 'not-applicable']),
  missingLinks: z.array(z.enum(['human', 'human-proof', 'passport', 'runtime', 'mandate', 'decision'])),
  integrityStatus: integrityStatusSchema
}).strict();
export type EvidenceInvestigationRecord = z.infer<typeof evidenceInvestigationRecordSchema>;

export const auditControlSchema = z.object({
  controlId: identifierSchema,
  title: z.string().trim().min(1).max(120),
  securityObjective: z.enum(['attribution', 'least-privilege', 'human-oversight', 'containment', 'privacy', 'integrity', 'secret-isolation', 'portability']),
  implementation: z.string().trim().min(1).max(500),
  evidenceEventTypes: z.array(authorityEventTypeSchema).max(20),
  verification: z.string().trim().min(1).max(300),
  status: z.enum(['implemented', 'boundary'])
}).strict();
export type AuditControl = z.infer<typeof auditControlSchema>;

export const evidenceExplorerStateSchema = z.object({
  generatedAt: isoTimestampSchema,
  integrity: evidenceIntegrityReportSchema,
  totalEvents: z.number().int().nonnegative(),
  matchedEvents: z.number().int().nonnegative(),
  events: z.array(evidenceInvestigationRecordSchema),
  availableEventTypes: z.array(authorityEventTypeSchema),
  availableReasonCodes: z.array(policyReasonCodeSchema),
  controls: z.array(auditControlSchema)
}).strict();
export type EvidenceExplorerState = z.infer<typeof evidenceExplorerStateSchema>;

export const exportEvidenceBundleRequestSchema = z.object({ query: evidenceQuerySchema }).strict();
export type ExportEvidenceBundleRequest = z.infer<typeof exportEvidenceBundleRequestSchema>;

export const evidenceExportReceiptSchema = z.object({
  exportId: identifierSchema,
  relativePath: z.string().trim().startsWith('exports/').max(300),
  createdAt: isoTimestampSchema,
  sourceHeadHash: z.string().nullable(),
  bundleHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  eventCount: z.number().int().nonnegative(),
  privacyProfile: z.enum(['audit-minimized-v1', 'audit-minimized-v2'])
}).strict();
export type EvidenceExportReceipt = z.infer<typeof evidenceExportReceiptSchema>;

export interface VersionedEnvelope<K extends string, T> {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  kind: K;
  updatedAt: string;
  data: T;
}

export function createVersionedEnvelopeSchema<K extends string, T extends z.ZodType>(
  kind: K,
  dataSchema: T
): z.ZodType<VersionedEnvelope<K, z.infer<T>>> {
  return z.object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    kind: z.literal(kind),
    updatedAt: isoTimestampSchema,
    data: dataSchema
  }).strict() as unknown as z.ZodType<VersionedEnvelope<K, z.infer<T>>>;
}

export interface H2ADesktopApi {
  attachControlPlane(request: ControlPlaneAttachRequest): Promise<ControlPlaneAttachResponse>;
  detachControlPlane(request: ControlPlaneLeaseRequest): Promise<void>;
  getControlPlaneSnapshot(request: ControlPlaneLeaseRequest): Promise<ControlPlaneSnapshot>;
  getControlPlaneEvents(request: ControlPlaneReplayRequest): Promise<ControlPlaneReplayResponse>;
  executeOfficeCommand(request: ControlPlaneCommandRequest): Promise<ControlPlaneSnapshot>;
  subscribeControlPlaneEvents(listener: (event: ControlPlaneEventEnvelope) => void): () => void;
  getSecurityValidationState(): Promise<SecurityValidationState>;
  runSecurityAttack(request: RunSecurityAttackRequest): Promise<SecurityValidationState>;
  runContainmentControl(request: RunContainmentControlRequest): Promise<SecurityValidationState>;
  getGuidedBootstrapState(): Promise<GuidedBootstrapState>;
  prepareGuidedBootstrap(request: PrepareGuidedBootstrapRequest): Promise<GuidedBootstrapState>;
  runGuidedBootstrapStep(request: RunGuidedBootstrapStepRequest): Promise<GuidedBootstrapState>;
  getCeremonyState(): Promise<CeremonyState>;
  createCeremonySession(request: CreateCeremonySessionRequest): Promise<CeremonyState>;
  runCeremonyStep(request: RunCeremonyStepRequest): Promise<CeremonyState>;
  getSystemStatus(): Promise<SystemStatus>;
  writeClipboardText(value: string): Promise<void>;
  getWorkplaceSnapshot(): Promise<WorkplaceSnapshot>;
  getHumanProofState(): Promise<HumanProofState>;
  enrollHuman(request: BiometricEnrollmentRequest): Promise<HumanProofState>;
  verifyHuman(request: BiometricVerificationRequest): Promise<HumanProofState>;
  recordHumanProofFailure(request: HumanProofFailureRequest): Promise<HumanProofState>;
  getHumanIdentityV2State(humanId?: string): Promise<HumanIdentityV2State>;
  enrollHumanV2(request: EnrollHumanV2Request): Promise<HumanIdentityV2State>;
  verifyHumanV2(request: VerifyHumanV2Request): Promise<HumanIdentityV2State>;
  updateBiometricEnrollmentV2(request: BiometricEnrollmentLifecycleRequest): Promise<HumanIdentityV2State>;
  migrateHumanIdentityV1ToV2(request: HumanIdentityV2MigrationRequest): Promise<HumanIdentityV2MigrationResult>;
  getOrganizationAuthorityState(): Promise<OrganizationAuthorityState>;
  bootstrapOrganization(request: BootstrapOrganizationRequest): Promise<OrganizationAuthorityState>;
  createAuthorityRole(request: CreateAuthorityRoleRequest): Promise<OrganizationAuthorityState>;
  joinOrganizationMembership(request: JoinMembershipRequest): Promise<OrganizationAuthorityState>;
  updateOrganizationMembership(request: MembershipLifecycleRequest): Promise<OrganizationAuthorityState>;
  issueHumanAuthorityCredential(request: IssueAuthorityCredentialRequest): Promise<OrganizationAuthorityState>;
  recoverAdministratorCredential(request: RecoverAdministratorCredentialRequest): Promise<OrganizationAuthorityState>;
  updateHumanAuthorityCredential(request: AuthorityCredentialLifecycleRequest): Promise<OrganizationAuthorityState>;
  evaluateHumanAuthority(request: EvaluateHumanAuthorityRequest): Promise<OrganizationAuthorityState>;
  getAuthorityApprovalState(): Promise<AuthorityApprovalState>;
  createApprovalPolicy(request: CreateApprovalPolicyRequest): Promise<AuthorityApprovalState>;
  requestAuthorityEscalation(request: RequestAuthorityEscalation): Promise<AuthorityApprovalState>;
  submitApprovalDecision(request: SubmitApprovalDecisionRequest): Promise<AuthorityApprovalState>;
  consumeApprovalResume(request: ConsumeApprovalResumeRequest): Promise<AuthorityApprovalState>;
  withdrawApprovalRequest(request: WithdrawApprovalRequest): Promise<AuthorityApprovalState>;
  getContextBrokerState(): Promise<ContextBrokerState>;
  createContextArtifact(request: CreateContextArtifactRequest): Promise<ContextBrokerState>;
  issueContextGrant(request: IssueContextGrantRequest): Promise<ContextBrokerState>;
  updateContextGrant(request: ContextGrantLifecycleRequest): Promise<ContextBrokerState>;
  getFederationState(): Promise<FederationState>;
  getFederationPairingState(request?: RefreshNodeDiscoveryRequest): Promise<FederationPairingState>;
  createFederationPairing(request: CreateFederationPairingRequest): Promise<FederationPairingState>;
  acceptFederationPairing(request: AcceptFederationPairingRequest): Promise<FederationPairingState>;
  confirmFederationPairing(request: ConfirmFederationPairingRequest): Promise<FederationPairingState>;
  cancelFederationPairing(request: CancelFederationPairingRequest): Promise<FederationPairingState>;
  configureFederationNode(request: ConfigureFederationNodeRequest): Promise<FederationState>;
  createFederationInvitation(request: CreateFederationInvitationRequest): Promise<FederationState>;
  acceptFederationInvitation(request: AcceptFederationInvitationRequest): Promise<FederationState>;
  approveFederationRegistration(request: ApproveFederationRegistrationRequest): Promise<FederationState>;
  activateFederationAcceptance(request: ActivateFederationAcceptanceRequest): Promise<FederationState>;
  revokeFederationPeer(request: RevokeFederationPeerRequest): Promise<FederationState>;
  getFederationOperatorState(): Promise<FederationOperatorState>;
  startFederationListener(request: StartFederationListenerRequest): Promise<FederationOperatorState>;
  stopFederationListener(request: StopFederationListenerRequest): Promise<FederationOperatorState>;
  sendFederationTask(request: SendFederationTaskRequest): Promise<FederationOperatorState>;
  sendFederationAcknowledgement(request: SendFederationAcknowledgementRequest): Promise<FederationOperatorState>;
  sendFederationHeartbeat(request: SendFederationOperatorHeartbeatRequest): Promise<FederationOperatorState>;
  proveFederationReplay(request: ProveFederationReplayRequest): Promise<FederationOperatorState>;
  proveFederationRevocation(request: ProveFederationRevocationRequest): Promise<FederationOperatorState>;
  getEnterpriseOverview(): Promise<EnterpriseOverviewState>;
  getFinalAcceptanceState(): Promise<FinalAcceptanceState>;
  exportFinalAcceptancePackage(): Promise<FinalAcceptanceExportReceipt>;
  verifyFinalAcceptancePackage(request: VerifyFinalAcceptancePackageRequest): Promise<FinalAcceptanceVerificationReceipt>;
  preparePhase44Session(): Promise<Phase44SessionReceipt>;
  enableRequiredLiveness(): Promise<SystemStatus>;
  getDemonstrationConductor(): Promise<DemonstrationConductor | null>;
  executeDemonstrationConductor(request: DemonstrationConductorCommand): Promise<DemonstrationConductor>;
  getAgentIdentityState(): Promise<AgentIdentityState>;
  createAgent(request: CreateAgentRequest): Promise<AgentIdentityState>;
  updateAgentPassport(request: PassportLifecycleRequest): Promise<AgentIdentityState>;
  updateAgentRuntime(request: RuntimeLifecycleRequest): Promise<AgentIdentityState>;
  attestAgentRuntime(request: AttestAgentRuntimeRequest): Promise<AgentIdentityState>;
  migrateAgentPassportsV1ToV2(request: MigrateAgentPassportsV1Request): Promise<AgentPassportV2MigrationResult>;
  getCollaborationState(): Promise<CollaborationState>;
  createAssignment(request: CreateAssignmentRequest): Promise<CollaborationState>;
  updateAssignment(request: UpdateAssignmentRequest): Promise<CollaborationState>;
  recordAssignmentResponse(request: RecordAssignmentResponseRequest): Promise<CollaborationState>;
  sendCollaborationMessage(request: SendCollaborationMessageRequest): Promise<CollaborationState>;
  getConnectorProtocolState(): Promise<ConnectorProtocolState>;
  importConnector(request: ConnectorImportRequest): Promise<ConnectorProtocolState>;
  cancelConnectorDelivery(request: CancelDeliveryRequest): Promise<ConnectorProtocolState>;
  getFrameworkConnectorState(): Promise<FrameworkConnectorState>;
  probeFrameworkConnectors(request: FrameworkProbeRequest): Promise<FrameworkConnectorState>;
  executeFramework(request: ExecuteFrameworkRequest): Promise<FrameworkConnectorState>;
  getRealCollaborationState(): Promise<RealCollaborationState>;
  prepareRealCollaboration(request: PrepareRealCollaborationRequest): Promise<RealCollaborationState>;
  replaceRealCollaborationAuthority(request: ReplaceRealCollaborationAuthorityRequest): Promise<RealCollaborationState>;
  runRealCollaborationLane(request: RunRealCollaborationLaneRequest): Promise<RealCollaborationState>;
  cancelRealCollaborationLane(request: CancelRealCollaborationLaneRequest): Promise<RealCollaborationState>;
  getLeastContextState(): Promise<LeastContextState>;
  prepareLeastContext(request: PrepareLeastContextRequest): Promise<LeastContextState>;
  renewLeastContextGrant(request: RenewLeastContextGrantRequest): Promise<LeastContextState>;
  runLeastContextLane(request: RunLeastContextLaneRequest): Promise<LeastContextState>;
  proveLeastContextRevocation(request: ProveLeastContextRevocationRequest): Promise<LeastContextState>;
  getHumanEscalationState(): Promise<HumanEscalationState>;
  configureHumanEscalation(request: ConfigureHumanEscalationRequest): Promise<HumanEscalationState>;
  startHumanEscalation(request: StartHumanEscalationRequest): Promise<HumanEscalationState>;
  startHumanEscalationRejection(request: StartHumanEscalationRejectionRequest): Promise<HumanEscalationState>;
  getLiveRuntimeState(): Promise<LiveRuntimeState>;
  probeLiveProviders(request: LiveRuntimeProbeRequest): Promise<LiveRuntimeState>;
  startLiveRun(request: StartLiveRunRequest): Promise<LiveRuntimeState>;
  cancelLiveRun(request: CancelLiveRunRequest): Promise<LiveRuntimeState>;
  getRuntimeAttachmentState(): Promise<RuntimeAttachmentState>;
  startTerminalSession(request: StartTerminalSessionRequest): Promise<RuntimeAttachmentState>;
  attachTerminal(request: AttachTerminalRequest): Promise<TerminalAttachmentLease>;
  detachTerminal(request: TerminalLeaseRequest): Promise<void>;
  getTerminalReplay(request: TerminalReplayRequest): Promise<TerminalReplayResponse>;
  writeTerminal(request: TerminalInputRequest): Promise<void>;
  resizeTerminal(request: TerminalResizeRequest): Promise<void>;
  cancelTerminal(request: TerminalCancelRequest): Promise<RuntimeAttachmentState>;
  getProjectDeliveryState(): Promise<ProjectDeliveryState>;
  registerProject(request: RegisterProjectRequest): Promise<ProjectDeliveryState>;
  createProjectGoal(request: CreateProjectGoalRequest): Promise<ProjectDeliveryState>;
  createProjectAssignment(request: CreateProjectAssignmentRequest): Promise<ProjectDeliveryState>;
  createProjectWorktree(assignmentId: string): Promise<ProjectDeliveryState>;
  refreshProjectWorktree(assignmentId: string): Promise<ProjectDeliveryState>;
  fetchProjectResearch(request: FetchResearchSourceRequest): Promise<ProjectDeliveryState>;
  runProjectValidation(request: RunProjectValidationRequest): Promise<ProjectDeliveryState>;
  runProjectAssignment(request: RunProjectAssignmentRequest): Promise<ProjectDeliveryState>;
  cancelProjectRun(request: CancelProjectRunRequest): Promise<ProjectDeliveryState>;
  getProjectIntegrationEffectHash(goalId: string, assignmentIds: string[]): Promise<string>;
  requestProjectIntegrationApproval(request: RequestProjectIntegrationApproval): Promise<AuthorityApprovalState>;
  integrateProject(request: IntegrateProjectRequest): Promise<ProjectDeliveryState>;
  cleanupProjectWorktree(assignmentId: string): Promise<ProjectDeliveryState>;
  getGoalWorkGraphState(): Promise<GoalWorkGraphState>;
  composeCollaborativeGoal(request: ComposeCollaborativeGoalRequest): Promise<GoalWorkGraphState>;
  proposeWorkGraph(request: ProposeWorkGraphRequest): Promise<GoalWorkGraphState>;
  editWorkGraph(request: EditWorkGraphRequest): Promise<GoalWorkGraphState>;
  approveWorkGraph(request: ApproveWorkGraphRequest): Promise<GoalWorkGraphState>;
  runWorkGraph(request: RunWorkGraphRequest): Promise<GoalWorkGraphState>;
  runWorkGraphNode(request: WorkGraphNodeCommandRequest): Promise<GoalWorkGraphState>;
  renewWorkGraphNode(request: RenewWorkGraphNodeRequest): Promise<GoalWorkGraphState>;
  cancelWorkGraphNode(request: WorkGraphNodeCommandRequest): Promise<GoalWorkGraphState>;
  revokeWorkGraphNode(request: WorkGraphNodeCommandRequest): Promise<GoalWorkGraphState>;
  reassignWorkGraphNode(request: ReassignWorkGraphNodeRequest): Promise<GoalWorkGraphState>;
  getMandateState(): Promise<MandateState>;
  createMandate(request: CreateMandateRequest): Promise<MandateState>;
  delegateMandate(request: DelegateMandateRequest): Promise<MandateState>;
  updateMandate(request: MandateLifecycleRequest): Promise<MandateState>;
  authorizeAction(request: AuthorizeActionRequest): Promise<MandateState>;
  resolveApproval(request: ResolveApprovalRequest): Promise<MandateState>;
  getScenarioState(): Promise<ScenarioState>;
  startScenario(request: StartScenarioRequest): Promise<ScenarioState>;
  resumeScenario(request: ResumeScenarioRequest): Promise<ScenarioState>;
  getEvidenceExplorerState(query: EvidenceQuery): Promise<EvidenceExplorerState>;
  exportEvidenceBundle(request: ExportEvidenceBundleRequest): Promise<EvidenceExportReceipt>;
}

export * from './guided-bootstrap';

export const demoSystemStatus: SystemStatus = {
  appVersion: '0.1.0',
  storageMode: 'local-file',
  agentMode: 'scripted-workplace',
  humanProofMode: 'local-face-bch',
  livenessMode: 'demo-bypass',
  resourceMode: 'sandbox',
  evidenceIntegrity: 'verified',
  evidenceRecords: 3,
  evidenceHeadHash: 'sha256:bbb54abbda7d10151897b0ba6139178e3bf494c0ac7f0b663b8a051db486582e',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  dataPath: 'data/h2a-demo'
};

export const demoWorkplaceSnapshot: WorkplaceSnapshot = {
  generatedAt: '2026-08-20T09:40:00.000Z',
  agents: [
    {
      id: 'runtime-maya',
      passportId: 'agt_01MAYA',
      name: 'Maya',
      initials: 'MY',
      role: 'Program Coordinator',
      provider: 'scripted',
      providerLabel: 'H2A Scripted',
      model: 'Coordinator V0',
      status: 'working',
      currentAction: 'Consolidating supplier exposure brief',
      mandateId: 'mnd_supplier_review',
      mandateLabel: 'Supplier risk review',
      progress: 68,
      accent: '#2563eb'
    },
    {
      id: 'runtime-aria',
      passportId: 'agt_02ARIA',
      name: 'Aria',
      initials: 'AR',
      role: 'Policy Analyst',
      provider: 'openai-codex',
      providerLabel: 'OpenAI / Codex',
      model: 'GPT provider lane',
      status: 'working',
      currentAction: 'Mapping controls to evidence',
      mandateId: 'mnd_control_mapping',
      mandateLabel: 'Control mapping child mandate',
      progress: 46,
      accent: '#0f766e'
    },
    {
      id: 'runtime-noah',
      passportId: 'agt_03NOAH',
      name: 'Noah',
      initials: 'NH',
      role: 'Security Reviewer',
      provider: 'claude-code',
      providerLabel: 'Claude Code',
      model: 'Claude provider lane',
      status: 'approval-required',
      currentAction: 'Waiting on restricted document approval',
      mandateId: 'mnd_security_review',
      mandateLabel: 'Security review child mandate',
      progress: 31,
      accent: '#b45309'
    },
    {
      id: 'runtime-isha',
      passportId: 'agt_04ISHA',
      name: 'Isha',
      initials: 'IS',
      role: 'Research Specialist',
      provider: 'gemini-antigravity',
      providerLabel: 'Gemini / Antigravity',
      model: 'Gemini provider lane',
      status: 'ready',
      currentAction: 'Available for bounded delegation',
      mandateId: 'mnd_research',
      mandateLabel: 'External research child mandate',
      progress: 0,
      accent: '#7c3aed'
    }
  ],
  assignments: [
    {
      id: 'wrk_101',
      title: 'Map supplier controls',
      objective: 'Map supplied control statements to the approved H2A evidence taxonomy.',
      status: 'active',
      assigneeId: 'runtime-aria',
      mandateId: 'mnd_control_mapping',
      risk: 'standard',
      priority: 2,
      dependsOn: [],
      updatedAt: '2 min ago',
      response: '18 controls mapped. Three require source confirmation before they can be asserted.',
      responseCount: 1,
      messageCount: 2
    },
    {
      id: 'wrk_102',
      title: 'Review restricted annex',
      objective: 'Inspect the restricted annex without disclosing personal data outside its mandate.',
      status: 'approval',
      assigneeId: 'runtime-noah',
      mandateId: 'mnd_security_review',
      risk: 'restricted',
      priority: 1,
      dependsOn: ['wrk_101'],
      updatedAt: '5 min ago',
      response: 'Execution paused before document access. Human verification is required.',
      responseCount: 1,
      messageCount: 0
    },
    {
      id: 'wrk_103',
      title: 'Research vendor disclosures',
      objective: 'Collect public disclosure references for the coordinator review.',
      status: 'queued',
      assigneeId: 'runtime-isha',
      mandateId: 'mnd_research',
      risk: 'standard',
      priority: 3,
      dependsOn: [],
      updatedAt: '8 min ago',
      responseCount: 0,
      messageCount: 0
    },
    {
      id: 'wrk_104',
      title: 'Validate delegation scope',
      objective: 'Confirm every child mandate is narrower than the coordinator mandate.',
      status: 'complete',
      assigneeId: 'runtime-maya',
      mandateId: 'mnd_supplier_review',
      risk: 'sensitive',
      priority: 2,
      dependsOn: [],
      updatedAt: '12 min ago',
      response: 'All three child mandates narrow resource, action, disclosure, and expiry scope.',
      responseCount: 1,
      messageCount: 0
    }
  ],
  events: [
    {
      id: 'evt_0042',
      type: 'APPROVAL_REQUIRED',
      actor: 'Noah',
      summary: 'Restricted annex access paused for human proof.',
      time: '10:35',
      integrity: 'verified'
    },
    {
      id: 'evt_0041',
      type: 'WORK_STATUS_CHANGED',
      actor: 'Aria',
      summary: 'Control mapping moved to active.',
      time: '10:33',
      integrity: 'verified'
    },
    {
      id: 'evt_0040',
      type: 'MANDATE_DELEGATED',
      actor: 'Maya',
      summary: 'Narrow research mandate issued to Isha.',
      time: '10:29',
      integrity: 'verified'
    }
  ]
};

export const demoCollaborationState: CollaborationState = {
  workplace: demoWorkplaceSnapshot,
  messages: [
    {
      id: 'msg_001',
      assignmentId: 'wrk_101',
      fromAgentId: 'runtime-maya',
      toAgentId: 'runtime-aria',
      act: 'request',
      subject: 'Control mapping handoff',
      body: 'Map the supplier control statements and flag every assertion that lacks source evidence.',
      mandateId: 'mnd_control_mapping',
      traceId: 'tr_collab_001',
      createdAt: '2026-08-20T09:31:00.000Z',
      deliveryStatus: 'delivered'
    },
    {
      id: 'msg_002',
      assignmentId: 'wrk_101',
      fromAgentId: 'runtime-aria',
      toAgentId: 'runtime-maya',
      act: 'response',
      subject: 'Three controls need evidence',
      body: 'The initial mapping is complete. Three claims remain withheld pending source confirmation.',
      mandateId: 'mnd_control_mapping',
      traceId: 'tr_collab_001',
      createdAt: '2026-08-20T09:38:00.000Z',
      deliveryStatus: 'delivered'
    }
  ],
  responses: [
    {
      id: 'rsp_001',
      assignmentId: 'wrk_101',
      agentId: 'runtime-aria',
      body: '18 controls mapped. Three require source confirmation before they can be asserted.',
      traceId: 'tr_collab_001',
      createdAt: '2026-08-20T09:38:00.000Z'
    }
  ],
  activity: [
    {
      id: 'act_001',
      agentId: 'runtime-aria',
      assignmentId: 'wrk_101',
      kind: 'assignment',
      level: 'info',
      summary: 'Assignment accepted',
      detail: 'Control mapping moved from queued to active.',
      createdAt: '2026-08-20T09:33:00.000Z'
    },
    {
      id: 'act_002',
      agentId: 'runtime-aria',
      assignmentId: 'wrk_101',
      kind: 'response',
      level: 'success',
      summary: 'Response recorded',
      detail: '18 controls mapped; three remain evidence-gated.',
      createdAt: '2026-08-20T09:38:00.000Z'
    },
    {
      id: 'act_003',
      agentId: 'runtime-noah',
      assignmentId: 'wrk_102',
      kind: 'status',
      level: 'attention',
      summary: 'Execution paused',
      detail: 'Restricted document access is waiting for Human Proof.',
      createdAt: '2026-08-20T09:35:00.000Z'
    }
  ]
};
