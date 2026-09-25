import { useEffect, useMemo, useState } from 'react';
import { Activity, Bell, Bot, Boxes, BrainCircuit, Building2, Check, ChevronDown, CircleDollarSign, CircleHelp, Command, Database, Eye, FileCheck2, Home, Menu, Network, Plus, Search, ShieldAlert, ShieldCheck, Users, X } from 'lucide-react';
import { AdminView, AgentsView, HomeView, MemoryView, PeopleView, ReviewsView, WorkspaceView, WorkspacesView } from './views';
import { ConnectAgentDialog, DomainDialog, MissionDialog, ProofDialog, RepairDialog, ReviewDialog, type DomainAction } from './dialogs';
import { CisoPlatform } from './ciso';
import type { CisoPage } from './ciso-model';
import {
  agents, initialMemoryRecords, initialReviews, initialWorkspaces, people,
  type Agent, type DetailLevel, type MemoryRecord, type Page, type Review,
  type SharedContext, type Workspace, type WorkspaceTab, type WorkStep
} from './model';

type Dialog =
  | { type: 'mission'; initial?: string }
  | { type: 'agent' }
  | { type: 'review'; review: Review }
  | { type: 'repair'; agentId: string }
  | { type: 'proof'; title: string }
  | { type: 'domain'; action: DomainAction; targetId?: string }
  | null;

function loadState<T>(key: string, fallback: T): T {
  try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}

const navigation = [
  { id: 'home' as const, label: 'Home', icon: Home }, { id: 'workspaces' as const, label: 'Workspaces', icon: Boxes },
  { id: 'agents' as const, label: 'Agents', icon: Bot }, { id: 'people' as const, label: 'People', icon: Users },
  { id: 'memory' as const, label: 'Company memory', icon: BrainCircuit }, { id: 'reviews' as const, label: 'Reviews', icon: FileCheck2 },
  { id: 'admin' as const, label: 'Admin', icon: ShieldCheck }
];

const cisoNavigation = [
  { id: 'overview' as const, label: 'Estate overview', icon: Eye },
  { id: 'mesh' as const, label: 'Enterprise mesh', icon: Network },
  { id: 'inventory' as const, label: 'AI inventory', icon: Bot },
  { id: 'adoption' as const, label: 'People & adoption', icon: Users },
  { id: 'flows' as const, label: 'Data flows', icon: Database },
  { id: 'licenses' as const, label: 'Licenses', icon: CircleDollarSign },
  { id: 'actions' as const, label: 'Action queue', icon: ShieldAlert },
  { id: 'evidence' as const, label: 'Evidence', icon: FileCheck2 }
];

