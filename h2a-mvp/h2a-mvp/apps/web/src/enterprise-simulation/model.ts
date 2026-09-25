// Isolated, deterministic scenario engine. Never invokes a collector, CLI, or live API.
export const SIM_VERSION = 2;
export const ORGANIZATION_NAME = 'Joon’s Hospital';
export const ORG_CISO_NAME = 'Neha Sharma';
export const DEPARTMENTS = ['Technology', 'Cybersecurity', 'Design', 'Sales', 'Marketing', 'Management'] as const;
export type Department = typeof DEPARTMENTS[number];
export type Stage = 'Queued' | 'Identity bound' | 'Mandate checked' | 'Context retrieved' | 'Collaborating' | 'Awaiting approval' | 'Executing' | 'Memory review' | 'Completed' | 'Blocked' | 'Rejected';
export const STAGES: Stage[] = ['Queued', 'Identity bound', 'Mandate checked', 'Context retrieved', 'Collaborating', 'Awaiting approval', 'Executing', 'Memory review', 'Completed'];
export type Person = { id: string; name: string; role: string; department: Department | 'Executive'; manager?: string; level: 'C-level' | 'VP' | 'Manager' | 'Team lead' | 'Member' };
export type SimAgent = { id: string; name: string; department: Department; owner: string; kind: 'Team' | 'Personal'; runtime: 'claude' | 'codex' | 'gemini' | 'antigravity'; passport: string; mandate: string; allowed: string[]; denied: string[] };
export type SimTask = { id: string; title: string; department: Department; peer: Department; owner: string; agent: string; collaborator: string; room: string; stage: Stage; created: string; updated: string; risk: 'Standard' | 'Sensitive' | 'Restricted'; baseline: number; calls: number; reused: number; memoryIds: string[]; result: string; cycle: number; historical: boolean };
export type SimEvent = { id: string; timestamp: string; task: string; department: Department; actor: string; operation: string; target: string; outcome: string; authority: string; detail: string; origin: 'Historical fixture' | 'Scenario playback' | 'Presenter decision' };
export type SimMemory = { id: string; title: string; department: Department; allowedTeams: Department[]; task: string; room: string; reviewer: string; status: 'Proposed' | 'Published' | 'Rejected'; content: string; created: string; version: number };
export type Scenario = { anchor: string; people: Person[]; agents: SimAgent[]; tasks: SimTask[]; events: SimEvent[]; memories: SimMemory[]; population: number[] };
export type Playback = { version: number; anchor: string; tick: number; cycle: number; queue: SimTask[]; completed: SimTask[]; events: SimEvent[]; memories: SimMemory[]; discovery: Record<string, 'Unreviewed' | 'Authorized' | 'Contained'> };
const DAY = 86400000;
const C_LEVELS = [
  ['Arvind Menon','Chief technology officer'],
  [ORG_CISO_NAME,'Chief information security officer'],
  ['Aparna Reddy','Chief experience officer'],
  ['Rajesh Bansal','Chief commercial officer'],
  ['Lakshmi Krishnan','Chief marketing officer'],
  ['Sanjay Joon','Chief operating officer'],
] as const;
const NAMES = [['Priya Desai','Arjun Mehta','Maya Rao','Rohan Kulkarni','Naina Patel','Om Prakash'],['Ravi Shah','Aditi Nair','Kavya Iyer','Ishaan Khan','Sana Ali','Dev Malhotra'],['Ananya Rao','Nikhil Joshi','Ayesha Shaikh','Isha Bhat','Tejas Patil','Avani Shah'],['Karan Kapoor','Farah Qureshi','Vikram Sinha','Garima Jain','Eshan Gupta','Meera Pillai'],['Leela Singh','Deepak Saxena','Charu Mishra','Lalit Yadav','Anika Das','Madhav Rao'],['Anita Rao','Aditya Seth','Sameer Kulkarni','Ekta Chopra','Rahul Verma','Eesha Nair']];
const ROLES = [['Hospital portal release planner','Code reviewer','Service API specialist','Reliability analyst','Engineering coordinator'],['Threat analyst','Policy reviewer','Exposure investigator','Detection engineer','Evidence curator'],['Staff research synthesizer','Accessibility reviewer','Design-system steward','Portal prototype planner','UX evaluator'],['Partnership researcher','Proposal writer','Contract reviewer','Pipeline analyst','Partner liaison'],['Campaign planner','Content reviewer','Audience analyst','Brand steward','Outreach researcher'],['Board briefing agent','Operations analyst','Risk coordinator','Resource planner','Strategy synthesizer']];
const TASKS = [['Prepare hospital staff portal release','Review hospital service API changes','Investigate staff portal response time','Create hospital platform migration readiness report','Draft hospital platform dependency upgrade plan'],['Investigate unusual hospital AI data access','Review hospital agent privilege drift','Assess staff portal release security controls','Triage unregistered hospital coding assistant','Prepare hospital incident response evidence'],['Review staff onboarding accessibility','Synthesize hospital staff usability research','Publish hospital portal interface handoff','Evaluate hospital operations dashboard usability','Review hospital design-system adoption'],['Prepare hospital partnership account brief','Review hospital partner security questionnaire','Draft corporate wellness partnership renewal','Analyze hospital partnership opportunity risks','Prepare hospital services presentation brief'],['Review hospital outreach campaign claims','Draft hospital visitor information brief','Analyze hospital outreach campaign performance','Prepare hospital service awareness messaging','Review hospital marketing data permissions'],['Prepare hospital board AI oversight brief','Review hospital departmental delivery risks','Reconcile hospital quarterly operating priorities','Assess hospital cross-team resource requests','Compile hospital executive operating review']];
const TOOLS = ['GitHub / repository.read', 'Microsoft Sentinel / events.search', 'Figma / components.read', 'Salesforce / accounts.read', 'Google Analytics / aggregates.read', 'Microsoft SharePoint / initiatives.read'];
export const DISCOVERIES = [
  {id:'DISC-01',product:'claude' as const,name:'Claude Code',department:'Technology' as Department,source:'Managed endpoint',reason:'Owner assignment needs review',risk:'Medium'},
  {id:'DISC-02',product:'codex' as const,name:'Codex CLI',department:'Technology' as Department,source:'CLI inventory',reason:'Registered runtime, read-only scope',risk:'Low'},
  {id:'DISC-03',product:'gemini' as const,name:'Gemini',department:'Marketing' as Department,source:'Browser connector',reason:'Unapproved external data destination',risk:'High'},
  {id:'DISC-04',product:'antigravity' as const,name:'Google Antigravity',department:'Design' as Department,source:'Installed application',reason:'Installation observed; activity unverified',risk:'Medium'},
  {id:'DISC-05',product:'custom' as const,name:'Unregistered partnership assistant',department:'Sales' as Department,source:'Scenario runtime telemetry',reason:'No accountable owner or Passport',risk:'High'},
  {id:'DISC-06',product:'custom' as const,name:'Silent research worker',department:'Management' as Department,source:'Heartbeat monitor',reason:'Expected heartbeat missing in scenario',risk:'Medium'},
];
function rng(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
const terminal = (stage: Stage) => ['Completed','Blocked','Rejected'].includes(stage);
export const isTerminal = terminal;
export function personName(s: Scenario, id: string) { return s.people.find(p => p.id === id)?.name || s.agents.find(a => a.id === id)?.name || id; }
export function toolFor(department: Department) { return TOOLS[DEPARTMENTS.indexOf(department)]; }
export function makeScenario(anchor = new Date().toISOString().slice(0, 10)): Scenario {
  const people: Person[] = [];
  const agents: SimAgent[] = [];
  DEPARTMENTS.forEach((department,d) => {
    people.push({id:`H-${d}-C`,name:C_LEVELS[d][0],role:C_LEVELS[d][1],department,level:'C-level'});
    ['VP','Manager','Team lead','Member','Member','Member'].forEach((level,i) => people.push({id:`H-${d}-${i}`,name:NAMES[d][i],role:i === 0 ? `VP, ${department}` : i === 1 ? `${department} manager` : i === 2 ? `${department} team lead` : `${department} specialist`, department,level:level as Person['level'],manager:i === 0 ? `H-${d}-C` : `H-${d}-${i > 2 ? 2 : i-1}`}));
    for(let i=0;i<8;i++) agents.push({id:`AG-${d}-${i}`,name:i<5?ROLES[d][i]:`${NAMES[d][i-2].split(' ')[0]}'s assistant`,department,owner:`H-${d}-${i<5?2:i-2}`,kind:i<5?'Team':'Personal',runtime:(['codex','claude','gemini','antigravity'] as const)[(d+i)%4],passport:`SIM-PASS-${d}-${i}`,mandate:`SIM-MND-${d}-${i}`,allowed:['Read department-scoped records','Draft bounded output','Delegate scoped subtask','Propose reviewed memory'],denied:['Direct production changes','Unapproved external export','Access outside room scope','Publish memory without review']});
  });
  const s: Scenario = {anchor,people,agents,tasks:[],events:[],memories:[],population:DEPARTMENTS.map(department => people.filter(p=>p.department===department).length)};
  const random = rng(604821); const start = Date.parse(`${anchor}T00:00:00Z`);
  for(let day=0;day<30;day++) {
    const count = 10+Math.floor(random()*11);
    for(let n=0;n<count;n++) {
      const index = s.tasks.length; const d = Math.floor(random()*6); const a = d*8+Math.floor(random()*8);
      const created = new Date(start-(30-day)*DAY+(9*60+n*22)*60000).toISOString();
      const task = makeTask(s,`HIST-${String(index+1).padStart(4,'0')}`,a,index,created,0,true);
      const status = random(); task.stage = status < .07 ? 'Blocked' : status < .12 ? 'Rejected' : 'Completed';
      task.updated = new Date(Date.parse(created)+900000).toISOString();
      const eligible = s.memories.filter(m => m.status==='Published' && m.allowedTeams.includes(task.department) && m.created < task.created);
      // Explicit model, not a measured causal result: reuse opportunity rises with scenario maturity.
      task.reused = task.stage==='Blocked'?0:Math.min(eligible.length,Math.floor(day/6),5);
      task.memoryIds = eligible.slice(-task.reused || eligible.length).map(m=>m.id);
      if(!task.reused)task.memoryIds=[];
      task.calls = task.stage==='Completed' ? task.baseline-task.reused : 0;
      task.result = resultFor(task);
      s.tasks.push(task);
      const steps = task.stage==='Blocked' ? [0,1,2] : task.stage==='Rejected' ? [0,1,2,3,4,5] : [0,1,2,3,4,5,6,7,8];
      steps.forEach((step,i) => {const when=new Date(Date.parse(created)+i*90000).toISOString();if(step===5)s.events.push(replyEvent(s,task,when,`E-${task.id}-reply`,'Historical fixture'));if(step===6)s.events.push(approvalEvent(s,task,when,`E-${task.id}-approved`,'Historical fixture'));s.events.push(eventFor(s,task,STAGES[step],when,`E-${task.id}-${i}`,'Historical fixture'));});
      if(task.stage !== 'Completed') s.events.push(eventFor(s,task,task.stage,task.updated,`E-${task.id}-end`,'Historical fixture'));
      if(task.stage==='Completed') s.memories.push(memoryFor(s,task,'Published'));
    }
  }
  return s;
}
function makeTask(s: Scenario,id:string,agentIndex:number,index:number,created:string,cycle:number,historical:boolean): SimTask {
  const agent=s.agents[agentIndex%s.agents.length]; const d=DEPARTMENTS.indexOf(agent.department); const peer=DEPARTMENTS[(d+1+(index%3))%6];
  return {id,title:TASKS[d][index%5],department:agent.department,peer,owner:agent.owner,agent:agent.id,collaborator:s.agents.find(a=>a.department===peer&&a.kind==='Team')!.id,room:`ROOM-${d}-${DEPARTMENTS.indexOf(peer)}`,stage:'Queued',created,updated:created,risk:index%9===0?'Restricted':index%3===0?'Sensitive':'Standard',baseline:8,calls:0,reused:0,memoryIds:[],result:'',cycle,historical};
}
export function initialPlayback(s: Scenario): Playback {
  const p: Playback={version:SIM_VERSION,anchor:s.anchor,tick:0,cycle:1,queue:[],completed:[],events:[],memories:[],discovery:{}};
  for(let i=0;i<20;i++) {
    const task=makeTask(s,`LIVE-1-${String(i+1).padStart(2,'0')}`,i*7,i,new Date(Date.parse(`${s.anchor}T09:00:00Z`)-(i%8)*60000).toISOString(),1,false);
    p.queue.push(task);
    // Start with an inspectable pipeline, including work held for human review.
    for(let step=0;step<=i%8;step++) progress(s,p,task,STAGES[step],'Scenario playback',new Date(Date.parse(task.created)+step*60000).toISOString());
  }
  return p;
}
export function eventFor(s:Scenario,t:SimTask,stage:Stage,timestamp:string,id:string,origin:SimEvent['origin']):SimEvent {
  const agent=s.agents.find(a=>a.id===t.agent)!; const peer=s.agents.find(a=>a.id===t.collaborator)!;
  const operations: Record<Stage,[string,string,string]>={
    Queued:['Task requested',t.owner,`${t.title}. Scope: ${t.department} → ${t.peer}.`],
    'Identity bound':['Human → agent binding',t.owner,`${personName(s,t.owner)} is accountable for ${agent.name}; Passport ${agent.passport}.`],
    'Mandate checked':['Authority evaluated',t.agent,`Mandate ${agent.mandate}: scoped reads and drafts only. External exports and production writes denied.`],
    'Context retrieved':['Reviewed context retrieved',t.agent,t.reused?`${t.reused} published records reused (${t.memoryIds.join(', ')}); unreviewed memory excluded.`:'No eligible reviewed context reused; collect fresh scoped evidence.'],
    Collaborating:['A2A scoped handoff',t.agent,`Delegate a review to ${peer.name} (${t.peer}), accountable to ${personName(s,peer.owner)}. Child scope: review draft only; no onward delegation, original human ${personName(s,t.owner)} retained. ${peer.passport} / ${peer.mandate}.`],
    'Awaiting approval':['Human approval requested',t.agent,`Hold exact action: ${t.title}. No execution while awaiting a decision.`],
    Executing:['Approved tool operation',t.agent,`${toolFor(t.department)}; ${t.calls} modeled calls. Exact request approval applies only to ${t.id}.`],
    'Memory review':['Memory proposed',t.agent,'Draft outcome is excluded from reusable context until an authorized reviewer publishes it.'],
    Completed:['Reviewed memory published',`H-${DEPARTMENTS.indexOf(t.department)}-2`,'Outcome completed; reviewer released scoped knowledge for future rooms.'],
    Blocked:['Out-of-scope action blocked',t.agent,'Scenario policy denied production.write / unrestricted export. No tool operation executed.'],
    Rejected:['Human rejected request',t.owner,'Exact request rejected. No tool operation executed and no memory published.'],
  };
  const [operation,actor,detail]=operations[stage];
  return {id,timestamp,task:t.id,department:t.department,actor,operation,target:stage==='Collaborating'?t.collaborator:stage==='Executing'?toolFor(t.department):t.room,outcome:stage,authority:agent.mandate,detail,origin};
}
function resultFor(t:SimTask) {
  if(t.stage==='Blocked')return 'Prevented an out-of-scope action; no production change or external export occurred.';
  if(t.stage==='Rejected')return 'Reviewer rejected this request; execution stopped.';
  const details:Record<Department,string>={Technology:'Hospital platform checklist: API compatibility reviewed; rollback owner assigned; production deployment remains a separate human decision.',Cybersecurity:'Hospital security assessment: department-scoped evidence reviewed; privilege boundary checked; restricted export attempt routed to an accountable reviewer.',Design:'Hospital staff interface handoff: keyboard flow, input labels and contrast reviewed; unresolved usability questions retained with owners; no patient identifiers shared.',Sales:'Hospital partnership brief: approved service descriptions and security responses assembled; pricing and contractual commitments require separate commercial approval.',Marketing:'Hospital outreach brief: approved service messaging reused; audience evidence aggregated; unsupported clinical or security claims excluded from publication.',Management:'Hospital operating brief: cross-team dependencies summarized; delivery risks assigned; funding and risk acceptance retained as human decisions.'};
  return `${t.title}. ${details[t.department]} Cross-team review: ${t.peer}. ${t.calls} modeled tool calls; ${t.reused} calls avoided through reviewed context.`;
}
function approvalEvent(s:Scenario,t:SimTask,timestamp:string,id:string,origin:SimEvent['origin']):SimEvent{return {...eventFor(s,t,'Awaiting approval',timestamp,id,origin),actor:t.owner,operation:'Human approved exact action',outcome:'Approved',target:t.id,detail:`${personName(s,t.owner)} approved only ${t.title} (${t.id}) within ${t.room}. The approval cannot authorize a different action or expand the mandate.`};}
function replyEvent(s:Scenario,t:SimTask,timestamp:string,id:string,origin:SimEvent['origin']):SimEvent {const peer=s.agents.find(a=>a.id===t.collaborator)!;return {...eventFor(s,t,'Collaborating',timestamp,id,origin),actor:peer.id,target:t.agent,operation:'A2A review returned',outcome:'Review returned',authority:peer.mandate,detail:`${peer.name} returned a scoped review to ${personName(s,t.agent)} in ${t.room}. Owner ${personName(s,peer.owner)}; originating human ${personName(s,t.owner)} retained. Response: review complete; flagged changes require the exact-action approval, no onward delegation.`};}
function memoryFor(s:Scenario,t:SimTask,status:SimMemory['status']):SimMemory {return {id:`MEM-${t.id}`,title:`${t.title} — reviewed guidance`,department:t.department,allowedTeams:[t.department,t.peer],task:t.id,room:t.room,reviewer:`H-${DEPARTMENTS.indexOf(t.department)}-2`,status,content:`${t.result || resultFor(t)} Reuse only within ${t.department} and ${t.peer}; revalidate fresh operational facts. Never reuse this record as execution authority.`,created:t.updated,version:t.cycle||1};}
function progress(s:Scenario,p:Playback,t:SimTask,next:Stage,origin:SimEvent['origin'],at?:string) {
  t.stage=next; t.updated=at||new Date(Date.parse(`${p.anchor}T09:00:00Z`)+p.tick*60000).toISOString();
  if(next==='Context retrieved') {
    const eligible=[...s.memories,...p.memories].filter(m=>m.status==='Published'&&m.allowedTeams.includes(t.department)&&m.created<=t.updated);
    t.reused=Math.min(5,eligible.length);t.memoryIds=eligible.slice(-t.reused||eligible.length).map(m=>m.id);if(!t.reused)t.memoryIds=[];
  }
  if(next==='Executing'){t.calls=t.baseline-t.reused;p.events.push(approvalEvent(s,t,t.updated,`EV-${t.id}-${p.tick}-approved`,origin));}
  if(next==='Awaiting approval')p.events.push(replyEvent(s,t,t.updated,`EV-${t.id}-${p.tick}-reply`,origin));
  if(next==='Memory review'){t.result=resultFor(t);p.memories.push(memoryFor(s,t,'Proposed'));}
  if(next==='Completed'){t.result=resultFor(t);const memory=p.memories.find(m=>m.task===t.id);if(memory){memory.status='Published';memory.created=t.updated;}else p.memories.push(memoryFor(s,t,'Published'));}
  if(next==='Rejected'||next==='Blocked'){t.calls=0;t.result=resultFor(t);}
  p.events.push(eventFor(s,t,next,t.updated,`EV-${t.id}-${p.tick}-${p.events.length}`,origin));
}
/** Exactly one deterministic transition. No timers, network, model use or live data inside engine. */
export function advance(s:Scenario,previous:Playback,autoReview=true):Playback {
  const p=structuredClone(previous);p.tick++;
  const eligible=p.queue.filter(t=>!terminal(t.stage)&&(autoReview||!['Awaiting approval','Memory review'].includes(t.stage)));
  if(!eligible.length) {
    if(p.queue.some(t=>!terminal(t.stage)))return p;
    p.completed=[...p.completed,...p.queue].slice(-80);p.cycle++;
    p.queue=Array.from({length:20},(_,i)=>makeTask(s,`LIVE-${p.cycle}-${String(i+1).padStart(2,'0')}`,i*7+p.cycle-1,i+p.cycle,new Date(Date.parse(`${p.anchor}T09:00:00Z`)+p.tick*60000).toISOString(),p.cycle,false));
    p.events=p.events.slice(-900);p.memories=p.memories.slice(-160);return p;
  }
  const task=eligible[p.tick%eligible.length];
  // One guardrail failure in each cohort. Other tasks require action and memory decisions.
  const next=task.stage==='Mandate checked'&&task.risk==='Restricted'?'Blocked':STAGES[STAGES.indexOf(task.stage)+1];
  progress(s,p,task,next,'Scenario playback');return p;
}
export function decide(s:Scenario,previous:Playback,taskId:string,approve:boolean):Playback {
  const current=previous.queue.find(t=>t.id===taskId);
  if(!current||!['Awaiting approval','Memory review'].includes(current.stage))return previous;
  const p=structuredClone(previous);p.tick++;const task=p.queue.find(t=>t.id===taskId)!;
  if(task.stage==='Memory review'&&!approve){const memory=p.memories.find(m=>m.task===task.id);if(memory)memory.status='Rejected';task.stage='Completed';task.updated=new Date(Date.parse(`${p.anchor}T09:00:00Z`)+p.tick*60000).toISOString();task.result='Task completed; proposed memory rejected and excluded from future context.';p.events.push({...eventFor(s,task,'Memory review',task.updated,`EV-${task.id}-${p.tick}-review`,'Presenter decision'),operation:'Memory rejected',detail:task.result,outcome:'Rejected'});return p;}
  progress(s,p,task,approve?(task.stage==='Memory review'?'Completed':'Executing'):'Rejected','Presenter decision');return p;
}
export function allTasks(s:Scenario,p:Playback){return [...s.tasks,...p.completed,...p.queue];}
export function classifyObservation(s:Scenario,previous:Playback,id:string,status:'Authorized'|'Contained'):Playback {
  const observation=DISCOVERIES.find(d=>d.id===id);if(!observation)return previous;
  const p=structuredClone(previous);p.tick++;p.discovery[id]=status;
  p.events.push({id:`DISC-E-${id}-${p.tick}`,timestamp:new Date(Date.parse(`${p.anchor}T09:00:00Z`)+p.tick*60000).toISOString(),task:id,department:observation.department,actor:`H-${DEPARTMENTS.indexOf(observation.department)}-2`,operation:`Human ${status.toLowerCase()} discovery`,target:observation.name,outcome:status,authority:'SIM-DISCOVERY-REVIEW',detail:`Presenter ${status.toLowerCase()} the fictional ${observation.name} observation. Responsible owner: ${personName(s,`H-${DEPARTMENTS.indexOf(observation.department)}-2`)}. No live endpoint changed.`,origin:'Presenter decision'});
  return p;
}
export function allMemories(s:Scenario,p:Playback){return [...s.memories,...p.memories];}
export function metrics(s:Scenario,p:Playback){const tasks=allTasks(s,p);const done=tasks.filter(t=>t.stage==='Completed');const calls=done.reduce((sum,t)=>sum+t.calls,0);const baseline=done.reduce((sum,t)=>sum+t.baseline,0);return {tasks:tasks.length,completed:done.length,calls,baseline,avoided:baseline-calls,published:allMemories(s,p).filter(m=>m.status==='Published').length,pending:p.queue.filter(t=>['Awaiting approval','Memory review'].includes(t.stage)).length,blocked:tasks.filter(t=>t.stage==='Blocked').length};}
export function dailySeries(s:Scenario){return Array.from({length:30},(_,i)=>{const date=new Date(Date.parse(`${s.anchor}T00:00:00Z`)-(30-i)*DAY).toISOString().slice(0,10);const tasks=s.tasks.filter(t=>t.created.startsWith(date));const complete=tasks.filter(t=>t.stage==='Completed');return {date,tasks:tasks.length,calls:complete.reduce((n,t)=>n+t.calls,0),baseline:complete.length*8,memory:s.memories.filter(m=>m.created.slice(0,10)<=date).length,reused:complete.reduce((n,t)=>n+t.reused,0)};});}
