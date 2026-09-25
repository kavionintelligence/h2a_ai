import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle, Play, RefreshCw, Square } from 'lucide-react';
import { isRealCollaborationLaneRunnable, type CeremonyState, type RealCollaborationLane, type RealCollaborationState } from '@h2a/contracts';

interface RealCollaborationConsoleProps {
  ceremony: CeremonyState;
  onWorkspaceRefresh(): void;
}

export function RealCollaborationConsole({ ceremony, onWorkspaceRefresh }: RealCollaborationConsoleProps): React.JSX.Element {
  const [state, setState] = useState<RealCollaborationState | null>(null);
  const [frameworkKind, setFrameworkKind] = useState<'mcp' | 'custom-cli'>('mcp');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState('');
  const [error, setError] = useState('');
  const activeCeremony = ceremony.sessions.find((item) => item.ceremony_id === ceremony.active_ceremony_id);

  const refresh = useCallback(async (announce = false): Promise<void> => {
    if (!window.h2a) return;
    if (announce) { setRefreshing(true); setError(''); }
    try {
      setState(await window.h2a.getRealCollaborationState());
      if (announce) setRefreshedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Phase 26 state could not be loaded.'); }
    finally { if (announce) setRefreshing(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!state?.lanes.some((lane) => lane.status === 'starting' || lane.status === 'running')) return;
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [refresh, state]);

  const preparedForCeremony = Boolean(activeCeremony && state?.ceremony_id === activeCeremony.ceremony_id && state.trace_id === activeCeremony.trace_id);
  const authorityReplacementRequired = Boolean(state && state.lanes.every((lane) => lane.passport_id && lane.runtime_session_id) && !state.lanes.some((lane) => ['starting', 'running'].includes(lane.status)) && state.lanes.some((lane) => !lane.mandate_id || !lane.assignment_id || lane.detail.includes('mandate projection requires repair')));

  async function prepare(): Promise<void> {
    if (!window.h2a || !activeCeremony) return;
    setBusy(true); setError('');
    try {
      setState(await window.h2a.prepareRealCollaboration({
        ceremony: correlation(activeCeremony.ceremony_id, activeCeremony.trace_id, 'preflight'),
        framework_kind: frameworkKind
      }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Phase 26 preflight failed.'); }
    finally { setBusy(false); }
  }

  async function runLane(lane: RealCollaborationLane): Promise<void> {
    if (!window.h2a || !activeCeremony) return;
    setBusy(true); setError('');
    try {
      const next = await window.h2a.runRealCollaborationLane({
        ceremony: correlation(activeCeremony.ceremony_id, activeCeremony.trace_id, `run_${lane.lane_id}`),
        lane_id: lane.lane_id
      });
      setState(next);
      onWorkspaceRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${lane.title} failed.`);
      await refresh();
    } finally { setBusy(false); }
  }

  async function replaceAuthority(): Promise<void> {
    if (!window.h2a || !activeCeremony) return;
    setBusy(true); setError('');
    try {
      setState(await window.h2a.replaceRealCollaborationAuthority({ ceremony: correlation(activeCeremony.ceremony_id, activeCeremony.trace_id, 'replace_authority') }));
      onWorkspaceRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Expired authority could not be replaced.'); }
    finally { setBusy(false); }
  }

  async function cancel(lane: RealCollaborationLane): Promise<void> {
    if (!window.h2a || !activeCeremony) return;
    setBusy(true); setError('');
    try {
      setState(await window.h2a.cancelRealCollaborationLane({
        ceremony: correlation(activeCeremony.ceremony_id, activeCeremony.trace_id, `cancel_${lane.lane_id}`),
        lane_id: lane.lane_id,
        reason: 'Operator requested cancellation from the Phase 26 console.'
      }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Cancellation failed.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="real-collaboration" aria-labelledby="real-collaboration-title">
      <header>
        <div><p className="section-kicker">PHASE 26 / REAL COLLABORATION</p><h2 id="real-collaboration-title">Signed multi-agent execution</h2><p>Run any ready lane. Each receives hashes from successful lanes already completed on this ceremony trace.</p></div>
        <div className="collaboration-refresh">
          {refreshedAt && <span role="status" aria-live="polite">Refreshed {refreshedAt}</span>}
          <button data-control-id="phase26.refresh" className="icon-button" type="button" title="Refresh collaboration state" aria-label="Refresh collaboration state" onClick={() => void refresh(true)} disabled={busy || refreshing}>{refreshing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}</button>
        </div>
      </header>
      {!activeCeremony && <div className="collaboration-blocker"><CircleAlert size={18} /><span>Create the Phase 24 ceremony before running provider work.</span></div>}
      {activeCeremony && !preparedForCeremony && (
        <div className="collaboration-preflight">
          <div><strong>Execution preflight required</strong><span>Checks executable, version, authentication, Passport, session, mandate, assignment, workspace, cancellation, and trust ceiling.</span></div>
          <div className="framework-switch" role="group" aria-label="Framework transport">
            <button data-control-id="phase26.framework.mcp" type="button" className={frameworkKind === 'mcp' ? 'active' : ''} onClick={() => setFrameworkKind('mcp')}>MCP</button>
            <button data-control-id="phase26.framework.custom-cli" type="button" className={frameworkKind === 'custom-cli' ? 'active' : ''} onClick={() => setFrameworkKind('custom-cli')}>Custom CLI</button>
          </div>
          <button data-control-id="phase26.preflight" className="primary-button" type="button" onClick={() => void prepare()} disabled={busy}><Play size={16} /> Run preflight</button>
        </div>
      )}
      {preparedForCeremony && state && (
        <>
          <div className="collaboration-trace"><span>Ceremony <code>{state.ceremony_id}</code></span><span>Shared trace <code>{state.trace_id}</code></span><span>Framework <strong>{state.framework_kind === 'mcp' ? 'Official MCP SDK' : 'Signed custom CLI'}</strong></span><span>Trust <strong>Connected-observed ceiling</strong></span></div>
          {authorityReplacementRequired && <div className="collaboration-authority"><div><KeyRound size={18} /><span><strong>Signed authority requires repair</strong><small>Requires a fresh Administrator / Approver Human Proof. Active signed scope is preserved while expired or stale projections are replaced.</small></span></div><button data-control-id="phase26.authority.replace" className="primary-button" type="button" onClick={() => void replaceAuthority()} disabled={busy}><KeyRound size={16} /> Repair signed authority</button></div>}
          <div className="collaboration-lanes">
            {state.lanes.map((lane, index) => <Lane key={lane.lane_id} lane={lane} index={index + 1} busy={busy} canRun={isRealCollaborationLaneRunnable(lane, state.lanes)} onRun={() => void runLane(lane)} onCancel={() => void cancel(lane)} />)}
          </div>
        </>
      )}
      {error && <div className="inline-error" role="alert">{error}</div>}
    </section>
  );
}

function Lane({ lane, index, busy, canRun, onRun, onCancel }: { lane: RealCollaborationLane; index: number; busy: boolean; canRun: boolean; onRun(): void; onCancel(): void }): React.JSX.Element {
  const active = lane.status === 'starting' || lane.status === 'running';
  return <article className={`collaboration-lane collaboration-lane-${lane.status}`}>
    <div className="lane-order">{lane.status === 'succeeded' ? <CheckCircle2 size={17} /> : active ? <LoaderCircle className="spin" size={17} /> : index}</div>
    <div className="lane-copy"><div><strong>{lane.title}</strong><span className={`lane-status lane-status-${lane.status}`}>{lane.status}</span></div><p>{lane.detail}</p><dl><div><dt>Provider</dt><dd>{lane.provider}</dd></div><div><dt>Health</dt><dd>{lane.health}</dd></div><div><dt>Version</dt><dd>{lane.version ?? 'Framework-owned'}</dd></div><div><dt>Authority</dt><dd>{authoritySummary(lane)}</dd></div></dl>{lane.output_hash && <code className="lane-output">{lane.output_hash}</code>}{lane.error && <small>{lane.error}</small>}</div>
    <div className="lane-action">{active && lane.lane_id !== 'framework' ? <button data-control-id="phase26.lane.cancel" className="secondary-button" type="button" onClick={onCancel} disabled={busy}><Square size={14} /> Cancel</button> : <button data-control-id="phase26.lane.run" className="secondary-button" type="button" onClick={onRun} disabled={busy || !canRun}><Play size={14} /> {['failed', 'cancelled', 'timed-out'].includes(lane.status) ? 'Retry' : 'Run'}</button>}</div>
  </article>;
}

function authoritySummary(lane: RealCollaborationLane): string {
  return [
    `Passport ${lane.passport_id ? 'ready' : 'missing'}`,
    `Session ${lane.runtime_session_id ? 'ready' : 'missing'}`,
    `Mandate ${lane.mandate_id ? 'ready' : 'missing'}`,
    `Assignment ${lane.assignment_id ? 'ready' : 'missing'}`
  ].join(' · ');
}

function correlation(ceremonyId: string, traceId: string, action: string) {
  return { ceremony_id: ceremonyId, trace_id: traceId, idempotency_key: `phase26_${action}_${Date.now()}` };
}
