import { z } from 'zod';
import type { AgentIdentityState, AuthorityApprovalState, CollaborationState, ContextBrokerState, EvidenceExplorerState, MandateState, ScenarioState, SystemStatus } from './index';
import type { CeremonyState } from './ceremony';
import type { EnterpriseOverviewState } from './enterprise-observability';
import type { FederationOperatorState, FederationState } from './federation';
import type { FinalAcceptanceState } from './final-acceptance';
import type { GuidedBootstrapState } from './guided-bootstrap';
import type { ProjectDeliveryState } from './project-delivery';
import type { RealCollaborationState } from './real-collaboration';
import type { LeastContextState } from './least-context';
import type { HumanEscalationState } from './human-escalation';
import type { RuntimeAttachmentState } from './runtime-transport';
import type { GoalWorkGraphState } from './work-graph';
import type { OrganizationAuthorityState } from './v2';
import type { DemonstrationConductor } from './demonstration-conductor';
import { agentIdentityStateSchema, collaborationStateSchema, evidenceExplorerStateSchema, mandateStateSchema, scenarioStateSchema, systemStatusSchema } from './index';
import { ceremonyStateSchema } from './ceremony';
import { contextBrokerStateSchema } from './context-broker';
import { enterpriseOverviewStateSchema } from './enterprise-observability';
import { federationOperatorStateSchema, federationStateSchema } from './federation';
import { finalAcceptanceStateSchema } from './final-acceptance';
import { guidedBootstrapStateSchema } from './guided-bootstrap';
import { projectDeliveryStateSchema } from './project-delivery';
import { realCollaborationStateSchema } from './real-collaboration';
import { leastContextStateSchema } from './least-context';
import { humanEscalationStateSchema } from './human-escalation';
import { runtimeAttachmentStateSchema } from './runtime-transport';
import { officeStateSchema } from './office';
import { appearancePreferencesSchema, presentationModeSchema } from './presentation';
import { guidedWorkflowIdSchema } from './guided-workflow';
import { organizationAuthorityStateSchema, authorityApprovalStateSchema } from './v2';
import { operatorReadinessStateSchema } from './operator-readiness';
import { goalWorkGraphStateSchema } from './work-graph';
import { demonstrationConductorSchema } from './demonstration-conductor';

const identifierSchema = z.string().trim().min(1).max(160);
const isoTimestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const CONTROL_PLANE_PROTOCOL_VERSION = 1 as const;

export interface ControlPlaneCanonicalState {
  system: SystemStatus;
  collaboration: CollaborationState;
  agent_identity: AgentIdentityState;
  mandates: MandateState;
  organization: OrganizationAuthorityState;
  approvals: AuthorityApprovalState;
  scenarios: ScenarioState;
  evidence: EvidenceExplorerState;
  context_broker: ContextBrokerState;
  federation: FederationState;
  enterprise: EnterpriseOverviewState;
  final_acceptance: FinalAcceptanceState;
  ceremony: CeremonyState;
  guided_bootstrap: GuidedBootstrapState;
  project_delivery: ProjectDeliveryState;
  real_collaboration: RealCollaborationState;
  least_context: LeastContextState;
  human_escalation: HumanEscalationState;
  federation_operator: FederationOperatorState;
  runtime_attachment: RuntimeAttachmentState;
  goal_work_graph?: GoalWorkGraphState;
  demonstration_conductor?: DemonstrationConductor | null;
}

