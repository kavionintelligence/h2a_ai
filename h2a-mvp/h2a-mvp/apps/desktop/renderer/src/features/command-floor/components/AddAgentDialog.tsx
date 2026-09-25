import { useEffect, useMemo, useState } from 'react';
import { Bot, KeyRound, ShieldCheck } from 'lucide-react';
import type { AgentIdentityState, CreateAgentRequest, OrganizationAuthorityState, ProviderId } from '@h2a/contracts';
import { ModalDialog } from '@h2a/ui';

const capabilityOptions = [
  ['research.public', 'Public research'],
  ['document.summarize', 'Document summaries'],
  ['code.read', 'Read source code'],
  ['code.write', 'Propose code changes'],
  ['evidence.read', 'Inspect evidence'],
  ['resource.request', 'Request protected resources']
] as const;

interface AddAgentDialogProps {
  open: boolean;
  identityState: AgentIdentityState;
  organizationState: OrganizationAuthorityState;
  onClose(): void;
  onCreated(state: AgentIdentityState, bindingId: string): void;
  onHumanProofRequired(): void;
  initialProviderId?: ProviderId;
  guided?: boolean;
}

export function AddAgentDialog({ open, identityState, organizationState, onClose, onCreated, onHumanProofRequired, initialProviderId, guided = false }: AddAgentDialogProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [providerId, setProviderId] = useState<ProviderId>('scripted');
  const [model, setModel] = useState('coordinator-v0');
  const [workspace, setWorkspace] = useState('C:\\H2A\\workspace');
  const [command, setCommand] = useState('');
  const [credential, setCredential] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>(['research.public', 'document.summarize']);
  const [purpose, setPurpose] = useState('Coordinate approved enterprise work within assigned mandates.');
  const [riskTier, setRiskTier] = useState<'standard' | 'sensitive' | 'restricted' | 'critical'>('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const provider = useMemo(() => identityState.providers.find((item) => item.id === providerId) ?? identityState.providers[0], [identityState.providers, providerId]);
  const sponsorAuthority = useMemo(() => resolveSponsorAuthority(organizationState), [organizationState]);

  useEffect(() => {
    if (!open || !initialProviderId || !identityState.providers.some((item) => item.id === initialProviderId)) return;
    const selected = identityState.providers.find((item) => item.id === initialProviderId)!;
    setProviderId(initialProviderId);
    setName((current) => current || `${selected.label} agent`);
    setRole((current) => current || (initialProviderId === 'custom-cli' ? 'Company specialist' : 'Collaborative specialist'));
  }, [identityState.providers, initialProviderId, open]);

  useEffect(() => {
    if (!provider) return;
    setModel(provider.models.find((item) => item.recommended)?.id ?? provider.models[0].id);
    setCommand(provider.default_command ?? '');
  }, [provider]);

  async function submit(): Promise<void> {
    if (!window.h2a || !provider) return;
    setBusy(true);
    setError('');
    try {
      const existing = new Set(identityState.bindings.map((binding) => binding.binding_id));
      const request: CreateAgentRequest = {
        name, role, provider: provider.id, model, workspace, capabilities,
        command: command.trim() || undefined,
        credential: credential.trim() || undefined,
        purpose,
        riskTier,
        connectorManifestId: `connector_${provider.id}_v1`,
        trustMode: provider.execution_mode === 'scripted-workplace' ? 'unverified' : 'connected-observed',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        attestationExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        sponsorAuthority
      };
      const next = await window.h2a.createAgent(request);
      const bindingId = next.bindings.find((binding) => !existing.has(binding.binding_id))?.binding_id ?? '';
      onCreated(next, bindingId);
      setName(''); setRole(''); setCredential('');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Agent onboarding failed.');
    } finally {
      setBusy(false);
    }
  }

  const valid = name.trim().length >= 2 && role.trim().length >= 2 && workspace.trim().length > 0 && capabilities.length > 0 && Boolean(model);

  return (
    <ModalDialog
      open={open}
      title={guided ? 'Connect agent' : 'Add agent'}
      description={guided ? 'Choose the owner and confirm the suggested access. H2A prepares the Passport and runtime together.' : 'Issue a durable identity and configure its replaceable runtime binding.'}
      onClose={onClose}
      footer={!sponsorAuthority ? undefined : <><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button data-control-id="command-floor.agent.create" className="primary-button" type="button" onClick={() => void submit()} disabled={!window.h2a || busy || !valid}><ShieldCheck size={16} />{busy ? 'Issuing passport' : 'Issue and attest'}</button></>}
    >
      {!sponsorAuthority ? (
        <div className="proof-gate-panel">
          <span className="proof-gate-icon"><KeyRound size={22} /></span>
          <div><h3>Sponsor authority required</h3><p>Verify an employee whose active credential permits Agent Passport issuance.</p></div>
          <button data-control-id="agent.proof.request" className="primary-button" type="button" onClick={onHumanProofRequired}>Open Human Proof</button>
        </div>
      ) : (
        <form className="agent-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="proof-gate-panel">
            <span className="proof-gate-icon"><KeyRound size={20} /></span>
            <div><h3>Sponsor proof active</h3><p>Refresh the exact-purpose Human Proof here when the current proof is expiring or the operator changes.</p></div>
            <button data-control-id="agent.proof.refresh" className="secondary-button" type="button" onClick={onHumanProofRequired}>Refresh Human Proof</button>
          </div>
          <div className="form-section-heading"><Bot size={17} /><div><strong>Agent identity</strong><span>Durable name, role, and capability boundary</span></div></div>
          <div className="form-grid">
            <Field label="Agent name"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus /></Field>
            <Field label="Role"><input value={role} onChange={(event) => setRole(event.target.value)} maxLength={120} placeholder="Security analyst" /></Field>
            <Field label="Risk tier"><select value={riskTier} onChange={(event) => setRiskTier(event.target.value as typeof riskTier)}><option value="standard">Standard</option><option value="sensitive">Sensitive</option><option value="restricted">Restricted</option><option value="critical">Critical</option></select></Field>
            {!guided && <Field label="Purpose"><input value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={1000} /></Field>}
          </div>
          {guided ? <details className="agent-advanced"><summary>Review Passport access</summary><fieldset className="capability-fieldset"><legend>Passport capabilities</legend><div className="capability-grid">{capabilityOptions.map(([id, label]) => <label key={id}><input type="checkbox" checked={capabilities.includes(id)} onChange={(event) => setCapabilities(event.target.checked ? [...capabilities, id] : capabilities.filter((item) => item !== id))} /><span>{label}</span></label>)}</div></fieldset><Field label="Purpose"><input value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={1000} /></Field></details> : <fieldset className="capability-fieldset"><legend>Passport capabilities</legend><div className="capability-grid">{capabilityOptions.map(([id, label]) => <label key={id}><input type="checkbox" checked={capabilities.includes(id)} onChange={(event) => setCapabilities(event.target.checked ? [...capabilities, id] : capabilities.filter((item) => item !== id))} /><span>{label}</span></label>)}</div></fieldset>}
          <div className="form-section-heading"><KeyRound size={17} /><div><strong>Runtime binding</strong><span>Provider configuration can change without replacing the passport</span></div></div>
          <div className="form-grid">
            <Field label="Provider"><select value={providerId} onChange={(event) => setProviderId(event.target.value as ProviderId)}>{identityState.providers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            <Field label="Model"><select value={model} onChange={(event) => setModel(event.target.value)}>{provider?.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            <Field label="Workspace"><input value={workspace} onChange={(event) => setWorkspace(event.target.value)} maxLength={500} /></Field>
            {provider?.execution_mode !== 'scripted-workplace' && <Field label="Runtime command"><input value={command} onChange={(event) => setCommand(event.target.value)} maxLength={500} placeholder="Agent CLI command" /></Field>}
          </div>
          {provider?.auth_mode !== 'none' && <Field label="Credential or subscription token (optional)"><input type="password" value={credential} onChange={(event) => setCredential(event.target.value)} maxLength={4000} autoComplete="new-password" /><small>{identityState.credentials.find((item) => item.provider === provider.id)?.credential_mask ? `Configured: ${identityState.credentials.find((item) => item.provider === provider.id)?.credential_mask}` : 'Stored with operating-system encryption in the trusted process.'}</small></Field>}
          <div className="provider-contract"><span className={`provider-availability availability-${provider?.availability}`}>{provider?.availability === 'active-demo' ? 'Active scripted runtime' : 'Definition only'}</span><p>{provider?.description}</p></div>
          {error && <div className="form-error" role="alert">{error}</div>}
        </form>
      )}
    </ModalDialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element { return <label className="form-field"><span>{label}</span>{children}</label>; }

export function resolveSponsorAuthority(state: OrganizationAuthorityState): NonNullable<CreateAgentRequest['sponsorAuthority']> | undefined {
  const now = Date.now();
  for (const assurance of state.assurance) {
    const membership = state.memberships.find((item) => item.membership_id === assurance.membership_id && item.status === 'active');
    if (!membership) continue;
    const credential = state.credentials.find((item) => item.membership_id === membership.membership_id && item.status === 'active' && new Date(item.expires_at).getTime() > now);
    if (!credential) continue;
    const authorized = credential.role_ids.some((roleId) => state.roles.find((role) => role.role_id === roleId && role.status === 'active')?.authority_scopes.some((scope) => (scope.resource === 'agent-passport' || scope.resource === '*') && (scope.actions.includes('issue') || scope.actions.includes('*'))));
    if (authorized) return { organizationId: membership.organization_id, membershipId: membership.membership_id, humanProofId: assurance.human_proof_id, authorityCredentialId: credential.credential_id };
  }
  return undefined;
}
