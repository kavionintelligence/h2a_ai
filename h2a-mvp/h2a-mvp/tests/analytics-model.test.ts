import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, advance, initialPlayback, makeScenario } from '../apps/web/src/enterprise-simulation/model';
import { currentAnalytics, departmentAnalytics, historicalAnalytics } from '../apps/web/src/enterprise-simulation/analytics-model';

const scenario = makeScenario('2026-09-25');
const all = { department: 'All' as const, days: 30 as const, day: '' };

describe('Historical analytics', () => {
  it('retains all 30 seeded days and reconciles the complete history', () => {
    const report = historicalAnalytics(scenario, all);
    expect(report.series).toHaveLength(30);
    expect(report.start).toBe('2026-08-26');
    expect(report.end).toBe('2026-09-24');
    expect(report.totals.tasks).toBe(434);
    expect(report.totals.completed).toBe(380);
    expect(report.totals.published).toBe(380);
    expect(report.totals.openingMemory).toBe(0);
    expect(report.totals.closingMemory).toBe(380);
    expect(report.totals.baseline).toBe(380 * 8);
    expect(report.totals.avoided).toBe(report.totals.reuseReferences);
    expect(report.series.every(day => day.tasks >= 10 && day.tasks <= 20)).toBe(true);
    expect(report.totals.tasks).toBe(report.totals.completed + report.totals.blocked + report.totals.rejected);
  });

  it('filters department, day and record provenance together without double-counting shared memory', () => {
    const totals = departmentAnalytics(scenario, all);
    expect(totals.reduce((sum, row) => sum + row.tasks, 0)).toBe(434);
    expect(totals.reduce((sum, row) => sum + row.published, 0)).toBe(380);
    for (const department of DEPARTMENTS) {
      const report = historicalAnalytics(scenario, { department, days: 7, day: '2026-09-24' });
      expect(report.series).toHaveLength(7);
      expect(report.tasks.every(task => task.department === department && task.created.startsWith('2026-09-24'))).toBe(true);
      expect(report.memories.every(memory => memory.department === department && memory.created.startsWith('2026-09-24'))).toBe(true);
      expect(report.totals.closingMemory - report.totals.openingMemory).toBe(report.totals.published);
    }
  });

  it('preserves cumulative memory at a shortened window and clears out-of-window day selections', () => {
    const report = historicalAnalytics(scenario, { ...all, days: 7, day: '2026-08-26' });
    expect(report.activeDay).toBe('');
    expect(report.totals.openingMemory).toBeGreaterThan(0);
    expect(report.totals.closingMemory).toBe(380);
    expect(report.totals.openingMemory + report.totals.published).toBe(report.totals.closingMemory);
  });

  it('keeps live playback separate from the historical series and counts only completed-task calls', () => {
    let playback = initialPlayback(scenario);
    for (let tick = 0; tick < 180; tick++) playback = advance(scenario, playback);
    const before = historicalAnalytics(scenario, all);
    const current = currentAnalytics(playback, 'All');
    expect(current.tasks.every(task => !task.historical)).toBe(true);
    expect(current.completed).toBe(current.tasks.filter(task => task.stage === 'Completed').length);
    expect(current.baseline).toBe(current.completed * 8);
    expect(current.calls).toBe(current.tasks.filter(task => task.stage === 'Completed').reduce((sum, task) => sum + task.calls, 0));
    expect(historicalAnalytics(scenario, all)).toEqual(before);
    expect(currentAnalytics(playback, 'Design').tasks.every(task => task.department === 'Design')).toBe(true);
  });
});
