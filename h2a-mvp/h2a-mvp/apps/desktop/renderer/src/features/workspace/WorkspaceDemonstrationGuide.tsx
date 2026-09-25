import { Check, ChevronRight, Clipboard, FolderPlus, LoaderCircle, Play, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DemonstrationConductor, FinalAcceptanceState, GuidedBootstrapState, Phase44SessionReceipt, SystemStatus } from '@h2a/contracts';

interface Props {
  acceptance: FinalAcceptanceState;
  bootstrap: GuidedBootstrapState;
  systemStatus: SystemStatus;
  onRefresh(): Promise<void>;
  onProofRequired(purpose: string, humanId: string): void;
  onOpenStep(stepId: string): void;
}

const friendlySteps: Record<string, { title: string; detail: string }> = {
  'clean-session': { title: 'Start with a clean workspace', detail: 'Create the final evidence root and reopen H2A there.' },
  'required-liveness-policy': { title: 'Require live identity checks', detail: 'Photographs and demonstration bypass cannot satisfy acceptance.' },
  'two-human-liveness': { title: 'Verify both accountable people', detail: 'Each named employee completes the camera check in this popup.' },
  'organization-authority': { title: 'Confirm team authority', detail: 'One operator and one different approver must be active.' },
  'workload-identity': { title: 'Connect the agent team', detail: 'Four agents need current identity, runtime, permission, and assignment.' },
  'shared-provider-task': { title: 'Run the provider team', detail: 'Claude, Codex, and Antigravity produce real bounded outputs.' },
  'external-framework': { title: 'Run the company agent', detail: 'The framework or company-built connector joins the same mission.' },
  'context-minimization': { title: 'Show least-context work', detail: 'Each agent receives only the fields required for its assignment.' },
  'authority-escalation': { title: 'Approve a protected action', detail: 'The other eligible employee decides and the effect resumes once.' },
  'approval-withdrawal': { title: 'Withdraw a disposable approval', detail: 'Prove that a previously requested action can no longer execute.' },
  'federation-collaboration': { title: 'Connect a coworker workspace', detail: 'Pair two installations, exchange work, then prove replay and revocation.' },
  'project-integration': { title: 'Deliver a real project', detail: 'Agents work, validate, obtain approval, and integrate one accepted result.' },
  'runtime-containment': { title: 'Stop agent work safely', detail: 'Cancel execution and withdraw authority without losing its history.' },
  'adversarial-controls': { title: 'Prove six attacks are blocked', detail: 'Each denial must be persisted by the production policy boundary.' },
  'restart-recovery': { title: 'Prove restart recovery', detail: 'Arm the checkpoint, restart H2A, and recover without false success.' },
  'evidence-reconstruction': { title: 'Reconstruct the full story', detail: 'Resolve the initiating person through authority, agents, context, decisions, and outputs.' },
  'export-package': { title: 'Export the signed proof package', detail: 'H2A minimizes and signs the eligible acceptance record.' },
  'verify-package-tamper': { title: 'Verify and tamper-test the package', detail: 'Independent verification passes and a one-byte mutation fails.' }
};

