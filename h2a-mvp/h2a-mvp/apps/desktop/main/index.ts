import { app, BrowserWindow, clipboard, ipcMain as electronIpcMain, safeStorage, shell, type IpcMainInvokeEvent } from 'electron';
import { EmployeeWorkspaceService } from '../../../packages/organization/src/employeeWorkspaceService';
import { DurableDiagnostics } from './diagnostics';
import { FirstAdministratorSetup } from '../../../packages/organization/src/firstAdministratorSetup';
import { watch, type FSWatcher } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CURRENT_SCHEMA_VERSION,
  controlPlaneAttachRequestSchema,
  controlPlaneCommandRequestSchema,
  controlPlaneLeaseRequestSchema,
  controlPlaneReplayRequestSchema,
  defaultEvidenceQuery,
  biometricEnrollmentRequestSchema,
  biometricEnrollmentLifecycleRequestSchema,
  biometricVerificationRequestSchema,
  bootstrapOrganizationRequestSchema,
  createAuthorityRoleRequestSchema,
  joinMembershipRequestSchema,
  membershipLifecycleRequestSchema,
  issueAuthorityCredentialRequestSchema,
  recoverAdministratorCredentialRequestSchema,
  authorityCredentialLifecycleRequestSchema,
  authorityApprovalStateSchema,
  consumeApprovalResumeRequestSchema,
  createApprovalPolicyRequestSchema,
  requestAuthorityEscalationSchema,
  submitApprovalDecisionRequestSchema,
  withdrawApprovalRequestSchema,
  evaluateHumanAuthorityRequestSchema,
  organizationAuthorityStateSchema,
  enrollHumanV2RequestSchema,
  agentIdentityStateSchema,
  agentPassportV2MigrationResultSchema,
  attestAgentRuntimeRequestSchema,
  authorizeActionRequestSchema,
  collaborationStateSchema,
  connectorImportRequestSchema,
  connectorProtocolStateSchema,
  contextBrokerStateSchema,
  contextGrantLifecycleRequestSchema,
  createContextArtifactRequestSchema,
  issueContextGrantRequestSchema,
  federationStateSchema,
  federationPairingStateSchema,
  refreshNodeDiscoveryRequestSchema,
  createFederationPairingRequestSchema,
  acceptFederationPairingRequestSchema,
  confirmFederationPairingRequestSchema,
  cancelFederationPairingRequestSchema,
  federationOperatorStateSchema,
  startFederationListenerRequestSchema,
  stopFederationListenerRequestSchema,
  sendFederationTaskRequestSchema,
  sendFederationAcknowledgementRequestSchema,
  sendFederationOperatorHeartbeatRequestSchema,
  proveFederationReplayRequestSchema,
  proveFederationRevocationRequestSchema,
  enterpriseOverviewStateSchema,
  finalAcceptanceExportReceiptSchema,
  finalAcceptanceStateSchema,
  securityValidationStateSchema,
  runSecurityAttackRequestSchema,
  runContainmentControlRequestSchema,
  configureFederationNodeRequestSchema,
  createFederationInvitationRequestSchema,
  acceptFederationInvitationRequestSchema,
  approveFederationRegistrationRequestSchema,
  activateFederationAcceptanceRequestSchema,
  revokeFederationPeerRequestSchema,
  frameworkConnectorStateSchema,
  frameworkProbeRequestSchema,
  executeFrameworkRequestSchema,
  realCollaborationStateSchema,
  prepareRealCollaborationRequestSchema,
  replaceRealCollaborationAuthorityRequestSchema,
  runRealCollaborationLaneRequestSchema,
  cancelRealCollaborationLaneRequestSchema,
  leastContextStateSchema,
  prepareLeastContextRequestSchema,
  renewLeastContextGrantRequestSchema,
  runLeastContextLaneRequestSchema,
  proveLeastContextRevocationRequestSchema,
  configureHumanEscalationRequestSchema,
  humanEscalationStateSchema,
  startHumanEscalationRequestSchema,
  startHumanEscalationRejectionRequestSchema,
  cancelDeliveryRequestSchema,
  cancelLiveRunRequestSchema,
  liveRuntimeProbeRequestSchema,
  liveRuntimeStateSchema,
  startLiveRunRequestSchema,
  attachTerminalRequestSchema,
  runtimeAttachmentStateSchema,
  startTerminalSessionRequestSchema,
  terminalCancelRequestSchema,
  terminalInputRequestSchema,
  terminalLeaseRequestSchema,
  terminalReplayRequestSchema,
  terminalReplayResponseSchema,
  terminalResizeRequestSchema,
  createAssignmentRequestSchema,
  createAgentRequestSchema,
  createMandateRequestSchema,
  delegateMandateRequestSchema,
  evidenceExplorerStateSchema,
  evidenceQuerySchema,
  evidenceExportReceiptSchema,
  exportEvidenceBundleRequestSchema,
  humanProofFailureRequestSchema,
  humanProofStateSchema,
  humanIdentityV2StateSchema,
  humanIdentityV2MigrationRequestSchema,
  humanIdentityV2MigrationResultSchema,
  mandateLifecycleRequestSchema,
  mandateStateSchema,
  migrateAgentPassportsV1RequestSchema,
  passportLifecycleRequestSchema,
  recordAssignmentResponseRequestSchema,
  resumeScenarioRequestSchema,
  runtimeLifecycleRequestSchema,
  resolveApprovalRequestSchema,
  sendCollaborationMessageRequestSchema,
  startScenarioRequestSchema,
  scenarioStateSchema,
  systemStatusSchema,
  updateAssignmentRequestSchema,
  verifyHumanV2RequestSchema,
  workplaceSnapshotSchema,
  createProjectAssignmentRequestSchema,
  createProjectGoalRequestSchema,
  fetchResearchSourceRequestSchema,
  integrateProjectRequestSchema,
  projectDeliveryStateSchema,
  registerProjectRequestSchema,
  requestProjectIntegrationApprovalSchema,
  runProjectValidationRequestSchema,
  runProjectAssignmentRequestSchema,
  cancelProjectRunRequestSchema,
  type BiometricEnrollmentRequest,
  type BiometricEnrollmentLifecycleRequest,
  type BiometricVerificationRequest,
  type BootstrapOrganizationRequest,
  type CreateAuthorityRoleRequest,
  type JoinMembershipRequest,
  type MembershipLifecycleRequest,
  type IssueAuthorityCredentialRequest,
  type RecoverAdministratorCredentialRequest,
  type AuthorityCredentialLifecycleRequest,
  type AuthorityApprovalState,
  type ConsumeApprovalResumeRequest,
  type CreateApprovalPolicyRequest,
  type RequestAuthorityEscalation,
  type SubmitApprovalDecisionRequest,
  type WithdrawApprovalRequest,
  type EvaluateHumanAuthorityRequest,
  type OrganizationAuthorityState,
  type AgentIdentityState,
  type AgentPassportV2MigrationResult,
  type AttestAgentRuntimeRequest,
  type AuthorizeActionRequest,
  type CollaborationState,
  type CreateProjectAssignmentRequest,
  type CreateProjectGoalRequest,
  type FetchResearchSourceRequest,
  type IntegrateProjectRequest,
  type ProjectDeliveryState,
  type RegisterProjectRequest,
  type RequestProjectIntegrationApproval,
  type RunProjectValidationRequest,
  type RunProjectAssignmentRequest,
  type CancelProjectRunRequest,
  type ConnectorImportRequest,
  type ConnectorProtocolState,
  type ContextBrokerState,
  type ContextGrantLifecycleRequest,
  type CreateContextArtifactRequest,
  type IssueContextGrantRequest,
  type FederationState,
  type FederationOperatorState,
  type StartFederationListenerRequest,
  type StopFederationListenerRequest,
  type SendFederationTaskRequest,
  type SendFederationAcknowledgementRequest,
  type SendFederationOperatorHeartbeatRequest,
  type ProveFederationReplayRequest,
  type ProveFederationRevocationRequest,
  type EnterpriseOverviewState,
  type FinalAcceptanceExportReceipt,
  type FinalAcceptanceState,
  type Phase44SessionReceipt,
  type SecurityValidationState,
  type RunSecurityAttackRequest,
  type RunContainmentControlRequest,
  type ConfigureFederationNodeRequest,
  type CreateFederationInvitationRequest,
  type AcceptFederationInvitationRequest,
  type ApproveFederationRegistrationRequest,
  type ActivateFederationAcceptanceRequest,
  type RevokeFederationPeerRequest,
  type FrameworkConnectorState,
  type FrameworkProbeRequest,
  type ExecuteFrameworkRequest,
  type RealCollaborationState,
  type PrepareRealCollaborationRequest,
  type ReplaceRealCollaborationAuthorityRequest,
  type RunRealCollaborationLaneRequest,
  type CancelRealCollaborationLaneRequest,
  type LeastContextState,
  type PrepareLeastContextRequest,
  type RenewLeastContextGrantRequest,
  type RunLeastContextLaneRequest,
  type ProveLeastContextRevocationRequest,
  type ConfigureHumanEscalationRequest,
  type HumanEscalationState,
  type StartHumanEscalationRequest,
  type StartHumanEscalationRejectionRequest,
  type CancelDeliveryRequest,
  type CancelLiveRunRequest,
  type LiveRuntimeProbeRequest,
  type LiveRuntimeState,
  type StartLiveRunRequest,
  type AttachTerminalRequest,
  type RuntimeAttachmentState,
  type StartTerminalSessionRequest,
  type TerminalAttachmentLease,
  type TerminalCancelRequest,
  type TerminalInputRequest,
  type TerminalLeaseRequest,
  type TerminalReplayRequest,
  type TerminalReplayResponse,
  type TerminalResizeRequest,
  type CreateAssignmentRequest,
  type CreateAgentRequest,
  type CreateMandateRequest,
  type DelegateMandateRequest,
  type EvidenceExplorerState,
  type EvidenceExportReceipt,
  type EvidenceQuery,
  type ExportEvidenceBundleRequest,
  type EnrollHumanV2Request,
  type HumanIdentityV2State,
  type HumanIdentityV2MigrationRequest,
  type HumanIdentityV2MigrationResult,
  type HumanProofFailureRequest,
  type HumanProofState,
  type MandateLifecycleRequest,
  type MandateState,
  type MigrateAgentPassportsV1Request,
  type PassportLifecycleRequest,
  type RecordAssignmentResponseRequest,
  type ResumeScenarioRequest,
  type RuntimeLifecycleRequest,
  type ResolveApprovalRequest,
  type SendCollaborationMessageRequest,
  type StartScenarioRequest,
  type ScenarioState,
  type SystemStatus,
  type UpdateAssignmentRequest,
  type VerifyHumanV2Request,
  type WorkplaceSnapshot,
  type ControlPlaneAttachResponse,
  type ControlPlaneEventEnvelope,
  type ControlPlaneReplayResponse,
  type ControlPlaneSnapshot,
  type OperatorReadiness
} from '@h2a/contracts';
import { ChangeIntegrationService, GoalWorkGraphCoordinator, ProjectDeliveryRepository, ProjectProviderExecutionService, ProjectTaskCoordinator, ProjectValidationService, ProjectWorkspaceService, ResearchConnectorService, WorktreeLeaseService, type ProjectExecutionAuthorityPort } from '@h2a/projects';
import {
  approveWorkGraphRequestSchema, composeCollaborativeGoalRequestSchema, editWorkGraphRequestSchema,
  goalWorkGraphStateSchema, proposeWorkGraphRequestSchema, reassignWorkGraphNodeRequestSchema, renewWorkGraphNodeRequestSchema,
  runWorkGraphRequestSchema, workGraphNodeCommandRequestSchema,
  type ApproveWorkGraphRequest, type ComposeCollaborativeGoalRequest, type EditWorkGraphRequest,
  type GoalWorkGraphState, type ProposeWorkGraphRequest, type ReassignWorkGraphNodeRequest, type RenewWorkGraphNodeRequest,
  type RunWorkGraphRequest, type WorkGraphAgentCandidate, type WorkGraphNodeCommandRequest
} from '@h2a/contracts';
import {
  guidedBootstrapStateSchema,
  prepareGuidedBootstrapRequestSchema,
  runGuidedBootstrapStepRequestSchema,
  type GuidedBootstrapState,
  type PrepareGuidedBootstrapRequest,
  type RunGuidedBootstrapStepRequest
} from '@h2a/contracts';
import {
  ceremonyStateSchema,
  createCeremonySessionRequestSchema,
  runCeremonyStepRequestSchema,
  type CeremonyState,
  type CeremonyCorrelation,
  type CreateCeremonySessionRequest,
  type RunCeremonyStepRequest
} from '@h2a/contracts';
import {
  demonstrationConductorCommandSchema,
  finalAcceptanceVerificationReceiptSchema,
  verifyFinalAcceptancePackageRequestSchema,
  type DemonstrationConductor,
  type DemonstrationConductorCommand,
  type FinalAcceptanceVerificationReceipt,
  type VerifyFinalAcceptancePackageRequest
} from '@h2a/contracts';
import { DemonstrationConductorService, EnterpriseObservabilityService, EvidenceAuditService, FinalAcceptanceService, LocalAuthorityEventLedger, hashCanonical } from '@h2a/evidence';
import { verifyBiometricAssetManifest } from '@h2a/biometrics';
import { AgentCollaborationService, HumanEscalationCoordinator, LeastContextCoordinator, LocalProviderSecretStore, ProcessSupervisor, RealCollaborationCoordinator, RuntimeAttachmentService, ScriptedScenarioService, SecurityValidationCoordinator, type LiveRuntimeAuthorityPort, type ProviderSecretProtector } from '@h2a/agents';
import { AgentIdentityService, HumanIdentityV2Service, HumanProofService } from '@h2a/identity';
import { MandateService } from '@h2a/mandates';
import { MultiHumanApprovalService, OrganizationAuthorityService } from '@h2a/organization';
import { LocalAppearancePreferencesRepository, LocalFeatureConfigRepository, LocalWorkplaceRepository } from '@h2a/storage';
import { H2AControlPlaneHost } from '@h2a/control-plane';
import { ConnectorRegistry, FrameworkConnectorService } from '@h2a/connectors';
import { MessageBroker } from '@h2a/messaging';
import { assertContextRecipientBinding, ContextBrokerService } from '@h2a/resources';
import { FederationOperatorCoordinator, FederationPairingCoordinator, FederationService } from '@h2a/federation';
import { CeremonyCoordinator } from '@h2a/ceremony';
import { GuidedBootstrapCoordinator } from '@h2a/bootstrap';
import { ReadinessProjectionService } from '@h2a/operator-experience';

const appRoot = process.cwd();
const dataPath = process.env.H2A_DATA_PATH
  ? resolve(process.env.H2A_DATA_PATH)
  : join(appRoot, 'data', 'h2a-demo');
