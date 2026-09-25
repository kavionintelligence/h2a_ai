import { useMemo, useState } from 'react';
import { Ban, Check, ChevronRight, FileSignature, KeyRound, Pause, Play, Plus, ShieldAlert, TestTube2, UserCheck, X } from 'lucide-react';
import type { AgentIdentityState, CreateMandateRequest, HumanAuthorityContext, Mandate, MandateState, OrganizationAuthorityState } from '@h2a/contracts';
import { StatePanel, StatusBadge } from '@h2a/ui';

interface Props {
  state: MandateState;
  identityState: AgentIdentityState;
  organizationState: OrganizationAuthorityState;
  onStateChange: (state: MandateState) => void;
  onHumanProofRequired: () => void;
}

type FormState = {
  agentId: string; objective: string; resources: string; actions: string; prohibitedActions: string;
  allowedFields: string; approvalActions: string; maxAmount: string; maxRecords: string;
  maxDurationMinutes: string; parameterEquals: string; expiresAt: string; delegationAllowed: boolean;
  allowedAgentIds: string; maxDepth: string;
};

const initialForm: FormState = {
  agentId: '', objective: '', resources: '', actions: '', prohibitedActions: '', allowedFields: '',
  approvalActions: '', maxAmount: '', maxRecords: '', maxDurationMinutes: '', parameterEquals: '{}',
  expiresAt: '', delegationAllowed: false, allowedAgentIds: '', maxDepth: '0'
};

