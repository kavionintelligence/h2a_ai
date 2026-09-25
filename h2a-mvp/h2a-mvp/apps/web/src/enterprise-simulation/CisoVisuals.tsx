import { ArrowRight, Bot, Building2, CheckCircle2, ClipboardCheck, Fingerprint, GitBranch, ShieldCheck, Users } from 'lucide-react';
import { DEPARTMENTS, allTasks, type Scenario, type Playback, type SimEvent, type SimTask } from './model';
import './ciso-visuals.css';

type Inspect=(selection:{kind:'task'|'human';id:string})=>void;
export function OrganizationSummary({scenario,inspect}:{scenario:Scenario;inspect:Inspect}) {
  const levels=['C-level','VP','Manager','Team lead','Member'] as const;
  const titles=['Executive sponsors','Vice presidents','Managers','Team leads','Team members'];
  const [chiefs,vps,managers,leads,members]=levels.map(level=>scenario.people.filter(p=>p.level===level));
  const groups=[chiefs,vps,managers,leads,members];
  return <section className="ciso-visual org-authority-flow" aria-label="Hospital authority hierarchy"><header><span><Users/>Accountability, from board to keyboard</span><small>42 people · 30 shared agents · 18 personal agents</small></header><div className="ciso-authority-chain">{groups.map((people,index)=><div key={titles[index]}>{index>0&&<ArrowRight aria-hidden="true"/>}<details><summary><strong>{people.length}</strong><span>{titles[index]}</span><small>{index===3?'Own the 30 shared agents':index===4?'One personal agent each':'Oversight · no personal agents'}</small></summary><div>{people.map(p=><button key={p.id} onClick={()=>inspect({kind:'human',id:p.id})}>{p.name}<small>{p.department}</small></button>)}</div></details></div>)}</div></section>;
}

export function TaskStageFlow({tasks,select}:{tasks:SimTask[];select:(stage:string)=>void}) {
  const groups=[{label:'Identity & context',stages:['Queued','Identity bound','Mandate checked','Context retrieved'],tone:'blue'}, {label:'A2A collaboration',stages:['Collaborating'],tone:'blue'}, {label:'Human gate',stages:['Awaiting approval','Memory review'],tone:'amber'}, {label:'Tool execution',stages:['Executing'],tone:'blue'}, {label:'Completed',stages:['Completed'],tone:'green'}, {label:'Stopped',stages:['Blocked','Rejected'],tone:'red'}];
  return <section className="ciso-visual" aria-label="Current task lifecycle"><header><span><GitBranch/>Current batch · where work is now</span><small>{tasks.length} tasks · counts do not overlap</small></header><div className="ciso-stage-flow">{groups.map(group=>{const matching=tasks.filter(t=>group.stages.includes(t.stage));return <button className={`cv-${group.tone}`} key={group.label} onClick={()=>select(matching[0]?.stage||group.stages[0])}><strong>{matching.length}</strong><span>{group.label}</span><div className="cv-track"><i style={{width:`${matching.length/Math.max(1,tasks.length)*100}%`}}/></div></button>;})}</div></section>;
}

export function DecisionSummary({scenario,playback,inspect}:{scenario:Scenario;playback:Playback;inspect:Inspect}) {
  const events=[...scenario.events,...playback.events];
  const action=events.filter(e=>e.operation==='Human approved exact action');
  const reviews=events.filter(e=>e.operation==='A2A review returned');
  const memory=events.filter(e=>e.operation==='Reviewed memory published');
  const all=allTasks(scenario,playback);
  const waiting=playback.queue.filter(t=>['Awaiting approval','Memory review'].includes(t.stage));
  const cards=[{title:'Exact actions approved',events:action,Icon:ShieldCheck,tone:'green',note:'Named human · one action only'},{title:'Cross-team agent reviews',events:reviews,Icon:GitBranch,tone:'blue',note:'Agent reviews, not human approvals'},{title:'Knowledge publications',events:memory,Icon:ClipboardCheck,tone:'green',note:'Separate memory review decision'}];
  return <section className="ciso-visual" aria-label="Human decision evidence"><header><span><Fingerprint/>Human judgment stays separate from delegation</span><small>Retained history + current batch</small></header><div className="ciso-decision-proof"><div className="cv-waiting"><strong>{waiting.length}</strong><span>waiting for a human</span><small>No execution or reuse past the applicable gate.</small></div>{cards.map(c=><button className={`cv-${c.tone}`} key={c.title} disabled={!c.events.length} onClick={()=>{const event=[...c.events].reverse().find(e=>all.some(t=>t.id===e.task));if(event)inspect({kind:'task',id:event.task});}}><c.Icon/><strong>{c.events.length}</strong><span>{c.title}</span><small>{c.note}</small><em>Inspect latest trace<ArrowRight/></em></button>)}</div><footer>Receiving-team human approvals are not recorded by this workflow. A2A review does not substitute for that control.</footer></section>;
}

export function EvidencePulse({events,select}:{events:SimEvent[];select:(kind:string)=>void}) {
  const groups=[{label:'Identity',kind:'Identity',matches:(e:SimEvent)=>e.operation==='Human → agent binding',tone:'blue'},{label:'Authority',kind:'Authority',matches:(e:SimEvent)=>e.operation==='Authority evaluated',tone:'blue'},{label:'A2A',kind:'A2A',matches:(e:SimEvent)=>e.operation.startsWith('A2A'),tone:'blue'},{label:'Human',kind:'Human',matches:(e:SimEvent)=>e.operation.startsWith('Human'),tone:'amber'},{label:'Tool',kind:'Tool',matches:(e:SimEvent)=>e.operation==='Approved tool operation',tone:'green'},{label:'Memory',kind:'Memory',matches:(e:SimEvent)=>/memory/i.test(e.operation),tone:'green'},{label:'Blocked',kind:'Blocked',matches:(e:SimEvent)=>e.operation.includes('blocked'),tone:'red'}];
  const max=Math.max(1,...groups.map(g=>events.filter(g.matches).length));
  const days=[...new Set(events.map(e=>e.timestamp.slice(0,10)))].sort().slice(-31);
  const byDay=days.map(day=>({day,count:events.filter(e=>e.timestamp.startsWith(day)).length}));
  const peak=Math.max(1,...byDay.map(d=>d.count));
  return <section className="ciso-visual cv-evidence" aria-label="Evidence coverage by event type"><header><span><ShieldCheck/>Evidence, by control boundary</span><small>Counts represent records, not independent assurance</small></header><div className="cv-evidence-layout"><div className="cv-evidence-bars">{groups.map(g=>{const count=events.filter(g.matches).length;return <button className={`cv-${g.tone}`} onClick={()=>select(g.kind)} key={g.label}><span>{g.label}</span><div className="cv-track"><i style={{width:`${count/max*100}%`}}/></div><strong>{count}</strong></button>;})}</div><div className="cv-calendar"><span>Activity fingerprint · {days.length} recorded days</span><div role="img" aria-label={byDay.map(d=>`${d.day}: ${d.count} events`).join('; ')}>{byDay.map(d=><span key={d.day} title={`${d.day}: ${d.count} records`} style={{background:d.count/peak>.75?'#256bd0':d.count/peak>.4?'#87b4ef':'#dceafd'}}>{d.day.slice(-2)}</span>)}</div><small>Darker cells mean more records, not more risk. Select an event category to investigate below.</small></div></div></section>;
}
