import { ArrowRight, ClipboardCheck, ShieldAlert, ShieldCheck, History, UserCheck, Database, Clock3, Activity, Info, CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Snapshot, DiscoveryScan } from '../../governance/contracts';
import type { RoomRun } from '../../governance/room-runtime';
import { ProductMark } from './ProductMark';

type Select = (selection: { kind: 'agent' | 'approval' | 'finding' | 'event' | 'memory'; id: string }) => void;
type Go = (page: 'decisions' | 'discovery' | 'assurance' | 'trace' | 'operations' | 'estate') => void;
const text = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const date = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function Widget({ title, description, count, action, children }: { title: string; description: string; count?: number; action?: { label: string; click: () => void }; children: ReactNode }) {
  return <section className="ciso-widget"><header><div><h2>{title}{count !== undefined && <span className="widget-count">{count}</span>}</h2><p>{description}</p></div>{action && <button className="text-button" onClick={action.click}>{action.label}<ArrowRight /></button>}</header><div className="widget-content">{children}</div></section>;
}
function Quiet({ children }: { children: ReactNode }) { return <div className="widget-empty"><CheckCircle2 /><p>{children}</p></div>; }
export function DecisionMetrics({ state, runs }: { state: Snapshot; runs: RoomRun[] }) {
  const today = new Date().toDateString();
  const metrics = [
    { label: 'Awaiting approval', value: state.approvals.filter(a => a.status === 'pending').length + runs.filter(r => r.status === 'pending').length, note: 'Actions and CLI builds', icon: ClipboardCheck, tone: 'blue' },
    { label: 'Memory to review', value: state.memories.filter(m => m.status === 'proposed').length, note: 'Excluded from future context', icon: Database, tone: 'amber' },
    { label: 'Denied actions', value: state.actions.filter(a => a.status === 'denied').length, note: 'Recorded policy denials · all time', icon: ShieldAlert, tone: 'red' },
    { label: 'Decisions today', value: state.events.filter(e => ['HUMAN_APPROVED', 'HUMAN_REJECTED', 'MEMORY_REVIEWED'].includes(e.event_type) && new Date(e.timestamp).toDateString() === today).length, note: 'Recorded decisions, not execution count', icon: CheckCircle2, tone: 'green' },
  ];
  return <section className="decision-metrics" aria-label="Decision summary">{metrics.map(m => <article key={m.label}><span className={`metric-symbol ${m.tone}`}><m.icon /></span><div><span>{m.label}</span><strong>{m.value}</strong><small>{m.note}</small></div></article>)}</section>;
}
export function CisoOverview({ state, scan, runs, query, open, go }: { state: Snapshot; scan: DiscoveryScan | null; runs: RoomRun[]; query: string; open: Select; go: Go }) {
  const approvals = state.approvals.filter(a => a.status === 'pending');
  const builds = runs.filter(r => r.status === 'pending');
  const memories = state.memories.filter(m => m.status === 'proposed');
  const findings = state.assurance.findings.filter(f => f.status === 'open');
  const unowned = state.agents.filter(a => !a.owner);
  const count = approvals.length + builds.length + memories.length;
  const q = query.toLowerCase();
  const requests = [
    ...approvals.map(a => ({ id: a.approval_id, title: text(a.action), detail: 'One exact action under an existing mandate.', agent: state.agents.find(v => v.agent_id === a.agent_id), at: a.requested_at, kind: 'Action approval', click: () => open({ kind: 'approval', id: a.approval_id }) })),
    ...builds.map(r => ({ id: r.run_id, title: r.title, detail: r.objective, agent: state.agents.find(v => v.agent_id === r.steps[0]?.agent_id), at: r.created_at, kind: 'Build approval', click: () => go('decisions') })),
    ...memories.map(m => ({ id: m.memory_id, title: m.title, detail: 'Review before this knowledge can be reused by agents.', agent: state.agents.find(v => v.agent_id === m.agent_id), at: m.created_at, kind: 'Memory review', click: () => go('operations') })),
  ].filter(r => `${r.title} ${r.detail} ${r.agent?.name || ''}`.toLowerCase().includes(q));
  const changes = [...state.events].reverse().filter(e => `${e.event_type} ${e.actor_id}`.toLowerCase().includes(q)).slice(0, 4);
  return <div className="page ciso-overview">
    <div className="page-head"><div><span>CISO OVERVIEW</span><h1>{count ? `${count} decision${count === 1 ? '' : 's'} need your attention.` : 'Your AI estate. Evidence before assurance.'}</h1><p><Info />{!state.assurance.coverage.last_scan_at ? 'Run discovery to establish coverage. No scan does not mean no risk.' : state.assurance.coverage.scan_errors ? `${state.assurance.coverage.scan_errors} discovery warning${state.assurance.coverage.scan_errors === 1 ? '' : 's'}: visibility is incomplete. Inspect source coverage.` : `${state.assurance.coverage.observed_entities} entities observed across configured sources. This is not complete company-wide coverage.`}</p></div><div className="page-dateline">{new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}<small>{state.session.mode === 'named-user' ? `Welcome, ${state.session.name}.` : 'Local operator · single organization'}</small></div></div>
    <div className="ciso-overview-grid">
      <Widget title="Needs your decision" description="Review the action, owner and authority before allowing work." count={count} action={{ label: 'All decisions', click: () => go('decisions') }}>
        {requests.slice(0, 3).map(r => <article className="decision-card" key={r.id}><ProductMark entity={r.agent} /><div className="decision-card-main"><h3>{r.title}</h3><span>{r.agent?.name || 'Governed room request'}</span><p>{r.detail}</p><span className="soft-tag blue">{r.kind}</span></div><div className="decision-card-owner"><small>Accountable owner</small><strong>{r.agent?.owner?.name || 'Not assigned'}</strong><small><Clock3 />{date(r.at)}</small></div><button className="primary" onClick={r.click}>Review</button></article>)}
        {!requests.length && <Quiet>{count ? 'No requests match your search.' : 'No pending approvals. Review discovery and control gaps to understand the current boundary.'}</Quiet>}
      </Widget>
      <Widget title="Requires investigation" description="Observed gaps—not invented incidents or containment claims." count={findings.length + unowned.length} action={{ label: 'View assurance', click: () => go('assurance') }}>
        {findings.slice(0, 2).map(f => <article className="finding-preview" key={f.finding_id}><span className={`metric-symbol ${['high', 'critical'].includes(f.severity) ? 'red' : 'amber'}`}><ShieldAlert /></span><div><h3>{f.title}</h3><p>{f.summary}</p><span className={`soft-tag ${['high', 'critical'].includes(f.severity) ? 'red' : 'amber'}`}>{text(f.severity)} · {f.capability}</span></div><button className="secondary" onClick={() => open({ kind: 'finding', id: f.finding_id })}>Inspect</button></article>)}
        {!findings.length && unowned.slice(0, 2).map(a => <article className="finding-preview" key={a.agent_id}><ProductMark entity={a} /><div><h3>{a.name}</h3><p>No accountable human has been assigned.</p><span className="soft-tag amber">Owner required</span></div><button className="secondary" onClick={() => open({ kind: 'agent', id: a.agent_id })}>Assign</button></article>)}
        {!findings.length && !unowned.length && <Quiet>No recorded internal control gaps. Unconnected systems remain outside this assessment.</Quiet>}
      </Widget>
      <Widget title="Significant changes" description="Actual identity, authority and collaboration events." action={{ label: 'View records', click: () => go('trace') }}>
        {changes.map(e => <button className="change-row" key={e.event_id} onClick={() => open({ kind: 'event', id: e.event_id })}><span className="metric-symbol blue"><History /></span><span><strong>{text(e.event_type)}</strong><small>{state.humans.find(h => h.human_id === e.actor_id)?.name || state.agents.find(a => a.agent_id === e.agent_id)?.name || e.actor_id}</small></span><time>{date(e.timestamp)}</time></button>)}
        {!changes.length && <Quiet>No matching evidence records yet.</Quiet>}
      </Widget>
      <Widget title="Continuous assurance" description="What is governed, what was observed and what needs review." action={{ label: 'Inspect coverage', click: () => go('assurance') }}>
        <button className="change-row" onClick={() => go('estate')}><span className="metric-symbol blue"><UserCheck /></span><span><strong>{state.agents.filter(a => a.owner && a.passport && a.mandate?.status === 'active').length} of {state.agents.length} registered identities governed</strong><small>Human owner, signed Passport and active mandate</small></span><ArrowRight /></button>
        <button className="change-row" onClick={() => go('discovery')}><span className="metric-symbol amber"><Activity /></span><span><strong>{scan?.agents.length ?? state.assurance.coverage.observed_entities} observed AI entities</strong><small>{state.assurance.coverage.scan_errors} source warnings · scan the server and configured sources</small></span><ArrowRight /></button>
        <button className="change-row" onClick={() => go('trace')}><span className={`metric-symbol ${state.integrity.status === 'verified' ? 'green' : 'red'}`}><ShieldCheck /></span><span><strong>Evidence ledger: {state.integrity.status}</strong><small>{state.integrity.recordCount} records · integrity does not prove external enforcement</small></span><ArrowRight /></button>
      </Widget>
    </div>
  </div>;
}
export function AssurancePriorities({ state, open }: { state: Snapshot; open: Select }) {
  const findings = state.assurance.findings.filter(f => f.status === 'open');
  const gaps = state.agents.filter(a => !a.owner || !a.passport || a.mandate?.status !== 'active');
  return <section className="assurance-priorities" aria-label="Assurance priorities">
    <article><header><h2>Needs attention</h2><span className="widget-count">{findings.length}</span></header><p>Evidence-backed findings from measured controls.</p>{findings[0] ? <button className="priority-subject" onClick={() => open({ kind: 'finding', id: findings[0].finding_id })}><ShieldAlert /><span><strong>{findings[0].title}</strong><small>{findings[0].summary}</small></span><ArrowRight /></button> : <small>No recorded open findings. Coverage still matters.</small>}</article>
    <article><header><h2>Authority to review</h2><span className="widget-count">{gaps.length}</span></header><p>Registered identities missing an active control.</p>{gaps[0] ? <button className="priority-subject" onClick={() => open({ kind: 'agent', id: gaps[0].agent_id })}><ProductMark entity={gaps[0]} /><span><strong>{gaps[0].name}</strong><small>{!gaps[0].owner ? 'Human owner required' : !gaps[0].passport ? 'Passport required' : 'Active mandate required'}</small></span><ArrowRight /></button> : <small>No gaps among currently registered identities.</small>}</article>
    <article><header><h2>Evidence coverage</h2><span className="widget-count">{state.assurance.coverage.scan_errors}</span></header><p>Warnings from the latest configured discovery scan.</p><div className="priority-subject"><Info /><span><strong>{state.assurance.coverage.last_scan_at ? `Last scan ${date(state.assurance.coverage.last_scan_at)}` : 'Discovery has not run'}</strong><small>{state.assurance.coverage.configured_sources} configured sources. Unconnected systems are not assessed.</small></span></div></article>
  </section>;
}
