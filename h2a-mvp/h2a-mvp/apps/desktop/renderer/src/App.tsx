import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentIdentityState, AgentRuntimeSummary, AppearancePreferences, AuthorityApprovalState, CeremonyState, CollaborationState, ContextBrokerState, ControlPlaneSnapshot, EnterpriseOverviewState, EvidenceExplorerState, FederationState, FinalAcceptanceState, GoalWorkGraphState, GuidedBootstrapState, GuidedWorkflowAction, GuidedWorkflowId, MandateState, OfficeState, OperatorReadiness, OrganizationAuthorityState, PresentationMode, ProjectDeliveryState, ScenarioState, SystemStatus } from '@h2a/contracts';
import { defaultEvidenceQuery } from '@h2a/contracts';
import { StatePanel, WorkspaceLoadingState } from '@h2a/ui';
import { AppShell, type AppRoute } from './components/AppShell';
import { OfficeShell } from './components/OfficeShell';
import { OfficeCollaborationWorkspace, OfficeWorkspaceDrawer, officeWorkspaceRoutes, type OfficeWorkspaceId } from './components/OfficeWorkspaceDrawer';
import { HumanProofChallengeDialog } from './components/HumanProofChallengeDialog';
import { challengeFailureMessage, resolveHumanProofSubject } from './components/humanProofChallenge';
import { ReadinessCenter } from './components/ReadinessCenter';
import { CommandFloor } from './features/command-floor/CommandFloor';
import { EvidenceExplorer } from './features/evidence/EvidenceExplorer';
import { HumanProofView, SettingsView } from './features/system/SystemViews';
import { MandatesView } from './features/mandates/MandatesView';
import { PeopleAuthorityView } from './features/organization/PeopleAuthorityView';
import { AuthorityInbox } from './features/authority/AuthorityInbox';
import { ContextBrokerView } from './features/context/ContextBrokerView';
import { FederationView } from './features/federation/FederationView';
import { FinalAcceptanceView } from './features/acceptance/FinalAcceptanceView';
import { SecurityValidationConsole } from './features/acceptance/SecurityValidationConsole';
import { GoalWorkGraphPanel } from './features/command-floor/components/GoalWorkGraphPanel';
import { ProjectDeliveryPanel } from './features/command-floor/components/ProjectDeliveryPanel';
import { CoworkerPairingPanel } from './features/federation/CoworkerPairingPanel';
import { WorkspaceExperience } from './features/workspace/WorkspaceExperience';
import { WorkspaceDemonstrationGuide } from './features/workspace/WorkspaceDemonstrationGuide';
import { WorkspaceAgentConnections } from './features/workspace/WorkspaceAgentConnections';
import {
  WorkspaceAuthoritySummary, WorkspaceDecisionCenter, WorkspacePlanSummary, WorkspaceProjectConnector,
  WorkspaceReceipts, WorkspaceSecurityCenter, WorkspaceSharingCenter
} from './features/workspace/WorkspaceNativeSurfaces';
import { getControlPlaneCommandFacade } from './control-plane/commandFacade';
import { retainSelectedAgentId } from './control-plane/selectionState';
import {
  emptyAcceptanceState, emptyAgentIdentityState, emptyApprovalState, emptyCeremonyState, emptyCollaborationState,
  emptyContextBrokerState, emptyEnterpriseState, emptyEvidenceState, emptyFederationState, emptyGuidedBootstrapState,
  emptyMandateState, emptyOrganizationState, emptyScenarioState, emptySystemStatus, emptyAppearancePreferences, emptyOfficeState,
  emptyWorkspaceState, type WorkspaceStateTuple
} from './stateDefaults';

const controlPlane = window.h2a ? getControlPlaneCommandFacade(window.h2a) : undefined;
const emptyProjectDelivery: ProjectDeliveryState = { projects: [], goals: [], assignments: [], worktrees: [], sources: [], messages: [], validations: [], runs: [], review_bundles: [], integrations: [], trust_ceiling: 'connected-observed' };
const emptyGoalWorkGraph: GoalWorkGraphState = { schema_version: 1, goals: [], graphs: [], diffs: [], candidates: [], generated_at: new Date(0).toISOString(), trust_ceiling: 'connected-observed' };

function workspaceForRoute(route: string): OfficeWorkspaceId {
  if (route === 'people-authority') return 'organization';
  if (route === 'authority-inbox') return 'approvals';
  if (route === 'context-broker' || route === 'mandates') return 'context';
  if (route === 'federation') return 'pairing';
  if (route === 'evidence') return 'evidence';
  if (route === 'demo-gate' || route === 'settings') return 'security';
  return 'tasks';
}

function conductorControlRoute(stepId: string): AppRoute {
  if (stepId === 'two-human-liveness') return 'human-proof';
  if (['organization-authority', 'workload-identity'].includes(stepId)) return stepId === 'organization-authority' ? 'people-authority' : 'command-floor';
  if (['authority-escalation', 'approval-withdrawal'].includes(stepId)) return 'authority-inbox';
  if (stepId === 'context-minimization') return 'context-broker';
  if (stepId === 'federation-collaboration') return 'federation';
  if (['runtime-containment', 'adversarial-controls', 'restart-recovery'].includes(stepId)) return 'demo-gate';
  if (stepId === 'evidence-reconstruction') return 'evidence';
  return 'command-floor';
}

function conductorWorkspace(stepId: string): OfficeWorkspaceId {
  return workspaceForRoute(conductorControlRoute(stepId));
}

