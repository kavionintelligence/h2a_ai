import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Clock3, Info, Layers3, ListFilter, ShieldCheck, Workflow } from 'lucide-react';
import { PrivateField, PrivateText } from '../privacy/Privacy';
import { DEPARTMENTS, personName, type Department, type Playback, type Scenario } from './model';
import { currentAnalytics, departmentAnalytics, historicalAnalytics, type AnalyticsDay, type AnalyticsFilters, type AnalyticsKind } from './analytics-model';
import './AnalyticsDetails.css';

export type AnalyticsDetailsProps = {
  kind: AnalyticsKind;
  scenario: Scenario;
  playback: Playback;
  onBack: () => void;
  onInspect: (selection: { kind: 'task' | 'memory'; id: string }) => void;
};

const PAGE_SIZE = 10;
const number = (value: number) => value.toLocaleString('en-IN');
const decimal = (value: number | null) => value === null ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const date = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const COPY = {
  memory: { title: 'Reviewed memory growth', subtitle: 'See which reviewed knowledge entered the company brain, who released it, and the work it supports.', chart: 'Published knowledge, day by day', unit: 'Cumulative published records', section: 'Reviewed records behind the growth', comparison: 'Records published by team', icon: BookOpen },
  calls: { title: 'Tool calls per completed task', subtitle: 'Follow the relationship between reviewed context and modeled tool demand, with each completed task available to inspect.', chart: 'Tool demand across completed work', unit: 'Calls per completed task', section: 'Completed tasks behind the calculation', comparison: 'Average calls by team', icon: Workflow },
  volume: { title: 'Daily work volume', subtitle: 'Understand how work moves across the hospital, including completed tasks, policy stops and human rejections.', chart: 'Work outcomes, day by day', unit: 'Tasks per day', section: 'Work records behind the volume', comparison: 'Work volume by team', icon: Layers3 },
};

