import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, FileCheck2, Fingerprint, Folder, Link2, Plus, Search, Users, X } from 'lucide-react';
import type { ControlPlaneCanonicalState } from '@h2a/contracts';
import type { EmployeeChallenge, EmployeeWorkspaceSnapshot, ReviewedMemory, WorkspaceMutation } from '../../../../../../packages/contracts/src/employeeWorkspace';
import { HumanProofView } from '../human-proof/HumanProofView';

interface Props {
  canonical: ControlPlaneCanonicalState;
  snapshot?: EmployeeWorkspaceSnapshot;
  initialRoomId?: string;
  initialMode?: 'rooms' | 'memory';
  onChange(snapshot: EmployeeWorkspaceSnapshot): void;
}

const message = (cause: unknown): string => cause instanceof Error ? cause.message : 'The operation could not be completed.';

export function WorkspaceRoomManager({ canonical, snapshot, initialRoomId, initialMode = 'rooms', onChange }: Props): React.JSX.Element {
  const api = window.h2aEmployee;
  const [mode, setMode] = useState<'rooms' | 'memory'>(initialMode);
  const [roomId, setRoomId] = useState(initialRoomId ?? snapshot?.rooms[0]?.room_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [candidate, setCandidate] = useState<EmployeeWorkspaceSnapshot['people'][number]>();
  const [challenge, setChallenge] = useState<EmployeeChallenge>();
  const [continuation, setContinuation] = useState<((proofId: string) => Promise<void>)>();
  const identityApi = useMemo(() => api ? { getState: () => api.identity(), verify: api.verify } : undefined, [api]);
  const room = snapshot?.rooms.find((item) => item.room_id === roomId);
  const roomMemory = snapshot?.memory.filter((item) => item.room_id === room?.room_id) ?? [];
  const projects = canonical.project_delivery.projects;
  const goals = canonical.goal_work_graph?.goals ?? [];

  useEffect(() => {
    if (!snapshot?.rooms.some((item) => item.room_id === roomId)) setRoomId(snapshot?.rooms[0]?.room_id ?? '');
  }, [roomId, snapshot]);
  useEffect(() => setCandidate(undefined), [roomId]);

  async function perform(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  async function mutate(request: WorkspaceMutation): Promise<void> {
    if (!api) throw new Error('Open this control in the H2A desktop application.');
    onChange(await api.mutate(request));
  }
  async function prove(purpose: string, next: (proofId: string) => Promise<void>): Promise<void> {
    if (!api) throw new Error('Employee verification is unavailable.');
    setContinuation(() => next);
    setChallenge(await api.challenge(purpose));
  }
  function closeProof(): void { setChallenge(undefined); setContinuation(undefined); }
  async function review(item: ReviewedMemory, decision: 'published' | 'rejected'): Promise<void> {
    await prove(`review memory ${item.memory_id}`, (proofId) => mutate({ kind: 'review-memory', memory_id: item.memory_id, revision: item.revision, content_hash: item.content_hash, decision, proof_id: proofId }));
  }

  if (!api || !snapshot) return <div className="ws-native-empty"><Fingerprint size={27} /><h3>Employee session required</h3><p>Sign in with your enrolled Human ID to manage persistent rooms and reviewed Memory.</p></div>;
  if (challenge) return <section className="ws-inline-proof"><button className="ws-back" onClick={closeProof}><ArrowLeft size={15} />Back</button><HumanProofView identityApi={identityApi} presentation="challenge" targetHumanId={challenge.human_id} expectedDisplayName={challenge.display_name} verificationPurpose={challenge.purpose} livenessMode={challenge.liveness_mode} onCancel={closeProof} onVerificationComplete={(proofId) => perform(async () => { await continuation?.(proofId); closeProof(); })} /></section>;

  return <section className="ws-room-manager">
    <div className="ws-native-hero"><Users size={25} /><div><h3>Persistent team rooms</h3><p>Keep the same people, projects, missions, and reviewed knowledge together. Membership does not itself issue mandates or reveal protected context.</p></div></div>
    {error && <div className="ws-blocker-message" role="alert"><AlertTriangle size={18} /><div><strong>This step needs attention</strong><p>{error}</p></div></div>}
    <div className="ws-room-manager-layout"><aside><div className="ws-tabs"><button className={mode === 'rooms' ? 'selected' : ''} onClick={() => setMode('rooms')}>Room</button><button className={mode === 'memory' ? 'selected' : ''} onClick={() => setMode('memory')}>Memory</button></div>{snapshot.rooms.map((item) => <button key={item.room_id} className={item.room_id === roomId ? 'selected' : ''} onClick={() => setRoomId(item.room_id)}><Folder size={17} /><span><strong>{item.title}</strong><small>{item.member_ids.length} people · {item.goal_ids?.length ?? 0} missions</small></span></button>)}<form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const title = String(new FormData(form).get('title')); void perform(async () => { await mutate({ kind: 'create-room', title }); form.reset(); }); }}><label>New room<input name="title" required minLength={2} maxLength={160} placeholder="Product launch" /></label><button className="ws-primary" disabled={busy}><Plus size={15} />Create</button></form></aside>
      <div className="ws-room-manager-main">{!room ? <div className="ws-native-empty"><Folder size={27} /><h3>Create your first room</h3><p>A room is the durable collaboration boundary for a team, not a temporary task thread.</p></div> : mode === 'rooms' ? <RoomSettings room={room} snapshot={snapshot} projects={projects} goals={goals} candidate={candidate} busy={busy} setCandidate={setCandidate} perform={perform} mutate={mutate} prove={prove} /> : <MemorySettings room={room} snapshot={snapshot} memory={roomMemory} busy={busy} perform={perform} mutate={mutate} review={review} />}</div>
    </div>
  </section>;
}

