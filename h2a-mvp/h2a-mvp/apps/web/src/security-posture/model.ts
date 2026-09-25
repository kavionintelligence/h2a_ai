import type { Agent, Snapshot, DiscoveryScan } from '../../../governance/contracts';
import { allMemories, personName, type Scenario, type Playback } from '../enterprise-simulation/model';
import { buildEstate } from '../enterprise-simulation/estate-model';

export type Destination = { page?: 'discovery'|'estate'|'decisions'|'operations'|'assurance'|'trace'|'administration'; kind?: 'agent'|'approval'|'memory'|'discovery'|'task'|'finding'; id?: string };
export type Concern = { id:string; severity:'High'|'Attention'|'Unknown'; title:string; impact:string; owner:string; evidence:string; action:string; target:Destination; boundary:string };
export type Posture = { mode:'Workspace evidence'|'Synthetic scenario'; scope:string; observed:number; observedLabel?:string; registered:number; owned:number; authority:number; waiting:number; memory:number; proposed:number; integrity:string; scan:string; concerns:Concern[]; sources:Array<{name:string;status:string;detail:string}>; evaluated:string };
export const FRESHNESS_HOURS = 24;
export function freshness(value:string|null|undefined, now=Date.now()) {
  if(!value)return 'Not observed';
  const time=Date.parse(value);
  if(!Number.isFinite(time)||time>now+300000)return 'Invalid timestamp';
  return now-time>FRESHNESS_HOURS*3600000?'Stale':'Recent';
}
export function expired(value:string|undefined,now:number){return Boolean(value && (!Number.isFinite(Date.parse(value)) || Date.parse(value)<=now));}
export function authorityIssue(a:Agent,now=Date.now()):string|null {
  if(!a.owner||!a.binding)return 'Owner binding required';
  if(!a.passport)return 'Passport required';
  if(a.governance_status!=='Managed'||a.passport.status!=='active'||expired(a.passport.expires_at,now))return 'Passport invalid or inactive';
  if(!a.mandate)return 'Mandate required';
  if(a.mandate.status!=='active')return `Mandate ${a.mandate.status}`;
  if(!a.mandate.expires_at)return 'Mandate expiry not reported';
  if(expired(a.mandate.expires_at,now))return 'Mandate expired';
  return null;
}
export type SourceSignal={report_id:string;source:string;status:string;observed_at:string;received_at:string;host:string};
export function workspacePosture(s:Snapshot, scan:DiscoveryScan|null, now=Date.now(), reports:SourceSignal[]=[]):Posture {
  const concerns:Concern[]=[];
  const add=(c:Concern)=>concerns.push(c);
  const coverage=s.assurance.coverage;
  const scanState=freshness(coverage.last_scan_at,now);
  const latest=new Map<string,SourceSignal>();
  for(const report of [...reports].sort((a,b)=>b.received_at.localeCompare(a.received_at)))if(!latest.has(`${report.source}:${report.host}`))latest.set(`${report.source}:${report.host}`,report);
  const collectorSources=[...latest.values()].map(r=>{
    const age=freshness(r.observed_at,now);const status=age!=='Recent'?age:r.status;
    if(age!=='Recent'||r.status!=='healthy')add({id:`source-${r.report_id}`,severity:'Attention',title:`Collector needs attention: ${r.source}`,impact:'Missing or degraded telemetry limits confidence. This is not proof that an agent stopped or a threat disappeared.',owner:'Collector / endpoint operator',evidence:`${r.report_id}; host ${r.host}; observed ${r.observed_at}; received ${r.received_at}; reported ${r.status}.`,action:'Inspect source report',target:{page:'assurance'},boundary:'Source timestamps and health are reported by the collector, not independent attestation.'});
    return {name:`${r.source} · ${r.host}`,status,detail:`Reported ${r.status}; observed ${r.observed_at}; received ${r.received_at}. Latest received report in this view.`};
  });
  add({id:'fleet-coverage',severity:'Unknown',title:'How much of the company is invisible?',impact:'There is no verified fleet denominator. An observed tool count is not enterprise coverage.',owner:'Endpoint / IT owner — assign in your organization',evidence:`${coverage.observed_entities} observations; ${coverage.configured_sources} configured scan sources. No enrolled-device denominator in this snapshot.`,action:'Inspect discovery',target:{page:'discovery'},boundary:'Discovery is observation, not proof of protection or complete AI usage.'});
  if(scanState!=='Recent'||coverage.scan_errors)add({id:'scan-health',severity:'Attention',title:'Discovery evidence needs attention',impact:'A stale or failed source can hide newly introduced AI tools.',owner:'Discovery operator',evidence:`${scanState}; last scan: ${coverage.last_scan_at||'never'}; ${coverage.scan_errors} source errors. Review threshold: ${FRESHNESS_HOURS} hours, not a contractual SLA.`,action:'Inspect scan sources',target:{page:'discovery'},boundary:'A connected connector is not necessarily a fresh, successful scan.'});
  for(const a of s.agents){
    const passportBad=!a.passport||a.passport.status!=='active'||expired(a.passport.expires_at,now);
    const mandateBad=!a.mandate||!a.mandate.expires_at||a.mandate.status!=='active'||expired(a.mandate.expires_at,now);
    if(authorityIssue(a,now))add({id:`authority-${a.agent_id}`,severity:'High',title:`Authority incomplete: ${a.name}`,impact:`${authorityIssue(a,now)}. Known scope: ${s.rooms.filter(r=>r.agent_ids.includes(a.agent_id)).length} visible rooms and ${s.actions.filter(x=>x.agent_id===a.agent_id&&x.status==='pending').length} pending actions. This is not a complete external blast radius.`,owner:a.owner?.name||'Unassigned human owner',evidence:`Binding: ${a.binding?'present':'missing'}; Passport: ${passportBad?'missing, inactive or expired':'present; inspect validation'}; mandate: ${mandateBad?'missing, inactive, expired or expiry unknown':'active by status/date'}.`,action:'Inspect identity and authority',target:{kind:'agent',id:a.agent_id},boundary:'ByoSync can gate its own governed work. External processes are not stopped by a registry status.'});
  }
  for(const a of (scan?.agents||[]).filter(a=>a.shadow))add({id:`shadow-${a.agent_id}`,severity:'Attention',title:`Unapproved observation: ${a.name}`,impact:'Confirm purpose and owner before authorizing use; a shadow classification is not proof of malicious activity.',owner:a.owner||'Accountability not confirmed',evidence:`Census classification: ${a.classification.classification}; sources: ${a.discovery_sources.join(', ')}; last seen: ${a.last_seen}.`,action:'Review discovery evidence',target:{page:'discovery'},boundary:'Observe only. No external endpoint containment receipt is available.'});
  const pending=s.approvals.filter(a=>a.status==='pending');
  for(const a of pending){const hours=Math.max(0,Math.floor((now-Date.parse(a.requested_at))/3600000));add({id:a.approval_id,severity:hours>=24?'High':'Attention',title:`Human decision: ${a.action.replaceAll('_',' ')}`,impact:'The requested governed action is waiting. Inspect exact scope before approval.',owner:s.agents.find(x=>x.agent_id===a.agent_id)?.owner?.name||'Owner not available',evidence:`Waiting ${hours}h; action ${a.action_id}; room ${a.room_id}. Age is not an agreed due date.`,action:'Review exact action',target:{kind:'approval',id:a.approval_id},boundary:'Approval is not a general privilege grant or independent biometric identity proof.'});}
  for(const f of s.assurance.findings.filter(f=>f.status==='open'&&(f.severity==='critical'||f.severity==='high')&&!f.finding_id.startsWith('FIND-OWNER')&&!f.finding_id.startsWith('FIND-MANDATE')&&!f.finding_id.startsWith('FIND-SHADOW')))add({id:f.finding_id,severity:'High',title:f.title,impact:f.summary,owner:'Security operator — verify assignment',evidence:f.evidence_refs.join(', ')||'No linked evidence reference supplied',action:'Inspect finding',target:{kind:'finding',id:f.finding_id},boundary:f.capability});
  if(s.session.mode==='local-operator')add({id:'identity-session',severity:'High',title:'This session is a local operator, not enterprise identity',impact:'Individual accountability and separation of duties cannot be represented as enterprise-authenticated here.',owner:'Platform / identity administrator',evidence:s.session.assurance,action:'Review access configuration',target:{page:'administration'},boundary:'Named-user credentials exist; enterprise SSO/MFA assurance is not established.'});
  add({id:'egress',severity:'Unknown',title:'Can sensitive data leave through another AI tool?',impact:'Company-wide destination policy, content DLP and prompt-injection resistance are not proven by this workspace.',owner:'Security architecture / data owner',evidence:'No enterprise-wide egress enforcement or DLP decision feed is present in the snapshot.',action:'Review enforcement boundaries',target:{page:'assurance'},boundary:'A read-only CLI generation workflow is not a network-wide data-loss prevention service.'});
  return {mode:'Workspace evidence',scope:s.session.mode==='named-user'&&s.session.role!=='admin'?'Organization inventory; room evidence is restricted to your membership.':'This local deployment only; not the entire enterprise.',observed:coverage.observed_entities,registered:s.agents.length,owned:s.agents.filter(a=>a.owner&&a.binding).length,authority:s.agents.filter(a=>!authorityIssue(a,now)).length,waiting:pending.length,memory:s.memories.filter(m=>m.status==='published').length,proposed:s.memories.filter(m=>m.status==='proposed').length,integrity:s.integrity.status==='verified'?'Local chain verified':'Verification needs attention',scan:scanState,concerns,sources:[...collectorSources,{name:'Endpoint discovery',status:scanState,detail:`${coverage.last_scan_at||'No completed scan'} · ${coverage.scan_errors} errors`},...s.assurance.connections.map(c=>({name:c.name,status:c.status,detail:`${c.capability}. ${c.detail}`}))],evaluated:new Date(now).toISOString()};
}