function AnalyticsChart({ kind, series, selectedDay }: { kind: AnalyticsKind; series: AnalyticsDay[]; selectedDay: string }) {
  const id = useId().replace(/:/g, '');
  const width = 800; const height = 270; const left = 52; const right = 22; const top = 24; const bottom = 40;
  const chartWidth = width - left - right; const chartHeight = height - top - bottom;
  const values = series.map(row => kind === 'memory' ? row.cumulativeMemory : kind === 'calls' ? row.averageCalls || 0 : row.tasks);
  const rawMax = kind === 'calls' ? 8 : Math.max(...values, 1);
  const max = kind === 'calls' ? 8 : Math.max(4, Math.ceil(rawMax / 4) * 4);
  const slot = chartWidth / series.length;
  const x = (index: number) => left + slot * (index + 0.5);
  const y = (value: number) => top + chartHeight - value / max * chartHeight;
  const line = series.reduce((path, row, index) => {
    const value = kind === 'memory' ? row.cumulativeMemory : row.averageCalls;
    if (value === null) return path;
    const first = index === 0 || (kind === 'calls' && series[index - 1].averageCalls === null);
    return `${path}${first ? ' M' : ' L'}${x(index)},${y(value)}`;
  }, '');
  const summary = kind === 'memory'
    ? `Cumulative published memory rises from ${series[0]?.cumulativeMemory || 0} to ${series.at(-1)?.cumulativeMemory || 0} records in the selected window.`
    : kind === 'calls'
      ? 'Daily average modeled calls for completed tasks, compared with an assumed baseline of eight. Days without completed tasks have no point.'
      : 'Daily tasks grouped into completed, blocked by policy, and rejected by a human. Exact values follow in the daily data table.';
  return <div className="analytics-chart">
    <div className="analytics-chart-legend">
      {kind === 'memory' ? <span><i className="analytics-key analytics-key-blue"/>Published records · cumulative</span>
        : kind === 'calls' ? <><span><i className="analytics-key analytics-key-blue"/>Modeled calls</span><span><i className="analytics-key analytics-key-dashed"/>Assumed baseline · 8</span></>
          : <><span><i className="analytics-key analytics-key-blue"/>Completed</span><span><i className="analytics-key analytics-key-red"/>Policy blocked</span><span><i className="analytics-key analytics-key-amber"/>Human rejected</span></>}
    </div>
    <svg className="analytics-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{COPY[kind].chart}</title>
      <desc id={`${id}-description`}>{summary} Values use UTC dates. Use the day filter or daily data table to inspect supporting records.</desc>
      <defs><pattern id={`${id}-blocked`} width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#bd3439"/><path d="M0 5L5 0" stroke="#fff" strokeWidth="1" opacity=".6"/></pattern></defs>
      {Array.from({ length: 5 }, (_, index) => {
        const value = max * index / 4;
        return <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="analytics-grid-line"/><text x={left - 12} y={y(value) + 4} textAnchor="end">{number(value)}</text></g>;
      })}
      {series.map((row, index) => row.date === selectedDay ? <rect key={row.date} x={x(index) - slot / 2} y={top - 7} width={slot} height={chartHeight + 7} fill="#e8f1ff"/> : null)}
      {kind === 'calls' && <line x1={left} x2={width - right} y1={y(8)} y2={y(8)} className="analytics-baseline"/>}
      {kind !== 'volume' && <path d={line} className="analytics-trend-line"/>}
      {series.map((row, index) => {
        const label = `${fullDate(row.date)}: ${kind === 'memory' ? `${row.cumulativeMemory} cumulative records; ${row.published} published today` : kind === 'calls' ? `${decimal(row.averageCalls)} calls per completed task; ${row.completed} completed tasks` : `${row.tasks} tasks; ${row.completed} completed; ${row.blocked} policy blocked; ${row.rejected} human rejected`}`;
        return <g key={row.date}>
          {kind === 'volume' ? <g><title>{label}</title>
            <rect x={x(index) - slot * .3} y={y(row.completed)} width={slot * .6} height={row.completed / max * chartHeight} fill="#1760bf"/>
            <rect x={x(index) - slot * .3} y={y(row.completed + row.blocked)} width={slot * .6} height={row.blocked / max * chartHeight} fill={`url(#${id}-blocked)`}/>
            <rect x={x(index) - slot * .3} y={y(row.tasks)} width={slot * .6} height={row.rejected / max * chartHeight} fill="#ac6509"/>
          </g> : (kind === 'memory' || row.averageCalls !== null) && <circle cx={x(index)} cy={y(values[index])} r={selectedDay === row.date ? 5 : 3} fill="#fff" stroke="#1760bf" strokeWidth="2"><title>{label}</title></circle>}
          {(index === 0 || index === series.length - 1 || index % Math.max(1, Math.floor(series.length / 5)) === 0) && <text x={x(index)} y={height - 13} textAnchor="middle">{date(row.date)}</text>}
        </g>;
      })}
    </svg>
    <div className="analytics-chart-caption"><span>{COPY[kind].unit}</span><span>UTC dates · historical period</span></div>
  </div>;
}

