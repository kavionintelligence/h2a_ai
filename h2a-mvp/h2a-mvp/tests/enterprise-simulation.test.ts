import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, advance, allMemories, dailySeries, decide, initialPlayback, makeScenario, metrics } from '../apps/web/src/enterprise-simulation/model';

const scenario=makeScenario('2026-09-25');
describe('isolated enterprise simulation',()=>{
  it('creates the requested hierarchy, 30 team and 18 personal agents',()=>{
    expect(scenario.population.reduce((a,b)=>a+b,0)).toBe(42);
    expect(scenario.people).toHaveLength(42);
    expect(scenario.agents).toHaveLength(48);
    for(const department of DEPARTMENTS){
      expect(scenario.people.filter(p=>p.department===department&&p.level==='Member')).toHaveLength(3);
      expect(scenario.agents.filter(a=>a.department===department&&a.kind==='Team')).toHaveLength(5);
      expect(scenario.agents.filter(a=>a.department===department&&a.kind==='Personal')).toHaveLength(3);
    }
    for(const agent of scenario.agents)expect(scenario.people.some(p=>p.id===agent.owner)).toBe(true);
    for(const person of scenario.people)if(person.manager)expect(scenario.people.some(p=>p.id===person.manager)).toBe(true);
  });
  it('has a deterministic 30-day history with 10–20 tasks every day',()=>{
    const days=dailySeries(scenario);expect(days).toHaveLength(30);
    expect(days.every(d=>d.tasks>=10&&d.tasks<=20)).toBe(true);
    expect(new Set(days.map(d=>d.tasks)).size).toBeGreaterThan(5);
    expect(makeScenario('2026-09-25')).toEqual(scenario);
  });
  it('has no orphan tasks, actors or historical memory references',()=>{
    for(const t of scenario.tasks){expect(scenario.agents.some(a=>a.id===t.agent)).toBe(true);expect(scenario.agents.some(a=>a.id===t.collaborator)).toBe(true);for(const id of t.memoryIds){const m=scenario.memories.find(m=>m.id===id)!;expect(m.status).toBe('Published');expect(m.allowedTeams).toContain(t.department);expect(m.created<t.created).toBe(true);}}
    for(const e of scenario.events){expect(scenario.tasks.some(t=>t.id===e.task)).toBe(true);expect([...scenario.people,...scenario.agents].some(p=>p.id===e.actor)).toBe(true);}
  });
  it('does not execute blocked or rejected historical tasks',()=>{for(const t of scenario.tasks.filter(t=>t.stage!=='Completed')){expect(t.calls).toBe(0);expect(scenario.events.some(e=>e.task===t.id&&e.operation==='Approved tool operation')).toBe(false);expect(scenario.memories.some(m=>m.task===t.id)).toBe(false);}});
  it('starts with 20 inspectable tasks and manual decisions actually hold work',()=>{
    let p=initialPlayback(scenario);expect(p.queue).toHaveLength(20);
    const initial=structuredClone(p);for(let n=0;n<250;n++)p=advance(scenario,p,false);
    expect(p.cycle).toBe(1);expect(p.queue.every(t=>['Awaiting approval','Memory review','Blocked'].includes(t.stage))).toBe(true);
    expect(initial).toEqual(initialPlayback(scenario));
  });
  it('approves only a pending exact request and records the human',()=>{
    let p=initialPlayback(scenario);const t=p.queue.find(t=>t.stage==='Awaiting approval')!;
    p=decide(scenario,p,t.id,true);expect(p.queue.find(x=>x.id===t.id)?.stage).toBe('Executing');
    expect(p.events.some(e=>e.task===t.id&&e.operation==='Human approved exact action'&&e.actor===t.owner&&e.origin==='Presenter decision')).toBe(true);
    expect(decide(scenario,p,t.id,true)).toBe(p);
    const rejected=p.queue.find(t=>t.stage==='Awaiting approval')!;p=decide(scenario,p,rejected.id,false);expect(p.queue.find(t=>t.id===rejected.id)?.calls).toBe(0);
  });
  it('keeps rejected memory out of reusable context',()=>{
    let p=initialPlayback(scenario);const task=p.queue.find(t=>t.stage==='Memory review')!;const id=p.memories.find(m=>m.task===task.id)!.id;
    p=decide(scenario,p,task.id,false);expect(p.memories.find(m=>m.id===id)?.status).toBe('Rejected');
    for(let n=0;n<100;n++)p=advance(scenario,p,true);
    expect(p.queue.every(t=>!t.memoryIds.includes(id))).toBe(true);
  });
  it('loops batches, grows reviewed knowledge and reconciles modeled calls',()=>{
    let p=initialPlayback(scenario);const initial=metrics(scenario,p);
    for(let n=0;n<210;n++)p=advance(scenario,p,true);
    expect(p.cycle).toBeGreaterThan(1);expect(p.queue).toHaveLength(20);expect(metrics(scenario,p).published).toBeGreaterThan(initial.published);
    const m=metrics(scenario,p);expect(m.calls+m.avoided).toBe(m.baseline);
    for(const task of p.queue)for(const id of task.memoryIds){const memory=allMemories(scenario,p).find(m=>m.id===id)!;expect(memory.status).toBe('Published');expect(memory.allowedTeams).toContain(task.department);}
  });
});