export function scenarioPosture(s:Scenario,p:Playback):Posture {
  const memories=allMemories(s,p);const pending=p.queue.filter(t=>['Awaiting approval','Memory review'].includes(t.stage));
  const estate=buildEstate(s,p);
  const concerns:Concern[]=estate.observations.filter(observation=>observation.status!=='Approved').map(observation=>{
    const device=estate.devices.find(item=>item.id===observation.deviceId);
    const blocked=observation.status==='Blocked';const unverified=observation.status==='Unverified';
    return {
      id:observation.id,severity:unverified?'Unknown':'Attention',
      title:`${blocked?'Use blocked':unverified?'Visibility unverified':'Use awaiting approval'} · ${observation.name}`,
      impact:blocked
        ? `${observation.reason}. Scenario policy restricts use, but an external containment receipt is not available. The installed process or device is not proven stopped.`
        :unverified
          ? `${observation.reason}. This is a visibility gap, not proof of active execution, malicious behavior or safety.`
          :`${observation.reason}. Review purpose, accountable ownership and permitted scope before approving this software use.`,
      owner:personName(s,observation.reviewOwnerId),
      evidence:`${observation.id} · ${observation.status} · ${observation.source} · ${device?.name||observation.deviceId} (${observation.deviceId}) · synthetic software observation; not an additional governed agent.`,
      action:blocked?'Review restriction and enforcement evidence':unverified?'Inspect visibility gap':'Review software authorization',
      target:{kind:'discovery',id:observation.id},boundary:observation.boundary,
    };
  });
  pending.forEach(t=>concerns.push({id:t.id,severity:t.risk==='Restricted'?'High':'Attention',title:t.stage==='Memory review'?'Knowledge requires human review':'Action requires a human decision',impact:`${t.title} · ${t.department} → ${t.peer}`,owner:personName(s,t.owner),evidence:`${t.id} · ${t.room} · ${t.stage}`,action:'Review task and identity path',target:{kind:'task',id:t.id},boundary:'Scripted approval may be enabled. All identities and actions here are synthetic.'}));
  concerns.push({id:'sim-coverage',severity:'Unknown',title:'Modeled inventory is not measured device coverage',impact:'A complete scenario inventory does not establish live fleet visibility. Modeled tool-call reductions are not measured customer results.',owner:'Environment administrator',evidence:`${s.people.length} people, ${estate.devices.length} modeled devices, ${s.agents.length} governed agents and ${estate.observations.length} separate software observations; generated history and browser-local playback.`,action:'Inspect organization',target:{page:'estate'},boundary:'No live enterprise collection or performance benchmark.'});
  return {mode:'Synthetic scenario',scope:'All six fictional departments. Security posture is company-wide; map drill-downs and list filters do not change this scope.',observed:estate.observations.length,observedLabel:'software observations',registered:s.agents.length,owned:s.agents.filter(a=>s.people.some(person=>person.id===a.owner)).length,authority:estate.deployments.filter(deployment=>deployment.status==='Approved').length,waiting:pending.length,memory:memories.filter(m=>m.status==='Published').length,proposed:memories.filter(m=>m.status==='Proposed').length,integrity:'Synthetic event records',scan:'Synthetic',concerns,sources:[{name:'Scenario engine',status:'Synthetic',detail:`Batch ${p.cycle} · event ${p.tick}. Not live endpoint or network telemetry.`},{name:'Software observations',status:'Scenario classifications',detail:`${estate.observations.filter(o=>o.status==='Approved').length} approved, ${estate.observations.filter(o=>o.status==='Waiting for approval').length} waiting, ${estate.observations.filter(o=>o.status==='Blocked').length} policy-blocked and ${estate.observations.filter(o=>o.status==='Unverified').length} unverified. These are separate from ${s.agents.length} governed agent identities.`},{name:'Enterprise fleet coverage',status:'Not measured',detail:`${estate.devices.length} modeled devices and ${s.people.length} organization profiles are not a verified enrolled-device denominator. BYOD visibility is limited to the modeled work profile.`},{name:'Company-wide egress / DLP',status:'Not verified',detail:'No live content inspection or destination enforcement in playback. A blocked software classification is not an external enforcement receipt.'}],evaluated:new Date().toISOString()};
}

