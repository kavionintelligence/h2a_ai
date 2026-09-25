import { AlertTriangle, CheckCircle2, LoaderCircle, Play, RotateCcw, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FinalAcceptanceAttackId, SecurityValidationState } from '@h2a/contracts';

const attackLabels: Record<FinalAcceptanceAttackId, string> = {
  replay: 'Replay request',
  'forged-approval': 'Forged approval',
  'over-broad-delegation': 'Over-broad delegation',
  'context-leakage': 'Context leakage',
  tamper: 'Federation tamper',
  'provider-failure': 'Provider failure'
};

interface Props { onWorkspaceRefresh(): Promise<void>; }

export function SecurityValidationConsole({ onWorkspaceRefresh }: Props): React.JSX.Element {
  const [state, setState] = useState<SecurityValidationState | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const refresh = async (): Promise<void> => {
    if (!window.h2a) return;
    setState(await window.h2a.getSecurityValidationState());
  };
  useEffect(() => { void refresh(); }, []);

  const runAttack = async (attackId: FinalAcceptanceAttackId): Promise<void> => {
    if (!window.h2a) return;
    setBusy(attackId); setError('');
    try { setState(await window.h2a.runSecurityAttack({ attack_id: attackId })); await onWorkspaceRefresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Security challenge failed.'); await refresh(); }
    finally { setBusy(''); }
  };

  const runContainment = async (controlId: 'operator-cancel' | 'authority-revocation' | 'restart-recovery'): Promise<void> => {
    if (!window.h2a) return;
    setBusy(controlId); setError('');
    try { setState(await window.h2a.runContainmentControl({ control_id: controlId })); await onWorkspaceRefresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Containment control failed.'); await refresh(); }
    finally { setBusy(''); }
  };

  if (!state) return <section className="security-console"><LoaderCircle className="spin" size={20} /> Loading Phase 30 controls...</section>;
  return (
    <section className="security-console" aria-label="Phase 30 security validation console">
      <header className="security-console-header">
        <div><p className="eyebrow">PHASE 30 / SECURITY VALIDATION</p><h3>Adversarial controls and runtime containment</h3><p>Invalid requests traverse their production policy boundary; only persisted denial receipts count.</p></div>
        <button data-control-id="security.validation.refresh" className="icon-button" type="button" title="Refresh Phase 30" aria-label="Refresh Phase 30" onClick={() => void refresh()}><RotateCcw size={18} /></button>
      </header>
      <div className="security-console-identity"><div><span>Ceremony</span><code>{state.ceremony_id ?? 'not bound'}</code></div><div><span>Shared trace</span><code>{state.trace_id ?? 'not bound'}</code></div><div><span>Trust</span><strong>Connected-observed ceiling</strong></div><div><span>Ledger</span><strong>{state.evidence_integrity}</strong></div></div>
      {error && <div className="acceptance-notice acceptance-notice-error" role="alert">{error}</div>}
      <div className="security-console-grid">
        {state.attacks.map((attack) => <article key={attack.control_id}>
          <div className="security-control-title">{attack.status === 'blocked' ? <CheckCircle2 size={19} /> : <ShieldAlert size={19} />}<div><strong>{attackLabels[attack.control_id]}</strong><span>{attack.status.replaceAll('-', ' ')}</span></div></div>
          <p>{attack.reason_code ?? 'Run the public-boundary challenge.'}</p>
          <code>{attack.evidence_ref ?? 'evidence pending'}</code>
          <button data-control-id="security.attack.run" className="secondary-button" type="button" disabled={Boolean(busy) || state.evidence_integrity === 'failed'} onClick={() => void runAttack(attack.control_id)}>{busy === attack.control_id ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />} {attack.status === 'blocked' ? 'Run again' : 'Run challenge'}</button>
        </article>)}
      </div>
      <div className="security-containment">
        <header><strong>Real process containment</strong><span>Cancellation, revocation, and restart recovery</span></header>
        {state.containment.map((control) => <article key={control.control_id}>
          {control.status === 'passed' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div><strong>{control.control_id.replaceAll('-', ' ')}</strong><span>{control.reason_code ?? (control.status === 'armed' ? 'Close H2A completely, then restart with the same data path.' : 'Not run')}</span><code>{control.evidence_ref ?? control.run_id ?? ''}</code></div>
          <button data-control-id="security.containment.run" className="secondary-button" type="button" disabled={Boolean(busy) || control.status === 'armed'} onClick={() => void runContainment(control.control_id)}>{busy === control.control_id ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />} {control.control_id === 'restart-recovery' ? 'Arm restart' : 'Run control'}</button>
        </article>)}
      </div>
    </section>
  );
}
