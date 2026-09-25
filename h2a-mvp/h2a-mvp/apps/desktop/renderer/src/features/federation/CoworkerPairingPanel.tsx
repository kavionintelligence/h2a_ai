import { Check, KeyRound, Link2, Plus, RefreshCw, Search, ShieldAlert, Unplug, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthorityActor, FederationCapability, FederationPairingState, OrganizationAuthorityState } from '@h2a/contracts';
import { ModalDialog, StatusBadge } from '@h2a/ui';

const capabilities: FederationCapability[] = ['task.receive', 'context.receive', 'message.receive', 'heartbeat', 'ack', 'revocation'];

interface Props {
  organization: OrganizationAuthorityState;
  compact?: boolean;
  onHumanProofRequired(): void;
  onConnected?(): void;
}

export function CoworkerPairingPanel({ organization, compact = false, onHumanProofRequired, onConnected }: Props): React.JSX.Element {
  const [state, setState] = useState<FederationPairingState>();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const actor = useMemo(() => resolveAdministrator(organization), [organization]);

  const refresh = useCallback(async (query = search): Promise<void> => {
    if (!window.h2a) return;
    try { setState(await window.h2a.getFederationPairingState({ search: query })); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Coworker discovery failed closed.'); }
  }, [search]);

  useEffect(() => { void refresh(''); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(search); }, 3_000);
    return () => window.clearInterval(timer);
  }, [refresh, search]);

  async function run(label: string, operation: (verified: AuthorityActor) => Promise<FederationPairingState>): Promise<void> {
    if (!actor) { onHumanProofRequired(); return; }
    setBusy(label); setError(''); setNotice('');
    try {
      const next = await operation(actor);
      setState(next);
      if (next.pairings.some((item) => item.pairing.status === 'active')) { setNotice('Coworker connected with signed key pins and bounded capabilities.'); onConnected?.(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Pairing operation failed closed.'); }
    finally { setBusy(''); }
  }

  const activeCount = state?.pairings.filter((item) => item.pairing.status === 'active').length ?? 0;
  const pendingCount = state?.pairings.filter((item) => !['active', 'offline', 'expired', 'cancelled', 'replacement-required'].includes(item.pairing.status)).length ?? 0;

  return <section className={`coworker-pairing ${compact ? 'coworker-pairing-compact' : ''}`} aria-labelledby={`coworker-title-${compact ? 'office' : 'control'}`}>
    <header>
      <div><p className="section-kicker">LIVE ORGANIZATION</p><h2 id={`coworker-title-${compact ? 'office' : 'control'}`}>Coworker connections</h2><p>Discover approved H2A roots, compare one short code, and retain the signed handshake in Control.</p></div>
      <button data-control-id="federation.pairing.open" type="button" className="primary-button" onClick={() => { setOpen(true); void refresh(''); }}><Plus size={16} /> Add coworker</button>
    </header>
    <div className="coworker-summary" aria-label="Coworker pairing summary"><span><Users size={15} /> {activeCount} connected</span><span>{pendingCount} pending</span><span>Global lookup disabled</span></div>
    {error && !open && <p className="inline-error" role="alert">{error}</p>}
    {!compact && <PairingList state={state} actor={actor} busy={busy} onProof={onHumanProofRequired} onRun={run} />}

    <ModalDialog open={open} title="Add coworker" description="Search this host or enter the coworker’s short connection code. Names are discovery hints only; trust requires both administrators and the same comparison code." onClose={() => setOpen(false)} footer={<button className="secondary-button" type="button" onClick={() => setOpen(false)}>Close</button>}>
      <div className="coworker-search-row"><Search size={17} aria-hidden="true" /><input aria-label="Search coworker node, employee, or connection code" value={search} onChange={(event) => { const value = event.target.value.toUpperCase(); setSearch(value); void refresh(value); }} placeholder="Node, employee, or 8-character code" /><button className="icon-button" type="button" title="Refresh discovered coworkers" aria-label="Refresh discovered coworkers" onClick={() => void refresh()}><RefreshCw size={16} /></button></div>
      {!actor && <button className="authority-alert authority-alert-button" type="button" onClick={onHumanProofRequired}><ShieldAlert size={17} /><span><strong>Administrator verification required</strong><small>The verification dialog names the required employee and returns here automatically.</small></span></button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="federation-notice" role="status"><Check size={15} /> {notice}</p>}
      <div className="coworker-discovery-list">
        {state?.discovery.nodes.map((node) => <article key={node.discovery_id} className="coworker-discovery-row"><div className="coworker-avatar" aria-hidden="true"><Users size={18} /></div><div><strong>{node.display_name}</strong><small>{node.search_names?.join(' · ') || node.node_id}</small><code>{node.connection_code}</code></div><StatusBadge label="unconfirmed" tone="approval" /><button data-control-id="federation.pairing.request" className="primary-button" type="button" disabled={busy !== ''} onClick={() => void run(`request-${node.discovery_id}`, (verified) => window.h2a!.createFederationPairing({ actor: verified, discovery_id: node.discovery_id, requested_capabilities: capabilities, maximum_context_fields: 3, idempotency_key: `pair_${node.node_id}` }))}>{actor ? <Link2 size={15} /> : <ShieldAlert size={15} />} {actor ? 'Connect' : 'Verify'}</button></article>)}
        {state && state.discovery.nodes.length === 0 && <div className="coworker-empty"><Unplug size={22} /><strong>No compatible local coworker found</strong><span>Keep the other H2A root open. Public internet and global username discovery are intentionally disabled.</span></div>}
      </div>
      <PairingList state={state} actor={actor} busy={busy} onProof={onHumanProofRequired} onRun={run} />
    </ModalDialog>
  </section>;
}

function PairingList({ state, actor, busy, onProof, onRun }: { state?: FederationPairingState; actor?: AuthorityActor; busy: string; onProof(): void; onRun(label: string, operation: (actor: AuthorityActor) => Promise<FederationPairingState>): Promise<void> }): React.JSX.Element {
  if (!state || state.pairings.length === 0) return <></>;
  return <div className="coworker-pairing-list" aria-label="Pairing requests">{state.pairings.map((item) => {
    const status = displayStatus(item.pairing.status);
    const requiresAccept = item.direction === 'incoming' && item.pairing.status === 'remote-proof-required';
    const requiresProofRenewal = item.pairing.status === 'local-proof-required' && Boolean(item.pairing.comparison_code);
    const requiresCompare = ['comparison-required', 'local-confirmed', 'remote-confirmed', 'activating'].includes(item.pairing.status) || requiresProofRenewal;
    const terminal = ['active', 'offline', 'expired', 'cancelled', 'replacement-required'].includes(item.pairing.status);
    return <article key={item.pairing.pairing_id} className={`coworker-pairing-row pairing-${item.pairing.status}`}>
      <div><strong>{item.remote_display_name}</strong><small>{item.direction === 'incoming' ? 'Incoming request' : 'Request sent'} · {status}</small><code title={item.remote_key_fingerprint}>{shortHash(item.remote_key_fingerprint)}</code></div>
      {requiresCompare && <div className="comparison-code"><span>COMPARE ON BOTH SCREENS</span><strong aria-label={`Comparison code ${item.pairing.comparison_code?.split('').join(' ')}`}>{item.pairing.comparison_code}</strong><small>{item.local_confirmed ? 'You confirmed' : 'Your confirmation required'} · {item.remote_confirmed ? 'Coworker confirmed' : 'Waiting for coworker'}</small></div>}
      <StatusBadge label={status} tone={tone(item.pairing.status)} />
      {requiresAccept && <button data-control-id="federation.pairing.accept" className="primary-button" type="button" disabled={busy !== ''} onClick={() => actor ? void onRun(`accept-${item.pairing.pairing_id}`, (verified) => window.h2a!.acceptFederationPairing({ actor: verified, pairing_id: item.pairing.pairing_id })) : onProof()}>{actor ? <Check size={15} /> : <ShieldAlert size={15} />} {actor ? 'Accept request' : 'Verify administrator'}</button>}
      {requiresCompare && !item.local_confirmed && <button data-control-id="federation.pairing.confirm" className="primary-button" type="button" disabled={busy !== '' || !item.pairing.comparison_code} onClick={() => actor && item.pairing.comparison_code ? void onRun(`confirm-${item.pairing.pairing_id}`, (verified) => window.h2a!.confirmFederationPairing({ actor: verified, pairing_id: item.pairing.pairing_id, comparison_code: item.pairing.comparison_code! })) : onProof()}>{actor ? <KeyRound size={15} /> : <ShieldAlert size={15} />} {actor ? 'Codes match' : 'Verify administrator'}</button>}
      {requiresProofRenewal && item.local_confirmed && <button data-control-id="federation.pairing.confirm" className="primary-button" type="button" disabled={busy !== '' || !item.pairing.comparison_code} onClick={() => actor && item.pairing.comparison_code ? void onRun(`renew-${item.pairing.pairing_id}`, (verified) => window.h2a!.confirmFederationPairing({ actor: verified, pairing_id: item.pairing.pairing_id, comparison_code: item.pairing.comparison_code! })) : onProof()}><ShieldAlert size={15} /> {actor ? 'Resume connection' : 'Renew administrator'}</button>}
      {!terminal && <button data-control-id="federation.pairing.cancel" className="icon-button danger-command" type="button" title="Cancel connection request" aria-label={`Cancel connection to ${item.remote_display_name}`} disabled={busy !== '' || !actor} onClick={() => actor && void onRun(`cancel-${item.pairing.pairing_id}`, (verified) => window.h2a!.cancelFederationPairing({ actor: verified, pairing_id: item.pairing.pairing_id }))}><X size={15} /></button>}
      {item.pairing.status === 'replacement-required' && <span className="replacement-required"><Unplug size={14} /> Start a new request; revoked trust cannot be reactivated.</span>}
    </article>;
  })}</div>;
}

function resolveAdministrator(state: OrganizationAuthorityState): AuthorityActor | undefined {
  const proof = state.assurance.find((item) => item.purpose === 'administer trusted federation peers' && new Date(item.expires_at).getTime() > Date.now());
  if (!proof) return undefined;
  const membership = state.memberships.find((item) => item.membership_id === proof.membership_id && item.status === 'active' && item.role_ids.includes('role_authority_admin'));
  const credential = state.credentials.find((item) => item.membership_id === membership?.membership_id && item.status === 'active' && new Date(item.expires_at).getTime() > Date.now());
  return membership && credential ? { membership_id: membership.membership_id, human_proof_id: proof.human_proof_id, authority_credential_id: credential.credential_id } : undefined;
}

function displayStatus(status: string): string { return ({ requested: 'request sent', 'local-proof-required': 'administrator verification required', 'remote-proof-required': 'waiting for remote proof', 'comparison-required': 'compare code', 'local-confirmed': 'waiting for coworker', 'remote-confirmed': 'confirm code', activating: 'connecting', active: 'connected', offline: 'offline', expired: 'expired', revoked: 'revoked', 'replacement-required': 'replacement required' } as Record<string, string>)[status] ?? status.replaceAll('-', ' '); }
function tone(status: string): 'verified' | 'approval' | 'danger' | 'neutral' { return status === 'active' ? 'verified' : ['expired', 'failed', 'cancelled', 'revoked', 'replacement-required'].includes(status) ? 'danger' : ['requested', 'remote-proof-required', 'comparison-required', 'local-confirmed', 'remote-confirmed', 'activating', 'offline'].includes(status) ? 'approval' : 'neutral'; }
function shortHash(value: string): string { return `${value.slice(0, 16)}...${value.slice(-8)}`; }
