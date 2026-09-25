import { allMemories, allTasks, isTerminal, type Department, type Playback, type Scenario, type SimTask } from './model';

export type FlowTone = 'good' | 'attention' | 'danger' | 'neutral';
export function taskTone(task: SimTask): FlowTone {
  if (task.stage === 'Blocked' || task.stage === 'Rejected') return 'danger';
  if (task.stage === 'Awaiting approval' || task.stage === 'Memory review') return 'attention';
  return task.stage === 'Completed' || task.stage === 'Executing' ? 'good' : 'neutral';
}

/** Include both originating and receiving teams; incoming collaboration is not invisible. */
export function roomSummaries(scenario: Scenario, playback: Playback, department?: Department) {
  const tasks = allTasks(scenario, playback);
  const memories = allMemories(scenario, playback);
  return [...new Set(tasks.filter(t => !department || t.department === department || t.peer === department).map(t => t.room))].sort().map(id => {
    const roomTasks = tasks.filter(t => t.room === id);
    const first = roomTasks[0];
    const current = playback.queue.filter(t => t.room === id);
    const waiting = current.filter(t => ['Awaiting approval', 'Memory review'].includes(t.stage)).length;
    const blocked = current.filter(t => ['Blocked', 'Rejected'].includes(t.stage)).length;
    const active = current.filter(t => !isTerminal(t.stage)).length;
    const published = memories.filter(m => m.room === id && m.status === 'Published').length;
    return { id, department: first.department, peer: first.peer, title: `${first.department} × ${first.peer}`, tasks: roomTasks, active, waiting, blocked, published, tone: (blocked ? 'danger' : waiting ? 'attention' : active ? 'neutral' : 'good') as FlowTone };
  });
}

export function roomContext(scenario: Scenario, playback: Playback, roomId: string) {
  const tasks = allTasks(scenario, playback).filter(t => t.room === roomId);
  const agentIds = new Set(tasks.flatMap(t => [t.agent, t.collaborator]));
  const agents = scenario.agents.filter(a => agentIds.has(a.id));
  const humanIds = new Set([...tasks.map(t => t.owner), ...agents.map(a => a.owner)]);
  const people = scenario.people.filter(p => humanIds.has(p.id));
  const departments = [...new Set(tasks.flatMap(t => [t.department, t.peer]))];
  const memories = allMemories(scenario, playback).filter(m => m.room === roomId);
  return { tasks, agents, people, departments, memories };
}