export const controlPlaneCanonicalStateSchema: z.ZodType<ControlPlaneCanonicalState> = z.object({
  system: z.lazy(() => systemStatusSchema),
  collaboration: z.lazy(() => collaborationStateSchema),
  agent_identity: z.lazy(() => agentIdentityStateSchema),
  mandates: z.lazy(() => mandateStateSchema),
  organization: z.lazy(() => organizationAuthorityStateSchema),
  approvals: z.lazy(() => authorityApprovalStateSchema),
  scenarios: z.lazy(() => scenarioStateSchema),
  evidence: z.lazy(() => evidenceExplorerStateSchema),
  context_broker: z.lazy(() => contextBrokerStateSchema),
  federation: z.lazy(() => federationStateSchema),
  enterprise: z.lazy(() => enterpriseOverviewStateSchema),
  final_acceptance: z.lazy(() => finalAcceptanceStateSchema),
  ceremony: z.lazy(() => ceremonyStateSchema),
  guided_bootstrap: z.lazy(() => guidedBootstrapStateSchema),
  project_delivery: z.lazy(() => projectDeliveryStateSchema),
  real_collaboration: z.lazy(() => realCollaborationStateSchema),
  least_context: z.lazy(() => leastContextStateSchema),
  human_escalation: z.lazy(() => humanEscalationStateSchema),
  federation_operator: z.lazy(() => federationOperatorStateSchema),
  runtime_attachment: z.lazy(() => runtimeAttachmentStateSchema),
  goal_work_graph: z.lazy(() => goalWorkGraphStateSchema).optional(),
  demonstration_conductor: z.lazy(() => demonstrationConductorSchema).nullable().optional()
}).strict();

export const controlPlaneCapabilitySchema = z.enum([
  'workspace.observe', 'workspace.refresh', 'workspace.control',
  'appearance.read', 'appearance.write', 'human-proof.challenge'
]);
export type ControlPlaneCapability = z.infer<typeof controlPlaneCapabilitySchema>;

export const capabilityManifestSchema = z.object({
  protocol_version: z.literal(CONTROL_PLANE_PROTOCOL_VERSION),
  capabilities: z.array(controlPlaneCapabilitySchema).min(1),
  transport: z.literal('electron-ipc'),
  trust_ceiling: z.literal('connected-observed')
}).strict();
export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;

export const controlPlaneAttachRequestSchema = z.object({
  client_id: identifierSchema,
  protocol_version: z.literal(CONTROL_PLANE_PROTOCOL_VERSION),
  requested_capabilities: z.array(controlPlaneCapabilitySchema).min(1).max(6)
}).strict();
export type ControlPlaneAttachRequest = z.infer<typeof controlPlaneAttachRequestSchema>;

export const controlPlaneConnectionSchema = z.object({
  status: z.enum(['connected', 'stale', 'disconnected']),
  generation: identifierSchema,
  read_only: z.boolean(),
  last_confirmed_cursor: z.number().int().nonnegative()
}).strict();

export const controlPlaneAttachResponseSchema = z.object({
  lease_id: identifierSchema,
  client_id: identifierSchema,
  host_instance_id: identifierSchema,
  expires_at: isoTimestampSchema,
  manifest: capabilityManifestSchema,
  granted_capabilities: z.array(controlPlaneCapabilitySchema).min(1).max(6),
  connection: controlPlaneConnectionSchema
}).strict();
export type ControlPlaneAttachResponse = z.infer<typeof controlPlaneAttachResponseSchema>;

export const operatorSessionSchema = z.object({
  status: z.enum(['connected', 'recovering', 'stale', 'read-only']),
  host_instance_id: identifierSchema,
  last_confirmed_cursor: z.number().int().nonnegative(),
  attached_observers: z.number().int().nonnegative(),
  input_owner_client_id: identifierSchema.nullable()
}).strict();
export type OperatorSession = z.infer<typeof operatorSessionSchema>;

export const operatorTransportSchema = z.object({
  transport_id: identifierSchema,
  kind: z.enum(['electron-ipc', 'loopback-a2a', 'websocket', 'remote-a2a', 'mobile']),
  status: z.enum(['enabled', 'disabled']),
  trust_boundary: z.enum(['trusted-host', 'signed-loopback', 'future-disabled']),
  carries_credentials: z.literal(false),
  detail: z.string().trim().min(1).max(300)
}).strict();
export type OperatorTransport = z.infer<typeof operatorTransportSchema>;