const nodeWindowLabel = process.env.H2A_NODE_LABEL?.trim().slice(0, 24);
app.setPath('userData', join(dataPath, '.electron-user-data'));
// This directory is excluded by the data watcher so diagnostics cannot trigger a refresh loop.
const diagnostics = new DurableDiagnostics(join(dataPath, '.electron-user-data', 'logs', 'main.jsonl'));
const repository = new LocalWorkplaceRepository(dataPath);
const featureConfigRepository = new LocalFeatureConfigRepository(dataPath);
const appearancePreferencesRepository = new LocalAppearancePreferencesRepository(dataPath);
const evidenceLedger = new LocalAuthorityEventLedger(dataPath);
const projectDeliveryRepository = new ProjectDeliveryRepository(dataPath);
const projectWorkspaceService = new ProjectWorkspaceService(projectDeliveryRepository, evidenceLedger);
const projectTaskCoordinator = new ProjectTaskCoordinator(projectDeliveryRepository, evidenceLedger);
const worktreeLeaseService = new WorktreeLeaseService(projectDeliveryRepository, evidenceLedger);
const researchConnectorService = new ResearchConnectorService(projectDeliveryRepository, evidenceLedger);
const projectValidationService = new ProjectValidationService(projectDeliveryRepository, evidenceLedger);
const changeIntegrationService = new ChangeIntegrationService(projectDeliveryRepository, evidenceLedger, {
  assertApproved: async ({ approval_event_id, effect_hash }) => {
    const records = await evidenceLedger.list();
    const approval = records.find((event) => event.event_type === 'APPROVAL_QUORUM_REACHED' && (event.event_id === approval_event_id || event.subject?.id === approval_event_id));
    if (!approval?.subject) throw new Error('Configured human approval quorum evidence was not found.');
    const request = records.find((event) => event.event_type === 'AUTHORITY_ESCALATION_REQUESTED' && event.subject?.id === approval.subject?.id && event.payload.requested_effect_hash === effect_hash);
    if (!request) throw new Error('Human approval does not bind the exact integration effect hash.');
  }
});
const humanProofService = new HumanProofService(dataPath, evidenceLedger);
const humanIdentityV2Service = new HumanIdentityV2Service(
  dataPath,
  evidenceLedger,
  undefined,
  undefined,
  async () => (await featureConfigRepository.get()).livenessMode
);
const organizationAuthorityService = new OrganizationAuthorityService(dataPath, evidenceLedger, humanIdentityV2Service);
// Room-link validation is invoked after startup; coordinator construction depends on services below.
// eslint-disable-next-line prefer-const
let goalWorkGraphCoordinator: GoalWorkGraphCoordinator;
const employeeWorkspaceService = new EmployeeWorkspaceService(dataPath, humanIdentityV2Service, organizationAuthorityService, evidenceLedger, async () => (await featureConfigRepository.get()).livenessMode, () => new Date(), async () => ({
  projectIds: (await projectDeliveryRepository.read()).projects.map((item) => item.project_id),
  goalIds: (await goalWorkGraphCoordinator.getState()).goals.map((item) => item.goal_id)
}));
const firstAdministratorSetup = new FirstAdministratorSetup(humanIdentityV2Service, organizationAuthorityService);
const providerSecretProtector: ProviderSecretProtector = {
  encrypt: async (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system credential encryption is unavailable.');
    return safeStorage.encryptString(value).toString('base64');
  },
  decrypt: async (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system credential encryption is unavailable.');
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  }
};
const providerSecretStore = new LocalProviderSecretStore(dataPath, providerSecretProtector);
const agentIdentityService = new AgentIdentityService(dataPath, evidenceLedger, humanProofService, repository, providerSecretStore, undefined, organizationAuthorityService);
const collaborationService = new AgentCollaborationService(dataPath, evidenceLedger, repository);
// Deferred construction resolves the approval-executor/runtime dependency cycle.
// eslint-disable-next-line prefer-const
let humanEscalationCoordinator: HumanEscalationCoordinator;
const multiHumanApprovalService = new MultiHumanApprovalService(
  dataPath,
  evidenceLedger,
  humanIdentityV2Service,
  organizationAuthorityService,
  {
    resume: async (input) => humanEscalationCoordinator.resume(input)
  }
);
const mandateService = new MandateService(dataPath, evidenceLedger, humanProofService, repository, undefined, organizationAuthorityService);
const scenarioService = new ScriptedScenarioService(dataPath, evidenceLedger, repository, collaborationService, mandateService);
const runtimeAuthority: LiveRuntimeAuthorityPort = {
  assertActive: async (request) => {
    const [identity, workplace, integrity] = await Promise.all([agentIdentityService.getState(), repository.getSnapshot(), evidenceLedger.verify()]);
    if (integrity.status !== 'verified') throw new Error('Evidence integrity must be verified before live execution.');
    const passport = identity.passports.find((item) => item.passport_id === request.passport_id);
    const passportV2 = identity.passportsV2?.find((item) => item.passport_id === request.passport_id);
    if (!passport || passport.status !== 'active' || (passportV2 && passportV2.status !== 'active')) throw new Error('Agent Passport is not active.');
    const binding = identity.bindings.find((item) => item.binding_id === request.binding_id);
    if (!binding || binding.agent_id !== passport.agent_id || binding.provider !== request.provider || binding.connection_state !== 'connected') throw new Error('Runtime binding is not active for this provider.');
    if (binding.live_session_id !== request.runtime_session_id) throw new Error('Runtime session is not the binding current session.');
    if (resolve(binding.cwd) !== resolve(request.workspace_path)) throw new Error('Live runtime workspace does not match the signed runtime binding.');
    const session = identity.runtimeSessions?.find((item) => item.runtime_session_id === request.runtime_session_id);
    if (!session || !['ready', 'working'].includes(session.state)) throw new Error('Runtime session is not active.');
    const attestation = identity.attestations?.find((item) => item.attestation_id === session.runtime_attestation_id);
    if (!attestation || new Date(attestation.expires_at).getTime() <= Date.now() || attestation.passport_id !== request.passport_id || attestation.connector_manifest_id !== session.connector_manifest_id) throw new Error('Runtime attestation is not active.');
    const agent = workplace.agents.find((item) => item.id === request.agent_id);
    if (!agent || agent.passportId !== request.passport_id) throw new Error('Agent workplace identity projection does not match the live request.');
    if (agent.mandateId !== request.mandate_id) {
      const exactAssignment = workplace.assignments.find((item) => item.assigneeId === request.agent_id && item.mandateId === request.mandate_id && item.status === 'active');
      const extension = await multiHumanApprovalService.findActiveExtension(request.mandate_id, request.agent_id);
      const assignment = extension && workplace.assignments.find((item) => item.id === extension.task_id && item.assigneeId === request.agent_id && item.mandateId === extension.parent_mandate_id && item.status === 'active');
      if (!exactAssignment && (!extension || !assignment)) throw new Error('Agent workplace mandate projection does not match the live request.');
    }
  }
};
const projectExecutionAuthority = {
  assertActive: async (assignment) => {
    const [identity, workplace, mandates, integrity] = await Promise.all([agentIdentityService.getState(), repository.getSnapshot(), mandateService.getState(), evidenceLedger.verify()]);
    if (integrity.status !== 'verified') throw new Error('Evidence integrity must be verified before project execution.');
    const passport = identity.passports.find((item) => item.passport_id === assignment.passport_id); if (!passport || passport.status !== 'active') throw new Error('Project assignment Agent Passport is not active.');
    const binding = identity.bindings.find((item) => item.binding_id === assignment.agent_id && item.live_session_id === assignment.runtime_session_id); if (!binding || binding.agent_id !== passport.agent_id || binding.connection_state !== 'connected' || binding.provider !== assignment.provider) throw new Error('Project assignment runtime binding is not active.');
    const session = identity.runtimeSessions?.find((item) => item.runtime_session_id === assignment.runtime_session_id && ['ready', 'working'].includes(item.state)); if (!session) throw new Error('Project assignment runtime session is not active.');
    const mandate = mandates.mandates.find((item) => item.mandateId === assignment.mandate_id && item.subject.agentId === passport.agent_id && item.subject.passportId === assignment.passport_id && item.status === 'active' && new Date(item.expiresAt).getTime() > Date.now());
    if (!mandate) throw new Error('Project assignment mandate is not active.');
    const agent = workplace.agents.find((item) => item.id === assignment.agent_id && item.passportId === assignment.passport_id);
    const exactTask = workplace.assignments.find((item) => item.title === assignment.title && item.assigneeId === assignment.agent_id && item.mandateId === assignment.mandate_id);
    if (!agent || (agent.mandateId !== assignment.mandate_id && !exactTask)) throw new Error('Project assignment authority projection is not current.');
  }
} satisfies ProjectExecutionAuthorityPort;
const projectProviderExecutionService = new ProjectProviderExecutionService(projectDeliveryRepository, evidenceLedger, worktreeLeaseService, projectExecutionAuthority);
const processSupervisor = new ProcessSupervisor(dataPath, evidenceLedger, runtimeAuthority, undefined, [appRoot]);
const runtimeAttachmentService = new RuntimeAttachmentService(dataPath, evidenceLedger, runtimeAuthority, undefined, undefined, [appRoot]);
const connectorRegistry = new ConnectorRegistry(dataPath, evidenceLedger);
const contextBrokerService = new ContextBrokerService(dataPath, evidenceLedger, organizationAuthorityService, {
  assertRecipient: async ({ organizationId, taskId, mandateId, agentId, passportId }) => {
    const [identity, mandates, workplace] = await Promise.all([agentIdentityService.getState(), mandateService.getState(), collaborationService.getState()]);
    assertContextRecipientBinding({ organizationId, taskId, mandateId, agentId, passportId }, identity, mandates, workplace);
  }
}, {
  seal: async (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system context encryption is unavailable.');
    return safeStorage.encryptString(value).toString('base64');
  },
  open: async (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system context encryption is unavailable.');
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  }
});
const messageBroker = new MessageBroker(dataPath, connectorRegistry, evidenceLedger, contextBrokerService);
const frameworkConnectorService = new FrameworkConnectorService(dataPath, messageBroker, evidenceLedger, appRoot, undefined, {
  registry: connectorRegistry,
  authority: organizationAuthorityService
});
const federationService = new FederationService(dataPath, evidenceLedger, organizationAuthorityService, {
  seal: async (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system federation key encryption is unavailable.');
    return safeStorage.encryptString(value).toString('base64');
  },
  open: async (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system federation key encryption is unavailable.');
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  }
});
const federationPairingCoordinator = new FederationPairingCoordinator(dataPath, evidenceLedger, {
  federation: federationService,
  aliases: async () => (await organizationAuthorityService.getState()).memberships.filter((item) => item.status === 'active').map((item) => item.employee_id),
  agentCatalogue: async () => {
    const identity = await agentIdentityService.getState();
    return identity.passports.filter((passport) => passport.status === 'active').flatMap((passport) => {
      const binding = identity.bindings.find((item) => item.agent_id === passport.agent_id && item.connection_state === 'connected' && item.live_session_id);
      const session = identity.runtimeSessions?.find((item) => item.runtime_session_id === binding?.live_session_id && item.passport_id === passport.passport_id);
      if (!binding || !session || !['claude-code', 'openai-codex', 'gemini-antigravity', 'custom-cli'].includes(binding.provider)) return [];
      return [{
        agent_id: passport.agent_id,
        runtime_binding_id: binding.binding_id,
        passport_id: passport.passport_id,
        runtime_session_id: session.runtime_session_id,
        runtime_attestation_id: session.runtime_attestation_id,
        human_owner_id: passport.owner_human_id,
        display_name: passport.name,
        provider: binding.provider as 'claude-code' | 'openai-codex' | 'gemini-antigravity' | 'custom-cli',
        capabilities: passport.capabilities,
        status: ['ready', 'working'].includes(session.state) ? 'ready' as const : 'offline' as const
      }];
    });
  }
});
goalWorkGraphCoordinator = new GoalWorkGraphCoordinator(dataPath, evidenceLedger, {
  candidates: async (): Promise<WorkGraphAgentCandidate[]> => {
    const [identity, pairing] = await Promise.all([agentIdentityService.getState(), federationPairingCoordinator.getState('')]);
    const local: WorkGraphAgentCandidate[] = identity.passports.flatMap((passport) => {
      const binding = identity.bindings.find((item) => item.agent_id === passport.agent_id);
      const session = identity.runtimeSessions?.find((item) => item.runtime_session_id === binding?.live_session_id && item.passport_id === passport.passport_id);
      const attestation = identity.attestations?.find((item) => item.attestation_id === session?.runtime_attestation_id);
      const ready = passport.status === 'active' && binding?.connection_state === 'connected' && Boolean(session && ['ready', 'working'].includes(session.state)) && Boolean(attestation && new Date(attestation.expires_at).getTime() > Date.now());
      if (binding && !['claude-code', 'openai-codex', 'gemini-antigravity', 'custom-cli'].includes(binding.provider)) return [];
      return [{
        candidate_id: `candidate_local_${binding?.binding_id ?? passport.agent_id}`,
        execution_target: 'local' as const,
        agent_id: passport.agent_id,
        runtime_binding_id: binding?.binding_id ?? `unbound_${passport.agent_id}`,
        display_name: passport.name,
        provider: (binding?.provider ?? 'custom-cli') as 'claude-code' | 'openai-codex' | 'gemini-antigravity' | 'custom-cli',
        human_owner_id: passport.owner_human_id,
        passport_id: passport.passport_id,
        runtime_session_id: session?.runtime_session_id ?? null,
        runtime_attestation_id: session?.runtime_attestation_id ?? null,
        remote_peer_id: null,
        capabilities: passport.capabilities,
        status: ready ? 'ready' as const : 'unavailable' as const,
        reason_code: ready ? null : 'LOCAL_AGENT_PREREQUISITE_INACTIVE'
      }];
    });
    const remote: WorkGraphAgentCandidate[] = pairing.pairings.filter((item) => item.pairing.status === 'active').flatMap((view) => {
      const discovered = pairing.discovery.nodes.find((item) => item.node_id === view.pairing.remote_node_id);
      return (discovered?.agents ?? []).map((agent) => ({
        candidate_id: `candidate_remote_${view.pairing.pairing_id}_${agent.runtime_binding_id}`,
        execution_target: 'paired-node' as const,
        agent_id: agent.agent_id,
        runtime_binding_id: agent.runtime_binding_id,
        display_name: `${agent.display_name} · ${view.remote_display_name}`,
        provider: agent.provider,
        human_owner_id: agent.human_owner_id,
        passport_id: agent.passport_id,
        runtime_session_id: agent.runtime_session_id,
        runtime_attestation_id: agent.runtime_attestation_id,
        remote_peer_id: view.pairing.local_peer_id,
        capabilities: agent.capabilities,
        status: agent.status === 'ready' ? 'ready' as const : 'offline' as const,
        reason_code: agent.status === 'ready' ? null : 'REMOTE_AGENT_OFFLINE'
      }));
    });
    return [...local, ...remote];
  },
  assertProject: async (projectId) => {
    if (!(await projectDeliveryRepository.read()).projects.some((item) => item.project_id === projectId)) throw new Error('Registered project was not found.');
  },
  planningScope: async (projectId, organizationId) => {
    const [projects, context] = await Promise.all([projectDeliveryRepository.read(), contextBrokerService.getState()]);
    const project = projects.projects.find((item) => item.project_id === projectId);
    if (!project) throw new Error('Registered project was not found.');
    const contextFields = context.artifacts.filter((item) => item.organization_id === organizationId && item.status === 'active').flatMap((item) => item.fields.map((field) => field.field)).filter((field) => !/secret|password|token|private[_-]?key|biometric/iu.test(field));
    return {
      editable_paths: project.repository_mode === 'git' ? ['src/**', 'content/**', 'tests/**'] : [],
      network_hosts: project.network_hosts,
      validation_commands: project.allowed_commands.map((item) => item.command_id),
      context_fields: [...new Set(contextFields)]
    };
  },
  authorizeApproval: async (actor, organizationId) => organizationAuthorityService.authorizeProtectedOperation({
    organizationId,
    membershipId: actor.membership_id,
    humanProofId: actor.human_proof_id,
    authorityCredentialId: actor.authority_credential_id
  }, 'project-work-graph', 'approve'),
  provisionNode: async ({ goal, graph, node, actor }) => {
    if (!node.passport_id || !node.runtime_session_id) throw new Error('WORK_GRAPH_AGENT_IDENTITY_INCOMPLETE');
    const authority = { organizationId: goal.organization_id, membershipId: actor.membership_id, humanProofId: actor.human_proof_id, authorityCredentialId: actor.authority_credential_id };
    let project = await projectDeliveryRepository.read();
    let projectGoal = project.goals.find((item) => item.trace_id === goal.trace_id && item.project_id === goal.project_id);
    if (!projectGoal) {
      project = await projectTaskCoordinator.createGoal({ project_id: goal.project_id, objective: goal.objective, expected_outputs: goal.expected_outputs, created_by: goal.created_by_human_id, trace_id: goal.trace_id });
      projectGoal = project.goals.find((item) => item.trace_id === goal.trace_id && item.project_id === goal.project_id);
    }
    if (!projectGoal) throw new Error('Signed project goal was not persisted.');
    let mandateId: string;
    let remoteContextGrantId: string | null = null;
    let workplaceAssignmentId: string;
    const evidenceRefs: string[] = [];
    if (node.execution_target === 'local') {
      let mandates = await mandateService.getState();
      const prior = mandates.mandates.find((item) => item.objective === node.objective && item.subject.agentId === node.agent_id && item.status === 'active');
      if (!prior) {
        mandates = await mandateService.create({
          agentId: node.agent_id,
          objective: node.objective,
          resources: node.mandate_scope.resources,
          actions: node.mandate_scope.actions,
          prohibitedActions: ['credential.read', 'human-proof.read', 'authority.bypass'],
          limits: { maxDurationMinutes: Math.max(1, Math.ceil((node.mandate_scope.duration_seconds ?? 7200) / 60)), parameterEquals: { project_id: goal.project_id, graph_id: graph.graph_id, node_id: node.node_id } },
          allowedFields: node.allowed_context_fields,
          approvalActions: node.approval_policy_ids.length ? node.mandate_scope.actions : [],
          delegation: { allowed: false, allowedAgentIds: [], maxDepth: 0 },
          expiresAt: node.mandate_expires_at,
          humanAuthority: authority
        });
      }
      const mandate = mandates.mandates.find((item) => item.objective === node.objective && item.subject.agentId === node.agent_id && item.status === 'active');
      if (!mandate) throw new Error('Exact-scope mandate was not persisted.');
      mandateId = mandate.mandateId;
      let collaboration = await collaborationService.getState();
      const assignmentTitle = `Phase 49 ${node.node_id}: ${node.title}`;
      let workplaceAssignment = collaboration.workplace.assignments.find((item) => item.title === assignmentTitle && item.assigneeId === node.runtime_binding_id && item.mandateId === mandateId);
      if (!workplaceAssignment) {
        const ceremony = await activeWorkGraphCeremony(goal.goal_id, node.node_id, 'workplace');
        const beforeIds = new Set(collaboration.workplace.assignments.map((item) => item.id));
        collaboration = await collaborationService.createAssignment({ title: assignmentTitle, objective: node.objective, assigneeId: node.runtime_binding_id, risk: goal.sensitivity === 'restricted' ? 'restricted' : goal.sensitivity === 'confidential' ? 'sensitive' : 'standard', priority: 2, dependsOn: [], requestedAction: node.allowed_tools[0], ...(ceremony ? { ceremony } : {}) }, mandateId);
        workplaceAssignment = collaboration.workplace.assignments.find((item) => !beforeIds.has(item.id) && item.title === assignmentTitle && item.assigneeId === node.runtime_binding_id && item.mandateId === mandateId);
      }
      if (!workplaceAssignment) throw new Error('Canonical workplace assignment was not persisted.');
      workplaceAssignmentId = workplaceAssignment.id;
    } else {
      mandateId = `remote_mandate_${hashCanonical({ graph_id: graph.graph_id, node_id: node.node_id, scope: node.mandate_scope }).slice(7, 39)}`;
      workplaceAssignmentId = `federated_assignment_${node.node_id}`;
      const event = await evidenceLedger.append({ trace_id: goal.trace_id, actor: { type: 'human', id: goal.created_by_human_id }, subject: { type: 'mandate', id: mandateId }, mandate_id: mandateId, event_type: 'MANDATE_SIGNED', payload: { execution_target: 'paired-node', remote_peer_id: node.remote_peer_id, agent_id: node.agent_id, passport_id: node.passport_id, exact_scope_hash: hashCanonical(node.mandate_scope), protected_context_released: false } });
      evidenceRefs.push(event.event_id);
      remoteContextGrantId = `remote_context_grant_${hashCanonical({ graph_id: graph.graph_id, node_id: node.node_id, fields: [] }).slice(7, 39)}`;
      const grantEvent = await evidenceLedger.append({ trace_id: goal.trace_id, actor: { type: 'human', id: goal.created_by_human_id }, subject: { type: 'context_grant', id: remoteContextGrantId }, mandate_id: mandateId, event_type: 'CONTEXT_GRANT_ISSUED', payload: { execution_target: 'paired-node', remote_peer_id: node.remote_peer_id, agent_id: node.agent_id, passport_id: node.passport_id, task_id: workplaceAssignmentId, allowed_fields: [], withheld_fields: node.withheld_context_fields, projection_hash: hashCanonical({ graph_node_id: node.node_id, protected_values: 'excluded' }), protected_values: 'excluded', expires_at: node.mandate_expires_at } });
      evidenceRefs.push(grantEvent.event_id);
    }
    project = await projectDeliveryRepository.read();
    const dependencyAssignments = graph.dependency_edges.filter((edge) => edge.successor_node_id === node.node_id).map((edge) => project.assignments.find((item) => item.title.startsWith(`Phase 49 ${edge.predecessor_node_id}:`))?.assignment_id).filter((value): value is string => Boolean(value));
    const projectTitle = `Phase 49 ${node.node_id}: ${node.title}`;
    let projectAssignment = project.assignments.find((item) => item.title === projectTitle);
    if (!projectAssignment) {
      project = await projectTaskCoordinator.createAssignment({
        goal_id: projectGoal.goal_id,
        project_id: goal.project_id,
        title: projectTitle,
        objective: node.objective,
        output_contract: node.expected_outputs,
        tool_contract: node.allowed_tools,
        allowed_paths: node.allowed_paths,
        network_hosts: node.allowed_network_hosts,
        validation_commands: node.validation_commands,
        depends_on: dependencyAssignments,
        agent_id: node.runtime_binding_id,
        passport_id: node.passport_id,
        runtime_session_id: node.runtime_session_id,
        mandate_id: mandateId,
        provider: node.provider,
        kind: node.allowed_paths.length ? 'edit' : 'research'
      });
      projectAssignment = project.assignments.find((item) => item.title === projectTitle);
    }
    if (!projectAssignment) throw new Error('Signed project assignment was not persisted.');
    let worktreeLeaseId: string | null = null;
    if (projectAssignment.kind === 'edit') {
      project = await projectDeliveryRepository.read();
      let lease = project.worktrees.find((item) => item.assignment_id === projectAssignment!.assignment_id && item.status !== 'cleaned');
      if (!lease) {
        project = await worktreeLeaseService.create(projectAssignment.assignment_id);
        lease = project.worktrees.find((item) => item.assignment_id === projectAssignment!.assignment_id && item.status !== 'cleaned');
      }
      worktreeLeaseId = lease?.lease_id ?? null;
    }
    let contextGrantId: string | null = remoteContextGrantId;
    if (node.execution_target === 'local' && node.allowed_context_fields.length > 0) {
      const context = await contextBrokerService.getState();
      const rules = node.allowed_context_fields.map((field) => {
        const artifact = context.artifacts.find((item) => item.organization_id === goal.organization_id && item.status === 'active' && item.fields.some((candidate) => candidate.field === field));
        const artifactField = artifact?.fields.find((candidate) => candidate.field === field);
        if (!artifact || !artifactField) throw new Error(`WORK_GRAPH_CONTEXT_ARTIFACT_MISSING:${field}`);
        return { artifact_id: artifact.artifact_id, field, maximum_classification: artifactField.classification, transformation: 'reference' as const };
      });
      const granted = await contextBrokerService.issueGrant({ actor, organization_id: goal.organization_id, task_id: workplaceAssignmentId, mandate_id: mandateId, recipient_agent_id: node.agent_id, recipient_passport_id: node.passport_id, purpose: node.objective, field_rules: rules, token_budget: 1000, maximum_uses: 10, expires_at: node.mandate_expires_at });
      contextGrantId = [...granted.grants].reverse().find((item) => item.grant.task_id === workplaceAssignmentId && item.grant.mandate_id === mandateId)?.grant.context_grant_id ?? null;
    }
    project = await projectTaskCoordinator.message({ project_id: goal.project_id, goal_id: projectGoal.goal_id, assignment_id: projectAssignment.assignment_id, from_agent_id: node.runtime_binding_id, to_assignment_id: null, kind: 'proposal', subject: `Approved work-graph route for ${node.title}`, references: [node.passport_id, node.runtime_session_id, mandateId, ...(contextGrantId ? [contextGrantId] : [])], body: JSON.stringify({ graph_id: graph.graph_id, node_id: node.node_id, predecessor_node_ids: graph.dependency_edges.filter((edge) => edge.successor_node_id === node.node_id).map((edge) => edge.predecessor_node_id), protected_values: 'excluded' }) });
    const mailbox = [...project.messages].reverse().find((item) => item.assignment_id === projectAssignment!.assignment_id);
    return { passport_id: node.passport_id, runtime_session_id: node.runtime_session_id, mandate_id: mandateId, context_grant_id: contextGrantId, project_assignment_id: projectAssignment.assignment_id, workplace_assignment_id: workplaceAssignmentId, worktree_lease_id: worktreeLeaseId, mailbox_route_id: mailbox?.message_id ?? `mailbox_${node.node_id}`, evidence_refs: evidenceRefs };
  },
  renewNode: async ({ goal, graph, node, actor }) => {
    if (node.execution_target !== 'local') throw new Error('WORK_GRAPH_REMOTE_AUTHORITY_RENEWAL_REQUIRES_PEER_CONFIRMATION');
    if (!node.passport_id || !node.workplace_assignment_id || !node.project_assignment_id) throw new Error('WORK_GRAPH_LOCAL_AUTHORITY_INCOMPLETE');
    const identity = await agentIdentityService.getState();
    const binding = identity.bindings.find((item) => item.binding_id === node.runtime_binding_id && item.agent_id === node.agent_id && item.connection_state === 'connected');
    const session = identity.runtimeSessions?.find((item) => item.runtime_session_id === binding?.live_session_id && item.passport_id === node.passport_id && ['ready', 'working'].includes(item.state));
    const attestation = identity.attestations?.find((item) => item.attestation_id === session?.runtime_attestation_id && new Date(item.expires_at).getTime() > Date.now());
    if (!binding || !session || !attestation) throw new Error('WORK_GRAPH_AGENT_RUNTIME_NOT_READY');

    const durationSeconds = Math.max(60, node.mandate_scope.duration_seconds ?? 7200);
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    const humanAuthority = { organizationId: goal.organization_id, membershipId: actor.membership_id, humanProofId: actor.human_proof_id, authorityCredentialId: actor.authority_credential_id };
    const beforeMandates = new Set((await mandateService.getState()).mandates.map((item) => item.mandateId));
    const mandateState = await mandateService.create({
      agentId: node.agent_id,
      objective: node.objective,
      resources: node.mandate_scope.resources,
      actions: node.mandate_scope.actions,
      prohibitedActions: ['credential.read', 'human-proof.read', 'authority.bypass'],
      limits: { maxDurationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)), parameterEquals: { project_id: goal.project_id, graph_id: graph.graph_id, node_id: node.node_id } },
      allowedFields: node.allowed_context_fields,
      approvalActions: node.approval_policy_ids.length ? node.mandate_scope.actions : [],
      delegation: { allowed: false, allowedAgentIds: [], maxDepth: 0 },
      expiresAt,
      humanAuthority
    });
    const mandate = mandateState.mandates.find((item) => !beforeMandates.has(item.mandateId) && item.subject.agentId === node.agent_id && item.objective === node.objective);
    if (!mandate) throw new Error('WORK_GRAPH_REPLACEMENT_MANDATE_NOT_PERSISTED');

    let collaboration = await collaborationService.rebindAssignmentAuthority({ assignmentId: node.workplace_assignment_id, agentId: node.runtime_binding_id, mandateId: mandate.mandateId });
    const workplaceAssignment = collaboration.workplace.assignments.find((item) => item.id === node.workplace_assignment_id);
    if (!workplaceAssignment) throw new Error('WORK_GRAPH_WORKPLACE_ASSIGNMENT_MISSING');
    if (workplaceAssignment.status !== 'active') collaboration = await collaborationService.updateAssignment({ assignmentId: workplaceAssignment.id, status: 'active' });

    let project = await projectDeliveryRepository.read();
    const replacedProjectAssignment = project.assignments.find((item) => item.assignment_id === node.project_assignment_id);
    if (!replacedProjectAssignment) throw new Error('WORK_GRAPH_PROJECT_ASSIGNMENT_MISSING');
    const dependencyAssignments = graph.dependency_edges.filter((edge) => edge.successor_node_id === node.node_id)
      .map((edge) => graph.nodes.find((item) => item.node_id === edge.predecessor_node_id)?.project_assignment_id)
      .filter((value): value is string => Boolean(value));
    const beforeAssignments = new Set(project.assignments.map((item) => item.assignment_id));
    project = await projectTaskCoordinator.createAssignment({
      goal_id: replacedProjectAssignment.goal_id,
      project_id: replacedProjectAssignment.project_id,
      title: replacedProjectAssignment.title,
      objective: replacedProjectAssignment.objective,
      output_contract: replacedProjectAssignment.output_contract,
      tool_contract: replacedProjectAssignment.tool_contract,
      allowed_paths: replacedProjectAssignment.allowed_paths,
      network_hosts: replacedProjectAssignment.network_hosts,
      validation_commands: replacedProjectAssignment.validation_commands,
      depends_on: dependencyAssignments,
      agent_id: node.runtime_binding_id,
      passport_id: node.passport_id,
      runtime_session_id: session.runtime_session_id,
      mandate_id: mandate.mandateId,
      provider: node.provider,
      kind: replacedProjectAssignment.kind
    });
    const replacementProjectAssignment = project.assignments.find((item) => !beforeAssignments.has(item.assignment_id) && item.mandate_id === mandate.mandateId);
    if (!replacementProjectAssignment) throw new Error('WORK_GRAPH_REPLACEMENT_ASSIGNMENT_NOT_PERSISTED');

    let worktreeLeaseId: string | null = null;
    if (replacementProjectAssignment.kind === 'edit') {
      project = await worktreeLeaseService.create(replacementProjectAssignment.assignment_id);
      worktreeLeaseId = project.worktrees.find((item) => item.assignment_id === replacementProjectAssignment.assignment_id && item.status !== 'cleaned')?.lease_id ?? null;
    }

    let contextGrantId: string | null = null;
    if (node.allowed_context_fields.length > 0) {
      const context = await contextBrokerService.getState();
      const rules = node.allowed_context_fields.map((field) => {
        const artifact = context.artifacts.find((item) => item.organization_id === goal.organization_id && item.status === 'active' && item.fields.some((candidate) => candidate.field === field));
        const artifactField = artifact?.fields.find((candidate) => candidate.field === field);
        if (!artifact || !artifactField) throw new Error(`WORK_GRAPH_CONTEXT_ARTIFACT_MISSING:${field}`);
        return { artifact_id: artifact.artifact_id, field, maximum_classification: artifactField.classification, transformation: 'reference' as const };
      });
      const grants = await contextBrokerService.issueGrant({ actor, organization_id: goal.organization_id, task_id: node.workplace_assignment_id, mandate_id: mandate.mandateId, recipient_agent_id: node.agent_id, recipient_passport_id: node.passport_id, purpose: node.objective, field_rules: rules, token_budget: 1000, maximum_uses: 10, expires_at: expiresAt });
      contextGrantId = [...grants.grants].reverse().find((item) => item.grant.task_id === node.workplace_assignment_id && item.grant.mandate_id === mandate.mandateId)?.grant.context_grant_id ?? null;
    }

    project = await projectTaskCoordinator.message({
      project_id: goal.project_id,
      goal_id: replacementProjectAssignment.goal_id,
      assignment_id: replacementProjectAssignment.assignment_id,
      from_agent_id: node.runtime_binding_id,
      to_assignment_id: null,
      kind: 'proposal',
      subject: `Renewed exact-scope route for ${node.title}`,
      references: [node.passport_id, session.runtime_session_id, mandate.mandateId, ...(contextGrantId ? [contextGrantId] : [])],
      body: JSON.stringify({ graph_id: graph.graph_id, node_id: node.node_id, replaced_mandate_id: node.mandate_id, replaced_project_assignment_id: node.project_assignment_id, protected_values: 'excluded' })
    });
    const mailbox = [...project.messages].reverse().find((item) => item.assignment_id === replacementProjectAssignment.assignment_id);
    return {
      passport_id: node.passport_id,
      runtime_session_id: session.runtime_session_id,
      mandate_id: mandate.mandateId,
      context_grant_id: contextGrantId,
      project_assignment_id: replacementProjectAssignment.assignment_id,
      workplace_assignment_id: node.workplace_assignment_id,
      worktree_lease_id: worktreeLeaseId,
      mailbox_route_id: mailbox?.message_id ?? `mailbox_${node.node_id}`,
      evidence_refs: [],
      mandate_expires_at: expiresAt,
      replaced_mandate_id: node.mandate_id ?? 'unavailable',
      replaced_project_assignment_id: node.project_assignment_id
    };
  },
  runNode: async ({ goal, graph, node, actor }) => {
    if (!node.project_assignment_id) throw new Error('WORK_GRAPH_PROJECT_ASSIGNMENT_MISSING');
    if (node.execution_target === 'paired-node') {
      if (!actor) throw new Error('Fresh Human Proof is required to dispatch paired-node work.');
      if (!node.remote_peer_id || !node.passport_id || !node.runtime_attestation_id || !node.mandate_id || !node.context_grant_id) throw new Error('WORK_GRAPH_REMOTE_AUTHORITY_INCOMPLETE');
      const ceremony = await activeWorkGraphCeremony(goal.goal_id, node.node_id, 'dispatch');
      if (!ceremony) throw new Error('WORK_GRAPH_ACTIVE_CEREMONY_REQUIRED');
      const dependencyTaskIds = graph.dependency_edges.filter((edge) => edge.successor_node_id === node.node_id).map((edge) => graph.nodes.find((item) => item.node_id === edge.predecessor_node_id)?.project_assignment_id).filter((value): value is string => Boolean(value));
      const dispatched = await federationOperatorCoordinator.dispatchWorkGraphTask({
        actor,
        organization_id: goal.organization_id,
        peer_id: node.remote_peer_id,
        ceremony_id: ceremony.ceremony_id,
        trace_id: ceremony.trace_id,
        task_id: node.project_assignment_id,
        requestor_human_id: goal.created_by_human_id,
        assigned_agent_id: node.agent_id,
        passport_id: node.passport_id,
        runtime_attestation_id: node.runtime_attestation_id,
        mandate_id: node.mandate_id,
        context_grant_id: node.context_grant_id,
        objective: node.objective,
        dependency_task_ids: dependencyTaskIds,
        output_contract: { expected_outputs: node.expected_outputs, validation_commands: node.validation_commands, predecessor_evidence_refs: graph.dependency_edges.filter((edge) => edge.successor_node_id === node.node_id).flatMap((edge) => graph.nodes.find((item) => item.node_id === edge.predecessor_node_id)?.evidence_refs ?? []), protected_values: 'excluded' },
        idempotency_key: ceremony.idempotency_key,
        expires_at: node.mandate_expires_at
      });
      return { status: 'waiting', reason_code: 'REMOTE_TASK_ACCEPTED_WAITING_FOR_SIGNED_RESULT', evidence_refs: dispatched.evidenceRefs };
    }
    const deliveryState = await projectDeliveryRepository.read();
    const deliveryAssignment = deliveryState.assignments.find((item) => item.assignment_id === node.project_assignment_id);
    if (!deliveryAssignment) throw new Error('WORK_GRAPH_PROJECT_ASSIGNMENT_MISSING');
    if (!node.workplace_assignment_id || !node.mandate_id || !node.passport_id) throw new Error('WORK_GRAPH_LOCAL_AUTHORITY_INCOMPLETE');
    const [mandates, initialCollaboration] = await Promise.all([mandateService.getState(), collaborationService.getState()]);
    const exactMandate = mandates.mandates.find((item) => item.mandateId === node.mandate_id && item.subject.agentId === node.agent_id && item.subject.passportId === node.passport_id && item.status === 'active' && new Date(item.expiresAt).getTime() > Date.now());
    if (!exactMandate) throw new Error('WORK_GRAPH_AUTHORITY_EXPIRED');
    let workplaceAssignment = initialCollaboration.workplace.assignments.find((item) => item.id === node.workplace_assignment_id);
    if (!workplaceAssignment || workplaceAssignment.assigneeId !== node.runtime_binding_id || workplaceAssignment.title !== deliveryAssignment.title) throw new Error('WORK_GRAPH_WORKPLACE_ASSIGNMENT_MISMATCH');
    if (workplaceAssignment.mandateId !== node.mandate_id) {
      const rebound = await collaborationService.rebindAssignmentAuthority({ assignmentId: workplaceAssignment.id, agentId: node.runtime_binding_id, mandateId: node.mandate_id });
      workplaceAssignment = rebound.workplace.assignments.find((item) => item.id === node.workplace_assignment_id);
    }
    if (!workplaceAssignment || workplaceAssignment.mandateId !== node.mandate_id) throw new Error('WORK_GRAPH_AUTHORITY_RECONCILIATION_FAILED');
    if (workplaceAssignment.status !== 'active') await collaborationService.updateAssignment({ assignmentId: workplaceAssignment.id, status: 'active' });
    if (deliveryAssignment.kind === 'research') {
      const host = deliveryAssignment.network_hosts[0];
      if (!host) throw new Error('WORK_GRAPH_RESEARCH_SOURCE_REQUIRED');
      const researched = await researchConnectorService.fetch({ assignment_id: deliveryAssignment.assignment_id, url: `https://${host}/`, classification: 'public' });
      const source = [...researched.sources].reverse().find((item) => item.assignment_id === deliveryAssignment.assignment_id);
      if (!source) throw new Error('WORK_GRAPH_RESEARCH_SOURCE_NOT_PERSISTED');
      await collaborationService.updateAssignment({ assignmentId: workplaceAssignment.id, status: 'complete' });
      return { status: 'succeeded', reason_code: 'GOVERNED_RESEARCH_SOURCE_PERSISTED', output_ref: `research-source:${source.source_id}`, output_hash: source.content_hash, evidence_refs: [source.source_id] };
    }
    const project = await projectProviderExecutionService.run({ assignment_id: node.project_assignment_id });
    const run = [...project.runs].reverse().find((item) => item.assignment_id === node.project_assignment_id);
    if (!run) throw new Error('Project provider run was not persisted.');
    await collaborationService.updateAssignment({ assignmentId: workplaceAssignment.id, status: run.status === 'succeeded' ? 'complete' : 'blocked' });
    return { status: run.status === 'succeeded' ? 'succeeded' : run.status === 'running' ? 'running' : 'failed', reason_code: run.reason_code, output_ref: `project-run:${run.run_id}`, output_hash: run.output_hash, evidence_refs: [run.run_id] };
  },
  recoverNode: async ({ node }) => {
    if (node.execution_target === 'paired-node') {
      const federation = await federationService.getState();
      const completed = federation.receipts.find((receipt) => receipt.decision === 'accepted'
        && receipt.payload_type === 'ack'
        && receipt.acknowledgement_status === 'completed'
        && Boolean(receipt.acknowledged_envelope_id && node.evidence_refs.includes(receipt.acknowledged_envelope_id))
        && Boolean(receipt.output_hash));
      if (!completed) return null;
      return {
        status: 'succeeded' as const,
        reason_code: 'REMOTE_SIGNED_RESULT_ACCEPTED',
        output_ref: completed.output_ref ?? `federation-receipt:${completed.receipt_id}`,
        output_hash: completed.output_hash ?? null,
        evidence_refs: [completed.receipt_id, completed.envelope_id]
      };
    }
    if (!node.project_assignment_id) return null;
    const project = await projectDeliveryRepository.read();
    const researchSource = [...project.sources].reverse().find((item) => item.assignment_id === node.project_assignment_id);
    if (researchSource) return {
      status: 'succeeded' as const,
      reason_code: 'GOVERNED_RESEARCH_SOURCE_RECOVERED',
      output_ref: `research-source:${researchSource.source_id}`,
      output_hash: researchSource.content_hash,
      evidence_refs: [researchSource.source_id]
    };
    const run = [...project.runs].reverse().find((item) => item.assignment_id === node.project_assignment_id);
    if (!run || run.status === 'running') return null;
    return {
      status: run.status === 'succeeded' ? 'succeeded' as const : 'failed' as const,
      reason_code: run.reason_code ?? (run.status === 'succeeded' ? 'LOCAL_RESULT_RECOVERED' : 'LOCAL_PROVIDER_FAILED'),
      output_ref: `project-run:${run.run_id}`,
      output_hash: run.output_hash,
      evidence_refs: [run.run_id]
    };
  },
  cancelNode: async ({ node }) => {
    if (node.execution_target !== 'local') throw new Error('REMOTE_CONTAINMENT_UNAVAILABLE: no signed receiver cancellation receipt; remote execution is not confirmed stopped.');
    if (!node.project_assignment_id) return [];
    const project = await projectDeliveryRepository.read();
    const running = [...project.runs].reverse().find((item) => item.assignment_id === node.project_assignment_id && item.status === 'running');
    if (running) await projectProviderExecutionService.cancel({ run_id: running.run_id, reason: 'Operator cancelled the approved work-graph assignment.' });
    if (node.execution_target === 'local' && node.workplace_assignment_id) await collaborationService.updateAssignment({ assignmentId: node.workplace_assignment_id, status: 'blocked' });
    return running ? [running.run_id] : [];
  },
  revokeNode: async ({ node, actor }) => {
    if (node.execution_target !== 'local') throw new Error('REMOTE_CONTAINMENT_UNAVAILABLE: no signed receiver revocation receipt; remote execution is not confirmed stopped.');
    if (!actor || !node.mandate_id) throw new Error('Fresh Human Proof is required to revoke exact work-graph authority.');
    if (node.execution_target === 'local') {
      await mandateService.updateLifecycle({ mandateId: node.mandate_id, action: 'revoke', humanAuthority: { organizationId: (await organizationAuthorityService.getState()).memberships.find((item) => item.membership_id === actor.membership_id)?.organization_id ?? '', membershipId: actor.membership_id, humanProofId: actor.human_proof_id, authorityCredentialId: actor.authority_credential_id } });
    }
    const event = await evidenceLedger.append({ trace_id: `tr_work_graph_revoke_${node.node_id}`, actor: { type: 'human', id: actor.membership_id }, subject: { type: 'mandate', id: node.mandate_id }, mandate_id: node.mandate_id, event_type: 'MANDATE_REVOKED', payload: { node_id: node.node_id, execution_target: node.execution_target, remote_peer_id: node.remote_peer_id } });
    return [event.event_id];
  }
});
const enterpriseObservabilityService = new EnterpriseObservabilityService(evidenceLedger, {
  organization: organizationAuthorityService,
  humans: humanIdentityV2Service,
  agents: agentIdentityService,
  collaboration: collaborationService,
  mandates: mandateService,
  approvals: multiHumanApprovalService,
  context: contextBrokerService,
  connectors: frameworkConnectorService,
  live: processSupervisor,
  federation: federationService
});
const evidenceAuditService = new EvidenceAuditService(dataPath, evidenceLedger, repository);
evidenceAuditService.setEnterpriseOverviewProvider(enterpriseObservabilityService);
const finalAcceptanceService = new FinalAcceptanceService(dataPath, evidenceLedger, {
  humans: humanIdentityV2Service,
  organization: organizationAuthorityService,
  agents: agentIdentityService,
  approvals: multiHumanApprovalService,
  context: contextBrokerService,
  connectors: frameworkConnectorService,
  live: processSupervisor,
  enterprise: enterpriseObservabilityService,
  config: featureConfigRepository,
  signer: organizationAuthorityService
});
const ceremonyCoordinator = new CeremonyCoordinator(dataPath, evidenceLedger, {
  humans: humanIdentityV2Service,
  organization: organizationAuthorityService,
  agents: agentIdentityService,
  mandates: mandateService,
  approvals: multiHumanApprovalService,
  context: contextBrokerService,
  connectorProtocol: messageBroker,
  frameworks: frameworkConnectorService,
  live: processSupervisor,
  federation: federationService
});
async function activeWorkGraphCeremony(goalId: string, nodeId: string, action: string): Promise<CeremonyCorrelation | undefined> {
  const state = await ceremonyCoordinator.getState();
  const session = state.sessions.find((item) => item.ceremony_id === state.active_ceremony_id && item.status === 'active');
  if (!session) return undefined;
  return {
    ceremony_id: session.ceremony_id,
    trace_id: session.trace_id,
    idempotency_key: `phase49-${action}-${goalId}-${nodeId}`.slice(0, 200)
  };
}
const guidedBootstrapCoordinator = new GuidedBootstrapCoordinator(dataPath, evidenceLedger, {
  humans: humanIdentityV2Service,
  acceptance: finalAcceptanceService,
  organization: organizationAuthorityService,
  agents: agentIdentityService,
  mandates: mandateService,
  collaboration: collaborationService,
  ceremony: ceremonyCoordinator
}, appRoot);
const realCollaborationCoordinator = new RealCollaborationCoordinator(dataPath, evidenceLedger, {
  bootstrap: guidedBootstrapCoordinator,
  humans: humanIdentityV2Service,
  organization: organizationAuthorityService,
  ceremony: ceremonyCoordinator,
  agents: agentIdentityService,
  mandates: mandateService,
  collaboration: collaborationService,
  runtime: processSupervisor,
  frameworks: frameworkConnectorService
}, appRoot);
const leastContextCoordinator = new LeastContextCoordinator(dataPath, evidenceLedger, {
  bootstrap: guidedBootstrapCoordinator,
  realCollaboration: realCollaborationCoordinator,
  agents: agentIdentityService,
  organization: organizationAuthorityService,
  ceremony: ceremonyCoordinator,
  context: contextBrokerService,
  connectors: connectorRegistry,
  messages: messageBroker
}, {
  seal: async (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system Phase 27 key encryption is unavailable.');
    return safeStorage.encryptString(value).toString('base64');
  },
  open: async (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system Phase 27 key encryption is unavailable.');
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  }
}, appRoot);
const federationOperatorCoordinator = new FederationOperatorCoordinator(dataPath, evidenceLedger, {
  federation: federationService,
  authority: organizationAuthorityService,
  organization: organizationAuthorityService,
  agents: agentIdentityService,
  leastContext: leastContextCoordinator,
  context: contextBrokerService
});
humanEscalationCoordinator = new HumanEscalationCoordinator(dataPath, evidenceLedger, {
  leastContext: leastContextCoordinator,
  ceremony: ceremonyCoordinator,
  humans: humanIdentityV2Service,
  organization: organizationAuthorityService,
  approvals: multiHumanApprovalService,
  agents: agentIdentityService,
  mandates: mandateService,
  collaboration: collaborationService,
  context: contextBrokerService,
  runtime: processSupervisor
}, appRoot);
const securityValidationCoordinator = new SecurityValidationCoordinator(evidenceLedger, {
  ceremony: ceremonyCoordinator,
  acceptance: finalAcceptanceService,
  collaboration: realCollaborationCoordinator,
  mandates: mandateService,
  approvals: multiHumanApprovalService,
  context: contextBrokerService,
  federation: federationService,
  runtime: processSupervisor
});
const demonstrationConductorService = new DemonstrationConductorService(dataPath, evidenceLedger, {
  acceptance: finalAcceptanceService,
  ceremony: ceremonyCoordinator,
  requireLiveness: async () => {
    const current = await featureConfigRepository.get();
    if (current.livenessMode !== 'required') await featureConfigRepository.set({ ...current, livenessMode: 'required' });
  }
});

