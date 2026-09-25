import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Bot, Brain, Building2, ChevronRight, Database, FileText, ShieldCheck, Users, Workflow } from 'lucide-react';
import { ProductMark } from '../ProductMark';
import { PrivateBlock, PrivateField, PrivateText, usePrivacy } from '../privacy/Privacy';
import { DEPARTMENTS, allMemories, allTasks, isTerminal, personName, toolFor, type Department, type Playback, type Scenario, type SimTask } from './model';
import { roomContext, roomSummaries, taskTone, type FlowTone } from './graph-model';
import './collaboration-explorer.css';

type Inspection = { kind: 'task' | 'agent' | 'human' | 'memory' | 'discovery'; id: string };
type Props = { scenario: Scenario; playback: Playback; onInspect: (selection: Inspection) => void; onInteract?: () => void };
type GraphNode = { id: string; x: number; y: number; label: string; sub: string; kind: 'company' | 'team' | 'room' | 'human' | 'agent' | 'tool' | 'memory'; tone?: FlowTone; department?: Department; inspect?: Inspection; width?: number };
type FlowEdge = { id: string; source: string; target: string; label: string; detail: string; scope: string; status: string; tone: FlowTone; task?: SimTask; agent?: string; owner?: string; curved?: boolean; recorded?: boolean };
const icons = { company: Brain, team: Building2, room: Workflow, human: Users, agent: Bot, tool: Database, memory: Brain };
const toneLabel: Record<FlowTone, string> = { good: 'Recorded / completed', attention: 'Human review', danger: 'Blocked / rejected', neutral: 'Planned / in progress' };
const compact = (value: string, max = 24) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
const isPrivateNode = (node: GraphNode) => node.kind === 'human' || node.kind === 'agent';
const publicEdgeLabel = (edge: FlowEdge) => edge.id.startsWith('bind-') ? 'Human → agent binding' : edge.id.startsWith('member-') ? 'Agent → shared room' : edge.label;
const activate = (event: KeyboardEvent, callback: () => void) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); callback(); } };

