import { CheckCircle2, Fingerprint, KeyRound, LoaderCircle, Play, RotateCcw, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CeremonyState, GuidedBootstrapState, HumanIdentityV2State, RunGuidedBootstrapStepRequest } from '@h2a/contracts';

interface GuidedBootstrapWorkspaceProps {
  state: GuidedBootstrapState;
  ceremony: CeremonyState;
  onStateChange(state: GuidedBootstrapState): void;
  onProofRequired(purpose: string, humanId: string): void;
  onRefresh(): Promise<void>;
}

export function GuidedBootstrapWorkspace({ state, ceremony, onStateChange, onProofRequired, onRefresh }: GuidedBootstrapWorkspaceProps): React.JSX.Element {
  const [humans, setHumans] = useState<HumanIdentityV2State | null>(null);
  const [administratorId, setAdministratorId] = useState(state.administrator_human_id ?? '');
  const [operatorId, setOperatorId] = useState(state.operator_human_id ?? '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const activeCeremony = ceremony.sessions.find((item) => item.ceremony_id === ceremony.active_ceremony_id);

  useEffect(() => {
    if (!window.h2a) return;
    void Promise.all([window.h2a.getHumanIdentityV2State(), window.h2a.getOrganizationAuthorityState()]).then(([nextHumans, nextOrganization]) => {
      setHumans(nextHumans);
      const administrator = nextOrganization.memberships.find((membership) => membership.status === 'active' && membership.role_ids.includes('role_authority_admin'))?.human_id
        ?? nextHumans.identities.find((human) => human.status === 'active')?.human_id
        ?? '';
      const operator = nextHumans.identities.find((human) => human.human_id !== administrator)?.human_id ?? '';
      setAdministratorId((current) => state.administrator_human_id ?? (current || administrator));
      setOperatorId((current) => state.operator_human_id ?? (current || operator));
    });
  }, [state.administrator_human_id, state.operator_human_id]);

  const correlation = (prefix: string) => activeCeremony ? { ceremony_id: activeCeremony.ceremony_id, trace_id: activeCeremony.trace_id, idempotency_key: `${prefix}_${crypto.randomUUID()}` } : null;
  const candidates = humans?.identities.filter((item) => humans.enrollments.some((enrollment) => enrollment.human_id === item.human_id && enrollment.status === 'active')) ?? [];
  const canPrepare = Boolean(activeCeremony && administratorId && operatorId && administratorId !== operatorId && candidates.length >= 2);
  const prepared = Boolean(state.ceremony_id);

  const prepare = async (): Promise<void> => {
    if (!window.h2a || !canPrepare) return;
    const ceremonyCorrelation = correlation('phase25_prepare'); if (!ceremonyCorrelation) return;
    setBusy('human-readiness'); setError('');
    try { onStateChange(await window.h2a.prepareGuidedBootstrap({ ceremony: ceremonyCorrelation, administrator_human_id: administratorId, operator_human_id: operatorId })); await onRefresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Human readiness validation failed.'); }
    finally { setBusy(''); }
  };

  const runStep = async (stepId: RunGuidedBootstrapStepRequest['step_id']): Promise<void> => {
    if (!window.h2a) return;
    const ceremonyCorrelation = correlation(`phase25_${stepId}`); if (!ceremonyCorrelation) return;
    setBusy(stepId); setError('');
    try { onStateChange(await window.h2a.runGuidedBootstrapStep({ ceremony: ceremonyCorrelation, step_id: stepId })); await onRefresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `${stepId} failed.`); }
    finally { setBusy(''); }
  };

  const nextAction = useMemo(() => {
    if (!prepared) return null;
    const steps: Array<{ id: RunGuidedBootstrapStepRequest['step_id']; label: string }> = [
      { id: 'organization-authority', label: 'Configure authority' },
      { id: 'workload-identity', label: 'Create participants' },
      { id: 'mandates-and-tasks', label: 'Issue mandates and tasks' },
      { id: 'restart-recovery', label: 'Confirm restart recovery' }
    ];
    return steps.find(({ id }) => state.steps.find((step) => step.step_id === id)?.status !== 'passed') ?? null;
  }, [prepared, state.steps]);
  const nextIndex = nextAction ? state.steps.findIndex((step) => step.step_id === nextAction.id) : -1;
  const previousPassed = nextIndex <= 0 || state.steps.slice(0, nextIndex).every((step) => step.status === 'passed');

  return (
    <section className="bootstrap-workspace" aria-label="Guided enterprise bootstrap">
      <header>
        <div><p className="eyebrow">PHASE 25 / ENTERPRISE BOOTSTRAP</p><h3>Build the ceremony organization</h3><p>Two humans, separated authority, four workload identities, bounded mandates, and linked work.</p></div>
        {nextAction && <button data-control-id="bootstrap.run-step" className="primary-button" type="button" disabled={!previousPassed || Boolean(busy)} onClick={() => void runStep(nextAction.id)}>{busy ? <LoaderCircle size={15} className="spin" /> : state.steps.find((step) => step.step_id === nextAction.id)?.status === 'failed' ? <RotateCcw size={15} /> : <Play size={15} />}{nextAction.label}</button>}
      </header>
      {error && <div className="acceptance-notice acceptance-notice-error" role="alert">{error}</div>}

      {!prepared && <div className="bootstrap-prepare">
        <div><label htmlFor="bootstrap-administrator">Authority administrator</label><select id="bootstrap-administrator" value={administratorId} onChange={(event) => setAdministratorId(event.target.value)}><option value="">Select enrolled human</option>{candidates.map((human) => <option key={human.human_id} value={human.human_id}>{human.display_name} · {human.human_id}</option>)}</select><button data-control-id="bootstrap.human-proof.request" className="secondary-button bootstrap-proof-button" type="button" disabled={!administratorId || Boolean(busy)} onClick={() => onProofRequired('complete Phase 44 required-liveness acceptance', administratorId)}><Fingerprint size={14} /> Verify administrator</button></div>
        <div><label htmlFor="bootstrap-operator">H2A operator</label><select id="bootstrap-operator" value={operatorId} onChange={(event) => setOperatorId(event.target.value)}><option value="">Select enrolled human</option>{candidates.filter((human) => human.human_id !== administratorId).map((human) => <option key={human.human_id} value={human.human_id}>{human.display_name} · {human.human_id}</option>)}</select><button data-control-id="bootstrap.human-proof.request" className="secondary-button bootstrap-proof-button" type="button" disabled={!operatorId || Boolean(busy)} onClick={() => onProofRequired('complete Phase 44 required-liveness acceptance', operatorId)}><Fingerprint size={14} /> Verify operator</button></div>
        <button data-control-id="bootstrap.prepare" className="primary-button" type="button" disabled={!canPrepare || Boolean(busy)} onClick={() => void prepare()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Users size={15} />} Validate two humans</button>
      </div>}

      {prepared && <>
        <div className="bootstrap-human-grid">{state.humans.map((human) => <article key={human.human_id}><div><Users size={17} /><strong>{human.display_name}</strong><span>{human.human_id === state.administrator_human_id ? 'Administrator / approver' : 'Operator'}</span></div><dl><dt>Token set</dt><dd>{human.token_set_size} / {human.required_matches} required</dd><dt>Model</dt><dd><code>{human.model_set_hash.slice(0, 18)}…</code></dd><dt>Proof</dt><dd className={`proof-${human.proof_status}`}>{human.proof_status}{human.assurance_level ? ` · ${human.assurance_level}` : ''}</dd></dl><button data-control-id="bootstrap.human-proof.request" className="secondary-button bootstrap-proof-button" type="button" disabled={Boolean(busy)} onClick={() => onProofRequired('complete Phase 44 required-liveness acceptance', human.human_id)}><Fingerprint size={14} /> {human.human_id === state.administrator_human_id ? 'Refresh administrator proof' : 'Refresh operator proof'}</button></article>)}</div>
        <div className="bootstrap-step-grid">{state.steps.map((step, index) => <article key={step.step_id}><span className={`bootstrap-step-number ${step.status === 'passed' ? 'passed' : ''}`}>{step.status === 'passed' ? <CheckCircle2 size={16} /> : index + 1}</span><div><strong>{step.title}</strong><small>{step.blocker ?? `${step.evidence_refs.length} linked evidence records`}</small></div><span>{step.status.replaceAll('-', ' ')}</span></article>)}</div>
        <div className="bootstrap-summary">
          <div><ShieldCheck size={17} /><span>Authority</span><strong>{state.operator_credential_id && state.approver_credential_id ? 'Separated' : 'Pending'}</strong></div>
          <div><KeyRound size={17} /><span>Participants</span><strong>{state.participants.filter((item) => item.status === 'ready').length}/4</strong></div>
          <div><CheckCircle2 size={17} /><span>Mandates</span><strong>{state.root_mandate_id ? 1 + state.child_mandate_ids.length : 0}/4</strong></div>
          <div><Play size={17} /><span>Assignments</span><strong>{state.assignment_ids.length}/4</strong></div>
        </div>
      </>}
    </section>
  );
}
