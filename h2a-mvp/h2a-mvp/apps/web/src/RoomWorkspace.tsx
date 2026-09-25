import { useEffect, useState } from 'react';
import { Bot, FileCode2, Play, RefreshCw, ShieldCheck, Users, Database } from 'lucide-react';
import type { Memory, Snapshot } from '../../governance/contracts';
import type { RoomRun } from '../../governance/room-runtime';
import './room-workspace.css';
import { ProductMark } from './ProductMark';

type RuntimeView = { bindings: Record<string, 'claude' | 'codex'>; runs: RoomRun[]; engines: { engine: string; status: string }[]; memory: { local: string; mem0: string }; execution_boundary: string };
async function request<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(path, data === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Request failed'); return body;
}

export function RoomWorkspace({ state, refresh, decisionsOnly = false }: { state: Snapshot; refresh: () => Promise<void>; decisionsOnly?: boolean }) {
  const [runtime, setRuntime] = useState<RuntimeView | null>(null);
  const [roomId, setRoomId] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [objective, setObjective] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Memory[] | null>(null);
  const [searchMode, setSearchMode] = useState('');
  const [agentId, setAgentId] = useState('');
  const [engine, setEngine] = useState<'claude' | 'codex'>('claude');
  const role = state.session.role || 'admin';
  const reviewer = role === 'admin' || role === 'reviewer';
  const rooms = state.rooms.filter(room => role === 'admin' || room.human_ids.includes(state.session.human_id));
  const room = rooms.find(item => item.room_id === roomId) || rooms[0];
  const reload = async () => { try { setRuntime(await request<RuntimeView>('/api/runtime')); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void reload(); const timer = setInterval(() => { if (!document.hidden) void reload(); }, 3000); return () => clearInterval(timer); }, []);
  useEffect(() => { setResults(null); setSelectedAgents([]); }, [room?.room_id]);
  const act = async (path: string, data: unknown, success: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await request(path, data); await reload(); await refresh(); setNotice(success); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const runs = (runtime?.runs || []).filter(run => decisionsOnly ? run.status === 'pending' : run.room_id === room?.room_id).reverse();
  return <section className="room-workspace" aria-label={decisionsOnly ? 'Build run approvals' : 'Live collaboration workspace'}>
    <header><div><span className="runtime-eyebrow">{decisionsOnly ? 'HUMAN AUTHORITY' : 'REAL CLI COLLABORATION'}</span><h2>{decisionsOnly ? 'Build requests needing a human' : 'Build together. Keep the evidence.'}</h2><p>{decisionsOnly ? 'Approve the exact objective and agent chain before any CLI starts. Existing CLI usage limits and charges apply.' : 'Human request → governed agent handoff → proposed files → human publication → reviewed memory.'}</p></div><button disabled={busy} onClick={() => void reload()} aria-label="Refresh room runs"><RefreshCw size={16} />Refresh</button></header>
    {error && <p className="runtime-error" role="alert">{error}</p>}
    {notice && <p className="runtime-notice" role="status">{notice}</p>}
    {!decisionsOnly && <>
      <div className="runtime-boundary"><ShieldCheck size={20} /><p>{runtime?.execution_boundary || 'Checking runtime connection…'}<br /><strong>Scope: one shared organization. Personal credentials and room membership control execution; this is not enterprise SSO.</strong></p></div>
      {role === 'admin' && <details className="runtime-setup"><summary>Runtime connections & authority</summary><div className="runtime-fields">
        <label>Agent identity<select aria-label="Agent identity" value={agentId} onChange={e => setAgentId(e.target.value)}><option value="">Select a registered agent</option>{state.agents.map(agent => <option key={agent.agent_id} value={agent.agent_id}>{agent.name}</option>)}</select></label>
        <label>Local CLI<select aria-label="Local CLI" value={engine} onChange={e => setEngine(e.target.value as 'claude' | 'codex')}><option value="claude">Claude Code</option><option value="codex">Codex CLI</option></select></label>
        <button disabled={busy || !agentId} onClick={() => void act(`/api/agents/${agentId}/runtime`, { engine }, 'CLI binding saved. This does not yet prove authentication or execution.')}><Bot size={16} />Connect CLI</button>
        <button disabled={busy || !agentId} onClick={() => void act(`/api/agents/${agentId}/mandate`, { profile: 'product-build' }, 'Product-build mandate issued; every run still needs approval.')}>Grant build mandate</button>
        <button disabled={busy} onClick={() => void act('/api/runtime/check', {}, 'CLI version checks complete. Authentication is verified only by a successful run.')}>Check installed CLIs</button>
      </div><ul>{runtime?.engines.map(item => <li key={item.engine}>{item.engine}: {item.status}</li>)}</ul></details>}
      {!room ? <p className="runtime-empty">Create a governed room below after discovering, registering and binding your agents. An administrator can add other named users to it.</p> : <>
        <label className="runtime-room-select">Working room<select value={room.room_id} onChange={e => setRoomId(e.target.value)}>{rooms.map(item => <option key={item.room_id} value={item.room_id}>{item.name}</option>)}</select></label>
        {role === 'admin' && <details className="runtime-setup"><summary><Users size={16} /> Room members ({room.human_ids.length})</summary><div className="runtime-checks">{state.humans.map(human => <label key={human.human_id}><input type="checkbox" disabled={busy} checked={room.human_ids.includes(human.human_id)} onChange={e => void act(`/api/rooms/${room.room_id}/members`, { human_ids: e.target.checked ? [...room.human_ids, human.human_id] : room.human_ids.filter(id => id !== human.human_id) }, 'Room membership updated.')} />{human.name} · {human.team}</label>)}</div></details>}
        <div className="runtime-columns">
          <form onSubmit={e => { e.preventDefault(); void act(`/api/rooms/${room.room_id}/runs`, { title, objective, agent_ids: selectedAgents }, 'Build requested. A reviewer must approve before a CLI runs.'); }}>
            <h3><Play size={18} /> New product build</h3>
            <label>Build title<input required minLength={3} maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="Customer feedback dashboard" /></label>
            <label>Objective and acceptance criteria<textarea required minLength={8} maxLength={12000} rows={4} value={objective} onChange={e => setObjective(e.target.value)} placeholder="Describe the files to build and what a reviewer should verify." /></label>
            <fieldset><legend>Agent sequence — selection order is handoff order</legend><div className="runtime-checks">{room.agent_ids.map(id => { const agent = state.agents.find(item => item.agent_id === id); return <label key={id}><input type="checkbox" disabled={!runtime?.bindings[id] || (selectedAgents.length >= 4 && !selectedAgents.includes(id))} checked={selectedAgents.includes(id)} onChange={e => setSelectedAgents(e.target.checked ? [...selectedAgents, id] : selectedAgents.filter(item => item !== id))} />{agent?.name || id} · {runtime?.bindings[id] || 'CLI not connected'}{selectedAgents.includes(id) ? ` · step ${selectedAgents.indexOf(id) + 1}` : ''}</label>; })}</div></fieldset>
            <button className="primary" disabled={busy || !selectedAgents.length || !['admin', 'builder'].includes(role)}><ShieldCheck size={16} />Request approval to run</button>
          </form>
          <div className="runtime-brain"><section className="room-participants"><h3><Users size={18} /> Participants</h3><p>Membership controls this room. Each agent keeps its own authority.</p><div>{room.human_ids.map(id => { const human = state.humans.find(h => h.human_id === id); return <span key={id}><span className="person-avatar">{(human?.name || id).split(' ').map(s => s[0]).slice(0, 2).join('')}</span><strong>{human?.name || id}</strong><small>{human?.team || 'Member'}</small></span>; })}{room.agent_ids.map(id => { const agent = state.agents.find(a => a.agent_id === id); return <span key={id}><ProductMark entity={agent} /><strong>{agent?.name || id}</strong><small>{runtime?.bindings[id] || 'Runtime not connected'}</small></span>; })}</div></section><h3><Database size={18} /> Reviewed room memory</h3><p>Only published memory from this room is included in the next run. Proposed material stays outside agent context.</p>
            <form onSubmit={e => { e.preventDefault(); setError(''); void request<{ results: Memory[]; mode: string }>(`/api/brain/${room.room_id}/search`, { query }).then(result => { setResults(result.results); setSearchMode(result.mode); }).catch(e => setError(e.message)); }}><label>Search approved knowledge<input value={query} onChange={e => setQuery(e.target.value)} maxLength={2000} /></label><button>Search memory</button></form>
            <small>{searchMode || `Mem0: ${runtime?.memory.mem0 || 'checking'}`}</small>
            {(results || state.memories.filter(memory => memory.room_id === room.room_id && memory.status === 'published')).map(memory => <details key={memory.memory_id}><summary>{memory.title}</summary><p>{memory.content}</p><small>Reviewed by {memory.reviewed_by}</small>{reviewer && runtime?.memory.mem0 !== 'not-configured' && <button disabled={busy} onClick={() => void act(`/api/memories/${memory.memory_id}/sync`, {}, 'Reviewed memory sent to Mem0.')}>Sync to Mem0</button>}</details>)}
          </div>
        </div>
      </>}
    </>}
    {!decisionsOnly && room && <details className="room-activity"><summary>Room activity & evidence · {state.events.filter(event => event.room_id === room.room_id).length} records</summary><ol>{[...state.events].reverse().filter(event => event.room_id === room.room_id).slice(0, 12).map(event => <li key={event.event_id}><time>{new Date(event.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time><span><strong>{event.event_type.replaceAll('_', ' ')}</strong><small>{state.humans.find(h => h.human_id === event.actor_id)?.name || event.actor_id}</small></span><code title={event.event_hash}>{event.event_hash.slice(0, 18)}…</code></li>)}</ol></details>}
    <div className="runtime-runs">
      {!runs.length && <p className="runtime-empty">{decisionsOnly ? 'No build requests are awaiting approval.' : 'No runs in this room yet. A completed run will show the real CLI result, handoff and proposed files here.'}</p>}
      {runs.map(run => <article key={run.run_id} className="runtime-run"><header><div><h3>{run.title}</h3><small>Requested by {state.humans.find(h => h.human_id === run.requested_by)?.name || run.requested_by} · {new Date(run.created_at).toLocaleString()}</small></div><span className={`runtime-state ${run.status}`}>{run.status.replaceAll('_', ' ')}</span></header>
        <p>{run.objective}</p><ol className="runtime-chain">{run.steps.map((step, index) => <li key={step.agent_id}><ProductMark entity={state.agents.find(agent => agent.agent_id === step.agent_id)} /><strong>{index + 1}. {state.agents.find(agent => agent.agent_id === step.agent_id)?.name || step.agent_id}</strong><span>{step.engine} · {step.status}</span>{step.duration_ms !== undefined && <small>{(step.duration_ms / 1000).toFixed(1)}s · {step.files.length} files</small>}</li>)}</ol>
        {run.error && <p className="runtime-error">{run.error}</p>}
        {run.status === 'pending' && reviewer && <div className="runtime-actions"><button className="primary" disabled={busy} onClick={() => void act(`/api/runs/${run.run_id}/decision`, { decision: 'approve' }, 'Approved. The real CLI run is starting; progress updates automatically.')}>Approve & run CLIs</button><button disabled={busy} onClick={() => void act(`/api/runs/${run.run_id}/decision`, { decision: 'reject' }, 'Build request rejected.')}>Reject</button></div>}
        {['pending', 'running'].includes(run.status) && role !== 'viewer' && <button disabled={busy} onClick={() => void act(`/api/runs/${run.run_id}/cancel`, {}, 'Cancellation requested for the owned CLI process.')}>Cancel run</button>}
        {run.steps.filter(step => step.status === 'succeeded').map(step => <details key={step.agent_id}><summary>{step.engine} result · {step.files.length} proposed files</summary><p>{step.summary}</p>{step.files.map(file => <details key={file.path}><summary><FileCode2 size={14} />{file.path}</summary><pre>{file.content}</pre></details>)}</details>)}
        {run.status === 'succeeded' && <div className="runtime-actions">{reviewer && !run.publication && <button disabled={busy} onClick={() => void act(`/api/runs/${run.run_id}/publish`, {}, 'Reviewed files published to a new local directory. They have not been installed or deployed.')}>Publish reviewed files</button>}{['admin', 'builder'].includes(role) && <button disabled={busy} onClick={() => void act(`/api/runs/${run.run_id}/memory`, {}, 'Memory proposed. Review it in the memory workflow before reuse.')}>Propose result as memory</button>}</div>}
        {run.publication && <p className="runtime-notice">Published by {run.published_by}<br /><code>{run.publication}</code><br /><a href={`/api/runs/${run.run_id}/download`}>Download reviewed build (.zip)</a></p>}
        <details><summary>Authority & trace evidence</summary><p>Run: {run.run_id}<br />Approved by: {run.approved_by || 'Not approved'}<br />Reviewed memory items supplied: {run.memory_ids.length}<br />Langfuse export: {run.trace_export || 'Not attempted'}</p>{run.steps.map(step => <p key={step.agent_id}><code>{step.passport_id}<br />{step.mandate_id}<br />{step.output_hash || 'No successful output hash'}</code></p>)}</details>
      </article>)}
    </div>
  </section>;
}
