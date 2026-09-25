import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight, ArrowUpRight, BookOpen, Bot, Check, CheckCircle2, ChevronRight,
  Clock3, Command, Database, FileCheck2, Fingerprint, Layers3, Link2,
  Loader2, LockKeyhole, Network, RefreshCw, Search, ShieldCheck,
  ShieldQuestion, ShieldX, Users,
} from 'lucide-react';
import type { Agent, AuditEvent, Memory, Snapshot } from '../../governance/contracts';
import { CensusDiscovery } from './CensusDiscovery';

type Page = 'discovery' | 'registry' | 'room' | 'approvals' | 'memory' | 'trace';
const nav = [
  { id: 'discovery', label: 'Discovery', icon: Search },
  { id: 'registry', label: 'Agent Registry', icon: Fingerprint },
  { id: 'room', label: 'Collaboration Room', icon: Network },
  { id: 'approvals', label: 'Human Approvals', icon: FileCheck2 },
  { id: 'memory', label: 'Company Memory', icon: BookOpen },
  { id: 'trace', label: 'Identity Trace', icon: Layers3 },
] as const;
const headings: Record<Page, [string, string]> = {
  discovery: ['Discover the real AI estate.', 'Scan Agent Census, inspect its evidence, and choose which discovered agents to register for human governance.'],
  registry: ['Give every agent an accountable identity.', 'Connect a human owner, issue a passport, and define the boundaries of delegated work.'],
  room: ['A shared room. Clear boundaries.', 'People and agents collaborate with a visible identity, a purpose, and an enforceable mandate.'],
  approvals: ['Human judgment, at the right moment.', 'Sensitive actions wait here. Your decision controls whether the requested action executes.'],
  memory: ['Knowledge with a chain of trust.', 'Research becomes trusted company memory only after a human reviews its evidence and content.'],
  trace: ['One identity. The complete story.', 'Follow the persisted evidence from discovery through delegated action and reviewed company memory.'],
};
const eventLabels: Record<string, string> = {
  AGENT_DISCOVERED: 'Agent discovered', CLASSIFIED_SHADOW: 'Classified as Shadow',
  AGENT_CLASSIFIED_SHADOW: 'Classified as Shadow', HUMAN_BOUND: 'Human owner bound',
  HUMAN_BINDING_CREATED: 'Human owner bound', PASSPORT_ISSUED: 'Agent passport issued',
  CLASSIFIED_MANAGED: 'Classified as Managed', MANDATE_ASSIGNED: 'Mandate assigned', MANDATE_CREATED: 'Mandate assigned',
  ROOM_CREATED: 'Collaboration room created', ROOM_JOINED: 'Joined collaboration room',
  ACTION_REQUESTED: 'Agent action requested', ACTION_ALLOWED: 'Mandate allowed action',
  ACTION_DENIED: 'Mandate denied action', ACTION_EXECUTED: 'Agent action executed',
  APPROVAL_REQUESTED: 'Human approval requested', APPROVAL_GRANTED: 'Human approval granted',
  APPROVAL_REJECTED: 'Human approval rejected', MEMORY_PROPOSED: 'Company memory proposed',
  HUMAN_APPROVAL_REQUIRED: 'Human approval requested', HUMAN_APPROVED: 'Human approval granted',
  HUMAN_REJECTED: 'Human approval rejected', POLICY_ALLOWED: 'Mandate allowed action', POLICY_DENIED: 'Mandate denied action',
  MEMORY_REVIEWED: 'Memory reviewed by human', MEMORY_PUBLISHED: 'Trusted company memory published',
  MEMORY_REJECTED: 'Proposed memory rejected',
};
function titleCase(value: string): string { return value.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()); }
function date(value?: string): string { return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not yet'; }
function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`g-badge ${tone}`}>{children}</span>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="g-field"><dt>{label}</dt><dd>{children || 'Not assigned'}</dd></div>; }
function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) { return <div className="g-empty">{icon}<h2>{title}</h2><div>{children}</div></div>; }

async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST', signal,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