async function loadSystemStatus(): Promise<SystemStatus> {
  const [config, evidence] = await Promise.all([featureConfigRepository.get(), evidenceLedger.verify()]);
  return systemStatusSchema.parse({
    appVersion: app.getVersion(),
    ...config,
    evidenceIntegrity: evidence.status,
    evidenceRecords: evidence.recordCount,
    evidenceHeadHash: evidence.headHash,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    dataPath: repository.dataPath
  });
}

const readinessProjectionService = new ReadinessProjectionService();

function sameRepairBaseline(expected: OperatorReadiness, current: OperatorReadiness): boolean {
  const lifecycleStatus = (status: string) => ['expiring', 'expired'].includes(status) ? 'non-ready-lifecycle' : status;
  const baseline = (value: OperatorReadiness) => value.prerequisites
    .filter((item) => item.kind !== 'human-proof')
    .map((item) => ({ kind: item.kind, reference: item.canonical_reference_id, status: lifecycleStatus(item.status), expiry: item.expires_at, scope: item.scope_hash }));
  return JSON.stringify(baseline(expected)) === JSON.stringify(baseline(current));
}

async function activeRepairCeremony(commandId: string, generationHash: string, expectedReadiness: OperatorReadiness): Promise<{ ceremony: CeremonyCorrelation; commandLabel: string; laneId: 'claude-code' | 'gemini-antigravity' | 'framework' | 'openai-codex' }> {
  const ceremonyState = await ceremonyCoordinator.getState();
  const session = ceremonyState.sessions.find((item) => item.ceremony_id === ceremonyState.active_ceremony_id && item.status === 'active');
  if (!session) throw new Error('READINESS_ACTIVE_CEREMONY_REQUIRED');
  const [system, collaboration, agentIdentity, mandates, organization, approvals, scenarios, evidence, contextBroker, federation, enterprise, finalAcceptance, guidedBootstrap, projectDelivery, realCollaboration, leastContext, humanEscalation, federationOperator, runtimeAttachment] = await Promise.all([
    loadSystemStatus(), collaborationService.getState(), agentIdentityService.getState(), mandateService.getState(), organizationAuthorityService.getState(),
    multiHumanApprovalService.getState(), scenarioService.getState(), evidenceAuditService.getState(defaultEvidenceQuery), contextBrokerService.getState(),
    federationService.getState(), enterpriseObservabilityService.getState(), finalAcceptanceService.getState(), guidedBootstrapCoordinator.getState(),
    projectWorkspaceService.getState(), realCollaborationCoordinator.getState(), leastContextCoordinator.getState(), humanEscalationCoordinator.getState(),
    federationOperatorCoordinator.getState(), runtimeAttachmentService.getState()
  ]);
  const canonical = { system, collaboration, agent_identity: agentIdentity, mandates, organization, approvals, scenarios, evidence, context_broker: contextBroker, federation, enterprise, final_acceptance: finalAcceptance, ceremony: ceremonyState, guided_bootstrap: guidedBootstrap, project_delivery: projectDelivery, real_collaboration: realCollaboration, least_context: leastContext, human_escalation: humanEscalation, federation_operator: federationOperator, runtime_attachment: runtimeAttachment };
  const readiness = readinessProjectionService.project({ canonical, connection: { status: 'connected', read_only: false } });
  const command = readiness.commands.find((item) => item.command_id === commandId);
  if (!command || expectedReadiness.generation_hash !== generationHash || !sameRepairBaseline(expectedReadiness, command)) throw new Error('READINESS_GENERATION_STALE');
  const laneId = commandId.split('.')[1];
  if (!['claude-code', 'gemini-antigravity', 'framework', 'openai-codex'].includes(laneId ?? '')) throw new Error('READINESS_COMMAND_NOT_REPAIRABLE');
  return { ceremony: { ceremony_id: session.ceremony_id, trace_id: session.trace_id, idempotency_key: `phase46_${generationHash.slice(7, 23)}` }, commandLabel: command.command_label, laneId: laneId as 'claude-code' | 'gemini-antigravity' | 'framework' | 'openai-codex' };
}

