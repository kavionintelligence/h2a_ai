import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Fingerprint, LogOut, Plus, ShieldCheck, Users, X } from 'lucide-react';
import type { EmployeeChallenge, EmployeeWorkspaceApi, EmployeeWorkspaceSnapshot, ReviewedMemory, WorkspaceMutation } from '../../../../../../packages/contracts/src/employeeWorkspace';
import { HumanProofView } from '../human-proof/HumanProofView';
import './employeeAccess.css';

declare global { interface Window { h2aEmployee?: EmployeeWorkspaceApi } }
const errorText = (error: unknown): string => error instanceof Error ? error.message : 'The operation could not be completed.';

export function EmployeeAccess({ children }: { children: React.ReactNode }): React.JSX.Element {
  const api = window.h2aEmployee;
  const [state, setState] = useState<EmployeeWorkspaceSnapshot>();
  const [humanId, setHumanId] = useState('');
  const [challenge, setChallenge] = useState<EmployeeChallenge>();
  const [pending, setPending] = useState<((proofId: string) => Promise<void>) | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState('');
  const [page, setPage] = useState<'rooms' | 'memory'>('rooms');
  const [setup, setSetup] = useState(false);
  const [setupStatus, setSetupStatus] = useState<{ available: boolean; liveness_mode: 'required' | 'demo-bypass' }>();
  const [organizationName, setOrganizationName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const [candidate, setCandidate] = useState<EmployeeWorkspaceSnapshot['people'][number]>();
  const dialog = useRef<HTMLDialogElement>(null);
  const latestSnapshot = useRef<EmployeeWorkspaceSnapshot | undefined>(undefined);
  const enteredAdministratorWorkspace = useRef(false);
  const authGeneration = useRef(0);
  const proofGeneration = useRef(0);
  const identityApi = useMemo(() => api ? { getState: () => api.identity(), verify: api.verify } : undefined, [api]);
  const setupIdentityApi = useMemo(() => api ? { getState: () => api.setupIdentity(), verify: api.setupVerify, enroll: api.setupEnroll } : undefined, [api]);
  const reconcile = useCallback((next: EmployeeWorkspaceSnapshot) => {
    if (latestSnapshot.current?.session.human_id === next.session.human_id && latestSnapshot.current.revision > next.revision) return;
    latestSnapshot.current = next;
    setState(next);
    if (!next.session.administrator) {
      enteredAdministratorWorkspace.current = false;
      setConsoleOpen(false);
    } else if (!enteredAdministratorWorkspace.current) {
      enteredAdministratorWorkspace.current = true;
      setConsoleOpen(true);
    }
    setSelectedRoom(current => next.rooms.some(room => room.room_id === current) ? current : next.rooms[0]?.room_id ?? '');
  }, []);

  useEffect(() => {
    if (!api) return;
    void api.setupStatus().then(setSetupStatus).catch(error => setError(errorText(error)));
    const generation = authGeneration.current;
    void api.hasSession().then(active => active ? api.snapshot() : undefined).then(next => {
      if (next && generation === authGeneration.current) reconcile(next);
    }).catch(error => { if (generation === authGeneration.current) setError(errorText(error)); });
  }, [api, reconcile]);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      const generation = authGeneration.current;
      void api.hasSession().then(active => active ? api.snapshot() : undefined).then(next => {
        if (!next) return;
        if (!cancelled && generation === authGeneration.current) reconcile(next);
      }).catch(error => {
        if (!cancelled && generation === authGeneration.current) {
          latestSnapshot.current = undefined;
          setState(undefined);
          setConsoleOpen(false);
          if (!String(error).includes('EMPLOYEE_SESSION_REQUIRED')) setError(errorText(error));
        }
      });
    }, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [api, reconcile]);

  useEffect(() => {
    const openWorkspace = () => setConsoleOpen(false);
    window.addEventListener('h2a:employee-workspace', openWorkspace);
    return () => window.removeEventListener('h2a:employee-workspace', openWorkspace);
  }, []);

  useEffect(() => {
    if (!api) return;
    const synchronizeSession = () => {
      const generation = authGeneration.current;
      void api.hasSession().then(active => active ? api.snapshot() : undefined).then(next => {
        if (next && generation === authGeneration.current) reconcile(next);
        else if (!next && generation === authGeneration.current) {
          latestSnapshot.current = undefined;
          setState(undefined);
          setConsoleOpen(false);
        }
      }).catch(error => setError(errorText(error)));
    };
    window.addEventListener('h2a:employee-session-changed', synchronizeSession);
    return () => window.removeEventListener('h2a:employee-session-changed', synchronizeSession);
  }, [api, reconcile]);

  useEffect(() => { if (challenge && !dialog.current?.open) dialog.current?.showModal(); }, [challenge]);

  async function perform(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  function cancelProof(): void { proofGeneration.current++; dialog.current?.close(); setChallenge(undefined); setPending(undefined); }
  async function signOut(): Promise<void> { authGeneration.current++; cancelProof(); await api?.logout(); latestSnapshot.current = undefined; enteredAdministratorWorkspace.current = false; setState(undefined); setConsoleOpen(false); }
  async function prove(purpose: string, complete: (proofId: string) => Promise<void>): Promise<void> {
    if (!api) return;
    const generation = ++proofGeneration.current;
    const next = await api.challenge(purpose);
    if (generation !== proofGeneration.current) return;
    setPending(() => async (proofId: string) => { if (generation !== proofGeneration.current) throw new Error('Verification was cancelled; no continuation was dispatched.'); await complete(proofId); }); setChallenge(next);
  }
  async function mutate(request: WorkspaceMutation): Promise<void> { if (api) reconcile(await api.mutate(request)); }
  async function review(item: ReviewedMemory, decision: 'published' | 'rejected'): Promise<void> {
    await prove(`review memory ${item.memory_id}`, proof_id => mutate({ kind: 'review-memory', memory_id: item.memory_id, revision: item.revision, content_hash: item.content_hash, decision, proof_id }));
  }
  const room = state?.rooms.find(item => item.room_id === selectedRoom);
  useEffect(() => { setCandidate(undefined); }, [selectedRoom]);

  return <>
    {consoleOpen && state?.session.administrator ? <>
      <div className="employee-console-bar"><button type="button" onClick={() => setConsoleOpen(false)}><ArrowLeft size={16} /> Employee workspace</button><span>{state.session.display_name} · Administrator console</span><button type="button" onClick={() => void perform(signOut)}><LogOut size={16} /> Sign out</button></div>
      <div className="employee-console-content">{children}</div>
    </> : <main className="employee-workspace">
      <header className="employee-header"><strong>H2A</strong><span>{state ? `${state.session.display_name} · ${state.session.department}` : 'Employee sign in'}</span><span className="employee-trust">Connected-observed ceiling</span>
        {state && <button title="Sign out" aria-label="Sign out" type="button" disabled={busy} onClick={() => void perform(signOut)}><LogOut size={18} /></button>}
      </header>
      {error && <p role="alert" className="employee-error">{error}</p>}
      {setup && !state ? <section className="employee-room"><h1>First administrator</h1><p>This creates the first organization authority on this local installation.</p><label>Organization name<input required value={organizationName} onChange={event => setOrganizationName(event.target.value)} maxLength={160} /></label><label>Employee ID<input required value={employeeId} onChange={event => setEmployeeId(event.target.value)} maxLength={160} /></label><label>Department<input required value={department} onChange={event => setDepartment(event.target.value)} maxLength={120} /></label>
        {organizationName.trim().length >= 2 && employeeId.trim() && department.trim() && <HumanProofView identityApi={setupIdentityApi} verificationPurpose="create local organization authority" livenessMode={setupStatus?.liveness_mode ?? 'required'} onVerificationComplete={async proof_id => { if (!api) return; await api.setupCommit({ name: organizationName, employee_id: employeeId, department, proof_id }); setSetup(false); setSetupStatus({ available: false, liveness_mode: setupStatus?.liveness_mode ?? 'required' }); setHumanId(employeeId); }} />}
        <button type="button" onClick={() => setSetup(false)}><ArrowLeft size={16} /> Back to sign in</button>
      </section> : !state ? <section className="employee-signin"><Fingerprint size={36} aria-hidden="true" /><h1>Sign in as yourself</h1>
        <form onSubmit={event => { event.preventDefault(); void perform(async () => { if (!api) throw new Error('Open the H2A desktop application to sign in.'); authGeneration.current++; const generation = ++proofGeneration.current; const next = await api.begin(humanId.trim()); setPending(() => async (proofId: string) => { if (generation !== proofGeneration.current) throw new Error('Sign-in verification was cancelled.'); authGeneration.current++; reconcile(await api.login(proofId)); }); setChallenge(next); }); }}>
          <label>Employee ID or Human ID<input autoComplete="username" value={humanId} onChange={event => setHumanId(event.target.value)} required maxLength={160} /></label>
          <button type="submit" disabled={busy || !api || !humanId.trim()}><Fingerprint size={18} /> {busy ? 'Checking employee…' : 'Verify employee'}</button>
        </form><p>Use your enrolled employee identity. An administrator must provision new employees.</p>{setupStatus?.available && <button type="button" onClick={() => setSetup(true)}><Plus size={16} /> Set up first administrator</button>}
      </section> : <>
        <nav className="employee-nav" aria-label="Employee workspace"><button type="button" aria-pressed={page === 'rooms'} onClick={() => setPage('rooms')}><Users size={17} /> Rooms</button><button type="button" aria-pressed={page === 'memory'} onClick={() => setPage('memory')}>Memory</button>{state.session.administrator && <button type="button" onClick={() => setConsoleOpen(true)}><ShieldCheck size={17} /> Administrator console</button>}</nav>
        {state.session.assurance !== 'high' && <p className="employee-assurance">Demo liveness bypass was used for this session. Live-person verification is not asserted.</p>}
        {state.session.renewal_credential_id && <section className="employee-assurance"><p>Your administrator credential expired. Replacement keeps its exact scope for at most 120 minutes.</p><button type="button" disabled={busy} onClick={() => void perform(() => prove('repair prerequisites for administrator console', async proofId => { if (api) reconcile(await api.renewAdministrator(proofId)); }))}><Fingerprint size={16} /> Verify authority renewal</button></section>}
        <div className="employee-layout"><aside><h2>Your rooms</h2>{state.rooms.map(item => <button className="employee-room-link" type="button" key={item.room_id} aria-current={room?.room_id === item.room_id ? 'page' : undefined} onClick={() => setSelectedRoom(item.room_id)}>{item.title}<small>{item.department} · {item.member_ids.length} members</small></button>)}
          <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const title = String(new FormData(form).get('title')); void perform(async () => { await mutate({ kind: 'create-room', title }); form.reset(); }); }}><label>New room<input name="title" required minLength={2} maxLength={160} /></label><button type="submit" disabled={busy}><Plus size={16} /> Create room</button></form>
        </aside><section className="employee-room">
          {!room ? <><h1>No rooms yet</h1><p>Create a room to establish its membership.</p></> : <>
            <header><h1>{room.title}</h1><details><summary>Authority details</summary><small>{room.room_id} · revision {room.revision}</small><small>Owner: {room.owner_membership_id}</small></details></header>
            {page === 'rooms' ? <><h2>People in this room</h2><ul className="employee-members">{room.member_ids.map(member => { const person = state.people.find(person => person.membership_id === member); return <li key={member}><span><strong>{person?.display_name ?? member}</strong><small>{person?.department}{member === room.owner_membership_id ? ' · Owner' : ''}</small></span>{member !== room.owner_membership_id && (state.session.administrator || room.owner_membership_id === state.session.membership_id) && <button type="button" title={`Remove ${person?.display_name ?? member}`} aria-label={`Remove ${person?.display_name ?? member}`} disabled={busy} onClick={() => void perform(() => prove(`change room membership ${room.room_id}`, proof_id => mutate({ kind: 'room-members', room_id: room.room_id, revision: room.revision, member_ids: room.member_ids.filter(id => id !== member), proof_id })))}><X size={16} /></button>}</li>; })}</ul>
              {(state.session.administrator || room.owner_membership_id === state.session.membership_id) && <form key={room.room_id} onSubmit={event => { event.preventDefault(); const employeeId = String(new FormData(event.currentTarget).get('employee')); void perform(async () => { if (!api) return; const person = await api.lookupMember(employeeId); if (room.member_ids.includes(person.membership_id)) throw new Error('This employee is already in the room.'); setCandidate(person); }); }}><label>Add a coworker<input name="employee" placeholder="Employee ID" required maxLength={160} /></label><button type="submit" disabled={busy}><Users size={16} /> Find employee</button></form>}
              {candidate && <section className="employee-member-preview"><h3>{candidate.display_name}</h3><p>{candidate.department}</p><button type="button" disabled={busy} onClick={() => void perform(() => prove(`change room membership ${room.room_id}`, async proof_id => { await mutate({ kind: 'room-members', room_id: room.room_id, revision: room.revision, member_ids: [...room.member_ids, candidate.membership_id], proof_id }); setCandidate(undefined); }))}><Fingerprint size={16} /> Verify and add member</button></section>}
              <p>Room membership does not issue mandates or disclose protected Context Grant values.</p>
            </> : <><h2>Reviewed Memory</h2>
              {state.memory.filter(item => item.room_id === room.room_id).map(item => <article className="employee-memory" key={item.memory_id}><h3>{item.title}</h3><strong>{item.status}</strong><p>{item.body}</p><small>{item.content_hash} · revision {item.revision}</small>
                {item.status === 'draft' && state.session.administrator && item.author_membership_id !== state.session.membership_id && <div><button type="button" disabled={busy} onClick={() => void perform(() => review(item, 'published'))}>Review and publish</button><button type="button" disabled={busy} onClick={() => void perform(() => review(item, 'rejected'))}>Reject</button></div>}
                {item.status !== 'withdrawn' && (state.session.administrator || item.author_membership_id === state.session.membership_id) && <button type="button" disabled={busy} onClick={() => void perform(() => mutate({ kind: 'withdraw-memory', memory_id: item.memory_id, revision: item.revision }))}>Withdraw</button>}
              </article>)}
              <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void perform(async () => { await mutate({ kind: 'draft-memory', room_id: room.room_id, title: String(values.get('title')), body: String(values.get('body')) }); form.reset(); }); }}><label>Title<input name="title" required minLength={2} maxLength={160} /></label><label>Proposed reusable knowledge<textarea name="body" required maxLength={12000} rows={5} /></label><p>Drafts remain local to this room. Do not include secrets, biometric data, or protected source values.</p><button type="submit" disabled={busy}><Plus size={16} /> Submit draft</button></form>
            </>}
          </>}
        </section></div>
      </>}
    </main>}
    {challenge && <dialog ref={dialog} className="employee-proof-dialog" aria-label={`Verify ${challenge.display_name}`} onCancel={cancelProof}><header><h2>Verify {challenge.display_name}</h2><button type="button" aria-label="Cancel verification" onClick={cancelProof}><X size={20} /></button></header><HumanProofView identityApi={identityApi} presentation="challenge" targetHumanId={challenge.human_id} expectedDisplayName={challenge.display_name} verificationPurpose={challenge.purpose} livenessMode={challenge.liveness_mode} onCancel={cancelProof} onVerificationComplete={async proofId => { await pending?.(proofId); cancelProof(); }} /></dialog>}
  </>;
}