export function App(): React.JSX.Element {
  const [mode, setMode] = useState<'work' | 'estate'>(() => loadState('h2a-product-mode', 'work'));
  const [cisoActionCount, setCisoActionCount] = useState(5);
  const [page, setPage] = useState<Page>('home');
  const [cisoPage, setCisoPage] = useState<CisoPage>('overview');
  const [detail, setDetail] = useState<DetailLevel>('simple');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('overview');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => loadState('h2a-wireframe-workspaces-v3', initialWorkspaces));
  const [connectedAgents, setConnectedAgents] = useState<Agent[]>(() => loadState('h2a-wireframe-agents-v3', agents));
  const [reviews, setReviews] = useState<Review[]>(() => loadState('h2a-wireframe-reviews-v3', initialReviews));
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>(() => loadState('h2a-wireframe-memory-v3', initialMemoryRecords));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [search, setSearch] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectedWorkspace = useMemo(() => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null, [selectedWorkspaceId, workspaces]);
  const pendingReviews = reviews.filter((review) => review.status === 'pending').length;

  useEffect(() => window.localStorage.setItem('h2a-wireframe-workspaces-v3', JSON.stringify(workspaces)), [workspaces]);
  useEffect(() => window.localStorage.setItem('h2a-wireframe-agents-v3', JSON.stringify(connectedAgents)), [connectedAgents]);
  useEffect(() => window.localStorage.setItem('h2a-wireframe-reviews-v3', JSON.stringify(reviews)), [reviews]);
  useEffect(() => window.localStorage.setItem('h2a-wireframe-memory-v3', JSON.stringify(memoryRecords)), [memoryRecords]);
  useEffect(() => window.localStorage.setItem('h2a-product-mode', JSON.stringify(mode)), [mode]);
  useEffect(() => { if (mode === 'work') window.scrollTo({ top: 0, behavior: 'instant' }); }, [mode, page]);

  function notify(message: string): void { setToast(message); window.setTimeout(() => setToast(null), 3200); }
  function navigate(next: Page): void { setPage(next); setSelectedWorkspaceId(null); setMobileNav(false); }
  function openWorkspace(workspace: Workspace, tab: WorkspaceTab = 'overview'): void { setSelectedWorkspaceId(workspace.id); setWorkspaceTab(tab); setPage('workspaces'); }
  function updateWorkspace(workspaceId: string, transform: (workspace: Workspace) => Workspace): void { setWorkspaces((current) => current.map((workspace) => workspace.id === workspaceId ? transform(workspace) : workspace)); }

  function createMission(title: string, workspaceId: string): void {
    const generatedSteps: WorkStep[] = [
      { id: `research-${Date.now()}`, title: 'Research the request', summary: 'Gather approved information and constraints.', agentId: 'research', status: 'ready', context: ['Mission brief'], withheld: ['Unrelated workspace data'] },
      { id: `design-${Date.now()}`, title: 'Design the approach', summary: 'Turn findings into a reviewable solution.', agentId: 'claude', status: 'blocked', context: ['Research summary'], withheld: ['Raw sources'] },
      { id: `build-${Date.now()}`, title: 'Implement the solution', summary: 'Build within the approved project boundary.', agentId: 'codex', status: 'blocked', context: ['Approved design'], withheld: ['Unrelated repositories'] },
      { id: `qa-${Date.now()}`, title: 'Validate and report', summary: 'Check quality, security, and acceptance.', agentId: 'antigravity', status: 'blocked', context: ['Build output'], withheld: ['Credentials'] }
    ];
    generatedSteps[1].dependsOn = generatedSteps[0].id; generatedSteps[2].dependsOn = generatedSteps[1].id; generatedSteps[3].dependsOn = generatedSteps[2].id;
    updateWorkspace(workspaceId, (workspace) => ({ ...workspace, activeMission: title, progress: 0, status: 'active', updated: 'Just now', missionCount: workspace.missionCount + 1, steps: generatedSteps, activity: [{ id: `evt-${Date.now()}`, actor: 'H2A Coordinator', body: `Created a bounded four-step plan for “${title}”.`, createdAt: 'Now', kind: 'handoff' }] }));
    setDialog(null); setSelectedWorkspaceId(workspaceId); setWorkspaceTab('plan'); setPage('workspaces'); notify('Mission created. The first dependency-ready step can begin.');
  }

  function connectAgent(provider: string, name: string): void {
    const agent: Agent = { id: `agent-${Date.now()}`, name, role: 'Governed workspace agent', provider, owner: 'Varun Khatr', status: 'ready', color: '#3767dc', permissions: ['No workspace access until assigned'] };
    setConnectedAgents((current) => [agent, ...current]); setDialog(null); setPage('agents'); notify(`${name} connected and bound to Varun Khatr.`);
  }

  function runStep(workspaceId: string, stepId: string): void {
    const step = workspaces.find((workspace) => workspace.id === workspaceId)?.steps.find((item) => item.id === stepId);
    const agent = connectedAgents.find((item) => item.id === step?.agentId);
    updateWorkspace(workspaceId, (workspace) => ({ ...workspace, updated: 'Just now', steps: workspace.steps.map((item) => item.id === stepId ? { ...item, status: 'running' } : item), activity: [{ id: `evt-${Date.now()}`, actor: agent?.name ?? 'Agent', body: `Started ${step?.title ?? 'the assigned step'} with its approved context.`, createdAt: 'Now', kind: 'message' }, ...(workspace.activity ?? [])] }));
    setConnectedAgents((current) => current.map((item) => item.id === step?.agentId ? { ...item, status: 'working' } : item));
    notify(`${agent?.name ?? 'Agent'} started. Progress will continue automatically.`);
    window.setTimeout(() => {
      updateWorkspace(workspaceId, (workspace) => {
        const updatedSteps = workspace.steps.map((item) => item.id === stepId ? { ...item, status: 'done' as const, output: `${item.title} · reviewed demo output · receipt ${stepId.slice(0, 10)}` } : item.dependsOn === stepId ? { ...item, status: 'ready' as const } : item);
        const done = updatedSteps.filter((item) => item.status === 'done').length;
        return { ...workspace, progress: Math.round((done / Math.max(updatedSteps.length, 1)) * 100), updated: 'Just now', steps: updatedSteps, activity: [{ id: `evt-${Date.now()}`, actor: agent?.name ?? 'Agent', body: `Completed ${step?.title ?? 'the step'} and handed the signed output to the next eligible agent.`, createdAt: 'Now', kind: 'handoff' }, ...(workspace.activity ?? [])] };
      });
      setConnectedAgents((current) => current.map((item) => item.id === step?.agentId ? { ...item, status: 'ready' } : item));
      notify(`${step?.title ?? 'Step'} completed. The next dependency is ready.`);
    }, 1400);
  }

  function decideReview(reviewId: string, status: 'approved' | 'denied'): void { setReviews((current) => current.map((review) => review.id === reviewId ? { ...review, status } : review)); setDialog(null); notify(`Decision recorded as ${status}.`); }
  function repairAgent(agentId: string): void {
    const agent = connectedAgents.find((item) => item.id === agentId);
    setConnectedAgents((current) => current.map((item) => item.id === agentId ? { ...item, status: 'ready' } : item));
    setWorkspaces((current) => current.map((workspace) => ({ ...workspace, steps: workspace.steps.map((step) => step.agentId === agentId && step.status === 'blocked' ? { ...step, status: step.dependsOn && workspace.steps.find((item) => item.id === step.dependsOn)?.status !== 'done' ? 'blocked' : 'ready' } : step) })));
    setDialog(null); notify(`${agent?.name ?? 'Agent'} permission renewed for its assigned scope.`);
  }

  function addMember(workspaceId: string, entityId: string, kind: 'person' | 'agent'): void {
    updateWorkspace(workspaceId, (workspace) => ({ ...workspace, memberIds: kind === 'person' ? [...new Set([...workspace.memberIds, entityId])] : workspace.memberIds, agentIds: kind === 'agent' ? [...new Set([...workspace.agentIds, entityId])] : workspace.agentIds, updated: 'Just now', activity: [{ id: `evt-${Date.now()}`, actor: 'Varun Khatr', body: `Added ${kind === 'person' ? people.find((person) => person.id === entityId)?.name : connectedAgents.find((agent) => agent.id === entityId)?.name} to the workspace.`, createdAt: 'Now', kind: 'message' }, ...(workspace.activity ?? [])] }));
    setDialog(null); setSelectedWorkspaceId(workspaceId); setWorkspaceTab('team'); setPage('workspaces'); notify('Workspace membership updated.');
  }

  function addNote(workspaceId: string, body: string): void { updateWorkspace(workspaceId, (workspace) => ({ ...workspace, notes: [{ id: `note-${Date.now()}`, author: 'Varun Khatr', body, createdAt: 'Now' }, ...(workspace.notes ?? [])], activity: [{ id: `evt-${Date.now()}`, actor: 'Varun Khatr', body: `Added mission note: ${body}`, createdAt: 'Now', kind: 'message' }, ...(workspace.activity ?? [])] })); setDialog(null); setWorkspaceTab('activity'); notify('Mission note added to the live room.'); }
  function shareContext(workspaceId: string, item: SharedContext): void { updateWorkspace(workspaceId, (workspace) => ({ ...workspace, sharedContext: [item, ...(workspace.sharedContext ?? [])], activity: [{ id: `evt-${Date.now()}`, actor: item.sharedBy, body: `Shared ${item.name} with ${item.audience}.`, createdAt: item.createdAt, kind: 'handoff' }, ...(workspace.activity ?? [])] })); setDialog(null); setWorkspaceTab('activity'); notify(`${item.name} shared with the approved audience.`); }
  function addStep(workspaceId: string, step: WorkStep): void { updateWorkspace(workspaceId, (workspace) => ({ ...workspace, steps: [...workspace.steps, step], updated: 'Just now', activity: [{ id: `evt-${Date.now()}`, actor: 'H2A Coordinator', body: `Added “${step.title}” to the plan and assigned ${connectedAgents.find((agent) => agent.id === step.agentId)?.name}.`, createdAt: 'Now', kind: 'message' }, ...(workspace.activity ?? [])] })); setDialog(null); setWorkspaceTab('plan'); notify('Plan step added with a bounded assignment.'); }
  function addMemory(record: MemoryRecord): void { setMemoryRecords((current) => [record, ...current]); setDialog(null); setPage('memory'); notify(`${record.title} added to reviewed company memory.`); }

  function openDomain(action: string, targetId?: string): void { setDialog({ type: 'domain', action: action as DomainAction, targetId }); }
  const commonProps = { workspaces, agents: connectedAgents, people, reviews, memoryRecords, detail, onOpenWorkspace: openWorkspace, onNewMission: (initial?: string) => setDialog({ type: 'mission', initial }), onConnectAgent: () => setDialog({ type: 'agent' }), onReview: (review: Review) => setDialog({ type: 'review', review }), onRepair: (agentId: string) => setDialog({ type: 'repair', agentId }), onProof: (title: string) => setDialog({ type: 'proof', title }), onAction: openDomain, onNavigate: navigate, onRunStep: runStep, notify };

  return <div className={`app-shell ${mode === 'estate' ? 'estate-shell' : ''}`}><a className="skip-link" href="#main-content">Skip to content</a>
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`} aria-label="Primary navigation"><div className="brand-row"><span className="brand-mark" aria-hidden="true"><Command size={21} /></span><span className="brand-name">H2A</span><button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={20} /></button></div><button className="organization-switcher" onClick={() => openDomain('organization')}><span className="avatar avatar-organization"><Building2 size={17} /></span><span><strong>HP Enterprise</strong><small>{mode === 'estate' ? 'Global AI estate' : 'Security workspace'}</small></span><ChevronDown size={16} /></button><div className="product-mode-switch" aria-label="Product mode"><button className={mode === 'work' ? 'active' : ''} onClick={() => { setMode('work'); setMobileNav(false); }}><Activity size={16} />My Work</button><button className={mode === 'estate' ? 'active' : ''} onClick={() => { setMode('estate'); setCisoPage('overview'); setMobileNav(false); }}><ShieldCheck size={16} />AI Estate</button></div><nav className="nav-list">{mode === 'work' ? navigation.map((item) => { const Icon = item.icon; const badge = item.id === 'reviews' && pendingReviews > 0 ? pendingReviews : null; return <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => navigate(item.id)}><Icon size={19} /><span>{item.label}</span>{badge ? <span className="nav-badge">{badge}</span> : null}</button>; }) : cisoNavigation.map((item) => { const Icon = item.icon; const badge = item.id === 'actions' && cisoActionCount > 0 ? cisoActionCount : null; return <button key={item.id} className={cisoPage === item.id ? 'nav-item active' : 'nav-item'} onClick={() => { setCisoPage(item.id); setMobileNav(false); }}><Icon size={19} /><span>{item.label}</span>{badge ? <span className="nav-badge danger">{badge}</span> : null}</button>; })}</nav><div className="sidebar-support"><button className="nav-item" onClick={() => openDomain('help')}><CircleHelp size={19} /><span>Help</span></button></div><button className="account-block" onClick={() => openDomain('account')}><span className="avatar" style={{ background: '#0f766e' }}>VK</span><span><strong>Varun Khatr</strong><small>{mode === 'estate' ? 'CISO operator view' : 'Security program lead'}</small></span><ChevronDown size={16} /></button><div className="prototype-label"><span className="prototype-dot" />Demo dataset · browser wireframe</div></aside>
    <div className="app-frame"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={22} /></button><label className="global-search"><Search size={18} /><span className="sr-only">Search H2A</span><input value={search} onFocus={() => mode === 'work' ? openDomain('search') : setCisoPage('inventory')} onChange={(event) => setSearch(event.target.value)} placeholder={mode === 'estate' ? 'Search people, agents, tools, and data' : 'Search H2A'} /><kbd>Ctrl K</kbd></label>{mode === 'work' ? <div className="detail-switch" aria-label="Information detail">{(['simple', 'authority', 'proof'] as DetailLevel[]).map((level) => <button key={level} className={detail === level ? 'active' : ''} onClick={() => setDetail(level)}>{level[0].toUpperCase() + level.slice(1)}</button>)}</div> : <span className="estate-live-status"><i />Live estate · 24h</span>}<button className="icon-button" aria-label="Notifications" onClick={() => mode === 'work' ? openDomain('notifications') : setCisoPage('actions')}><Bell size={20} /><span className="notification-dot" /></button>{mode === 'work' ? <button className="primary-button top-new" onClick={() => setDialog({ type: 'mission' })}><Plus size={18} />New mission</button> : <button className="primary-button top-new" onClick={() => setCisoPage('actions')}><ShieldAlert size={18} />Review actions</button>}</header><main id="main-content" className="main-content">{mode === 'estate' ? <CisoPlatform page={cisoPage} onPageChange={setCisoPage} onOpenActionCountChange={setCisoActionCount} notify={notify} /> : <>{page === 'home' ? <HomeView {...commonProps} /> : null}{page === 'workspaces' && !selectedWorkspace ? <WorkspacesView {...commonProps} /> : null}{page === 'workspaces' && selectedWorkspace ? <WorkspaceView {...commonProps} workspace={selectedWorkspace} tab={workspaceTab} onTabChange={setWorkspaceTab} onBack={() => setSelectedWorkspaceId(null)} /> : null}{page === 'agents' ? <AgentsView {...commonProps} /> : null}{page === 'people' ? <PeopleView {...commonProps} /> : null}{page === 'memory' ? <MemoryView {...commonProps} /> : null}{page === 'reviews' ? <ReviewsView {...commonProps} /> : null}{page === 'admin' ? <AdminView {...commonProps} /> : null}</>}</main></div>
    {dialog?.type === 'mission' ? <MissionDialog initial={dialog.initial} workspaces={workspaces} onClose={() => setDialog(null)} onCreate={createMission} /> : null}
    {dialog?.type === 'agent' ? <ConnectAgentDialog onClose={() => setDialog(null)} onDone={connectAgent} /> : null}
    {dialog?.type === 'review' ? <ReviewDialog review={dialog.review} onClose={() => setDialog(null)} onDecision={decideReview} /> : null}
    {dialog?.type === 'repair' ? <RepairDialog agent={connectedAgents.find((agent) => agent.id === dialog.agentId)} onClose={() => setDialog(null)} onDone={() => repairAgent(dialog.agentId)} /> : null}
    {dialog?.type === 'proof' ? <ProofDialog title={dialog.title} workspace={selectedWorkspace ?? workspaces[0]} agents={connectedAgents} onClose={() => setDialog(null)} /> : null}
    {dialog?.type === 'domain' ? <DomainDialog action={dialog.action} targetId={dialog.targetId} selectedWorkspace={selectedWorkspace} workspaces={workspaces} agents={connectedAgents} people={people} reviews={reviews} memoryRecords={memoryRecords} search={search} onSearch={setSearch} onClose={() => setDialog(null)} onOpenWorkspace={openWorkspace} onNavigate={navigate} onInvite={addMember} onAddNote={addNote} onShare={shareContext} onAddStep={addStep} onAddMemory={addMemory} notify={notify} /> : null}
    {toast ? <div className="toast" role="status"><Check size={18} />{toast}</div> : null}{mobileNav ? <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" /> : null}
  </div>;
}