function RoomSettings({ room, snapshot, projects, goals, candidate, busy, setCandidate, perform, mutate, prove }: {
  room: EmployeeWorkspaceSnapshot['rooms'][number]; snapshot: EmployeeWorkspaceSnapshot;
  projects: ControlPlaneCanonicalState['project_delivery']['projects']; goals: NonNullable<ControlPlaneCanonicalState['goal_work_graph']>['goals'];
  candidate?: EmployeeWorkspaceSnapshot['people'][number]; busy: boolean; setCandidate(value?: EmployeeWorkspaceSnapshot['people'][number]): void;
  perform(action: () => Promise<void>): Promise<void>; mutate(request: WorkspaceMutation): Promise<void>; prove(purpose: string, next: (proofId: string) => Promise<void>): Promise<void>;
}): React.JSX.Element {
  const api = window.h2aEmployee!;
  const canManage = snapshot.session.administrator || room.owner_membership_id === snapshot.session.membership_id;
  return <><header className="ws-room-manager-heading"><div><h3>{room.title}</h3><p>{room.department} · revision {room.revision}</p></div><span className="ws-status active">persistent</span></header><h4>People</h4><div className="ws-member-list">{room.member_ids.map((id) => { const person = snapshot.people.find((item) => item.membership_id === id); return <article key={id}><span className="ws-human-avatar">{(person?.display_name ?? id).slice(0, 2).toUpperCase()}</span><div><strong>{person?.display_name ?? id}</strong><small>{person?.department}{id === room.owner_membership_id ? ' · Owner' : ''}</small></div>{canManage && id !== room.owner_membership_id && <button className="ws-icon" aria-label={`Remove ${person?.display_name ?? id}`} title="Remove member" onClick={() => void perform(() => prove(`change room membership ${room.room_id}`, (proofId) => mutate({ kind: 'room-members', room_id: room.room_id, revision: room.revision, member_ids: room.member_ids.filter((memberId) => memberId !== id), proof_id: proofId })))}><X size={16} /></button>}</article>; })}</div>{canManage && <form className="ws-inline-form" onSubmit={(event) => { event.preventDefault(); const employeeId = String(new FormData(event.currentTarget).get('employee')); void perform(async () => { const person = await api.lookupMember(employeeId); if (room.member_ids.includes(person.membership_id)) throw new Error('This employee is already in the room.'); setCandidate(person); }); }}><label>Employee ID<input name="employee" required maxLength={160} placeholder="H2A-EMPLOYEE-03" /></label><button className="ws-secondary" disabled={busy}><Search size={15} />Find</button></form>}{candidate && <div className="ws-candidate"><div><strong>{candidate.display_name}</strong><small>{candidate.department}</small></div><button className="ws-primary" disabled={busy} onClick={() => void perform(() => prove(`change room membership ${room.room_id}`, async (proofId) => { await mutate({ kind: 'room-members', room_id: room.room_id, revision: room.revision, member_ids: [...room.member_ids, candidate.membership_id], proof_id: proofId }); setCandidate(undefined); }))}><Fingerprint size={15} />Verify & add</button></div>}
    <h4>Linked work</h4><form key={room.room_id} className="ws-room-links" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void perform(() => mutate({ kind: 'room-links', room_id: room.room_id, revision: room.revision, project_ids: values.getAll('project').map(String), goal_ids: values.getAll('goal').map(String) })); }}><fieldset><legend>Projects</legend>{projects.map((project) => <label key={project.project_id}><input type="checkbox" name="project" value={project.project_id} defaultChecked={room.project_ids?.includes(project.project_id)} />{project.display_name}</label>)}</fieldset><fieldset><legend>Missions</legend>{goals.map((goal) => <label key={goal.goal_id}><input type="checkbox" name="goal" value={goal.goal_id} defaultChecked={room.goal_ids?.includes(goal.goal_id)} />{goal.title}</label>)}</fieldset>{canManage && <button className="ws-secondary" disabled={busy}><Link2 size={15} />Save linked work</button>}</form></>;
}