export function AnalyticsDetails({ kind, scenario, playback, onBack, onInspect }: AnalyticsDetailsProps) {
  const [department, setDepartment] = useState<Department | 'All'>('All');
  const [days, setDays] = useState<7 | 14 | 30>(30);
  const [day, setDay] = useState('');
  const [page, setPage] = useState(0);
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [dayOrder, setDayOrder] = useState<'oldest' | 'newest'>('oldest');
  const [currentExpanded, setCurrentExpanded] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const recordsHeading = useRef<HTMLHeadingElement>(null);
  const filters = useMemo<AnalyticsFilters>(() => ({ department, days, day }), [department, days, day]);
  const report = useMemo(() => historicalAnalytics(scenario, filters), [scenario, filters]);
  const teams = useMemo(() => departmentAnalytics(scenario, filters), [scenario, filters]);
  const current = useMemo(() => currentAnalytics(playback, department), [playback, department]);
  const totals = report.totals;
  const copy = COPY[kind]; const Icon = copy.icon;
  useEffect(() => { setPage(0); }, [department, days, day, order, kind]);
  useEffect(() => { heading.current?.focus(); }, [kind]);
  const clearFilters = () => { setDepartment('All'); setDays(30); setDay(''); setPage(0); };
  const chooseDay = (value: string) => { setDay(value); setPage(0); };
  const inspectDay = (value: string) => { chooseDay(value); recordsHeading.current?.scrollIntoView({ behavior: 'auto', block: 'start' }); recordsHeading.current?.focus({ preventScroll: true }); };
  const teamValue = (row: typeof teams[number]) => kind === 'memory' ? row.published : kind === 'calls' ? row.averageCalls || 0 : row.tasks;
  const rankedTeams = [...teams].sort((a, b) => teamValue(b) - teamValue(a));
  const largestTeamValue = Math.max(...teams.map(teamValue), 1);
  const selectedRange = report.start === report.end ? fullDate(report.start) : `${date(report.start)} – ${fullDate(report.end)}`;
  const memoryRecords = order === 'newest' ? report.memories : [...report.memories].reverse();
  const sourceTasks = kind === 'calls' ? report.completedTasks : report.tasks;
  const taskRecords = order === 'newest' ? sourceTasks : [...sourceTasks].reverse();
  const count = kind === 'memory' ? memoryRecords.length : taskRecords.length;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const activePage = Math.min(page, totalPages - 1);
  const startIndex = activePage * PAGE_SIZE;
  const dailyRows = dayOrder === 'oldest' ? report.series : [...report.series].reverse();
  const metrics = kind === 'memory' ? [
    { label: 'Published in selection', value: number(totals.published), detail: 'Released by a named human reviewer' },
    { label: 'Available at period end', value: number(totals.closingMemory), detail: `${number(totals.openingMemory)} already available at period start` },
    { label: 'Completed tasks using context', value: number(totals.tasksReusingMemory), detail: `${number(totals.reuseReferences)} record references across completed tasks` },
    { label: 'Reviewers represented', value: number(new Set(report.memories.map(memory => memory.reviewer)).size), detail: 'Unique reviewers of selected published records' },
  ] : kind === 'calls' ? [
    { label: 'Modeled calls per task', value: decimal(totals.averageCalls), detail: `${number(totals.calls)} calls ÷ ${number(totals.completed)} completed tasks` },
    { label: 'Assumed calls per task', value: '8', detail: `${number(totals.baseline)} baseline calls for selected completed work` },
    { label: 'Modeled calls avoided', value: number(totals.avoided), detail: totals.baseline ? `${decimal(totals.avoided / totals.baseline * 100)}% below the scenario baseline` : 'No completed work in this selection' },
    { label: 'Completed tasks', value: number(totals.completed), detail: 'Blocked, rejected and unfinished work excluded' },
  ] : [
    { label: 'Tasks in selection', value: number(totals.tasks), detail: `${department === 'All' ? 'All six departments' : department} · originating team only` },
    { label: 'Completed', value: number(totals.completed), detail: totals.tasks ? `${decimal(totals.completed / totals.tasks * 100)}% of selected tasks` : 'No tasks in this selection' },
    { label: 'Stopped by policy', value: number(totals.blocked), detail: 'Task-level scope denial, not blocked agents' },
    { label: 'Rejected by a human', value: number(totals.rejected), detail: 'Exact requests stopped before tool execution' },
  ];

  return <section className="analytics-detail" data-testid="analytics-detail" data-kind={kind}>
    <button type="button" className="analytics-back" onClick={onBack}><ArrowLeft aria-hidden="true"/>Back to overview</button>
    <header className="analytics-page-heading">
      <div><span className="analytics-eyebrow"><Icon aria-hidden="true"/>COMPANY ANALYTICS</span><h1 ref={heading} tabIndex={-1}>{copy.title}</h1><p>{copy.subtitle}</p></div>
      <span className="analytics-period-badge"><Clock3 aria-hidden="true"/>30-day history</span>
    </header>

    <div className="analytics-filters" aria-label="Analytics filters">
      <label>Department<select value={department} onChange={event => { setDepartment(event.target.value as Department | 'All'); setPage(0); }}><option value="All">All departments</option>{DEPARTMENTS.map(team => <option key={team}>{team}</option>)}</select></label>
      <label>Historical window<select value={days} onChange={event => { setDays(Number(event.target.value) as 7 | 14 | 30); setDay(''); setPage(0); }}><option value={30}>Last 30 historical days</option><option value={14}>Last 14 historical days</option><option value={7}>Last 7 historical days</option></select></label>
      <label>Day<select value={report.activeDay} onChange={event => chooseDay(event.target.value)}><option value="">Every day in window</option>{report.dates.map(value => <option key={value} value={value}>{fullDate(value)}</option>)}</select></label>
      <button type="button" onClick={clearFilters} disabled={department === 'All' && days === 30 && !day}>Reset filters</button>
    </div>
    <div className="analytics-scope" aria-live="polite"><ListFilter aria-hidden="true"/><strong>{department === 'All' ? 'Entire company' : department}</strong><span>{selectedRange}</span><span>Historical records · UTC</span></div>

    <div className="analytics-metrics">{metrics.map(metric => <article className="analytics-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</div>

    <div className="analytics-main-grid">
      <section className="analytics-panel analytics-trend-panel"><header><div><h2>{copy.chart}</h2><p>{report.activeDay ? 'Selected day highlighted. The surrounding window remains visible for context.' : 'Daily history, with exact values and inspectable records below.'}</p></div></header>
        <AnalyticsChart kind={kind} series={report.series} selectedDay={report.activeDay}/>
        <details className="analytics-daily-data"><summary>View daily data and inspect a day <span>{report.series.length} days</span></summary>
          <div className="analytics-table-scroll" tabIndex={0} role="region" aria-label="Daily analytics values"><table><caption>Historical daily values, {date(report.dates[0])} to {fullDate(report.dates.at(-1)!)}</caption><thead><tr><th scope="col" aria-sort={dayOrder === 'oldest' ? 'ascending' : 'descending'}><button type="button" onClick={() => setDayOrder(dayOrder === 'oldest' ? 'newest' : 'oldest')}>Date {dayOrder === 'oldest' ? '↑' : '↓'}</button></th>{kind === 'memory' ? <><th scope="col">Published that day</th><th scope="col">Cumulative records</th><th scope="col">Context references</th></> : kind === 'calls' ? <><th scope="col">Completed tasks</th><th scope="col">Modeled calls</th><th scope="col">Calls / completed task</th><th scope="col">Baseline calls</th></> : <><th scope="col">Tasks</th><th scope="col">Completed</th><th scope="col">Policy blocked</th><th scope="col">Human rejected</th></>}<th scope="col">Records</th></tr></thead><tbody>{dailyRows.map(row => <tr key={row.date} className={row.date === report.activeDay ? 'is-selected' : ''}><th scope="row">{date(row.date)}</th>{kind === 'memory' ? <><td>{row.published}</td><td>{row.cumulativeMemory}</td><td>{row.reused}</td></> : kind === 'calls' ? <><td>{row.completed}</td><td>{row.calls}</td><td>{decimal(row.averageCalls)}</td><td>{row.baseline}</td></> : <><td>{row.tasks}</td><td>{row.completed}</td><td>{row.blocked}</td><td>{row.rejected}</td></>}<td><button type="button" onClick={() => inspectDay(row.date)} aria-label={`Inspect records for ${fullDate(row.date)}`}>Inspect day<ArrowRight aria-hidden="true"/></button></td></tr>)}</tbody></table></div>
        </details>
      </section>
      <aside className="analytics-panel analytics-team-panel"><header><div><h2>{copy.comparison}</h2><p>Same date selection. Choose a team to focus the page.</p></div></header>
        <div className="analytics-team-list">{rankedTeams.map(row => <button type="button" key={row.department} className={department === row.department ? 'is-selected' : ''} aria-pressed={department === row.department} onClick={() => { setDepartment(department === row.department ? 'All' : row.department); setPage(0); }}><span><strong>{row.department}</strong><b>{kind === 'calls' ? decimal(row.averageCalls) : number(teamValue(row))}</b></span><span className="analytics-team-track"><i style={{ width: `${teamValue(row) / largestTeamValue * 100}%` }}/></span><small>{kind === 'calls' ? `${row.completed} completed tasks` : kind === 'memory' ? 'Published records owned by this team' : `${row.completed} completed · ${row.blocked + row.rejected} stopped`}</small></button>)}</div>
      </aside>
    </div>

    <section className="analytics-method"><Info aria-hidden="true"/><div><strong>{kind === 'calls' ? 'How to read the reduction' : kind === 'memory' ? 'Knowledge is reviewed; authority is not inherited' : 'A policy stop is a work outcome, not an agent block'}</strong><p>{kind === 'calls' ? 'This scenario assumes 8 tool calls per completed task and subtracts one call per reused context record, up to 5. The historical period uses up to 4. These are modeled savings, not measured API traffic or evidence of a causal production improvement.' : kind === 'memory' ? 'Only published, human-reviewed records appear in this history. Shared records count once under their originating team. Context can inform a task, but never replaces its mandate or exact-action approval.' : 'Completed, policy-blocked and human-rejected tasks are counted once under the originating team. A cross-team review does not create a second task and is not a human approval.'}</p><details><summary>Calculation and period boundaries</summary><p>History covers the 30 complete UTC days before {fullDate(scenario.anchor)}. Shorter windows retain earlier published records in the cumulative memory balance. Call averages use total calls divided by completed tasks, not an average of daily averages. Current playback is shown separately below and is not added to the historical charts.</p></details></div></section>

    <section className="analytics-panel analytics-records"><header><div><h2 ref={recordsHeading} tabIndex={-1}>{copy.section}</h2><p>{number(count)} records · {selectedRange}. Reveal a private field or inspect its full context.</p></div><label>Record order<select value={order} onChange={event => setOrder(event.target.value as 'newest' | 'oldest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></header>
      {count === 0 ? <div className="analytics-empty"><BookOpen aria-hidden="true"/><h3>No {kind === 'memory' ? 'published memory' : kind === 'calls' ? 'completed task' : 'task'} records in this selection</h3><p>Choose another day or department to inspect the available history.</p><button type="button" onClick={clearFilters}>Show all historical records</button></div> : <>
        <div className="analytics-table-scroll" tabIndex={0} role="region" aria-label="Supporting historical records"><table><caption>{copy.section}</caption><thead><tr><th scope="col">{kind === 'memory' ? 'Reviewed memory' : 'Task'}</th><th scope="col">Department</th><th scope="col">{kind === 'memory' ? 'Reviewer' : 'Accountable human'}</th><th scope="col">{kind === 'memory' ? 'Published' : 'Created'}</th><th scope="col">{kind === 'memory' ? 'Reuse boundary' : 'Outcome'}</th>{kind === 'calls' && <th scope="col">Call calculation</th>}<th scope="col">Inspect</th></tr></thead><tbody>
          {kind === 'memory' ? memoryRecords.slice(startIndex, startIndex + PAGE_SIZE).map(memory => <tr key={memory.id}><td><div className="analytics-record-identity"><strong><PrivateField value={memory.title} label="Memory title"/></strong><PrivateField value={memory.id} label="Memory ID"/></div></td><td>{memory.department}</td><td><PrivateField value={personName(scenario, memory.reviewer)} label="Reviewer name"/></td><td>{date(memory.created)}</td><td><span className="analytics-state is-completed"><ShieldCheck aria-hidden="true"/>Published</span><small className="analytics-cell-note">{memory.allowedTeams.join(' + ')} · v{memory.version}</small></td><td><div className="analytics-record-actions"><button type="button" onClick={() => onInspect({ kind: 'memory', id: memory.id })}>Memory<ArrowRight aria-hidden="true"/></button><button type="button" onClick={() => onInspect({ kind: 'task', id: memory.task })}>Source task<ArrowRight aria-hidden="true"/></button></div></td></tr>) : taskRecords.slice(startIndex, startIndex + PAGE_SIZE).map(task => <tr key={task.id}><td><div className="analytics-record-identity"><strong><PrivateField value={task.title} label="Task title"/></strong><PrivateField value={task.id} label="Task ID"/></div></td><td>{task.department}<small className="analytics-cell-note">Peer review: {task.peer}</small></td><td><PrivateField value={personName(scenario, task.owner)} label="Accountable human"/></td><td>{date(task.created)}</td><td><span className={`analytics-state is-${task.stage.toLowerCase()}`}>{task.stage}</span></td>{kind === 'calls' && <td><strong>{task.baseline} − {task.reused} = {task.calls}</strong><small className="analytics-cell-note">Baseline − context reuse = modeled calls</small></td>}<td><button type="button" onClick={() => onInspect({ kind: 'task', id: task.id })}>Inspect<ArrowRight aria-hidden="true"/></button></td></tr>)}
        </tbody></table></div>
        <footer className="analytics-pagination"><span>Showing {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, count)} of {number(count)}</span><div><button type="button" onClick={() => setPage(activePage - 1)} disabled={activePage === 0} aria-label="Previous records page"><ChevronLeft aria-hidden="true"/></button><span>Page {activePage + 1} of {totalPages}</span><button type="button" onClick={() => setPage(activePage + 1)} disabled={activePage + 1 >= totalPages} aria-label="Next records page"><ChevronRight aria-hidden="true"/></button></div></footer>
      </>}
    </section>

    <section className="analytics-panel analytics-current"><header><div><span className="analytics-eyebrow">SEPARATE FROM HISTORICAL TOTALS</span><h2>Current playback</h2><p>Retained current-run records for {department === 'All' ? 'all departments' : department}. The historical date filter does not apply here.</p></div><span className="analytics-period-badge">Cycle {playback.cycle} · step {playback.tick}</span></header>
      <div className="analytics-current-metrics"><div><strong>{current.active}</strong><span>Active tasks</span></div><div><strong>{current.held}</strong><span>Awaiting action or memory review</span></div><div><strong>{current.completed}</strong><span>Completed tasks retained</span></div><div><strong>{kind === 'memory' ? current.published : kind === 'calls' ? decimal(current.averageCalls) : current.blocked}</strong><span>{kind === 'memory' ? 'Published memory retained' : kind === 'calls' ? 'Modeled calls / completed task' : 'Policy-blocked tasks retained'}</span></div></div>
      <div className="analytics-current-rows">{current.tasks.slice(0, currentExpanded ? current.tasks.length : 3).map(task => <div className="analytics-current-row" key={task.id}><span><PrivateField value={task.title} label="Current task title"/><small>{task.department} · {task.stage}</small></span><button type="button" onClick={() => onInspect({ kind: 'task', id: task.id })}>Inspect<PrivateText value={task.id}/><ArrowRight aria-hidden="true"/></button></div>)}</div>
      {current.tasks.length > 3 && <button type="button" className="analytics-current-toggle" aria-expanded={currentExpanded} onClick={() => setCurrentExpanded(!currentExpanded)}>{currentExpanded ? 'Show fewer current tasks' : `Show all ${current.tasks.length} retained current tasks`}</button>}
      {!current.tasks.length && <p className="analytics-current-empty">No current-run tasks in this department yet. Historical records remain available above.</p>}
      <p className="analytics-retention-note">The rolling engine retains up to 80 finished tasks plus the current 20-task cohort and up to 160 memory records. These are retained-record counts, not lifetime totals.</p>
    </section>
  </section>;
}