export function MandatesView({ state, identityState, organizationState, onStateChange, onHumanProofRequired }: Props): React.JSX.Element {
  const [selectedId, setSelectedId] = useState(state.mandates[0]?.mandateId ?? '');
  const [composerOpen, setComposerOpen] = useState(false);
  const [delegateFrom, setDelegateFrom] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [policy, setPolicy] = useState({ resource: '', action: '', parameters: '{}', fields: '', idempotencyKey: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const selected = state.mandates.find((mandate) => mandate.mandateId === selectedId) ?? state.mandates[0];
  const activeCount = state.mandates.filter((mandate) => effectiveStatus(mandate) === 'active').length;
  const pending = state.approvals.filter((approval) => approval.status === 'pending');
  const passports = identityState.passports.filter((passport) => passport.status === 'active');
  const children = selected ? state.mandates.filter((mandate) => mandate.parentMandateId === selected.mandateId) : [];
  const latestDecision = state.decisions[0];
  const humanAuthority = useMemo(() => resolveHumanAuthority(organizationState), [organizationState]);

  const passportNames = useMemo(() => new Map(identityState.passports.map((passport) => [passport.agent_id, passport.name])), [identityState.passports]);

  const run = async (label: string, operation: () => Promise<MandateState>): Promise<boolean> => {
    setBusy(label); setError('');
    try { onStateChange(await operation()); return true; } catch (caught) { setError(caught instanceof Error ? caught.message : 'The authority operation failed.'); return false; }
    finally { setBusy(''); }
  };

  const openComposer = (parent?: Mandate): void => {
    setDelegateFrom(parent?.mandateId ?? null);
    setForm(parent ? {
      agentId: '', objective: parent.objective, resources: parent.resources.join(', '), actions: parent.actions.join(', '),
      prohibitedActions: parent.prohibitedActions.join(', '), allowedFields: parent.disclosure.allowedFields.join(', '),
      approvalActions: parent.approvals.requiredActions.join(', '), maxAmount: numberText(parent.limits.maxAmount),
      maxRecords: numberText(parent.limits.maxRecords), maxDurationMinutes: numberText(parent.limits.maxDurationMinutes),
      parameterEquals: JSON.stringify(parent.limits.parameterEquals, null, 2), expiresAt: toLocalDateTime(parent.expiresAt),
      delegationAllowed: false, allowedAgentIds: '', maxDepth: String(parent.delegation.maxDepth)
    } : { ...initialForm, agentId: passports[0]?.agent_id ?? '', expiresAt: toLocalDateTime(new Date(Date.now() + 86_400_000).toISOString()) });
    setComposerOpen(true); setError('');
  };

  const submitMandate = async (): Promise<void> => {
    if (!window.h2a) { setError('Mandate mutations require the trusted desktop runtime.'); return; }
    if (!humanAuthority) { setError('A current Human Proof and active authority credential are required.'); return; }
    let parameterEquals: Record<string, string | number | boolean>;
    try { parameterEquals = JSON.parse(form.parameterEquals) as Record<string, string | number | boolean>; } catch { setError('Parameter constraints must be valid JSON.'); return; }
    if (!form.expiresAt || Number.isNaN(new Date(form.expiresAt).getTime())) { setError('A valid mandate expiry is required.'); return; }
    const request: CreateMandateRequest = {
      agentId: form.agentId, objective: form.objective, resources: list(form.resources), actions: list(form.actions),
      prohibitedActions: list(form.prohibitedActions), limits: compactLimits(form, parameterEquals), allowedFields: list(form.allowedFields),
      approvalActions: list(form.approvalActions), delegation: { allowed: form.delegationAllowed, allowedAgentIds: list(form.allowedAgentIds), maxDepth: Number(form.maxDepth) },
      expiresAt: new Date(form.expiresAt).toISOString(), humanAuthority
    };
    const succeeded = await run('signing', async () => delegateFrom
      ? window.h2a!.delegateMandate({ ...request, parentMandateId: delegateFrom, fromAgentId: state.mandates.find((item) => item.mandateId === delegateFrom)!.subject.agentId })
      : window.h2a!.createMandate(request));
    if (succeeded) setComposerOpen(false);
  };

  const testPolicy = async (): Promise<void> => {
    if (!window.h2a || !selected) { setError('Policy evaluation requires a selected mandate in the trusted desktop runtime.'); return; }
    let parameters: Record<string, unknown>;
    try { parameters = JSON.parse(policy.parameters) as Record<string, unknown>; } catch { setError('Action parameters must be valid JSON.'); return; }
    await run('evaluating', () => window.h2a!.authorizeAction({ agentId: selected.subject.agentId, mandateId: selected.mandateId, resource: policy.resource, action: policy.action, parameters, requestedFields: list(policy.fields), idempotencyKey: policy.idempotencyKey || `ui-${Date.now()}` }));
  };

  return (
    <div className="mandates-page">
      <header className="mandates-header">
        <div><p className="section-kicker">AUTHORITY CONTROL PLANE</p><h2>Mandates & policy</h2><p className="mandates-subtitle">Signed scope, bounded delegation, deterministic decisions, and human approval.</p></div>
        <div className="mandate-metrics" aria-label="Mandate summary">
          <Metric label="Active" value={activeCount} tone="verified" />
          <Metric label="Pending approvals" value={pending.length} tone={pending.length ? 'approval' : 'neutral'} />
          <Metric label="Denied" value={state.decisions.filter((item) => item.decision === 'DENY').length} tone="danger" />
        </div>
        <button className="primary-button" onClick={() => openComposer()} disabled={!passports.length || !humanAuthority || Boolean(busy)}><Plus size={17} /> New mandate</button>
      </header>

      {!humanAuthority && <div className="authority-alert"><ShieldAlert size={19} /><div><strong>Human authority required</strong><span>Issuance and approval require a current Human Proof plus an active credential granting mandate authority.</span></div><button data-control-id="mandates.proof.request" onClick={onHumanProofRequired}>Verify human</button></div>}
      {error && <div className="inline-error" role="alert"><ShieldAlert size={17} />{error}<button aria-label="Dismiss error" title="Dismiss" onClick={() => setError('')}><X size={16} /></button></div>}

      <div className="mandates-grid">
        <section className="mandate-registry" aria-label="Mandate registry">
          <div className="panel-title-row"><div><p className="section-kicker">REGISTRY</p><h3>Signed authority</h3></div><span>{state.mandates.length} records</span></div>
          {state.mandates.length === 0 ? <StatePanel title="No signed mandates" description={passports.length ? 'Create the first authority envelope for an active Agent Passport.' : 'Issue an Agent Passport before creating authority.'} compact /> : (
            <div className="mandate-list">{state.mandates.map((mandate) => <button key={mandate.mandateId} className={`mandate-list-item ${selected?.mandateId === mandate.mandateId ? 'selected' : ''}`} onClick={() => setSelectedId(mandate.mandateId)}><span className="mandate-list-icon"><KeyRound size={16} /></span><span><strong>{passportNames.get(mandate.subject.agentId) ?? mandate.subject.agentId}</strong><small>{mandate.objective}</small><code>{shortId(mandate.mandateId)}</code></span><StatusBadge label={effectiveStatus(mandate)} tone={statusTone(effectiveStatus(mandate))} /></button>)}</div>
          )}
        </section>

        <section className="mandate-detail" aria-label="Selected mandate">
          {!selected ? <StatePanel title="Authority not selected" description="Select or create a mandate to inspect its enforceable policy." compact /> : <>
            <div className="mandate-detail-header"><div><div className="detail-badges"><StatusBadge label={effectiveStatus(selected)} tone={statusTone(effectiveStatus(selected))} /><span>v{selected.version}</span><span>depth {selected.depth}</span></div><h3>{selected.objective}</h3><code>{selected.mandateId}</code></div><div className="icon-actions">
              <button title="Delegate authority" aria-label="Delegate authority" onClick={() => openComposer(selected)} disabled={selected.status !== 'active' || !selected.delegation.allowed || Boolean(busy)}><ChevronRight size={18} /></button>
              {selected.status === 'active' ? <button data-control-id="mandate.lifecycle" title="Suspend mandate" aria-label="Suspend mandate" onClick={() => window.h2a && humanAuthority && void run('suspend', () => window.h2a!.updateMandate({ mandateId: selected.mandateId, action: 'suspend', humanAuthority }))} disabled={!humanAuthority || Boolean(busy)}><Pause size={18} /></button> : selected.status === 'suspended' ? <button data-control-id="mandate.lifecycle" title="Reactivate mandate" aria-label="Reactivate mandate" onClick={() => window.h2a && humanAuthority && void run('reactivate', () => window.h2a!.updateMandate({ mandateId: selected.mandateId, action: 'reactivate', humanAuthority }))} disabled={!humanAuthority || Boolean(busy)}><Play size={18} /></button> : null}
              <button data-control-id="mandate.lifecycle" className="danger-icon" title="Revoke mandate and descendants" aria-label="Revoke mandate and descendants" onClick={() => window.h2a && humanAuthority && void run('revoke', () => window.h2a!.updateMandate({ mandateId: selected.mandateId, action: 'revoke', humanAuthority }))} disabled={!humanAuthority || selected.status === 'revoked' || Boolean(busy)}><Ban size={18} /></button>
            </div></div>
            <div className="mandate-facts"><Fact label="Subject" value={passportNames.get(selected.subject.agentId) ?? selected.subject.agentId} /><Fact label="Issuer proof" value={shortId(selected.issuer.humanProofId)} mono /><Fact label="Expires" value={new Date(selected.expiresAt).toLocaleString()} /><Fact label="Signature" value={shortId(selected.signature.canonicalHash)} mono /></div>
            <div className="mandate-scope-grid"><Scope title="Resources" values={selected.resources} /><Scope title="Allowed actions" values={selected.actions} /><Scope title="Prohibited" values={selected.prohibitedActions} danger /><Scope title="Disclosure" values={selected.disclosure.allowedFields} /></div>
            <div className="limits-strip"><Fact label="Max amount" value={limitText(selected.limits.maxAmount)} /><Fact label="Max records" value={limitText(selected.limits.maxRecords)} /><Fact label="Max duration" value={selected.limits.maxDurationMinutes ? `${selected.limits.maxDurationMinutes} min` : 'Not granted'} /><Fact label="Approval gates" value={selected.approvals.requiredActions.join(', ') || 'None'} /></div>
            <section className="delegation-chain"><div className="panel-title-row"><div><p className="section-kicker">DELEGATION</p><h3>Authority chain</h3></div><span>{children.length} direct children</span></div><div className="chain-row"><span className="chain-node root"><FileSignature size={16} />{shortId(selected.mandateId)}</span>{children.map((child) => <span className="chain-child" key={child.mandateId}><ChevronRight size={16} /><button onClick={() => setSelectedId(child.mandateId)}>{shortId(child.mandateId)} <small>{passportNames.get(child.subject.agentId)}</small></button></span>)}</div></section>
          </>}
        </section>

        <aside className="mandate-rail">
          <section className="policy-tester"><div className="panel-title-row"><div><p className="section-kicker">POLICY GATEWAY</p><h3>Evaluate action</h3></div><TestTube2 size={18} /></div><Field label="Resource"><input value={policy.resource} onChange={(event) => setPolicy({ ...policy, resource: event.target.value })} placeholder="invoice:9182" /></Field><Field label="Action"><input value={policy.action} onChange={(event) => setPolicy({ ...policy, action: event.target.value })} placeholder="invoice.read" /></Field><Field label="Parameters (JSON)"><textarea value={policy.parameters} onChange={(event) => setPolicy({ ...policy, parameters: event.target.value })} rows={3} /></Field><Field label="Requested fields"><input value={policy.fields} onChange={(event) => setPolicy({ ...policy, fields: event.target.value })} placeholder="invoiceId, amount" /></Field><button data-control-id="mandate.authorize" className="secondary-button full-width" onClick={() => void testPolicy()} disabled={!selected || Boolean(busy)}><TestTube2 size={16} />{busy === 'evaluating' ? 'Evaluating...' : 'Run policy'}</button>{latestDecision && <Decision result={latestDecision} />}</section>
          <section className="approval-queue"><div className="panel-title-row"><div><p className="section-kicker">HUMAN GATE</p><h3>Approvals</h3></div><span>{pending.length} pending</span></div>{pending.length === 0 ? <p className="quiet-empty">No sensitive actions are waiting.</p> : pending.map((approval) => <div className="approval-item" key={approval.approvalRequestId}><div><strong>{approval.authorizationRequest.action}</strong><code>{shortId(approval.mandateId)}</code><small>{approval.authorizationRequest.resource}</small></div><div><button data-control-id="mandate.approval.resolve" title="Approve action" aria-label="Approve action" disabled={!humanAuthority} onClick={() => window.h2a && humanAuthority && void run('approval', () => window.h2a!.resolveApproval({ approvalRequestId: approval.approvalRequestId, action: 'approve', humanAuthority }))}><Check size={17} /></button><button data-control-id="mandate.approval.resolve" className="danger-icon" title="Reject action" aria-label="Reject action" disabled={!humanAuthority} onClick={() => window.h2a && humanAuthority && void run('approval', () => window.h2a!.resolveApproval({ approvalRequestId: approval.approvalRequestId, action: 'reject', humanAuthority }))}><X size={17} /></button></div></div>)}</section>
        </aside>
      </div>

      {composerOpen && <div className="modal-scrim" role="presentation"><div className="mandate-composer" role="dialog" aria-modal="true" aria-labelledby="mandate-composer-title"><header><div><p className="section-kicker">{delegateFrom ? 'ATTENUATED CHILD' : 'ROOT AUTHORITY'}</p><h2 id="mandate-composer-title">{delegateFrom ? 'Delegate mandate' : 'Compose mandate'}</h2></div><button className="icon-button" aria-label="Close composer" title="Close" onClick={() => setComposerOpen(false)}><X size={19} /></button></header><div className="composer-body">
        <Field label="Agent Passport"><select value={form.agentId} onChange={(event) => setForm({ ...form, agentId: event.target.value })}><option value="">Select agent</option>{passports.filter((passport) => !delegateFrom || passport.agent_id !== selected?.subject.agentId).map((passport) => <option key={passport.agent_id} value={passport.agent_id}>{passport.name} - {passport.role}</option>)}</select></Field>
        <Field label="Objective"><textarea value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} rows={2} /></Field>
        <div className="form-grid"><Field label="Resources"><input value={form.resources} onChange={(event) => setForm({ ...form, resources: event.target.value })} placeholder="invoice:9182" /></Field><Field label="Allowed actions"><input value={form.actions} onChange={(event) => setForm({ ...form, actions: event.target.value })} placeholder="invoice.read, payment.prepare" /></Field><Field label="Prohibited actions"><input value={form.prohibitedActions} onChange={(event) => setForm({ ...form, prohibitedActions: event.target.value })} placeholder="vendor.delete" /></Field><Field label="Disclosure fields"><input value={form.allowedFields} onChange={(event) => setForm({ ...form, allowedFields: event.target.value })} placeholder="invoiceId, amount" /></Field><Field label="Human approval actions"><input value={form.approvalActions} onChange={(event) => setForm({ ...form, approvalActions: event.target.value })} placeholder="payment.execute" /></Field><Field label="Expires"><input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></Field><Field label="Maximum amount"><input type="number" min="0" value={form.maxAmount} onChange={(event) => setForm({ ...form, maxAmount: event.target.value })} /></Field><Field label="Maximum records"><input type="number" min="1" value={form.maxRecords} onChange={(event) => setForm({ ...form, maxRecords: event.target.value })} /></Field><Field label="Maximum duration (minutes)"><input type="number" min="1" value={form.maxDurationMinutes} onChange={(event) => setForm({ ...form, maxDurationMinutes: event.target.value })} /></Field></div>
        <Field label="Exact parameter constraints (JSON)"><textarea className="mono" value={form.parameterEquals} onChange={(event) => setForm({ ...form, parameterEquals: event.target.value })} rows={3} /></Field>
        <label className="check-row"><input type="checkbox" checked={form.delegationAllowed} onChange={(event) => setForm({ ...form, delegationAllowed: event.target.checked })} /><span><strong>Allow bounded delegation</strong><small>Children remain subject to parent scope, limits, expiry, and depth.</small></span></label>
        {form.delegationAllowed && <div className="form-grid"><Field label="Allowed destination agent IDs"><input value={form.allowedAgentIds} onChange={(event) => setForm({ ...form, allowedAgentIds: event.target.value })} /></Field><Field label="Maximum chain depth"><input type="number" min="0" max="8" value={form.maxDepth} onChange={(event) => setForm({ ...form, maxDepth: event.target.value })} /></Field></div>}
      </div><footer><span><UserCheck size={16} />Current Human Proof will bind this signature.</span><button className="secondary-button" onClick={() => setComposerOpen(false)}>Cancel</button><button data-control-id="mandate.create-or-delegate" className="primary-button" onClick={() => void submitMandate()} disabled={busy === 'signing'}><FileSignature size={17} />{busy === 'signing' ? 'Signing...' : 'Sign & activate'}</button></footer></div></div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Metric({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className={`mandate-metric ${tone}`}><strong>{value}</strong><span>{label}</span></div>; }
function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="mandate-fact"><span>{label}</span><strong className={mono ? 'mono' : ''}>{value}</strong></div>; }
function Scope({ title, values, danger = false }: { title: string; values: string[]; danger?: boolean }) { return <div className={`scope-group ${danger ? 'danger' : ''}`}><span>{title}</span><div>{values.length ? values.map((value) => <code key={value}>{value}</code>) : <small>None</small>}</div></div>; }
function Decision({ result }: { result: MandateState['decisions'][number] }) { return <div className={`decision-result ${result.decision.toLowerCase().replaceAll('_', '-')}`}><div><strong>{result.decision.replaceAll('_', ' ')}</strong><span>{result.reasonCode.replaceAll('_', ' ')}</span></div><code>{shortId(result.traceId)}</code></div>; }
function list(value: string): string[] { return value.split(',').map((item) => item.trim()).filter(Boolean); }
function compactLimits(form: FormState, parameterEquals: Record<string, string | number | boolean>) { return { ...(form.maxAmount ? { maxAmount: Number(form.maxAmount) } : {}), ...(form.maxRecords ? { maxRecords: Number(form.maxRecords) } : {}), ...(form.maxDurationMinutes ? { maxDurationMinutes: Number(form.maxDurationMinutes) } : {}), parameterEquals }; }
function shortId(value: string): string { return value.length > 24 ? `${value.slice(0, 12)}...${value.slice(-8)}` : value; }
function numberText(value?: number): string { return value === undefined ? '' : String(value); }
function limitText(value?: number): string { return value === undefined ? 'Not granted' : value.toLocaleString(); }
function toLocalDateTime(value: string): string { const date = new Date(value); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function effectiveStatus(mandate: Mandate): Mandate['status'] { return mandate.status === 'active' && new Date(mandate.expiresAt).getTime() <= Date.now() ? 'expired' : mandate.status; }
function statusTone(status: Mandate['status']): 'verified' | 'approval' | 'danger' | 'neutral' { return status === 'active' ? 'verified' : status === 'suspended' ? 'approval' : status === 'revoked' ? 'danger' : 'neutral'; }
function resolveHumanAuthority(state: OrganizationAuthorityState): HumanAuthorityContext | undefined { for (const proof of state.assurance) { const credential = state.credentials.find((item) => item.membership_id === proof.membership_id && item.status === 'active' && item.role_ids.some((roleId) => state.roles.some((role) => role.role_id === roleId && role.status === 'active' && role.authority_scopes.some((scope) => (scope.resource === 'mandate' || scope.resource === '*') && scope.actions.some((action) => action === 'issue' || action === '*'))))); if (credential) return { organizationId: credential.organization_id, membershipId: proof.membership_id, humanProofId: proof.human_proof_id, authorityCredentialId: credential.credential_id }; } return undefined; }