async function loadWorkspace(): Promise<WorkspaceStateTuple> {
  const requestedState = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('state')
    : null;

  if (requestedState === 'loading') return new Promise(() => undefined);
  if (requestedState === 'error') throw new Error('The local workspace could not be loaded.');
  if (requestedState) {
    const preview = await import('./dev/previewFixtures');
    if (requestedState === 'authority-preview') return [preview.demoSystemStatus, preview.demoCollaborationState, preview.previewAgentIdentityState, preview.emptyMandateState, preview.authorityPreviewState, preview.emptyApprovalState, preview.emptyScenarioState, preview.emptyEvidenceState, preview.emptyContextBrokerState, preview.emptyFederationState];
    if (requestedState === 'approval-preview') return [preview.demoSystemStatus, preview.demoCollaborationState, preview.previewAgentIdentityState, preview.emptyMandateState, preview.authorityPreviewState, preview.approvalPreviewState, preview.emptyScenarioState, preview.emptyEvidenceState, preview.emptyContextBrokerState, preview.emptyFederationState];
    if (requestedState === 'context-preview') return [preview.demoSystemStatus, preview.demoCollaborationState, preview.previewAgentIdentityState, preview.emptyMandateState, preview.authorityPreviewState, preview.emptyApprovalState, preview.emptyScenarioState, preview.emptyEvidenceState, preview.contextPreviewState, preview.emptyFederationState];
    if (requestedState === 'federation-preview') return [preview.demoSystemStatus, preview.demoCollaborationState, preview.previewAgentIdentityState, preview.emptyMandateState, preview.authorityPreviewState, preview.emptyApprovalState, preview.emptyScenarioState, preview.emptyEvidenceState, preview.emptyContextBrokerState, preview.federationPreviewState];
    if (requestedState === 'empty') return preview.emptyPreviewWorkspace();
    if (requestedState === 'agent-form') return [preview.demoSystemStatus, preview.demoCollaborationState, preview.previewAgentIdentityState, preview.emptyMandateState, preview.authorityPreviewState, preview.emptyApprovalState, preview.emptyScenarioState, preview.emptyEvidenceState, preview.emptyContextBrokerState, preview.emptyFederationState];
  }
  if (!window.h2a) return emptyWorkspaceState();
  return Promise.all([window.h2a.getSystemStatus(), window.h2a.getCollaborationState(), window.h2a.getAgentIdentityState(), window.h2a.getMandateState(), window.h2a.getOrganizationAuthorityState(), window.h2a.getAuthorityApprovalState(), window.h2a.getScenarioState(), window.h2a.getEvidenceExplorerState(defaultEvidenceQuery), window.h2a.getContextBrokerState(), window.h2a.getFederationState()]);
}

async function loadEnterpriseOverview(): Promise<EnterpriseOverviewState> {
  const requestedState = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('state') : null;
  if (requestedState === 'loading') return new Promise(() => undefined);
  if (requestedState === 'enterprise-preview') return (await import('./dev/previewFixtures')).enterprisePreviewState;
  if (!window.h2a) return emptyEnterpriseState;
  return window.h2a.getEnterpriseOverview();
}

async function loadFinalAcceptance(): Promise<FinalAcceptanceState> {
  if (!window.h2a) return emptyAcceptanceState;
  return window.h2a.getFinalAcceptanceState();
}

async function loadCeremony(): Promise<CeremonyState> {
  if (!window.h2a) return emptyCeremonyState;
  return window.h2a.getCeremonyState();
}
async function loadGuidedBootstrap(): Promise<GuidedBootstrapState> { return window.h2a ? window.h2a.getGuidedBootstrapState() : emptyGuidedBootstrapState; }

type WorkspaceLoadState = 'loading' | 'ready' | 'error';