function MemorySettings({ room, snapshot, memory, busy, perform, mutate, review }: { room: EmployeeWorkspaceSnapshot['rooms'][number]; snapshot: EmployeeWorkspaceSnapshot; memory: ReviewedMemory[]; busy: boolean; perform(action: () => Promise<void>): Promise<void>; mutate(request: WorkspaceMutation): Promise<void>; review(item: ReviewedMemory, decision: 'published' | 'rejected'): Promise<void> }): React.JSX.Element {
  return <><header className="ws-room-manager-heading"><div><h3>Reviewed Memory</h3><p>{room.title} · reusable only after independent review</p></div><span className="ws-status waiting">{memory.filter((item) => item.status === 'draft').length} waiting</span></header><div className="ws-memory-review-list">{memory.map((item) => <article key={item.memory_id}><FileCheck2 size={19} /><div><h4>{item.title}</h4><p>{item.body}</p><small>{item.content_hash} · revision {item.revision}</small></div><span className={`ws-status ${item.status}`}>{item.status}</span>{item.status === 'draft' && snapshot.session.administrator && item.author_membership_id !== snapshot.session.membership_id && <div className="ws-actions"><button className="ws-secondary ws-stop" disabled={busy} onClick={() => void perform(() => review(item, 'rejected'))}><X size={14} />Reject</button><button className="ws-primary" disabled={busy} onClick={() => void perform(() => review(item, 'published'))}><Check size={14} />Review & publish</button></div>}{item.status !== 'withdrawn' && (snapshot.session.administrator || item.author_membership_id === snapshot.session.membership_id) && <button className="ws-secondary" disabled={busy} onClick={() => void perform(() => mutate({ kind: 'withdraw-memory', memory_id: item.memory_id, revision: item.revision }))}>Withdraw</button>}</article>)}</div><form className="ws-memory-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void perform(async () => { await mutate({ kind: 'draft-memory', room_id: room.room_id, title: String(values.get('title')), body: String(values.get('body')) }); form.reset(); }); }}><h4>Propose reusable knowledge</h4><label>Title<input name="title" required minLength={2} maxLength={160} /></label><label>Knowledge<textarea name="body" required maxLength={12000} rows={5} /></label><p>Do not include secrets, biometric data, or protected source values.</p><button className="ws-primary" disabled={busy}><Plus size={15} />Submit for review</button></form></>;
}
