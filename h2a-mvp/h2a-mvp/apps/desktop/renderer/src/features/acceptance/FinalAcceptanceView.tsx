import { AlertTriangle, CheckCircle2, Copy, Download, FolderPlus, LoaderCircle, Play, Plus, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CeremonyState, DemonstrationConductor, FinalAcceptanceExportReceipt, FinalAcceptanceState, GuidedBootstrapState, Phase44SessionReceipt, SystemStatus } from '@h2a/contracts';
import { GuidedBootstrapWorkspace } from './GuidedBootstrapWorkspace';
import { SecurityValidationConsole } from './SecurityValidationConsole';

interface FinalAcceptanceViewProps {
  state: FinalAcceptanceState;
  ceremony: CeremonyState;
  bootstrap: GuidedBootstrapState;
  systemStatus: SystemStatus;
  onCeremonyStateChange(state: CeremonyState): void;
  onBootstrapStateChange(state: GuidedBootstrapState): void;
  onProofRequired(purpose: string, humanId: string): void;
  onRefresh(): Promise<void>;
  onConductorRoute?(stepId: string): void;
}

export function FinalAcceptanceView({ state, ceremony, bootstrap, systemStatus, onCeremonyStateChange, onBootstrapStateChange, onProofRequired, onRefresh, onConductorRoute }: FinalAcceptanceViewProps): React.JSX.Element {
  const [exporting, setExporting] = useState(false);
  const [receipt, setReceipt] = useState<FinalAcceptanceExportReceipt | null>(null);
  const [error, setError] = useState('');
  const [ceremonyBusy, setCeremonyBusy] = useState(false);
  const [phase44Session, setPhase44Session] = useState<Phase44SessionReceipt | null>(null);
  const [conductor, setConductor] = useState<DemonstrationConductor | null>(null);
  const [conductorBusy, setConductorBusy] = useState(false);
  const activeCeremony = ceremony.sessions.find((item) => item.ceremony_id === ceremony.active_ceremony_id);

  const refreshConductor = async (): Promise<void> => {
    if (!window.h2a) return;
    setConductor(await window.h2a.getDemonstrationConductor());
  };

  useEffect(() => { void refreshConductor().catch(() => undefined); }, []);

  const runConductor = async (action: 'start' | 'resume' | 'retry' | 'cancel'): Promise<void> => {
    if (!window.h2a) return;
    setConductorBusy(true); setError('');
    try {
      const next = await window.h2a.executeDemonstrationConductor({
        action, conductor_id: action === 'start' ? null : conductor?.conductor_id ?? null,
        expected_canonical_cursor: action === 'start' ? null : conductor?.canonical_cursor ?? null,
        operation_key: `phase51_${action}_${crypto.randomUUID()}`
      });
      setConductor(next);
      await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The demonstration conductor could not advance.'); }
    finally { setConductorBusy(false); }
  };

  const exportPackage = async (): Promise<void> => {
    if (!window.h2a) return;
    setExporting(true); setError('');
    try { setReceipt(await window.h2a.exportFinalAcceptancePackage()); await onRefresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Acceptance package export failed.'); }
    finally { setExporting(false); }
  };

  const createCeremony = async (): Promise<void> => {
    if (!window.h2a) return;
    setCeremonyBusy(true); setError('');
    try { onCeremonyStateChange(await window.h2a.createCeremonySession({ title: 'HP CTO/CISO demonstration', idempotency_key: `create_${crypto.randomUUID()}` })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Ceremony creation failed.'); }
    finally { setCeremonyBusy(false); }
  };

  const assessPrerequisites = async (): Promise<void> => {
    if (!window.h2a || !activeCeremony) return;
    setCeremonyBusy(true); setError('');
    try {
      const next = await window.h2a.runCeremonyStep({ ceremony_id: activeCeremony.ceremony_id, step_id: 'prerequisites-assessed', idempotency_key: `assess_${crypto.randomUUID()}` });
      await onRefresh();
      onCeremonyStateChange(next);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Prerequisite assessment failed.'); }
    finally { setCeremonyBusy(false); }
  };

  const preparePhase44 = async (): Promise<void> => {
    if (!window.h2a) return;
    setCeremonyBusy(true); setError('');
    try { setPhase44Session(await window.h2a.preparePhase44Session()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Clean Phase 44 session creation failed.'); }
    finally { setCeremonyBusy(false); }
  };

  const requireLiveness = async (): Promise<void> => {
    if (!window.h2a) return;
    setCeremonyBusy(true); setError('');
    try { await window.h2a.enableRequiredLiveness(); await onRefresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Required liveness could not be enabled.'); }
    finally { setCeremonyBusy(false); }
  };

  return (
    <section className="acceptance-page">
      <header className="acceptance-header">
        <div><p className="eyebrow">PHASE 43 / RELEASE INTEGRATION</p><h2>Enterprise demonstration gate</h2><p>Evidence-backed readiness for the clean Phase 44 HP CTO/CISO ceremony.</p></div>
        <div className="acceptance-actions">
          <button data-control-id="acceptance.refresh" className="secondary-button" type="button" onClick={() => void onRefresh()}>Refresh</button>
          <button data-control-id="acceptance.export" className="primary-button" type="button" disabled={!window.h2a || exporting || !state.phase44_readiness.package_eligible} title={state.phase44_readiness.package_eligible ? 'Export signed acceptance package' : 'All final gates and Phase 44 prerequisites must pass'} onClick={() => void exportPackage()}>
            {exporting ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />} Export package
          </button>
        </div>
      </header>

      <div className={`acceptance-banner acceptance-banner-${state.status}`} role="status">
        {state.status === 'passed' ? <ShieldCheck size={22} /> : state.status === 'failed' ? <ShieldAlert size={22} /> : <AlertTriangle size={22} />}
        <div><strong>{state.status === 'passed' ? 'Final acceptance passed' : state.status === 'failed' ? 'Acceptance control failed' : 'Acceptance is not complete'}</strong><span>{state.completion.passed} of {state.completion.total} gates passed · trust ceiling {state.manifest.trust_ceiling}</span></div>
        <code>{state.shared_trace_id ?? 'shared trace pending'}</code>
      </div>

      {(receipt || error) && <div className={error ? 'acceptance-notice acceptance-notice-error' : 'acceptance-notice'}>{error || `Package ${receipt?.package_hash.slice(0, 24)}… written to ${receipt?.relative_path}`}</div>}

      <DemonstrationConductorPanel conductor={conductor} acceptance={state} bootstrap={bootstrap} busy={conductorBusy}
        onRun={runConductor} onProofRequired={onProofRequired} onRoute={onConductorRoute} />

      <section className="phase44-readiness" aria-labelledby="phase44-readiness-title">
        <header><div><p className="eyebrow">PHASE 44 / CLEAN CEREMONY</p><h3 id="phase44-readiness-title">Operator acceptance workspace</h3></div><div className="acceptance-actions"><button data-control-id="acceptance.phase44.prepare" className="secondary-button" type="button" disabled={!window.h2a || ceremonyBusy} onClick={() => void preparePhase44()}><FolderPlus size={15} /> New clean session</button>{systemStatus.livenessMode !== 'required' && <button data-control-id="acceptance.liveness.require" className="primary-button" type="button" disabled={!window.h2a || ceremonyBusy} onClick={() => void requireLiveness()}><ShieldCheck size={15} /> Require liveness</button>}</div></header>
        <div className="phase44-readiness-grid">
          <ReadinessFact label="Clean session" ready={state.phase44_readiness.clean_session} value={state.manifest.session_id} />
          <ReadinessFact label="Required liveness" ready={state.phase44_readiness.required_liveness_mode} value={`${state.phase44_readiness.liveness_verified_human_ids.length}/2 people`} />
          <ReadinessFact label="Approval withdrawal" ready={Boolean(state.phase44_readiness.approval_withdrawal_evidence_ref)} value={state.phase44_readiness.approval_withdrawal_evidence_ref ?? 'Evidence required'} />
          <ReadinessFact label="Project integration" ready={Boolean(state.phase44_readiness.project_integration_evidence_ref)} value={state.phase44_readiness.project_integration_evidence_ref ?? 'Evidence required'} />
        </div>
        {phase44Session && <div className="phase44-session-receipt" role="status"><div><strong>Clean session prepared</strong><code>{phase44Session.data_path}</code><small>Required liveness is locked on. This root contains no preview data or pre-populated success.</small></div><button data-control-id="acceptance.phase44.copy-launch" type="button" className="secondary-button icon-command" title="Copy launch command" onClick={() => void window.h2a?.writeClipboardText(phase44Session.launch_command)}><Copy size={15} /><span className="sr-only">Copy Phase 44 launch command</span></button></div>}
      </section>

      <section className="ceremony-workspace" aria-label="Ceremony workspace">
        <header>
          <div><p className="eyebrow">PHASE 24 / SHARED TRACE</p><h3>{activeCeremony?.title ?? 'No ceremony session'}</h3><p>{activeCeremony ? 'One durable ceremony identity coordinates every later domain step.' : 'Create the shared trace backbone before enterprise setup.'}</p></div>
          {!activeCeremony ? <button data-control-id="ceremony.session.create" className="primary-button" type="button" disabled={ceremonyBusy} onClick={() => void createCeremony()}><Plus size={15} /> Create ceremony</button> : <button data-control-id="ceremony.prerequisites.assess" className="secondary-button" type="button" disabled={ceremonyBusy} onClick={() => void assessPrerequisites()}>{ceremonyBusy ? <LoaderCircle size={15} className="spin" /> : activeCeremony.steps.find((item) => item.step_id === 'prerequisites-assessed')?.status === 'failed' ? <RotateCcw size={15} /> : <Play size={15} />} Assess prerequisites</button>}
        </header>
        {activeCeremony && <>
          <div className="ceremony-identity"><div><span>Ceremony</span><code>{activeCeremony.ceremony_id}</code></div><div><span>Shared trace</span><code>{activeCeremony.trace_id}</code></div><div><span>Participants</span><strong>{activeCeremony.participants.length}</strong></div><div><span>Status</span><strong>{activeCeremony.status}</strong></div></div>
          <div className="ceremony-steps">{activeCeremony.steps.map((step) => <article key={step.step_id}><span className={`status-indicator status-indicator-${step.status === 'passed' || step.status === 'ready' ? 'verified' : step.status === 'failed' ? 'danger' : 'approval'}`} /><div><strong>{step.title}</strong><small>{step.blocker ?? `${step.evidence_refs.length} linked evidence records`}</small></div><span>{step.status.replaceAll('-', ' ')}</span></article>)}</div>
        </>}
      </section>

      {activeCeremony && <GuidedBootstrapWorkspace state={bootstrap} ceremony={ceremony} onStateChange={onBootstrapStateChange} onProofRequired={onProofRequired} onRefresh={onRefresh} />}
      {activeCeremony && <SecurityValidationConsole onWorkspaceRefresh={onRefresh} />}

      <div className="acceptance-layout">
        <section className="acceptance-gates" aria-label="Acceptance gates">
          <header><strong>Control gates</strong><span>{state.evidence_integrity} ledger</span></header>
          {state.gates.map((gate) => (
            <article key={gate.gate_id} className={`acceptance-gate acceptance-gate-${gate.status}`}>
              {gate.status === 'passed' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
              <div><strong>{gate.title}</strong><p>{gate.summary}</p>{gate.operator_action && gate.status !== 'passed' && <small>{gate.operator_action}</small>}</div>
              <div className="acceptance-gate-meta"><span>{gate.status.replaceAll('-', ' ')}</span><code>{gate.evidence_refs.length} refs</code></div>
            </article>
          ))}
        </section>

        <aside className="acceptance-rail">
          <section><header><strong>Adversarial matrix</strong><span>{state.attacks.filter((item) => item.status === 'blocked').length}/{state.attacks.length}</span></header>{state.attacks.map((attack) => <div className="attack-row" key={attack.attack_id}><span className={`status-indicator status-indicator-${attack.status === 'blocked' ? 'verified' : 'approval'}`} /><strong>{attack.attack_id.replaceAll('-', ' ')}</strong><span>{attack.status}</span></div>)}</section>
          <section><header><strong>Ceremony manifest</strong></header><dl><dt>Session</dt><dd>{state.manifest.session_id}</dd><dt>Providers</dt><dd>{state.manifest.required_providers.join(', ')}</dd><dt>Humans</dt><dd>{state.manifest.minimum_humans} with {state.manifest.biometric_record_range[0]}-{state.manifest.biometric_record_range[1]} records</dd><dt>Trace prefix</dt><dd>{state.manifest.trace_prefix}</dd></dl></section>
        </aside>
      </div>
    </section>
  );
}

function DemonstrationConductorPanel({ conductor, acceptance, bootstrap, busy, onRun, onProofRequired, onRoute }: {
  conductor: DemonstrationConductor | null; acceptance: FinalAcceptanceState; bootstrap: GuidedBootstrapState; busy: boolean;
  onRun(action: 'start' | 'resume' | 'retry' | 'cancel'): Promise<void>;
  onProofRequired(purpose: string, humanId: string): void;
  onRoute?(stepId: string): void;
}): React.JSX.Element {
  const active = conductor?.steps.find((step) => step.step_id === conductor.active_step_id);
  const passed = conductor?.steps.filter((step) => step.status === 'passed').length ?? 0;
  const nextHuman = [bootstrap.administrator_human_id, bootstrap.operator_human_id]
    .find((humanId): humanId is string => Boolean(humanId && !acceptance.phase44_readiness.liveness_verified_human_ids.includes(humanId)));
  const primary = !conductor ? 'start' : conductor.status === 'interrupted' ? 'resume' : conductor.status === 'blocked' ? 'retry' : 'resume';
  const canAdvance = !conductor || !['completed', 'cancelled'].includes(conductor.status);
  const actionLabel = !conductor ? 'Start HP demonstration' : active?.safe_automation ? 'Run safe next step' : conductor.status === 'interrupted' ? 'Resume after restart' : 'Recheck completed action';
  const instruction = active ? conductorInstruction(active.step_id) : conductor?.status === 'completed' ? 'The signed package and tamper-negative receipt are persisted.' : 'Start from a clean Phase 44 root. H2A will stop at every real human or external boundary.';
  return <section className="demonstration-conductor" aria-labelledby="demonstration-conductor-title">
    <header><div><p className="eyebrow">PHASE 51 / FINAL CONDUCTOR</p><h3 id="demonstration-conductor-title">HP demonstration</h3><p>One durable path through the same canonical controls shown in Office and Control.</p></div><div className="acceptance-actions">{canAdvance && <button data-control-id="conductor.advance" className="primary-button" type="button" disabled={busy} onClick={() => void onRun(primary)}>{busy ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}{actionLabel}</button>}{conductor && !['completed', 'cancelled'].includes(conductor.status) && <button data-control-id="conductor.cancel" className="secondary-button" type="button" disabled={busy} onClick={() => void onRun('cancel')}>Cancel run</button>}</div></header>
    <div className="conductor-summary"><div><span>Status</span><strong>{conductor?.status ?? 'not started'}</strong></div><div><span>Progress</span><strong>{passed}/{conductor?.steps.length ?? 18}</strong></div><div><span>Trace</span><code>{conductor?.trace_id ?? acceptance.shared_trace_id ?? 'created on start'}</code></div></div>
          {active && <div className="conductor-next" role="status"><span className="conductor-step-number">{conductor!.steps.indexOf(active) + 1}</span><div><strong>{active.title}</strong><p>{instruction}</p><small>{active.reason_code.replaceAll('_', ' ')} · {active.evidence_refs.length} evidence refs</small></div><div className="acceptance-actions">{active.step_id === 'two-human-liveness' && nextHuman && <button data-control-id="conductor.proof.open" className="primary-button" type="button" onClick={() => onProofRequired('complete Phase 44 required-liveness acceptance', nextHuman)}><ShieldCheck size={15} />Verify {bootstrap.humans.find((item) => item.human_id === nextHuman)?.display_name ?? nextHuman}</button>}{!active.safe_automation && active.step_id !== 'two-human-liveness' && <button data-control-id="conductor.control.open" className="secondary-button" type="button" onClick={() => onRoute?.(active.step_id)}>Open required control</button>}</div></div>}
    {conductor && <details className="conductor-steps"><summary>Show all {conductor.steps.length} acceptance steps</summary>{conductor.steps.map((step, index) => <div key={step.step_id} className={`conductor-step conductor-step-${step.status}`}><span>{step.status === 'passed' ? <CheckCircle2 size={16} /> : <span>{index + 1}</span>}</span><div><strong>{step.title}</strong><small>{step.status.replaceAll('-', ' ')} · {step.evidence_refs.length} refs · {step.attempts} attempts</small></div></div>)}</details>}
  </section>;
}

function conductorInstruction(stepId: string): string {
  const instructions: Record<string, string> = {
    'clean-session': 'Create and launch the clean final root shown below. This cannot be automated inside the current process.',
    'required-liveness-policy': 'H2A can safely strengthen this clean root to required liveness.',
    'two-human-liveness': 'The named person must complete the live camera challenge. A photograph or bypass does not count.',
    'organization-authority': 'Set up two active employees with separated Administrator/Approver and Operator authority.',
    'workload-identity': 'Issue the four Passport V2 identities and attest their active runtime sessions.',
    'shared-provider-task': 'Complete real Claude, Antigravity, and Codex runs on this trace. Provider login or consent stays with you.',
    'external-framework': 'Run the conformant framework lane on the same trace.',
    'context-minimization': 'Issue recipient-bound grants and complete the least-context handoffs.',
    'authority-escalation': 'Route one protected action to the other eligible employee, approve it, and resume exactly once.',
    'approval-withdrawal': 'Create a disposable protected request and withdraw it with exact-purpose proof.',
    'federation-collaboration': 'Pair the second root, compare the code with the other operator, exchange task/ack/heartbeat, then prove replay and revoked-peer denial.',
    'project-integration': 'Run distinct project work, validate it, obtain independent approval, and integrate the accepted result.',
    'runtime-containment': 'Run cancellation and authority revocation against real runtime work.',
    'adversarial-controls': 'Run all six production-boundary attacks and retain each blocked receipt.',
    'restart-recovery': 'Arm restart, close H2A, reopen this same root, then confirm HOST_PROCESS_RESTARTED.',
    'evidence-reconstruction': 'Open Evidence and resolve the complete human-to-output chain on this trace.',
    'export-package': 'All prerequisites pass. H2A can now export the signed minimized package.',
    'verify-package-tamper': 'Run the independent verifier and an in-memory one-byte tamper negative against the exported file.'
  };
  return instructions[stepId] ?? 'Complete the named canonical control, then recheck this step.';
}

function ReadinessFact({ label, ready, value }: { label: string; ready: boolean; value: string }): React.JSX.Element {
  return <div className={ready ? 'phase44-fact phase44-fact-ready' : 'phase44-fact'}><span>{ready ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{label}</span><code title={value}>{value}</code></div>;
}
