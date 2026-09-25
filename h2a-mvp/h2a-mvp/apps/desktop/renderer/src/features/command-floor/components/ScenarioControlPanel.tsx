import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, PauseCircle, Play, RotateCcw, ShieldAlert, Timer, Workflow, XCircle } from 'lucide-react';
import type { MandateState, ScenarioOutcome, ScenarioRun, ScenarioState } from '@h2a/contracts';

interface ScenarioControlPanelProps {
  state: ScenarioState;
  mandates: MandateState;
  onStateChange(state: ScenarioState): void;
  onWorkspaceRefresh(): void;
  onMandatesRequested(): void;
}

const outcomeLabels: Record<ScenarioOutcome, string> = {
  normal: 'Successful run', denied: 'Policy denial', approval: 'Human approval',
  failure: 'Provider failure', timeout: 'Execution timeout', revocation: 'Authority revocation'
};

export function ScenarioControlPanel({ state, mandates, onStateChange, onWorkspaceRefresh, onMandatesRequested }: ScenarioControlPanelProps): React.JSX.Element {
  const definition = state.definitions[0];
  const roots = useMemo(() => mandates.mandates.filter((mandate) => !mandate.parentMandateId), [mandates.mandates]);
  const [rootMandateId, setRootMandateId] = useState(roots[0]?.mandateId ?? '');
  const [outcome, setOutcome] = useState<ScenarioOutcome>('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = state.runs[0];

  useEffect(() => {
    if (!roots.some((root) => root.mandateId === rootMandateId)) setRootMandateId(roots[0]?.mandateId ?? '');
  }, [rootMandateId, roots]);

  async function execute(kind: 'start' | 'resume'): Promise<void> {
    if (!window.h2a || !definition || (kind === 'start' && !rootMandateId) || (kind === 'resume' && !run)) return;
    setBusy(true); setError('');
    try {
      const next = kind === 'start'
        ? await window.h2a.startScenario({ scenarioId: definition.scenarioId, rootMandateId, outcome })
        : await window.h2a.resumeScenario({ runId: run.runId });
      onStateChange(next);
      onWorkspaceRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Scenario execution failed.');
    } finally { setBusy(false); }
  }

  const available = Boolean(window.h2a && definition);
  const hasDelegation = mandates.mandates.some((mandate) => mandate.parentMandateId === rootMandateId);
  const canStart = available && Boolean(rootMandateId) && hasDelegation && !busy;

  return (
    <section className="scenario-console" aria-labelledby="scenario-title">
      <header className="scenario-header">
        <div className="scenario-heading"><span className="scenario-mark"><Workflow size={19} /></span><div><p className="section-kicker">GOVERNED RUNTIME</p><h2 id="scenario-title">Enterprise scenario runner</h2></div></div>
        <div className="adapter-status" aria-label="Runtime adapter availability">
          {state.adapters.map((adapter) => <span key={adapter.mode} className={adapter.available ? 'adapter-ready' : ''}><i />{adapter.label}</span>)}
        </div>
      </header>

      <div className="scenario-body">
        <div className="scenario-controls">
          <label className="field">Root authority<select value={rootMandateId} onChange={(event) => setRootMandateId(event.target.value)}>{roots.length === 0 && <option value="">No root mandate</option>}{roots.map((root) => <option key={root.mandateId} value={root.mandateId}>{root.subject.agentId} / {root.status}</option>)}</select></label>
          <label className="field">Deterministic outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value as ScenarioOutcome)}>{(definition?.supportedOutcomes ?? Object.keys(outcomeLabels) as ScenarioOutcome[]).map((item) => <option key={item} value={item}>{outcomeLabels[item]}</option>)}</select></label>
          <button data-control-id="command-floor.scenario.run" className="primary-button scenario-run-button" type="button" disabled={!canStart} onClick={() => void execute('start')}><Play size={16} />{busy ? 'Running...' : 'Run rehearsal'}</button>
        </div>

        {!available && <div className="scenario-notice"><ShieldAlert size={17} /><span>Scenario execution is available in the local desktop runtime.</span></div>}
        {available && roots.length === 0 && <button className="scenario-notice scenario-link" type="button" onClick={onMandatesRequested}><ShieldAlert size={17} /><span>Create a signed root mandate and delegated child authority first.</span></button>}
        {available && roots.length > 0 && !hasDelegation && <button className="scenario-notice scenario-link" type="button" onClick={onMandatesRequested}><ShieldAlert size={17} /><span>Delegate bounded authority from this root before running the scenario.</span></button>}
        {error && <div className="inline-error" role="alert">{error}</div>}

        <ScenarioRunSummary run={run} busy={busy} onResume={() => void execute('resume')} onMandatesRequested={onMandatesRequested} />
      </div>
    </section>
  );
}

function ScenarioRunSummary({ run, busy, onResume, onMandatesRequested }: { run?: ScenarioRun; busy: boolean; onResume(): void; onMandatesRequested(): void }): React.JSX.Element {
  if (!run) return <div className="scenario-empty"><Circle size={16} /><span>No scenario run recorded. The first run will create governed assignments, messages, responses, and evidence.</span></div>;
  const StatusIcon = run.status === 'succeeded' ? CheckCircle2 : run.status === 'running' ? Timer : run.status === 'approval-required' ? PauseCircle : XCircle;
  return (
    <div className="scenario-run">
      <div className="scenario-run-summary"><StatusIcon size={18} /><div><strong>{outcomeLabels[run.requestedOutcome]}</strong><span>{run.status.replaceAll('-', ' ')} / {run.steps.length} governed steps</span></div><code>{run.runId.slice(-8)}</code></div>
      <ol className="scenario-steps">{run.steps.map((step) => <li key={step.stepId} className={`scenario-step scenario-step-${step.status}`}><span>{step.sequence}</span><div><strong>{step.action}</strong><small>{step.status.replaceAll('-', ' ')}{step.reasonCode ? ` / ${step.reasonCode}` : ''}</small></div></li>)}</ol>
      {run.status === 'approval-required' && <div className="scenario-approval"><span>Resolve the pending Human Approval in Mandates, then resume this rehearsal.</span><button className="secondary-button" type="button" onClick={onMandatesRequested}>Open Mandates</button><button data-control-id="command-floor.scenario.resume" className="primary-button" type="button" disabled={busy} onClick={onResume}><RotateCcw size={15} /> Resume rehearsal</button></div>}
    </div>
  );
}