export const operatorNotificationSchema = z.object({
  notification_id: identifierSchema,
  kind: z.enum(['human-proof', 'approval', 'provider-login', 'validation', 'merge-conflict', 'revocation', 'completion']),
  severity: z.enum(['info', 'attention', 'blocking', 'success']),
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(400),
  source_id: identifierSchema,
  route: identifierSchema.nullable(),
  action_label: z.string().trim().min(1).max(80).nullable(),
  created_at: isoTimestampSchema
}).strict();
export type OperatorNotification = z.infer<typeof operatorNotificationSchema>;

export const humanProofChallengeSchema = z.object({
  schema_version: z.literal(1),
  challenge_id: identifierSchema,
  human_id: identifierSchema,
  purpose: z.string().trim().min(2).max(300),
  command: identifierSchema,
  source_route: identifierSchema,
  source_mode: presentationModeSchema,
  source_scroll_y: z.number().int().nonnegative(),
  source_focus_id: identifierSchema.nullable(),
  continuation_mode: z.enum(['refresh-only', 'exact-once']),
  continuation_operation_key: identifierSchema.nullable(),
  sensitivity: z.enum(['non-sensitive', 'sensitive-confirm']),
  status: z.enum(['pending', 'verified', 'cancelled', 'expired', 'invalidated']),
  proof_id: identifierSchema.nullable(),
  requested_at: isoTimestampSchema,
  expires_at: isoTimestampSchema,
  completed_at: isoTimestampSchema.nullable(),
  version: z.number().int().positive()
}).strict().superRefine((challenge, context) => {
  if (challenge.continuation_mode === 'exact-once' && !challenge.continuation_operation_key) {
    context.addIssue({ code: 'custom', message: 'Exact-once challenge requires an operation key.' });
  }
  if (challenge.continuation_mode === 'refresh-only' && challenge.continuation_operation_key) {
    context.addIssue({ code: 'custom', message: 'Refresh-only challenge cannot carry an operation key.' });
  }
});
export type HumanProofChallenge = z.infer<typeof humanProofChallengeSchema>;

export const controlPlaneLeaseRequestSchema = z.object({ host_instance_id: identifierSchema, lease_id: identifierSchema, client_id: identifierSchema, generation: identifierSchema }).strict();
export type ControlPlaneLeaseRequest = z.infer<typeof controlPlaneLeaseRequestSchema>;

export const controlPlaneSnapshotSchema = z.object({
  schema_version: z.literal(1),
  snapshot_id: identifierSchema,
  host_instance_id: identifierSchema,
  generated_at: isoTimestampSchema,
  aggregate_version: z.number().int().positive(),
  cursor: z.number().int().nonnegative(),
  canonical_hash: sha256Schema,
  canonical: controlPlaneCanonicalStateSchema,
  office: officeStateSchema,
  appearance: appearancePreferencesSchema,
  connection: controlPlaneConnectionSchema,
  operator_session: operatorSessionSchema,
  transports: z.array(operatorTransportSchema).length(5),
  notifications: z.array(operatorNotificationSchema).max(100),
  readiness: operatorReadinessStateSchema,
  human_proof_challenge: humanProofChallengeSchema.nullable()
}).strict();
export type ControlPlaneSnapshot = z.infer<typeof controlPlaneSnapshotSchema>;

export const controlPlaneEventEnvelopeSchema = z.object({
  schema_version: z.literal(1),
  event_id: identifierSchema,
  host_instance_id: identifierSchema,
  sequence: z.number().int().positive(),
  aggregate_version: z.number().int().positive(),
  emitted_at: isoTimestampSchema,
  kind: z.enum(['snapshot-changed', 'appearance-changed', 'attachment-changed', 'human-proof-changed']),
  topic: identifierSchema,
  aggregate_id: identifierSchema,
  changed_domains: z.array(identifierSchema).max(32),
  evidence_ref: identifierSchema.nullable(),
  canonical_hash: sha256Schema
}).strict();
export type ControlPlaneEventEnvelope = z.infer<typeof controlPlaneEventEnvelopeSchema>;

