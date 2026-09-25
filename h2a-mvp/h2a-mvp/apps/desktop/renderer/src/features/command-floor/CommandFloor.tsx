import { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, ClipboardList, Clock3, GitBranch, LockKeyhole, Plus, ShieldCheck } from 'lucide-react';
import type { AgentIdentityState, AgentRuntimeSummary, AuthorityApprovalState, CeremonyState, CollaborationState, EnterpriseOverviewState, GoalWorkGraphState, MandateState, OrganizationAuthorityState, ProjectDeliveryState, ScenarioState } from '@h2a/contracts';
import { StatePanel } from '@h2a/ui';
import { AddAgentDialog, resolveSponsorAuthority } from './components/AddAgentDialog';
import { AgentOperationsPanel } from './components/AgentOperationsPanel';
import { AgentWorkCard } from './components/AgentWorkCard';
import { AssignmentDetailPanel } from './components/AssignmentDetailPanel';
import { CreateAssignmentDialog } from './components/CreateAssignmentDialog';
import { WorkAssignmentKanban } from './components/WorkAssignmentKanban';
import { ScenarioControlPanel } from './components/ScenarioControlPanel';
import { EnterpriseCommandPosture } from '../evidence/EnterpriseTopologyView';
import { RealCollaborationConsole } from './components/RealCollaborationConsole';
import { ProjectDeliveryPanel } from './components/ProjectDeliveryPanel';
import { GoalWorkGraphPanel } from './components/GoalWorkGraphPanel';

interface CommandFloorProps {
  collaboration: CollaborationState;
  selectedAgent?: AgentRuntimeSummary;
  onAgentSelect(agentId: string): void;
  identityState: AgentIdentityState;
  organizationState: OrganizationAuthorityState;
  mandateState: MandateState;
  scenarioState: ScenarioState;
  onIdentityStateChange(state: AgentIdentityState, selectedBindingId?: string): void;
  onCollaborationStateChange(state: CollaborationState): void;
  onHumanProofRequired(): void;
  onScenarioStateChange(state: ScenarioState): void;
  onWorkspaceRefresh(): void;
  onMandatesRequested(): void;
  enterpriseState: EnterpriseOverviewState;
  ceremonyState: CeremonyState;
  projectDelivery: ProjectDeliveryState;
  approvals: AuthorityApprovalState;
  onProjectDeliveryChange(state: ProjectDeliveryState): void;
  onProjectApprovalRequested(state: AuthorityApprovalState): void;
  goalWorkGraph?: GoalWorkGraphState;
  onGoalWorkGraphChange?(state: GoalWorkGraphState): void;
}