async function repairCanonicalCommand(commandId: string, generationHash: string, expectedReadiness: OperatorReadiness): Promise<void> {
  if (!commandId.startsWith('phase26.') && !commandId.startsWith('phase27.')) throw new Error('READINESS_COMMAND_REQUIRES_EXTERNAL_REMEDIATION');
  const context = await activeRepairCeremony(commandId, generationHash, expectedReadiness);
  const [humans, organization, real, identity] = await Promise.all([
    humanIdentityV2Service.getState(), organizationAuthorityService.getState(),
    realCollaborationCoordinator.getState(), agentIdentityService.getState()
  ]);
  const lane = real.lanes.find((item) => item.lane_id === context.laneId);
  const passport = identity.passportsV2?.find((item) => item.passport_id === lane?.passport_id);
  if (!lane || !passport || passport.status !== 'active' || new Date(passport.expires_at).getTime() <= Date.now()) throw new Error('READINESS_PASSPORT_REPLACEMENT_REQUIRES_OPERATOR');
  const sponsor = passport.sponsor_human_id;
  const proofPurpose = `repair prerequisites for ${context.commandLabel}`;
  const proof = humans.active_proofs.find((item) => item.human_id === sponsor && item.purpose === proofPurpose && new Date(item.expires_at).getTime() > Date.now());
  if (!proof) throw new Error(`READINESS_FRESH_PROOF_REQUIRED:${sponsor}:${proofPurpose}`);
  const membership = organization.memberships.find((item) => item.human_id === sponsor && item.status === 'active');
  if (!membership) throw new Error('READINESS_MEMBERSHIP_INACTIVE');
  let credential = organization.credentials.find((item) => item.membership_id === membership.membership_id && item.status === 'active' && new Date(item.expires_at).getTime() > Date.now());
  if (!credential) {
    const prior = [...organization.credentials].reverse().find((item) => item.membership_id === membership.membership_id && item.status === 'expired');
    if (!prior) throw new Error('READINESS_EXPIRED_CREDENTIAL_TEMPLATE_REQUIRED');
    const durationMs = Math.min(new Date(prior.expires_at).getTime() - new Date(prior.issued_at).getTime(), 120 * 60_000);
    const repaired = await organizationAuthorityService.repairCredentialExactScope({
      organization_id: membership.organization_id, membership_id: membership.membership_id, human_proof_id: proof.human_proof_id,
      replaces_credential_id: prior.credential_id, proof_purpose: proofPurpose, command_id: commandId,
      expires_at: new Date(Date.now() + durationMs).toISOString(), ceremony: { ...context.ceremony, idempotency_key: `${context.ceremony.idempotency_key}_credential` }
    });
    credential = repaired.credentials.find((item) => item.membership_id === membership.membership_id && item.status === 'active');
  }
  if (!credential) throw new Error('READINESS_CREDENTIAL_REPAIR_FAILED');

  const session = identity.runtimeSessions?.find((item) => item.runtime_session_id === lane.runtime_session_id);
  const attestation = identity.attestations?.find((item) => item.attestation_id === session?.runtime_attestation_id);
  const binding = identity.bindings.find((item) => item.binding_id === lane.binding_id);
  const attestationNeedsRepair = !session || !['ready', 'working'].includes(session.state) || !attestation || new Date(attestation.expires_at).getTime() <= Date.now() + 10 * 60_000;
  if (attestationNeedsRepair) {
    if (!binding) throw new Error('READINESS_RUNTIME_BINDING_REQUIRED');
    const replacedRuntimeSessionId = binding.live_session_id ?? session?.runtime_session_id;
    const originalDuration = attestation ? new Date(attestation.expires_at).getTime() - new Date(attestation.issued_at).getTime() : 120 * 60_000;
    const expiry = new Date(Math.min(new Date(passport.expires_at).getTime(), Date.now() + Math.min(originalDuration, 120 * 60_000))).toISOString();
    await agentIdentityService.attestRuntime({
      passportId: passport.passport_id, bindingId: binding.binding_id, connectorManifestId: passport.connector_manifest_id,
      adapterVersion: attestation?.adapter_version ?? 'h2a-local-v1', trustMode: attestation?.trust_mode ?? 'connected-observed',
      trustEvidenceRefs: attestation?.trust_evidence_refs ?? [], executableHash: attestation?.executable_hash, expiresAt: expiry,
      ceremony: { ...context.ceremony, idempotency_key: `${context.ceremony.idempotency_key}_attestation_${context.laneId}` }
    });
    if (replacedRuntimeSessionId) await Promise.all([
      processSupervisor.revokeSession(replacedRuntimeSessionId, 'RUNTIME_SESSION_ROTATED'),
      runtimeAttachmentService.revokeSession(replacedRuntimeSessionId)
    ]);
  }

  await realCollaborationCoordinator.replaceAuthority({
    ceremony: { ...context.ceremony, idempotency_key: `${context.ceremony.idempotency_key}_authority` },
    human_proof_id: proof.human_proof_id,
    proof_purpose: proofPurpose
  });
  if (commandId.startsWith('phase27.')) {
    await leastContextCoordinator.renewGrant({
      actor: { membership_id: membership.membership_id, human_proof_id: proof.human_proof_id, authority_credential_id: credential.credential_id },
      lane_id: context.laneId,
      ceremony: { ...context.ceremony, idempotency_key: `${context.ceremony.idempotency_key}_grant_${context.laneId}` }
    });
  }
}

