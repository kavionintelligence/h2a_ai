import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Brain, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, FileText, GitBranch, LockKeyhole, Network, Search, ShieldCheck, Users, XCircle } from 'lucide-react';
import { allMemories, allTasks, DEPARTMENTS, personName, type Department, type Playback, type Scenario, type SimMemory } from './model';
import { completedTaskOutput } from './outputs';
import { PrivateBlock, PrivateField, PrivateText, usePrivacy } from '../privacy/Privacy';
import './company-brain-explorer.css';

type Inspection = { kind: 'task' | 'agent' | 'human' | 'memory'; id: string };
type Props = { scenario: Scenario; playback: Playback; onInspect: (selection: Inspection) => void; onInteract?: () => void };
type Hover = { kind: 'department'; department: Department } | { kind: 'memory'; memory: SimMemory } | null;
const PAGE_SIZE = 8;
const POSITIONS = [[29, 23], [50, 12], [71, 23], [77, 64], [50, 82], [23, 64]];
const MEMORY_POSITIONS = [[26, 17], [50, 12], [74, 17], [84, 47], [74, 78], [50, 85], [26, 78], [16, 47]];
const short = (title: string) => title.replace(/ — reviewed guidance$/, '').replace(/^Prepare |^Review |^Draft |^Create |^Publish /, '');
const count = (n: number) => n.toLocaleString('en-IN');
const date = (value: string) => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Status({ status }: { status: SimMemory['status'] }) {
  const Icon = status === 'Published' ? CheckCircle2 : status === 'Rejected' ? XCircle : Clock3;
  return <span className={`brain-status brain-status-${status.toLowerCase()}`}><Icon aria-hidden="true" />{status === 'Proposed' ? 'Awaiting review' : status}</span>;
}