export function WorkspaceDemonstrationGuide({ acceptance, bootstrap, systemStatus, onRefresh, onProofRequired, onOpenStep }: Props): React.JSX.Element {
  const [conductor, setConductor] = useState<DemonstrationConductor | null>(null);
  const [prepared, setPrepared] = useState<Phase44SessionReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = conductor?.steps.find((step) => step.step_id === conductor.active_step_id);
  const passed = conductor?.steps.filter((step) => step.status === 'passed').length ?? 0;
  const nextHuman = useMemo(() => [bootstrap.administrator_human_id, bootstrap.operator_human_id]
    .find((humanId): humanId is string => Boolean(humanId && !acceptance.phase44_readiness.liveness_verified_human_ids.includes(humanId))), [acceptance.phase44_readiness.liveness_verified_human_ids, bootstrap.administrator_human_id, bootstrap.operator_human_id]);

  useEffect(() => { void window.h2a?.getDemonstrationConductor().then(setConductor).catch(() => undefined); }, []);

  async function advance(): Promise<void> {
    if (!window.h2a) return;
    setBusy(true); setError('');
    try {
      const action = !conductor ? 'start' : conductor.status === 'interrupted' ? 'resume' : conductor.status === 'blocked' ? 'retry' : 'resume';
      const next = await window.h2a.executeDemonstrationConductor({
        action, conductor_id: action === 'start' ? null : conductor!.conductor_id,
        expected_canonical_cursor: action === 'start' ? null : conductor!.canonical_cursor,
        operation_key: `workspace_demo_${action}_${crypto.randomUUID()}`
      });
      setConductor(next);
      await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The guided demonstration could not continue.'); }
    finally { setBusy(false); }
  }

  async function prepareCleanRoot(): Promise<void> {
    if (!window.h2a) return;
    setBusy(true); setError('');
    try { setPrepared(await window.h2a.preparePhase44Session()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The clean workspace could not be prepared.'); }
    finally { setBusy(false); }
  }

  const current = active ? friendlySteps[active.step_id] : undefined;
  return <section className="ws-demo-guide" aria-label="HP demonstration guide">
    <div className="ws-demo-hero"><div><span className="ws-live-dot" />GUIDED ENTERPRISE STORY</div><h2>Show how people and agents work with accountable authority.</h2><p>Stay in this workspace. H2A advances safe steps automatically and asks only for a real person, provider, coworker, decision, or security proof when required.</p><div className="ws-demo-progress"><span style={{ width: `${Math.round((passed / Math.max(18, conductor?.steps.length ?? 18)) * 100)}%` }} /></div><small>{passed} of {conductor?.steps.length ?? 18} evidence-backed checks complete</small></div>
    {error && <div className="ws-blocker-message" role="alert"><X size={18} /><div><strong>This step needs attention</strong><p>{friendlyError(error)}</p></div></div>}
    {!conductor ? <div className="ws-demo-current"><span className="ws-demo-number">1</span><div><h3>Begin the guided demonstration</h3><p>The guide will remain here and highlight the next action.</p></div><button className="ws-primary" disabled={busy} onClick={() => void advance()}>{busy ? <LoaderCircle className="ws-spin" size={17} /> : <Play size={17} />}Start</button></div>
      : active && current ? <div className="ws-demo-current"><span className="ws-demo-number">{conductor.steps.indexOf(active) + 1}</span><div><h3>{current.title}</h3><p>{current.detail}</p><small>{active.reason_code.replaceAll('_', ' ').toLowerCase()}</small></div><div className="ws-actions">
        {active.step_id === 'clean-session' ? <button className="ws-primary" disabled={busy} onClick={() => void prepareCleanRoot()}><FolderPlus size={17} />Prepare clean workspace</button>
          : active.step_id === 'two-human-liveness' && nextHuman ? <button className="ws-primary" onClick={() => onProofRequired('complete Phase 44 required-liveness acceptance', nextHuman)}><ShieldCheck size={17} />Verify {bootstrap.humans.find((human) => human.human_id === nextHuman)?.display_name ?? 'named employee'}</button>
            : active.safe_automation ? <button className="ws-primary" disabled={busy} onClick={() => void advance()}><Play size={17} />Continue safely</button>
              : <button className="ws-primary" onClick={() => onOpenStep(active.step_id)}>Do this step<ChevronRight size={17} /></button>}
        {!active.safe_automation && active.step_id !== 'clean-session' && active.step_id !== 'two-human-liveness' && <button className="ws-secondary" disabled={busy} onClick={() => void advance()}>Check again</button>}
      </div></div> : <div className="ws-demo-complete"><ShieldCheck size={26} /><div><h3>{conductor.status === 'completed' ? 'Demonstration evidence complete' : 'No remaining action'}</h3><p>The durable guide state is stored on {conductor.trace_id}.</p></div></div>}
    {prepared && <div className="ws-demo-launch"><div><strong>Clean workspace is ready</strong><p>Copy the launch command, close H2A, and run it in PowerShell. The guide continues after sign-in.</p><code>{prepared.data_path}</code></div><button className="ws-secondary" onClick={() => void window.h2a?.writeClipboardText(prepared.launch_command)}><Clipboard size={16} />Copy launch command</button></div>}
    <div className="ws-demo-checklist">{(conductor?.steps ?? Object.keys(friendlySteps).map((step_id) => ({ step_id, status: 'not-started' }))).map((step, index) => <div key={step.step_id} className={step.status === 'passed' ? 'passed' : step.step_id === active?.step_id ? 'active' : ''}><span>{step.status === 'passed' ? <Check size={14} /> : index + 1}</span><p>{friendlySteps[step.step_id]?.title ?? step.step_id}</p></div>)}</div>
    <footer><span><strong>Current identity mode:</strong> {systemStatus.livenessMode === 'required' ? 'Live person required' : 'Demonstration bypass'}</span><span><strong>Trust:</strong> Connected-observed</span></footer>
  </section>;
}

function friendlyError(error: string): string {
  if (/human proof/iu.test(error)) return 'The named employee must verify this exact action. Complete the identity popup, then continue.';
  if (/expired|not current/iu.test(error)) return 'A required permission expired. Renew the exact permission in the popup; completed work will remain.';
  if (/provider|authentication/iu.test(error)) return 'The selected agent provider needs login, consent, or a healthy local runtime.';
  if (/peer|federation/iu.test(error)) return 'The coworker connection is missing, offline, or revoked. Reconnect it before continuing.';
  return error;
}