export function GovernanceApp(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>(() => nav.find((item) => item.id === window.location.hash.slice(1))?.id ?? 'discovery');
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('agent'));
  const [discoveryVisit, setDiscoveryVisit] = useState(0);
  const [humanId, setHumanId] = useState('HUM-PRIYA');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [trace, setTrace] = useState<AuditEvent[]>([]);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [editingMemory, setEditingMemory] = useState<string | null>(null);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [roomPeerIds, setRoomPeerIds] = useState<string[]>([]);

  const agent = snapshot?.agents.find((item) => item.agent_id === selectedId)
    ?? snapshot?.agents[0] ?? null;
  const room = snapshot?.rooms.find((item) => agent && item.agent_ids.includes(agent.agent_id));
  const actions = snapshot?.actions.filter((item) => item.room_id === room?.room_id && item.agent_id === agent?.agent_id) ?? [];
  const approvals = snapshot?.approvals.filter((item) => item.agent_id === agent?.agent_id) ?? [];
  const memories = snapshot?.memories.filter((item) => item.agent_id === agent?.agent_id) ?? [];
  const pending = snapshot?.approvals.filter((item) => item.status === 'pending').length ?? 0;
  const hasResearch = actions.some((item) => item.action === 'web_search' && item.status === 'executed');
  const roomPeers = snapshot?.agents.filter((item) => item.agent_id !== agent?.agent_id && !!item.discovery_snapshot && !item.legacy_identity && item.governance_status === 'Managed' && item.mandate?.status === 'active') ?? [];

  useEffect(() => { setRoomPeerIds([]); }, [agent?.agent_id]);

  useEffect(() => {
    const controller = new AbortController();
    api<Snapshot>('/api/state', undefined, controller.signal).then(setSnapshot).catch((reason: Error) => {
      if (reason.name !== 'AbortError') setError(reason.message);
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const onHash = () => setPage(nav.find((item) => item.id === window.location.hash.slice(1))?.id ?? 'discovery');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    const url = new URL(window.location.href); url.searchParams.set('agent', selectedId);
    window.history.replaceState(null, '', url);
  }, [selectedId]);
  useEffect(() => {
    if (page !== 'trace' || !agent) return;
    const controller = new AbortController();
    setTraceLoading(true); setTraceError(null); setTrace([]);
    api<AuditEvent[]>(`/api/agents/${encodeURIComponent(agent.agent_id)}/trace`, undefined, controller.signal)
      .then(setTrace).catch((reason: Error) => { if (reason.name !== 'AbortError') setTraceError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setTraceLoading(false); });
    return () => controller.abort();
  }, [page, agent?.agent_id, snapshot?.events.length]);

  function navigate(next: Page): void { if (next === 'discovery') setDiscoveryVisit((value) => value + 1); setPage(next); window.location.hash = next; setNotice(null); window.scrollTo(0, 0); }
  async function command(path: string, body: unknown, success: string, next?: Page): Promise<boolean> {
    if (busy) return false;
    setBusy(path); setError(null); setNotice(null);
    try {
      const updated = await api<Snapshot>(path, body);
      setSnapshot(updated); if (next) navigate(next); setNotice(success);
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The operation failed. Please try again.'); return false; }
    finally { setBusy(null); }
  }
  async function refresh(): Promise<void> {
    setBusy('refresh'); setError(null);
    try { setSnapshot(await api<Snapshot>('/api/state')); setNotice('Loaded the latest persisted state.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not connect to the governance service.'); }
    finally { setBusy(null); }
  }
  function act(action: string): void {
    if (!room || !agent) return;
    void command(`/api/rooms/${room.room_id}/actions`, { agent_id: agent.agent_id, action, idempotency_key: crypto.randomUUID() }, 'Mandate evaluated. The decision and execution state are recorded below.');
  }
  function review(memory: Memory, decision: 'approve' | 'reject', content?: string): void {
    void command(`/api/memories/${memory.memory_id}/review`, { decision, ...(content !== undefined ? { content, note: 'Edited and approved by the human reviewer.' } : {}) }, decision === 'approve' ? 'Human review recorded. This is now trusted company memory.' : 'Memory rejected. It has not been published.').then((saved) => { if (saved) setEditingMemory(null); });
  }
  const steps = [
    { label: 'Discovered', done: !!agent, page: 'discovery' },
    { label: 'Human bound', done: !!agent?.binding, page: 'registry' },
    { label: 'Passport', done: !!agent?.passport, page: 'registry' },
    { label: 'Mandate', done: !!agent?.mandate, page: 'registry' },
    { label: 'Collaboration', done: hasResearch, page: 'room' },
    { label: 'Human approval', done: approvals.some((item) => item.status === 'approved'), page: 'approvals' },
    { label: 'Trusted memory', done: memories.some((item) => item.status === 'published'), page: 'memory' },
  ] as const;

  return <div className="g-shell">
    <a className="g-skip" href="#main-content">Skip to content</a>
    <aside className="g-sidebar">
      <a href="#discovery" className="g-brand" aria-label="H2A governance home"><span><Command size={22} /></span>H2A <small>GOVERNANCE</small></a>
      <div className="g-organization"><span className="g-org-mark"><Layers3 size={20} /></span><div><strong>Enterprise workspace</strong><small>Marketing Operations</small></div></div>
      <div className="g-nav-label">AGENT GOVERNANCE</div>
      <nav aria-label="Primary navigation">{nav.map((item) => <button key={item.id} data-testid={`nav-${item.id}`} aria-current={page === item.id ? 'page' : undefined} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><item.icon size={19} /><span>{item.label}</span>{item.id === 'approvals' && pending > 0 ? <b>{pending}</b> : null}</button>)}</nav>
      <div className="g-sidebar-bottom"><ShieldCheck size={19} /><div><strong>Accountable by design</strong><p>One agent identity.<br />Every decision connected.</p></div></div>
      <div className="g-profile"><span className="g-avatar">PS</span><div><strong>{snapshot?.session.name ?? 'Priya Sharma'}</strong><small>Local demo presenter</small></div></div>
    </aside>
    <div className="g-frame">
      <header className="g-topbar"><div>Enterprise workspace <ChevronRight size={14} /><strong>{nav.find((item) => item.id === page)?.label}</strong></div><div><span className={`g-connection ${snapshot ? 'connected' : ''}`}><i />{snapshot ? 'Connected demo' : 'Connecting'}</span><button className="g-icon-button" onClick={() => void refresh()} disabled={!!busy} aria-label="Refresh persisted state" title="Refresh persisted state"><RefreshCw size={17} className={busy === 'refresh' ? 'g-spin' : ''} /></button></div></header>
      <main id="main-content" className="g-main">
        <div className="g-page-heading"><div><span className="g-eyebrow">HUMAN AUTHORITY · AGENT ACCOUNTABILITY</span><h1>{headings[page][0]}</h1><p>{headings[page][1]}</p></div><Badge tone="teal"><ShieldCheck size={14} />Governance demo</Badge></div>
        {error ? <div role="alert" className="g-alert error"><ShieldX size={19} /><span>{error}</span><button onClick={() => void refresh()} disabled={!!busy}>Retry connection</button></div> : null}
        {notice ? <div role="status" className="g-alert success"><CheckCircle2 size={18} />{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div> : null}
        {!snapshot ? <div className="g-card g-loading"><Loader2 size={24} className="g-spin" /><h2>{error ? 'Governance service unavailable' : 'Loading your governance workspace'}</h2><p>{error ? 'Start the demo services, then use Retry connection above.' : 'Retrieving agents, identities, decisions, and evidence.'}</p></div> : <>
          {page !== 'discovery' ? <><div className="g-progress" aria-label="Agent lifecycle progress">{steps.map((step, index) => <button key={step.label} onClick={() => navigate(step.page)} className={step.done ? 'complete' : ''}><span>{step.done ? <Check size={13} /> : index + 1}</span>{step.label}</button>)}</div>
          {agent ? <section className="g-trust-strip" aria-label="Selected agent trust context"><div className="g-agent-title"><span className="g-agent-icon"><Bot size={23} /></span><div><strong>{agent.name}</strong><small><code data-testid="agent-id">{agent.agent_id}</code> · {agent.framework}</small></div><Badge tone={agent.status === 'Managed' ? 'green' : 'amber'}>{agent.status === 'Managed' ? <ShieldCheck size={13} /> : <ShieldQuestion size={13} />}H2A {agent.governance_status}</Badge></div><div className="g-trust-items"><span><Database size={15} />Census: {agent.census_agent_id}</span><span><Users size={15} />{agent.owner?.name ?? 'No human owner'}</span><span><Fingerprint size={15} />{agent.passport?.passport_id ?? 'No passport'}</span><span><LockKeyhole size={15} />{agent.mandate?.purpose ?? 'No mandate'}</span></div></section> : null}

          </> : null}

          {page === 'discovery' ? <CensusDiscovery key={discoveryVisit} snapshot={snapshot} request={api} onImported={setSnapshot} onRegistry={(id) => { setSelectedId(id); navigate('registry'); }} /> : null}

          {page === 'registry' && snapshot.agents.length > 0 ? <section className="g-card"><div className="g-section-heading"><div><h2>H2A Agent Registry</h2><p>Explicitly imported identities. Governance state is separate from Census discovery classification.</p></div><Badge>{snapshot.agents.length} registered identities</Badge></div><div className="g-table-wrap"><table className="g-table"><thead><tr><th>Agent</th><th>H2A identity</th><th>Census identity</th><th>H2A governance</th><th>Action</th></tr></thead><tbody>{snapshot.agents.map((item) => <tr key={item.agent_id} data-testid={`registry-row-${item.agent_id}`} className={item.agent_id === agent?.agent_id ? 'selected' : ''}><td><strong>{item.name}</strong><small>{item.framework}</small></td><td><code>{item.agent_id}</code></td><td><code>{item.census_agent_id}</code></td><td><Badge tone={item.governance_status === 'Managed' ? 'green' : 'teal'}>{item.governance_status}</Badge></td><td><button className="g-button secondary compact" data-testid={`select-registry-${item.agent_id}`} onClick={() => setSelectedId(item.agent_id)}>View governance<ArrowRight size={14} /></button></td></tr>)}</tbody></table></div></section> : null}

          {page === 'registry' ? !agent ? <Empty icon={<Fingerprint size={30} />} title="No agents registered in H2A"><p>Scan Agent Census and explicitly register a discovered agent to start its governance lifecycle.</p><button className="g-button primary" onClick={() => navigate('discovery')}>Open discovery<ArrowRight size={16} /></button></Empty> : <>
            <div className="g-section-heading"><div><h2>Bring under governance</h2><p>Complete these steps in order. Each operation persists a connected record.</p></div><button className="g-button secondary" onClick={() => navigate('trace')}><Layers3 size={15} />Inspect identity trace</button></div>
            <div className="g-onboarding">
              <section className="g-card"><StepHeader number="01" title="Bind a human owner" done={!!agent.binding} /><p className="g-muted">Make responsibility explicit. Passport issuance uses this binding.</p>{agent.binding ? <><div className="g-person"><span className="g-avatar">{agent.owner?.name.split(' ').map((word) => word[0]).join('')}</span><div><strong>{agent.owner?.name}</strong><small>{agent.owner?.team}</small></div><CheckCircle2 size={19} /></div><dl className="g-details"><Field label="Relationship">Owner · Active</Field><Field label="Binding ID"><code>{agent.binding.binding_id}</code></Field><Field label="Bound on">{date(agent.binding.created_at)}</Field></dl></> : <><label className="g-input-label" htmlFor="owner-human">Human owner</label><select id="owner-human" value={humanId} onChange={(event) => setHumanId(event.target.value)}>{snapshot.humans.map((human) => <option key={human.human_id} value={human.human_id}>{human.name} · {human.team}</option>)}</select><button className="g-button primary full" data-testid="bind-human" disabled={!!busy || !humanId} onClick={() => void command(`/api/agents/${agent.agent_id}/bind`, { human_id: humanId }, 'Human binding saved. The agent is ready for passport issuance.')}><Users size={16} />Bind human owner</button></>}</section>
              <section className="g-card"><StepHeader number="02" title="Issue an agent passport" done={!!agent.passport} /><p className="g-muted">An identity credential that references this agent and its accountable owner.</p>{agent.passport ? <><div className="g-passport"><Fingerprint size={28} /><span>AGENT PASSPORT<strong data-testid="passport-id">{agent.passport.passport_id}</strong></span><Badge tone="green">{agent.passport.status}</Badge></div><dl className="g-details"><Field label="Agent ID"><code>{agent.passport.agent_id}</code></Field><Field label="Owner">{agent.owner?.name}</Field><Field label="Issued on">{date(agent.passport.issued_at)}</Field></dl><details className="g-technical"><summary>Credential evidence</summary><dl className="g-details"><Field label="Binding ID"><code>{agent.passport.binding_id}</code></Field><Field label="Signature"><code>{agent.passport.passport_signature}</code></Field></dl></details></> : <><div className="g-placeholder"><Fingerprint size={30} /><span>{agent.binding ? 'Human binding verified. Ready to issue.' : 'Bind a human owner to continue.'}</span></div><button className="g-button primary full" data-testid="issue-passport" disabled={!!busy || !agent.binding} onClick={() => void command(`/api/agents/${agent.agent_id}/passport`, {}, 'Passport issued and persisted. The agent is now Managed.')}><Fingerprint size={16} />Issue passport</button></>}</section>
              <section className="g-card"><StepHeader number="03" title="Assign a mandate" done={!!agent.mandate} /><p className="g-muted">Purpose: competitive market research. Limit the actions this identity may perform.</p><PolicyList mandate={agent.mandate} />{agent.mandate ? <dl className="g-details"><Field label="Mandate ID"><code>{agent.mandate.mandate_id}</code></Field><Field label="Purpose">{agent.mandate.purpose}</Field></dl> : <button className="g-button primary full" data-testid="assign-mandate" disabled={!!busy || !agent.passport} onClick={() => void command(`/api/agents/${agent.agent_id}/mandate`, {}, 'Mandate assigned. Policy enforcement is ready in the collaboration room.')}><LockKeyhole size={16} />Assign research mandate</button>}</section>
            </div><div className="g-next-step"><div><strong>{agent.mandate ? 'This agent is ready to collaborate.' : 'A connected identity, one step at a time.'}</strong><p>{agent.mandate ? 'Create a room and exercise the mandate with actual action requests.' : 'The room becomes available once the passport and mandate are in place.'}</p></div><button className="g-button primary" disabled={!agent.mandate} onClick={() => navigate('room')}>Continue to collaboration<ArrowRight size={16} /></button></div>
          </> : null}

          {page === 'room' ? <>
            {!room ? <section className="g-card"><Empty icon={<Network size={32} />} title="Q4 Product Launch Research"><p>Bring {agent?.owner?.name ?? snapshot.session.name} and {agent?.name ?? 'a registered agent'} together in one governed room.</p><RoomPeerPicker peers={roomPeers} selected={roomPeerIds} onChange={setRoomPeerIds} disabled={!!busy} /><button className="g-button primary" data-testid="create-room" disabled={!!busy || !agent?.mandate} onClick={() => agent && void command('/api/rooms', { agent_id: agent.agent_id, agent_ids: roomPeers.filter((peer) => roomPeerIds.includes(peer.agent_id)).map((peer) => peer.agent_id), name: 'Q4 Product Launch Research' }, 'Room created. Participants and their identity references are persisted.')}><Users size={17} />Create collaboration room</button>{!agent?.mandate ? <p className="g-help">Complete human binding, passport issuance, and mandate assignment first. <button className="g-link" onClick={() => navigate('registry')}>Open Agent Registry</button></p> : null}</Empty></section> : <>
              <section className="g-card g-room-header"><div className="g-section-heading"><div><span className="g-eyebrow">COLLABORATION ROOM</span><h2>{room.name}</h2><p><code>{room.room_id}</code> · Created {date(room.created_at)}</p></div><Badge tone="green"><LockKeyhole size={13} />Governed room</Badge></div><div className="g-participants">{room.human_ids.map((id) => { const human = snapshot.humans.find((item) => item.human_id === id); return <div className="g-participant" key={id}><span className="g-avatar">{human?.name.split(' ').map((word) => word[0]).join('')}</span><div><strong>{human?.name ?? id}</strong><small>Human owner · {human?.team}</small></div></div>; })}{room.agent_ids.map((id) => { const member = snapshot.agents.find((item) => item.agent_id === id); return <div className="g-participant" key={id}><span className="g-agent-icon"><Bot size={21} /></span><div><strong>{member?.name ?? id}</strong><small>{member?.passport ? 'Passport ✓' : 'No passport'} · Owner: {member?.owner?.name ?? 'None'}</small><small>Mandate: {member?.mandate?.purpose ?? 'None'}</small></div></div>; })}</div></section>
              <div className="g-room-grid"><section className="g-card"><div className="g-section-heading"><div><h2>Request an agent action</h2><p>Each request passes through the backend mandate evaluator.</p></div><LockKeyhole size={20} /></div><ActionButton icon={<Search size={19} />} title="Search competitor products" subtitle="web_search · Allowed by mandate" testId="action-web-search" disabled={!!busy} onClick={() => act('web_search')} /><ActionButton icon={<ArrowUpRight size={19} />} title="Share competitor report externally" subtitle="external_share · Human approval required" testId="action-external-share" disabled={!!busy} onClick={() => act('external_share')} /><ActionButton icon={<ShieldX size={19} />} title="Attempt CRM write" subtitle="crm_write · Denied by mandate" testId="action-crm-write" disabled={!!busy} onClick={() => act('crm_write')} /><div className="g-simulation"><span>SIMULATED EXECUTION</span>Research results and external delivery use deterministic demo fixtures. Policy decisions, approval gates, and evidence are enforced by the backend.</div></section><section className="g-card g-memory-callout"><BookOpen size={27} /><h2>Turn research into company memory</h2><p>Propose “Competitor X Pricing Strategy” from the completed research. Human review is required before publication.</p><button className="g-button primary" data-testid="propose-memory" disabled={!!busy || !hasResearch} onClick={() => agent && void command(`/api/rooms/${room.room_id}/memories`, { agent_id: agent.agent_id }, 'Research memory proposed with source evidence. It is awaiting human review.', 'memory')}><BookOpen size={16} />Propose company memory</button>{!hasResearch ? <small>Execute the competitor search to collect source evidence.</small> : <small><CheckCircle2 size={13} />Research evidence is available.</small>}</section></div>
              <section className="g-card"><div className="g-section-heading"><div><h2>Room timeline</h2><p>Persisted action requests, policy decisions, and execution results.</p></div><Badge>{actions.length} requests</Badge></div>{actions.length === 0 ? <p className="g-muted">The room is ready. Request an action above to begin the research.</p> : <div className="g-action-timeline">{[...actions].reverse().map((action) => <article key={action.action_id} data-testid={`action-${action.action_id}`} className={`g-action-entry ${action.status}`}><span className="g-timeline-dot">{action.status === 'executed' ? <Check size={15} /> : action.status === 'pending' ? <Clock3 size={15} /> : <ShieldX size={15} />}</span><div><div className="g-entry-title"><h3>{action.label}</h3><Badge tone={action.status === 'executed' ? 'green' : action.status === 'pending' ? 'amber' : 'red'}>{titleCase(action.status)}</Badge></div><p>{action.result?.summary ?? (action.status === 'pending' ? 'Human Approval Required. Action has not executed.' : action.status === 'rejected' ? 'The human rejected this action. No execution occurred.' : action.reason)}</p><div className="g-entry-meta"><code>{action.action}</code><span>Policy: {action.decision}</span><span>Executions: <b>{action.execution_count}</b></span><time>{date(action.requested_at)}</time></div>{Array.isArray(action.result?.details?.products) ? <div className="g-products">{(action.result.details.products as Array<{ name: string; price: string; source: string }>).map((product) => <div key={product.name}><strong>{product.name}</strong><span>{product.price}</span><small>{product.source}</small></div>)}</div> : null}{action.status === 'pending' ? <button className="g-link" onClick={() => navigate('approvals')}>Review human approval<ArrowRight size={14} /></button> : null}<details className="g-technical"><summary>Action identity and evidence</summary><dl className="g-details columns"><Field label="Action"><code>{action.action_id}</code></Field><Field label="Agent"><code>{action.agent_id}</code></Field><Field label="Passport"><code>{action.passport_id}</code></Field><Field label="Mandate"><code>{action.mandate_id}</code></Field><Field label="Room"><code>{action.room_id}</code></Field><Field label="Approval"><code>{action.approval_id ?? 'Not required'}</code></Field></dl></details></div></article>)}</div>}</section>
            </>}
          </> : null}

          {page === 'approvals' ? <>
            <div className="g-review-banner"><span className="g-avatar">PS</span><div><strong>Reviewing as {snapshot.session.name}</strong><p>Local demo human session. Approval is scoped to a single requested action.</p></div><Badge tone="amber">Human decision</Badge></div>
            {approvals.length === 0 ? <section className="g-card"><Empty icon={<FileCheck2 size={30} />} title="No approval requests yet"><p>Request an external report share in the collaboration room. The mandate will pause execution and create a review request.</p><button className="g-button secondary" onClick={() => navigate('room')}>Go to collaboration room<ArrowRight size={16} /></button></Empty></section> : <div className="g-review-list">{[...approvals].reverse().map((approval) => { const action = snapshot.actions.find((item) => item.action_id === approval.action_id); return <section className="g-card" key={approval.approval_id} data-testid={`approval-${approval.approval_id}`}><div className="g-section-heading"><div><span className="g-eyebrow">{approval.approval_id}</span><h2>Share competitor report externally</h2><p>{agent?.name} requested <code>{approval.action}</code> in {snapshot.rooms.find((item) => item.room_id === approval.room_id)?.name}.</p></div><Badge tone={approval.status === 'pending' ? 'amber' : approval.status === 'approved' ? 'green' : 'red'}>{titleCase(approval.status)}</Badge></div><div className={`g-enforcement ${approval.status === 'approved' ? 'allowed' : ''}`}><LockKeyhole size={17} /><strong>{approval.status === 'pending' ? 'Human Approval Required — execution is blocked.' : approval.status === 'approved' ? 'Approved once — the action executed.' : 'Request closed — the action did not execute.'}</strong><span data-testid="execution-count">Executions: {action?.execution_count ?? 0}</span></div><dl className="g-details columns"><Field label="Agent"><code>{approval.agent_id}</code></Field><Field label="Passport"><code>{approval.passport_id}</code></Field><Field label="Mandate"><code>{approval.mandate_id}</code></Field><Field label="Requested">{date(approval.requested_at)}</Field><Field label="Decision by">{approval.reviewed_by ? snapshot.humans.find((human) => human.human_id === approval.reviewed_by)?.name ?? approval.reviewed_by : 'Awaiting human decision'}</Field><Field label="Action result">{action?.result?.summary ?? 'No execution result'}</Field></dl>{approval.status === 'pending' ? <div className="g-button-row"><button className="g-button primary" data-testid="approve-once" disabled={!!busy} onClick={() => void command(`/api/approvals/${approval.approval_id}/decision`, { decision: 'approve' }, 'Approved once. The governed action has now executed and its result is recorded.')}><Check size={16} />Approve Once</button><button className="g-button danger" data-testid="reject-action" disabled={!!busy} onClick={() => void command(`/api/approvals/${approval.approval_id}/decision`, { decision: 'reject' }, 'Request rejected. The action remains unexecuted.')}><ShieldX size={16} />Reject</button><span className="g-help">This decision does not change the mandate.</span></div> : null}</section>; })}</div>}
          </> : null}

          {page === 'memory' ? <>
            <div className="g-metrics three"><Metric label="Proposed · awaiting review" value={memories.filter((item) => item.status === 'proposed').length} icon={<Clock3 size={20} />} tone="amber" /><Metric label="Trusted company memories" value={memories.filter((item) => item.status === 'published').length} icon={<ShieldCheck size={20} />} /><Metric label="Rejected proposals" value={memories.filter((item) => item.status === 'rejected').length} icon={<ShieldX size={20} />} /></div>
            {memories.length === 0 ? <section className="g-card"><Empty icon={<BookOpen size={30} />} title="Evidence before institutional knowledge"><p>Complete research in the collaboration room, then propose a memory for human review.</p><button className="g-button secondary" onClick={() => navigate('room')}>Open collaboration room<ArrowRight size={16} /></button></Empty></section> : [...memories].reverse().map((memory) => <section key={memory.memory_id} className={`g-card g-memory ${memory.status}`} data-testid={`memory-${memory.memory_id}`}><div className="g-section-heading"><div><span className="g-eyebrow">{memory.memory_id}</span><h2>{memory.title}</h2></div><Badge tone={memory.status === 'published' ? 'green' : memory.status === 'proposed' ? 'amber' : 'red'}>{memory.status === 'published' ? <><ShieldCheck size={14} />Trusted company memory</> : memory.status === 'proposed' ? <><Clock3 size={14} />Proposed · Unreviewed</> : 'Rejected · Not published'}</Badge></div>{memory.status === 'proposed' ? <div className="g-proposed-note">This proposal is not trusted company memory. A human must review its content and sources.</div> : null}{editingMemory === memory.memory_id ? <><label className="g-input-label" htmlFor={`edit-${memory.memory_id}`}>Edit memory before approval</label><textarea id={`edit-${memory.memory_id}`} data-testid="memory-edit-content" value={memoryDraft} onChange={(event) => setMemoryDraft(event.target.value)} rows={5} /></> : <p className="g-memory-content">{memory.content}</p>}<div className="g-provenance"><h3><Link2 size={16} />Provenance</h3><dl className="g-details columns"><Field label="Created by agent">{snapshot.agents.find((item) => item.agent_id === memory.created_by_agent)?.name}<code>{memory.created_by_agent}</code></Field><Field label="Reviewed by human">{memory.reviewed_by ? snapshot.humans.find((human) => human.human_id === memory.reviewed_by)?.name ?? memory.reviewed_by : 'Not reviewed'}</Field><Field label="Agent passport"><code>{memory.passport_id}</code></Field><Field label="Mandate"><code>{memory.mandate_id}</code></Field><Field label="Room">{snapshot.rooms.find((item) => item.room_id === memory.room_id)?.name}<code>{memory.room_id}</code></Field><Field label="Source research action"><code>{memory.source_action_id}</code></Field><Field label="Created">{date(memory.created_at)}</Field><Field label="Human review">{date(memory.reviewed_at)}</Field></dl><h4>Source evidence</h4><ul className="g-source-list">{memory.sources.map((source, index) => <li key={`${source.url}-${index}`}><span>{index + 1}</span><div><strong>{source.title}</strong><code>{source.url}</code></div></li>)}</ul><details className="g-technical"><summary>Content integrity</summary><code>{memory.content_hash}</code>{memory.review_note ? <p>{memory.review_note}</p> : null}</details></div>{memory.status === 'proposed' ? <div className="g-button-row">{editingMemory === memory.memory_id ? <><button className="g-button primary" data-testid="save-approve-memory" disabled={!!busy || !memoryDraft.trim()} onClick={() => review(memory, 'approve', memoryDraft)}><Check size={16} />Save &amp; Approve</button><button className="g-button secondary" disabled={!!busy} onClick={() => setEditingMemory(null)}>Cancel edit</button></> : <><button className="g-button primary" data-testid="approve-memory" disabled={!!busy} onClick={() => review(memory, 'approve')}><Check size={16} />Approve</button><button className="g-button secondary" data-testid="edit-approve-memory" disabled={!!busy} onClick={() => { setEditingMemory(memory.memory_id); setMemoryDraft(memory.content); }}>Edit &amp; Approve</button></>}<button className="g-button danger" data-testid="reject-memory" disabled={!!busy} onClick={() => review(memory, 'reject')}>Reject</button></div> : null}</section>)}
          </> : null}

          {page === 'trace' ? <>
            <div className="g-trace-summary"><span className="g-trace-mark"><Layers3 size={26} /></span><div><h2>Complete identity trace</h2><p>Correlated by <code>{agent?.agent_id ?? 'No agent selected'}</code>. Every entry is a stored system event.</p></div><Badge tone={snapshot.integrity.status === 'valid' || snapshot.integrity.status === 'verified' ? 'green' : 'neutral'}>Audit integrity: {snapshot.integrity.status}</Badge></div>
            <CensusSourceHistory agent={agent} /><section className="g-card">{!agent ? <Empty icon={<Layers3 size={29} />} title="No selected agent"><p>Discover and select an agent to inspect its identity trace.</p></Empty> : traceLoading ? <div className="g-loading"><Loader2 className="g-spin" size={24} /><p>Loading persisted identity events…</p></div> : traceError ? <div className="g-alert error" role="alert">{traceError}</div> : <><div className="g-section-heading"><div><h2>H2A governance audit timeline</h2><p>{trace.length} correlated H2A events · Oldest first</p></div><button className="g-button secondary compact" onClick={() => void refresh()} disabled={!!busy}><RefreshCw size={14} />Refresh evidence</button></div><ol className="g-trace-list" data-testid="identity-trace">{trace.map((event, index) => <li key={event.event_id}><span className="g-trace-number">{index + 1}</span><div><div className="g-entry-title"><h3>{eventLabels[event.event_type] ?? titleCase(event.event_type)}</h3><time>{date(event.timestamp)}</time></div><p><Badge tone={event.actor_type === 'human' ? 'teal' : 'neutral'}>{titleCase(event.actor_type)}</Badge><span>{snapshot.humans.find((item) => item.human_id === event.actor_id)?.name ?? snapshot.agents.find((item) => item.agent_id === event.actor_id)?.name ?? event.actor_id}</span></p><details className="g-technical"><summary>{event.event_type} · {event.event_id}</summary><dl className="g-details columns"><Field label="Agent"><code>{event.agent_id}</code></Field><Field label="Passport"><code>{event.passport_id ?? '—'}</code></Field><Field label="Mandate"><code>{event.mandate_id ?? '—'}</code></Field><Field label="Room"><code>{event.room_id ?? '—'}</code></Field><Field label="Approval"><code>{event.approval_id ?? '—'}</code></Field><Field label="Timestamp"><code>{event.timestamp}</code></Field></dl><pre>{JSON.stringify(event.metadata, null, 2)}</pre><div className="g-help">Event hash <code>{event.event_hash}</code></div></details></div></li>)}</ol>{trace.length === 0 ? <p className="g-muted">No events found for this identity.</p> : null}</>}</section>
          </> : null}
          <footer className="g-footer"><span><ShieldCheck size={14} />Identity, policy, and human review — connected.</span><span>Persisted demo state · {snapshot.events.length} audit events</span></footer>
        </>}
      </main>
    </div>
    {busy ? <div className="g-working" role="status"><Loader2 size={16} className="g-spin" />Saving and verifying state…</div> : null}
  </div>;
}

function Metric({ label, value, icon, tone = 'teal' }: { label: string; value: number; icon: ReactNode; tone?: string }) {
  return <div className="g-metric"><div><span>{label}</span><strong>{value.toString().padStart(2, '0')}</strong></div><span className={`g-metric-icon ${tone}`}>{icon}</span></div>;
}
function StepHeader({ number, title, done }: { number: string; title: string; done: boolean }) {
  return <div className="g-step-header"><span className={done ? 'done' : ''}>{done ? <Check size={16} /> : number}</span><h2>{title}</h2>{done ? <Badge tone="green">Complete</Badge> : null}</div>;
}
function PolicyList({ mandate }: { mandate: Agent['mandate'] }) {
  const groups = [
    { label: 'Allowed', tone: 'green', actions: mandate?.allowed_actions ?? ['web_search', 'internal_marketing_read', 'report_generation'], icon: CheckCircle2 },
    { label: 'Requires approval', tone: 'amber', actions: mandate?.approval_required_actions ?? ['external_share'], icon: ShieldQuestion },
    { label: 'Denied', tone: 'red', actions: mandate?.denied_actions ?? ['crm_write', 'purchase'], icon: ShieldX },
  ];
  return <div className="g-policy">{!mandate ? <span className="g-template-label">RESEARCH MANDATE TEMPLATE</span> : null}{groups.map((group) => <div key={group.label}><span className={group.tone}><group.icon size={14} /><strong>{group.label}</strong></span><div>{group.actions.map((action) => <code key={action}>{action}</code>)}</div></div>)}</div>;
}
function ActionButton({ icon, title, subtitle, testId, disabled, onClick }: { icon: ReactNode; title: string; subtitle: string; testId: string; disabled: boolean; onClick: () => void }) {
  return <button className="g-action-button" data-testid={testId} disabled={disabled} onClick={onClick}><span>{icon}</span><div><strong>{title}</strong><small>{subtitle}</small></div><ArrowRight size={17} /></button>;
}

function RoomPeerPicker({ peers, selected, onChange, disabled }: { peers: Agent[]; selected: string[]; onChange: (ids: string[]) => void; disabled: boolean }): React.JSX.Element {
  return <fieldset className="g-room-peer-picker" disabled={disabled} data-testid="room-peer-picker"><legend>Additional governed agents <span>Optional</span></legend>{peers.length ? <div>{peers.map((peer) => <label key={peer.agent_id}><input type="checkbox" data-testid={`room-peer-${peer.agent_id}`} checked={selected.includes(peer.agent_id)} onChange={(event) => onChange(event.target.checked ? [...selected, peer.agent_id] : selected.filter((id) => id !== peer.agent_id))} /><span><strong>{peer.name}</strong><small>Owner: {peer.owner?.name} · Passport: {peer.passport?.passport_id}</small><small>Mandate: {peer.mandate?.purpose}</small></span></label>)}</div> : <p>Other agents become available after Census import, human binding, passport issuance, and mandate assignment.</p>}</fieldset>;
}

function CensusSourceHistory({ agent }: { agent: Agent | null }): React.JSX.Element | null {
  if (!agent) return null;
  const source = agent.discovery_snapshot;
  const history = source?.discovery_history ?? [];
  return <section className="g-card g-census-source-history" data-testid="census-source-history"><div className="g-section-heading"><div><span className="g-eyebrow">CENSUS SOURCE RECORDS</span><h2>Census discovery history</h2><p>Immutable discovery snapshot captured at H2A registration. Source records are separate from the H2A governance ledger below.</p></div><Badge>{history.length} source records</Badge></div><dl className="g-details columns"><Field label="Census identity"><code data-testid="trace-census-id">{agent.census_agent_id ?? 'No Census link'}</code></Field><Field label="H2A identity"><code>{agent.agent_id}</code></Field><Field label="Import scan"><code>{agent.import_scan_id ?? 'Not recorded'}</code></Field><Field label="Imported at">{agent.imported_at ? date(agent.imported_at) : 'Not recorded'}</Field>{source ? <><Field label="Census first seen">{date(source.first_seen)}</Field><Field label="Census last seen at import">{date(source.last_seen)}</Field></> : null}</dl>{history.length ? <ol className="g-census-history-list" data-testid="census-discovery-history">{history.map((record) => <li key={record.id}><div className="g-entry-title"><h3>{record.action}</h3><time>{date(record.timestamp)}</time></div><p><Badge>Census</Badge><span>Actor: {record.actor}</span><span>Record: {record.id}</span></p><details className="g-technical"><summary>Native source record and evidence</summary><dl className="g-details columns"><Field label="Subject"><code>{record.subject ?? 'Not specified'}</code></Field><Field label="Correlation ID"><code>{record.correlation_id}</code></Field><Field label="Timestamp"><code>{record.timestamp}</code></Field></dl><pre>{JSON.stringify(record.details, null, 2)}</pre></details></li>)}</ol> : <p className="g-muted">{source ? 'The imported Census snapshot contains no persisted discovery history records.' : 'This legacy identity has no imported Census discovery snapshot.'}</p>}{source ? <details className="g-census-raw"><summary>Immutable Census snapshot and raw source evidence</summary><pre>{JSON.stringify(source, null, 2)}</pre></details> : null}</section>;
}
