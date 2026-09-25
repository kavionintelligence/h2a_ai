import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, Archive, BarChart3, Bot, Boxes, Check, CheckCircle2, ChevronRight, CircleHelp,
  ClipboardCheck, Clock3, Database, FileCheck2, Fingerprint, Gauge, GitBranch, History, KeyRound, LayoutDashboard,
  Loader2, LockKeyhole, Menu, Network, PanelRightClose, RefreshCw, Search, Settings, Shield, ShieldAlert,
  ShieldCheck, SlidersHorizontal, Sparkles, UserCheck, Users, Workflow, X, XCircle, Building2, Bell, Download, ChevronLeft
} from 'lucide-react';
import type { Action, Agent, Approval, AssuranceFinding, AuditEvent, CensusEntity, DiscoveryScan, Memory, Room, Snapshot } from '../../governance/contracts';
import { RoomWorkspace } from './RoomWorkspace';
import { ProductMark } from './ProductMark';
import { CisoOverview, DecisionMetrics, AssurancePriorities } from './CisoWidgets';
import type { RoomRun } from '../../governance/room-runtime';
import { EnterpriseSimulation } from './enterprise-simulation/EnterpriseSimulation';
import { SecurityEntry, SecurityPosture } from './security-posture/SecurityPosture';
import { authorityIssue, workspacePosture } from './security-posture/model';
import { AccessPortal } from './access/AccessPortal';

type Page = 'overview' | 'security' | 'estate' | 'discovery' | 'decisions' | 'operations' | 'assurance' | 'trace' | 'administration';
type Selection = { kind: 'agent' | 'census' | 'approval' | 'action' | 'finding' | 'event' | 'room' | 'memory' | 'connection' | 'source-report' | 'platform-component'; id: string } | null;
type InspectorTab = 'summary' | 'authority' | 'activity' | 'evidence';
type PlatformComponent = { id: string; name: string; status: string; mode: string; endpoint?: string; accepted_sources?: string[] };
type PlatformStatus = {
  product: string; version: string; generated_at: string;
  deployment: { host: string; portable: boolean; persistence: string; auth: string };
  authority: { engine: string; integrity: string; evidence_records: number };
  components: PlatformComponent[];
  intake: { telemetry_events: number; source_reports: number; latest_by_source: Record<string, { report_id: string; status: string; observed_at: string }> };
};
type SourceFinding = { finding_id: string; title: string; severity: 'info' | 'low' | 'medium' | 'high' | 'critical'; agent_id?: string; category: string; detail: string; evidence: Record<string, string | number | boolean | null> };
type SourceReport = { report_id: string; source: string; observed_at: string; received_at: string; collector: string; collector_version?: string; host: string; status: 'healthy' | 'degraded' | 'silent' | 'error'; summary: { observed_agents: number; shadow_agents: number; findings: number }; findings: SourceFinding[]; payload_hash: string };
type RuntimeEvent = { event_id: string; trace_id: string; parent_event_id?: string; occurred_at: string; received_at: string; source: string; kind: string; agent_id?: string; human_id?: string; external_identity?: string; system: string; operation: string; outcome: string; risk: string; evidence: Record<string, string | number | boolean | null>; evidence_hash: string };
type IdentityTraceItem = { lane: 'authority'; timestamp: string; record: AuditEvent } | { lane: 'runtime'; timestamp: string; record: RuntimeEvent };

const nav: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'security', label: 'Security posture', icon: ShieldAlert },
  { id: 'estate', label: 'AI estate', icon: Bot },
  { id: 'discovery', label: 'Discovery', icon: Search },
  { id: 'decisions', label: 'Decisions', icon: ClipboardCheck },
  { id: 'operations', label: 'Operations', icon: Workflow },
  { id: 'assurance', label: 'Assurance', icon: ShieldCheck },
  { id: 'trace', label: 'Identity trace', icon: GitBranch }
];

const stamp = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not available';
const relative = (value?: string | null) => {
  if (!value) return 'Never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
};
const title = (value: string) => value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`);
  return payload as T;
}

export function ByoSyncApp() {
  const hosted = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_BYOSYNC_HOSTED_SIMULATOR === 'true';
  const [simulation, setSimulation] = useState(() => hosted || new URLSearchParams(window.location.search).get('mode') !== 'workspace');
  const switchSimulation = (enabled: boolean) => { const next = hosted || enabled; const url = new URL(window.location.href); url.searchParams.set('mode', next ? 'enterprise' : 'workspace'); window.history.replaceState(null, '', url); setSimulation(next); };
  if (simulation) return <AccessPortal><EnterpriseSimulation onExit={() => switchSimulation(false)} /></AccessPortal>;
  return <RealWorkspace onSimulation={() => switchSimulation(true)} />;
}

function RealWorkspace({ onSimulation }: { onSimulation: () => void }) {
  const [state, setState] = useState<Snapshot | null>(null);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [reports, setReports] = useState<SourceReport[]>([]);
  const [runs, setRuns] = useState<RoomRun[]>([]);
  const [page, setPage] = useState<Page>(()=>new URLSearchParams(window.location.search).get('view')==='security'?'security':'overview');
  const [selection, setSelection] = useState<Selection>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('summary');
  const [scan, setScan] = useState<DiscoveryScan | null>(null);
  const [busy, setBusy] = useState<string | null>('Loading workspace');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = async () => {
    try {
      const [nextState, nextPlatform, nextReports, latestScan, nextRuntime] = await Promise.all([
        api<Snapshot>('/api/state'),
        api<PlatformStatus>('/api/platform/status').catch(() => null),
        api<SourceReport[]>('/api/source-reports?limit=30').catch(() => []),
        api<DiscoveryScan | null>('/api/discovery/latest').catch(() => null),
        api<{ runs: RoomRun[] }>('/api/runtime').catch(() => null),
      ]);
      setState(nextState); setPlatform(nextPlatform); setReports(nextReports);
      if (nextRuntime) setRuns(nextRuntime.runs);
      if (latestScan) setScan(latestScan);
    }
    catch (error) { setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load ByoSync.' }); }
    finally { setBusy(null); }
  };
  useEffect(() => { void refresh(); const timer = setInterval(() => { if (!document.hidden) { void api<Snapshot>('/api/state').then(setState).catch(() => {}); void api<{ runs: RoomRun[] }>('/api/runtime').then(value => setRuns(value.runs)).catch(() => {}); } }, 5000); return () => clearInterval(timer); }, []);
  useEffect(() => { setInspectorTab('summary'); }, [selection]);
  useEffect(() => { const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelection(null); setMenuOpen(false); } }; window.addEventListener('keydown', dismiss); return () => window.removeEventListener('keydown', dismiss); }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [page]);

  const command = async (key: string, path: string, payload: unknown, success: string) => {
    if (busy) return null;
    setBusy(key); setMessage(null);
    try {
      const next = await api<Snapshot>(path, payload);
      setState(next); void refreshPlatform().catch(() => setMessage({ tone: 'error', text: 'Command completed, but platform status refresh failed.' })); setMessage({ tone: 'ok', text: success }); return next;
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Operation failed.' }); return null;
    } finally { setBusy(null); }
  };
  const refreshPlatform = async () => {
    const [nextPlatform, nextReports] = await Promise.all([api<PlatformStatus>('/api/platform/status'), api<SourceReport[]>('/api/source-reports?limit=30')]);
    setPlatform(nextPlatform); setReports(nextReports);
  };
  const runScan = async () => {
    if (busy) return;
    setBusy('Scanning configured sources'); setMessage(null);
    try { const next = await api<DiscoveryScan>('/api/discovery/scan', {}); setScan(next); await refresh(); setMessage({ tone: 'ok', text: `Discovery completed: ${next.agents.length} entities observed.` }); }
    catch (error) { setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Discovery failed.' }); }
    finally { setBusy(null); }
  };
  const runClawScan = async () => {
    if (busy) return;
    setBusy('Scanning OpenClaw with Claw Hunter'); setMessage(null);
    try { await api('/api/discovery/claw-hunter', {}); await refresh(); setMessage({ tone: 'ok', text: 'Claw Hunter completed. Its OpenClaw-only report is in Collector evidence.' }); }
    catch (error) { setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Claw Hunter failed.' }); }
    finally { setBusy(null); }
  };

  const open = (next: Selection) => { setSelection(next); setMenuOpen(false); };
  const pending = state?.approvals.filter(item => item.status === 'pending') ?? [];
  const currentNav = nav.find(item => item.id === page)?.label ?? 'Administration';
  const pendingCount = pending.length + runs.filter(run => run.status === 'pending').length + (state?.memories.filter(memory => memory.status === 'proposed').length || 0);

  return <div className="byo-app">
    <a className="skip-link" href="#workspace-content">Skip to workspace</a>
    <aside className={`byo-nav ${menuOpen ? 'open' : ''}`}>
      <button className="brand" onClick={() => { setPage('overview'); setSelection(null); }} aria-label="ByoSync home"><span className="brand-mark"><Network /></span><span><strong>ByoSync</strong><small>AI authority</small></span></button>
      <nav aria-label="Primary navigation">
        {nav.map(item => <button key={item.id} aria-current={page === item.id ? 'page' : undefined} aria-label={item.label} title={item.label} className={page === item.id ? 'active' : ''} onClick={() => { setPage(item.id); setSelection(null); setMenuOpen(false); }}><item.icon /><span>{item.label}</span>{item.id === 'decisions' && pendingCount ? <b>{pendingCount}</b> : null}</button>)}
      </nav>
      <div className="nav-foot">
        <button className="simulation-launch" onClick={onSimulation}><Building2 /><span>Enterprise simulation</span></button>
        <button aria-label="Administration" title="Administration" className={page === 'administration' ? 'active' : ''} onClick={() => { setPage('administration'); setSelection(null); setMenuOpen(false); }}><Settings /><span>Administration</span></button>
        <div className="nav-assurance"><ShieldCheck /><span>Accountable AI.<small>Evidence behind every decision.</small></span></div>
      </div>
    </aside>

    <main className="byo-main">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(current => !current)} aria-label="Open navigation"><Menu /></button>
        <div className="scope"><Building2 /><div><small>{state?.session.mode === 'named-user' ? 'ORGANIZATION WORKSPACE' : 'LOCAL WORKSPACE'}</small><strong>{currentNav}</strong></div></div>
        <label className="global-search"><Search /><input aria-label="Search workspace" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search agents, decisions, evidence…" /></label>
        <div className="freshness"><span className={state?.assurance.coverage.last_scan_at ? 'dot ok' : 'dot'} /><div><small>Discovery freshness</small><strong>{relative(state?.assurance.coverage.last_scan_at)}</strong></div></div>
        <button className="icon-button notification-button" aria-label={`Review ${pendingCount} pending decisions`} onClick={() => { setPage('decisions'); setSelection(null); }}><Bell />{pendingCount ? <b>{pendingCount}</b> : null}</button>
        <button className="topbar-person" onClick={() => { setPage('administration'); setSelection(null); }} title="View your session and identity assurance"><span className="person-avatar">{state?.session.name.split(' ').map(part => part[0]).slice(0, 2).join('') || 'OP'}</span><span><strong>{state?.session.name || 'Operator'}</strong><small>{state?.session.mode === 'named-user' ? title(state.session.role || 'viewer') : 'Local operator'}</small></span></button>
      </header>

      {message ? <div className={`toast ${message.tone}`} role="status">{message.tone === 'ok' ? <CheckCircle2 /> : <AlertTriangle />}<span>{message.text}</span><button onClick={() => setMessage(null)} aria-label="Dismiss"><X /></button></div> : null}
      {busy ? <div className="busybar"><Loader2 className="spin" />{busy}</div> : null}

      <div className="workspace" id="workspace-content" tabIndex={-1}>
        {!state ? <LoadingState /> : <>
          {page === 'overview' ? <><SecurityEntry onOpen={()=>setPage('security')}/><CisoOverview state={state} scan={scan} runs={runs} query={query} open={open} go={setPage} /><details className="advanced-workspace"><summary><Network />Explore the identity relationship map and platform components</summary><AuthorityMap state={state} scan={scan} open={open} go={setPage} /><ControlPlaneStrip platform={platform} reports={reports} open={open} /></details></> : null}
          {page === 'security' ? <SecurityPosture data={workspacePosture(state,scan,Date.now(),reports)} open={target=>{if(target.page){setPage(target.page);setSelection(null);}else if(target.kind&&target.id&&['agent','approval','memory','finding'].includes(target.kind)){open({kind:target.kind as 'agent'|'approval'|'memory'|'finding',id:target.id});}}}/> : null}
          {page === 'estate' ? <Estate state={state} scan={scan} query={query} open={open} runScan={runScan} busy={busy} go={setPage} /> : null}
          {page === 'discovery' ? <Discovery state={state} scan={scan} platform={platform} reports={reports} open={open} runScan={runScan} runClawScan={runClawScan} busy={busy} /> : null}
          {page === 'decisions' ? <><PageHead eyebrow="HUMAN IN THE LOOP" title="Decisions" description="The exact action. The accountable person. The evidence to decide." /><DecisionMetrics state={state} runs={runs} /><Decisions state={state} query={query} open={open} command={command} busy={busy} /><RoomWorkspace state={state} refresh={refresh} decisionsOnly /></> : null}
          {page === 'operations' ? <><RoomWorkspace state={state} refresh={refresh} /><Operations state={state} query={query} open={open} command={command} busy={busy} /></> : null}
          {page === 'assurance' ? <Assurance state={state} platform={platform} reports={reports} query={query} open={open} /> : null}
          {page === 'trace' ? <IdentityTrace state={state} open={open} /> : null}
          {page === 'administration' ? <Administration state={state} platform={platform} reports={reports} open={open} /> : null}
        </>}
      </div>
    </main>

    {state && selection ? <Inspector state={state} scan={scan} platform={platform} reports={reports} selection={selection} tab={inspectorTab} setTab={setInspectorTab} close={() => setSelection(null)} command={command} busy={busy} go={setPage} /> : null}
  </div>;
}

function PageHead({ eyebrow, title: heading, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-head"><div><span>{eyebrow}</span><h1>{heading}</h1><p>{description}</p></div>{actions ? <div className="page-actions">{actions}</div> : null}</div>;
}

function Overview({ state, scan, platform, reports, query, open, go }: { state: Snapshot; scan: DiscoveryScan | null; platform: PlatformStatus | null; reports: SourceReport[]; query: string; open: (s: Selection) => void; go: (p: Page) => void }) {
  const q = query.toLowerCase();
  const decisions = state.approvals.filter(item => item.status === 'pending');
  const attention = state.assurance.findings.filter(item => item.status === 'open');
  const unowned = state.agents.filter(item => !item.owner);
  const shadow = scan?.agents.filter(item => item.shadow).length ?? state.assurance.findings.filter(item => item.status === 'open' && item.title.startsWith('Unregistered AI entity:')).length;
  const governed = state.agents.filter(item => item.owner && item.passport && item.mandate?.status === 'active').length;
  const changes = [...state.events].reverse().filter(item => !q || `${item.event_type} ${item.actor_id}`.toLowerCase().includes(q)).slice(0, 6);
  return <div className="page">
    <PageHead eyebrow="ENTERPRISE AI CONTROL" title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${state.session.name.split(' ')[0]}`} description="See every AI identity, the authority behind it, and the exact decisions that need a human." actions={<button className="primary" onClick={() => go('discovery')}><Search />Review discovery</button>} />
    <ControlPlaneStrip platform={platform} reports={reports} open={open} />
    <section className="posture-bar" aria-label="Current AI security posture">
      <PostureMetric label="Registered identities" value={state.agents.length} detail={`${governed} fully governed`} tone="blue" />
      <PostureMetric label="Needs ownership" value={unowned.length} detail="Human accountable owner" tone={unowned.length ? 'amber' : 'green'} />
      <PostureMetric label="Shadow observed" value={shadow} detail={scan ? 'Current browser scan' : state.assurance.coverage.last_scan_at ? 'Latest persisted discovery' : 'Run discovery to measure'} tone={shadow ? 'red' : 'neutral'} />
      <PostureMetric label="Human decisions" value={decisions.length} detail="Exact actions waiting" tone={decisions.length ? 'amber' : 'green'} />
      <PostureMetric label="Evidence ledger" value={state.integrity.status === 'verified' ? 'Verified' : 'Attention'} detail={`${state.integrity.recordCount} authority · ${platform?.intake.telemetry_events ?? 0} runtime`} tone={state.integrity.status === 'verified' ? 'green' : 'red'} />
    </section>
    <div className="command-grid">
      <AuthorityMap state={state} scan={scan} open={open} go={go} />
      <section className="attention-rail">
        <header><div><span>PRIORITY QUEUE</span><h2>Needs your attention</h2></div><b>{decisions.length + attention.length + unowned.length}</b></header>
        <div className="attention-list">
          {decisions.slice(0, 2).map(item => <button key={item.approval_id} onClick={() => open({ kind: 'approval', id: item.approval_id })}><span className="attention-icon amber"><ClipboardCheck /></span><span><strong>Approve {title(item.action)}</strong><small>Blocked until a human decides · {relative(item.requested_at)}</small></span><ChevronRight /></button>)}
          {unowned.slice(0, 2).map(item => <button key={item.agent_id} onClick={() => open({ kind: 'agent', id: item.agent_id })}><span className="attention-icon red"><UserCheck /></span><span><strong>Assign an owner</strong><small>{item.name} has no accountable human</small></span><ChevronRight /></button>)}
          {attention.slice(0, 2).map(item => <button key={item.finding_id} onClick={() => open({ kind: 'finding', id: item.finding_id })}><span className="attention-icon amber"><ShieldAlert /></span><span><strong>{item.title}</strong><small>{item.summary}</small></span><ChevronRight /></button>)}
          {!decisions.length && !attention.length && !unowned.length ? <div className="queue-clear"><CheckCircle2 /><strong>No urgent intervention</strong><p>Measured controls have no unresolved human decisions.</p></div> : null}
        </div>
        <button className="rail-action" onClick={() => go('decisions')}>Open decision workspace <ChevronRight /></button>
      </section>
    </div>
    <div className="overview-lower">
      <Panel title="Significant changes" subtitle="Newest signed governance events" count={state.events.length} action={<button className="text-button" onClick={() => go('trace')}>Open identity trace <ChevronRight /></button>}>
        {changes.slice(0, 4).map(item => <Row key={item.event_id} icon={<History />} title={title(item.event_type)} detail={`${item.actor_type}: ${item.actor_id} · ${relative(item.timestamp)}`} onClick={() => open({ kind: 'event', id: item.event_id })} />)}
        {!changes.length ? <Empty icon={<History />} title="No governance changes yet" text="Register an entity to begin its identity trace." /> : null}
      </Panel>
      <Panel title="Control truth" subtitle="What is measured and what remains outside the boundary" action={<button className="text-button" onClick={() => go('assurance')}>View assurance <ChevronRight /></button>}>
        <div className="truth-stack"><div><ShieldCheck /><span><strong>Authority controls</strong><small>Passports, mandates and exact-action approvals execute inline.</small></span><Status value="Inline enforced" /></div><div><Search /><span><strong>Discovery coverage</strong><small>{state.assurance.coverage.configured_sources} configured sources · {state.assurance.coverage.observed_entities} observed entities.</small></span><Status value={state.assurance.coverage.last_scan_at ? 'Measured' : 'Not measured'} /></div><div><Activity /><span><strong>Runtime evidence</strong><small>{platform?.intake.telemetry_events ?? 0} normalized events · {platform?.intake.source_reports ?? reports.length} collector reports.</small></span><Status value={(platform?.intake.telemetry_events ?? 0) + (platform?.intake.source_reports ?? reports.length) > 0 ? 'Measured' : 'Ready'} /></div></div>
      </Panel>
    </div>
  </div>;
}

