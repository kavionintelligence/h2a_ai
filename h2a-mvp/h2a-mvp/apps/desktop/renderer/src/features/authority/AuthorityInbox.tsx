import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Check, Clock3, Fingerprint, Inbox, KeyRound, Play, Plus, RefreshCw, ShieldAlert, X } from 'lucide-react';
import type { AuthorityApprovalState, CeremonyState, CollaborationState, HumanEscalationState, OrganizationAuthorityState } from '@h2a/contracts';
import { StatusBadge } from '@h2a/ui';
import { previewApprovalRoute, resolveApprovalRequestDefaults } from './approvalRequestRouting';
import { resolvePhase28ApprovalFlow } from './phase28ApprovalFlow';
import { ADMINISTRATOR_RECOVERY_PURPOSE, resolvePhase28AuthorityRecovery } from './phase28AuthorityRecovery';

interface Props {
  state: AuthorityApprovalState;
  organization: OrganizationAuthorityState;
  collaboration: CollaborationState;
  ceremony: CeremonyState;
  onStateChange(state: AuthorityApprovalState): void;
  onProofRequired(purpose: string, humanId?: string): void;
  onRefresh(): Promise<void>;
}

export function AuthorityInbox({ state, organization, collaboration, ceremony, onStateChange, onProofRequired, onRefresh }: Props): React.JSX.Element {
  const [selectedId, setSelectedId] = useState(state.requests.at(-1)?.approval_request_id ?? '');
  const [approverMembershipId, setApproverMembershipId] = useState('');
  const [message, setMessage] = useState('');
  const [showPolicy, setShowPolicy] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [busy, setBusy] = useState(false);
  const decisionInFlight = useRef(false);
  const approvalFlow = useMemo(
    () => resolvePhase28ApprovalFlow(state, organization, selectedId, approverMembershipId),
    [approverMembershipId, organization, selectedId, state]
  );
  const selected = approvalFlow.request;
  const selectedContext = state.request_contexts.find((item) => item.approval_request_id === selected?.approval_request_id);
  const policy = approvalFlow.policy;
  const decisions = state.decisions.filter((item) => item.approval_request_id === selected?.approval_request_id);
  const resume = state.resumes.find((item) => item.approval_request_id === selected?.approval_request_id);
  const eligible = approvalFlow.eligibleMemberships;
  const selectedMembership = approvalFlow.approverMembership;
  const proof = approvalFlow.proof;
  const credential = approvalFlow.credential;
  const hasApprovalPolicy = state.policies.some((item) => item.status === 'active');
  const escalationPrerequisite = 'Create an active approval policy before escalating an action.';
  const withdrawalPurpose = 'withdraw protected approval request';
  const withdrawalProof = organization.assurance.find((item) => item.membership_id === selectedContext?.requesting_membership_id && item.purpose === withdrawalPurpose);

  useEffect(() => {
    const requestId = approvalFlow.request?.approval_request_id ?? '';
    if (requestId && requestId !== selectedId) setSelectedId(requestId);
  }, [approvalFlow.request?.approval_request_id, selectedId]);

  useEffect(() => {
    const membershipId = approvalFlow.approverMembership?.membership_id ?? '';
    if (selected?.status === 'pending' && membershipId !== approverMembershipId) setApproverMembershipId(membershipId);
  }, [approvalFlow.approverMembership?.membership_id, approverMembershipId, selected?.status]);

  async function decide(decision: 'approve' | 'reject'): Promise<void> {
    if (!window.h2a || !selected || decisionInFlight.current) return;
    decisionInFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      const [latestApprovals, latestOrganization] = await Promise.all([
        window.h2a.getAuthorityApprovalState(),
        window.h2a.getOrganizationAuthorityState()
      ]);
      const latest = resolvePhase28ApprovalFlow(latestApprovals, latestOrganization, selected.approval_request_id, approverMembershipId);
      const expectedStatus = decision === 'reject' ? 'rejected' : 'approved';
      const recorded = latestApprovals.decisions.find((item) =>
        item.approval_request_id === selected.approval_request_id &&
        item.approver_membership_id === (latest.approverMembership?.membership_id ?? approverMembershipId) &&
        item.decision === expectedStatus
      );
      if (!latest.request || latest.request.approval_request_id !== selected.approval_request_id || latest.request.status !== 'pending') {
        if (latest.request?.approval_request_id === selected.approval_request_id && latest.request.status === expectedStatus && recorded) {
          onStateChange(latestApprovals);
          setMessage(`Decision was already recorded for ${latest.approverMembership?.employee_id ?? approverMembershipId}. Evidence remains persisted on the ceremony trace.`);
          return;
        }
        throw new Error('This approval request is no longer pending. H2A selected the newest active request.');
      }
      if (!latest.approverMembership) throw new Error('Select an eligible independent approver.');
      if (!latest.proof) throw new Error(`Fresh Human Proof required for purpose: ${latest.policy?.proof_purpose ?? 'approve protected action'}.`);
      if (!latest.credential) throw new Error('The selected approver does not have an active credential bound to this approval policy.');
      const next = await window.h2a.submitApprovalDecision({
        approval_request_id: latest.request.approval_request_id,
        approver: {
          membership_id: latest.approverMembership.membership_id,
          human_proof_id: latest.proof.human_proof_id,
          authority_credential_id: latest.credential.credential_id
        },
        decision,
        conditions: []
      });
      onStateChange(next);
      await onRefresh();
      setMessage(`Decision recorded for ${latest.approverMembership.employee_id}. Evidence is persisted on the ceremony trace.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authority decision failed.');
      await onRefresh().catch(() => undefined);
    } finally {
      decisionInFlight.current = false;
      setBusy(false);
    }
  }

  async function resumeAction(): Promise<void> {
    if (!window.h2a || !selected || !resume) return;
    await operate(async () => window.h2a!.consumeApprovalResume({ approval_request_id: selected.approval_request_id, idempotency_key: resume.idempotency_key }), 'The paused assignment resumed once under the narrow mandate.');
  }

  async function withdrawRequest(): Promise<void> {
    if (!window.h2a || !selected || !withdrawalProof) return;
    await operate(() => window.h2a!.withdrawApprovalRequest({ approval_request_id: selected.approval_request_id, requesting_human_id: selected.requesting_human_id, human_proof_id: withdrawalProof.human_proof_id }), 'The requester withdrew the protected approval request.');
  }

  async function operate(work: () => Promise<AuthorityApprovalState>, success: string): Promise<void> {
    setBusy(true); setMessage('');
    try { onStateChange(await work()); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Authority operation failed.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="approval-page">
      <HumanEscalationConsole organization={organization} ceremony={ceremony} onProofRequired={onProofRequired} onRefresh={onRefresh} />
      <header className="approval-heading">
        <div><p className="section-kicker">MULTI-HUMAN CONTROL PLANE</p><h2>Authority Inbox</h2><p>Purpose-bound decisions for paused agent effects.</p></div>
        <div className="approval-heading-actions"><button className="icon-button" type="button" onClick={() => void onRefresh()} title="Refresh authority"><RefreshCw size={17} /></button><button className="secondary-button" type="button" onClick={() => setShowPolicy(true)}><ShieldAlert size={16} /> New policy</button><button className="primary-button" type="button" onClick={() => setShowRequest(true)} disabled={!hasApprovalPolicy} title={hasApprovalPolicy ? 'Escalate a paused action for human approval.' : escalationPrerequisite} aria-label={hasApprovalPolicy ? 'Escalate action' : `Escalate action unavailable. ${escalationPrerequisite}`}><Plus size={16} /> Escalate action</button></div>
      </header>
      <section className="approval-metrics" aria-label="Approval metrics">
        <Metric label="Pending" value={state.requests.filter((item) => item.status === 'pending').length} icon={Clock3} />
        <Metric label="Approved" value={state.requests.filter((item) => item.status === 'approved').length} icon={Check} />
        <Metric label="Resumed" value={state.resumes.filter((item) => item.status === 'completed').length} icon={Play} />
        <Metric label="Policies" value={state.policies.filter((item) => item.status === 'active').length} icon={ShieldAlert} />
      </section>
      <div className="approval-workbench">
        <section className="approval-list" aria-label="Approval requests">
          <div className="panel-title-row"><div><p className="section-kicker">ROUTED WORK</p><h3>Requests</h3></div><span>{state.requests.length}</span></div>
          {!state.requests.length && <div className="approval-empty"><Inbox size={26} /><strong>No authority requests</strong><span>Escalated agent actions appear here.</span></div>}
          {[...state.requests].reverse().map((item) => <button type="button" key={item.approval_request_id} className={`approval-request-row ${selected?.approval_request_id === item.approval_request_id ? 'selected' : ''}`} onClick={() => { setSelectedId(item.approval_request_id); setApproverMembershipId(''); }}>
            <span className="approval-request-icon"><ShieldAlert size={16} /></span><span><strong>{item.required_action} · {item.required_resource}</strong><small>{item.task_id}</small><code>{item.requesting_agent_id}</code></span><StatusBadge label={item.status} tone={item.status === 'approved' ? 'verified' : item.status === 'pending' ? 'approval' : item.status === 'rejected' || item.status === 'invalidated' ? 'danger' : 'neutral'} />
          </button>)}
        </section>
        <section className="approval-detail" aria-label="Selected approval">
          {!selected ? <div className="approval-empty"><ShieldAlert size={28} /><strong>Select a request</strong><span>Review routing, human proofs, and quorum evidence.</span></div> : <>
            <header><div><p className="section-kicker">REQUESTED EFFECT</p><h3>{selected.required_action} · {selected.required_resource}</h3><code>{selected.approval_request_id}</code></div><div className="approval-detail-actions"><StatusBadge label={selected.status} tone={selected.status === 'approved' ? 'verified' : selected.status === 'pending' ? 'approval' : 'danger'} />{['pending', 'approved'].includes(selected.status) && (withdrawalProof ? <button data-control-id="approval.request.withdraw" className="danger-button" type="button" disabled={busy} onClick={() => void withdrawRequest()}><Ban size={15} /> Withdraw</button> : <button data-control-id="approval.withdraw.verify" className="secondary-button" type="button" onClick={() => onProofRequired(withdrawalPurpose, selected.requesting_human_id)}><Fingerprint size={15} /> Verify withdrawal</button>)}</div></header>
            <div className="approval-facts"><Fact label="Agent" value={selected.requesting_agent_id} /><Fact label="Requester" value={selected.requesting_human_id} /><Fact label="Mandate" value={selected.mandate_id} /><Fact label="Review grant" value={selected.review_context_grant_id} /><Fact label="Effect hash" value={selected.requested_effect_hash} wide /><Fact label="Expires" value={format(selected.expires_at)} /><Fact label="Policy" value={selected.approval_policy_id} /></div>
            <div className="quorum-strip"><div><strong>{decisions.filter((item) => item.decision !== 'rejected').length}/{policy?.quorum ?? 0}</strong><span>Verified co-signatures</span></div><div className="quorum-track"><span style={{ width: `${Math.min(100, decisions.length / Math.max(1, policy?.quorum ?? 1) * 100)}%` }} /></div><span>{policy?.separation_of_duty ? 'Separation of duty enforced' : 'Requester approval allowed'}</span></div>
            {selected.status === 'pending' ? <section className="approver-panel"><div><p className="section-kicker">ELIGIBLE ROUTE</p><h3>Approver decision</h3></div>
              <label className="field"><span>Eligible employee</span><select value={approverMembershipId} onChange={(event) => setApproverMembershipId(event.target.value)}><option value="">Select approver</option>{eligible.map((item) => <option key={item.membership_id} value={item.membership_id}>{item.employee_id} · {item.membership_id}</option>)}</select></label>
              {approverMembershipId && <div className="proof-readiness"><Fingerprint size={17} /><div><strong>{proof && credential ? 'Authority references available' : proof ? 'Policy-bound authority unavailable' : 'Purpose-bound verification required'}</strong><span>{proof ? `${policy?.proof_purpose} · proof ${proof.human_proof_id} · expires ${format(proof.expires_at)}` : policy?.proof_purpose}</span></div><button data-control-id="approval.decision.verify" className="secondary-button" type="button" onClick={() => onProofRequired(policy?.proof_purpose ?? 'approve protected action', selectedMembership?.human_id)}>Verify exact purpose</button></div>}
              <div className="approval-actions"><button data-control-id="approval.decision.reject" className="danger-button" type="button" disabled={busy || !approverMembershipId || selected.status !== 'pending'} onClick={() => void decide('reject')} title={proof && credential ? 'Persist a signed rejection decision.' : 'H2A checks the latest canonical proof and authority again before deciding.'}><X size={16} /> Reject</button><button data-control-id="approval.decision.approve" className="primary-button" type="button" disabled={busy || !approverMembershipId || selected.status !== 'pending'} onClick={() => void decide('approve')} title={proof && credential ? 'Persist a signed approval decision.' : 'H2A checks the latest canonical proof and authority again before deciding.'}><Check size={16} /> Approve</button>{resume?.status === 'ready' && <button data-control-id="approval.resume" className="primary-button" type="button" disabled={busy} onClick={() => void resumeAction()}><Play size={16} /> Resume once</button>}</div>
            </section> : <section className="approver-panel"><div><p className="section-kicker">TERMINAL REQUEST</p><h3>No decision can be added</h3><p>{selected.status === 'expired' ? 'This request expired. Refresh Phase 28, create a new rejection proof, and decide it before its displayed expiry.' : `This request is ${selected.status} and cannot receive another decision.`}</p></div></section>}
            {decisions.length > 0 && <section className="signature-list"><p className="section-kicker">CO-SIGNATURES</p>{decisions.map((item) => <div key={item.approval_decision_id}><span className={`decision-dot decision-${item.decision === 'rejected' ? 'rejected' : 'verified'}`} /><div><strong>{item.approver_human_id}</strong><span>{item.approver_membership_id} · {item.human_proof_id}</span></div><code>{item.canonical_hash.slice(0, 22)}…</code></div>)}</section>}
          </>}
        </section>
      </div>
      {message && <div className="approval-toast" role="status">{message}</div>}
      {showPolicy && <PolicyDialog organization={organization} onClose={() => setShowPolicy(false)} onSubmit={(next) => { onStateChange(next); setShowPolicy(false); }} />}
      {showRequest && <RequestDialog state={state} organization={organization} collaboration={collaboration} onClose={() => setShowRequest(false)} onSubmit={(next) => { onStateChange(next); setSelectedId(next.requests.at(-1)?.approval_request_id ?? ''); setShowRequest(false); }} />}
    </div>
  );
}

function HumanEscalationConsole({ organization, ceremony, onProofRequired, onRefresh }: { organization: OrganizationAuthorityState; ceremony: CeremonyState; onProofRequired(purpose: string, humanId?: string): void; onRefresh(): Promise<void> }): React.JSX.Element {
  const [state, setState] = useState<HumanEscalationState>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const session = ceremony.sessions.find((item) => item.ceremony_id === ceremony.active_ceremony_id) ?? ceremony.sessions.at(-1);
  useEffect(() => { if (window.h2a) void window.h2a.getHumanEscalationState().then(setState); }, []);
  const administrator = organization.memberships.find((item) => item.status === 'active' && item.role_ids.includes('role_authority_admin'));
  const admin = state?.approver_membership_id
    ? actorFor(organization, state.approver_membership_id)
    : administrator ? actorFor(organization, administrator.membership_id) : undefined;
  const authorityRecovery = useMemo(() => resolvePhase28AuthorityRecovery(organization, state), [organization, state]);
  async function run(work: () => Promise<HumanEscalationState>): Promise<void> { setBusy(true); setMessage(''); try { setState(await work()); await onRefresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Phase 28 operation failed.'); } finally { setBusy(false); } }
  async function startRequest(rejection: boolean): Promise<void> {
    if (!window.h2a || !session) return;
    await run(async () => {
      const [latestOrganization, latestState] = await Promise.all([
        window.h2a!.getOrganizationAuthorityState(),
        window.h2a!.getHumanEscalationState()
      ]);
      const requester = latestState.requester_membership_id
        ? actorFor(latestOrganization, latestState.requester_membership_id, 'request restricted findings publication')
        : undefined;
      if (!requester) throw new Error('Fresh Human Proof required for purpose: request restricted findings publication.');
      return rejection
        ? window.h2a!.startHumanEscalationRejection({ actor: requester, ceremony: correlation('rejection') })
        : window.h2a!.startHumanEscalation({ actor: requester, ceremony: correlation('request') });
    });
  }
  async function refresh(): Promise<void> {
    if (!window.h2a) return;
    setBusy(true);
    setMessage('');
    try {
      await onRefresh();
      setState(await window.h2a.getHumanEscalationState());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Phase 28 refresh failed.');
    } finally {
      setBusy(false);
    }
  }
  async function renewApproverAuthority(): Promise<void> {
    if (!window.h2a || !session) return;
    setBusy(true);
    setMessage('');
    try {
      let latestOrganization = await window.h2a.getOrganizationAuthorityState();
      const latestEscalation = await window.h2a.getHumanEscalationState();
      let recovery = resolvePhase28AuthorityRecovery(latestOrganization, latestEscalation);
      if (!recovery.membership) throw new Error('The active Phase 28 Administrator / Approver membership is unavailable.');
      if (recovery.activeCredential) {
        setState(latestEscalation);
        await onRefresh();
        return;
      }
      if (!recovery.expiredCredential) throw new Error('No expired policy-bound Phase 28 credential is available for exact-scope replacement.');
      if (!recovery.recoveryProof) throw new Error(`Fresh Human Proof required for purpose: ${ADMINISTRATOR_RECOVERY_PURPOSE}.`);
      if (!recovery.administratorCredential) {
        latestOrganization = await window.h2a.recoverAdministratorCredential({
          organization_id: recovery.membership.organization_id,
          membership_id: recovery.membership.membership_id,
          human_proof_id: recovery.recoveryProof.human_proof_id,
          expires_at: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
          ceremony: correlation('recover-administrator')
        });
        recovery = resolvePhase28AuthorityRecovery(latestOrganization, latestEscalation);
      }
      const administratorCredential = recovery.administratorCredential;
      const expiredCredential = recovery.expiredCredential;
      const membership = recovery.membership;
      const proof = recovery.recoveryProof;
      if (!administratorCredential || !expiredCredential || !membership || !proof) throw new Error('Administrator recovery did not produce all required signed authority references.');
      await window.h2a.issueHumanAuthorityCredential({
        actor: { membership_id: membership.membership_id, human_proof_id: proof.human_proof_id, authority_credential_id: administratorCredential.credential_id },
        organization_id: membership.organization_id,
        membership_id: membership.membership_id,
        role_ids: expiredCredential.role_ids,
        resource_constraints: expiredCredential.resource_constraints,
        action_constraints: expiredCredential.action_constraints,
        approval_policy_ids: expiredCredential.approval_policy_ids,
        expires_at: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
        ceremony: correlation('replace-approver-credential')
      });
      await onRefresh();
      setState(await window.h2a.getHumanEscalationState());
      setMessage('Phase 28 approver authority renewed for 120 minutes with the exact prior role, policy, and constraints.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Phase 28 approver authority renewal failed closed.');
    } finally {
      setBusy(false);
    }
  }
  function correlation(action: string) { if (!session) throw new Error('Create the shared ceremony before Phase 28.'); return { ceremony_id: session.ceremony_id, trace_id: session.trace_id, idempotency_key: `phase28_${action}_${Date.now()}` }; }
  const status = state?.status ?? 'not-started';
  return <section className="human-escalation-console">
    <header><div><p className="section-kicker">PHASE 28 / CROSS-HUMAN AUTHORITY</p><h2>Purpose-bound approval and exactly-once resume</h2><p>A protected provider effect is frozen, routed to a different eligible human, and executed once under a narrow child mandate.</p></div><button className="icon-button" type="button" title="Refresh Phase 28" disabled={busy} onClick={() => void refresh()}><RefreshCw size={18} /></button></header>
    <div className="human-escalation-facts"><Fact label="Ceremony" value={state?.ceremony_id ?? 'Not configured'} /><Fact label="Shared trace" value={state?.trace_id ?? 'Not configured'} /><Fact label="Status" value={status} /><Fact label="Trust" value="Connected-observed ceiling" /></div>
    <div className="human-escalation-steps">
      <div><strong>1. Authority setup</strong><span>{state?.policy_id ?? 'Role, policy, credential, assignment, and review grant required.'}</span></div>
      <div><strong>2. Operator request</strong><span>{state?.approval_request_id ?? 'Exact-purpose requester proof required.'}</span></div>
      <div><strong>3. Independent decision</strong><span>{status === 'approval-pending' ? 'Select the different eligible employee below and verify the displayed purpose.' : status === 'approved' ? 'Approved; resume is ready.' : 'Awaiting routed request.'}</span></div>
      <div><strong>4. Exactly-once effect</strong><span>{state?.output_hash ?? 'No provider effect executed.'}</span></div>
    </div>
    {['completed', 'completed-with-rejection'].includes(status) && !authorityRecovery.activeCredential && <div className="authority-alert"><KeyRound size={18} /><span><strong>Phase 28 approver authority expired</strong><small>Quorum remains unavailable until the Administrator / Approver verifies for credential recovery and H2A replaces the expired policy-bound credential with the exact same scope.</small></span></div>}
    {message && <p className="form-error" role="alert">{message}</p>}
    <footer>
      {status === 'not-started' && <button data-control-id="phase28.configure" className="primary-button" type="button" disabled={busy || !admin || !session} onClick={() => admin && window.h2a && void run(() => window.h2a!.configureHumanEscalation({ actor: admin, ceremony: correlation('configure') }))}><Play size={16} /> Configure Phase 28</button>}
      {status === 'ready' && <><button data-control-id="phase28.requester.verify" className="secondary-button" type="button" onClick={() => onProofRequired('request restricted findings publication', state?.requester_human_id ?? undefined)}><Fingerprint size={16} /> Verify requester</button><button data-control-id="phase28.request" className="primary-button" type="button" disabled={busy || !state?.requester_membership_id} onClick={() => void startRequest(false)}><ShieldAlert size={16} /> Route protected action</button></>}
      {status === 'completed' && <><button data-control-id="phase28.requester.verify" className="secondary-button" type="button" onClick={() => onProofRequired('request restricted findings publication', state?.requester_human_id ?? undefined)}><Fingerprint size={16} /> Verify requester</button>{!authorityRecovery.activeCredential && !authorityRecovery.recoveryProof ? <button data-control-id="phase28.authority.verify" className="secondary-button" type="button" disabled={busy || !authorityRecovery.membership} onClick={() => onProofRequired(ADMINISTRATOR_RECOVERY_PURPOSE, authorityRecovery.membership?.human_id)}><Fingerprint size={16} /> Verify authority renewal</button> : !authorityRecovery.activeCredential ? <button data-control-id="phase28.authority.renew" className="primary-button" type="button" disabled={busy || !authorityRecovery.expiredCredential} onClick={() => void renewApproverAuthority()}><KeyRound size={16} /> Renew approver authority</button> : <button data-control-id="phase28.rejection" className="danger-button" type="button" disabled={busy || !state?.requester_membership_id} onClick={() => void startRequest(true)}><X size={16} /> Create rejection proof</button>}</>}
      {status === 'completed-with-rejection' && <><StatusBadge label="Phase 28 complete" tone="verified" />{!authorityRecovery.activeCredential && (!authorityRecovery.recoveryProof ? <button data-control-id="phase28.authority.verify" className="secondary-button" type="button" disabled={busy || !authorityRecovery.membership} onClick={() => onProofRequired(ADMINISTRATOR_RECOVERY_PURPOSE, authorityRecovery.membership?.human_id)}><Fingerprint size={16} /> Verify authority renewal</button> : <button data-control-id="phase28.authority.renew" className="primary-button" type="button" disabled={busy || !authorityRecovery.expiredCredential} onClick={() => void renewApproverAuthority()}><KeyRound size={16} /> Renew approver authority</button>)}</>}
    </footer>
  </section>;
}

function PolicyDialog({ organization, onClose, onSubmit }: { organization: OrganizationAuthorityState; onClose(): void; onSubmit(state: AuthorityApprovalState): void }): React.JSX.Element {
  const [role, setRole] = useState(organization.roles.find((item) => item.status === 'active')?.role_id ?? '');
  const [quorum, setQuorum] = useState(1);
  const [error, setError] = useState('');
  const actor = currentActor(organization);
  async function submit(): Promise<void> {
    if (!window.h2a || !actor) return;
    try { onSubmit(await window.h2a.createApprovalPolicy({ actor, organization_id: organization.organizations[0].organization_id, approval_policy_id: `policy_${crypto.randomUUID()}`, name: 'Restricted action approval', eligible_role_ids: [role], quorum, separation_of_duty: true, risk_tiers: ['restricted'], proof_purpose: 'approve restricted H2A action', decision_ttl_seconds: 300 })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Policy creation failed.'); }
  }
  return <div className="modal-scrim"><section className="authority-dialog" role="dialog" aria-modal="true"><header><div><h2>New approval policy</h2><p>Define eligible authority and a purpose-bound quorum.</p></div><button className="icon-button" type="button" onClick={onClose} title="Close"><X size={17} /></button></header><div className="authority-dialog-body"><label className="field"><span>Eligible role</span><select value={role} onChange={(event) => setRole(event.target.value)}>{organization.roles.filter((item) => item.status === 'active').map((item) => <option key={item.role_id} value={item.role_id}>{item.name}</option>)}</select></label><label className="field"><span>Quorum</span><input type="number" min={1} max={10} value={quorum} onChange={(event) => setQuorum(Number(event.target.value))} /></label><p className="dialog-note">Purpose: approve restricted H2A action · TTL: 5 minutes · separation of duty: on</p>{error && <p className="form-error">{error}</p>}</div><footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button data-control-id="approval.policy.create" className="primary-button" type="button" disabled={!actor || !role} onClick={() => void submit()}><Check size={16} /> Create policy</button></footer></section></div>;
}

function RequestDialog({ state, organization, collaboration, onClose, onSubmit }: { state: AuthorityApprovalState; organization: OrganizationAuthorityState; collaboration: CollaborationState; onClose(): void; onSubmit(state: AuthorityApprovalState): void }): React.JSX.Element {
  const assignment = collaboration.workplace.assignments.find((item) => ['approval', 'blocked'].includes(item.status));
  const activePolicies = state.policies.filter((item) => item.status === 'active');
  const initialPolicy = activePolicies[0];
  const initial = resolveApprovalRequestDefaults(organization, initialPolicy);
  const [policyId, setPolicyId] = useState(initialPolicy?.approval_policy_id ?? '');
  const [requesterMembershipId, setRequesterMembershipId] = useState(initial.requesterMembershipId);
  const [resource, setResource] = useState(initial.resource);
  const [action, setAction] = useState(initial.action);
  const [power, setPower] = useState(initial.approvalPower);
  const [error, setError] = useState('');
  const membership = organization.memberships.find((item) => item.membership_id === requesterMembershipId && item.status === 'active');
  const policy = activePolicies.find((item) => item.approval_policy_id === policyId);
  const route = previewApprovalRoute(organization, policy, requesterMembershipId, resource, action, power);
  function selectPolicy(nextPolicyId: string): void {
    const nextPolicy = activePolicies.find((item) => item.approval_policy_id === nextPolicyId);
    const defaults = resolveApprovalRequestDefaults(organization, nextPolicy);
    setPolicyId(nextPolicyId);
    setRequesterMembershipId(defaults.requesterMembershipId);
    setResource(defaults.resource);
    setAction(defaults.action);
    setPower(defaults.approvalPower);
    setError('');
  }
  async function submit(): Promise<void> {
    if (!window.h2a || !assignment || !membership) return;
    if (!route.ready) { setError(`Approval cannot be routed: ${route.eligibleMembershipIds.length} active policy-bound approvers available; quorum requires ${route.quorum}.`); return; }
    try { onSubmit(await window.h2a.requestAuthorityEscalation({ organization_id: membership.organization_id, task_id: assignment.id, requesting_human_id: membership.human_id, requesting_membership_id: membership.membership_id, requesting_agent_id: assignment.assigneeId, mandate_id: assignment.mandateId, required_resource: resource, required_action: action, required_approval_power: power, requested_effect_hash: `sha256:${'e'.repeat(64)}`, review_context_grant_id: `ctx_${crypto.randomUUID()}`, approval_policy_id: policyId, risk_tier: 'restricted', idempotency_key: `resume_${crypto.randomUUID()}` })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Escalation failed.'); }
  }
  return <div className="modal-scrim"><section className="authority-dialog" role="dialog" aria-modal="true"><header><div><h2>Escalate paused action</h2><p>Freeze the exact effect and route it to eligible humans.</p></div><button className="icon-button" type="button" onClick={onClose} title="Close"><X size={17} /></button></header><div className="authority-dialog-body"><label className="field"><span>Paused assignment</span><input value={assignment?.title ?? 'No blocked or approval assignment'} disabled /></label><label className="field"><span>Requester employee</span><select value={requesterMembershipId} onChange={(event) => { setRequesterMembershipId(event.target.value); setError(''); }}>{organization.memberships.filter((item) => item.status === 'active').map((item) => <option key={item.membership_id} value={item.membership_id}>{item.employee_id} - {item.department}</option>)}</select></label><label className="field"><span>Policy</span><select value={policyId} onChange={(event) => selectPolicy(event.target.value)}>{activePolicies.map((item) => <option key={item.approval_policy_id} value={item.approval_policy_id}>{item.name}</option>)}</select></label><div className="form-grid"><label className="field"><span>Resource</span><input value={resource} onChange={(event) => { setResource(event.target.value); setError(''); }} /></label><label className="field"><span>Action</span><input value={action} onChange={(event) => { setAction(event.target.value); setError(''); }} /></label></div><label className="field"><span>Required approval power</span><input value={power} onChange={(event) => { setPower(event.target.value); setError(''); }} /></label><p className="dialog-note" role="status">Eligible policy-bound approvers: {route.eligibleMembershipIds.length} / {route.quorum} required.{!route.ready ? ' Renew approver authority or choose a different requester before routing.' : ' Separation of duty can be satisfied.'}</p>{error && <p className="form-error">{error}</p>}</div><footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button data-control-id="approval.request.create" className="primary-button" type="button" disabled={!assignment || !membership || !policyId || !route.ready} onClick={() => void submit()}><ShieldAlert size={16} /> Route approval</button></footer></section></div>;
}

function currentActor(state: OrganizationAuthorityState) {
  const assurance = state.assurance[0];
  const credential = state.credentials.find((item) => item.membership_id === assurance?.membership_id && item.status === 'active');
  return assurance && credential ? { membership_id: assurance.membership_id, human_proof_id: assurance.human_proof_id, authority_credential_id: credential.credential_id } : undefined;
}
function actorFor(state: OrganizationAuthorityState, membershipId: string, purpose?: string) {
  const assurance = latestAssuranceFor(state, membershipId, purpose);
  const credential = state.credentials.find((item) => item.membership_id === membershipId && item.status === 'active');
  return assurance && credential ? { membership_id: membershipId, human_proof_id: assurance.human_proof_id, authority_credential_id: credential.credential_id } : undefined;
}
function latestAssuranceFor(state: OrganizationAuthorityState, membershipId: string, purpose?: string) {
  const now = Date.now();
  return state.assurance
    .filter((item) => item.membership_id === membershipId && (!purpose || item.purpose === purpose) && new Date(item.expires_at).getTime() > now)
    .sort((left, right) => right.expires_at.localeCompare(left.expires_at))[0];
}
function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Clock3 }): React.JSX.Element { return <div><span><Icon size={16} /> {label}</span><strong>{value}</strong></div>; }
function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }): React.JSX.Element { return <div className={wide ? 'wide' : ''}><span>{label}</span><code>{value}</code></div>; }
function format(value: string): string { return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