export function CommandFloor({ collaboration, selectedAgent, onAgentSelect, identityState, organizationState, mandateState, scenarioState, onIdentityStateChange, onCollaborationStateChange, onHumanProofRequired, onScenarioStateChange, onWorkspaceRefresh, onMandatesRequested, enterpriseState, ceremonyState, projectDelivery, approvals, onProjectDeliveryChange, onProjectApprovalRequested, goalWorkGraph, onGoalWorkGraphChange }: CommandFloorProps): React.JSX.Element {
  const snapshot = collaboration.workplace;
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(snapshot.assignments[0]?.id ?? '');
  const [inspector, setInspector] = useState<'assignment' | 'agent'>('assignment');
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [createAssignmentOpen, setCreateAssignmentOpen] = useState(false);
  const [lifecycleError, setLifecycleError] = useState('');
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const selectedAssignment = useMemo(() => snapshot.assignments.find((assignment) => assignment.id === selectedAssignmentId), [selectedAssignmentId, snapshot.assignments]);

  useEffect(() => {
    if (snapshot.assignments.some((assignment) => assignment.id === selectedAssignmentId)) return;
    setSelectedAssignmentId(snapshot.assignments[0]?.id ?? '');
  }, [selectedAssignmentId, snapshot.assignments]);

  const activeCount = snapshot.agents.filter((agent) => agent.status === 'working').length;
  const openCount = snapshot.assignments.filter((item) => item.status !== 'complete').length;
  const attentionCount = snapshot.assignments.filter((item) => item.status === 'approval' || item.status === 'blocked').length;
  const selectedPassport = identityState.passports.find((passport) => passport.passport_id === selectedAgent?.passportId);
  const selectedBinding = identityState.bindings.find((binding) => binding.binding_id === selectedAgent?.id);
  const sponsorAuthority = useMemo(() => resolveSponsorAuthority(organizationState), [organizationState]);

  async function updatePassport(action: 'suspend' | 'reactivate' | 'revoke'): Promise<void> {
    if (!window.h2a || !selectedPassport) return;
    setLifecycleBusy(true); setLifecycleError('');
    try { onIdentityStateChange(await window.h2a.updateAgentPassport({ passportId: selectedPassport.passport_id, action, sponsorAuthority }), selectedBinding?.binding_id); }
    catch (error) { setLifecycleError(error instanceof Error ? error.message : 'Passport update failed.'); }
    finally { setLifecycleBusy(false); }
  }

  async function updateRuntime(action: 'disconnect' | 'reconnect'): Promise<void> {
    if (!window.h2a || !selectedBinding) return;
    setLifecycleBusy(true); setLifecycleError('');
    try { onIdentityStateChange(await window.h2a.updateAgentRuntime({ bindingId: selectedBinding.binding_id, action }), selectedBinding.binding_id); }
    catch (error) { setLifecycleError(error instanceof Error ? error.message : 'Runtime update failed.'); }
    finally { setLifecycleBusy(false); }
  }

  async function rotateAttestation(): Promise<void> {
    if (!window.h2a || !selectedBinding || !selectedPassport) return;
    const passportV2 = identityState.passportsV2?.find((item) => item.passport_id === selectedPassport.passport_id);
    if (!passportV2) return;
    setLifecycleBusy(true); setLifecycleError('');
    try {
      const expiresAt = new Date(Math.min(Date.now() + 8 * 60 * 60 * 1000, new Date(passportV2.expires_at).getTime())).toISOString();
      onIdentityStateChange(await window.h2a.attestAgentRuntime({ passportId: passportV2.passport_id, bindingId: selectedBinding.binding_id, connectorManifestId: passportV2.connector_manifest_id, adapterVersion: 'h2a-local-v1', trustMode: selectedBinding.provider === 'scripted' ? 'unverified' : 'connected-observed', trustEvidenceRefs: [], expiresAt }), selectedBinding.binding_id);
    } catch (error) { setLifecycleError(error instanceof Error ? error.message : 'Runtime attestation failed.'); }
    finally { setLifecycleBusy(false); }
  }

  if (snapshot.agents.length === 0) {
  return <div className="command-floor"><GoalWorkGraphPanel projects={projectDelivery} organization={organizationState} canonicalState={goalWorkGraph} onStateChange={onGoalWorkGraphChange} onHumanProofRequired={onHumanProofRequired} /><ProjectDeliveryPanel agents={[]} identity={identityState} approvals={approvals} canonicalState={projectDelivery} onStateChange={onProjectDeliveryChange} onApprovalRequested={onProjectApprovalRequested} /><section className="project-agent-prerequisite" aria-label="Agent prerequisite"><StatePanel title="No agents are registered" description="Issue an Agent Passport and active runtime before creating delivery assignments." actionLabel="Add agent" onAction={() => setAddAgentOpen(true)} /></section><AddAgentDialog open={addAgentOpen} identityState={identityState} organizationState={organizationState} onClose={() => setAddAgentOpen(false)} onCreated={onIdentityStateChange} onHumanProofRequired={onHumanProofRequired} /></div>;
  }

  return (
    <div className="command-floor">
      <section className="metric-strip" aria-label="Command Floor status summary">
        <Metric icon={Activity} label="Agents active" value={`${activeCount} / ${snapshot.agents.length}`} tone="blue" />
        <Metric icon={GitBranch} label="Open assignments" value={`${openCount}`} tone="neutral" />
        <Metric icon={LockKeyhole} label="Needs attention" value={`${attentionCount}`} tone="amber" />
        <Metric icon={ShieldCheck} label="Evidence chain" value="Verified" tone="green" />
      </section>
      <EnterpriseCommandPosture state={enterpriseState} />
      <RealCollaborationConsole ceremony={ceremonyState} onWorkspaceRefresh={onWorkspaceRefresh} />
      <GoalWorkGraphPanel projects={projectDelivery} organization={organizationState} canonicalState={goalWorkGraph} onStateChange={onGoalWorkGraphChange} onHumanProofRequired={onHumanProofRequired} />
      <ProjectDeliveryPanel agents={snapshot.agents} identity={identityState} approvals={approvals} canonicalState={projectDelivery} onStateChange={onProjectDeliveryChange} onApprovalRequested={onProjectApprovalRequested} />

      <section className="workplace-section" aria-labelledby="workplace-title">
        <div className="section-heading-row"><div><p className="section-kicker">LIVE WORKPLACE</p><h2 id="workplace-title">Agent roster</h2></div><div className="roster-actions"><div className="last-sync"><Clock3 size={15} /> Snapshot loaded</div><button data-control-id="command-floor.agent.open-create" className="secondary-button compact-command" type="button" onClick={() => setAddAgentOpen(true)}><Plus size={16} /> Add agent</button><button data-control-id="command-floor.assignment.open-create" className="primary-button compact-command" type="button" onClick={() => setCreateAssignmentOpen(true)}><ClipboardList size={16} /> Create assignment</button></div></div>
        <div className="agent-grid">{snapshot.agents.map((agent) => <AgentWorkCard key={agent.id} agent={agent} selected={agent.id === selectedAgent?.id} onSelect={() => { onAgentSelect(agent.id); setInspector('agent'); }} />)}</div>
      </section>

      <ScenarioControlPanel state={scenarioState} mandates={mandateState} onStateChange={onScenarioStateChange} onWorkspaceRefresh={onWorkspaceRefresh} onMandatesRequested={onMandatesRequested} />

      <div className="command-grid">
        <WorkAssignmentKanban assignments={snapshot.assignments} agents={snapshot.agents} selectedAssignmentId={selectedAssignmentId} onAssignmentSelect={(id) => { setSelectedAssignmentId(id); setInspector('assignment'); }} />
        <section className="command-inspector" aria-label="Command Floor inspector">
          <div className="inspector-switch" role="tablist" aria-label="Inspector mode"><button type="button" role="tab" aria-selected={inspector === 'assignment'} className={inspector === 'assignment' ? 'active' : ''} onClick={() => setInspector('assignment')}><ClipboardList size={15} /> Assignment</button><button type="button" role="tab" aria-selected={inspector === 'agent'} className={inspector === 'agent' ? 'active' : ''} onClick={() => setInspector('agent')}><Bot size={15} /> Agent</button></div>
          {inspector === 'assignment' ? <AssignmentDetailPanel assignment={selectedAssignment} agents={snapshot.agents} messages={collaboration.messages} responses={collaboration.responses} onStateChange={onCollaborationStateChange} /> : <AgentOperationsPanel agent={selectedAgent} identityState={identityState} activity={collaboration.activity} messages={collaboration.messages} events={snapshot.events} lifecycleBusy={lifecycleBusy} lifecycleError={lifecycleError} onPassportAction={(action) => void updatePassport(action)} onRuntimeAction={(action) => void updateRuntime(action)} onRotateAttestation={() => void rotateAttestation()} />}
        </section>
      </div>

      <AddAgentDialog open={addAgentOpen} identityState={identityState} organizationState={organizationState} onClose={() => setAddAgentOpen(false)} onCreated={onIdentityStateChange} onHumanProofRequired={onHumanProofRequired} />
      <CreateAssignmentDialog open={createAssignmentOpen} agents={snapshot.agents} assignments={snapshot.assignments} onClose={() => setCreateAssignmentOpen(false)} onCreated={(state, assignmentId) => { onCollaborationStateChange(state); setSelectedAssignmentId(assignmentId); setInspector('assignment'); }} />
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string; tone: string }): React.JSX.Element {
  return <div className="metric-item"><span className={`metric-icon metric-icon-${tone}`}><Icon size={18} /></span><div><span>{label}</span><strong>{value}</strong></div></div>;
}