const controlPlaneHost = new H2AControlPlaneHost({
  load: async () => {
    const [
      system, collaboration, agentIdentity, mandates, organization, approvals, scenarios,
      evidence, contextBroker, federation, enterprise, finalAcceptance, ceremony, guidedBootstrap, projectDelivery,
      realCollaboration, leastContext, humanEscalation, federationOperator, runtimeAttachment, goalWorkGraph, demonstrationConductor
    ] = await Promise.all([
      loadSystemStatus(),
      collaborationService.getState(),
      agentIdentityService.getState(),
      mandateService.getState(),
      organizationAuthorityService.getState(),
      multiHumanApprovalService.getState(),
      scenarioService.getState(),
      evidenceAuditService.getState(defaultEvidenceQuery),
      contextBrokerService.getState(),
      federationService.getState(),
      enterpriseObservabilityService.getState(),
      finalAcceptanceService.getState(),
      ceremonyCoordinator.getState(),
      guidedBootstrapCoordinator.getState(),
      projectWorkspaceService.getState(),
      realCollaborationCoordinator.getState(),
      leastContextCoordinator.getState(),
      humanEscalationCoordinator.getState(),
      federationOperatorCoordinator.getState(),
      runtimeAttachmentService.getState(),
      goalWorkGraphCoordinator.getState(),
      demonstrationConductorService.getState()
    ]);
    return {
      system,
      collaboration,
      agent_identity: agentIdentity,
      mandates,
      organization,
      approvals,
      scenarios,
      evidence,
      context_broker: contextBroker,
      federation,
      enterprise,
      final_acceptance: finalAcceptance,
      ceremony,
      guided_bootstrap: guidedBootstrap,
      project_delivery: projectDelivery,
      real_collaboration: realCollaboration,
      least_context: leastContext,
      human_escalation: humanEscalation,
      federation_operator: federationOperator,
      runtime_attachment: runtimeAttachment,
      goal_work_graph: goalWorkGraph,
      demonstration_conductor: demonstrationConductor
    };
  }
}, appearancePreferencesRepository, {
  workflowExecutor: {
    execute: async (operationKey: string): Promise<void> => {
      if (!['set-up-people:confirm-separation', 'prepare-hp-demonstration:assess-prerequisites'].includes(operationKey)) {
        throw new Error(`WORKFLOW_OPERATION_NOT_ALLOWLISTED:${operationKey}`);
      }
      const state = await ceremonyCoordinator.getState();
      const active = state.sessions.find((session) => session.ceremony_id === state.active_ceremony_id);
      if (!active) throw new Error('WORKFLOW_ACTIVE_CEREMONY_REQUIRED');
      await ceremonyCoordinator.runStep({
        ceremony_id: active.ceremony_id,
        step_id: 'prerequisites-assessed',
        idempotency_key: `phase38_prerequisites_${active.ceremony_id}`
      });
    }
  },
  humanProofResolver: {
    resolve: async (proofId: string) => {
      const state = await humanIdentityV2Service.getState();
      const proof = state.active_proofs.find((item) => item.human_proof_id === proofId);
      return proof ? {
        proof_id: proof.human_proof_id,
        human_id: proof.human_id,
        purpose: proof.purpose,
        verified_at: proof.verified_at,
        expires_at: proof.expires_at
      } : null;
    }
  },
  repairExecutor: { execute: repairCanonicalCommand }
});

const CONTROL_PLANE_REFRESH_DEBOUNCE_MS = 75;
const CONTROL_PLANE_SAFETY_REFRESH_MS = 15_000;
let controlPlaneWatcher: FSWatcher | undefined;
let controlPlaneRefreshTimer: NodeJS.Timeout | undefined;
let controlPlaneSafetyPoll: NodeJS.Timeout | undefined;
let controlPlaneRefreshRunning = false;
let controlPlaneRefreshPending = false;

function scheduleControlPlaneRefresh(): void {
  controlPlaneRefreshPending = true;
  if (controlPlaneRefreshTimer) clearTimeout(controlPlaneRefreshTimer);
  controlPlaneRefreshTimer = setTimeout(() => { void flushControlPlaneRefresh(); }, CONTROL_PLANE_REFRESH_DEBOUNCE_MS);
  controlPlaneRefreshTimer.unref();
}

async function flushControlPlaneRefresh(): Promise<void> {
  controlPlaneRefreshTimer = undefined;
  if (controlPlaneRefreshRunning) return;
  controlPlaneRefreshRunning = true;
  try {
    while (controlPlaneRefreshPending) {
      controlPlaneRefreshPending = false;
      await controlPlaneHost.refresh('local-data-change');
    }
  } catch (error) {
    diagnostics.error('Control-plane refresh failed.', error);
  } finally {
    controlPlaneRefreshRunning = false;
    if (controlPlaneRefreshPending) scheduleControlPlaneRefresh();
  }
}

function startControlPlaneRefreshFeed(): void {
  try {
    controlPlaneWatcher = watch(dataPath, { recursive: true }, (_eventType, filename) => {
      const changedPath = filename?.toString().replaceAll('\\', '/');
      if (changedPath?.split('/').includes('.electron-user-data')) return;
      scheduleControlPlaneRefresh();
    });
    controlPlaneWatcher.on('error', (error) => diagnostics.error('Control-plane data watcher failed; safety reconciliation remains active.', error));
  } catch (error) {
    diagnostics.error('Control-plane data watcher is unavailable; safety reconciliation remains active.', error);
  }
  controlPlaneSafetyPoll = setInterval(scheduleControlPlaneRefresh, CONTROL_PLANE_SAFETY_REFRESH_MS);
  controlPlaneSafetyPoll.unref();
}

