import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, EyeOff, FileKey2, KeyRound, LoaderCircle, Play, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { CeremonyState, LeastContextLane, LeastContextState } from '@h2a/contracts';
import { resolveLeastContextActor } from './leastContextAuthority';

interface Props { ceremony: CeremonyState; onProofRequired(): void; onContextRefresh(): void; }

export function LeastContextConsole({ ceremony, onProofRequired, onContextRefresh }: Props): React.JSX.Element {
  const [state, setState] = useState<LeastContextState | null>(null);
  const [showPrepare, setShowPrepare] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState('');
  const activeCeremony = ceremony.sessions.find((item) => item.ceremony_id === ceremony.active_ceremony_id);
  const prepared = Boolean(activeCeremony && state?.ceremony_id === activeCeremony.ceremony_id && state.trace_id === activeCeremony.trace_id && state.artifact_id);
  const nextLane = useMemo(() => state?.lanes.find((lane, index) => lane.status === 'ready' && state.lanes.slice(0, index).every((prior) => prior.status === 'acknowledged')), [state]);

  const refresh = useCallback(async (announce = false) => {
    if (!window.h2a) return;
    try { setState(await window.h2a.getLeastContextState()); if (announce) setRefreshedAt(new Date().toLocaleTimeString()); }
    catch (cause) { setError(errorMessage(cause)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function run(lane: LeastContextLane): Promise<void> {
    if (!window.h2a || !activeCeremony) return;
    setBusy(true); setError('');
    try { setState(await window.h2a.runLeastContextLane({ ceremony: correlation(activeCeremony.ceremony_id, activeCeremony.trace_id, `run_${lane.lane_id}`), lane_id: lane.lane_id })); onContextRefresh(); }
    catch (cause) { setError(errorMessage(cause)); await refresh(); }
    finally { setBusy(false); }
  }

  async function proveRevocation(): Promise<void> {
    if (!window.h2a || !activeCeremony) return;
    setBusy(true); setError('');
    try {
      const actor = resolveLeastContextActor(await window.h2a.getOrganizationAuthorityState());
      if (!actor) { onProofRequired(); return; }
      setState(await window.h2a.proveLeastContextRevocation({ actor, ceremony: correlation(activeCeremony.ceremony_id, activeCeremony.trace_id, 'revoke_claude'), lane_id: 'claude-code' })); onContextRefresh();
    }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <section className="least-context-console" aria-labelledby="least-context-title">
    <header><div><p className="section-kicker">PHASE 27 / LEAST-CONTEXT COLLABORATION</p><h2 id="least-context-title">Governed disclosures and signed handoffs</h2><p>Each connector receives only its authorized projection plus predecessor hashes. Values remain excluded from durable outputs.</p></div><div className="least-context-actions">{refreshedAt && <span role="status">Refreshed {refreshedAt}</span>}<button data-control-id="phase27.refresh" className="icon-button" type="button" title="Refresh Phase 27" aria-label="Refresh Phase 27" onClick={() => void refresh(true)} disabled={busy}><RefreshCw size={17} /></button></div></header>
    {!activeCeremony && <div className="least-context-blocker">Complete the Phase 24 ceremony before preparing Phase 27.</div>}
    {activeCeremony && !prepared && <div className="least-context-start"><div><FileKey2 size={20} /><span><strong>Protected artifact required</strong><small>Enter real demonstration values. H2A seals them before creating four non-identical Context Grants.</small></span></div><button data-control-id="phase27.prepare.open" className="primary-button" type="button" onClick={() => setShowPrepare(true)} disabled={busy}><Play size={16} /> Prepare Phase 27</button></div>}
    {prepared && state && <>
      <div className="least-context-trace"><span>Ceremony <code>{state.ceremony_id}</code></span><span>Shared trace <code>{state.trace_id}</code></span><span>Artifact <code>{state.artifact_id}</code></span><span>Trust <strong>Connected-observed ceiling</strong></span></div>
      <div className="least-context-recovery"><div><KeyRound size={18} /><span><strong>Protected-material recovery</strong><small>Re-seal the five values and rotate connector keys if operating-system encryption can no longer open them.</small></span></div><button data-control-id="phase27.recover.open" className="secondary-button" type="button" disabled={busy} onClick={() => { setRecovering(true); setShowPrepare(true); }}><KeyRound size={15} /> Re-seal protected context</button></div>
      <div className="least-context-lanes">{state.lanes.map((lane, index) => <Lane key={lane.lane_id} lane={lane} index={index + 1} canRun={nextLane?.lane_id === lane.lane_id} busy={busy} onRun={() => void run(lane)} />)}</div>
      {state.status === 'succeeded' && !state.revocation.passed && <div className="least-context-revocation"><div><Ban size={18} /><span><strong>Revocation propagation checkpoint</strong><small>Revoke Claude's grant and attempt a fresh disclosure. The provider process must not launch.</small></span></div><button data-control-id="phase27.revocation.prove" className="secondary-button" type="button" onClick={() => void proveRevocation()} disabled={busy}><Ban size={15} /> Prove fail-closed revocation</button></div>}
      {state.revocation.passed && <div className="least-context-passed"><ShieldCheck size={18} /><span><strong>Revocation blocked delivery</strong><small>{state.revocation.reason_code} · denial {state.revocation.disclosure_id} · provider launch blocked</small></span></div>}
    </>}
    {error && <div className="inline-error" role="alert">{error}</div>}
    {showPrepare && activeCeremony && <PrepareDialog ceremonyId={activeCeremony.ceremony_id} traceId={activeCeremony.trace_id} recoveryMode={recovering} onProofRequired={onProofRequired} onClose={() => { setShowPrepare(false); setRecovering(false); }} onPrepared={(next) => { setState(next); setShowPrepare(false); setRecovering(false); onContextRefresh(); }} />}
  </section>;
}

function Lane({ lane, index, canRun, busy, onRun }: { lane: LeastContextLane; index: number; canRun: boolean; busy: boolean; onRun(): void }): React.JSX.Element {
  return <article className={`least-context-lane least-context-lane-${lane.status}`}><div className="lane-order">{lane.status === 'acknowledged' ? <CheckCircle2 size={17} /> : lane.status === 'running' ? <LoaderCircle className="spin" size={17} /> : index}</div><div><div className="least-context-lane-title"><strong>{lane.title}</strong><span>{lane.status}</span></div><dl><div><dt>Requested</dt><dd>{lane.requested_fields.join(', ')}</dd></div><div><dt>Released</dt><dd>{lane.released_fields.length ? lane.released_fields.join(', ') : 'Pending'}</dd></div><div><dt>Withheld</dt><dd>{lane.withheld_fields.length ? lane.withheld_fields.join(', ') : 'Pending'}</dd></div><div><dt>Budget / use</dt><dd>{lane.token_budget} tokens · {lane.use_count}/2 uses</dd></div></dl>{lane.projection_hash && <div className="least-context-receipts"><code>{lane.projection_hash}</code><small>{lane.projected_tokens ?? 0} projected tokens · {lane.predecessor_hashes.length} predecessor hashes · {lane.execution_kind ?? 'execution pending'} · signed acknowledgement</small></div>}{lane.error && <small className="form-error">{lane.error}</small>}</div><button data-control-id="phase27.lane.run" className="secondary-button" type="button" onClick={onRun} disabled={busy || !canRun}><Play size={14} /> Run handoff</button></article>;
}

function PrepareDialog({ ceremonyId, traceId, recoveryMode, onProofRequired, onClose, onPrepared }: { ceremonyId: string; traceId: string; recoveryMode: boolean; onProofRequired(): void; onClose(): void; onPrepared(state: LeastContextState): void }): React.JSX.Element {
  const [values, setValues] = useState({ artifact_name: 'HP incident control record', source_resource: 'hp-demo-control-record', case_id: '', system_name: '', owner_email: '', control_summary: '', recovery_secret: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(): Promise<void> {
    if (!window.h2a) return;
    setBusy(true); setError('');
    try {
      // Human Proof is completed on another route, so resolve authority from the
      // trusted process instead of relying on the renderer snapshot from before it.
      const actor = resolveLeastContextActor(await window.h2a.getOrganizationAuthorityState());
      if (!actor) { onProofRequired(); return; }
      onPrepared(await window.h2a.prepareLeastContext({ actor, ceremony: correlation(ceremonyId, traceId, recoveryMode ? 'recover' : 'prepare'), recovery_mode: recoveryMode, artifact_name: values.artifact_name, source_resource: values.source_resource, fields: { case_id: values.case_id, system_name: values.system_name, owner_email: values.owner_email, control_summary: values.control_summary, recovery_secret: values.recovery_secret } }));
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  const complete = Object.values(values).every((value) => value.trim().length > 0);
  return <div className="modal-scrim"><section className="authority-dialog context-dialog" role="dialog" aria-modal="true" aria-labelledby="phase27-dialog-title"><header><div><h2 id="phase27-dialog-title">{recoveryMode ? 'Re-seal protected context' : 'Prepare least-context workflow'}</h2><p>{recoveryMode ? 'Fresh ciphertext, connector keys, and grants replace the unusable live material. Historical receipts and hashes remain unchanged.' : 'These values are sent to the trusted main process and sealed with operating-system encryption.'}</p></div><button className="icon-button" type="button" title="Close" onClick={onClose}><X size={17} /></button></header><div className="authority-dialog-body"><div className="form-grid"><Field label="Artifact name" value={values.artifact_name} onChange={(value) => setValues({ ...values, artifact_name: value })} /><Field label="Source resource" value={values.source_resource} onChange={(value) => setValues({ ...values, source_resource: value })} /><Field label="Case ID · internal" value={values.case_id} onChange={(value) => setValues({ ...values, case_id: value })} /><Field label="System name · internal" value={values.system_name} onChange={(value) => setValues({ ...values, system_name: value })} /><Field label="Owner email · confidential" value={values.owner_email} onChange={(value) => setValues({ ...values, owner_email: value })} /><Field label="Control summary · confidential" value={values.control_summary} onChange={(value) => setValues({ ...values, control_summary: value })} /><Field label="Recovery secret · restricted" type="password" value={values.recovery_secret} onChange={(value) => setValues({ ...values, recovery_secret: value })} /></div>{error && <p className="form-error">{error}</p>}</div><footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button>{recoveryMode ? <button data-control-id="phase27.recover" className="primary-button" type="button" disabled={!complete || busy} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={16} /> : <EyeOff size={16} />} Re-seal and rotate</button> : <button data-control-id="phase27.prepare" className="primary-button" type="button" disabled={!complete || busy} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={16} /> : <EyeOff size={16} />} Seal and issue grants</button>}</footer></section></div>;
}
function Field({ label, value, type = 'text', onChange }: { label: string; value: string; type?: string; onChange(value: string): void }) { return <label className="field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function correlation(ceremonyId: string, traceId: string, action: string) { return { ceremony_id: ceremonyId, trace_id: traceId, idempotency_key: `phase27_${action}_${Date.now()}` } as const; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Phase 27 operation failed.'; }
