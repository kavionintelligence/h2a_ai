import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Download, FileCheck2, Filter,
  Fingerprint, GitBranch, KeyRound, RotateCcw, Search, ShieldCheck, UserRound, XCircle
} from 'lucide-react';
import {
  defaultEvidenceQuery,
  type AuthorityEventType,
  type AuthorizationDecision,
  type EvidenceExplorerState,
  type EnterpriseOverviewState,
  type EvidenceExportReceipt,
  type EvidenceInvestigationRecord,
  type EvidenceQuery,
  type PolicyReasonCode
} from '@h2a/contracts';
import { StatePanel, StatusBadge } from '@h2a/ui';
import { EnterpriseTopologyView } from './EnterpriseTopologyView';

interface EvidenceExplorerProps {
  state: EvidenceExplorerState;
  onStateChange(state: EvidenceExplorerState): void;
  onRefresh(): Promise<void>;
  enterprise: EnterpriseOverviewState;
  initialSearch?: string;
}

export function EvidenceExplorer({ state, onStateChange, onRefresh, enterprise, initialSearch = '' }: EvidenceExplorerProps): React.JSX.Element {
  const [view, setView] = useState<'timeline' | 'enterprise' | 'controls'>(() => import.meta.env.DEV && new URLSearchParams(window.location.search).get('state') === 'enterprise-preview' ? 'enterprise' : 'timeline');
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState<AuthorityEventType | ''>('');
  const [actorType, setActorType] = useState<EvidenceQuery['actorTypes'][number] | ''>('');
  const [decision, setDecision] = useState<AuthorizationDecision | ''>('');
  const [reasonCode, setReasonCode] = useState<PolicyReasonCode | ''>('');
  const [integrityOnly, setIntegrityOnly] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(state.events[0]?.event.event_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<EvidenceExportReceipt>();

  useEffect(() => {
    if (!state.events.some((record) => record.event.event_id === selectedEventId)) setSelectedEventId(state.events[0]?.event.event_id ?? '');
  }, [selectedEventId, state.events]);

  useEffect(() => {
    if (!initialSearch || initialSearch === search) return;
    setSearch(initialSearch);
    void applyFilters({ ...defaultEvidenceQuery, search: initialSearch });
  }, [initialSearch]);

  const selected = useMemo(() => state.events.find((record) => record.event.event_id === selectedEventId), [selectedEventId, state.events]);
  const completeCount = state.events.filter((record) => record.resolutionStatus === 'complete').length;
  const deniedCount = state.events.filter((record) => record.decision?.decision === 'DENY').length;

  function currentQuery(): EvidenceQuery {
    return { ...defaultEvidenceQuery, search, eventTypes: eventType ? [eventType] : [], actorTypes: actorType ? [actorType] : [], decisions: decision ? [decision] : [], reasonCodes: reasonCode ? [reasonCode] : [], integrityOnly };
  }

  async function applyFilters(query = currentQuery()): Promise<void> {
    if (!window.h2a) return;
    setBusy(true); setError('');
    try { onStateChange(await window.h2a.getEvidenceExplorerState(query)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Evidence query failed.'); }
    finally { setBusy(false); }
  }

  function resetFilters(): void {
    setSearch(''); setEventType(''); setActorType(''); setDecision(''); setReasonCode(''); setIntegrityOnly(false);
    void applyFilters(defaultEvidenceQuery);
  }

  async function exportBundle(): Promise<void> {
    if (!window.h2a) return;
    setBusy(true); setError(''); setReceipt(undefined);
    try { setReceipt(await window.h2a.exportEvidenceBundle({ query: currentQuery() })); await onRefresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Audit export failed.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="evidence-page">
      <header className="evidence-header">
        <div><p className="section-kicker">CHAIN OF CUSTODY</p><h2>Evidence Explorer</h2><p>Investigate authority, identity, decisions, execution, and containment from persisted records.</p></div>
        <div className="evidence-header-actions"><StatusBadge label={state.integrity.status === 'verified' ? 'Integrity verified' : state.integrity.status === 'failed' ? 'Integrity failed' : 'Integrity warning'} tone={state.integrity.status === 'verified' ? 'verified' : state.integrity.status === 'failed' ? 'danger' : 'approval'} /><button data-control-id="evidence.export" className="primary-button" type="button" disabled={!window.h2a || busy} onClick={() => void exportBundle()}><Download size={16} /> Export JSON</button></div>
      </header>

      <section className="evidence-metrics" aria-label="Evidence summary">
        <EvidenceMetric icon={FileCheck2} label="Ledger records" value={String(state.integrity.recordCount)} />
        <EvidenceMetric icon={Search} label="Query matches" value={`${state.matchedEvents} / ${state.totalEvents}`} />
        <EvidenceMetric icon={Fingerprint} label="Complete attribution" value={String(completeCount)} />
        <EvidenceMetric icon={ShieldCheck} label="Denied decisions" value={String(deniedCount)} />
      </section>

      <IntegrityBanner state={state} />
      {!window.h2a && <div className="evidence-runtime-notice"><AlertTriangle size={17} /> Full ledger investigation and export require the local desktop runtime.</div>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      {receipt && <div className="export-receipt" role="status"><CheckCircle2 size={17} /><div><strong>Audit bundle exported</strong><span className="mono">{receipt.relativePath}</span></div><code>{receipt.bundleHash}</code></div>}

      <div className="evidence-view-switch" role="tablist" aria-label="Evidence view">
        <button type="button" role="tab" aria-selected={view === 'timeline'} className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}><GitBranch size={15} /> Investigation</button>
        <button type="button" role="tab" aria-selected={view === 'enterprise'} className={view === 'enterprise' ? 'active' : ''} onClick={() => setView('enterprise')}><ShieldCheck size={15} /> Enterprise topology</button>
        <button type="button" role="tab" aria-selected={view === 'controls'} className={view === 'controls' ? 'active' : ''} onClick={() => setView('controls')}><ShieldCheck size={15} /> Controls</button>
      </div>

      {view === 'timeline' ? <>
        <form className="evidence-filters" onSubmit={(event) => { event.preventDefault(); void applyFilters(); }}>
          <label className="evidence-search"><span className="sr-only">Search evidence</span><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event, trace, actor, mandate, reason..." /></label>
          <label><span>Event</span><select value={eventType} onChange={(event) => setEventType(event.target.value as AuthorityEventType | '')}><option value="">All events</option>{state.availableEventTypes.map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}</select></label>
          <label><span>Actor</span><select value={actorType} onChange={(event) => setActorType(event.target.value as typeof actorType)}><option value="">All actors</option><option value="human">Human</option><option value="agent">Agent</option><option value="system">System</option></select></label>
          <label><span>Decision</span><select value={decision} onChange={(event) => setDecision(event.target.value as AuthorizationDecision | '')}><option value="">All decisions</option><option value="ALLOW">Allow</option><option value="DENY">Deny</option><option value="REQUIRES_HUMAN_APPROVAL">Human approval</option></select></label>
          <label><span>Reason</span><select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as PolicyReasonCode | '')}><option value="">All reasons</option>{state.availableReasonCodes.map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}</select></label>
          <label className="integrity-filter"><input type="checkbox" checked={integrityOnly} onChange={(event) => setIntegrityOnly(event.target.checked)} /> Integrity findings</label>
          <button data-control-id="evidence.refresh" className="primary-button icon-command" type="submit" disabled={!window.h2a || busy} title="Apply evidence filters"><Filter size={16} /><span className="sr-only">Apply evidence filters</span></button>
          <button className="secondary-button icon-command" type="button" disabled={!window.h2a || busy} onClick={resetFilters} title="Reset evidence filters"><RotateCcw size={16} /><span className="sr-only">Reset evidence filters</span></button>
        </form>

        <section className="evidence-workbench" aria-label="Evidence investigation workbench">
          <div className="evidence-event-list"><div className="evidence-column-title"><span>Event timeline</span><b>{state.events.length}</b></div>{state.events.length === 0 ? <StatePanel title="No matching evidence" description="Adjust filters or create governed activity in the desktop runtime." compact /> : state.events.map((record) => <EventRow key={record.event.event_id} record={record} selected={record.event.event_id === selectedEventId} onSelect={() => setSelectedEventId(record.event.event_id)} />)}</div>
          <div className="evidence-chain"><div className="evidence-column-title"><span>Attribution chain</span>{selected && <StatusBadge label={formatLabel(selected.resolutionStatus)} tone={selected.resolutionStatus === 'complete' ? 'verified' : selected.resolutionStatus === 'partial' ? 'approval' : 'neutral'} />}</div>{selected ? <ChainInspector record={selected} /> : <EvidenceEmpty />}</div>
          <div className="decision-inspector"><div className="evidence-column-title"><span>Decision inspector</span>{selected?.decision && <StatusBadge label={selected.decision.decision} tone={selected.decision.decision === 'ALLOW' ? 'verified' : selected.decision.decision === 'DENY' ? 'danger' : 'approval'} />}</div>{selected ? <DecisionInspector record={selected} /> : <EvidenceEmpty />}</div>
        </section>
      </> : view === 'enterprise' ? <EnterpriseTopologyView state={enterprise} /> : <ControlsView state={state} />}
    </div>
  );
}

function IntegrityBanner({ state }: { state: EvidenceExplorerState }): React.JSX.Element {
  const verified = state.integrity.status === 'verified';
  const Icon = verified ? CheckCircle2 : XCircle;
  return <section className={`integrity-banner ${verified ? 'verified' : 'failed'}`}><Icon size={19} /><div><strong>{verified ? 'Hash chain verified' : 'Evidence integrity failure'}</strong><span>{verified ? `${state.integrity.recordCount} canonical records resolve to the current ledger head.` : `${state.integrity.reason ?? 'Verification failed.'}${state.integrity.failedEventId ? ` Failed at ${state.integrity.failedEventId}.` : ''}`}</span></div><code>{state.integrity.headHash ?? 'empty-ledger'}</code></section>;
}

function EvidenceMetric({ icon: Icon, label, value }: { icon: typeof FileCheck2; label: string; value: string }): React.JSX.Element {
  return <div><Icon size={17} /><span>{label}</span><strong>{value}</strong></div>;
}

function EventRow({ record, selected, onSelect }: { record: EvidenceInvestigationRecord; selected: boolean; onSelect(): void }): React.JSX.Element {
  const Icon = record.integrityStatus === 'failed' ? XCircle : record.event.event_type.includes('DENIED') || record.decision?.decision === 'DENY' ? AlertTriangle : CheckCircle2;
  return <button type="button" className={`evidence-event-row ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onSelect}><Icon size={15} /><div><strong>{formatLabel(record.event.event_type)}</strong><span>{record.event.actor.type} / {record.event.actor.id}</span><code>{record.event.trace_id}</code></div><time>{formatTime(record.event.timestamp)}</time></button>;
}

function ChainInspector({ record }: { record: EvidenceInvestigationRecord }): React.JSX.Element {
  const chain = record.identityChain;
  const nodes = [
    { icon: UserRound, label: 'Human Identity', value: chain.humanDisplayName ?? chain.humanId, detail: chain.humanId },
    { icon: Fingerprint, label: 'Human Proof', value: chain.humanProofId },
    { icon: KeyRound, label: 'Agent Passport', value: chain.agentName ?? chain.passportId, detail: chain.passportId },
    { icon: GitBranch, label: 'Runtime Binding', value: chain.runtimeId, detail: chain.provider ? `${chain.provider} / ${chain.model}` : undefined },
    { icon: ShieldCheck, label: 'Mandate Authority', value: chain.mandateId, detail: chain.mandateStatus }
  ];
  return <div className="chain-inspector"><div className="chain-nodes">{nodes.map(({ icon: Icon, label, value, detail }, index) => <div className={`chain-node-row ${value ? '' : 'missing'}`} key={label}><span><Icon size={15} /></span><div><small>{label}</small><strong>{value ?? 'Unresolved'}</strong>{detail && detail !== value && <code>{detail}</code>}</div>{index < nodes.length - 1 && <ChevronRight size={14} />}</div>)}</div>{chain.delegationPath.length > 0 && <div className="audit-delegation"><span>Delegation ancestry</span>{chain.delegationPath.map((edge) => <div key={edge.delegationId}><code>{edge.parentMandateId}</code><ChevronRight size={13} /><code>{edge.childMandateId}</code></div>)}</div>}{record.missingLinks.length > 0 && <div className="missing-links"><AlertTriangle size={15} /><span>Missing persisted links: {record.missingLinks.join(', ')}</span></div>}<dl className="audit-facts"><Fact label="Assignment" value={chain.assignmentId} /><Fact label="Scenario run" value={chain.scenarioRunId} /><Fact label="Event hash" value={record.event.event_hash} /></dl></div>;
}

function DecisionInspector({ record }: { record: EvidenceInvestigationRecord }): React.JSX.Element {
  return <div className="decision-detail">{record.decision ? <><dl className="audit-facts"><Fact label="Decision" value={record.decision.decision} /><Fact label="Reason code" value={record.decision.reasonCode} /><Fact label="Action" value={record.decision.action} /><Fact label="Resource" value={record.decision.resource} /><Fact label="Evaluated" value={formatTime(record.decision.evaluatedAt)} /><Fact label="Disclosure" value={record.decision.disclosure.join(', ') || 'None'} /></dl>{record.approval && <div className="approval-evidence"><strong>Human Approval</strong><span>{record.approval.status}</span><code>{record.approval.approvalRequestId}</code></div>}</> : <p className="quiet-empty">This event does not have an authorization decision on its trace.</p>}<details className="payload-inspector"><summary>Persisted event payload</summary><pre>{JSON.stringify(record.event.payload, null, 2)}</pre></details><dl className="audit-facts"><Fact label="Event ID" value={record.event.event_id} /><Fact label="Previous hash" value={record.event.previous_hash ?? 'Genesis record'} /><Fact label="Subject" value={record.event.subject ? `${record.event.subject.type} / ${record.event.subject.id}` : 'No subject'} /></dl></div>;
}

function ControlsView({ state }: { state: EvidenceExplorerState }): React.JSX.Element {
  return <section className="controls-matrix"><header><div><p className="section-kicker">IMPLEMENTED CONTROL MAP</p><h3>Security controls and verification evidence</h3></div><span>{state.controls.filter((control) => control.status === 'implemented').length} implemented / {state.controls.length} total</span></header><div className="control-table" role="table" aria-label="H2A security controls"><div className="control-table-head" role="row"><span>Control</span><span>Objective</span><span>Implementation and verification</span><span>Status</span></div>{state.controls.map((control) => <div className="control-row" role="row" key={control.controlId}><div><code>{control.controlId}</code><strong>{control.title}</strong></div><span>{formatLabel(control.securityObjective)}</span><div><p>{control.implementation}</p><small>{control.verification}</small></div><StatusBadge label={control.status} tone={control.status === 'implemented' ? 'verified' : 'info'} /></div>)}</div></section>;
}

function EvidenceEmpty(): React.JSX.Element { return <div className="evidence-empty"><Search size={20} /><strong>Select an evidence event</strong><span>Identity, authority, decision, and integrity details will appear here.</span></div>; }
function Fact({ label, value }: { label: string; value?: string }): React.JSX.Element { return <div><dt>{label}</dt><dd className="mono">{value ?? 'Not linked'}</dd></div>; }
function formatLabel(value: string): string { return value.replaceAll('_', ' ').replaceAll('-', ' ').toLowerCase().replace(/^./u, (letter) => letter.toUpperCase()); }
function formatTime(value: string): string { return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