function saveText(value: string, filename: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A bounded, read-only knowledge explorer over the enterprise simulation's actual record state. */
export function CompanyBrainExplorer({ scenario, playback, onInspect, onInteract }: Props) {
  const { masked, hideAll } = usePrivacy();
  const [department, setDepartment] = useState<Department | 'All'>('All');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'All' | SimMemory['status']>('All');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const details = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selectedId || !window.matchMedia('(max-width:1250px)').matches) return;
    details.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' });
  }, [selectedId]);
  const memories = useMemo(() => allMemories(scenario, playback).sort((a, b) => b.created.localeCompare(a.created) || a.id.localeCompare(b.id)), [scenario, playback]);
  const tasks = useMemo(() => allTasks(scenario, playback), [scenario, playback]);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    tasks.forEach(task => task.memoryIds.forEach(id => counts.set(id, (counts.get(id) || 0) + 1)));
    return counts;
  }, [tasks]);
  const filtered = useMemo(() => memories.filter(memory => (department === 'All' || memory.department === department) && (status === 'All' || memory.status === status) && `${memory.title} ${memory.department} ${memory.content} ${memory.task} ${personName(scenario, memory.reviewer)}`.toLowerCase().includes(query.toLowerCase())), [memories, department, status, query, scenario]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount - 1);
  const pageMemories = filtered.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE);
  const selected = memories.find(memory => memory.id === selectedId);
  const sourceTask = tasks.find(task => task.id === selected?.task);
  const sourceAgent = scenario.agents.find(agent => agent.id === sourceTask?.agent);
  const sourceOutput = sourceTask ? completedTaskOutput(scenario, sourceTask) : null;
  const executiveHandoff = sourceOutput?.sections.find(section => section.heading === 'Executive handoff')?.body.split('\n\n')[0] || '';
  const outputSummary = executiveHandoff.length > 200 ? `${executiveHandoff.slice(0, 197).trimEnd()}…` : executiveHandoff;
  const published = memories.filter(memory => memory.status === 'Published');
  const proposed = memories.filter(memory => memory.status === 'Proposed');
  const reviewed = memories.filter(memory => memory.status !== 'Proposed');
  const sourceTasks = new Set(memories.map(memory => memory.task)).size;
  const reused = tasks.reduce((total, task) => total + task.memoryIds.length, 0);
  const completed = tasks.filter(task => task.stage === 'Completed');
  const averageCalls = completed.length ? (completed.reduce((total, task) => total + task.calls, 0) / completed.length).toFixed(1) : '0';
  const chooseDepartment = (next: Department | 'All') => { hideAll(); onInteract?.(); setDepartment(next); setPage(0); setSelectedId(null); setHover(null); };
  const selectMemory = (memory: SimMemory) => { hideAll(); onInteract?.(); setSelectedId(memory.id); setHover(null); };
  const back = () => { hideAll(); onInteract?.(); if (selectedId) setSelectedId(null); else chooseDepartment('All'); };
  const inspect = (selection: Inspection) => { hideAll(); onInteract?.(); onInspect(selection); };
  const departmentRecords = (team: Department) => filtered.filter(memory => memory.department === team);
  const currentTeam = department === 'All' ? null : scenario.people.filter(person => person.department === department);
  return <section className="company-brain-explorer" data-testid="company-brain-explorer" data-level={department === 'All' ? 'company' : 'team'} aria-label="Hospital company brain explorer">
    <header className="brain-explorer-header">
      <div className="brain-breadcrumb"><button className="brain-back" aria-label="Back in company brain" onClick={back} disabled={department === 'All' && !selectedId}><ArrowLeft aria-hidden="true" /><span>Back</span></button><span>Company brain</span>{department !== 'All' && <><ChevronRight aria-hidden="true" /><strong>{department}</strong></>}</div>
      <span className="brain-environment">Governed knowledge workspace</span>
    </header>
    <div className="brain-heading"><div><span className="brain-overline">JOON’S HOSPITAL / KNOWLEDGE NETWORK</span><h2>Knowledge with a clear chain of trust.</h2><p>Follow knowledge from its source, through human review, to the work that reuses it.</p></div><div className="brain-heading-count"><Brain aria-hidden="true" /><strong>{count(published.length)}</strong><span>published records</span></div></div>
    <div className="brain-governance-summary" data-testid="brain-governance-flow">
      <ol className="brain-stat-grid" aria-label="Knowledge governance flow">
        <li><FileText aria-hidden="true" /><span>1 · Source tasks</span><strong>{count(sourceTasks)}</strong><small>Tasks linked to a memory record</small><ArrowRight className="brain-flow-arrow" aria-hidden="true" /></li>
        <li><ShieldCheck aria-hidden="true" /><span>2 · Human review</span><strong>{count(reviewed.length)} <em>decided</em></strong><small>{proposed.length} awaiting review · excluded from reuse</small><ArrowRight className="brain-flow-arrow" aria-hidden="true" /></li>
        <li><BookOpen aria-hidden="true" /><span>3 · Published context</span><strong>{count(published.length)}</strong><small>Available only to allowed teams</small><ArrowRight className="brain-flow-arrow" aria-hidden="true" /></li>
        <li><GitBranch aria-hidden="true" /><span>4 · Reused in work</span><strong>{count(reused)}</strong><small>Retained task-to-memory references</small></li>
      </ol>
      <p className="brain-flow-caption"><span>Company-wide record states and reuse references, not a conversion funnel. Memory review is separate from peer review and action approval.</span><span><Network aria-hidden="true" />{averageCalls} modeled tool calls / completed task · baseline 8</span></p>
    </div>
    <div className="brain-explorer-layout">
      <div className="brain-network-column">
        <section className="brain-network" aria-labelledby="brain-network-title">
          <header><div><h3 id="brain-network-title">{department === 'All' ? 'Hospital knowledge network' : `${department} knowledge`}</h3><p>{department === 'All' ? 'Select a team to explore its reviewed context.' : `${currentTeam?.length || 0} people · ${scenario.agents.filter(agent => agent.department === department).length} agents · ${filtered.length} matching records`}</p></div><label className="brain-team-picker">Team<select aria-label="Brain team" value={department} onChange={event => chooseDepartment(event.target.value as Department | 'All')}><option value="All">All teams</option>{DEPARTMENTS.map(team => <option key={team}>{team}</option>)}</select></label></header>
          <div className="brain-network-canvas" data-testid="brain-network-canvas">
            <svg viewBox="0 0 1000 600" preserveAspectRatio="none" className="brain-connectors" aria-hidden="true">
              {department === 'All' ? DEPARTMENTS.map((team, index) => <path key={team} d={`M500 300 Q${POSITIONS[index][0] * 10} 300 ${POSITIONS[index][0] * 10} ${POSITIONS[index][1] * 6}`} className={departmentRecords(team).some(memory => memory.status === 'Proposed') ? 'brain-edge-attention' : 'brain-edge-published'} />) : pageMemories.map((memory, index) => <path key={memory.id} d={`M500 300 Q${MEMORY_POSITIONS[index][0] * 10} 300 ${MEMORY_POSITIONS[index][0] * 10} ${MEMORY_POSITIONS[index][1] * 6}`} className={`brain-edge-${memory.status.toLowerCase()}`} />)}
              <circle cx="500" cy="300" r="85" className="brain-center-ring" />
            </svg>
            <button className="brain-center-node" onClick={() => chooseDepartment('All')} aria-label={department === 'All' ? 'Hospital brain, all teams' : 'Return to hospital brain'}><Brain aria-hidden="true" /><strong>{department === 'All' ? 'Hospital brain' : department}</strong><small>{department === 'All' ? `${DEPARTMENTS.length} connected teams` : `${filtered.length} knowledge records`}</small></button>
            {department === 'All' ? DEPARTMENTS.map((team, index) => {
              const records = departmentRecords(team); const pending = records.filter(memory => memory.status === 'Proposed').length;
              return <button key={team} className={`brain-graph-node brain-team-node ${pending ? 'brain-node-attention' : 'brain-node-published'}`} style={{ '--node-x': `${POSITIONS[index][0]}%`, '--node-y': `${POSITIONS[index][1]}%` } as CSSProperties} data-team={team} onClick={() => chooseDepartment(team)} onMouseEnter={() => setHover({ kind: 'department', department: team })} onMouseLeave={() => setHover(null)} onFocus={() => setHover({ kind: 'department', department: team })} onBlur={() => setHover(null)} aria-label={`Explore ${team} knowledge, ${records.length} matching records`}><span className="brain-node-icon"><Users aria-hidden="true" /></span><strong>{team}</strong><small>{records.length} records · {pending ? `${pending} need review` : 'Reviewed context'}</small></button>;
            }) : pageMemories.map((memory, index) => <button key={memory.id} className={`brain-graph-node brain-memory-node brain-node-${memory.status.toLowerCase()} ${selectedId === memory.id ? 'brain-node-selected' : ''}`} style={{ '--node-x': `${MEMORY_POSITIONS[index][0]}%`, '--node-y': `${MEMORY_POSITIONS[index][1]}%` } as CSSProperties} data-memory-id={memory.id} aria-label={`Inspect memory: ${masked(memory.title)}`} aria-pressed={selectedId === memory.id} onClick={() => selectMemory(memory)} onMouseEnter={() => setHover({ kind: 'memory', memory })} onMouseLeave={() => setHover(null)} onFocus={() => setHover({ kind: 'memory', memory })} onBlur={() => setHover(null)}><span className="brain-node-icon"><BookOpen aria-hidden="true" /></span><strong><PrivateText value={short(memory.title)} /></strong><small>{memory.status === 'Proposed' ? 'Review pending' : memory.status} · {usage.get(memory.id) || 0} reuses</small></button>)}
            {department !== 'All' && !pageMemories.length && <div className="brain-graph-empty">No records match these filters.<br />Change the status or search below.</div>}
            {hover && <div className="brain-hover-card" role="tooltip" data-testid="brain-hover-card">{hover.kind === 'department' ? <><span className="brain-overline">TEAM KNOWLEDGE</span><strong>{hover.department}</strong><p>{departmentRecords(hover.department).length} matching records. {scenario.people.filter(person => person.department === hover.department).length} people and {scenario.agents.filter(agent => agent.department === hover.department).length} agents.</p><small>Click to explore source, scope and reuse.</small></> : <><Status status={hover.memory.status} /><strong><PrivateText value={hover.memory.title} /></strong><p>Reviewer: <PrivateText value={personName(scenario, hover.memory.reviewer)} /> · Scope: {hover.memory.allowedTeams.join(' + ')}</p><small>{usage.get(hover.memory.id) || 0} task reuses · Click for evidence and source output.</small></>}</div>}
          </div>
          <div className="brain-mobile-teams" aria-label="Team knowledge links">{DEPARTMENTS.map(team => <button key={team} data-team={team} aria-pressed={department === team} onClick={() => chooseDepartment(team)}><Users aria-hidden="true" /><span>{team}<small>{memories.filter(memory => memory.department === team).length} records</small></span><ChevronRight aria-hidden="true" /></button>)}</div>
          <footer className="brain-map-legend"><span><i className="brain-dot-published" />Published / reusable</span><span><i className="brain-dot-proposed" />Review required</span><span><i className="brain-dot-rejected" />Rejected / excluded</span><small>{department === 'All' ? 'Edges show team knowledge contributions.' : 'Edges show source-team ownership, not network traffic. Up to 8 records shown.'}</small></footer>
        </section>
        <section className="brain-record-library" aria-label="Searchable knowledge library">
          <header><h3>Knowledge library <span>{count(filtered.length)}</span></h3><p>{department === 'All' ? 'All teams' : department} · Select a record to inspect its context and source.</p></header>
          <div className="brain-library-filters"><label><span>Search knowledge</span><div><Search aria-hidden="true" /><input aria-label="Search hospital knowledge" placeholder="Title, context or reviewer…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></div></label><label><span>Review status</span><select aria-label="Knowledge review status" value={status} onChange={event => { setStatus(event.target.value as typeof status); setPage(0); }}><option value="All">All records</option><option value="Published">Published</option><option value="Proposed">Awaiting review</option><option value="Rejected">Rejected</option></select></label></div>
          <div className="brain-record-list">{pageMemories.length ? pageMemories.map(memory => <button className={`brain-record-row ${selectedId === memory.id ? 'selected' : ''}`} key={memory.id} data-memory-id={memory.id} onClick={() => selectMemory(memory)} aria-pressed={selectedId === memory.id}><span className={`brain-record-icon brain-node-${memory.status.toLowerCase()}`}><BookOpen aria-hidden="true" /></span><span className="brain-record-title"><strong><PrivateText value={short(memory.title)} /></strong><small>{memory.department} · <PrivateText value={personName(scenario, memory.reviewer)} /> · v{memory.version}</small></span><span className="brain-record-status"><Status status={memory.status} /><small>{usage.get(memory.id) || 0} reuses</small></span><ChevronRight aria-hidden="true" /></button>) : <div className="brain-empty-state"><Search aria-hidden="true" /><strong>No matching knowledge</strong><p>Try another team, status or search term.</p><button onClick={() => { setQuery(''); setStatus('All'); setPage(0); }}>Clear search and status</button></div>}</div>
          <footer className="brain-pagination"><span>{filtered.length ? `${activePage * PAGE_SIZE + 1}–${Math.min((activePage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}` : '0 records'}</span><div><button aria-label="Previous knowledge page" disabled={activePage === 0} onClick={() => { onInteract?.(); setPage(activePage - 1); }}><ChevronLeft aria-hidden="true" /></button><span>Page {activePage + 1} / {pageCount}</span><button aria-label="Next knowledge page" disabled={activePage + 1 >= pageCount} onClick={() => { onInteract?.(); setPage(activePage + 1); }}><ChevronRight aria-hidden="true" /></button></div></footer>
        </section>
      </div>
      <aside ref={details} className="brain-inspector" aria-label="Knowledge details" data-testid="brain-knowledge-details" aria-live="polite">
        {selected ? <><header><span className="brain-overline">KNOWLEDGE RECORD</span><Status status={selected.status} /><h3><PrivateField value={short(selected.title)} label="knowledge title" /></h3><small><PrivateField value={selected.id} label="knowledge identifier" /> · version {selected.version}</small></header><section><h4><ShieldCheck aria-hidden="true" />Review and authority</h4><dl><dt>Source team</dt><dd>{selected.department}</dd><dt>{selected.status === 'Published' ? 'Reviewed by' : 'Review owner'}</dt><dd><PrivateField value={personName(scenario, selected.reviewer)} label="reviewer name" /><button onClick={() => inspect({ kind: 'human', id: selected.reviewer })}>Inspect reviewer<ArrowRight aria-hidden="true" /></button></dd><dt>Recorded</dt><dd>{date(selected.created)}</dd><dt>Reusable</dt><dd>{selected.status === 'Published' ? 'Yes, within the allowed scope' : 'No, excluded from agent context'}</dd><dt>Reuse count</dt><dd>{usage.get(selected.id) || 0} retained tasks</dd></dl><div className="brain-scope"><LockKeyhole aria-hidden="true" /><div><strong>Allowed teams</strong><p>{selected.allowedTeams.join(' + ')}</p><small>This record supplies context. It does not grant permission to execute a new action.</small></div></div></section><section><h4><BookOpen aria-hidden="true" />Reviewed context</h4><PrivateBlock key={selected.id} label="Reviewed context"><p className="brain-context-copy">{selected.content}</p></PrivateBlock></section><section><h4><GitBranch aria-hidden="true" />Source and provenance</h4><ol className="brain-provenance"><li><Users aria-hidden="true" /><span>Accountable human<strong><PrivateField value={sourceTask ? personName(scenario, sourceTask.owner) : personName(scenario, selected.reviewer)} label="accountable human name" /></strong></span></li><li><Brain aria-hidden="true" /><span>Bound agent<strong>{sourceAgent ? <PrivateField value={sourceAgent.name} label="bound agent name" /> : 'Source outside retained window'}</strong></span></li><li><FileText aria-hidden="true" /><span>Source task<strong><PrivateField value={sourceTask?.title || selected.task} label="source task" /></strong></span></li><li><CheckCircle2 aria-hidden="true" /><span>Memory outcome<strong>{selected.status === 'Published' ? 'Reviewed and published' : selected.status === 'Rejected' ? 'Rejected; reuse excluded' : 'Waiting for human review'}</strong></span></li></ol>{sourceTask ? <button className="brain-detail-link" onClick={() => inspect({ kind: 'task', id: sourceTask.id })}>Inspect full identity trace<ArrowRight aria-hidden="true" /></button> : <p className="brain-retention-note">This record is retained; the source task is outside the current playback window.</p>}</section><section className="brain-output"><h4><FileText aria-hidden="true" />Completed task output</h4>{sourceOutput ? <><span className="brain-output-label">Sample operational deliverable</span><h5><PrivateField value={sourceOutput.title} label="deliverable title" /></h5><PrivateBlock key={selected.id} label="Completed task summary"><p className="brain-output-summary">{outputSummary}</p></PrivateBlock><p className="brain-output-hint">The full handoff includes recommended actions, review gates and the linked identity record.</p>{sourceTask && <button className="brain-detail-link" onClick={() => inspect({ kind: 'task', id: sourceTask.id })}>View complete deliverable<ArrowRight aria-hidden="true" /></button>}<button className="brain-download" onClick={() => saveText(`# Redacted completed task deliverable\n\nTitle: ${masked(sourceOutput.title)}\nTask identifier: ${masked(sourceTask?.id || '')}\nAccountable human: ${masked(sourceTask?.owner || '')}\nAgent: ${masked(sourceTask?.agent || '')}\nTask content: ${masked(sourceOutput.markdown)}\n\nSource team: ${selected.department}\nKnowledge status: ${selected.status}\nVersion: ${selected.version}\n\nThis export omits private names, identifiers and source content.\n`, 'redacted-deliverable.md')}><Download aria-hidden="true" />Download deliverable</button><small className="brain-export-note">Redacted export · private fields remain hidden, even after reveal.</small></> : <p className="brain-retention-note">{sourceTask ? 'The source task has not completed. Its final deliverable appears after execution and review.' : 'No completed source task is available in this retained view.'}</p>}</section></> : <><header><span className="brain-overline">KNOWLEDGE ASSURANCE</span><Brain className="brain-inspector-hero" aria-hidden="true" /><h3>Useful context. Accountable origins.</h3><p>Choose a team, then a memory record. Its reviewer, permitted reuse and original work stay connected.</p></header><section><h4><ShieldCheck aria-hidden="true" />What the CISO can establish</h4><ul className="brain-checklist"><li><CheckCircle2 aria-hidden="true" /><span>Who reviewed this knowledge before an agent reused it.</span></li><li><LockKeyhole aria-hidden="true" /><span>Which teams may use it—and which records remain excluded.</span></li><li><GitBranch aria-hidden="true" /><span>Which task produced it, and how often it was reused.</span></li><li><FileText aria-hidden="true" /><span>The completed task’s actual sample deliverable, not just a success badge.</span></li></ul></section><section><h4>Review queue</h4>{proposed.length ? proposed.slice(0, 3).map(memory => <button className="brain-queue-item" key={memory.id} onClick={() => selectMemory(memory)}><Clock3 aria-hidden="true" /><span><PrivateText value={short(memory.title)} /><small>{memory.department} · <PrivateText value={personName(scenario, memory.reviewer)} /></small></span><ChevronRight aria-hidden="true" /></button>) : <p>There are no knowledge records awaiting review.</p>}</section><section><h4>Latest published record</h4>{published[0] ? <button className="brain-featured-record" onClick={() => selectMemory(published[0])}><BookOpen aria-hidden="true" /><strong><PrivateText value={short(published[0].title)} /></strong><span>View knowledge and completed output<ArrowRight aria-hidden="true" /></span></button> : <p>No reviewed record has been published yet.</p>}</section><footer className="brain-inspector-note">Operational context only. No patient records or clinical decision-making authority are represented here.</footer></>}
      </aside>
    </div>
  </section>;
}
