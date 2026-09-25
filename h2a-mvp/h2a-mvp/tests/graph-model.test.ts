import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, initialPlayback, makeScenario } from '../apps/web/src/enterprise-simulation/model';
import { roomContext, roomSummaries, taskTone } from '../apps/web/src/enterprise-simulation/graph-model';

const scenario=makeScenario('2026-09-25');
const playback=initialPlayback(scenario);
describe('collaboration graph data',()=>{
  it('includes incoming as well as outgoing rooms for every team',()=>{
    for(const department of DEPARTMENTS){const rooms=roomSummaries(scenario,playback,department);expect(rooms.length).toBeGreaterThan(0);expect(rooms.every(room=>room.department===department||room.peer===department)).toBe(true);expect(rooms.some(room=>room.peer===department)).toBe(true);expect(rooms.some(room=>room.department===department)).toBe(true);}
  });
  it('contains every task agent and accountable human without duplication',()=>{
    for(const room of roomSummaries(scenario,playback)){const context=roomContext(scenario,playback,room.id);expect(new Set(context.agents.map(a=>a.id)).size).toBe(context.agents.length);for(const task of context.tasks){expect(context.agents.some(a=>a.id===task.agent)).toBe(true);expect(context.agents.some(a=>a.id===task.collaborator)).toBe(true);expect(context.people.some(p=>p.id===task.owner)).toBe(true);}for(const agent of context.agents)expect(context.people.some(p=>p.id===agent.owner)).toBe(true);}
  });
  it('does not count historical blocks as new active incidents',()=>{
    const paused={...playback,queue:[]};for(const room of roomSummaries(scenario,paused)){expect(room.blocked).toBe(0);expect(room.waiting).toBe(0);expect(room.active).toBe(0);}
  });
  it('keeps unknown and pending work distinct from completed operations',()=>{
    const task=playback.queue[0];expect(taskTone({...task,stage:'Queued'})).toBe('neutral');expect(taskTone({...task,stage:'Awaiting approval'})).toBe('attention');expect(taskTone({...task,stage:'Completed'})).toBe('good');expect(taskTone({...task,stage:'Blocked'})).toBe('danger');
  });
});