export const BUYER_GATES = [
  {name:'Enterprise access',status:'Gap',proof:'SSO, MFA, lifecycle offboarding, session revocation and least-privilege review.',current:'Local operator or configured named credentials; not enterprise SSO.'},
  {name:'Coverage and containment',status:'Partial',proof:'Enrolled fleet denominator, source heartbeat, revocation test and external enforcement receipts.',current:'Discovery observations and ByoSync-scoped authority checks; not a universal kill switch.'},
  {name:'Data protection',status:'Not verified',proof:'Documented data flows, regional residency, encryption/key ownership, retention/deletion and egress tests.',current:'Local persisted files and optional external adapters. No demonstrated enterprise DLP.'},
  {name:'Isolation and abuse resistance',status:'Partial',proof:'Independent cross-user/tenant isolation, malicious prompt, memory-poisoning and approval-replay tests.',current:'Room membership, role checks and reviewed memory exist. No independent security assessment recorded.'},
  {name:'Audit durability',status:'Partial',proof:'External immutable export, independent timestamp/checkpoint, retention and administrator-tamper tests.',current:'Local hash-linked authority ledger. Verification is not WORM storage or independent attestation.'},
  {name:'Operational resilience',status:'Not verified',proof:'Restore drill, failure recovery, RPO/RTO, capacity benchmark, monitoring and incident response ownership.',current:'Portable single-host persistence. No production capacity, HA or recovery evidence recorded.'},
];
