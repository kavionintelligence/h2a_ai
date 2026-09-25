import { describe,it,expect } from 'vitest';
import type { Agent, Snapshot } from '../apps/governance/contracts';
import { authorityIssue, freshness, workspacePosture, scenarioPosture } from '../apps/web/src/security-posture/model';
import { makeScenario,initialPlayback,decide,classifyObservation } from '../apps/web/src/enterprise-simulation/model';
const now=Date.parse('2026-09-25T12:00:00Z');
const human={human_id:'H1',name:'Test owner',team:'Security'};
function agent():Agent{return {agent_id:'A1',name:'Test agent',framework:'custom',discovery_status:'discovered',status:'Managed',governance_status:'Managed',owner:human,binding:{binding_id:'B1',agent_id:'A1',human_id:'H1',relationship:'owner',status:'active',created_at:'2026-09-25T10:00:00Z'},passport:{passport_id:'P1',agent_id:'A1',binding_id:'B1',owner_human_id:'H1',status:'active',issued_at:'2026-09-25T10:00:00Z',expires_at:'2027-01-01T00:00:00Z',passport_signature:'test-only'},mandate:{mandate_id:'M1',agent_id:'A1',passport_id:'P1',purpose:'Test read',status:'active',expires_at:'2026-10-01T00:00:00Z',allowed_actions:['read'],denied_actions:['write'],approval_required_actions:['export']}};}
function snapshot():Snapshot{return {session:{...human,mode:'local-operator',role:'admin',assurance:'Not SSO'},humans:[human],agents:[agent()],bindings:[],passports:[],mandates:[],rooms:[],actions:[],approvals:[],memories:[],events:[],collaboration:{assignments:[],messages:[],activity:[]},integrity:{status:'verified',recordCount:0,headHash:null},assurance:{findings:[],coverage:{last_scan_at:null,configured_sources:1,observed_entities:0,scan_errors:0},connections:[]}};}
describe('CISO posture is derived, scoped and conservative',()=>{
  it('distinguishes missing, stale, recent and invalid source dates',()=>{expect(freshness(null,now)).toBe('Not observed');expect(freshness('2026-09-24T10:00:00Z',now)).toBe('Stale');expect(freshness('2026-09-25T11:00:00Z',now)).toBe('Recent');expect(freshness('bad',now)).toBe('Invalid timestamp');expect(freshness('2027-01-01',now)).toBe('Invalid timestamp');});
  it('does not equate connected or empty inventory with full coverage',()=>{const p=workspacePosture(snapshot(),null,now);expect(p.concerns.some(c=>c.id==='fleet-coverage')).toBe(true);expect(p.scan).toBe('Not observed');expect(p.concerns.some(c=>c.id==='egress')).toBe(true);expect(p.concerns.some(c=>c.id==='identity-session')).toBe(true);});
  it('does not turn a stale healthy collector report green',()=>{const p=workspacePosture(snapshot(),null,now,[{report_id:'R1',source:'collector',host:'laptop',status:'healthy',observed_at:'2026-09-20T00:00:00Z',received_at:'2026-09-25T11:00:00Z'}]);expect(p.sources[0].status).toBe('Stale');expect(p.concerns.some(c=>c.id==='source-R1')).toBe(true);});
  it('excludes expired, absent and unknown-expiry mandates from authority coverage',()=>{for(const expiry of [undefined,'bad','2026-09-24T00:00:00Z']){const s=snapshot();s.agents[0].mandate!.expires_at=expiry;expect(workspacePosture(s,null,now).authority).toBe(0);expect(authorityIssue(s.agents[0],now)).toMatch(/expiry|expired/);}});
  it('honors server invalid-passport projection despite active status text',()=>{const s=snapshot();s.agents[0].governance_status='Owned';expect(workspacePosture(s,null,now).authority).toBe(0);expect(authorityIssue(s.agents[0],now)).toBe('Passport invalid or inactive');});
  it('uses visible rooms for impact without inventing external blast radius',()=>{const s=snapshot();s.agents[0].mandate!.status='suspended';s.rooms=[{room_id:'R1',name:'Test',agent_ids:['A1'],human_ids:['H1'],created_at:'2026-09-25'}];expect(workspacePosture(s,null,now).concerns.find(c=>c.id==='authority-A1')?.impact).toContain('1 visible rooms');});
  it('does not describe local verification as external attestation',()=>{expect(workspacePosture(snapshot(),null,now).integrity).toBe('Local chain verified');const s=snapshot();s.integrity.status='failed';expect(workspacePosture(s,null,now).integrity).toBe('Verification needs attention');});
  it('keeps room membership scope explicit for non-admin users',()=>{const s=snapshot();s.session.mode='named-user';s.session.role='viewer';expect(workspacePosture(s,null,now).scope).toContain('restricted');expect(workspacePosture(s,null,now).concerns.some(c=>c.id==='identity-session')).toBe(false);});
  it('updates scenario concerns after actual scenario decisions',()=>{const s=makeScenario('2026-09-25');let p=initialPlayback(s);const before=scenarioPosture(s,p);const pending=p.queue.find(t=>t.stage==='Awaiting approval')!;p=decide(s,p,pending.id,false);expect(scenarioPosture(s,p).waiting).toBe(before.waiting-1);p=classifyObservation(s,p,'DISC-01','Authorized');expect(scenarioPosture(s,p).concerns.some(c=>c.id==='DISC-01')).toBe(false);expect(scenarioPosture(s,p).integrity).toBe('Synthetic event records');});
  it('uses the same default software classifications as the estate without inflating agent counts',()=>{
    const s=makeScenario('2026-09-25');const posture=scenarioPosture(s,initialPlayback(s));
    expect(posture.observed).toBe(6);expect(posture.observedLabel).toBe('software observations');
    expect(posture.registered).toBe(48);expect(posture.owned).toBe(48);expect(posture.authority).toBe(48);
    expect(posture.concerns.filter(concern=>concern.id.startsWith('DISC-'))).toHaveLength(5);
    expect(posture.concerns.some(concern=>concern.id==='DISC-02')).toBe(false);
    expect(posture.concerns.find(concern=>concern.id==='DISC-01')?.title).toContain('awaiting approval');
    expect(posture.sources.find(source=>source.name==='Software observations')?.detail).toContain('1 approved, 1 waiting, 2 policy-blocked and 2 unverified');
  });
  it('keeps policy blocks and visibility gaps distinct from proof of endpoint containment',()=>{
    const s=makeScenario('2026-09-25');const posture=scenarioPosture(s,initialPlayback(s));
    const blocked=posture.concerns.find(concern=>concern.id==='DISC-03')!;
    expect(blocked.title).toContain('Use blocked');expect(blocked.impact).toContain('not proven stopped');
    expect(blocked.action).toBe('Review restriction and enforcement evidence');
    expect(blocked.boundary).toContain('not a receipt');expect(blocked.evidence).toContain('DEVICE-H-4-5');
    for(const id of ['DISC-04','DISC-06']){const gap=posture.concerns.find(concern=>concern.id===id)!;expect(gap.title).toContain('Visibility unverified');expect(gap.severity).toBe('Unknown');expect(gap.impact).toContain('visibility gap');}
    expect(posture.sources.find(source=>source.name==='Enterprise fleet coverage')?.detail).toContain('48 modeled devices');
    expect(posture.sources.find(source=>source.name==='Enterprise fleet coverage')?.status).toBe('Not measured');
  });
  it('does not hide explicit unreviewed states or treat blocked use as a resolved enforcement concern',()=>{
    const s=makeScenario('2026-09-25');let p=initialPlayback(s);
    p.discovery['DISC-02']='Unreviewed';expect(scenarioPosture(s,p).concerns.find(concern=>concern.id==='DISC-02')?.title).toContain('awaiting approval');
    p=classifyObservation(s,p,'DISC-02','Contained');expect(scenarioPosture(s,p).concerns.find(concern=>concern.id==='DISC-02')?.title).toContain('Use blocked');
    p=classifyObservation(s,p,'DISC-02','Authorized');expect(scenarioPosture(s,p).concerns.some(concern=>concern.id==='DISC-02')).toBe(false);
  });
});
