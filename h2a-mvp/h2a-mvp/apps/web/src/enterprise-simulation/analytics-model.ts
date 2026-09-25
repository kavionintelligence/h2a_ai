import { DEPARTMENTS, dailySeries, type Department, type Playback, type Scenario, type SimTask } from './model';

export type AnalyticsKind = 'memory' | 'calls' | 'volume';
export type AnalyticsFilters = { department: Department | 'All'; days: 7 | 14 | 30; day: string };
export type AnalyticsDay = {
  date: string; tasks: number; completed: number; blocked: number; rejected: number;
  calls: number; baseline: number; avoided: number; averageCalls: number | null;
  published: number; cumulativeMemory: number; reused: number;
};

const completed = (tasks: SimTask[]) => tasks.filter(task => task.stage === 'Completed');
const total = (tasks: SimTask[], key: 'calls' | 'baseline' | 'reused') => tasks.reduce((sum, task) => sum + task[key], 0);

/** Historical analytics never merge retained playback records into the 30-day series. */
export function historicalAnalytics(scenario: Scenario, filters: AnalyticsFilters) {
  const dates = dailySeries(scenario).map(row => row.date).slice(-filters.days);
  const inDepartment = (department: Department) => filters.department === 'All' || filters.department === department;
  const tasks = scenario.tasks.filter(task => task.historical && inDepartment(task.department));
  const memories = scenario.memories.filter(memory => memory.status === 'Published' && inDepartment(memory.department));
  const series: AnalyticsDay[] = dates.map(date => {
    const onDay = tasks.filter(task => task.created.slice(0, 10) === date);
    const done = completed(onDay);
    const calls = total(done, 'calls');
    const baseline = total(done, 'baseline');
    return {
      date, tasks: onDay.length, completed: done.length,
      blocked: onDay.filter(task => task.stage === 'Blocked').length,
      rejected: onDay.filter(task => task.stage === 'Rejected').length,
      calls, baseline, avoided: baseline - calls, averageCalls: done.length ? calls / done.length : null,
      published: memories.filter(memory => memory.created.slice(0, 10) === date).length,
      cumulativeMemory: memories.filter(memory => memory.created.slice(0, 10) <= date).length,
      reused: total(done, 'reused'),
    };
  });
  const activeDay = dates.includes(filters.day) ? filters.day : '';
  const start = activeDay || dates[0];
  const end = activeDay || dates[dates.length - 1];
  const within = (date: string) => date.slice(0, 10) >= start && date.slice(0, 10) <= end;
  const records = tasks.filter(task => within(task.created)).sort((a, b) => b.created.localeCompare(a.created));
  const done = completed(records);
  const published = memories.filter(memory => within(memory.created)).sort((a, b) => b.created.localeCompare(a.created));
  const calls = total(done, 'calls');
  const baseline = total(done, 'baseline');
  return {
    dates, series, activeDay, start, end, tasks: records, completedTasks: done, memories: published,
    totals: {
      tasks: records.length, completed: done.length,
      blocked: records.filter(task => task.stage === 'Blocked').length,
      rejected: records.filter(task => task.stage === 'Rejected').length,
      calls, baseline, avoided: baseline - calls, averageCalls: done.length ? calls / done.length : null,
      published: published.length,
      openingMemory: memories.filter(memory => memory.created.slice(0, 10) < start).length,
      closingMemory: memories.filter(memory => memory.created.slice(0, 10) <= end).length,
      reuseReferences: total(done, 'reused'),
      tasksReusingMemory: done.filter(task => task.reused > 0).length,
    },
  };
}

export function departmentAnalytics(scenario: Scenario, filters: AnalyticsFilters) {
  return DEPARTMENTS.map(department => ({ department, ...historicalAnalytics(scenario, { ...filters, department }).totals }));
}

/** These are retained playback records, not lifetime or historical totals. */
export function currentAnalytics(playback: Playback, department: Department | 'All') {
  const tasks = [...new Map([...playback.completed, ...playback.queue].map(task => [task.id, task])).values()]
    .filter(task => department === 'All' || task.department === department)
    .sort((a, b) => b.updated.localeCompare(a.updated));
  const done = completed(tasks);
  const memories = playback.memories.filter(memory => department === 'All' || memory.department === department);
  return {
    tasks, completed: done.length,
    active: tasks.filter(task => !['Completed', 'Blocked', 'Rejected'].includes(task.stage)).length,
    held: tasks.filter(task => ['Awaiting approval', 'Memory review'].includes(task.stage)).length,
    blocked: tasks.filter(task => task.stage === 'Blocked').length,
    calls: total(done, 'calls'), baseline: total(done, 'baseline'),
    published: memories.filter(memory => memory.status === 'Published').length,
    proposed: memories.filter(memory => memory.status === 'Proposed').length,
    averageCalls: done.length ? total(done, 'calls') / done.length : null,
  };
}