async function bindCeremony<T extends { ceremony?: CeremonyCorrelation }>(input: T): Promise<T> {
  if (input.ceremony) await ceremonyCoordinator.assertBinding(input.ceremony.ceremony_id, input.ceremony.trace_id);
  return input;
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#f4f6f8',
    title: nodeWindowLabel ? `H2A Command Floor - Node ${nodeWindowLabel}` : 'H2A Command Floor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (nodeWindowLabel) window.on('page-title-updated', (event) => { event.preventDefault(); window.setTitle(`H2A Command Floor - Node ${nodeWindowLabel}`); });
  const senderId = window.webContents.id;
  window.webContents.on('destroyed', () => { employeeWorkspaceService.logout(senderId); firstAdministratorSetup.forget(senderId); });
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) { employeeWorkspaceService.logout(senderId); firstAdministratorSetup.forget(senderId); }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const requester = webContents.getURL();
    const trusted = requester.startsWith('file:') || requester.startsWith('http://localhost:') || requester.startsWith('http://127.0.0.1:');
    callback(permission === 'media' && trusted);
  });

  window.webContents.on('will-navigate', (event, url) => {
    const currentUrl = window.webContents.getURL();
    if (currentUrl && url !== currentUrl) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  function trustedSender(event: IpcMainInvokeEvent): number {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error('WORKSPACE_SENDER_DENIED');
    const url = new URL(event.senderFrame.url);
    const development = process.env.ELECTRON_RENDERER_URL;
    if (development ? url.origin !== new URL(development).origin : url.protocol !== 'file:' || decodeURIComponent(url.pathname).replace(/^\//, '').replaceAll('/', '\\').toLowerCase() !== join(__dirname, '../renderer/index.html').toLowerCase()) throw new Error('WORKSPACE_ORIGIN_DENIED');
    return event.sender.id;
  }
  const ipcMain = {
    handle: (channel: string, handler: Parameters<typeof electronIpcMain.handle>[1]): void => {
      electronIpcMain.handle(channel, async (event, ...args: unknown[]) => {
        return employeeWorkspaceService.administratorCommand(trustedSender(event), () => handler(event, ...args), channel);
      });
    }
  };
  electronIpcMain.handle('employee-workspace:setup-status', async event => { trustedSender(event); return { available: await firstAdministratorSetup.available(), liveness_mode: (await featureConfigRepository.get()).livenessMode }; });
  electronIpcMain.handle('employee-workspace:setup-identity', event => { trustedSender(event); return firstAdministratorSetup.state(); });
  electronIpcMain.handle('employee-workspace:setup-enroll', (event, request) => { trustedSender(event); return firstAdministratorSetup.enroll(enrollHumanV2RequestSchema.parse(request)); });
  electronIpcMain.handle('employee-workspace:setup-verify', (event, request) => firstAdministratorSetup.verify(trustedSender(event), verifyHumanV2RequestSchema.parse(request)));
  electronIpcMain.handle('employee-workspace:setup-commit', (event, request) => firstAdministratorSetup.commit(trustedSender(event), request));
  electronIpcMain.handle('employee-workspace:begin', (event, humanId: unknown) => {
    if (typeof humanId !== 'string' || humanId.length > 160) throw new Error('EMPLOYEE_ID_REQUIRED');
    const sender = trustedSender(event);
    employeeWorkspaceService.logout(sender);
    return employeeWorkspaceService.begin(sender, humanId);
  });
  electronIpcMain.handle('employee-workspace:identity', event => employeeWorkspaceService.identityForChallenge(trustedSender(event)));
  electronIpcMain.handle('employee-workspace:verify', (event, request: unknown) => employeeWorkspaceService.verifyChallenge(trustedSender(event), verifyHumanV2RequestSchema.parse(request)));
  electronIpcMain.handle('employee-workspace:login', (event, proofId: string) => employeeWorkspaceService.login(trustedSender(event), proofId));
  electronIpcMain.handle('employee-workspace:has-session', event => employeeWorkspaceService.hasSession(trustedSender(event)));
  electronIpcMain.handle('employee-workspace:snapshot', event => employeeWorkspaceService.snapshot(trustedSender(event)));
  electronIpcMain.handle('employee-workspace:lookup-member', (event, employeeId: string) => employeeWorkspaceService.lookupMember(trustedSender(event), employeeId));
  electronIpcMain.handle('employee-workspace:challenge', (event, purpose: string) => employeeWorkspaceService.challenge(trustedSender(event), purpose));
  electronIpcMain.handle('employee-workspace:mutate', (event, request) => employeeWorkspaceService.mutate(trustedSender(event), request));
  electronIpcMain.handle('employee-workspace:renew-administrator', (event, proofId: string) => employeeWorkspaceService.renewAdministrator(trustedSender(event), proofId));
  electronIpcMain.handle('employee-workspace:logout', event => employeeWorkspaceService.logout(trustedSender(event)));
  ipcMain.handle('control-plane:attach', (_event, request): ControlPlaneAttachResponse =>
    controlPlaneHost.attach(controlPlaneAttachRequestSchema.parse(request)));
  ipcMain.handle('control-plane:detach', (_event, request): void =>
    controlPlaneHost.detach(controlPlaneLeaseRequestSchema.parse(request)));
  ipcMain.handle('control-plane:get-snapshot', async (_event, request): Promise<ControlPlaneSnapshot> =>
    controlPlaneHost.getSnapshot(controlPlaneLeaseRequestSchema.parse(request)));
  ipcMain.handle('control-plane:get-events', (_event, request): ControlPlaneReplayResponse =>
    controlPlaneHost.replay(controlPlaneReplayRequestSchema.parse(request)));
  ipcMain.handle('control-plane:execute', async (_event, request): Promise<ControlPlaneSnapshot> =>
    controlPlaneHost.execute(controlPlaneCommandRequestSchema.parse(request)));

  ipcMain.handle('system:get-status', async (): Promise<SystemStatus> => loadSystemStatus());
  ipcMain.handle('system:write-clipboard', (_event, value: unknown): void => {
    if (typeof value !== 'string' || value.length === 0 || value.length > 1_000_000) throw new Error('Clipboard text must contain between 1 and 1,000,000 characters.');
    clipboard.writeText(value);
  });

  ipcMain.handle('workplace:get-snapshot', async (): Promise<WorkplaceSnapshot> => {
    const snapshot = await repository.getSnapshot();
    return workplaceSnapshotSchema.parse(snapshot);
  });

  ipcMain.handle('human-proof:get-state', async (): Promise<HumanProofState> =>
    humanProofStateSchema.parse(await humanProofService.getState()));

  ipcMain.handle('human-proof:enroll', async (_event, request: BiometricEnrollmentRequest): Promise<HumanProofState> =>
    humanProofStateSchema.parse(await humanProofService.enroll(biometricEnrollmentRequestSchema.parse(request))));

  ipcMain.handle('human-proof:verify', async (_event, request: BiometricVerificationRequest): Promise<HumanProofState> =>
    humanProofStateSchema.parse(await humanProofService.verify(biometricVerificationRequestSchema.parse(request))));

  ipcMain.handle('human-proof:record-failure', async (_event, request: HumanProofFailureRequest): Promise<HumanProofState> =>
    humanProofStateSchema.parse(await humanProofService.recordFailure(humanProofFailureRequestSchema.parse(request))));

  ipcMain.handle('human-identity-v2:get-state', async (_event, humanId?: string): Promise<HumanIdentityV2State> =>
    humanIdentityV2StateSchema.parse(await humanIdentityV2Service.getState(humanId)));

  ipcMain.handle('human-identity-v2:enroll', async (_event, request: EnrollHumanV2Request): Promise<HumanIdentityV2State> =>
    humanIdentityV2StateSchema.parse(await humanIdentityV2Service.enroll(enrollHumanV2RequestSchema.parse(request))));

  ipcMain.handle('human-identity-v2:verify', async (_event, request: VerifyHumanV2Request): Promise<HumanIdentityV2State> =>
    humanIdentityV2StateSchema.parse(await humanIdentityV2Service.verify(verifyHumanV2RequestSchema.parse(request))));

  ipcMain.handle('human-identity-v2:update-enrollment', async (_event, request: BiometricEnrollmentLifecycleRequest): Promise<HumanIdentityV2State> =>
    humanIdentityV2StateSchema.parse(await humanIdentityV2Service.updateEnrollment(biometricEnrollmentLifecycleRequestSchema.parse(request))));

  ipcMain.handle('human-identity-v2:migrate-v1', async (_event, request: HumanIdentityV2MigrationRequest): Promise<HumanIdentityV2MigrationResult> =>
    humanIdentityV2MigrationResultSchema.parse(await humanIdentityV2Service.migrateV1(humanIdentityV2MigrationRequestSchema.parse(request))));

  ipcMain.handle('organization:get-state', async (): Promise<OrganizationAuthorityState> =>
    organizationAuthorityStateSchema.parse(await organizationAuthorityService.getState()));

  ipcMain.handle('organization:bootstrap', async (_event, request: BootstrapOrganizationRequest): Promise<OrganizationAuthorityState> =>
    organizationAuthorityStateSchema.parse(await organizationAuthorityService.bootstrap(await bindCeremony(bootstrapOrganizationRequestSchema.parse(request)))));

  ipcMain.handle('organization:create-role', async (_event, request: CreateAuthorityRoleRequest): Promise<OrganizationAuthorityState> =>
    organizationAuthorityStateSchema.parse(await organizationAuthorityService.createRole(await bindCeremony(createAuthorityRoleRequestSchema.parse(request)))));

  ipcMain.handle('organization:join-membership', async (_event, request: JoinMembershipRequest): Promise<OrganizationAuthorityState> =>
    organizationAuthorityStateSchema.parse(await organizationAuthorityService.joinMembership(await bindCeremony(joinMembershipRequestSchema.parse(request)))));

  ipcMain.handle('organization:update-membership', async (_event, request: MembershipLifecycleRequest): Promise<OrganizationAuthorityState> =>
    organizationAuthorityStateSchema.parse(await organizationAuthorityService.updateMembership(await bindCeremony(membershipLifecycleRequestSchema.parse(request)))));

  ipcMain.handle('organization:issue-credential', async (_event, request: IssueAuthorityCredentialRequest): Promise<OrganizationAuthorityState> =>
    organizationAuthorityStateSchema.parse(await organizationAuthorityService.issueCredential(await bindCeremony(issueAuthorityCredentialRequestSchema.parse(request)))));

  ipcMain.handle('organization:recover-administrator-credential', async (_event, request: RecoverAdministratorCredentialRequest): Promise<OrganizationAuthorityState> =>
    organizationAuthorityStateSchema.parse(await organizationAuthorityService.recoverAdministratorCredential(await bindCeremony(recoverAdministratorCredentialRequestSchema.parse(request)))));

  ipcMain.handle('organization:update-credential', async (_event, request: AuthorityCredentialLifecycleRequest): Promise<OrganizationAuthorityState> =>
    organizationAuthorityStateSchema.parse(await organizationAuthorityService.updateCredential(authorityCredentialLifecycleRequestSchema.parse(request))));

  ipcMain.handle('organization:evaluate-authority', async (_event, request: EvaluateHumanAuthorityRequest): Promise<OrganizationAuthorityState> =>
    organizationAuthorityStateSchema.parse(await organizationAuthorityService.evaluate(evaluateHumanAuthorityRequestSchema.parse(request))));

  ipcMain.handle('federation:get-state', async (): Promise<FederationState> =>
    federationStateSchema.parse(await federationService.getState()));
  ipcMain.handle('federation-pairing:get-state', async (_event, request): Promise<unknown> => federationPairingStateSchema.parse(await federationPairingCoordinator.getState(refreshNodeDiscoveryRequestSchema.parse(request ?? {}).search)));
  ipcMain.handle('federation-pairing:create', async (_event, request): Promise<unknown> => federationPairingStateSchema.parse(await federationPairingCoordinator.createRequest(await bindCeremony(createFederationPairingRequestSchema.parse(request)))));
  ipcMain.handle('federation-pairing:accept', async (_event, request): Promise<unknown> => federationPairingStateSchema.parse(await federationPairingCoordinator.acceptRequest(await bindCeremony(acceptFederationPairingRequestSchema.parse(request)))));
  ipcMain.handle('federation-pairing:confirm', async (_event, request): Promise<unknown> => federationPairingStateSchema.parse(await federationPairingCoordinator.confirm(await bindCeremony(confirmFederationPairingRequestSchema.parse(request)))));
  ipcMain.handle('federation-pairing:cancel', async (_event, request): Promise<unknown> => federationPairingStateSchema.parse(await federationPairingCoordinator.cancel(await bindCeremony(cancelFederationPairingRequestSchema.parse(request)))));
  ipcMain.handle('enterprise:get-overview', async (): Promise<EnterpriseOverviewState> =>
    enterpriseOverviewStateSchema.parse(await enterpriseObservabilityService.getState()));
  ipcMain.handle('final-acceptance:get-state', async (): Promise<FinalAcceptanceState> =>
    finalAcceptanceStateSchema.parse(await finalAcceptanceService.getState()));
  ipcMain.handle('final-acceptance:export-package', async (): Promise<FinalAcceptanceExportReceipt> =>
    finalAcceptanceExportReceiptSchema.parse(await finalAcceptanceService.exportPackage()));
  ipcMain.handle('final-acceptance:verify-package', async (_event, request: VerifyFinalAcceptancePackageRequest): Promise<FinalAcceptanceVerificationReceipt> =>
    finalAcceptanceVerificationReceiptSchema.parse(await finalAcceptanceService.verifyExportedPackage(verifyFinalAcceptancePackageRequestSchema.parse(request))));
  ipcMain.handle('final-acceptance:prepare-phase44', async (): Promise<Phase44SessionReceipt> =>
    finalAcceptanceService.preparePhase44Session());
  ipcMain.handle('final-acceptance:require-liveness', async (): Promise<SystemStatus> => {
    const current = await featureConfigRepository.get();
    if (current.livenessMode !== 'required') await featureConfigRepository.set({ ...current, livenessMode: 'required' });
    return loadSystemStatus();
  });
  ipcMain.handle('demonstration-conductor:get-state', async (): Promise<DemonstrationConductor | null> =>
    demonstrationConductorService.getState());
  ipcMain.handle('demonstration-conductor:execute', async (_event, request: DemonstrationConductorCommand): Promise<DemonstrationConductor> =>
    demonstrationConductorService.execute(demonstrationConductorCommandSchema.parse(request)));
  ipcMain.handle('security-validation:get-state', async (): Promise<SecurityValidationState> =>
    securityValidationStateSchema.parse(await securityValidationCoordinator.getState()));
  ipcMain.handle('security-validation:run-attack', async (_event, request: RunSecurityAttackRequest): Promise<SecurityValidationState> =>
    securityValidationStateSchema.parse(await securityValidationCoordinator.runAttack(runSecurityAttackRequestSchema.parse(request))));
  ipcMain.handle('security-validation:run-containment', async (_event, request: RunContainmentControlRequest): Promise<SecurityValidationState> =>
    securityValidationStateSchema.parse(await securityValidationCoordinator.runContainment(runContainmentControlRequestSchema.parse(request))));
  ipcMain.handle('ceremony:get-state', async (): Promise<CeremonyState> =>
    ceremonyStateSchema.parse(await ceremonyCoordinator.getState()));
  ipcMain.handle('ceremony:create-session', async (_event, request: CreateCeremonySessionRequest): Promise<CeremonyState> =>
    ceremonyStateSchema.parse(await ceremonyCoordinator.createSession(createCeremonySessionRequestSchema.parse(request))));
  ipcMain.handle('ceremony:run-step', async (_event, request: RunCeremonyStepRequest): Promise<CeremonyState> =>
    ceremonyStateSchema.parse(await ceremonyCoordinator.runStep(runCeremonyStepRequestSchema.parse(request))));
  ipcMain.handle('guided-bootstrap:get-state', async (): Promise<GuidedBootstrapState> =>
    guidedBootstrapStateSchema.parse(await guidedBootstrapCoordinator.getState()));
  ipcMain.handle('guided-bootstrap:prepare', async (_event, request: PrepareGuidedBootstrapRequest): Promise<GuidedBootstrapState> =>
    guidedBootstrapStateSchema.parse(await guidedBootstrapCoordinator.prepare(prepareGuidedBootstrapRequestSchema.parse(request))));
  ipcMain.handle('guided-bootstrap:run-step', async (_event, request: RunGuidedBootstrapStepRequest): Promise<GuidedBootstrapState> =>
    guidedBootstrapStateSchema.parse(await guidedBootstrapCoordinator.runStep(runGuidedBootstrapStepRequestSchema.parse(request))));
  ipcMain.handle('federation:configure-node', async (_event, request: ConfigureFederationNodeRequest): Promise<FederationState> =>
    federationStateSchema.parse(await federationService.configureNode(await bindCeremony(configureFederationNodeRequestSchema.parse(request)))));
  ipcMain.handle('federation:create-invitation', async (_event, request: CreateFederationInvitationRequest): Promise<FederationState> =>
    federationStateSchema.parse(await federationService.createInvitation(await bindCeremony(createFederationInvitationRequestSchema.parse(request)))));
  ipcMain.handle('federation:accept-invitation', async (_event, request: AcceptFederationInvitationRequest): Promise<FederationState> =>
    federationStateSchema.parse(await federationService.acceptInvitation(await bindCeremony(acceptFederationInvitationRequestSchema.parse(request)))));
  ipcMain.handle('federation:approve-registration', async (_event, request: ApproveFederationRegistrationRequest): Promise<FederationState> =>
    federationStateSchema.parse(await federationService.approveRegistration(await bindCeremony(approveFederationRegistrationRequestSchema.parse(request)))));
  ipcMain.handle('federation:activate-acceptance', async (_event, request: ActivateFederationAcceptanceRequest): Promise<FederationState> =>
    federationStateSchema.parse(await federationService.activateAcceptance(await bindCeremony(activateFederationAcceptanceRequestSchema.parse(request)))));
  ipcMain.handle('federation:revoke-peer', async (_event, request: RevokeFederationPeerRequest): Promise<FederationState> =>
    federationStateSchema.parse(await federationService.revokePeer(await bindCeremony(revokeFederationPeerRequestSchema.parse(request)))));
  ipcMain.handle('federation-operator:get-state', async (): Promise<FederationOperatorState> => federationOperatorStateSchema.parse(await federationOperatorCoordinator.getState()));
  ipcMain.handle('federation-operator:start-listener', async (_event, request: StartFederationListenerRequest): Promise<FederationOperatorState> => federationOperatorStateSchema.parse(await federationOperatorCoordinator.startListener(await bindCeremony(startFederationListenerRequestSchema.parse(request)))));
  ipcMain.handle('federation-operator:stop-listener', async (_event, request: StopFederationListenerRequest): Promise<FederationOperatorState> => federationOperatorStateSchema.parse(await federationOperatorCoordinator.stopListener(await bindCeremony(stopFederationListenerRequestSchema.parse(request)))));
  ipcMain.handle('federation-operator:send-task', async (_event, request: SendFederationTaskRequest): Promise<FederationOperatorState> => federationOperatorStateSchema.parse(await federationOperatorCoordinator.sendTask(await bindCeremony(sendFederationTaskRequestSchema.parse(request)))));
  ipcMain.handle('federation-operator:send-ack', async (_event, request: SendFederationAcknowledgementRequest): Promise<FederationOperatorState> => federationOperatorStateSchema.parse(await federationOperatorCoordinator.sendAcknowledgement(await bindCeremony(sendFederationAcknowledgementRequestSchema.parse(request)))));
  ipcMain.handle('federation-operator:send-heartbeat', async (_event, request: SendFederationOperatorHeartbeatRequest): Promise<FederationOperatorState> => federationOperatorStateSchema.parse(await federationOperatorCoordinator.sendHeartbeat(await bindCeremony(sendFederationOperatorHeartbeatRequestSchema.parse(request)))));
  ipcMain.handle('federation-operator:prove-replay', async (_event, request: ProveFederationReplayRequest): Promise<FederationOperatorState> => federationOperatorStateSchema.parse(await federationOperatorCoordinator.proveReplay(await bindCeremony(proveFederationReplayRequestSchema.parse(request)))));
  ipcMain.handle('federation-operator:prove-revocation', async (_event, request: ProveFederationRevocationRequest): Promise<FederationOperatorState> => federationOperatorStateSchema.parse(await federationOperatorCoordinator.proveRevocation(await bindCeremony(proveFederationRevocationRequestSchema.parse(request)))));

  ipcMain.handle('authority-approvals:get-state', async (): Promise<AuthorityApprovalState> =>
    authorityApprovalStateSchema.parse(await multiHumanApprovalService.getState()));
  ipcMain.handle('authority-approvals:create-policy', async (_event, request: CreateApprovalPolicyRequest): Promise<AuthorityApprovalState> =>
    authorityApprovalStateSchema.parse(await multiHumanApprovalService.createPolicy(createApprovalPolicyRequestSchema.parse(request))));
  ipcMain.handle('authority-approvals:request', async (_event, request: RequestAuthorityEscalation): Promise<AuthorityApprovalState> => {
    const input = requestAuthorityEscalationSchema.parse(request);
    await bindCeremony(input);
    const assignment = (await collaborationService.getState()).workplace.assignments.find((item) => item.id === input.task_id);
    if (!assignment || !['approval', 'blocked'].includes(assignment.status)) throw new Error('Authority escalation requires a currently paused assignment.');
    if (assignment.assigneeId !== input.requesting_agent_id || assignment.mandateId !== input.mandate_id) throw new Error('Escalation agent or mandate does not match the paused assignment.');
    return authorityApprovalStateSchema.parse(await multiHumanApprovalService.requestEscalation(input));
  });
  ipcMain.handle('authority-approvals:decide', async (_event, request: SubmitApprovalDecisionRequest): Promise<AuthorityApprovalState> =>
    authorityApprovalStateSchema.parse(await multiHumanApprovalService.submitDecision(submitApprovalDecisionRequestSchema.parse(request))));
  ipcMain.handle('authority-approvals:resume', async (_event, request: ConsumeApprovalResumeRequest): Promise<AuthorityApprovalState> =>
    authorityApprovalStateSchema.parse(await multiHumanApprovalService.consumeResume(consumeApprovalResumeRequestSchema.parse(request))));
  ipcMain.handle('authority-approvals:withdraw', async (_event, request: WithdrawApprovalRequest): Promise<AuthorityApprovalState> =>
    authorityApprovalStateSchema.parse(await multiHumanApprovalService.withdraw(withdrawApprovalRequestSchema.parse(request))));
  ipcMain.handle('human-escalation:get-state', async (): Promise<HumanEscalationState> => humanEscalationStateSchema.parse(await humanEscalationCoordinator.getState()));
  ipcMain.handle('human-escalation:configure', async (_event, request: ConfigureHumanEscalationRequest): Promise<HumanEscalationState> => humanEscalationStateSchema.parse(await humanEscalationCoordinator.configure(configureHumanEscalationRequestSchema.parse(request))));
  ipcMain.handle('human-escalation:start', async (_event, request: StartHumanEscalationRequest): Promise<HumanEscalationState> => humanEscalationStateSchema.parse(await humanEscalationCoordinator.start(startHumanEscalationRequestSchema.parse(request))));
  ipcMain.handle('human-escalation:start-rejection', async (_event, request: StartHumanEscalationRejectionRequest): Promise<HumanEscalationState> => humanEscalationStateSchema.parse(await humanEscalationCoordinator.startRejection(startHumanEscalationRejectionRequestSchema.parse(request))));

  ipcMain.handle('context-broker:get-state', async (): Promise<ContextBrokerState> => {
    const state = await contextBrokerService.getState();
    return contextBrokerStateSchema.parse({ ...state, messages: await messageBroker.getGovernedMessages() });
  });
  ipcMain.handle('context-broker:create-artifact', async (_event, request: CreateContextArtifactRequest): Promise<ContextBrokerState> => {
    const state = await contextBrokerService.createArtifact(await bindCeremony(createContextArtifactRequestSchema.parse(request)));
    return contextBrokerStateSchema.parse({ ...state, messages: await messageBroker.getGovernedMessages() });
  });
  ipcMain.handle('context-broker:issue-grant', async (_event, request: IssueContextGrantRequest): Promise<ContextBrokerState> => {
    const state = await contextBrokerService.issueGrant(await bindCeremony(issueContextGrantRequestSchema.parse(request)));
    return contextBrokerStateSchema.parse({ ...state, messages: await messageBroker.getGovernedMessages() });
  });
  ipcMain.handle('context-broker:update-grant', async (_event, request: ContextGrantLifecycleRequest): Promise<ContextBrokerState> => {
    const state = await contextBrokerService.updateGrant(await bindCeremony(contextGrantLifecycleRequestSchema.parse(request)));
    return contextBrokerStateSchema.parse({ ...state, messages: await messageBroker.getGovernedMessages() });
  });

  ipcMain.handle('agents:get-identity-state', async (): Promise<AgentIdentityState> =>
    agentIdentityStateSchema.parse(await agentIdentityService.getState()));

  ipcMain.handle('agents:create', async (_event, request: CreateAgentRequest): Promise<AgentIdentityState> =>
    agentIdentityStateSchema.parse(await agentIdentityService.createAgent(await bindCeremony(createAgentRequestSchema.parse(request)))));

  ipcMain.handle('agents:update-passport', async (_event, request: PassportLifecycleRequest): Promise<AgentIdentityState> => {
    const input = passportLifecycleRequestSchema.parse(request);
    const state = await agentIdentityService.updatePassport(input);
    if (input.action === 'suspend' || input.action === 'revoke') await Promise.all([
      processSupervisor.revokePassport(input.passportId, `PASSPORT_${input.action.toUpperCase()}`),
      runtimeAttachmentService.revokePassport(input.passportId)
    ]);
    return agentIdentityStateSchema.parse(state);
  });

  ipcMain.handle('agents:update-runtime', async (_event, request: RuntimeLifecycleRequest): Promise<AgentIdentityState> => {
    const input = runtimeLifecycleRequestSchema.parse(request);
    const state = await agentIdentityService.updateRuntime(input);
    if (input.action === 'disconnect') await Promise.all([
      processSupervisor.revokeBinding(input.bindingId, 'RUNTIME_DISCONNECTED'),
      runtimeAttachmentService.revokeBinding(input.bindingId)
    ]);
    return agentIdentityStateSchema.parse(state);
  });

  ipcMain.handle('agents:attest-runtime', async (_event, request: AttestAgentRuntimeRequest): Promise<AgentIdentityState> => {
    const input = await bindCeremony(attestAgentRuntimeRequestSchema.parse(request));
    const previous = (await agentIdentityService.getState()).bindings.find((item) => item.binding_id === input.bindingId)?.live_session_id;
    const state = await agentIdentityService.attestRuntime(input);
    if (previous) await Promise.all([
      processSupervisor.revokeSession(previous, 'RUNTIME_SESSION_ROTATED'),
      runtimeAttachmentService.revokeSession(previous)
    ]);
    return agentIdentityStateSchema.parse(state);
  });

  ipcMain.handle('agents:migrate-v1', async (_event, request: MigrateAgentPassportsV1Request): Promise<AgentPassportV2MigrationResult> =>
    agentPassportV2MigrationResultSchema.parse(await agentIdentityService.migrateV1Passports(migrateAgentPassportsV1RequestSchema.parse(request))));

  ipcMain.handle('collaboration:get-state', async (): Promise<CollaborationState> =>
    collaborationStateSchema.parse(await collaborationService.getState()));

  ipcMain.handle('collaboration:create-assignment', async (_event, request: CreateAssignmentRequest): Promise<CollaborationState> =>
    collaborationStateSchema.parse(await collaborationService.createAssignment(await bindCeremony(createAssignmentRequestSchema.parse(request)))));

  ipcMain.handle('collaboration:update-assignment', async (_event, request: UpdateAssignmentRequest): Promise<CollaborationState> =>
    collaborationStateSchema.parse(await collaborationService.updateAssignment(updateAssignmentRequestSchema.parse(request))));

  ipcMain.handle('collaboration:record-response', async (_event, request: RecordAssignmentResponseRequest): Promise<CollaborationState> =>
    collaborationStateSchema.parse(await collaborationService.recordResponse(recordAssignmentResponseRequestSchema.parse(request))));

  ipcMain.handle('collaboration:send-message', async (_event, request: SendCollaborationMessageRequest): Promise<CollaborationState> =>
    collaborationStateSchema.parse(await collaborationService.sendMessage(sendCollaborationMessageRequestSchema.parse(request))));

  ipcMain.handle('connectors:get-state', async (): Promise<ConnectorProtocolState> =>
    connectorProtocolStateSchema.parse(await messageBroker.getState()));

  ipcMain.handle('connectors:import', async (_event, request: ConnectorImportRequest): Promise<ConnectorProtocolState> => {
    await connectorRegistry.import(await bindCeremony(connectorImportRequestSchema.parse(request)));
    return connectorProtocolStateSchema.parse(await messageBroker.getState());
  });

  ipcMain.handle('connectors:cancel-delivery', async (_event, request: CancelDeliveryRequest): Promise<ConnectorProtocolState> => {
    const input = cancelDeliveryRequestSchema.parse(request);
    await bindCeremony(input);
    await messageBroker.cancel(input.delivery_id, input.reason);
    return connectorProtocolStateSchema.parse(await messageBroker.getState());
  });

  ipcMain.handle('framework-connectors:get-state', async (): Promise<FrameworkConnectorState> =>
    frameworkConnectorStateSchema.parse(await frameworkConnectorService.getState()));

  ipcMain.handle('framework-connectors:probe', async (_event, request: FrameworkProbeRequest): Promise<FrameworkConnectorState> =>
    frameworkConnectorStateSchema.parse(await frameworkConnectorService.probe(frameworkProbeRequestSchema.parse(request))));

  ipcMain.handle('framework-connectors:execute', async (_event, request: ExecuteFrameworkRequest): Promise<FrameworkConnectorState> =>
    frameworkConnectorStateSchema.parse(await frameworkConnectorService.execute(await bindCeremony(executeFrameworkRequestSchema.parse(request)))));

  ipcMain.handle('real-collaboration:get-state', async (): Promise<RealCollaborationState> =>
    realCollaborationStateSchema.parse(await realCollaborationCoordinator.getState()));

  ipcMain.handle('real-collaboration:prepare', async (_event, request: PrepareRealCollaborationRequest): Promise<RealCollaborationState> =>
    realCollaborationStateSchema.parse(await realCollaborationCoordinator.prepare(await bindCeremony(prepareRealCollaborationRequestSchema.parse(request)))));

  ipcMain.handle('real-collaboration:replace-authority', async (_event, request: ReplaceRealCollaborationAuthorityRequest): Promise<RealCollaborationState> =>
    realCollaborationStateSchema.parse(await realCollaborationCoordinator.replaceAuthority(await bindCeremony(replaceRealCollaborationAuthorityRequestSchema.parse(request)))));

  ipcMain.handle('real-collaboration:run-lane', async (_event, request: RunRealCollaborationLaneRequest): Promise<RealCollaborationState> =>
    realCollaborationStateSchema.parse(await realCollaborationCoordinator.runLane(await bindCeremony(runRealCollaborationLaneRequestSchema.parse(request)))));

  ipcMain.handle('real-collaboration:cancel-lane', async (_event, request: CancelRealCollaborationLaneRequest): Promise<RealCollaborationState> =>
    realCollaborationStateSchema.parse(await realCollaborationCoordinator.cancelLane(await bindCeremony(cancelRealCollaborationLaneRequestSchema.parse(request)))));
  ipcMain.handle('least-context:get-state', async (): Promise<LeastContextState> =>
    leastContextStateSchema.parse(await leastContextCoordinator.getState()));
  ipcMain.handle('least-context:prepare', async (_event, request: PrepareLeastContextRequest): Promise<LeastContextState> =>
    leastContextStateSchema.parse(await leastContextCoordinator.prepare(await bindCeremony(prepareLeastContextRequestSchema.parse(request)))));
  ipcMain.handle('least-context:renew-grant', async (_event, request: RenewLeastContextGrantRequest): Promise<LeastContextState> =>
    leastContextStateSchema.parse(await leastContextCoordinator.renewGrant(await bindCeremony(renewLeastContextGrantRequestSchema.parse(request)))));
  ipcMain.handle('least-context:run-lane', async (_event, request: RunLeastContextLaneRequest): Promise<LeastContextState> =>
    leastContextStateSchema.parse(await leastContextCoordinator.runLane(await bindCeremony(runLeastContextLaneRequestSchema.parse(request)))));
  ipcMain.handle('least-context:prove-revocation', async (_event, request: ProveLeastContextRevocationRequest): Promise<LeastContextState> =>
    leastContextStateSchema.parse(await leastContextCoordinator.proveRevocation(await bindCeremony(proveLeastContextRevocationRequestSchema.parse(request)))));

  ipcMain.handle('live-runtime:get-state', async (): Promise<LiveRuntimeState> =>
    liveRuntimeStateSchema.parse(await processSupervisor.getState()));

  ipcMain.handle('live-runtime:probe', async (_event, request: LiveRuntimeProbeRequest): Promise<LiveRuntimeState> => {
    liveRuntimeProbeRequestSchema.parse(request);
    return liveRuntimeStateSchema.parse(await processSupervisor.getState());
  });

  ipcMain.handle('live-runtime:start', async (_event, request: StartLiveRunRequest): Promise<LiveRuntimeState> =>
    liveRuntimeStateSchema.parse(await processSupervisor.start(await bindCeremony(startLiveRunRequestSchema.parse(request)))));

  ipcMain.handle('live-runtime:cancel', async (_event, request: CancelLiveRunRequest): Promise<LiveRuntimeState> => {
    const input = cancelLiveRunRequestSchema.parse(request);
    await bindCeremony(input);
    return liveRuntimeStateSchema.parse(await processSupervisor.cancel(input.run_id, input.reason));
  });

  ipcMain.handle('runtime-attachment:get-state', async (): Promise<RuntimeAttachmentState> =>
    runtimeAttachmentStateSchema.parse(await runtimeAttachmentService.getState()));
  ipcMain.handle('runtime-attachment:start', async (_event, request: StartTerminalSessionRequest): Promise<RuntimeAttachmentState> =>
    runtimeAttachmentStateSchema.parse(await runtimeAttachmentService.start(startTerminalSessionRequestSchema.parse(request))));
  ipcMain.handle('runtime-attachment:attach', async (_event, request: AttachTerminalRequest): Promise<TerminalAttachmentLease> =>
    runtimeAttachmentService.attach(attachTerminalRequestSchema.parse(request)));
  ipcMain.handle('runtime-attachment:detach', async (_event, request: TerminalLeaseRequest): Promise<void> =>
    runtimeAttachmentService.detach(terminalLeaseRequestSchema.parse(request)));
  ipcMain.handle('runtime-attachment:replay', async (_event, request: TerminalReplayRequest): Promise<TerminalReplayResponse> =>
    terminalReplayResponseSchema.parse(await runtimeAttachmentService.replay(terminalReplayRequestSchema.parse(request))));
  ipcMain.handle('runtime-attachment:write', async (_event, request: TerminalInputRequest): Promise<void> =>
    runtimeAttachmentService.write(terminalInputRequestSchema.parse(request)));
  ipcMain.handle('runtime-attachment:resize', async (_event, request: TerminalResizeRequest): Promise<void> =>
    runtimeAttachmentService.resize(terminalResizeRequestSchema.parse(request)));
  ipcMain.handle('runtime-attachment:cancel', async (_event, request: TerminalCancelRequest): Promise<RuntimeAttachmentState> =>
    runtimeAttachmentStateSchema.parse(await runtimeAttachmentService.cancel(terminalCancelRequestSchema.parse(request))));

  ipcMain.handle('project-delivery:get-state', async (): Promise<ProjectDeliveryState> => projectDeliveryStateSchema.parse(await projectWorkspaceService.getState()));
  ipcMain.handle('project-delivery:register', async (_event, request: RegisterProjectRequest): Promise<ProjectDeliveryState> => projectDeliveryStateSchema.parse(await projectWorkspaceService.register(registerProjectRequestSchema.parse(request))));
  ipcMain.handle('project-delivery:create-goal', async (_event, request: CreateProjectGoalRequest): Promise<ProjectDeliveryState> => projectDeliveryStateSchema.parse(await projectTaskCoordinator.createGoal(createProjectGoalRequestSchema.parse(request))));
  ipcMain.handle('project-delivery:create-assignment', async (_event, request: CreateProjectAssignmentRequest): Promise<ProjectDeliveryState> => projectDeliveryStateSchema.parse(await projectTaskCoordinator.createAssignment(createProjectAssignmentRequestSchema.parse(request))));
  ipcMain.handle('project-delivery:create-worktree', async (_event, assignmentId: string): Promise<ProjectDeliveryState> => projectDeliveryStateSchema.parse(await worktreeLeaseService.create(String(assignmentId))));
  ipcMain.handle('project-delivery:refresh-worktree', async (_event, assignmentId: string): Promise<ProjectDeliveryState> => projectDeliveryStateSchema.parse(await worktreeLeaseService.refresh(String(assignmentId))));
  ipcMain.handle('project-delivery:fetch-research', async (_event, request: FetchResearchSourceRequest): Promise<ProjectDeliveryState> => projectDeliveryStateSchema.parse(await researchConnectorService.fetch(fetchResearchSourceRequestSchema.parse(request))));
  ipcMain.handle('project-delivery:validate', async (_event, request: RunProjectValidationRequest): Promise<ProjectDeliveryState> => projectDeliveryStateSchema.parse(await projectValidationService.run(runProjectValidationRequestSchema.parse(request))));
  ipcMain.handle('project-delivery:run-assignment', async (_event, request: RunProjectAssignmentRequest): Promise<ProjectDeliveryState> => {
    const input = runProjectAssignmentRequestSchema.parse(request); const operation = projectProviderExecutionService.run(input); void operation.catch((error: unknown) => diagnostics.error('Project provider run failed.', error));
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const state = await projectWorkspaceService.getState(); if (state.runs.some((run) => run.assignment_id === input.assignment_id && run.status === 'running')) return projectDeliveryStateSchema.parse(state);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    }
    return projectDeliveryStateSchema.parse(await operation);
  });
  ipcMain.handle('project-delivery:cancel-run', async (_event, request: CancelProjectRunRequest): Promise<ProjectDeliveryState> => projectDeliveryStateSchema.parse(await projectProviderExecutionService.cancel(cancelProjectRunRequestSchema.parse(request))));
  ipcMain.handle('project-delivery:effect-hash', async (_event, goalId: string, assignmentIds: string[]): Promise<string> => changeIntegrationService.effectHash(String(goalId), assignmentIds.map(String)));
  ipcMain.handle('project-delivery:request-integration-approval', async (_event, request: RequestProjectIntegrationApproval): Promise<AuthorityApprovalState> => {
    const input = requestProjectIntegrationApprovalSchema.parse(request);
    const prepared = await changeIntegrationService.prepareReview(input.goal_id, input.assignment_ids);
    const projectState = prepared.state; const goal = projectState.goals.find((item) => item.goal_id === input.goal_id);
    if (!goal) throw new Error('Signed project goal does not exist.');
    const assignments = input.assignment_ids.map((assignmentId) => projectState.assignments.find((item) => item.assignment_id === assignmentId));
    if (assignments.some((item) => !item || item.goal_id !== goal.goal_id || item.kind === 'research')) throw new Error('Project approval can only cover edit assignments under this signed goal.');
    const requesterAssignment = assignments[0]!; const identity = await agentIdentityService.getState();
    await projectExecutionAuthority.assertActive(requesterAssignment);
    const passport = identity.passportsV2?.find((item) => item.passport_id === requesterAssignment.passport_id && item.status === 'active');
    if (!passport) throw new Error('Project approval requester has no active Passport V2.');
    const approvals = await multiHumanApprovalService.getState(); const policy = approvals.policies.find((item) => item.approval_policy_id === input.approval_policy_id && item.organization_id === passport.organization_id && item.status === 'active');
    if (!policy) throw new Error('Selected project approval policy is not active for this organization.');
    const authority = await organizationAuthorityService.getState();
    const eligibleRoles = authority.roles.filter((role) => policy.eligible_role_ids.includes(role.role_id) && role.status === 'active');
    const projectRole = eligibleRoles.find((role) => role.approval_powers.includes('project.integrate.approve') && role.authority_scopes.some((scope) => (scope.resource === '*' || scope.resource === 'project-repository') && scope.actions.some((action) => action === '*' || action === 'integrate')));
    if (!projectRole) throw new Error('Selected policy needs an eligible active role with project.integrate.approve and project-repository/integrate authority.');
    return authorityApprovalStateSchema.parse(await multiHumanApprovalService.requestEscalation({
      organization_id: passport.organization_id, task_id: requesterAssignment.assignment_id,
      requesting_human_id: passport.sponsor_human_id, requesting_membership_id: passport.sponsor_membership_id,
      requesting_agent_id: requesterAssignment.agent_id, mandate_id: requesterAssignment.mandate_id,
      required_resource: 'project-repository', required_action: 'integrate', required_approval_power: 'project.integrate.approve',
      requested_effect_hash: prepared.effectHash, review_context_grant_id: prepared.reviewBundleId,
      approval_policy_id: policy.approval_policy_id, risk_tier: 'restricted', record_count: input.assignment_ids.length,
      idempotency_key: `project_integrate_${prepared.effectHash.slice(7)}`
    }));
  });
  ipcMain.handle('project-delivery:integrate', async (_event, request: IntegrateProjectRequest): Promise<ProjectDeliveryState> => projectDeliveryStateSchema.parse(await changeIntegrationService.integrate(integrateProjectRequestSchema.parse(request))));
  ipcMain.handle('project-delivery:cleanup-worktree', async (_event, assignmentId: string): Promise<ProjectDeliveryState> => projectDeliveryStateSchema.parse(await worktreeLeaseService.cleanup(String(assignmentId))));
  ipcMain.handle('goal-work-graph:get-state', async (): Promise<GoalWorkGraphState> => goalWorkGraphStateSchema.parse(await goalWorkGraphCoordinator.getState()));
  ipcMain.handle('goal-work-graph:compose', async (_event, request: ComposeCollaborativeGoalRequest): Promise<GoalWorkGraphState> => goalWorkGraphStateSchema.parse(await goalWorkGraphCoordinator.composeGoal(composeCollaborativeGoalRequestSchema.parse(request))));
  ipcMain.handle('goal-work-graph:propose', async (_event, request: ProposeWorkGraphRequest): Promise<GoalWorkGraphState> => goalWorkGraphStateSchema.parse(await goalWorkGraphCoordinator.proposeGraph(proposeWorkGraphRequestSchema.parse(request))));
  ipcMain.handle('goal-work-graph:edit', async (_event, request: EditWorkGraphRequest): Promise<GoalWorkGraphState> => goalWorkGraphStateSchema.parse(await goalWorkGraphCoordinator.editGraph(editWorkGraphRequestSchema.parse(request))));
  ipcMain.handle('goal-work-graph:approve', async (_event, request: ApproveWorkGraphRequest): Promise<GoalWorkGraphState> => goalWorkGraphStateSchema.parse(await goalWorkGraphCoordinator.approveGraph(approveWorkGraphRequestSchema.parse(request))));
  ipcMain.handle('goal-work-graph:run', async (_event, request: RunWorkGraphRequest): Promise<GoalWorkGraphState> => goalWorkGraphStateSchema.parse(await goalWorkGraphCoordinator.runReadyGraph(runWorkGraphRequestSchema.parse(request))));
  ipcMain.handle('goal-work-graph:run-node', async (_event, request: WorkGraphNodeCommandRequest): Promise<GoalWorkGraphState> => goalWorkGraphStateSchema.parse(await goalWorkGraphCoordinator.runNode(workGraphNodeCommandRequestSchema.parse(request))));
  ipcMain.handle('goal-work-graph:renew-node', async (_event, request: RenewWorkGraphNodeRequest): Promise<GoalWorkGraphState> => goalWorkGraphStateSchema.parse(await goalWorkGraphCoordinator.renewNode(renewWorkGraphNodeRequestSchema.parse(request))));
  ipcMain.handle('goal-work-graph:cancel-node', async (_event, request: WorkGraphNodeCommandRequest): Promise<GoalWorkGraphState> => goalWorkGraphStateSchema.parse(await goalWorkGraphCoordinator.cancelNode(workGraphNodeCommandRequestSchema.parse(request))));
  ipcMain.handle('goal-work-graph:revoke-node', async (_event, request: WorkGraphNodeCommandRequest): Promise<GoalWorkGraphState> => goalWorkGraphStateSchema.parse(await goalWorkGraphCoordinator.revokeNode(workGraphNodeCommandRequestSchema.parse(request))));
  ipcMain.handle('goal-work-graph:reassign-node', async (_event, request: ReassignWorkGraphNodeRequest): Promise<GoalWorkGraphState> => goalWorkGraphStateSchema.parse(await goalWorkGraphCoordinator.reassignNode(reassignWorkGraphNodeRequestSchema.parse(request))));

  ipcMain.handle('mandates:get-state', async (): Promise<MandateState> =>
    mandateStateSchema.parse(await mandateService.getState()));

  ipcMain.handle('mandates:create', async (_event, request: CreateMandateRequest): Promise<MandateState> =>
    mandateStateSchema.parse(await mandateService.create(await bindCeremony(createMandateRequestSchema.parse(request)))));

  ipcMain.handle('mandates:delegate', async (_event, request: DelegateMandateRequest): Promise<MandateState> =>
    mandateStateSchema.parse(await mandateService.delegate(await bindCeremony(delegateMandateRequestSchema.parse(request)))));

  ipcMain.handle('mandates:update', async (_event, request: MandateLifecycleRequest): Promise<MandateState> =>
    mandateStateSchema.parse(await mandateService.updateLifecycle(await bindCeremony(mandateLifecycleRequestSchema.parse(request)))));

  ipcMain.handle('mandates:authorize', async (_event, request: AuthorizeActionRequest): Promise<MandateState> =>
    mandateStateSchema.parse(await mandateService.authorize(authorizeActionRequestSchema.parse(request))));

  ipcMain.handle('mandates:resolve-approval', async (_event, request: ResolveApprovalRequest): Promise<MandateState> =>
    mandateStateSchema.parse(await mandateService.resolveApproval(resolveApprovalRequestSchema.parse(request))));

  ipcMain.handle('scenarios:get-state', async (): Promise<ScenarioState> =>
    scenarioStateSchema.parse(await scenarioService.getState()));

  ipcMain.handle('scenarios:start', async (_event, request: StartScenarioRequest): Promise<ScenarioState> =>
    scenarioStateSchema.parse(await scenarioService.start(startScenarioRequestSchema.parse(request))));

  ipcMain.handle('scenarios:resume', async (_event, request: ResumeScenarioRequest): Promise<ScenarioState> =>
    scenarioStateSchema.parse(await scenarioService.resume(resumeScenarioRequestSchema.parse(request))));

  ipcMain.handle('evidence:get-explorer-state', async (_event, query: EvidenceQuery): Promise<EvidenceExplorerState> =>
    evidenceExplorerStateSchema.parse(await evidenceAuditService.getState(evidenceQuerySchema.parse(query))));

  ipcMain.handle('evidence:export-bundle', async (_event, request: ExportEvidenceBundleRequest): Promise<EvidenceExportReceipt> => {
    const input = exportEvidenceBundleRequestSchema.parse(request);
    return evidenceExportReceiptSchema.parse(await evidenceAuditService.exportBundle(input.query));
  });
}

app.whenReady().then(async () => {
  await humanProofService.initialize();
  await humanIdentityV2Service.initialize();
  await organizationAuthorityService.initialize();
  await multiHumanApprovalService.initialize();
  // Message Broker owns first creation of the shared connector registry projection.
  await messageBroker.initialize();
  await Promise.all([
    repository.getSnapshot(),
    featureConfigRepository.get(),
    evidenceLedger.verify(),
    agentIdentityService.initialize(),
    collaborationService.initialize(),
    mandateService.initialize(),
    scenarioService.initialize(),
    frameworkConnectorService.initialize(),
    processSupervisor.initialize(),
    runtimeAttachmentService.initialize(),
    projectWorkspaceService.initialize(),
    contextBrokerService.initialize(),
    federationService.initialize(),
    federationPairingCoordinator.initialize(),
    goalWorkGraphCoordinator.initialize(),
    federationOperatorCoordinator.initialize(),
    verifyBiometricAssetManifest(appRoot)
  ]);
  await evidenceAuditService.initialize();
  await finalAcceptanceService.initialize();
  await ceremonyCoordinator.initialize();
  await guidedBootstrapCoordinator.initialize();
  await realCollaborationCoordinator.initialize();
  await leastContextCoordinator.initialize();
  await humanEscalationCoordinator.initialize();
  await securityValidationCoordinator.initialize();
  await demonstrationConductorService.initialize();
  await controlPlaneHost.initialize();
  registerIpc();
  controlPlaneHost.subscribe((event: ControlPlaneEventEnvelope) => {
    for (const window of BrowserWindow.getAllWindows()) {
      void employeeWorkspaceService.assertAdministrator(window.webContents.id).then(() => {
        if (!window.isDestroyed()) window.webContents.send('control-plane:event', event);
      }).catch(() => undefined);
    }
  });
  startControlPlaneRefreshFeed();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error: unknown) => {
  diagnostics.error('H2A startup failed.', error);
  app.exit(1);
});

app.on('window-all-closed', () => {
  controlPlaneWatcher?.close();
  if (controlPlaneRefreshTimer) clearTimeout(controlPlaneRefreshTimer);
  if (controlPlaneSafetyPoll) clearInterval(controlPlaneSafetyPoll);
  if (process.platform !== 'darwin') void Promise.all([processSupervisor.shutdown(), runtimeAttachmentService.shutdown(), projectProviderExecutionService.shutdown(), federationOperatorCoordinator.close(), federationPairingCoordinator.close()]).finally(() => app.quit());
});
