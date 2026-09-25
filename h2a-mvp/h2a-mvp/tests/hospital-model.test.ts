import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, ORGANIZATION_NAME, ORG_CISO_NAME, SIM_VERSION, initialPlayback, makeScenario } from '../apps/web/src/enterprise-simulation/model';
import { completedTaskOutput } from '../apps/web/src/enterprise-simulation/outputs';

const scenario = makeScenario('2026-09-25');

describe('Joon’s Hospital organization', () => {
  it('models six complete seven-person hierarchies with no hidden headcount', () => {
    expect(SIM_VERSION).toBe(2);
    expect(ORGANIZATION_NAME).toBe('Joon’s Hospital');
    expect(scenario.people).toHaveLength(42);
    expect(scenario.population).toEqual([7, 7, 7, 7, 7, 7]);
    expect(scenario.population.reduce((sum, count) => sum + count, 0)).toBe(scenario.people.length);
    DEPARTMENTS.forEach((department, index) => {
      const people = scenario.people.filter(person => person.department === department);
      expect(people).toHaveLength(7);
      expect(people.filter(person => person.level === 'C-level')).toHaveLength(1);
      expect(people.filter(person => person.level === 'VP')).toHaveLength(1);
      expect(people.filter(person => person.level === 'Manager')).toHaveLength(1);
      expect(people.filter(person => person.level === 'Team lead')).toHaveLength(1);
      expect(people.filter(person => person.level === 'Member')).toHaveLength(3);
      expect(people.find(person => person.id === `H-${index}-0`)?.manager).toBe(`H-${index}-C`);
      expect(people.find(person => person.id === `H-${index}-1`)?.manager).toBe(`H-${index}-0`);
      expect(people.find(person => person.id === `H-${index}-2`)?.manager).toBe(`H-${index}-1`);
      expect(people.filter(person => person.level === 'Member').every(person => person.manager === `H-${index}-2`)).toBe(true);
    });
  });

  it('uses a consistent named CISO, unique Indian scenario names and no former executives', () => {
    expect(new Set(scenario.people.map(person => person.name)).size).toBe(42);
    expect(scenario.people.find(person => person.id === 'H-1-C')?.name).toBe(ORG_CISO_NAME);
    expect(scenario.people.find(person => person.id === 'H-1-C')?.role).toBe('Chief information security officer');
    const names = scenario.people.map(person => person.name).join(' ');
    for (const formerName of ['Alex Morgan', 'Jordan Ellis', 'Taylor Bennett', 'Leo Brooks', 'Owen Reed', 'Noah Wilson', 'James Carter', 'Oliver Grant']) expect(names).not.toContain(formerName);
    expect(scenario.people.some(person => person.department === 'Executive')).toBe(false);
    for (const person of scenario.people) if (person.manager) expect(scenario.people.some(manager => manager.id === person.manager)).toBe(true);
  });

  it('binds five shared and three personal agents per team to the correct human', () => {
    expect(scenario.agents).toHaveLength(48);
    DEPARTMENTS.forEach((department, index) => {
      const agents = scenario.agents.filter(agent => agent.department === department);
      expect(agents.filter(agent => agent.kind === 'Team')).toHaveLength(5);
      expect(agents.filter(agent => agent.kind === 'Personal')).toHaveLength(3);
      expect(agents.filter(agent => agent.kind === 'Team').every(agent => agent.owner === `H-${index}-2`)).toBe(true);
      for (const member of scenario.people.filter(person => person.department === department && person.level === 'Member')) {
        const personal = agents.filter(agent => agent.kind === 'Personal' && agent.owner === member.id);
        expect(personal).toHaveLength(1);
        expect(personal[0].name).toContain(member.name.split(' ')[0]);
      }
    });
  });

  it('retains deterministic historical volumes and links after renaming the organization', () => {
    expect(scenario.tasks).toHaveLength(434);
    expect(scenario.tasks.filter(task => task.stage === 'Completed')).toHaveLength(380);
    expect(makeScenario('2026-09-25')).toEqual(scenario);
    for (const task of scenario.tasks) {
      expect(scenario.people.some(person => person.id === task.owner)).toBe(true);
      expect(task.title).toMatch(/hospital|staff portal|staff onboarding|corporate wellness/i);
    }
  });
});

describe('completed operational handoffs', () => {
  it('provides useful, deterministic department-specific artifacts with traceable provenance', () => {
    const outputs = new Set<string>();
    for (const department of DEPARTMENTS) {
      const task = scenario.tasks.find(item => item.department === department && item.stage === 'Completed')!;
      const output = completedTaskOutput(scenario, task)!;
      expect(output).toEqual(completedTaskOutput(scenario, task));
      expect(output.filename).toMatch(/\.md$/);
      expect(output.markdown).toContain(ORGANIZATION_NAME);
      expect(output.markdown).toContain(task.id);
      expect(output.markdown).toContain(task.room);
      expect(output.markdown).toContain(scenario.people.find(person => person.id === task.owner)!.name);
      expect(output.markdown).toContain('Scenario output');
      expect(output.markdown).toContain('Contains no patient data');
      expect(output.sections.length).toBeGreaterThanOrEqual(5);
      expect(output.markdown.length).toBeGreaterThan(1500);
      outputs.add(output.sections[0].body);
    }
    expect(outputs.size).toBe(6);
  });

  it('has distinct operational guidance for all thirty task templates', () => {
    const examples = [...new Map(scenario.tasks.filter(task => task.stage === 'Completed').map(task => [task.title, task])).values()];
    expect(examples).toHaveLength(30);
    const recommendations = examples.map(task => completedTaskOutput(scenario, task)!.sections.find(section => section.heading === 'Recommended actions')!.body);
    expect(new Set(recommendations).size).toBe(30);
  });

  it('does not manufacture completed output for blocked, rejected or pending work', () => {
    for (const task of [...scenario.tasks.filter(item => item.stage !== 'Completed'), ...initialPlayback(scenario).queue]) expect(completedTaskOutput(scenario, task)).toBeNull();
    const completed = scenario.tasks.find(item => item.stage === 'Completed')!;
    expect(completedTaskOutput(scenario, { ...completed, agent: 'missing-agent' })).toBeNull();
  });
});