function ControlPlaneStrip({ platform, reports, open }: { platform: PlatformStatus | null; reports: SourceReport[]; open: (s: Selection) => void }) {
  const components = platform?.components ?? [];
  return <section className="control-plane-strip" aria-label="Live platform control plane">
    <div className="control-plane-head"><span><Activity />LIVE CONTROL PLANE</span><small>{platform ? `Verified ${relative(platform.generated_at)} · ${platform.deployment.host}` : 'Reading local platform status'}</small></div>
    <div className="control-plane-items">
      {components.map(component => <button key={component.id} onClick={() => open({ kind: 'platform-component', id: component.id })}><span className={`control-icon ${component.status}`}><CheckCircle2 /></span><span><strong>{component.name}</strong><small>{component.mode} · {component.id === 'collector-api' ? `${reports.length} received reports` : title(component.status)}</small></span><Status value={component.status} /></button>)}
      {!components.length ? <div className="control-loading"><Loader2 className="spin" /><span><strong>Platform services</strong><small>Status is loading without blocking authority controls.</small></span></div> : null}
    </div>
  </section>;
}

function PostureMetric({ label, value, detail, tone }: { label: string; value: string | number; detail: string; tone: string }) {
  return <div className={`posture-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function AuthorityMap({ state, scan, open, go }: { state: Snapshot; scan: DiscoveryScan | null; open: (s: Selection) => void; go: (p: Page) => void }) {
  const agent = state.agents[0];
  const room = agent ? state.rooms.find(item => item.agent_ids.includes(agent.agent_id)) : undefined;
  const memory = agent ? [...state.memories].reverse().find(item => item.agent_id === agent.agent_id) : undefined;
  const discovered = scan?.agents[0];
  const centralSelection: Selection = agent ? { kind: 'agent', id: agent.agent_id } : discovered ? { kind: 'census', id: discovered.agent_id } : null;
  return <section className="authority-map-card">
    <header><div><span>LIVE AUTHORITY MAP</span><h2>Who is accountable, and what can this AI reach?</h2><p>Select any identity or control to inspect its evidence.</p></div><button className="text-button" onClick={() => go('trace')}>View complete trace <ChevronRight /></button></header>
    <div className="authority-canvas">
      <svg viewBox="0 0 800 390" aria-hidden="true"><path d="M400 195 L155 86 M400 195 L400 58 M400 195 L650 88 M400 195 L660 300 M400 195 L400 335 M400 195 L145 300" /><path className="secondary-edge" d="M155 86 Q400 8 650 88 M650 88 Q760 195 660 300 M660 300 Q400 385 400 335" /></svg>
      <MapNode position="owner" icon={<Users />} label="Human owner" value={agent?.owner?.name ?? 'Not bound'} tone={agent?.owner ? 'human' : 'warning'} disabled={!agent} onClick={() => agent && open({ kind: 'agent', id: agent.agent_id })} />
      <MapNode position="passport" icon={<Fingerprint />} label="Passport" value={agent?.passport ? 'Signed identity' : 'Not issued'} tone={agent?.passport ? 'control' : 'warning'} disabled={!agent} onClick={() => agent && open({ kind: 'agent', id: agent.agent_id })} />
      <MapNode position="mandate" icon={<KeyRound />} label="Mandate" value={agent?.mandate?.status === 'active' ? agent.mandate.purpose : 'No active authority'} tone={agent?.mandate?.status === 'active' ? 'control' : 'warning'} disabled={!agent} onClick={() => agent && open({ kind: 'agent', id: agent.agent_id })} />
      <MapNode position="systems" icon={<Boxes />} label="Connected systems" value={agent?.discovery_snapshot?.tools?.length ? `${agent.discovery_snapshot.tools.length} observed tools` : 'No connector evidence'} tone="system" disabled={!agent} onClick={() => agent && open({ kind: 'agent', id: agent.agent_id })} />
      <MapNode position="room" icon={<Workflow />} label="Collaboration" value={room ? `${room.agent_ids.length} agents · bounded room` : 'No governed room'} tone={room ? 'collaboration' : 'muted'} disabled={!room} onClick={() => room && open({ kind: 'room', id: room.room_id })} />
      <MapNode position="memory" icon={<Database />} label="Company memory" value={memory ? `${memory.status}${memory.reviewed_by ? ' · reviewed' : ' · awaiting review'}` : 'No reviewed memory'} tone={memory?.status === 'published' ? 'memory' : 'muted'} disabled={!memory} onClick={() => memory && open({ kind: 'memory', id: memory.memory_id })} />
      <button className={`map-center ${agent ? 'governed' : discovered ? 'observed' : 'empty'}`} disabled={!centralSelection} onClick={() => centralSelection && open(centralSelection)}><span><Bot /></span><strong>{agent?.name ?? discovered?.name ?? 'No AI identity selected'}</strong><small>{agent ? `H2A · ${agent.governance_status}` : discovered ? 'Census observed' : 'Run discovery to populate the map'}</small></button>
    </div>
    <footer><span><i className="legend-dot human" />Human identity</span><span><i className="legend-dot control" />Authority control</span><span><i className="legend-dot collaboration" />Bounded collaboration</span><span><i className="legend-dot system" />Observed system</span></footer>
  </section>;
}

function MapNode({ position, icon, label, value, tone, disabled, onClick }: { position: string; icon: ReactNode; label: string; value: string; tone: string; disabled?: boolean; onClick: () => void }) {
  return <button className={`map-node ${position} ${tone}`} disabled={disabled} onClick={onClick}><span>{icon}</span><strong>{label}</strong><small>{value}</small></button>;
}

function Discovery({ state, scan, platform, reports, open, runScan, runClawScan, busy }: { state: Snapshot; scan: DiscoveryScan | null; platform: PlatformStatus | null; reports: SourceReport[]; open: (s: Selection) => void; runScan: () => void; runClawScan: () => void; busy: string | null }) {
  const candidates = scan?.agents ?? [];
  const [focusId, setFocusId] = useState<string | null>(null);
  const focusCensus = candidates.find(item => item.agent_id === focusId) ?? candidates.find(item => item.shadow) ?? candidates[0];
  const focusAgent = state.agents.find(item => item.census_agent_id === focusCensus?.agent_id) ?? state.agents.find(item => item.agent_id === focusId) ?? state.agents[0];
  const activeFocusId = focusCensus?.agent_id ?? focusAgent?.agent_id;
  const unregistered = candidates.filter(item => (item.classification.is_agent || item.framework === 'endpoint-inventory') && !state.agents.some(agent => agent.census_agent_id === item.agent_id));
  return <div className="page discovery-page">
    <PageHead eyebrow="DISCOVERY & INVESTIGATION" title="Find AI before it becomes an unmanaged identity" description="Scan this server's current-user tool presence and configured Census sources. Browsing from another laptop does not scan that laptop. Installation evidence does not prove authorized use or autonomous behavior." actions={<><button className="secondary" onClick={() => void runClawScan()} disabled={!!busy}>Inspect OpenClaw</button><button className="primary" onClick={() => void runScan()} disabled={!!busy}><RefreshCw className={busy?.includes('Scanning') ? 'spin' : ''} />{scan ? 'Run new scan' : 'Run discovery'}</button></>} />
    <section className="case-metrics" aria-label="Discovery summary">
      <PostureMetric label="Observed entities" value={candidates.length || state.assurance.coverage.observed_entities} detail={scan ? `Scan ${relative(scan.completed_at)}` : 'No scan loaded this visit'} tone="blue" />
      <PostureMetric label="Shadow AI" value={candidates.filter(item => item.shadow).length} detail="Observed without governance" tone={candidates.some(item => item.shadow) ? 'red' : 'neutral'} />
      <PostureMetric label="Unregistered identities" value={unregistered.length} detail="AI tools and classified agents" tone={unregistered.length ? 'amber' : 'green'} />
      <PostureMetric label="Collector evidence" value={platform?.intake.source_reports ?? reports.length} detail={`${reports.reduce((sum, report) => sum + report.summary.findings, 0)} endpoint findings`} tone={reports.some(report => report.status !== 'healthy') ? 'amber' : reports.length ? 'green' : 'neutral'} />
    </section>
    <section className="investigation-shell">
      <aside className="case-list">
        <header><div><span>PRIORITIZED FINDINGS</span><h2>Discovery queue</h2></div><SlidersHorizontal /></header>
        <div className="case-scroll">
          {candidates.map(entity => <button key={entity.agent_id} className={activeFocusId === entity.agent_id ? 'active' : ''} onClick={() => setFocusId(entity.agent_id)}><span className={`case-severity ${entity.shadow ? 'critical' : entity.activity_status === 'stale' ? 'warning' : 'known'}`}><ProductMark entity={entity} /></span><span><strong>{entity.name}</strong><small>{entity.shadow ? 'Shadow agent' : entity.classification.classification.replaceAll('_', ' ')} · {entity.provider ?? 'Unknown provider'}</small><em>{relative(entity.last_seen)} · {Math.round(entity.classification.confidence * 100)}% evidence confidence</em></span><ChevronRight /></button>)}
          {!candidates.length && state.agents.map(agent => <button key={agent.agent_id} className={activeFocusId === agent.agent_id ? 'active' : ''} onClick={() => setFocusId(agent.agent_id)}><span className="case-severity known"><ShieldCheck /></span><span><strong>{agent.name}</strong><small>{agent.governance_status} H2A identity</small><em>{agent.owner?.name ?? 'Owner required'} · persisted record</em></span><ChevronRight /></button>)}
          {!candidates.length && !state.agents.length ? <div className="case-empty"><Search /><strong>No inventory loaded</strong><p>Run discovery to observe configured enterprise sources.</p></div> : null}
        </div>
      </aside>
      <div className="investigation-main">
        <header className="investigation-title"><div><span>IDENTITY INVESTIGATION</span><h2>{focusCensus?.name ?? focusAgent?.name ?? 'Select a discovered entity'}</h2><p>{focusCensus ? `${focusCensus.provider ?? 'Provider not reported'} · ${focusCensus.framework ?? 'Framework not reported'} · ${focusCensus.endpoint ?? 'Endpoint not reported'}` : focusAgent ? `${focusAgent.framework} · ${focusAgent.governance_status}` : 'The authority path will appear here.'}</p></div>{focusCensus ? <Status value={focusCensus.shadow ? 'Shadow AI' : focusCensus.classification.classification} /> : focusAgent ? <Status value={focusAgent.governance_status} /> : null}</header>
        <TraceChain state={state} agent={focusAgent} census={focusCensus} />
        <div className="investigation-evidence">
          <section><h3>What we know</h3><Info label="Discovery sources" value={focusCensus?.discovery_sources.join(', ') || 'Not loaded in this session'} /><Info label="Last observed" value={focusCensus ? stamp(focusCensus.last_seen) : 'Persisted H2A identity'} /><Info label="Accountable human" value={focusAgent?.owner?.name ?? 'Not bound'} /><Info label="Current control" value={focusAgent?.mandate?.status === 'active' ? 'Inline mandate enforcement' : 'Observe only'} /></section>
          <section><h3>Why this matters</h3><p>{focusCensus?.shadow ? 'This agent was observed by Census without a matching governed H2A identity. Confirm whether it is approved, then bind an accountable human before granting authority.' : focusAgent ? 'This identity is registered in H2A. Inspect the complete path to verify who owns it and exactly what its mandate permits.' : 'Discovery evidence is required before ByoSync can classify the governance gap.'}</p>{focusCensus ? <button className="secondary full" onClick={() => open({ kind: 'census', id: focusCensus.agent_id })}>Inspect discovery evidence <ChevronRight /></button> : focusAgent ? <button className="secondary full" onClick={() => open({ kind: 'agent', id: focusAgent.agent_id })}>Inspect governed identity <ChevronRight /></button> : null}</section>
        </div>
      </div>
    </section>
    <SourceEvidence reports={reports} open={open} />
  </div>;
}

function SourceEvidence({ reports, open }: { reports: SourceReport[]; open: (s: Selection) => void }) {
  return <section className="source-evidence">
    <header><div><span>ENDPOINT & PLATFORM SIGNALS</span><h2>Collector evidence</h2><p>Normalized reports from approved security collectors. Raw evidence stays distinct from H2A governance decisions.</p></div><b>{reports.length}</b></header>
    <div className="source-report-grid">
      {[...reports].reverse().slice(0, 4).map(report => <button className="source-report-row" key={report.report_id} onClick={() => open({ kind: 'source-report', id: report.report_id })}><span className={`source-state ${report.status}`}><Network /></span><span><strong>{title(report.source)}</strong><small>{report.host} · {report.collector}{report.collector_version ? ` ${report.collector_version}` : ''}</small></span><span className="source-report-stats"><b>{report.summary.observed_agents}</b><small>agents</small></span><span className="source-report-stats"><b>{report.summary.findings}</b><small>findings</small></span><Status value={report.status} /><ChevronRight /></button>)}
      {!reports.length ? <Empty icon={<Network />} title="Collector intake is ready" text="Post a Claw Hunter, Shadow AI Guard, AIOStack or custom report to show endpoint evidence here." /> : null}
    </div>
  </section>;
}

function TraceChain({ state, agent, census }: { state: Snapshot; agent?: Agent; census?: CensusEntity }) {
  const room = agent ? state.rooms.find(item => item.agent_ids.includes(agent.agent_id)) : undefined;
  const action = agent ? [...state.actions].reverse().find(item => item.agent_id === agent.agent_id) : undefined;
  const nodes = [
    { label: 'Runtime', value: census?.provider ?? agent?.framework ?? 'Unknown', active: Boolean(census || agent), icon: <Boxes /> },
    { label: 'Agent', value: agent?.name ?? census?.name ?? 'Unidentified', active: Boolean(census || agent), icon: <ProductMark entity={agent || census} /> },
    { label: 'Human owner', value: agent?.owner?.name ?? 'Not bound', active: Boolean(agent?.owner), icon: <Users /> },
    { label: 'Passport', value: agent?.passport ? 'Signed' : 'Not issued', active: Boolean(agent?.passport), icon: <Fingerprint /> },
    { label: 'Mandate', value: agent?.mandate?.status ?? 'Not assigned', active: agent?.mandate?.status === 'active', icon: <KeyRound /> },
    { label: 'Room', value: room?.name ?? 'No collaboration', active: Boolean(room), icon: <Workflow /> },
    { label: 'Action', value: action?.status ?? 'No action', active: action?.status === 'executed', icon: <Activity /> }
  ];
  return <div className="trace-chain" aria-label="Runtime to action identity path">{nodes.map((node, index) => <div className="trace-node-wrap" key={node.label}>{index ? <span className={`trace-edge ${node.active ? 'active' : ''}`}><ChevronRight /></span> : null}<div className={`trace-node ${node.active ? 'active' : ''}`}><span>{node.icon}</span><small>{node.label}</small><strong>{node.value}</strong></div></div>)}</div>;
}

function Decisions({ state, query, open, command, busy }: { state: Snapshot; query: string; open: (s: Selection) => void; command: Command; busy: string | null }) {
  const [filter, setFilter] = useState('all');
  const q = query.toLowerCase();
  const approvals = [...state.approvals].sort((a, b) => Number(a.status !== 'pending') - Number(b.status !== 'pending')).filter(item => (filter === 'all' || item.status === filter) && `${item.action} ${item.status} ${item.agent_id}`.toLowerCase().includes(q));
  return <div className="page">
    <div className="decision-filter"><h2>Governed action requests</h2><label>Status<select aria-label="Decision status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All decisions</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="invalidated">Invalidated</option></select></label></div>
    <section className="surface">
      <div className="table-head six"><span>Request</span><span>Agent</span><span>Room</span><span>Requested</span><span>Status</span><span>Decision</span></div>
      {approvals.map(item => <ApprovalRow key={item.approval_id} approval={item} state={state} open={open} command={command} busy={busy} />)}
      {!approvals.length ? <Empty icon={<ClipboardCheck />} title="No decisions match" text="Approval-gated actions will appear here with their exact authority context." /> : null}
    </section>
  </div>;
}

function ApprovalRow({ approval, state, open, command, busy }: { approval: Approval; state: Snapshot; open: (s: Selection) => void; command: Command; busy: string | null }) {
  const agent = state.agents.find(item => item.agent_id === approval.agent_id);
  const room = state.rooms.find(item => item.room_id === approval.room_id);
  return <div className="table-row six clickable" onClick={() => open({ kind: 'approval', id: approval.approval_id })}>
    <span><button className="text-button review-request" onClick={e => { e.stopPropagation(); open({ kind: 'approval', id: approval.approval_id }); }}>{title(approval.action)}<ChevronRight /></button><small>{approval.approval_id}</small></span><span className="entity"><ProductMark entity={agent} size="small" />{agent?.name ?? approval.agent_id}</span><span>{room?.name ?? approval.room_id}</span><span>{relative(approval.requested_at)}</span><span><Status value={approval.status} /></span>
    <span className="decision-buttons">{approval.status === 'pending' ? <button disabled={!!busy} onClick={event => { event.stopPropagation(); open({ kind: 'approval', id: approval.approval_id }); }}><ClipboardCheck />Review exact action</button> : <span className="quiet">Resolved {relative(approval.resolved_at)}</span>}</span>
  </div>;
}

function Estate({ state, scan, query, open, runScan, busy, go }: { state: Snapshot; scan: DiscoveryScan | null; query: string; open: (s: Selection) => void; runScan: () => void; busy: string | null; go: (p: Page) => void }) {
  const [kind, setKind] = useState('Agents');
  const [localQuery, setLocalQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState('asc');
  const [pageIndex, setPageIndex] = useState(0);
  const q = `${query} ${localQuery}`.trim().toLowerCase().split(/\s+/);
  const importedCensus = new Set(state.agents.map(item => item.census_agent_id));
  const discovered = (scan?.agents ?? []).filter(item => !importedCensus.has(item.agent_id));
  const governed = state.agents.filter(a => a.owner && a.passport && a.mandate?.status === 'active').length;
  const unowned = state.agents.filter(a => !a.owner).length;
  const rows = [
    ...state.agents.map(agent => ({ id: agent.agent_id, name: agent.name, agent, entity: agent.discovery_snapshot, owner: agent.owner?.name || 'Unassigned', governed: Boolean(agent.owner && agent.passport && agent.mandate?.status === 'active'), registered: true })),
    ...discovered.map(entity => ({ id: entity.agent_id, name: entity.name, agent: undefined, entity, owner: 'Not bound', governed: false, registered: false })),
  ].filter(row => q.every(term => `${row.name} ${row.owner} ${row.entity?.provider || ''}`.toLowerCase().includes(term)))
    .filter(row => kind !== 'AI tools' || row.entity?.classification.is_agent === false)
    .filter(row => filter === 'All' || (filter === 'Governed' && row.governed) || (filter === 'Needs review' && !row.governed) || (filter === 'Owner unassigned' && !row.agent?.owner) || (filter === 'Shadow' && row.entity?.shadow))
    .sort((a, b) => (sort === 'asc' ? 1 : -1) * a.name.localeCompare(b.name));
  useEffect(() => setPageIndex(0), [kind, localQuery, query, filter, sort]);
  const currentPage = Math.min(pageIndex, Math.max(0, Math.ceil(rows.length / 10) - 1));
  const exportInventory = () => {
    const quote = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
    const csv = [['Entity', 'Owner', 'Registration', 'Authority', 'Detection', 'Control'], ...rows.map(row => [row.name, row.owner, row.registered ? 'Registered' : 'Not registered', row.governed ? 'Active mandate' : 'Needs review', row.entity?.classification.classification || 'Not reported', row.governed ? 'ByoSync actions only' : 'Observe only'])].map(row => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'byosync-filtered-ai-estate.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const nonAgentCopy: Record<string, string> = { 'AI tools': 'Tool-level inventory is supplied by connected discovery sources.', People: 'Enterprise directory connection is not configured.', Systems: 'System inventory connection is not configured.', Departments: 'Organization directory is not configured.', 'Business services': 'Business service mapping is not configured.' };
  return <div className="page">
    <PageHead eyebrow="AI ESTATE" title="Your AI estate. Clear ownership. Bounded authority." description="Discover tools and agents, inspect their evidence, and decide who can act." actions={<button className="primary" onClick={() => void runScan()} disabled={!!busy}><RefreshCw className={busy?.includes('Scanning') ? 'spin' : ''} />Run discovery</button>} />
    <div className="estate-navigation"><div><div className="segmented">{['Agents', 'AI tools', 'People', 'Systems', 'Business services'].map(item => <button key={item} aria-pressed={kind === item} className={kind === item ? 'active' : ''} onClick={() => setKind(item)}>{item}</button>)}</div><div className="estate-filters"><label className="inventory-search"><Search /><input aria-label="Search AI estate" placeholder="Search agents and tools…" value={localQuery} onChange={e => setLocalQuery(e.target.value)} /></label>{['All', 'Governed', 'Needs review', 'Owner unassigned', 'Shadow'].map(item => <button key={item} aria-pressed={filter === item} className={`filter-chip ${filter === item ? 'selected' : ''}`} onClick={() => setFilter(item)}>{item}</button>)}</div></div><aside className="inventory-summary"><h2>AI identity inventory</h2><div><span><strong className="green">{governed}</strong><small>Governed</small></span><span><strong className="amber">{state.agents.length - governed + discovered.length}</strong><small>Needs review</small></span><span><strong>{unowned}</strong><small>Registered, unowned</small></span></div></aside></div>
    {kind === 'Agents' || kind === 'AI tools' ? <section className="surface estate-table">
      <div className="inventory-toolbar"><h2>{rows.length} {kind === 'Agents' ? 'AI identities' : 'AI tools'}</h2><div><label>Sort by<select aria-label="Sort inventory" value={sort} onChange={e => setSort(e.target.value)}><option value="asc">Name (A–Z)</option><option value="desc">Name (Z–A)</option></select></label><button className="secondary" onClick={exportInventory} disabled={!rows.length}><Download />Export CSV</button></div></div>
      <div className="table-head five"><span>Entity</span><span>Owner</span><span>Approval</span><span>Control</span><span>Attention</span></div>
      {rows.slice(currentPage * 10, currentPage * 10 + 10).map(row => row.agent ? <AgentRow key={row.id} agent={row.agent} open={open} /> : <CensusRow key={row.id} entity={row.entity!} open={open} />)}
      {!rows.length ? <Empty icon={<Search />} title={scan ? 'No matching AI identities' : 'Run discovery to populate your estate'} text="Adjust the filters or inspect configured discovery coverage. Unknown systems are not assumed safe." /> : null}
      <footer className="inventory-footer"><span>Showing {rows.length ? currentPage * 10 + 1 : 0}–{Math.min((currentPage + 1) * 10, rows.length)} of {rows.length}</span><div><button aria-label="Previous inventory page" disabled={currentPage === 0} onClick={() => setPageIndex(currentPage - 1)}><ChevronLeft /></button><span>Page {currentPage + 1} of {Math.max(1, Math.ceil(rows.length / 10))}</span><button aria-label="Next inventory page" disabled={(currentPage + 1) * 10 >= rows.length} onClick={() => setPageIndex(currentPage + 1)}><ChevronRight /></button></div></footer>
    </section> : kind === 'People' ? <section className="surface"><div className="inventory-toolbar"><h2>{state.humans.length} configured people</h2><small>{state.session.mode === 'named-user' ? 'Named-user directory' : 'Local operator mode · not enterprise SSO'}</small></div>{state.humans.filter(h => q.every(term => `${h.name} ${h.team}`.toLowerCase().includes(term))).map(h => <div className="person-inventory" key={h.human_id}><span className="person-avatar">{h.name.split(' ').map(s => s[0]).slice(0, 2).join('')}</span><div><strong>{h.name}</strong><small>{h.team}</small></div><span>{state.agents.filter(a => a.owner?.human_id === h.human_id).length} owned identities</span></div>)}</section> : <section className="surface"><Empty icon={<Boxes />} title={`${kind} are not connected`} text={nonAgentCopy[kind]} /><button className="secondary centered" onClick={() => go('administration')}>Review connection requirements</button></section>}
  </div>;
}

function AgentRow({ agent, open }: { agent: Agent; open: (s: Selection) => void }) {
  const attention = authorityIssue(agent);
  return <button className="table-row five" onClick={() => open({ kind: 'agent', id: agent.agent_id })}><span className="entity"><ProductMark entity={agent} /><span><strong>{agent.name}</strong><small>{agent.framework || 'Framework not reported'} · H2A registered</small></span></span><span className="owner-cell">{agent.owner ? <><span className="person-avatar small">{agent.owner.name.split(' ').map(s => s[0]).slice(0, 2).join('')}</span><span>{agent.owner.name}<small>{agent.owner.team}</small></span></> : <Status value="Unowned" />}</span><span><Status value={!attention ? 'Mandate active' : 'Needs review'} /><small>{agent.mandate?.approval_required_actions.length || 0} approval-gated actions</small></span><span><Capability value={!attention ? 'Inline enforced' : 'Observe only'} /><small>ByoSync actions only</small></span><span><Status value={attention || 'Authority in place'} /><ChevronRight /></span></button>;
}

function CensusRow({ entity, open }: { entity: CensusEntity; open: (s: Selection) => void }) {
  return <button className="table-row five" onClick={() => open({ kind: 'census', id: entity.agent_id })}><span className="entity"><ProductMark entity={entity} /><span><strong>{entity.name}</strong><small>{entity.provider ?? 'Provider not reported'} · {title(entity.classification.classification)}</small></span></span><span>Not bound</span><span><Status value="Needs review" /></span><span><Capability value="Observe only" /></span><span><Status value={entity.shadow ? 'Shadow AI' : 'Not registered'} /><ChevronRight /></span></button>;
}

function Assurance({ state, platform, reports, query, open }: { state: Snapshot; platform: PlatformStatus | null; reports: SourceReport[]; query: string; open: (s: Selection) => void }) {
  const q = query.toLowerCase();
  const findings = state.assurance.findings.filter(item => `${item.title} ${item.summary} ${item.subject_id}`.toLowerCase().includes(q));
  const total = Math.max(state.agents.length, 1);
  const coverage = [
    { label: 'Human ownership', value: state.agents.filter(item => item.owner).length, total: state.agents.length, note: 'Accountable humans bound' },
    { label: 'Signed passports', value: state.agents.filter(item => item.passport).length, total: state.agents.length, note: 'Cryptographic identities issued' },
    { label: 'Active mandates', value: state.agents.filter(item => item.mandate?.status === 'active').length, total: state.agents.length, note: 'Authority actively enforced' },
    { label: 'Reviewed memory', value: state.memories.filter(item => item.status === 'published').length, total: state.memories.length, note: 'Human-reviewed knowledge' }
  ];
  const highRisk = state.agents.filter(item => authorityIssue(item));
  return <div className="page"><PageHead eyebrow="ASSURANCE & EVIDENCE" title="Controls you can prove—not a synthetic score" description="Coverage, control health, human decisions and evidence integrity are shown independently so every claim can be defended." actions={<span className="assurance-verdict"><ShieldCheck />Ledger {state.integrity.status}</span>} />
    <AssurancePriorities state={state} open={open} />
    <section className="case-metrics assurance-metrics">
      <PostureMetric label="Measured agents" value={state.agents.length} detail={`${state.assurance.coverage.observed_entities} Census observations`} tone="blue" />
      <PostureMetric label="Open findings" value={findings.filter(item => item.status === 'open').length} detail="Evidence-backed control gaps" tone={findings.some(item => item.status === 'open') ? 'amber' : 'green'} />
      <PostureMetric label="Runtime observations" value={platform?.intake.telemetry_events ?? 0} detail={`${platform?.intake.source_reports ?? reports.length} collector reports`} tone={(platform?.intake.telemetry_events ?? 0) || reports.length ? 'green' : 'neutral'} />
      <PostureMetric label="Signed authority evidence" value={state.integrity.recordCount} detail={state.integrity.status === 'verified' ? 'Hash chain verified' : 'Integrity needs attention'} tone={state.integrity.status === 'verified' ? 'green' : 'red'} />
    </section>
    <div className="assurance-dashboard">
      <section className="analytics-card event-analytics"><header><div><span>GOVERNANCE ACTIVITY</span><h2>Evidence recorded over time</h2><p>Signed events generated by real governance operations.</p></div><BarChart3 /></header><EventTrend events={state.events} /></section>
      <section className="analytics-card coverage-card"><header><div><span>CONTROL COVERAGE</span><h2>Identity and authority readiness</h2><p>Coverage is calculated from registered H2A identities.</p></div><small>{state.agents.length ? `${Math.round((state.agents.filter(item => item.owner && item.passport && item.mandate?.status === 'active').length / total) * 100)}% fully governed` : 'No registered identities'}</small></header><div className="coverage-bars">{coverage.map(item => <CoverageBar key={item.label} {...item} />)}</div></section>
      <section className="analytics-card risk-table"><header><div><span>PRIORITIZED EXPOSURE</span><h2>Identities requiring control</h2><p>Ownership, passport and mandate gaps—without an invented risk score.</p></div><b>{highRisk.length}</b></header>{highRisk.slice(0, 5).map(agent => <button key={agent.agent_id} onClick={() => open({ kind: 'agent', id: agent.agent_id })}><span className="entity"><ProductMark entity={agent} /><span><strong>{agent.name}</strong><small>{agent.framework || 'Framework not reported'}</small></span></span><Status value={!agent.owner ? 'Owner required' : !agent.passport ? 'Passport required' : 'Mandate required'} /><ChevronRight /></button>)}{!highRisk.length ? <Empty icon={<ShieldCheck />} title="No registered identity gaps" text="Every registered agent has an owner, passport and active mandate." /> : null}</section>
      <section className="analytics-card connection-health"><header><div><span>CONTROL PLANE HEALTH</span><h2>Discovery, authority and evidence intake</h2><p>Live readiness from this installation—without implying an unconfigured connection.</p></div><Network /></header>{platform?.components.map(item => <button key={item.id} onClick={() => open({ kind: 'platform-component', id: item.id })}><span className={`connection-state ${item.status}`} /><span><strong>{item.name}</strong><small>{item.mode}{item.endpoint ? ` · ${item.endpoint}` : ''}</small></span><div><Status value={item.status} /></div></button>) ?? state.assurance.connections.map(item => <button key={item.id} onClick={() => open({ kind: 'connection', id: item.id })}><span className={`connection-state ${item.status}`} /><span><strong>{item.name}</strong><small>{item.detail}</small></span><div><Status value={item.status} /><Capability value={item.capability} /></div></button>)}</section>
      <section className="analytics-card source-intake-card"><header><div><span>COLLECTOR EVIDENCE</span><h2>Latest endpoint and platform reports</h2><p>Independent observations kept separate from governance claims.</p></div><b>{reports.length}</b></header>{[...reports].reverse().slice(0, 5).map(report => <button key={report.report_id} onClick={() => open({ kind: 'source-report', id: report.report_id })}><span className={`connection-state ${report.status}`} /><span><strong>{title(report.source)} · {report.host}</strong><small>{report.summary.observed_agents} agents · {report.summary.shadow_agents} shadow · {report.summary.findings} findings</small></span><Status value={report.status} /><ChevronRight /></button>)}{!reports.length ? <Empty icon={<Network />} title="No collector reports received" text="The authenticated report intake is ready for Claw Hunter, Shadow AI Guard, AIOStack or custom collectors." /> : null}</section>
      <section className="analytics-card findings-card"><header><div><span>TOP FINDINGS</span><h2>What requires investigation</h2><p>Every finding links back to its subject and evidence references.</p></div><ShieldAlert /></header>{findings.slice(0, 5).map(item => <Row key={item.finding_id} icon={<ShieldAlert />} title={item.title} detail={item.summary} badge={item.severity} tone={item.severity === 'critical' || item.severity === 'high' ? 'red' : 'amber'} onClick={() => open({ kind: 'finding', id: item.finding_id })} />)}{!findings.length ? <Empty icon={<ShieldCheck />} title="No open findings" text="All currently measured internal controls are satisfied." /> : null}</section>
    </div>
  </div>;
}

function EventTrend({ events }: { events: AuditEvent[] }) {
  const groups = [...events.reduce((map, event) => { const key = new Date(event.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); map.set(key, (map.get(key) ?? 0) + 1); return map; }, new Map<string, number>())].slice(-10);
  const points = groups.length ? groups : [['No events', 0] as [string, number]];
  const max = Math.max(...points.map(([, value]) => value), 1);
  const coords = points.map(([, value], index) => `${points.length === 1 ? 50 : 4 + (index / (points.length - 1)) * 92},${88 - (value / max) * 68}`).join(' ');
  return <div className="event-chart"><div className="chart-summary"><strong>{events.length}</strong><span>signed events</span><small>{points.length} recorded day{points.length === 1 ? '' : 's'}</small></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${events.length} signed governance events`}><polygon points={`4,92 ${coords} 96,92`} fill="#dceff8"/><polyline points={coords} fill="none" stroke="#1677a8" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg><div className="chart-labels">{points.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div></div>;
}

function CoverageBar({ label, value, total, note }: { label: string; value: number; total: number; note: string }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return <div className="coverage-row"><div><strong>{label}</strong><span>{value} of {total || 0}</span></div><div className="coverage-track"><span style={{ width: `${percent}%` }} /></div><small>{note}</small></div>;
}

function Operations({ state, query, open, command, busy }: { state: Snapshot; query: string; open: (s: Selection) => void; command: Command; busy: string | null }) {
  const [tab, setTab] = useState('Rooms'); const q = query.toLowerCase();
  const tabs = ['Rooms', 'Tasks', 'Company memory', 'Evidence packs'];
  return <div className="page"><PageHead eyebrow="BOUNDED COLLABORATION" title="Operations" description="See how humans and agents work together, what context crosses team boundaries, and which reviewed outputs become company memory." />
    <CollaborationMap state={state} open={open} />
    <div className="segmented">{tabs.map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>
    <section className="surface">
      {tab === 'Tasks' ? <>{state.collaboration.assignments.filter(item => `${item.title} ${item.objective} ${item.status}`.toLowerCase().includes(q)).map(item => <Row key={item.id} icon={<Workflow />} title={item.title} detail={`${state.agents.find(agent => agent.agent_id === item.assigneeId)?.name ?? item.assigneeId} · ${item.risk} · ${item.messageCount} handoffs`} badge={item.status} tone={item.status === 'complete' ? 'green' : item.status === 'blocked' ? 'red' : 'blue'} onClick={() => open({ kind: 'room', id: item.room_id })} />)}{state.actions.filter(item => `${item.label} ${item.status}`.toLowerCase().includes(q)).map(item => <Row key={item.action_id} icon={<Activity />} title={item.label} detail={`${item.decision} · ${relative(item.requested_at)}`} badge={item.status} tone={item.status === 'executed' ? 'green' : item.status === 'denied' || item.status === 'rejected' ? 'red' : 'amber'} onClick={() => open({ kind: 'action', id: item.action_id })} />)}</> : null}
      {tab === 'Rooms' ? state.rooms.filter(item => item.name.toLowerCase().includes(q)).map(item => <Row key={item.room_id} icon={<Users />} title={item.name} detail={`${item.human_ids.length} human · ${item.agent_ids.length} agents · ${state.collaboration.assignments.filter(work => work.room_id === item.room_id).length} tasks`} badge={item.agent_ids.length > 1 ? 'Cross-team' : 'Governed'} tone="blue" onClick={() => open({ kind: 'room', id: item.room_id })} />) : null}
      {tab === 'Company memory' ? state.memories.filter(item => `${item.title} ${item.content}`.toLowerCase().includes(q)).map(item => <div className="memory-row" key={item.memory_id} onClick={() => open({ kind: 'memory', id: item.memory_id })}><div><Database /><span><strong>{item.title}</strong><small>{item.content}</small></span></div><Status value={item.status} />{item.status === 'proposed' ? <div className="decision-buttons"><button disabled={!!busy} onClick={event => { event.stopPropagation(); void command('Publishing reviewed memory', `/api/memories/${item.memory_id}/review`, { decision: 'approve', note: 'Reviewed in ByoSync.' }, 'Reviewed memory published.'); }}><Check />Publish</button><button className="danger" disabled={!!busy} onClick={event => { event.stopPropagation(); void command('Rejecting memory', `/api/memories/${item.memory_id}/review`, { decision: 'reject', note: 'Rejected in ByoSync.' }, 'Memory proposal rejected.'); }}><X />Reject</button></div> : null}</div>) : null}
      {tab === 'Evidence packs' ? state.actions.filter(item => item.result?.artifact).map(item => <Row key={item.action_id} icon={<FileCheck2 />} title={item.result!.artifact!.name} detail={`${item.result!.summary} · ${item.result!.artifact!.content_hash.slice(0, 16)}…`} badge="Exported" tone="green" onClick={() => open({ kind: 'action', id: item.action_id })} />) : null}
      {((tab === 'Rooms' && !state.rooms.length) || (tab === 'Company memory' && !state.memories.length) || (tab === 'Tasks' && !state.actions.length && !state.collaboration.assignments.length) || (tab === 'Evidence packs' && !state.actions.some(item => item.result?.artifact))) ? <Empty icon={<Archive />} title={`No ${tab.toLowerCase()} yet`} text="Records are created only by completed governance operations." /> : null}
    </section>
  </div>;
}

function CollaborationMap({ state, open }: { state: Snapshot; open: (s: Selection) => void }) {
  const room = state.rooms[0];
  const roomAgents = room ? state.agents.filter(item => room.agent_ids.includes(item.agent_id)) : state.agents.slice(0, 3);
  const memory = room ? state.memories.find(item => item.room_id === room.room_id && item.status === 'published') : undefined;
  return <section className="collaboration-map"><header><div><span>LIVE COLLABORATION MAP</span><h2>{room?.name ?? 'No governed room yet'}</h2><p>Every edge represents a bounded identity, assignment or reviewed output.</p></div>{room ? <Status value={roomAgents.length > 1 ? 'Cross-team' : 'Governed'} /> : <Status value="Not configured" />}</header><div className="collaboration-flow"><div className="collab-entity human"><span>{state.session.name.slice(0, 2).toUpperCase()}</span><strong>{state.session.name}</strong><small>Accountable human</small></div><span className="flow-edge"><small>assigns</small><ChevronRight /></span><div className="agent-cluster">{roomAgents.map(agent => <button key={agent.agent_id} onClick={() => open({ kind: 'agent', id: agent.agent_id })}><ProductMark entity={agent} /><strong>{agent.name}</strong><small>{agent.mandate?.status === 'active' ? 'Bounded mandate' : 'No active authority'}</small></button>)}{!roomAgents.length ? <div className="collab-entity muted"><span><Bot /></span><strong>No governed agent</strong><small>Register and authorize an identity</small></div> : null}</div><span className="flow-edge"><small>produces</small><ChevronRight /></span><button className={`collab-entity memory ${memory ? '' : 'muted'}`} disabled={!memory} onClick={() => memory && open({ kind: 'memory', id: memory.memory_id })}><span><Database /></span><strong>{memory?.title ?? 'Reviewed memory'}</strong><small>{memory ? 'Published with evidence' : 'No reviewed output yet'}</small></button></div></section>;
}

function IdentityTrace({ state, open }: { state: Snapshot; open: (s: Selection) => void }) {
  const [agentId, setAgentId] = useState(state.agents[0]?.agent_id ?? '');
  const [trace, setTrace] = useState<IdentityTraceItem[] | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const agent = state.agents.find(item => item.agent_id === agentId) ?? state.agents[0];
  const authorityEvents = agent ? state.events.filter(item => item.agent_id === agent.agent_id) : [];
  useEffect(() => {
    if (!agent) { setTrace([]); return; }
    let active = true;
    setTrace(null); setTraceError(null);
    void api<IdentityTraceItem[]>(`/api/agents/${agent.agent_id}/identity-trace`).then(items => { if (active) setTrace(items); }).catch(error => { if (active) { setTraceError(error instanceof Error ? error.message : 'Runtime trace is unavailable.'); setTrace(authorityEvents.map(record => ({ lane: 'authority', timestamp: record.timestamp, record }))); } });
    return () => { active = false; };
  }, [agent?.agent_id]);
  const items = trace ?? authorityEvents.map(record => ({ lane: 'authority' as const, timestamp: record.timestamp, record }));
  const runtimeCount = items.filter(item => item.lane === 'runtime').length;
  const authorityCount = items.length - runtimeCount;
  return <div className="page"><PageHead eyebrow="END-TO-END PROOF" title="Identity trace" description="Follow one agent from its observed runtime to accountable ownership, bounded authority, collaboration, human decisions, actions and reviewed memory." />
    <section className="trace-workbench">
      <aside className="trace-identities"><header><span>IDENTITIES</span><h2>Select an agent</h2></header>{state.agents.map(item => <button key={item.agent_id} className={agent?.agent_id === item.agent_id ? 'active' : ''} onClick={() => setAgentId(item.agent_id)}><ProductMark entity={item} /><span><strong>{item.name}</strong><small>{item.owner?.name ?? 'Owner required'}</small></span><Status value={item.governance_status} /></button>)}{!state.agents.length ? <Empty icon={<Bot />} title="No H2A identities" text="Discover and register an agent to create its trace." /> : null}</aside>
      <div className="trace-main"><header><div><span>COMPLETE AUTHORITY PATH</span><h2>{agent?.name ?? 'No identity selected'}</h2><p>{agent ? `${agent.framework} · ${agent.agent_id}` : 'No evidence path is available.'}</p></div>{agent ? <button className="secondary" onClick={() => open({ kind: 'agent', id: agent.agent_id })}>Open inspector</button> : null}</header><TraceChain state={state} agent={agent} census={agent?.discovery_snapshot} /><div className="trace-proof-summary"><div><ShieldCheck /><span><strong>{authorityCount}</strong><small>authority decisions</small></span></div><div><Activity /><span><strong>{runtimeCount}</strong><small>runtime observations</small></span></div><div><Fingerprint /><span><strong>{items.length}</strong><small>joined trace records</small></span></div></div><div className="trace-facts"><Info label="Human accountability" value={agent?.owner ? `${agent.owner.name} · ${agent.owner.team}` : 'Not established'} /><Info label="Allowed authority" value={agent?.mandate?.allowed_actions.join(', ') || 'None'} /><Info label="Human approval required" value={agent?.mandate?.approval_required_actions.join(', ') || 'None'} /><Info label="Explicitly denied" value={agent?.mandate?.denied_actions.join(', ') || 'None'} /></div>{traceError ? <p className="trace-warning"><AlertTriangle />{traceError} Showing authority evidence only.</p> : null}</div>
      <aside className="trace-timeline"><header><span>JOINED EVIDENCE</span><h2>{items.length} linked records</h2><p>Policy truth and runtime truth stay visibly separate.</p></header><div className="mini-timeline">{trace === null && agent ? <div className="timeline-loading"><Loader2 className="spin" />Joining runtime and authority evidence…</div> : [...items].reverse().slice(0, 14).map(item => item.lane === 'authority' ? <button className="trace-event authority" key={`authority-${item.record.event_id}`} onClick={() => open({ kind: 'event', id: item.record.event_id })}><span /><div><em>AUTHORITY</em><strong>{title(item.record.event_type)}</strong><small>{stamp(item.timestamp)} · {item.record.actor_id}</small><code>{item.record.event_hash.slice(0, 12)}…</code></div></button> : <div className="trace-event runtime" key={`runtime-${item.record.event_id}`}><span /><div><em>RUNTIME</em><strong>{title(item.record.operation || item.record.kind)}</strong><small>{stamp(item.timestamp)} · {item.record.source} / {item.record.system}</small><code>{item.record.evidence_hash.slice(0, 12)}… · {item.record.outcome}</code></div></div>)}</div>{trace !== null && !items.length ? <Empty icon={<History />} title="No linked evidence" text="Authority operations and normalized runtime telemetry will appear here." /> : null}</aside>
    </section>
    <TraceEventTable items={items} open={open} />
  </div>;
}

function TraceEventTable({ items, open }: { items: IdentityTraceItem[]; open: (s: Selection) => void }) {
  const [lane, setLane] = useState('all');
  const visible = items.filter(item => lane === 'all' || item.lane === lane).slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return <section className="evidence-timeline-table"><header><div><h2>Event timeline</h2><p>{visible.length} records in chronological order. Authority decisions and runtime observations stay distinct.</p></div><label>Evidence lane<select aria-label="Filter trace events" value={lane} onChange={event => setLane(event.target.value)}><option value="all">All events</option><option value="authority">Authority</option><option value="runtime">Runtime</option></select></label></header><div className="evidence-table-scroll"><table><thead><tr><th>Time</th><th>Actor / source</th><th>Operation</th><th>Evidence lane</th><th>Record</th></tr></thead><tbody>{visible.map(item => <tr key={`${item.lane}-${item.record.event_id}`}><td><time>{stamp(item.timestamp)}</time></td><td>{item.lane === 'authority' ? item.record.actor_id : item.record.system}<small>{item.lane === 'authority' ? item.record.actor_type : item.record.source}</small></td><td>{title(item.lane === 'authority' ? item.record.event_type : item.record.operation)}<small>{item.lane === 'authority' ? item.record.room_id || 'Organization scope' : item.record.outcome}</small></td><td><span className={`soft-tag ${item.lane === 'authority' ? 'blue' : 'green'}`}>{title(item.lane)}</span></td><td>{item.lane === 'authority' ? <button className="text-button" onClick={() => open({ kind: 'event', id: item.record.event_id })}>Inspect record <ChevronRight /></button> : <details><summary>Runtime evidence</summary><pre>{JSON.stringify(item.record, null, 2)}</pre></details>}</td></tr>)}</tbody></table>{!visible.length && <Empty icon={<History />} title="No matching records" text="Records appear only after the corresponding activity is observed or executed." />}</div></section>;
}

function Administration({ state, platform, reports, open }: { state: Snapshot; platform: PlatformStatus | null; reports: SourceReport[]; open: (s: Selection) => void }) {
  return <div className="page"><PageHead eyebrow="ROLE-GATED CONFIGURATION" title="Administration" description="Connection truth, local identity posture, and deployment boundaries." />
    <section className="admin-grid">
      <Panel title="Live platform components" subtitle="What is running on this installation now" count={platform?.components.filter(item => ['healthy', 'ready', 'connected'].includes(item.status)).length ?? 0}>{platform?.components.map(item => <Row key={item.id} icon={<Network />} title={item.name} detail={`${item.mode}${item.endpoint ? ` · ${item.endpoint}` : ''}`} badge={item.status} tone={['healthy', 'ready', 'connected'].includes(item.status) ? 'green' : item.status === 'degraded' ? 'amber' : 'gray'} onClick={() => open({ kind: 'platform-component', id: item.id })} />) ?? state.assurance.connections.map(item => <Row key={item.id} icon={<Network />} title={item.name} detail={item.detail} badge={item.status} tone={item.status === 'connected' ? 'green' : 'gray'} onClick={() => open({ kind: 'connection', id: item.id })} />)}</Panel>
      <Panel title="Operator session" subtitle="Identity assurance is stated exactly"><div className="session-card"><span>{state.session.name.slice(0, 2).toUpperCase()}</span><div><h3>{state.session.name}</h3><p>{state.session.human_id} · {state.session.team}</p><Capability value="Not verified" /><small>{state.session.assurance}</small></div></div></Panel>
      <Panel title="Data and integrity" subtitle="Persistence and evidence on this device"><Info label="Ledger status" value={title(state.integrity.status)} /><Info label="Authority records" value={String(state.integrity.recordCount)} /><Info label="Runtime telemetry" value={String(platform?.intake.telemetry_events ?? 0)} /><Info label="Collector reports" value={String(platform?.intake.source_reports ?? reports.length)} /><Info label="Persistence" value={platform?.deployment.persistence ?? 'Local files'} /><Info label="Head hash" value={state.integrity.headHash ?? 'No records'} mono /></Panel>
      <Panel title="Deployment boundary" subtitle="Portable demo truth and current limits"><div className="deployment-facts"><Info label="Product version" value={platform?.version ?? 'Local build'} /><Info label="Listening host" value={platform?.deployment.host ?? '127.0.0.1'} /><Info label="Authentication" value={platform?.deployment.auth ?? 'Local operator'} /><Info label="Portable" value={platform?.deployment.portable ? 'Yes — state travels with installation' : 'Not verified'} /></div><div className="boundary"><p><CheckCircle2 />H2A identity and authority controls execute inline.</p><p><CheckCircle2 />Collector and telemetry APIs persist normalized evidence.</p><p><AlertTriangle />Enterprise SSO requires customer configuration.</p><p><AlertTriangle />External systems are controlled only through configured connectors.</p></div></Panel>
    </section>
  </div>;
}

type Command = (key: string, path: string, payload: unknown, success: string) => Promise<Snapshot | null>;
function Inspector({ state, scan, platform, reports, selection, tab, setTab, close, command, busy, go }: { state: Snapshot; scan: DiscoveryScan | null; platform: PlatformStatus | null; reports: SourceReport[]; selection: NonNullable<Selection>; tab: InspectorTab; setTab: (t: InspectorTab) => void; close: () => void; command: Command; busy: string | null; go: (p: Page) => void }) {
  const agent = selection.kind === 'agent' ? state.agents.find(item => item.agent_id === selection.id) : undefined;
  const census = selection.kind === 'census' ? scan?.agents.find(item => item.agent_id === selection.id) : undefined;
  const approval = selection.kind === 'approval' ? state.approvals.find(item => item.approval_id === selection.id) : undefined;
  const action = selection.kind === 'action' ? state.actions.find(item => item.action_id === selection.id) : approval ? state.actions.find(item => item.action_id === approval.action_id) : undefined;
  const finding = selection.kind === 'finding' ? state.assurance.findings.find(item => item.finding_id === selection.id) : undefined;
  const event = selection.kind === 'event' ? state.events.find(item => item.event_id === selection.id) : undefined;
  const room = selection.kind === 'room' ? state.rooms.find(item => item.room_id === selection.id) : undefined;
  const memory = selection.kind === 'memory' ? state.memories.find(item => item.memory_id === selection.id) : undefined;
  const connection = selection.kind === 'connection' ? state.assurance.connections.find(item => item.id === selection.id) : undefined;
  const report = selection.kind === 'source-report' ? reports.find(item => item.report_id === selection.id) : undefined;
  const component = selection.kind === 'platform-component' ? platform?.components.find(item => item.id === selection.id) : undefined;
  const subjectAgent = agent ?? (action ? state.agents.find(item => item.agent_id === action.agent_id) : undefined) ?? (memory ? state.agents.find(item => item.agent_id === memory.agent_id) : undefined);
  const events = state.events.filter(item => subjectAgent ? item.agent_id === subjectAgent.agent_id : event ? item.event_id === event.event_id : false);
  const heading = agent?.name ?? census?.name ?? (approval ? title(approval.action) : undefined) ?? action?.label ?? finding?.title ?? (event ? title(event.event_type) : undefined) ?? room?.name ?? memory?.title ?? connection?.name ?? (report ? `${title(report.source)} report` : undefined) ?? component?.name ?? 'Record';
  const subheading = agent?.agent_id ?? census?.agent_id ?? approval?.approval_id ?? action?.action_id ?? finding?.finding_id ?? event?.event_id ?? room?.room_id ?? memory?.memory_id ?? connection?.id ?? report?.report_id ?? component?.id ?? '';
  const governedPeers = agent ? state.agents.filter(item => item.agent_id !== agent.agent_id && item.mandate?.status === 'active') : [];
  const roomForAgent = agent ? state.rooms.find(item => item.agent_ids.includes(agent.agent_id) && item.agent_ids.length > 1) ?? state.rooms.find(item => item.agent_ids.includes(agent.agent_id)) : undefined;

  const createRoom = async () => {
    if (!agent) return;
    const crossTeam = governedPeers.length > 0;
    await command('Creating governed room', '/api/rooms', { agent_id: agent.agent_id, agent_ids: governedPeers.map(item => item.agent_id), name: `${agent.name} ${crossTeam ? 'cross-team' : 'security'} room` }, crossTeam ? 'Cross-team governed room created with bounded identities.' : 'Governed room created.');
  };
  const request = async (name: string) => {
    if (!agent || !roomForAgent) return;
    const next = await command(`Requesting ${title(name)}`, `/api/rooms/${roomForAgent.room_id}/actions`, { agent_id: agent.agent_id, action: name }, name === 'evidence_export' ? 'Exact-action approval created.' : 'Governed operation completed.');
    if (name === 'evidence_export' && next) go('decisions');
  };

  return <aside className={`inspector ${selection.kind === 'approval' ? 'approval-inspector' : ''}`} aria-label="Details inspector">
    <div className="inspector-head"><div><small>{title(selection.kind)}</small><h2>{heading}</h2><code>{subheading}</code></div><button onClick={close} aria-label="Close inspector"><PanelRightClose /></button></div>
    <div className="inspector-tabs">{(['summary', 'authority', 'activity', 'evidence'] as const).map(item => <button className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{title(item)}</button>)}</div>
    <div className="inspector-body">
      {tab === 'summary' ? <>
        {census ? <><StatusBlock icon={<ProductMark entity={census} size="large" />} label="Discovery classification" value={census.classification.classification} detail={`${Math.round(census.classification.confidence * 100)}% detection confidence · ${census.framework === 'endpoint-inventory' ? 'authorization unreviewed; installation is not autonomous activity' : census.shadow ? 'shadow' : 'known'} entity`} /><Info label="Provider" value={census.provider ?? 'Not reported'} /><Info label="Last seen" value={stamp(census.last_seen)} /><Info label="Sources" value={census.discovery_sources.join(', ') || 'None reported'} /><button className="primary full" disabled={!!busy || (!census.classification.is_agent && census.framework !== 'endpoint-inventory')} onClick={() => void command('Registering H2A identity', '/api/discovery/import', { census_agent_id: census.agent_id, scan_id: scan?.scan_id }, 'Identity registered in H2A; ownership and authority still need assignment.') }><Fingerprint />Register in H2A</button></> : null}
        {agent ? <AgentSummary agent={agent} state={state} busy={busy} command={command} createRoom={createRoom} request={request} room={roomForAgent} peerCount={governedPeers.length} /> : null}
        {approval ? <ApprovalSummary approval={approval} action={action} state={state} busy={busy} command={command} /> : null}
        {action ? <><StatusBlock icon={<Activity />} label="Governed operation" value={action.status} detail={action.result?.summary ?? action.reason} /><Info label="Policy decision" value={action.decision} /><Info label="Execution count" value={String(action.execution_count)} />{action.result?.artifact ? <div className="artifact"><FileCheck2 /><div><strong>{action.result.artifact.name}</strong><small>{action.result.artifact.path}</small><code>{action.result.artifact.content_hash}</code></div></div> : null}</> : null}
        {finding ? <><StatusBlock icon={<ShieldAlert />} label={`${finding.severity} finding`} value={finding.status} detail={finding.summary} /><Capability value={finding.capability} /><Info label="Subject" value={`${finding.subject_type}: ${finding.subject_id}`} /></> : null}
        {event ? <><StatusBlock icon={<History />} label="Signed event" value={title(event.event_type)} detail={`${event.actor_type}: ${event.actor_id}`} /><Info label="Recorded" value={stamp(event.timestamp)} /><Info label="Event hash" value={event.event_hash} mono /></> : null}
        {room ? <RoomSummary room={room} state={state} command={command} busy={busy} /> : null}
        {memory ? <><StatusBlock icon={<Database />} label="Company memory" value={memory.status} detail={memory.content} /><Info label="Created by" value={memory.created_by_agent} /><Info label="Content hash" value={memory.content_hash} mono /></> : null}
        {connection ? <><StatusBlock icon={<Network />} label="Connection" value={connection.status} detail={connection.detail} /><Capability value={connection.capability} /></> : null}
        {report ? <><StatusBlock icon={<Network />} label="Collector report" value={report.status} detail={`${report.collector} observed ${report.summary.observed_agents} agents on ${report.host}.`} /><Info label="Source" value={title(report.source)} /><Info label="Observed" value={stamp(report.observed_at)} /><Info label="Shadow agents" value={String(report.summary.shadow_agents)} /><Info label="Findings" value={String(report.summary.findings)} />{report.findings.map(item => <div className="report-finding" key={item.finding_id}><span className={`badge ${item.severity === 'critical' || item.severity === 'high' ? 'red' : item.severity === 'medium' ? 'amber' : 'gray'}`}>{item.severity}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}</> : null}
        {component ? <><StatusBlock icon={<Activity />} label="Platform component" value={component.status} detail={`${component.name} is running in ${component.mode} mode.`} /><Info label="Component ID" value={component.id} mono /><Info label="Mode" value={component.mode} /><Info label="Endpoint" value={component.endpoint ?? 'Internal service'} /><Info label="Accepted sources" value={component.accepted_sources?.map(title).join(', ') || 'Native platform records'} /></> : null}
      </> : null}
      {tab === 'authority' ? subjectAgent ? <Authority agent={subjectAgent} /> : <Empty icon={<KeyRound />} title="No agent authority on this record" text="Authority is displayed when the selected record is linked to an H2A agent." /> : null}
      {tab === 'activity' ? report ? <div className="mini-timeline">{report.findings.map(item => <div key={item.finding_id}><span /><div><strong>{item.title}</strong><small>{item.category} · {item.severity}</small></div></div>)}</div> : events.length ? <div className="mini-timeline">{[...events].reverse().map(item => <div key={item.event_id}><span /><div><strong>{title(item.event_type)}</strong><small>{stamp(item.timestamp)} · {item.actor_id}</small></div></div>)}</div> : <Empty icon={<History />} title="No linked activity" text="No governance events are linked to this selection." /> : null}
      {tab === 'evidence' ? report ? <div className="evidence-view"><div className="evidence-verdict"><ShieldCheck /><div><strong>Collector payload retained</strong><small>Normalized report with a deterministic payload hash.</small></div></div><Info label="Payload hash" value={report.payload_hash} mono /><Info label="Received" value={stamp(report.received_at)} /><details open><summary>Normalized collector record</summary><pre>{JSON.stringify(report, null, 2)}</pre></details></div> : component ? <div className="evidence-view"><div className="evidence-verdict"><Activity /><div><strong>Live component status</strong><small>Generated by this running ByoSync installation.</small></div></div><Info label="Platform check" value={stamp(platform?.generated_at)} /><details open><summary>Component status record</summary><pre>{JSON.stringify(component, null, 2)}</pre></details></div> : <Evidence state={state} events={events} finding={finding} event={event} /> : null}
    </div>
  </aside>;
}

function AgentSummary({ agent, state, busy, command, createRoom, request, room, peerCount }: { agent: Agent; state: Snapshot; busy: string | null; command: Command; createRoom: () => Promise<void>; request: (name: string) => Promise<void>; room?: Room; peerCount: number }) {
  const lifecycle = agent.mandate?.status === 'active' ? 'suspend' : agent.mandate?.status === 'suspended' ? 'reactivate' : null;
  return <><StatusBlock icon={<ProductMark entity={agent} size="large" />} label="H2A identity" value={agent.status} detail={agent.owner ? `Accountable to ${agent.owner.name}` : 'Human ownership is required.'} />
    {authorityIssue(agent)&&<p className="sp-verdict"><ShieldAlert size={18}/>{authorityIssue(agent)}. Inspect current authority before allowing work.</p>}
    <Info label="Mandate expires" value={agent.mandate?.expires_at ? stamp(agent.mandate.expires_at) : 'Not reported — refresh after upgrading the backend'} />
    <Info label="Passport expires" value={agent.passport?.expires_at ? stamp(agent.passport.expires_at) : 'No expiry reported'} />
    <Info label="Known impact scope" value={`${state.rooms.filter(r=>r.agent_ids.includes(agent.agent_id)).length} visible rooms · ${state.actions.filter(a=>a.agent_id===agent.agent_id&&a.status==='pending').length} pending actions. External activity is not included.`} />
    <div className="identity-fact-grid"><div><UserCheck /><small>Accountable owner</small><strong>{agent.owner?.name || 'Unassigned'}</strong></div><div><Fingerprint /><small>Agent Passport</small><strong>{agent.passport ? 'Issued' : 'Not issued'}</strong></div><div><KeyRound /><small>Mandate</small><strong>{agent.mandate?.status || 'Not assigned'}</strong></div><div><ShieldCheck /><small>Control boundary</small><strong>ByoSync actions</strong></div></div>
    <div className="step-actions">
      {!agent.binding ? <button className="primary full" disabled={!!busy} onClick={() => void command('Binding accountable owner', `/api/agents/${agent.agent_id}/bind`, { human_id: state.session.human_id }, 'Human owner bound.') }><Users />Bind to {state.session.name}</button> : null}
      {agent.binding && !agent.passport ? <button className="primary full" disabled={!!busy} onClick={() => void command('Issuing signed passport', `/api/agents/${agent.agent_id}/passport`, {}, 'Signed Agent Passport issued.') }><Fingerprint />Issue Agent Passport</button> : null}
      {agent.passport && !agent.mandate ? <button className="primary full" disabled={!!busy} onClick={() => void command('Assigning bounded mandate', `/api/agents/${agent.agent_id}/mandate`, {}, 'Bounded mandate assigned.') }><KeyRound />Assign mandate</button> : null}
      {agent.mandate?.status === 'active' && (!room || (peerCount > 0 && room.agent_ids.length === 1)) ? <button className="primary full" disabled={!!busy} onClick={() => void createRoom()}><Users />{peerCount > 0 ? `Create cross-team room with ${peerCount} peer${peerCount === 1 ? '' : 's'}` : 'Create governed room'}</button> : null}
    </div>
    {room && agent.mandate?.status === 'active' ? <div className="operation-box"><h3>Governed operations</h3><p>These operate on real local governance data.</p><button disabled={!!busy} onClick={() => void request('inventory_report')}><Gauge />Generate estate report</button><button disabled={!!busy} onClick={() => void request('verify_integrity')}><ShieldCheck />Verify ledger</button><button disabled={!!busy} onClick={() => void request('evidence_export')}><FileCheck2 />Request evidence export</button><button className="danger" disabled={!!busy} onClick={() => void request('crm_write')}><XCircle />Test denied CRM write</button></div> : null}
    {lifecycle ? <div className="containment"><div><ShieldAlert /><span><strong>Contain authority</strong><small>{lifecycle === 'suspend' ? 'Suspension blocks new work and can be reversed.' : 'Reactivate the suspended mandate.'}</small></span></div><button className={lifecycle === 'suspend' ? 'danger' : 'secondary'} disabled={!!busy} onClick={() => void command(`${title(lifecycle)} mandate`, `/api/agents/${agent.agent_id}/mandate/lifecycle`, { action: lifecycle }, `Mandate ${lifecycle === 'suspend' ? 'suspended' : 'reactivated'}.`) }>{title(lifecycle)}</button></div> : null}
  </>;
}

function ApprovalSummary({ approval, action, state, busy, command }: { approval: Approval; action?: Action; state: Snapshot; busy: string | null; command: Command }) {
  const agent = state.agents.find(item => item.agent_id === approval.agent_id); const room = state.rooms.find(item => item.room_id === approval.room_id);
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => setReviewed(false), [approval.approval_id]);
  const allowedReviewer = ['admin', 'reviewer'].includes(state.session.role || 'admin');
  return <div className="approval-review-grid"><section><StatusBlock icon={<ProductMark entity={agent} size="large" />} label="Review action" value={approval.status} detail="Your decision applies to this request only. It does not expand the agent mandate." /><Info label="Requested action" value={title(approval.action)} /><Info label="Agent identity" value={agent?.name ?? approval.agent_id} /><Info label="Accountable owner" value={agent?.owner?.name ?? 'No owner'} /><Info label="Purpose" value={agent?.mandate?.purpose || 'Not available'} /><Info label="Working room" value={room?.name ?? approval.room_id} /><Info label="Requested" value={stamp(approval.requested_at)} /><Info label="Execution count" value={String(action?.execution_count ?? 0)} /><Info label="Policy result" value={action?.decision || 'Not reported'} /></section>
    <section className="approval-verification"><h3><ShieldCheck /> Human decision context</h3><p>Inspect the identity and authority attached to this exact request.</p><ol className="verification-steps"><li><span>1</span><div><strong>Identity bound to the request</strong><code>{approval.passport_id}</code></div></li><li><span>2</span><div><strong>Authority reference</strong><code>{approval.mandate_id}</code><small>Current status: {agent?.mandate?.status || 'Not available'}</small></div></li><li><span>3</span><div><strong>Decision will be recorded</strong><small>Backend rechecks authority before executing.</small></div></li></ol>
    <div className="reviewer-context"><strong>{approval.reviewed_by ? 'Recorded reviewer' : 'Current session'}</strong><p>{approval.reviewed_by ? state.humans.find(h => h.human_id === approval.reviewed_by)?.name || approval.reviewed_by : state.session.name}</p><small>{state.session.mode === 'named-user' ? 'Personal credential session. This is not biometric verification.' : 'Local operator mode. This is not independent human verification.'}</small></div>
    {approval.status === 'pending' ? <><label className="review-confirmation"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I have reviewed the exact action, accountable owner and authority.</label><div className="approval-actions"><button className="primary" disabled={!!busy || !reviewed || !allowedReviewer} onClick={() => void command('Approving exact action', `/api/approvals/${approval.approval_id}/decision`, { decision: 'approve' }, 'Approved action executed exactly once.') }><Check />Approve exact action</button><button className="danger" disabled={!!busy || !allowedReviewer} onClick={() => void command('Rejecting action', `/api/approvals/${approval.approval_id}/decision`, { decision: 'reject' }, 'Action rejected. No execution occurred.') }><X />Reject</button></div></> : <Info label="Resolved" value={stamp(approval.resolved_at)} />}</section></div>;
}

function RoomSummary({ room, state, command, busy }: { room: Room; state: Snapshot; command: Command; busy: string | null }) {
  const agent = state.agents.find(item => room.agent_ids.includes(item.agent_id));
  const assignments = state.collaboration.assignments.filter(item => item.room_id === room.room_id);
  const currentWork = assignments.at(-1);
  const assignee = currentWork ? state.agents.find(item => item.agent_id === currentWork.assigneeId) : agent;
  const peer = currentWork ? state.agents.find(item => room.agent_ids.includes(item.agent_id) && item.agent_id !== currentWork.assigneeId) : undefined;
  const completed = [...state.actions].reverse().find(item => item.room_id === room.room_id && item.status === 'executed');
  const [workTitle, setWorkTitle] = useState('Review AI access boundary');
  const [objective, setObjective] = useState('Inspect the assigned authority and produce an evidence-backed recommendation.');
  const [handoff, setHandoff] = useState('Review the evidence references under your own Passport and mandate. Do not inherit the sender authority.');
  const [response, setResponse] = useState('Review completed under the assigned identity and mandate.');
  const nextStatuses: Record<string, Array<'active' | 'approval' | 'blocked' | 'complete'>> = { queued: ['active', 'blocked'], active: ['approval', 'blocked', 'complete'], approval: ['active', 'blocked'], blocked: ['active'] };
  return <><StatusBlock icon={<Users />} label="Governed collaboration" value={room.agent_ids.length > 1 ? 'Cross-team room' : 'Active room'} detail={`${room.human_ids.length} human and ${room.agent_ids.length} independently governed agent participants.`} /><Info label="Created" value={stamp(room.created_at)} /><Info label="Agents" value={room.agent_ids.map(id => state.agents.find(item => item.agent_id === id)?.name ?? id).join(', ')} />
    {!currentWork && agent ? <div className="collab-form"><h3>Create accountable work</h3><p>The assignment keeps the agent, mandate, room, and trace linked.</p><label>Task title<input value={workTitle} onChange={event => setWorkTitle(event.target.value)} /></label><label>Objective<textarea value={objective} onChange={event => setObjective(event.target.value)} /></label><button className="primary full" disabled={!!busy || workTitle.trim().length < 3 || objective.trim().length < 8} onClick={() => void command('Creating governed assignment', `/api/rooms/${room.room_id}/work`, { agent_id: agent.agent_id, title: workTitle, objective, risk: 'sensitive', priority: 3 }, 'Governed assignment created with its mandate and evidence trace.') }><Workflow />Create governed task</button></div> : null}
    {currentWork ? <div className="work-card"><div><span><Workflow /></span><div><small>CURRENT GOVERNED TASK</small><h3>{currentWork.title}</h3><p>{currentWork.objective}</p></div><Status value={currentWork.status} /></div><Info label="Assigned identity" value={assignee?.name ?? currentWork.assigneeId} /><Info label="Mandate" value={currentWork.mandateId} mono /><Info label="Trace" value={currentWork.traceId ?? 'Pending'} mono /><Info label="Risk" value={currentWork.risk} /><div className="work-transitions">{(nextStatuses[currentWork.status] ?? []).map(status => <button key={status} className={status === 'blocked' ? 'danger' : 'secondary'} disabled={!!busy} onClick={() => void command(`Moving task to ${status}`, `/api/work/${currentWork.id}/status`, { status }, `Task moved to ${status}.`) }>{title(status)}</button>)}</div></div> : null}
    {currentWork && peer && assignee ? <div className="collab-form"><h3>Bounded agent handoff</h3><p>{assignee.name} can send context to {peer.name}. The recipient keeps its own Passport and mandate; authority is not inherited.</p><label>Handoff context<textarea value={handoff} onChange={event => setHandoff(event.target.value)} /></label><button className="secondary full" disabled={!!busy || !handoff.trim()} onClick={() => void command('Sending bounded handoff', `/api/work/${currentWork.id}/handoff`, { from_agent_id: assignee.agent_id, to_agent_id: peer.agent_id, act: 'handoff', subject: currentWork.title, body: handoff }, 'Bounded handoff delivered; the body hash and identities were added to evidence.') }><GitBranch />Send to {peer.name}</button></div> : null}
    {currentWork && assignee ? <div className="collab-form"><h3>Record agent outcome</h3><label>Outcome<textarea value={response} onChange={event => setResponse(event.target.value)} /></label><button className="secondary full" disabled={!!busy || !response.trim()} onClick={() => void command('Recording governed outcome', `/api/work/${currentWork.id}/response`, { agent_id: assignee.agent_id, body: response }, 'Outcome recorded; evidence contains its hash, not the body.') }><CheckCircle2 />Record outcome</button></div> : null}
    {state.collaboration.messages.filter(item => currentWork && item.assignmentId === currentWork.id).map(message => <div className="handoff-row" key={message.id}><GitBranch /><div><strong>{state.agents.find(item => item.agent_id === message.fromAgentId)?.name ?? message.fromAgentId} → {state.agents.find(item => item.agent_id === message.toAgentId)?.name ?? message.toAgentId}</strong><p>{message.subject}</p><small>{message.act} · delivered {relative(message.createdAt)} · trace {message.traceId}</small></div></div>)}
    {completed && agent ? <button className="primary full memory-action" disabled={!!busy} onClick={() => void command('Proposing reviewed memory', `/api/rooms/${room.room_id}/memories`, { agent_id: agent.agent_id, title: `${agent.name} governance record` }, 'Memory proposed from the completed governed action.') }><Database />Propose company memory</button> : <p className="callout">Complete a governed operation before proposing reusable company memory.</p>}</>;
}

function Authority({ agent }: { agent: Agent }) { return <div className="authority-stack"><Info label="Human owner" value={agent.owner?.name ?? 'Not bound'} /><Info label="Binding" value={agent.binding?.binding_id ?? 'Not issued'} mono /><Info label="Passport" value={agent.passport?.passport_id ?? 'Not issued'} mono /><Info label="Passport state" value={agent.passport?.status ?? 'Unavailable'} /><Info label="Mandate" value={agent.mandate?.mandate_id ?? 'Not assigned'} mono /><Info label="Purpose" value={agent.mandate?.purpose ?? 'No authority'} /><Info label="Allowed" value={agent.mandate?.allowed_actions.join(', ') || 'None'} /><Info label="Needs approval" value={agent.mandate?.approval_required_actions.join(', ') || 'None'} /><Info label="Denied" value={agent.mandate?.denied_actions.join(', ') || 'None'} /><Capability value={agent.mandate?.status === 'active' ? 'Inline enforced' : 'Observe only'} /></div>; }

function Evidence({ state, events, finding, event }: { state: Snapshot; events: AuditEvent[]; finding?: AssuranceFinding; event?: AuditEvent }) {
  const relevant = event ? [event] : events; return <div className="evidence-view"><div className="evidence-verdict"><ShieldCheck /><div><strong>Integrity: {state.integrity.status}</strong><small>{state.integrity.recordCount} hash-linked records · head {state.integrity.headHash?.slice(0, 16) ?? 'none'}…</small></div></div><Info label="Evidence completeness" value={relevant.length ? `${relevant.length} linked records` : finding?.evidence_refs.length ? `${finding.evidence_refs.length} referenced records` : 'No linked records'} /><Info label="Substantiation" value={relevant.length ? 'Signed platform events available' : 'Not verified for this selection'} />{relevant.map(item => <details key={item.event_id}><summary>{title(item.event_type)} · {stamp(item.timestamp)}</summary><pre>{JSON.stringify(item, null, 2)}</pre></details>)}</div>;
}

function Panel({ title: heading, subtitle, count, action, children }: { title: string; subtitle: string; count?: number; action?: ReactNode; children: ReactNode }) { return <section className="panel"><header><div><h2>{heading}{count !== undefined ? <b>{count}</b> : null}</h2><p>{subtitle}</p></div>{action}</header><div className="panel-body">{children}</div></section>; }
function Row({ icon, title: heading, detail, badge, tone = 'gray', onClick }: { icon: ReactNode; title: string; detail: string; badge?: string; tone?: string; onClick?: () => void }) { return <button className="list-row" onClick={onClick}><span className="row-icon">{icon}</span><span><strong>{heading}</strong><small>{detail}</small></span>{badge ? <span className={`badge ${tone}`}>{badge}</span> : null}<ChevronRight /></button>; }
function Empty({ icon, title: heading, text }: { icon: ReactNode; title: string; text: string }) { return <div className="empty">{icon}<h3>{heading}</h3><p>{text}</p></div>; }
function LoadingState() { return <div className="loading"><Loader2 className="spin" /><h2>Loading ByoSync</h2><p>Reading persisted identity, authority, and evidence state.</p></div>; }
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <div className={tone ?? ''}><small>{label}</small><strong>{value}</strong></div>; }
function Status({ value }: { value: string }) { const lower = value.toLowerCase(); const tone = ['not verified', 'not measured', 'not configured', 'no evidence', 'unavailable'].some(item => lower.includes(item)) ? 'gray' : ['denied', 'rejected', 'critical', 'shadow', 'required', 'unowned', 'failure', 'revoked'].some(item => lower.includes(item)) ? 'red' : ['pending', 'suspended', 'warning', 'medium', 'degraded'].some(item => lower.includes(item)) ? 'amber' : ['active', 'operating', 'managed', 'executed', 'approved', 'published', 'verified', 'no open issue', 'measured', 'connected'].some(item => lower.includes(item)) ? 'green' : 'gray'; return <span className={`badge ${tone}`}>{value}</span>; }
function Capability({ value }: { value: string }) { const inline = value === 'Inline enforced'; return <span className={`capability ${inline ? 'inline' : value === 'Connector controlled' ? 'connector' : ''}`}><span />{value}</span>; }
function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="info"><span>{label}</span>{mono ? <code>{value}</code> : <strong>{value}</strong>}</div>; }
function StatusBlock({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) { return <div className="status-block"><span>{icon}</span><div><small>{label}</small><h3>{title(value)}</h3><p>{detail}</p></div></div>; }
