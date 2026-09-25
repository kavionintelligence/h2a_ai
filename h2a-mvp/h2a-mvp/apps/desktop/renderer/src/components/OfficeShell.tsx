import {
  Activity,
  Bot,
  Building2,
  Database,
  ExternalLink,
  FileSearch,
  GitPullRequest,
  ListTodo,
  Network,
  RefreshCw,
  Shield,
  ShieldAlert,
  Users,
  Workflow
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentRuntimeSummary, AppearancePreferences, GuidedWorkflowAction, GuidedWorkflowId, OfficeEntity, OfficeState, OperatorNotification, OperatorReadiness, OperatorReadinessState, OperatorSession, ProjectDeliveryState, SystemStatus } from '@h2a/contracts';
import { PixelOfficeScene } from '../office/PixelOfficeScene';
import { PresentationModeSwitch } from './PresentationModeSwitch';
import { GuidedWorkflowPanel } from '../workflows/GuidedWorkflowPanel';
import { ProjectDeliveryOfficeSummary } from '../features/command-floor/components/ProjectDeliveryPanel';
import { ExecutiveOfficeTour } from './ExecutiveOfficeTour';
import { ReadinessCenter } from './ReadinessCenter';
import type { AppRoute } from './AppShell';
import type { OfficeWorkspaceId } from './OfficeWorkspaceDrawer';

interface OfficeShellProps {
  office: OfficeState;
  appearance: AppearancePreferences;
  status: SystemStatus;
  agents: readonly AgentRuntimeSummary[];
  selectedAgent?: AgentRuntimeSummary;
  workspaceState: 'loading' | 'ready' | 'error';
  modeChangePending: boolean;
  onModeChange(mode: AppearancePreferences['presentation_mode']): void;
  onAgentSelect(agentId: string): void;
  onOpenEvidence(evidenceRef: string): void;
  onOpenTechnicalTrace(traceId: string): void;
  onRefresh(): void;
  onWorkflowSelect(workflowId: GuidedWorkflowId): void;
  onWorkflowContinue(action: GuidedWorkflowAction): void;
  projectDelivery: ProjectDeliveryState;
  operatorSession?: OperatorSession;
  notifications: OperatorNotification[];
  onNotificationRoute(route: string): void;
  readiness?: OperatorReadinessState;
  readinessError?: string;
  onReadinessRepair(command: OperatorReadiness): void;
  onReadinessRoute(route: AppRoute): void;
  activeWorkspace?: OfficeWorkspaceId;
  onOpenWorkspace(workspace: OfficeWorkspaceId): void;
}

const hotspots: Array<{ id: OfficeWorkspaceId; label: string; detail: string; icon: typeof Building2 }> = [
  { id: 'organization', label: 'Live organization', detail: 'People and authority', icon: Building2 },
  { id: 'agents', label: 'Agent roster', detail: 'Identity and runtime', icon: Users },
  { id: 'tasks', label: 'Tasks', detail: 'Composer and work graph', icon: ListTodo },
  { id: 'collaboration', label: 'Collaboration', detail: 'Handoffs and outputs', icon: Workflow },
  { id: 'pairing', label: 'Coworkers', detail: 'Pinned remote boundary', icon: Network },
  { id: 'approvals', label: 'Approvals', detail: 'Paused effects', icon: GitPullRequest },
  { id: 'context', label: 'Context', detail: 'Released and withheld', icon: Database },
  { id: 'delivery', label: 'Project delivery', detail: 'Worktrees and integration', icon: Bot },
  { id: 'security', label: 'Security', detail: 'Denials and containment', icon: Shield },
  { id: 'evidence', label: 'Evidence', detail: 'Trace reconstruction', icon: FileSearch }
];

const acceptanceLabel = (office: OfficeState): string => office.acceptance.total > 0
  ? `${office.acceptance.passed} of ${office.acceptance.total} gates`
  : 'No acceptance ceremony';