/** One map, three levels. All relationships come from the same scenario record set. */
export function CollaborationExplorer({ scenario, playback, onInspect, onInteract }: Props) {
  const { masked, hideAll } = usePrivacy();
  const visibleNodeLabel = (item: GraphNode) => isPrivateNode(item) ? masked(item.label) : item.label;
  const visibleNodeSub = (item: GraphNode) => item.kind === 'room' && item.sub.startsWith('ROOM-') ? masked(item.sub) : item.sub;
  const [department, setDepartment] = useState<Department | undefined>();
  const [roomId, setRoomId] = useState<string | undefined>();
  const [taskId, setTaskId] = useState('');
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const hovered = hoveredId || focusedId;
  const graphId = useId().replace(/:/g, '');
  const rooms = useMemo(() => roomSummaries(scenario, playback, department), [scenario, playback, department]);
  const context = useMemo(() => roomId ? roomContext(scenario, playback, roomId) : null, [scenario, playback, roomId]);
  const room = rooms.find(r => r.id === roomId);
  const chosen = context?.tasks.find(t => t.id === taskId) || context?.tasks.find(t => !t.historical && !isTerminal(t.stage)) || context?.tasks.at(-1);
  const people = context?.people || scenario.people.filter(p => !department || p.department === department);
  const agents = context?.agents || scenario.agents.filter(a => !department || a.department === department);
  const taskSet = context?.tasks || allTasks(scenario, playback).filter(t => !department || t.department === department || t.peer === department);
  const published = (context?.memories || allMemories(scenario, playback).filter(m => !department || m.allowedTeams.includes(department))).filter(m => m.status === 'Published');
  const clearDetail = () => { hideAll(); setSelectedEdge(null); setSelectedNode(null); setHoveredId(null); setFocusedId(null); };
  const inspect = (selection: Inspection) => { hideAll(); onInteract?.(); onInspect(selection); };
  const goTeam = (team: Department) => { onInteract?.(); setDepartment(team); setRoomId(undefined); setTaskId(''); clearDetail(); };
  const goRoom = (id: string) => { onInteract?.(); setRoomId(id); setTaskId(''); clearDetail(); };
  const goCompany = () => { onInteract?.(); setDepartment(undefined); setRoomId(undefined); setTaskId(''); clearDetail(); };
  const back = () => { if (roomId) { onInteract?.(); setRoomId(undefined); clearDetail(); } else goCompany(); };
  const graph = context && chosen ? buildRoomGraph(scenario, context, chosen, published.length) : buildOverviewGraph(scenario, playback, department, rooms);
  const edge = graph.edges.find(e => e.id === selectedEdge);
  const node = graph.nodes.find(n => n.id === selectedNode);
  const hoverEdge = graph.edges.find(e => e.id === hovered);
  const hoverNode = graph.nodes.find(n => n.id === hovered);
  const selectEdge = (id: string) => { hideAll(); onInteract?.(); setSelectedEdge(id); setSelectedNode(null); };
  const selectNode = (item: GraphNode) => {
    if (item.kind === 'team' && item.department) return goTeam(item.department);
    if (item.kind === 'room' && !roomId) return goRoom(item.id);
    hideAll(); onInteract?.(); setSelectedNode(item.id); setSelectedEdge(null);
  };
  const active = taskSet.filter(t => !isTerminal(t.stage)).length;
  const pending = taskSet.filter(t => ['Awaiting approval', 'Memory review'].includes(t.stage)).length;
  const title = room ? room.title : department || 'Joon’s Hospital';

  return <section className="collab-explorer" aria-label="Company collaboration map" data-testid="collaboration-explorer" data-level={roomId ? 'room' : department ? 'team' : 'company'}>
    <header className="collab-header">
      <div className="collab-navigation"><button className="collab-back" aria-label="Back in collaboration map" disabled={!department && !roomId} onClick={back}><ArrowLeft />Back</button><nav aria-label="Collaboration map breadcrumb"><button onClick={goCompany} aria-current={!department ? 'page' : undefined}>Hospital</button>{department && <><ChevronRight /><button onClick={() => goTeam(department)} aria-current={!roomId ? 'page' : undefined}>{department}</button></>}{room && <><ChevronRight /><span aria-current="page">Room</span></>}</nav></div>
      <div><h2>Company collaboration map</h2><p>{roomId ? 'Follow a task through accountable people, agents, tools and reviewed knowledge.' : department ? 'Every room this team contributes to—including incoming cross-team work.' : 'Six accountable teams. Open a team, then a room, to follow the identity and data path.'}</p></div>
    </header>
    <div className="collab-layout"><div className="collab-map-column">
      <div className="collab-map-context"><span><span className="collab-eyebrow">{roomId ? 'Room relationships' : department ? 'Team relationships' : 'Organisation relationships'}</span><strong>{title}</strong></span>{roomId && chosen && <label>Trace task<select aria-label="Trace task in room" value={chosen.id} onChange={event => { onInteract?.(); setTaskId(event.target.value); clearDetail(); }}>{context!.tasks.slice().sort((a, b) => b.created.localeCompare(a.created)).map((t, index) => <option key={t.id} value={t.id}>Task {index + 1} · {t.stage} · {masked(t.title)}</option>)}</select></label>}</div>
      <div className="collab-canvas" data-level={roomId ? 'room' : department ? 'team' : 'company'}>
        <svg viewBox={`0 0 980 ${graph.height}`} className="collab-svg" role="group" aria-label={`${title} relationship map. Use Tab to inspect nodes and connections.`}>
          <defs>{(['good', 'attention', 'danger', 'neutral'] as FlowTone[]).map(tone => <marker key={tone} id={`${graphId}-${tone}`} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" className={`collab-arrow tone-${tone}`} /></marker>)}</defs>
          {roomId && <g className="collab-lane-labels"><text x="110" y="24">ACCOUNTABLE PEOPLE</text><text x="365" y="24">BOUND AGENTS</text><text x="610" y="24">ROOM SCOPE</text><text x="845" y="24">TOOLS & KNOWLEDGE</text></g>}
          {graph.edges.map(e => { const source = graph.nodes.find(n => n.id === e.source)!; const target = graph.nodes.find(n => n.id === e.target)!; const d = connectionPath(source, target, e.curved); return <g key={e.id} className={`collab-edge tone-${e.tone} ${selectedEdge === e.id ? 'selected' : ''} ${roomId && !e.task ? 'background' : ''}`} role="button" tabIndex={0} aria-label={`${publicEdgeLabel(e)}: ${e.status}. Private details ${masked(e.detail)}`} data-edge-id={e.id} onClick={() => selectEdge(e.id)} onKeyDown={event => activate(event, () => selectEdge(e.id))} onMouseEnter={() => setHoveredId(e.id)} onMouseLeave={() => setHoveredId(current => current === e.id ? null : current)} onFocus={() => setFocusedId(e.id)} onBlur={() => setFocusedId(current => current === e.id ? null : current)}><title>{publicEdgeLabel(e)}: {e.status}. Private details {masked(e.detail)}</title><path className="collab-edge-hit" d={d}/><path className="collab-edge-visible" d={d} markerEnd={`url(#${graphId}-${e.tone})`} strokeDasharray={e.tone === 'neutral' || e.tone === 'attention' ? '5 5' : undefined}/></g>; })}
          {graph.nodes.map(n => { const Icon = icons[n.kind]; const width = n.width || 180; return <g key={n.id} className={`collab-node ${n.kind} tone-${n.tone || 'neutral'} ${selectedNode === n.id ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={`${n.kind === 'team' ? 'Open team' : n.kind === 'room' && !roomId ? 'Open room' : 'Inspect'} ${visibleNodeLabel(n)}. ${visibleNodeSub(n)}`} data-node={n.id} data-team={n.department} data-room={n.kind === 'room' && !roomId ? n.id : undefined} transform={`translate(${n.x},${n.y})`} onClick={() => selectNode(n)} onKeyDown={event => activate(event, () => selectNode(n))} onMouseEnter={() => setHoveredId(n.id)} onMouseLeave={() => setHoveredId(current => current === n.id ? null : current)} onFocus={() => setFocusedId(n.id)} onBlur={() => setFocusedId(current => current === n.id ? null : current)}><title>{visibleNodeLabel(n)} — {visibleNodeSub(n)}</title><rect x={-width / 2} y="-34" width={width} height="68" rx="9"/><Icon x={-width / 2 + 13} y="-20" width="18" height="18" strokeWidth="1.7"/><text x={-width / 2 + 38} y="-6" className="collab-node-title">{compact(visibleNodeLabel(n), n.kind === 'team' ? 24 : 21)}</text><text x={-width / 2 + 13} y="17" className="collab-node-sub">{compact(visibleNodeSub(n), width > 185 ? 33 : 27)}</text><circle cx={width / 2 - 10} cy="-23" r="3" className="collab-state-dot" /></g>; })}
        </svg>
        {(hoverEdge || hoverNode) && <div className="collab-tooltip" role="status"><strong>{hoverEdge ? publicEdgeLabel(hoverEdge) : hoverNode ? visibleNodeLabel(hoverNode) : ''}</strong><span>{hoverEdge ? `${hoverEdge.status} · Scope ${masked(hoverEdge.scope)}` : hoverNode ? visibleNodeSub(hoverNode) : ''}</span></div>}
        <div className="collab-map-list" aria-label={`${title} relationships list`}>{graph.nodes.filter(n => n.kind !== 'company').map(n => { const Icon = icons[n.kind]; return <button key={n.id} data-team={n.department} data-room={n.kind === 'room' && !roomId ? n.id : undefined} onClick={() => selectNode(n)}><Icon/><span><strong>{visibleNodeLabel(n)}</strong><small>{visibleNodeSub(n)}</small></span><ChevronRight/></button>; })}</div>
      </div>
      <div className="collab-legend">{(['good', 'attention', 'danger', 'neutral'] as FlowTone[]).map(tone => <span key={tone}><i className={`tone-${tone}`}/>{toneLabel[tone]}</span>)}</div>
      {roomId && <details className="collab-connection-list"><summary>Inspect all identity and data connections ({graph.edges.length})</summary>{graph.edges.map(e => <button key={e.id} onClick={() => selectEdge(e.id)}><span className={`collab-tone tone-${e.tone}`}>{e.status}</span><span><strong>{publicEdgeLabel(e)}</strong><small><PrivateText value={e.scope} /></small></span><ArrowRight/></button>)}</details>}
    </div>
    <aside className="collab-inspector" aria-label="Collaboration details">
      <div className="collab-metric-grid"><div><Users/><strong>{people.length}</strong><span>{roomId ? 'Room participants' : 'Team members'}</span></div><div><Bot/><strong>{agents.length}</strong><span>{roomId ? 'Participating agents' : 'Bound agents'}</span></div><div><Workflow/><strong>{roomId ? 1 : rooms.length}</strong><span>{roomId ? 'Shared room' : 'Connected rooms'}</span></div><div><Brain/><strong>{published.length}</strong><span>Reviewed records</span></div></div>
      {edge ? <div className="collab-detail" data-testid="connection-detail"><div className="collab-eyebrow">Selected connection</div><h3>{publicEdgeLabel(edge)}</h3><span className={`collab-tone tone-${edge.tone}`}>{edge.status}</span><PrivateBlock key={edge.id} label="Connection narrative"><p>{edge.detail}</p></PrivateBlock><dl><dt>Permitted scope</dt><dd><PrivateField value={edge.scope} label="permitted scope" /></dd>{edge.agent && <><dt>Mandate</dt><dd><PrivateField value={scenario.agents.find(a => a.id === edge.agent)?.mandate || 'No mandate reference'} label="mandate identifier" /></dd><dt>Passport</dt><dd><PrivateField value={scenario.agents.find(a => a.id === edge.agent)?.passport || 'No Passport reference'} label="Passport identifier" /></dd></>}{edge.owner && <><dt>Accountable human</dt><dd><PrivateField value={personName(scenario, edge.owner)} label="accountable human name" /><button className="collab-text-link" onClick={() => inspect({kind:'human', id:edge.owner!})}>Inspect owner</button></dd></>}{edge.task && <><dt>Exact task</dt><dd><PrivateField value={edge.task.title} label="task title" /><small><PrivateField value={edge.task.id} label="task identifier" /> · {edge.task.stage}</small></dd><dt>Data boundary</dt><dd>{edge.task.department} and {edge.task.peer}. Drafts and approved aggregates; no unrestricted export.</dd></>}</dl>{edge.task && <button className="collab-primary" onClick={() => inspect({kind:'task', id:edge.task!.id})}>Open complete identity trace<ArrowRight/></button>}</div> : node ? <NodeDetail node={node} scenario={scenario} tasks={taskSet} onInspect={inspect}/> : <div className="collab-detail"><div className="collab-eyebrow">At a glance</div><h3>{roomId ? 'A bounded place to work' : department ? `${department} accountability` : 'People own the authority'}</h3><p>{roomId ? 'Every participant retains an accountable human. A room shares context, not unrestricted authority.' : department ? '7 people: one C-level sponsor, one VP, one manager, one team lead and three individual contributors.' : `${scenario.people.length} named people across six teams. The counts are based on actual profiles in this workspace—not an assumed company size.`}</p><div className="collab-status-row"><span>Work in progress</span><strong>{active}</strong></div><div className="collab-status-row"><span>Waiting for a human</span><strong className={pending ? 'tone-attention' : ''}>{pending}</strong></div><div className="collab-note"><ShieldCheck/><span>Context never grants permission. Mandates remain bounded to an action, person and room.</span></div>{chosen && <button className="collab-primary" onClick={() => inspect({kind:'task', id:chosen.id})}>Inspect selected task<ArrowRight/></button>}<p className="collab-help">Select a line to inspect the mandate, owner, data boundary and exact task.</p></div>}
      {roomId && chosen && <div className="collab-current-task"><span className="collab-eyebrow">Selected task</span><strong><PrivateField value={chosen.title} label="selected task title" /></strong><span className={`collab-tone tone-${taskTone(chosen)}`}>{chosen.stage}</span><small>{chosen.calls} tool calls · {chosen.reused} reviewed context reuses</small>{chosen.stage === 'Completed' && <button className="collab-text-link" onClick={() => inspect({kind:'task', id:chosen.id})}><FileText/>View completed output<ArrowRight/></button>}</div>}
    </aside></div>
  </section>;
}

function buildOverviewGraph(scenario: Scenario, playback: Playback, department: Department | undefined, rooms: ReturnType<typeof roomSummaries>) {
  const items = department ? rooms : DEPARTMENTS;
  const nodes: GraphNode[] = [{ id:'center', x:490, y:245, label:department || 'Hospital brain', sub:department ? `${scenario.people.filter(p => p.department === department).length} people · ${scenario.agents.filter(a => a.department === department).length} agents` : `${allMemories(scenario, playback).filter(m => m.status === 'Published').length} reviewed records`, kind:department ? 'team' : 'company', width:200 }];
  const edges: FlowEdge[] = [];
  items.forEach((value, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / items.length;
    const x = 490 + Math.sin(angle) * 332; const y = 245 - Math.cos(angle) * 162;
    if (typeof value === 'string') {
      const active = playback.queue.filter(t => t.department === value && !isTerminal(t.stage)).length;
      const waiting = playback.queue.filter(t => t.department === value && ['Awaiting approval','Memory review'].includes(t.stage)).length;
      const blocked = playback.queue.filter(t => t.department === value && ['Blocked','Rejected'].includes(t.stage)).length;
      const tone:FlowTone = blocked ? 'danger' : waiting ? 'attention' : active ? 'neutral' : 'good';
      nodes.push({id:value,x,y,label:value,sub:`${active} active · ${waiting} waiting · ${blocked} blocked`,kind:'team',department:value as Department,tone,width:224});
      edges.push({id:`team-${value}`,source:'center',target:value,label:`${value} ↔ hospital brain`,detail:'Only reviewed, published records scoped to this team can be reused. Open the team to inspect its collaboration rooms.',scope:'Published knowledge only; no authority transfer',status:waiting ? `${waiting} human reviews pending` : active ? `${active} tasks in progress` : 'No current work pending',tone});
    } else {
      const peer = value.department === department ? value.peer : value.department;
      nodes.push({id:value.id,x,y,label:`${peer} room`,sub:`${value.department === department ? 'Leads' : 'Contributes'} · ${value.active} active · ${value.waiting} review`,kind:'room',tone:value.tone,width:224});
      edges.push({id:`room-${value.id}`,source:'center',target:value.id,label:`${department} ↔ ${peer}`,detail:`${value.tasks.length} tasks link these teams in ${value.id}. Every agent-to-agent request carries its original human and a bounded mandate.`,scope:`${value.department} + ${value.peer} room-scoped context`,status:value.blocked ? `${value.blocked} blocked/rejected` : value.waiting ? `${value.waiting} awaiting review` : `${value.active} in progress`,tone:value.tone,task:value.tasks.filter(t=>!t.historical).at(-1) || value.tasks.at(-1)});
    }
  });
  return {nodes,edges,height:490};
}

function buildRoomGraph(scenario: Scenario, context: ReturnType<typeof roomContext>, task: SimTask, published: number) {
  const height = Math.max(570, context.agents.length * 88 + 95);
  const taskMemory=context.memories.find(m=>m.task===task.id);
  const nodes:GraphNode[] = [{id:'room',x:610,y:height/2,label:'Shared room',sub:task.room,kind:'room',width:166},{id:'memory',x:845,y:height-87,label:'Reviewed memory',sub:`${published} published · scoped reuse`,kind:'memory',width:218,inspect:taskMemory ? {kind:'memory',id:taskMemory.id} : undefined}];
  const edges:FlowEdge[] = [];
  const yAt = (index:number,count:number) => count === 1 ? height/2 : 78 + index*(height-162)/(count-1);
  context.people.forEach((person,index)=>nodes.push({id:person.id,x:110,y:yAt(index,context.people.length),label:person.name,sub:person.role,kind:'human',inspect:{kind:'human',id:person.id}}));
  context.agents.forEach((agent,index)=>{
    nodes.push({id:agent.id,x:365,y:yAt(index,context.agents.length),label:agent.name,sub:`${agent.kind} · ${agent.department}`,kind:'agent',inspect:{kind:'agent',id:agent.id},tone:agent.id === task.agent || agent.id === task.collaborator ? taskTone(task) : 'neutral',width:204});
    edges.push({id:`bind-${agent.id}`,source:agent.owner,target:agent.id,label:`${personName(scenario,agent.owner)} → ${agent.name}`,detail:`Human-to-agent ownership binding. ${agent.name} retains Passport ${agent.passport}; the human remains accountable when the agent delegates.`,scope:'Identity ownership; not an execution approval',status:'Identity bound',tone:'neutral',agent:agent.id,owner:agent.owner,task:agent.id===task.agent||agent.id===task.collaborator?task:undefined});
    edges.push({id:`member-${agent.id}`,source:agent.id,target:'room',label:`${agent.name} → shared room`,detail:`This agent participates in recorded work in ${task.room}. Room context cannot widen ${agent.mandate}.`,scope:'Named room participants and reviewed context only',status:'Room membership',tone:'neutral',agent:agent.id,owner:agent.owner});
  });
  const events = scenario.events.filter(e=>e.task===task.id);
  // The task stage is canonical for playback; do not turn a planned path into a recorded operation.
  const handedOff = ['Collaborating','Awaiting approval','Executing','Memory review','Completed','Rejected'].includes(task.stage);
  edges.push({id:'a2a',source:task.agent,target:task.collaborator,label:'Agent-to-agent scoped handoff',detail:`${personName(scenario,task.agent)} requests a draft review from ${personName(scenario,task.collaborator)}. Original human ${personName(scenario,task.owner)} is retained. Receiving agent cannot delegate onward or increase privilege.`,scope:'Review draft only · no onward delegation',status:handedOff?'Handoff recorded':'Handoff not yet reached',tone:task.stage==='Rejected'?'danger':handedOff?'good':'neutral',task,agent:task.agent,owner:task.owner,curved:true});
  context.departments.forEach((team,index)=>{
    const [product,scope] = toolFor(team).split(' / '); const id=`tool-${team}`;
    nodes.push({id,x:845,y:94+index*125,label:product,sub:scope || 'Scoped tool access',kind:'tool',width:218});
    const primary = task.department===team;
    const executed = primary && (task.calls>0 && ['Executing','Memory review','Completed'].includes(task.stage) || events.some(e=>e.operation==='Approved tool operation'));
    const rejected = primary && ['Blocked','Rejected'].includes(task.stage);
    const waiting = primary && task.stage==='Awaiting approval';
    edges.push({id:`access-${team}`,source:'room',target:id,label:`${team} → ${product}`,detail:primary?`${task.title}. ${executed ? `${task.calls} tool calls recorded for the selected task.` : 'No completed tool operation for this path on the selected task.'} Production changes and unrestricted data export are outside the mandate.`:`${team} tool is associated with this room's recorded work. The selected task does not demonstrate a tool call to this destination.`,scope:scope || toolFor(team),status:rejected?'Operation blocked':waiting?'Waiting for human approval':executed?'Scoped operation recorded':'No operation recorded',tone:rejected?'danger':waiting?'attention':executed?'good':'neutral',task:primary?task:undefined,agent:primary?task.agent:task.collaborator,owner:primary?task.owner:scenario.agents.find(a=>a.id===task.collaborator)?.owner});
  });
  edges.push({id:'publish-memory',source:'room',target:'memory',label:'Reviewed output → hospital brain',detail:taskMemory?.status==='Published'?`Published by ${personName(scenario,taskMemory.reviewer)}. Reusable only by ${taskMemory.allowedTeams.join(' and ')}. Memory can inform a task but cannot authorize one.`:taskMemory?.status==='Rejected'?'The reviewer rejected this proposed memory. It is excluded from future context.':'The result cannot enter reusable company knowledge until a human reviews and publishes it.',scope:taskMemory?.allowedTeams.join(' + ') || `${task.department} + ${task.peer}`,status:taskMemory?.status==='Published'?'Published after review':taskMemory?.status==='Rejected'?'Memory rejected':taskMemory?'Memory awaiting review':'No memory proposed yet',tone:taskMemory?.status==='Published'?'good':taskMemory?.status==='Rejected'?'danger':taskMemory?'attention':'neutral',task,agent:task.agent,owner:taskMemory?.reviewer || task.owner});
  return {nodes,edges,height};
}

function connectionPath(source:GraphNode,target:GraphNode,curved?:boolean) {
  if(curved)return `M ${source.x+source.width!/2},${source.y} C ${source.x+210},${source.y} ${target.x+210},${target.y} ${target.x+target.width!/2},${target.y}`;
  const dx=target.x-source.x; const dy=target.y-source.y;
  if(Math.abs(dx)>Math.abs(dy)/1.8){const x1=source.x+Math.sign(dx)*(source.width||180)/2;const x2=target.x-Math.sign(dx)*(target.width||180)/2;return `M${x1},${source.y} C${(x1+x2)/2},${source.y} ${(x1+x2)/2},${target.y} ${x2},${target.y}`;}
  return `M${source.x},${source.y+Math.sign(dy)*34} C${source.x},${(source.y+target.y)/2} ${target.x},${(source.y+target.y)/2} ${target.x},${target.y-Math.sign(dy)*34}`;
}

function NodeDetail({node,scenario,tasks,onInspect}:{node:GraphNode;scenario:Scenario;tasks:SimTask[];onInspect:(selection:Inspection)=>void}) {
  const agent=scenario.agents.find(a=>a.id===node.id);const person=scenario.people.find(p=>p.id===node.id);
  return <div className="collab-detail"><span className="collab-eyebrow">Selected {node.kind}</span><h3>{isPrivateNode(node) ? <PrivateField value={node.label} label={`${node.kind} name`} /> : node.label}</h3><p>{node.kind === 'room' && node.sub.startsWith('ROOM-') ? <PrivateField value={node.sub} label="room identifier" /> : node.sub}</p>{agent&&<><div className="collab-runtime"><ProductMark product={agent.runtime} size="small"/><span>{agent.runtime} runtime</span></div><dl><dt>Accountable human</dt><dd><PrivateField value={personName(scenario,agent.owner)} label="accountable human name" /></dd><dt>Passport</dt><dd><PrivateField value={agent.passport} label="Passport identifier" /></dd><dt>Mandate</dt><dd><PrivateField value={agent.mandate} label="mandate identifier" /></dd><dt>Allowed work</dt><dd><PrivateField value={agent.allowed.join('; ')} label="allowed work" /></dd><dt>Denied actions</dt><dd><PrivateField value={agent.denied.join('; ')} label="denied actions" /></dd></dl></>}{person&&<dl><dt>Team</dt><dd>{person.department}</dd><dt>Reports to</dt><dd>{person.manager ? <PrivateField value={personName(scenario,person.manager)} label="manager name" /> : 'Executive accountability'}</dd><dt>Owned agents</dt><dd>{scenario.agents.filter(a=>a.owner===person.id).length}</dd><dt>Tasks in this view</dt><dd>{tasks.filter(t=>t.owner===person.id).length}</dd></dl>}{node.kind==='tool'&&<p>Tool identity and permitted operation are displayed from room records. Select its incoming connection for action-level evidence; listing a tool is not proof of external enforcement.</p>}{node.kind==='memory'&&<p>Published records retain the originating task, accountable owner and reviewer. Unreviewed and rejected records do not enter reusable context.</p>}{node.kind==='company'&&<p>Knowledge is contributed by six teams, with publication decisions and team scope attached to each record. Open a team to follow its rooms.</p>}{node.inspect&&<button className="collab-primary" onClick={()=>onInspect(node.inspect!)}>Open identity details<ArrowRight/></button>}</div>;
}