export function App(): React.JSX.Element {
  const [workspaceEnabled, setWorkspaceEnabled] = useState(() => new URLSearchParams(window.location.search).get('experience') !== 'classic');
  const [workspaceExtraSurface, setWorkspaceExtraSurface] = useState<'settings' | 'acceptance' | 'enrollment'>();
  const [workspaceGoalId, setWorkspaceGoalId] = useState<string>();
  const [route, setRoute] = useState<AppRoute>(() => {
    const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('state') : null;
    return preview === 'authority-preview' ? 'people-authority' : preview === 'approval-preview' ? 'authority-inbox' : preview === 'context-preview' ? 'context-broker' : preview === 'federation-preview' ? 'federation' : preview === 'enterprise-preview' ? 'evidence' : preview === 'acceptance-preview' ? 'demo-gate' : 'command-floor';
  });
  const [status, setStatus] = useState<SystemStatus>(emptySystemStatus);
  const [collaboration, setCollaboration] = useState<CollaborationState>(emptyCollaborationState);
  const [agentIdentity, setAgentIdentity] = useState<AgentIdentityState>(emptyAgentIdentityState);
  const [mandates, setMandates] = useState<MandateState>(emptyMandateState);
  const [organization, setOrganization] = useState<OrganizationAuthorityState>(emptyOrganizationState);
  const [approvals, setApprovals] = useState<AuthorityApprovalState>(emptyApprovalState);
  const [verificationPurpose, setVerificationPurpose] = useState('authorize H2A command floor');
  const [verificationHumanId, setVerificationHumanId] = useState<string>();
  const [scenarios, setScenarios] = useState<ScenarioState>(emptyScenarioState);
  const [evidence, setEvidence] = useState<EvidenceExplorerState>(emptyEvidenceState);
  const [evidenceSearch, setEvidenceSearch] = useState('');
  const [contextBroker, setContextBroker] = useState<ContextBrokerState>(emptyContextBrokerState);
  const [federation, setFederation] = useState<FederationState>(emptyFederationState);
  const [enterprise, setEnterprise] = useState<EnterpriseOverviewState>(emptyEnterpriseState);
  const [acceptance, setAcceptance] = useState<FinalAcceptanceState>(emptyAcceptanceState);
  const [ceremony, setCeremony] = useState<CeremonyState>(emptyCeremonyState);
  const [bootstrap, setBootstrap] = useState<GuidedBootstrapState>(emptyGuidedBootstrapState);
  const [projectDelivery, setProjectDelivery] = useState<ProjectDeliveryState>(emptyProjectDelivery);
  const [goalWorkGraph, setGoalWorkGraph] = useState<GoalWorkGraphState>(emptyGoalWorkGraph);
  const [appearance, setAppearance] = useState<AppearancePreferences>(emptyAppearancePreferences);
  const [office, setOffice] = useState<OfficeState>(emptyOfficeState);
  const [operatorSnapshot, setOperatorSnapshot] = useState<ControlPlaneSnapshot>();
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [modeChangePending, setModeChangePending] = useState(false);
  const [workflowDetour, setWorkflowDetour] = useState<GuidedWorkflowAction>();
  const [officeWorkspace, setOfficeWorkspace] = useState<OfficeWorkspaceId>();
  const [loadState, setLoadState] = useState<WorkspaceLoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [readinessError, setReadinessError] = useState('');
  const [proofChallengeError, setProofChallengeError] = useState('');
  const proofCompletionPending = useRef(false);
  const desiredMode = useRef<PresentationMode>(emptyAppearancePreferences.presentation_mode);
  const hasLoadedWorkspace = useRef(false);

  const applyControlPlaneSnapshot = useCallback((next: ControlPlaneSnapshot): void => {
    const canonical = next.canonical;
    setStatus(canonical.system);
    setCollaboration(canonical.collaboration);
    setAgentIdentity(canonical.agent_identity);
    setMandates(canonical.mandates);
    setOrganization(canonical.organization);
    setApprovals(canonical.approvals);
    setScenarios(canonical.scenarios);
    setEvidence(canonical.evidence);
    setContextBroker(canonical.context_broker);
    setFederation(canonical.federation);
    setEnterprise(canonical.enterprise);
    setAcceptance(canonical.final_acceptance);
    setCeremony(canonical.ceremony);
    setBootstrap(canonical.guided_bootstrap);
    setProjectDelivery(canonical.project_delivery);
    setGoalWorkGraph(canonical.goal_work_graph ?? emptyGoalWorkGraph);
    setAppearance(next.appearance);
    setOffice(next.office);
    setOperatorSnapshot(next);
    hasLoadedWorkspace.current = true;
    desiredMode.current = next.appearance.presentation_mode;
    setSelectedAgentId((current) => retainSelectedAgentId(current, canonical.collaboration.workplace.agents));
    setLoadError('');
    setReadinessError('');
    setLoadState('ready');
  }, []);

  const changePresentationMode = useCallback(async (mode: PresentationMode): Promise<void> => {
    if (mode === desiredMode.current || modeChangePending) return;
    const previous = appearance.presentation_mode;
    desiredMode.current = mode;
    setAppearance((current) => ({ ...current, presentation_mode: mode }));
    if (!controlPlane) return;
    setModeChangePending(true);
    try {
      const next = await controlPlane.execute({ type: 'appearance.set', presentation_mode: mode });
      applyControlPlaneSnapshot(next);
    } catch (error) {
      desiredMode.current = previous;
      setAppearance((current) => ({ ...current, presentation_mode: previous }));
      setLoadError(error instanceof Error ? error.message : 'The presentation preference could not be saved.');
      setLoadState('error');
    } finally {
      setModeChangePending(false);
    }
  }, [appearance.presentation_mode, applyControlPlaneSnapshot, modeChangePending]);

  const selectWorkflow = useCallback(async (workflowId: GuidedWorkflowId): Promise<void> => {
    if (!controlPlane || modeChangePending) return;
    setModeChangePending(true);
    try { applyControlPlaneSnapshot(await controlPlane.execute({ type: 'workflow.select', workflow_id: workflowId })); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'The guided workflow could not be selected.'); setLoadState('error'); }
    finally { setModeChangePending(false); }
  }, [applyControlPlaneSnapshot, modeChangePending]);

  const requestProof = useCallback(async (purpose: string, requestedHumanId?: string, command = 'protected-command'): Promise<'challenge' | 'route'> => {
    const humanId = requestedHumanId ?? bootstrap.administrator_human_id ?? bootstrap.operator_human_id ?? organization.memberships.find((item) => item.status === 'active')?.human_id;
    if (!humanId || !controlPlane) {
      setVerificationPurpose(purpose);
      setVerificationHumanId(requestedHumanId);
      setRoute('human-proof');
      await changePresentationMode('control');
      return 'route';
    }
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (active && !active.id) active.id = `proof-source-${crypto.randomUUID()}`;
    applyControlPlaneSnapshot(await controlPlane.execute({
      type: 'human-proof.request', human_id: humanId, purpose, command,
      source_route: route, source_mode: appearance.presentation_mode,
      source_scroll_y: Math.max(0, Math.round(window.scrollY)), source_focus_id: active?.id ?? null,
      continuation_mode: 'refresh-only', continuation_operation_key: null, sensitivity: 'non-sensitive'
    }));
    return 'challenge';
  }, [appearance.presentation_mode, applyControlPlaneSnapshot, bootstrap.administrator_human_id, bootstrap.operator_human_id, changePresentationMode, organization.memberships, route]);

  const continueWorkflow = useCallback(async (action: GuidedWorkflowAction): Promise<void> => {
    if (action.kind === 'orchestrate') {
      if (!controlPlane || !office.workflow.active_step) return;
      setModeChangePending(true);
      try {
        applyControlPlaneSnapshot(await controlPlane.execute({ type: 'workflow.advance', workflow_id: office.workflow.selected_workflow_id, step_id: office.workflow.active_step.step_id }));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'The guided operation failed. Retry remains at this step.');
        setLoadState('error');
      } finally { setModeChangePending(false); }
      return;
    }
    if (action.destination === 'human-proof' && action.proof_purpose) {
      const presentation = await requestProof(action.proof_purpose, action.proof_human_id ?? undefined, `workflow.${office.workflow.selected_workflow_id}`);
      if (presentation === 'route') setWorkflowDetour(action);
      return;
    }
    if (appearance.presentation_mode === 'office') {
      setOfficeWorkspace(workspaceForRoute(action.destination));
      return;
    }
    setWorkflowDetour(action);
    if (action.proof_purpose) setVerificationPurpose(action.proof_purpose);
    setVerificationHumanId(action.proof_human_id ?? undefined);
    setRoute(action.destination);
    await changePresentationMode('control');
  }, [applyControlPlaneSnapshot, changePresentationMode, office.workflow.active_step, office.workflow.selected_workflow_id, requestProof]);

  const completeProofChallenge = useCallback(async (proofId: string): Promise<void> => {
    const challenge = operatorSnapshot?.human_proof_challenge;
    if (!challenge || !controlPlane || proofCompletionPending.current) return;
    proofCompletionPending.current = true;
    setProofChallengeError('');
    try {
      applyControlPlaneSnapshot(await controlPlane.execute({ type: 'human-proof.complete', challenge_id: challenge.challenge_id, proof_id: proofId, source_route: challenge.source_route, source_mode: challenge.source_mode }));
    } catch (error) {
      setProofChallengeError(challengeFailureMessage(error, resolveHumanProofSubject(challenge.human_id, bootstrap, organization).displayName));
      throw error;
    } finally { proofCompletionPending.current = false; }
  }, [applyControlPlaneSnapshot, bootstrap, operatorSnapshot?.human_proof_challenge, organization]);

  const dismissVerifiedProof = useCallback(async (continueSensitive = false): Promise<void> => {
    const challenge = operatorSnapshot?.human_proof_challenge;
    if (!challenge || !controlPlane || challenge.status !== 'verified') return;
    if (continueSensitive) applyControlPlaneSnapshot(await controlPlane.execute({ type: 'human-proof.continue', challenge_id: challenge.challenge_id, source_route: challenge.source_route, source_mode: challenge.source_mode }));
    const next = await controlPlane.execute({ type: 'human-proof.dismiss', challenge_id: challenge.challenge_id });
    applyControlPlaneSnapshot(next);
    if (!next.human_proof_challenge) {
      window.scrollTo({ top: challenge.source_scroll_y, behavior: 'instant' });
      if (challenge.source_focus_id) document.getElementById(challenge.source_focus_id)?.focus({ preventScroll: true });
    }
    setProofChallengeError('');
  }, [applyControlPlaneSnapshot, operatorSnapshot?.human_proof_challenge]);

  useEffect(() => {
    const challenge = operatorSnapshot?.human_proof_challenge;
    if (challenge?.status !== 'verified' || challenge.sensitivity === 'sensitive-confirm') return undefined;
    const timer = window.setTimeout(() => { void dismissVerifiedProof(); }, 900);
    return () => window.clearTimeout(timer);
  }, [dismissVerifiedProof, operatorSnapshot?.human_proof_challenge]);

  const cancelProofChallenge = useCallback(async (): Promise<void> => {
    const challenge = operatorSnapshot?.human_proof_challenge;
    if (!challenge || !controlPlane) return;
    const next = await controlPlane.execute({ type: 'human-proof.cancel', challenge_id: challenge.challenge_id });
    applyControlPlaneSnapshot(next);
    window.dispatchEvent(new Event('h2a:proof-cancelled'));
    if (!next.human_proof_challenge) {
      window.scrollTo({ top: challenge.source_scroll_y, behavior: 'instant' });
      if (challenge.source_focus_id) document.getElementById(challenge.source_focus_id)?.focus({ preventScroll: true });
    }
    setProofChallengeError('');
  }, [applyControlPlaneSnapshot, operatorSnapshot?.human_proof_challenge]);

  const returnToWorkflow = useCallback(async (): Promise<void> => {
    setWorkflowDetour(undefined);
    await changePresentationMode('office');
  }, [changePresentationMode]);

  const refreshWorkspace = useCallback(async (): Promise<void> => {
    if (!hasLoadedWorkspace.current) setLoadState('loading');
    setLoadError('');
    try {
      const requestedState = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('state') : null;
      if (!requestedState && controlPlane) {
        const next = controlPlane.current() ? await controlPlane.refresh() : await controlPlane.connect();
        applyControlPlaneSnapshot(next);
        return;
      }
      const [workspace, nextEnterprise, nextAcceptance, nextCeremony, nextBootstrap] = await Promise.all([loadWorkspace(), loadEnterpriseOverview(), loadFinalAcceptance(), loadCeremony(), loadGuidedBootstrap()]);
      const [nextStatus, nextCollaboration, nextAgentIdentity, nextMandates, nextOrganization, nextApprovals, nextScenarios, nextEvidence, nextContextBroker, nextFederation] = workspace;
      setStatus(nextStatus);
      setCollaboration(nextCollaboration);
      setAgentIdentity(nextAgentIdentity);
      setMandates(nextMandates);
      setOrganization(nextOrganization);
      setApprovals(nextApprovals);
      setScenarios(nextScenarios);
      setEvidence(nextEvidence);
      setContextBroker(nextContextBroker);
      setFederation(nextFederation);
      setEnterprise(nextEnterprise);
      setAcceptance(nextAcceptance);
      setCeremony(nextCeremony);
      setBootstrap(nextBootstrap);
      setSelectedAgentId((current) => retainSelectedAgentId(current, nextCollaboration.workplace.agents));
      hasLoadedWorkspace.current = true;
      setLoadState('ready');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'The local workspace could not be loaded.');
      if (!hasLoadedWorkspace.current) setLoadState('error');
    }
  }, [applyControlPlaneSnapshot]);

  const repairReadiness = useCallback(async (command: OperatorReadiness): Promise<void> => {
    if (!controlPlane || modeChangePending) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (active && !active.id) active.id = `readiness-source-${crypto.randomUUID()}`;
    setModeChangePending(true);
    setReadinessError('');
    try {
      applyControlPlaneSnapshot(await controlPlane.execute({
        type: 'readiness.repair', readiness_id: command.readiness_id, expected_generation_hash: command.generation_hash,
        source_route: route, source_mode: appearance.presentation_mode, source_scroll_y: Math.max(0, Math.round(window.scrollY)), source_focus_id: active?.id ?? null
      }));
      } catch (error) {
      setReadinessError(error instanceof Error ? error.message : 'Prerequisite repair could not start.');
    } finally { setModeChangePending(false); }
  }, [appearance.presentation_mode, applyControlPlaneSnapshot, modeChangePending, route]);

  useEffect(() => {
    const unsubscribeSnapshot = controlPlane?.subscribeSnapshots(applyControlPlaneSnapshot);
    const unsubscribeConnection = controlPlane?.subscribeConnection((connection) => {
      if (connection === 'connected') return;
      setLoadError(connection === 'stale'
        ? 'The operator connection is stale. Cached completion and authority are read-only until a canonical snapshot is restored.'
        : 'The operator connection is disconnected. Protected commands are unavailable.');
      setLoadState('error');
    });
    void refreshWorkspace();
    return () => { unsubscribeSnapshot?.(); unsubscribeConnection?.(); };
  }, [applyControlPlaneSnapshot, refreshWorkspace]);

  useEffect(() => {
    if (!workflowDetour || appearance.presentation_mode !== 'control') return;
    if (office.workflow.next_action?.action_id === workflowDetour.action_id) return;
    setWorkflowDetour(undefined);
    void changePresentationMode('office');
  }, [appearance.presentation_mode, changePresentationMode, office.workflow.next_action?.action_id, workflowDetour]);

  const snapshot = collaboration.workplace;
  const selectedAgent = useMemo<AgentRuntimeSummary | undefined>(
    () => snapshot.agents.find((agent) => agent.id === selectedAgentId),
    [selectedAgentId, snapshot.agents]
  );
  const hasLiveAgent = snapshot.agents.some((agent) => agent.provider !== 'scripted');
  const runtimeMode = hasLiveAgent ? 'Live and scripted orchestration' : 'Scripted rehearsal only';
  const runtimeTrust = enterprise.posture.trust_modes.governed > 0
    ? 'Governed present'
    : enterprise.posture.trust_modes['connected-observed'] > 0
      ? 'Connected-observed ceiling'
      : 'Unverified';

  const controlContent = (
    <>
      {loadState === 'loading' && <WorkspaceLoadingState />}
      {loadState === 'error' && (
        <div className="state-page">
          <StatePanel
            title="Workspace unavailable"
            description={`${loadError} Check the local data files and retry.`}
            actionLabel="Retry"
            tone="error"
            onAction={() => void refreshWorkspace()}
          />
        </div>
      )}
      {loadState === 'ready' && operatorSnapshot?.readiness && <ReadinessCenter state={operatorSnapshot.readiness} mode="control" route={route} busy={modeChangePending} error={readinessError} onRepair={(command) => void repairReadiness(command)} onRoute={setRoute} />}
      {loadState === 'ready' && route === 'command-floor' && (
        <CommandFloor
          collaboration={collaboration}
          selectedAgent={selectedAgent}
          onAgentSelect={setSelectedAgentId}
          identityState={agentIdentity}
          organizationState={organization}
          mandateState={mandates}
          scenarioState={scenarios}
          onCollaborationStateChange={setCollaboration}
          onIdentityStateChange={(nextState, selectedBindingId) => {
            setAgentIdentity(nextState);
            void refreshWorkspace().then(() => { if (selectedBindingId) setSelectedAgentId(selectedBindingId); });
          }}
          onHumanProofRequired={() => { void requestProof('authorize H2A command floor', bootstrap.administrator_human_id ?? undefined, 'command-floor.add-agent'); }}
          onScenarioStateChange={setScenarios}
          onWorkspaceRefresh={() => void refreshWorkspace()}
          onMandatesRequested={() => setRoute('mandates')}
          enterpriseState={enterprise}
          ceremonyState={ceremony}
          projectDelivery={projectDelivery}
          approvals={approvals}
          onProjectDeliveryChange={setProjectDelivery}
          onProjectApprovalRequested={(next) => { setApprovals(next); setRoute('authority-inbox'); }}
          goalWorkGraph={goalWorkGraph}
          onGoalWorkGraphChange={(next) => { setGoalWorkGraph(next); void refreshWorkspace(); }}
        />
      )}
      {loadState === 'ready' && route === 'human-proof' && <HumanProofView verificationPurpose={verificationPurpose} targetHumanId={verificationHumanId} livenessMode={status.livenessMode} onVerificationComplete={() => { void refreshWorkspace(); }} />}
      {loadState === 'ready' && route === 'people-authority' && <PeopleAuthorityView state={organization} onStateChange={setOrganization} onHumanProofRequired={() => { void requestProof('administer organization authority', bootstrap.administrator_human_id ?? undefined, 'organization.authority'); }} />}
      {loadState === 'ready' && route === 'authority-inbox' && <AuthorityInbox state={approvals} organization={organization} collaboration={collaboration} ceremony={ceremony} onStateChange={setApprovals} onRefresh={refreshWorkspace} onProofRequired={(purpose, humanId) => { void requestProof(purpose, humanId, 'authority.approval'); }} />}
      {loadState === 'ready' && route === 'mandates' && (
        <MandatesView
          state={mandates}
          identityState={agentIdentity}
          organizationState={organization}
          onStateChange={(next) => { setMandates(next); void refreshWorkspace(); }}
          onHumanProofRequired={() => { void requestProof('administer protected mandates', bootstrap.administrator_human_id ?? undefined, 'mandates.authority'); }}
        />
      )}
      {loadState === 'ready' && route === 'evidence' && <EvidenceExplorer state={evidence} enterprise={enterprise} initialSearch={evidenceSearch} onStateChange={setEvidence} onRefresh={refreshWorkspace} />}
      {loadState === 'ready' && route === 'context-broker' && <ContextBrokerView state={contextBroker} organization={organization} identity={agentIdentity} collaboration={collaboration} ceremony={ceremony} onStateChange={setContextBroker} onHumanProofRequired={() => { void requestProof('administer protected context', bootstrap.administrator_human_id ?? undefined, 'context.authority'); }} />}
      {loadState === 'ready' && route === 'federation' && <FederationView state={federation} organization={organization} ceremony={ceremony} onStateChange={setFederation} onOrganizationChange={setOrganization} onHumanProofRequired={() => { void requestProof('administer trusted federation peers', bootstrap.administrator_human_id ?? undefined, 'federation.authority'); }} />}
      {loadState === 'ready' && route === 'demo-gate' && <FinalAcceptanceView state={acceptance} ceremony={ceremony} bootstrap={bootstrap} systemStatus={status} onCeremonyStateChange={setCeremony} onBootstrapStateChange={setBootstrap} onRefresh={refreshWorkspace} onProofRequired={(purpose, humanId) => { void requestProof(purpose, humanId, 'bootstrap.human-readiness'); }} onConductorRoute={(stepId) => setRoute(conductorControlRoute(stepId))} />}
      {loadState === 'ready' && route === 'settings' && <SettingsView status={status} />}
    </>
  );

  const officeWorkspaceContent = officeWorkspace === 'organization' && workspaceEnabled ? <WorkspaceAuthoritySummary state={organization} onProof={(purpose, humanId) => { void requestProof(purpose, humanId, 'workspace.organization'); }} />
    : officeWorkspace === 'organization' ? <PeopleAuthorityView state={organization} onStateChange={(next) => { setOrganization(next); void refreshWorkspace(); }} onHumanProofRequired={() => { void requestProof('administer organization authority', bootstrap.administrator_human_id ?? undefined, 'office.organization'); }} />
    : officeWorkspace === 'agents' && workspaceEnabled ? <WorkspaceAgentConnections identity={agentIdentity} organization={organization} onStateChange={(next, selectedBindingId) => { setAgentIdentity(next); if (selectedBindingId) setSelectedAgentId(selectedBindingId); void refreshWorkspace(); }} onHumanProofRequired={() => { void requestProof('authorize H2A command floor', bootstrap.administrator_human_id ?? undefined, 'workspace.agent'); }} />
      : officeWorkspace === 'agents' ? <CommandFloor collaboration={collaboration} selectedAgent={selectedAgent} onAgentSelect={setSelectedAgentId} identityState={agentIdentity} organizationState={organization} mandateState={mandates} scenarioState={scenarios} onIdentityStateChange={(next, selectedBindingId) => { setAgentIdentity(next); if (selectedBindingId) setSelectedAgentId(selectedBindingId); void refreshWorkspace(); }} onCollaborationStateChange={(next) => { setCollaboration(next); void refreshWorkspace(); }} onHumanProofRequired={() => { void requestProof('authorize H2A command floor', bootstrap.administrator_human_id ?? undefined, 'office.agent'); }} onScenarioStateChange={setScenarios} onWorkspaceRefresh={() => void refreshWorkspace()} onMandatesRequested={() => setOfficeWorkspace('context')} enterpriseState={enterprise} ceremonyState={ceremony} projectDelivery={projectDelivery} approvals={approvals} onProjectDeliveryChange={(next) => { setProjectDelivery(next); void refreshWorkspace(); }} onProjectApprovalRequested={(next) => { setApprovals(next); setOfficeWorkspace('approvals'); }} goalWorkGraph={goalWorkGraph} onGoalWorkGraphChange={(next) => { setGoalWorkGraph(next); void refreshWorkspace(); }} />
      : officeWorkspace === 'tasks' && workspaceEnabled ? <WorkspacePlanSummary state={goalWorkGraph} selectedGoalId={workspaceGoalId} organization={organization} onStateChange={(next) => { setGoalWorkGraph(next); void refreshWorkspace(); }} onProof={(purpose, humanId) => { void requestProof(purpose, humanId, 'workspace.work-graph'); }} />
        : officeWorkspace === 'tasks' ? <GoalWorkGraphPanel compact projects={projectDelivery} organization={organization} canonicalState={goalWorkGraph} onStateChange={(next) => { setGoalWorkGraph(next); void refreshWorkspace(); }} onHumanProofRequired={() => { void requestProof('approve collaborative work graph', bootstrap.administrator_human_id ?? undefined, 'office.work-graph'); }} />
        : officeWorkspace === 'collaboration' ? <OfficeCollaborationWorkspace office={office} onOpenEvidence={(reference) => { setEvidenceSearch(reference); setOfficeWorkspace('evidence'); }} />
          : officeWorkspace === 'pairing' ? <CoworkerPairingPanel organization={organization} onHumanProofRequired={() => { void requestProof('administer trusted federation peers', bootstrap.administrator_human_id ?? undefined, 'office.pairing'); }} onConnected={() => void refreshWorkspace()} />
            : officeWorkspace === 'approvals' && workspaceEnabled ? <WorkspaceDecisionCenter state={approvals} organization={organization} onStateChange={(next) => { setApprovals(next); void refreshWorkspace(); }} onProof={(purpose, humanId) => { void requestProof(purpose, humanId, 'workspace.approval'); }} />
              : officeWorkspace === 'approvals' ? <AuthorityInbox state={approvals} organization={organization} collaboration={collaboration} ceremony={ceremony} onStateChange={(next) => { setApprovals(next); void refreshWorkspace(); }} onRefresh={refreshWorkspace} onProofRequired={(purpose, humanId) => { void requestProof(purpose, humanId, 'office.approval'); }} />
                : officeWorkspace === 'context' && workspaceEnabled ? <WorkspaceSharingCenter state={contextBroker} organization={organization} onStateChange={(next) => { setContextBroker(next); void refreshWorkspace(); }} onProof={(purpose, humanId) => { void requestProof(purpose, humanId, 'workspace.context'); }} />
                  : officeWorkspace === 'context' ? <ContextBrokerView state={contextBroker} organization={organization} identity={agentIdentity} collaboration={collaboration} ceremony={ceremony} onStateChange={(next) => { setContextBroker(next); void refreshWorkspace(); }} onHumanProofRequired={() => { void requestProof('administer protected context', bootstrap.administrator_human_id ?? undefined, 'office.context'); }} />
                    : officeWorkspace === 'delivery' && workspaceEnabled ? <WorkspaceProjectConnector state={projectDelivery} onStateChange={(next) => { setProjectDelivery(next); void refreshWorkspace(); }} />
                      : officeWorkspace === 'delivery' ? <ProjectDeliveryPanel agents={snapshot.agents} identity={agentIdentity} approvals={approvals} canonicalState={projectDelivery} onStateChange={(next) => { setProjectDelivery(next); void refreshWorkspace(); }} onApprovalRequested={(next) => { setApprovals(next); setOfficeWorkspace('approvals'); }} />
                        : officeWorkspace === 'security' && workspaceEnabled ? <WorkspaceSecurityCenter onRefresh={refreshWorkspace} />
                          : officeWorkspace === 'security' ? <SecurityValidationConsole onWorkspaceRefresh={refreshWorkspace} />
                            : officeWorkspace === 'evidence' && workspaceEnabled ? <WorkspaceReceipts state={evidence} initialSearch={evidenceSearch} onStateChange={setEvidence} />
                              : officeWorkspace === 'evidence' ? <EvidenceExplorer state={evidence} enterprise={enterprise} initialSearch={evidenceSearch} onStateChange={setEvidence} onRefresh={refreshWorkspace} />
                      : null;

  const switchWorkspace = (enabled: boolean): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('experience', enabled ? 'workspace' : 'classic');
    window.history.replaceState(null, '', url);
    setWorkspaceEnabled(enabled);
    setOfficeWorkspace(undefined);
    setWorkspaceExtraSurface(undefined);
  };
  const openConductorStepInWorkspace = (stepId: string): void => {
    setWorkspaceExtraSurface(undefined);
    if (['organization-authority', 'workload-identity'].includes(stepId)) { window.location.hash = 'people'; return; }
    if (['shared-provider-task', 'external-framework', 'context-minimization'].includes(stepId)) { window.location.hash = 'canvas'; return; }
    if (stepId === 'project-integration') { window.location.hash = 'workspaces'; return; }
    if (['runtime-containment', 'adversarial-controls', 'restart-recovery'].includes(stepId)) { window.location.hash = 'security'; setOfficeWorkspace('security'); return; }
    if (stepId === 'evidence-reconstruction') { setOfficeWorkspace('evidence'); return; }
    setOfficeWorkspace(conductorWorkspace(stepId));
  };
  const extraContent = workspaceExtraSurface === 'settings' ? <SettingsView status={status} />
    : workspaceExtraSurface === 'acceptance' ? <WorkspaceDemonstrationGuide acceptance={acceptance} bootstrap={bootstrap} systemStatus={status} onRefresh={refreshWorkspace} onProofRequired={(purpose, humanId) => { void requestProof(purpose, humanId, 'workspace.bootstrap'); }} onOpenStep={openConductorStepInWorkspace} />
      : workspaceExtraSurface === 'enrollment' ? <HumanProofView verificationPurpose={verificationPurpose} targetHumanId={verificationHumanId} livenessMode={status.livenessMode} onVerificationComplete={() => { void refreshWorkspace(); }} /> : null;
  const workspaceSurfaceTitles = { organization: 'People & authority', agents: 'Agent connections', tasks: 'Edit work plan', collaboration: 'Collaboration records', pairing: 'Connect a coworker', approvals: 'Human decisions', context: 'Sharing boundaries', delivery: 'Projects & integration', security: 'Security validation', evidence: 'Work receipts' };

  return (
    <div className={appearance.reduced_motion ? 'appearance-reduced-motion' : undefined}>
      {workspaceEnabled ? <WorkspaceExperience canonical={operatorSnapshot?.canonical} connected={loadState === 'ready' && operatorSnapshot?.operator_session.status === 'connected'} loading={loadState === 'loading'} error={loadError} onRefresh={refreshWorkspace}
        onOpenSurface={(surface, goalId) => { if (surface === 'settings' || surface === 'acceptance' || surface === 'enrollment') { setOfficeWorkspace(undefined); setWorkspaceExtraSurface(surface); } else { setWorkspaceExtraSurface(undefined); setWorkspaceGoalId(goalId); setOfficeWorkspace(surface); } }}
        onEvidence={(reference) => { setEvidenceSearch(reference); setWorkspaceExtraSurface(undefined); setOfficeWorkspace('evidence'); }}
        onProof={(purpose, humanId) => { void requestProof(purpose, humanId, 'workspace.protected-action').then((result) => { if (result === 'route') setWorkspaceExtraSurface('enrollment'); }); }}
        onClassic={() => switchWorkspace(false)}
        surface={workspaceExtraSurface && extraContent ? { title: workspaceExtraSurface === 'settings' ? 'Connections & setup' : workspaceExtraSurface === 'acceptance' ? 'Readiness & receipts' : 'Confirm your identity', content: extraContent, close: () => setWorkspaceExtraSurface(undefined) } : officeWorkspace && officeWorkspaceContent ? { title: workspaceSurfaceTitles[officeWorkspace], content: officeWorkspaceContent, close: () => setOfficeWorkspace(undefined) } : undefined}
      /> : appearance.presentation_mode === 'office' ? (
        <><OfficeShell
          office={office}
          appearance={appearance}
          status={status}
          agents={snapshot.agents}
          selectedAgent={selectedAgent}
          workspaceState={loadState}
          modeChangePending={modeChangePending}
          onModeChange={(mode) => void changePresentationMode(mode)}
          onAgentSelect={setSelectedAgentId}
          onOpenEvidence={(reference) => { setEvidenceSearch(reference); setOfficeWorkspace('evidence'); }}
          onOpenTechnicalTrace={(traceId) => { setEvidenceSearch(traceId); setRoute('evidence'); void changePresentationMode('control'); }}
          onRefresh={() => void refreshWorkspace()}
          onWorkflowSelect={(workflowId) => void selectWorkflow(workflowId)}
          onWorkflowContinue={(action) => void continueWorkflow(action)}
          projectDelivery={projectDelivery}
          operatorSession={operatorSnapshot?.operator_session}
          notifications={operatorSnapshot?.notifications ?? []}
          onNotificationRoute={(destination) => setOfficeWorkspace(workspaceForRoute(destination))}
          readiness={operatorSnapshot?.readiness}
          readinessError={readinessError}
          onReadinessRepair={(command) => void repairReadiness(command)}
          onReadinessRoute={(destination) => setOfficeWorkspace(workspaceForRoute(destination))}
          activeWorkspace={officeWorkspace}
          onOpenWorkspace={setOfficeWorkspace}
        />
        {officeWorkspace && officeWorkspaceContent && <OfficeWorkspaceDrawer workspace={officeWorkspace} onClose={() => setOfficeWorkspace(undefined)} onTechnicalDetails={() => { setRoute(officeWorkspaceRoutes[officeWorkspace] as AppRoute); void changePresentationMode('control'); }}>{officeWorkspaceContent}</OfficeWorkspaceDrawer>}</>
      ) : (
        <AppShell
          route={route}
          status={status}
          runtimeMode={runtimeMode}
          runtimeTrust={runtimeTrust}
          workspaceState={loadState}
          presentationMode={appearance.presentation_mode}
          modeChangePending={modeChangePending}
          onPresentationModeChange={(mode) => void changePresentationMode(mode)}
          onRouteChange={setRoute}
          workflowDetour={workflowDetour}
          onReturnToWorkflow={() => void returnToWorkflow()}
          operatorSession={operatorSnapshot?.operator_session}
          notifications={operatorSnapshot?.notifications ?? []}
          onNotificationRoute={(destination) => setRoute(destination as AppRoute)}
        >
          {controlContent}
        </AppShell>
      )}
      {!workspaceEnabled && <button type="button" className="workspace-migration-entry" onClick={() => switchWorkspace(true)}>Return to Work workspace</button>}
      {operatorSnapshot?.human_proof_challenge && ['pending', 'verified'].includes(operatorSnapshot.human_proof_challenge.status) && <HumanProofChallengeDialog challenge={operatorSnapshot.human_proof_challenge} subject={resolveHumanProofSubject(operatorSnapshot.human_proof_challenge.human_id, bootstrap, organization)} livenessMode={status.livenessMode} error={proofChallengeError} onVerified={completeProofChallenge} onContinue={() => dismissVerifiedProof(true)} onCancel={() => void cancelProofChallenge()} />}
    </div>
  );
}