export function OfficeShell({
  office,
  appearance,
  status,
  agents,
  selectedAgent,
  workspaceState,
  modeChangePending,
  onModeChange,
  onAgentSelect,
  onOpenEvidence,
  onOpenTechnicalTrace,
  onRefresh,
  onWorkflowSelect,
  onWorkflowContinue,
  projectDelivery,
  operatorSession,
  notifications,
  onNotificationRoute,
    readiness,
    readinessError,
  onReadinessRepair,
  onReadinessRoute,
  activeWorkspace,
  onOpenWorkspace
}: OfficeShellProps): React.JSX.Element {
  const mainRef = useRef<HTMLElement>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string>();
  const selectedEntity = useMemo(() => office.entities.find((entity) => entity.entity_id === selectedEntityId), [office.entities, selectedEntityId]);
  const workingCount = office.entities.filter((entity) => entity.status === 'working').length;

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (selectedEntityId && office.entities.some((entity) => entity.entity_id === selectedEntityId)) return;
    setSelectedEntityId(office.entities.find((entity) => entity.selectable_agent_id === selectedAgent?.id)?.entity_id ?? office.entities[0]?.entity_id);
  }, [office.entities, selectedAgent?.id, selectedEntityId]);

  return (
    <div className="office-shell">
      <header className="office-header">
        <PresentationModeSwitch mode={appearance.presentation_mode} disabled={modeChangePending} onModeChange={onModeChange} />
        <div className="office-brand" aria-label="H2A local office">
          <span className="office-brand-mark" aria-hidden="true"><Bot size={18} /></span>
          <span><strong>H2A</strong><small>LOCAL OFFICE</small></span>
        </div>
        <div className="office-trust" aria-label="Runtime status">
          <span>{office.runtime_mode === 'live-and-scripted' ? 'Live and scripted' : 'Scripted rehearsal'}</span>
          <strong>{office.trust_ceiling === 'connected-observed' ? 'Connected-observed ceiling' : 'Unverified'}</strong>
          <span className={`status-indicator status-indicator-${office.evidence_integrity === 'verified' ? 'verified' : office.evidence_integrity === 'warning' ? 'approval' : 'danger'}`} aria-hidden="true" />
          <span>Evidence {office.evidence_integrity}</span>
        </div>
        <div className="office-session" aria-label="Operator session"><strong>{operatorSession?.status ?? 'recovering'}</strong><span>cursor {operatorSession?.last_confirmed_cursor ?? 0}</span><span>{operatorSession?.attached_observers ?? 0} observer{operatorSession?.attached_observers === 1 ? '' : 's'}</span></div>
      </header>

      <main id="main-content" ref={mainRef} tabIndex={-1} aria-busy={workspaceState === 'loading'} className="office-main">
        <section className="office-scene-region" aria-labelledby="office-scene-title">
          <div className="office-scene-heading">
            <p className="eyebrow">HUMAN-BOUND AGENT OPERATIONS</p>
            <h1 id="office-scene-title">Operations office</h1>
            <p>Canonical identities, assignments, authority, and evidence from this data root.</p>
          </div>

          <nav className="office-hotspots" aria-label="Office operations">
            {hotspots.map(({ id, label, detail, icon: Icon }) => <button data-control-id="office.workspace.open" key={id} type="button" aria-current={activeWorkspace === id ? 'page' : undefined} onClick={() => onOpenWorkspace(id)}><Icon size={17} aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span></button>)}
          </nav>

          <ExecutiveOfficeTour office={office} selectedEntityId={selectedEntityId} onSelect={setSelectedEntityId} onOpenTrace={onOpenTechnicalTrace} />

          <PixelOfficeScene
            office={office}
            agents={agents}
            selectedAgentId={selectedAgent?.id}
            selectedEntityId={selectedEntityId}
            reducedMotion={appearance.reduced_motion}
            onAgentSelect={onAgentSelect}
            onEntitySelect={setSelectedEntityId}
          />

          <div className="office-floor-status" role="status" aria-live="polite">
            <Activity size={17} aria-hidden="true" />
            <span>{workingCount > 0 ? `${workingCount} canonical work signals active` : office.counts.assignments > 0 ? `${office.counts.assignments} persisted assignments; no active work signal` : 'No persisted assignments in the workplace'}</span>
            {office.alerts.total > 0 && <strong><ShieldAlert size={14} aria-hidden="true" /> {office.alerts.blocking} blocking / {office.alerts.total} alerts</strong>}
          </div>
          <section className="office-collaboration-stream" aria-labelledby="office-collaboration-title">
            <header><div><p className="eyebrow">SIGNED COLLABORATION</p><h2 id="office-collaboration-title">Governed handoffs</h2></div><span>{office.collaboration.signals.length} signals</span></header>
            <div className="office-signal-list">{office.collaboration.signals.slice(0, 6).map((signal) => <button data-control-id="office.collaboration.select" key={signal.signal_id} type="button" className={`office-signal office-signal-${signal.status}`} disabled={!signal.target_entity_id} title={signal.target_entity_id ? `Inspect ${signal.title}` : 'Canonical target is not available'} onClick={() => signal.target_entity_id && setSelectedEntityId(signal.target_entity_id)}><span>{signal.kind.replaceAll('-', ' ')}</span><strong>{signal.title}</strong><small>{signal.released_fields.length} released · {signal.withheld_fields.length} withheld · {signal.predecessor_hashes.length} predecessors</small></button>)}{office.collaboration.signals.length === 0 && <p>No persisted collaboration signal is present.</p>}</div>
            <div className="office-portal-list" aria-label="Remote node portals">{office.collaboration.portals.map((portal) => <div key={portal.peer_id} className={`office-portal office-portal-${portal.state}`}><span /> <strong>{portal.label}</strong><small>{portal.state.replaceAll('-', ' ')}</small></div>)}</div>
          </section>
        </section>

        <aside className="office-inspector" aria-label="Office inspector">
          <div className="office-inspector-heading">
            <span>Inspector</span>
            <button data-control-id="office.refresh" type="button" className="icon-button" aria-label="Refresh office state" title="Refresh office state" onClick={onRefresh} disabled={workspaceState === 'loading'}>
              <RefreshCw size={17} aria-hidden="true" />
            </button>
          </div>
          {readiness && <ReadinessCenter state={readiness} mode="office" busy={modeChangePending} error={readinessError} onRepair={onReadinessRepair} onRoute={onReadinessRoute} />}
          {notifications.length > 0 && <section className="office-notifications" aria-label="Actionable notifications"><h2>Attention</h2>{notifications.slice(0, 4).map((item) => item.route && item.action_label ? <button data-control-id="office.notification.open" key={item.notification_id} type="button" className={`operator-notification operator-notification-${item.severity}`} onClick={() => onNotificationRoute(item.route!)}><strong>{item.title}</strong><span>{item.detail}</span><small>{item.action_label}</small></button> : <div key={item.notification_id} className={`operator-notification operator-notification-${item.severity}`}><strong>{item.title}</strong><span>{item.detail}</span></div>)}</section>}
          {selectedEntity ? <OfficeEntityInspector entity={selectedEntity} disabled={modeChangePending} onOpenEvidence={onOpenEvidence} /> : (
            <dl className="office-inspector-facts">
              <div><dt>Selected entity</dt><dd>No canonical entity selected</dd></div>
              <div><dt>Active trace</dt><dd><code title={office.active_trace_id ?? undefined}>{office.active_trace_id ?? 'No active trace'}</code></dd></div>
              <div><dt>Acceptance</dt><dd>{acceptanceLabel(office)}</dd></div>
              <div><dt>Storage</dt><dd>{status.storageMode}</dd></div>
            </dl>
          )}
        </aside>
      </main>

      <footer className="office-command-dock" aria-label="Office next action">
        <ProjectDeliveryOfficeSummary state={projectDelivery} />
        {office.workflow.workflows.length === 6 ? <GuidedWorkflowPanel state={office.workflow} disabled={workspaceState !== 'ready' || modeChangePending} onSelect={onWorkflowSelect} onContinue={onWorkflowContinue} /> : <span>Loading guided workflows</span>}
        <code className="office-active-trace" aria-label="Active trace">{office.active_trace_id ?? 'no-active-trace'}</code>
      </footer>
    </div>
  );
}