export const controlPlaneReplayRequestSchema = controlPlaneLeaseRequestSchema.extend({ after_cursor: z.number().int().nonnegative() }).strict();
export type ControlPlaneReplayRequest = z.infer<typeof controlPlaneReplayRequestSchema>;

export const controlPlaneReplayResponseSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('events'), events: z.array(controlPlaneEventEnvelopeSchema), latest_cursor: z.number().int().nonnegative() }).strict(),
  z.object({ mode: z.literal('snapshot-required'), reason: z.enum(['cursor-too-old', 'host-restarted', 'cursor-ahead']), latest_cursor: z.number().int().nonnegative() }).strict()
]);
export type ControlPlaneReplayResponse = z.infer<typeof controlPlaneReplayResponseSchema>;

export const officeCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('workspace.refresh') }).strict(),
  z.object({
    type: z.literal('readiness.repair'),
    readiness_id: identifierSchema,
    expected_generation_hash: sha256Schema,
    source_route: identifierSchema,
    source_mode: presentationModeSchema,
    source_scroll_y: z.number().int().nonnegative(),
    source_focus_id: identifierSchema.nullable()
  }).strict(),
  z.object({ type: z.literal('workflow.select'), workflow_id: guidedWorkflowIdSchema }).strict(),
  z.object({ type: z.literal('workflow.advance'), workflow_id: guidedWorkflowIdSchema, step_id: identifierSchema }).strict(),
  z.object({
    type: z.literal('human-proof.request'),
    human_id: identifierSchema,
    purpose: z.string().trim().min(2).max(300),
    command: identifierSchema,
    source_route: identifierSchema,
    source_mode: presentationModeSchema,
    source_scroll_y: z.number().int().nonnegative(),
    source_focus_id: identifierSchema.nullable(),
    continuation_mode: z.enum(['refresh-only', 'exact-once']),
    continuation_operation_key: identifierSchema.nullable(),
    sensitivity: z.enum(['non-sensitive', 'sensitive-confirm'])
  }).strict().superRefine((command, context) => {
    if (command.continuation_mode === 'exact-once' && !command.continuation_operation_key) context.addIssue({ code: 'custom', message: 'Exact-once request requires an operation key.' });
    if (command.continuation_mode === 'refresh-only' && command.continuation_operation_key) context.addIssue({ code: 'custom', message: 'Refresh-only request cannot carry an operation key.' });
  }),
  z.object({ type: z.literal('human-proof.complete'), challenge_id: identifierSchema, proof_id: identifierSchema, source_route: identifierSchema, source_mode: presentationModeSchema }).strict(),
  z.object({ type: z.literal('human-proof.continue'), challenge_id: identifierSchema, source_route: identifierSchema, source_mode: presentationModeSchema }).strict(),
  z.object({ type: z.literal('human-proof.cancel'), challenge_id: identifierSchema }).strict(),
  z.object({ type: z.literal('human-proof.dismiss'), challenge_id: identifierSchema }).strict(),
  z.object({
    type: z.literal('appearance.set'),
    presentation_mode: presentationModeSchema.optional(),
    reduced_motion: z.boolean().optional(),
    camera_position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional(),
    zoom: z.number().finite().min(0.5).max(2).optional(),
    inspector_width: z.number().int().min(280).max(640).optional()
  }).strict().refine((value) => Object.keys(value).some((key) => key !== 'type'), 'Appearance command requires a changed value.')
]);
export type OfficeCommand = z.infer<typeof officeCommandSchema>;

export const controlPlaneCommandRequestSchema = controlPlaneLeaseRequestSchema.extend({ command: officeCommandSchema }).strict();
export type ControlPlaneCommandRequest = z.infer<typeof controlPlaneCommandRequestSchema>;