function OfficeEntityInspector({ entity, disabled, onOpenEvidence }: { entity: OfficeEntity; disabled: boolean; onOpenEvidence(evidenceRef: string): void }): React.JSX.Element {
  return (
    <div className="office-entity-inspector" data-inspector-entity-id={entity.entity_id} data-inspector-status={entity.status}>
      <div className={`office-entity-status office-entity-status-${entity.status}`}><span /> <strong>{entity.status.replaceAll('-', ' ')}</strong><small>{entity.activity_basis.replaceAll('-', ' ')}</small></div>
      <dl className="office-inspector-facts">
        <InspectorFact label="Entity" value={entity.label} />
        <InspectorFact label="Kind" value={entity.kind.replaceAll('-', ' ')} />
        <InspectorFact label="Canonical ID" value={entity.primary_id} code />
        <InspectorFact label="Detail" value={entity.detail} />
        <InspectorFact label="Provider health" value={entity.provider_health ?? 'Not applicable'} />
        <InspectorFact label="Trace" value={entity.trace_id ?? 'No trace linked'} code />
        <InspectorFact label="Output hash" value={entity.output_hash ?? 'No persisted output hash'} code />
        <InspectorFact label="Reason code" value={entity.reason_code ?? 'No reason code'} code />
      </dl>
      <InspectorList title="Authority chain" values={entity.authority_chain} empty="No authority chain linked" />
      <InspectorList title="Authorized context fields" values={entity.context_fields} empty="No context fields released" />
      <InspectorList title="Withheld context fields" values={entity.withheld_context_fields} empty="No fields withheld" />
      <InspectorList title="Predecessor hashes" values={entity.predecessor_hashes} empty="No predecessor hashes linked" />
      <section className="office-evidence-links" aria-labelledby="office-evidence-links-title">
        <h2 id="office-evidence-links-title">Evidence links</h2>
        {entity.evidence_refs.length === 0 ? <p>No persisted evidence references</p> : entity.evidence_refs.map((reference) => (
          <button data-control-id="office.inspector.open-evidence" key={reference} type="button" disabled={disabled} onClick={() => onOpenEvidence(reference)} title={disabled ? 'Finishing presentation change' : `Open ${reference} in Control Evidence`}>
            <code>{reference}</code><ExternalLink size={13} aria-hidden="true" />
          </button>
        ))}
      </section>
    </div>
  );
}

function InspectorFact({ label, value, code = false }: { label: string; value: string; code?: boolean }): React.JSX.Element {
  return <div><dt>{label}</dt><dd>{code ? <code title={value}>{value}</code> : value}</dd></div>;
}

function InspectorList({ title, values, empty }: { title: string; values: string[]; empty: string }): React.JSX.Element {
  return <section className="office-inspector-list"><h2>{title}</h2>{values.length === 0 ? <p>{empty}</p> : <ol>{values.map((value) => <li key={value}><code>{value}</code></li>)}</ol>}</section>;
}
