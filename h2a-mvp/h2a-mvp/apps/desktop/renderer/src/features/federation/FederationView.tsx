import { useEffect, useMemo, useState } from 'react';
import { Activity, Check, Copy, KeyRound, Link2, Network, Play, Plus, Radio, RefreshCw, RotateCcw, Send, ShieldAlert, ShieldCheck, Square, Unplug } from 'lucide-react';
import type { AuthorityActor, CeremonyState, FederationCapability, FederationOperatorState, FederationState, OrganizationAuthorityState } from '@h2a/contracts';
import { ModalDialog, StatusBadge } from '@h2a/ui';
import { CoworkerPairingPanel } from './CoworkerPairingPanel';

type Tab = 'peers' | 'handshake' | 'traffic';
type Dialog = 'configure' | 'invite' | 'join' | 'review-registration' | 'activate-acceptance' | null;
const capabilities: FederationCapability[] = ['task.receive', 'context.receive', 'message.receive', 'heartbeat', 'ack', 'revocation'];

interface Props {
  state: FederationState;
  organization: OrganizationAuthorityState;
  ceremony: CeremonyState;
  onStateChange(state: FederationState): void;
  onOrganizationChange(state: OrganizationAuthorityState): void;
  onHumanProofRequired(): void;
}

export function FederationView({ state, organization, ceremony, onStateChange, onOrganizationChange, onHumanProofRequired }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('peers');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [operator, setOperator] = useState<FederationOperatorState>();
  const [peerId, setPeerId] = useState('');
  const [laneId, setLaneId] = useState<'gemini-antigravity' | 'framework' | 'openai-codex'>('gemini-antigravity');
  const actor = useMemo(() => resolveAdministrator(organization), [organization]);
  const recoverableAdministrator = useMemo(() => resolveRecoverableAdministrator(organization), [organization]);
  const activeCeremony = ceremony.sessions.find((item) => item.ceremony_id === ceremony.active_ceremony_id) ?? ceremony.sessions.at(-1);
  const selectablePeers = state.peers.filter((peer) => isExchangeablePeer(peer.status));
  const selectedPeer = state.peers.find((peer) => peer.peer_id === peerId);
  const selectedPeerExchangeable = Boolean(selectedPeer && isExchangeablePeer(selectedPeer.status));
  const activePeers = state.peers.filter((peer) => peer.status === 'active').length;
  const openInvites = state.invitations.filter((invite) => invite.status === 'open').length;

  useEffect(() => {
    if (!window.h2a) return;
    void Promise.all([window.h2a.getFederationOperatorState(), window.h2a.getFederationState(), window.h2a.getOrganizationAuthorityState()])
      .then(([nextOperator, nextFederation, nextOrganization]) => { setOperator(nextOperator); onStateChange(nextFederation); onOrganizationChange(nextOrganization); })
      .catch(() => undefined);
  }, []);
  useEffect(() => { if (!state.peers.some((peer) => peer.peer_id === peerId)) setPeerId(selectablePeers[0]?.peer_id ?? state.peers[0]?.peer_id ?? ''); }, [peerId, selectablePeers, state.peers]);

  async function run(label: string, operation: () => Promise<FederationState>): Promise<void> {
    setBusy(label); setError(''); setNotice('');
    try { onStateChange(await operation()); setDialog(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Federation operation failed closed.'); }
    finally { setBusy(''); }
  }

  async function copyDocument(value: unknown, label: string): Promise<void> {
    try { await window.h2a!.writeClipboardText(typeof value === 'string' ? value : JSON.stringify(value, null, 2)); setNotice(`${label} copied for the out-of-band handoff.`); }
    catch { setError('Clipboard access was denied.'); }
  }

  function correlation(operation: string): { ceremony_id: string; trace_id: string; idempotency_key: string } {
    if (!activeCeremony) throw new Error('Create the HP CTO/CISO ceremony before running Phase 29.');
    return { ceremony_id: activeCeremony.ceremony_id, trace_id: activeCeremony.trace_id, idempotency_key: `phase29_${operation}_${crypto.randomUUID()}` };
  }

  async function runOperator(label: string, operation: () => Promise<FederationOperatorState>): Promise<void> {
    setBusy(label); setError(''); setNotice('');
    try { setOperator(await operation()); onStateChange(await window.h2a!.getFederationState()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Phase 29 operation failed closed.'); }
    finally { setBusy(''); }
  }

  async function refreshOperator(): Promise<void> {
    setBusy('refresh-operator'); setError('');
    try { const [nextOperator, nextFederation, nextOrganization] = await Promise.all([window.h2a!.getFederationOperatorState(), window.h2a!.getFederationState(), window.h2a!.getOrganizationAuthorityState()]); setOperator(nextOperator); onStateChange(nextFederation); onOrganizationChange(nextOrganization); setNotice('Phase 29 state and administrator authority refreshed from durable repositories.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Phase 29 refresh failed.'); }
    finally { setBusy(''); }
  }

  async function recoverAdministrator(): Promise<void> {
    if (!recoverableAdministrator) return;
    setBusy('recover-administrator'); setError(''); setNotice('');
    try {
      const next = await window.h2a!.recoverAdministratorCredential({ organization_id: recoverableAdministrator.organizationId, membership_id: recoverableAdministrator.membershipId, human_proof_id: recoverableAdministrator.humanProofId, expires_at: new Date(Date.now() + 120 * 60 * 1000).toISOString(), ceremony: correlation('recover_administrator') });
      onOrganizationChange(next); setNotice('A signed, administrator-only credential was recovered for 120 minutes.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Administrator credential recovery failed closed.'); }
    finally { setBusy(''); }
  }

  async function renewContextGrant(): Promise<void> {
    if (!actor || !activeCeremony) return;
    setBusy('renew-context-grant'); setError(''); setNotice('');
    try {
      const renewed = await window.h2a!.renewLeastContextGrant({ actor, lane_id: laneId, ceremony: correlation(`renew_context_${laneId}`) });
      const grantId = renewed.lanes.find((lane) => lane.lane_id === laneId)?.context_grant_id;
      setNotice(`Signed ${laneId} Context Grant renewed for 120 minutes${grantId ? `: ${grantId}` : '.'}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Context Grant renewal failed closed.'); }
    finally { setBusy(''); }
  }

  return <div className="federation-page">
    <header className="federation-header">
      <div className="federation-title"><span><Network size={22} /></span><div><p className="section-kicker">SIGNED MULTI-NODE CONTROL PLANE</p><h2>{state.local_node?.display_name ?? 'Federation is not configured'}</h2><small>{state.local_node ? `${state.local_node.endpoint_policy} / ${state.local_node.organization_id}` : 'Create this machine identity before inviting a friend node.'}</small></div></div>
      <div className="federation-actions">
        <button className="secondary-button" type="button" onClick={() => setDialog('join')}><Link2 size={16} /> Join node</button>
        <button className="secondary-button" type="button" onClick={() => setDialog('configure')}><KeyRound size={16} /> {state.local_node ? 'Node settings' : 'Configure node'}</button>
        <button className="primary-button" type="button" disabled={!state.local_node} title={state.local_node ? 'Invite a trusted H2A node.' : 'Configure this local federation node before creating an invitation.'} aria-label={state.local_node ? 'Invite node' : 'Invite node unavailable. Configure this local federation node before creating an invitation.'} onClick={() => setDialog('invite')}><Plus size={16} /> Invite node</button>
      </div>
    </header>

    {!actor && recoverableAdministrator && <button data-control-id="federation.admin.recover" className="authority-alert authority-alert-button" type="button" disabled={busy !== ''} onClick={() => void recoverAdministrator()}><KeyRound size={18} /><span><strong>Renew administrator credential</strong><small>Issue a signed administrator-only credential from the fresh exact-purpose Human Proof. Valid for 120 minutes.</small></span></button>}
    {!actor && !recoverableAdministrator && <button data-control-id="federation.proof.request" className="authority-alert authority-alert-button" type="button" onClick={onHumanProofRequired}><ShieldAlert size={18} /><span><strong>Verified federation administrator required</strong><small>Verify the Administrator / Approver for “administer trusted federation peers.”</small></span></button>}
    {error && <div className="inline-error federation-feedback" role="alert">{error}</div>}
    {notice && <div className="federation-notice" role="status"><Check size={15} />{notice}</div>}

    <CoworkerPairingPanel organization={organization} onHumanProofRequired={onHumanProofRequired} onConnected={() => void refreshOperator()} />

    <section className="phase29-console" aria-labelledby="phase29-title">
      <header><div><p className="section-kicker">PHASE 29 / LOCAL TWO-NODE FEDERATION</p><h3 id="phase29-title">Signed bounded exchange</h3><p>Two independent H2A data roots exchange a least-context task, acknowledgement, heartbeat, and denial proofs over the real loopback transport.</p></div><button data-control-id="federation.operator.refresh" className="icon-button" type="button" title="Refresh Phase 29 state" aria-label="Refresh Phase 29 state" disabled={busy !== ''} onClick={() => void refreshOperator()}><RefreshCw size={17} /></button></header>
      <div className="phase29-facts"><Fact label="Ceremony" value={activeCeremony?.ceremony_id ?? 'Not created'} /><Fact label="Shared trace" value={activeCeremony?.trace_id ?? 'Not created'} /><Fact label="Listener" value={operator?.listener.status ?? 'Loading'} tone={operator?.listener.status === 'running' ? 'good' : 'neutral'} /><Fact label="Trust" value="Connected-observed ceiling" /></div>
      <div className="phase29-controls">
        <label><span>Peer</span><select value={peerId} onChange={(event) => setPeerId(event.target.value)}><option value="">No trusted peer</option>{state.peers.map((peer) => <option key={peer.peer_id} value={peer.peer_id}>{peer.remote_node.display_name} · {peer.status}</option>)}</select></label>
        <label><span>Context lane</span><select value={laneId} onChange={(event) => setLaneId(event.target.value as typeof laneId)}><option value="gemini-antigravity">Antigravity masked</option><option value="framework">Framework summarized</option><option value="openai-codex">Codex reference-only</option></select></label>
        <div className="phase29-command-row">
          {operator?.listener.status === 'running' ? <button data-control-id="federation.listener.stop" className="secondary-button" type="button" disabled={!actor || busy !== ''} title={actor ? 'Stop the local envelope listener.' : 'Fresh administrator Human Proof required.'} onClick={() => actor && void runOperator('stop-listener', () => window.h2a!.stopFederationListener({ actor, ceremony: correlation('stop_listener') }))}><Square size={15} /> Stop listener</button> : <button data-control-id="federation.listener.start" className="secondary-button" type="button" disabled={!actor || !state.local_node || busy !== ''} title={!actor ? 'Fresh administrator Human Proof required.' : !state.local_node ? 'Configure this node first.' : 'Start the real loopback envelope listener.'} onClick={() => actor && void runOperator('start-listener', () => window.h2a!.startFederationListener({ actor, ceremony: correlation('start_listener') }))}><Play size={15} /> Start listener</button>}
          <button data-control-id="federation.envelope.exchange" className="primary-button" type="button" disabled={!actor || !selectedPeerExchangeable || !activeCeremony || busy !== ''} title={!selectedPeerExchangeable ? 'Activate a trusted peer first.' : selectedPeer?.status === 'offline' ? 'Retry the signed task transport and restore the peer after a verified response.' : 'Send the selected Phase 27 least-context projection.'} onClick={() => actor && void runOperator('send-task', () => window.h2a!.sendFederationTask({ actor, peer_id: peerId, lane_id: laneId, ceremony: correlation('task') }))}><Send size={15} /> Send task</button>
          <button data-control-id="federation.ack.send" className="secondary-button" type="button" disabled={!actor || !selectedPeerExchangeable || !operator?.last_received_task || busy !== ''} title={operator?.last_received_task ? 'Send an explicit signed completion acknowledgement.' : 'Receive a federated task first.'} onClick={() => actor && void runOperator('send-ack', () => window.h2a!.sendFederationAcknowledgement({ actor, peer_id: peerId, ceremony: correlation('ack') }))}><Check size={15} /> Acknowledge</button>
          <button data-control-id="federation.heartbeat.send" className="secondary-button" type="button" disabled={!actor || !selectedPeerExchangeable || busy !== ''} title={selectedPeer?.status === 'offline' ? 'Probe the trusted transport with a signed heartbeat and restore active status after a verified acknowledgement.' : 'Send a signed heartbeat through the active peer transport.'} onClick={() => actor && void runOperator('heartbeat', () => window.h2a!.sendFederationHeartbeat({ actor, peer_id: peerId, ceremony: correlation('heartbeat') }))}><Activity size={15} /> {selectedPeer?.status === 'offline' ? 'Recover peer' : 'Heartbeat'}</button>
          <button data-control-id="federation.context.renew" className="secondary-button" type="button" disabled={!actor || !activeCeremony || busy !== ''} title="Issue a signed 120-minute replacement for the selected lane's inactive Context Grant without reopening the sealed artifact." onClick={() => void renewContextGrant()}><KeyRound size={15} /> Renew context grant</button>
        </div>
      </div>
      <div className="phase29-evidence"><EvidenceLine label="Last outbound" value={operator?.last_outbound ? `${operator.last_outbound.status} · ${shortHash(operator.last_outbound.payload_hash)}` : 'No envelope sent'} /><EvidenceLine label="Last received" value={operator?.last_received_task ? `${operator.last_received_task.task_id} · ${shortHash(operator.last_received_task.payload_hash)}` : 'No task received'} /><EvidenceLine label="Replay proof" value={operator?.replay_proof?.blocked ? `Blocked · ${operator.replay_proof.reason_code}` : 'Not run'} /><EvidenceLine label="Revocation proof" value={operator?.revocation_proof?.blocked ? `Blocked · ${operator.revocation_proof.reason_code}` : 'Not run'} /><div className="phase29-proof-actions"><button data-control-id="federation.replay.prove" className="secondary-button" type="button" disabled={!actor || !operator?.last_outbound || busy !== ''} title="Resend the exact in-memory signed envelope. This is available only before restart." onClick={() => actor && void runOperator('replay', () => window.h2a!.proveFederationReplay({ actor, ceremony: correlation('replay') }))}><RotateCcw size={15} /> Prove replay denial</button><button data-control-id="federation.revocation.prove" className="danger-button" type="button" disabled={!actor || selectedPeer?.status !== 'revoked' || busy !== ''} title="Revoke the selected peer in the registry first, then prove outbound signing is blocked." onClick={() => actor && void runOperator('revocation', () => window.h2a!.proveFederationRevocation({ actor, peer_id: peerId, ceremony: correlation('revocation') }))}><Unplug size={15} /> Prove revoked peer</button></div></div>
    </section>

    <section className="federation-metrics" aria-label="Federation metrics">
      <Metric label="Trusted peers" value={activePeers} tone="green" />
      <Metric label="Open invitations" value={openInvites} tone="blue" />
      <Metric label="Accepted envelopes" value={state.receipts.filter((item) => item.decision === 'accepted').length} tone="neutral" />
      <Metric label="Remote listener" value={state.remote_listener_enabled ? 'Enabled' : 'Off'} tone={state.remote_listener_enabled ? 'amber' : 'neutral'} />
    </section>

    {state.local_node && <section className="node-identity-strip">
      <div><span>NODE ID</span><code>{state.local_node.node_id}</code></div>
      <div><span>PINNED PUBLIC KEY</span><div className="node-key-copy"><code>{shortHash(state.local_node.key_fingerprint)}</code><button className="icon-button" type="button" title="Copy full node key fingerprint" aria-label="Copy full node key fingerprint" onClick={() => void copyDocument(state.local_node!.key_fingerprint, 'Full node key fingerprint')}><Copy size={14} /></button></div></div>
      <div><span>ENDPOINT</span><code>{state.local_node.endpoint}</code></div>
      <StatusBadge label={state.local_node.status} tone={statusTone(state.local_node.status)} />
    </section>}

    <div className="authority-tabs federation-tabs" role="tablist" aria-label="Federation views">
      <button type="button" role="tab" aria-selected={tab === 'peers'} className={tab === 'peers' ? 'active' : ''} onClick={() => setTab('peers')}><Radio size={16} />Peers</button>
      <button type="button" role="tab" aria-selected={tab === 'handshake'} className={tab === 'handshake' ? 'active' : ''} onClick={() => setTab('handshake')}><ShieldCheck size={16} />Handshake</button>
      <button type="button" role="tab" aria-selected={tab === 'traffic'} className={tab === 'traffic' ? 'active' : ''} onClick={() => setTab('traffic')}><Activity size={16} />Traffic</button>
    </div>

    {tab === 'peers' && <section className="federation-workbench">
      <header><div><h3>Trusted node registry</h3><p>Only pinned node identities can exchange signed H2A envelopes.</p></div></header>
      {state.peers.length === 0 ? <Empty icon={<Unplug size={22} />} title="No trusted peers" detail="Create an invitation or join a separately running H2A node." /> : <div className="peer-list">{state.peers.map((peer) => <article className="peer-row" key={peer.peer_id}>
        <span className={`peer-signal peer-signal-${peer.status}`} aria-hidden="true" />
        <div><strong>{peer.remote_node.display_name}</strong><small>{peer.remote_node.organization_id} / {peer.remote_node.node_id}</small></div>
        <div><span>KEY PIN</span><code>{shortHash(peer.pinned_key_fingerprint)}</code></div>
        <div><span>CONTEXT LIMIT</span><strong>{peer.maximum_context_fields} fields</strong></div>
        <StatusBadge label={peer.status} tone={statusTone(peer.status)} />
        <button data-control-id="federation.peer.revoke" className="icon-button danger-command" type="button" disabled={!actor || peer.status === 'revoked' || busy !== ''} title="Revoke peer" aria-label={`Revoke ${peer.remote_node.display_name}`} onClick={() => actor && void run(`revoke-${peer.peer_id}`, () => window.h2a!.revokeFederationPeer({ actor, peer_id: peer.peer_id, reason_code: 'OPERATOR_REVOKED' }))}><Unplug size={16} /></button>
      </article>)}</div>}
    </section>}

    {tab === 'handshake' && <section className="federation-handshake-grid">
      <HandshakeColumn title="Invitations" count={state.invitations.length}>{state.invitations.map((item) => <DocumentRow key={item.invitation_id} title={item.invited_organization_id ?? 'Any organization'} id={item.invitation_id} status={item.status} onCopy={() => void copyDocument(item, 'Invitation')} />)}</HandshakeColumn>
      <HandshakeColumn title="Registrations" count={state.registrations.length} action={<button className="small-command" type="button" onClick={() => setDialog('review-registration')}>Review registration</button>}>{state.registrations.map((item) => <DocumentRow key={item.registration_id} title={item.joining_node.display_name} id={item.registration_id} status="pending" onCopy={() => void copyDocument(item, 'Registration')} />)}</HandshakeColumn>
      <HandshakeColumn title="Acceptances" count={state.acceptances.length} action={<button className="small-command" type="button" onClick={() => setDialog('activate-acceptance')}>Activate acceptance</button>}>{state.acceptances.map((item) => <DocumentRow key={item.acceptance_id} title={item.host_node.display_name} id={item.acceptance_id} status={state.peers.some((peer) => peer.peer_id === item.peer_id) ? 'active' : 'ready'} onCopy={() => void copyDocument(item, 'Acceptance')} />)}</HandshakeColumn>
    </section>}

    {tab === 'traffic' && <section className="federation-workbench">
      <header><div><h3>Minimized envelope receipts</h3><p>Hashes and routing decisions are retained; task context and credentials are not.</p></div></header>
      {state.receipts.length === 0 ? <Empty icon={<Activity size={22} />} title="No federation traffic" detail="Accepted and rejected signed envelopes will appear here." /> : <div className="receipt-table"><div className="receipt-head"><span>TIME</span><span>TYPE</span><span>TRACE</span><span>SEQUENCE</span><span>DECISION</span></div>{state.receipts.map((receipt) => <div className="receipt-row" key={receipt.receipt_id}><time>{new Date(receipt.received_at).toLocaleString()}</time><strong>{receipt.payload_type}</strong><code>{receipt.trace_id}</code><span>#{receipt.sequence}</span><StatusBadge label={receipt.decision} tone={statusTone(receipt.decision)} /></div>)}</div>}
    </section>}

    <ConfigureDialog open={dialog === 'configure'} state={state} organization={organization} actor={actor} busy={busy} onClose={() => setDialog(null)} onProof={onHumanProofRequired} onSubmit={(request) => run('configure', () => window.h2a!.configureFederationNode(request))} />
    <InviteDialog open={dialog === 'invite'} actor={actor} busy={busy} error={error} onClose={() => setDialog(null)} onProof={onHumanProofRequired} onSubmit={(request) => run('invite', () => window.h2a!.createFederationInvitation(request))} />
    <JoinDialog open={dialog === 'join'} actor={actor} busy={busy} error={error} onClose={() => setDialog(null)} onProof={onHumanProofRequired} onSubmit={(request) => run('join', () => window.h2a!.acceptFederationInvitation(request))} />
    <ReviewRegistrationDialog open={dialog === 'review-registration'} actor={actor} busy={busy} error={error} onClose={() => setDialog(null)} onProof={onHumanProofRequired} onSubmit={(request) => run('approve-registration', () => window.h2a!.approveFederationRegistration(request))} />
    <ActivateAcceptanceDialog open={dialog === 'activate-acceptance'} actor={actor} busy={busy} error={error} onClose={() => setDialog(null)} onProof={onHumanProofRequired} onSubmit={(request) => run('activate-acceptance', () => window.h2a!.activateFederationAcceptance(request))} />
  </div>;
}

function ConfigureDialog({ open, state, organization, actor, busy, onClose, onProof, onSubmit }: { open: boolean; state: FederationState; organization: OrganizationAuthorityState; actor?: AuthorityActor; busy: string; onClose(): void; onProof(): void; onSubmit(request: Parameters<NonNullable<typeof window.h2a>['configureFederationNode']>[0]): void }): React.JSX.Element {
  const org = organization.organizations.find((item) => item.status === 'active');
  const [name, setName] = useState(state.local_node?.display_name ?? 'H2A Local Node');
  const [endpoint, setEndpoint] = useState(state.local_node?.endpoint ?? 'http://127.0.0.1:43120/h2a/federation/v2/envelopes');
  const [remote, setRemote] = useState(state.remote_listener_enabled);
  const [tlsPin, setTlsPin] = useState(state.local_node?.tls_certificate_fingerprint ?? '');
  return <ModalDialog open={open} title="Configure federation node" description="Create an independently keyed identity for this H2A installation." onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button>{actor ? <button data-control-id="federation.node.configure" className="primary-button" disabled={!org || busy !== ''} onClick={() => org && onSubmit({ actor, organization_id: org.organization_id, display_name: name, endpoint, remote_listener_enabled: remote, ...(tlsPin ? { tls_certificate_fingerprint: tlsPin } : {}) })}><KeyRound size={16} /> Save node</button> : <button className="primary-button" onClick={onProof}><ShieldAlert size={16} /> Verify administrator</button>}</>}>
    <label className="field"><span>Node display name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label className="field"><span>Envelope endpoint</span><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></label>
    <label className="check-row"><input type="checkbox" checked={remote} onChange={(event) => setRemote(event.target.checked)} /><span><strong>Enable secure remote listener</strong><small>Requires HTTPS and a pinned TLS certificate. Loopback remains the default.</small></span></label>
    {remote && <label className="field"><span>TLS certificate SHA-256 pin</span><input value={tlsPin} onChange={(event) => setTlsPin(event.target.value)} placeholder="sha256:..." /></label>}
  </ModalDialog>;
}

function InviteDialog({ open, actor, busy, error, onClose, onProof, onSubmit }: { open: boolean; actor?: AuthorityActor; busy: string; error: string; onClose(): void; onProof(): void; onSubmit(request: Parameters<NonNullable<typeof window.h2a>['createFederationInvitation']>[0]): void }): React.JSX.Element {
  const [organizationId, setOrganizationId] = useState('org_friend'); const [fields, setFields] = useState(3); const [selected, setSelected] = useState<FederationCapability[]>(['task.receive', 'context.receive', 'heartbeat', 'ack', 'revocation']);
  return <ModalDialog open={open} title="Invite a friend node" description="Issue a short-lived, signed, one-use trust document." onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button><button data-control-id="federation.invitation.create" className="primary-button" disabled={busy !== '' || Boolean(actor && selected.length === 0)} onClick={() => actor ? onSubmit({ actor, ...(organizationId ? { invited_organization_id: organizationId } : {}), allowed_capabilities: selected, maximum_context_fields: fields, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }) : onProof()}>{actor ? <Plus size={16} /> : <ShieldAlert size={16} />} {actor ? 'Create invitation' : 'Verify administrator'}</button></>}>
    <label className="field"><span>Invited organization</span><input value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} /></label>
    <label className="field"><span>Maximum context fields</span><input type="number" min={1} max={200} value={fields} onChange={(event) => setFields(Number(event.target.value))} /></label>
    <CapabilityPicker selected={selected} onChange={setSelected} />
    {error && <p className="form-error" role="alert">{error}</p>}
  </ModalDialog>;
}

function JoinDialog({ open, actor, busy, error, onClose, onProof, onSubmit }: { open: boolean; actor?: AuthorityActor; busy: string; error: string; onClose(): void; onProof(): void; onSubmit(request: Parameters<NonNullable<typeof window.h2a>['acceptFederationInvitation']>[0]): void }): React.JSX.Element {
  const [document, setDocument] = useState(''); const [pin, setPin] = useState(''); const [selected, setSelected] = useState<FederationCapability[]>(['task.receive', 'context.receive', 'heartbeat', 'ack', 'revocation']); const [parseError, setParseError] = useState('');
  function submit(): void { try { setParseError(''); if (!actor) throw new Error('Verified administrator required.'); onSubmit({ actor, invitation: JSON.parse(document), expected_inviter_key_fingerprint: pin, requested_capabilities: selected }); } catch (cause) { setParseError(cause instanceof Error ? cause.message : 'Invitation JSON is invalid.'); } }
  return <ModalDialog open={open} title="Join an H2A node" description="Paste the invitation and independently confirm the inviter key fingerprint." onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button><button data-control-id="federation.registration.create" className="primary-button" disabled={busy !== '' || Boolean(actor && (!document || !pin))} onClick={() => actor ? submit() : onProof()}>{actor ? <Link2 size={16} /> : <ShieldAlert size={16} />} {actor ? 'Create registration' : 'Verify administrator'}</button></>}>
    <label className="field"><span>Signed invitation JSON</span><textarea rows={7} value={document} onChange={(event) => setDocument(event.target.value)} /></label>
    <label className="field"><span>Expected inviter key fingerprint</span><input value={pin} onChange={(event) => setPin(event.target.value)} placeholder="Confirm over a separate channel" /></label>
    <CapabilityPicker selected={selected} onChange={setSelected} />
    {(parseError || error) && <p className="form-error" role="alert">{parseError || error}</p>}
  </ModalDialog>;
}

function ReviewRegistrationDialog({ open, actor, busy, error, onClose, onProof, onSubmit }: { open: boolean; actor?: AuthorityActor; busy: string; error: string; onClose(): void; onProof(): void; onSubmit(request: Parameters<NonNullable<typeof window.h2a>['approveFederationRegistration']>[0]): void }): React.JSX.Element {
  const [document, setDocument] = useState(''); const [parseError, setParseError] = useState('');
  function submit(): void { try { setParseError(''); if (!actor) throw new Error('Verified administrator required.'); onSubmit({ actor, registration: JSON.parse(document) }); } catch (cause) { setParseError(cause instanceof Error ? cause.message : 'Registration JSON is invalid.'); } }
  return <ModalDialog open={open} title="Review friend-node registration" description="Paste the signed registration returned by the invited node after independently comparing its key fingerprint." onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button><button data-control-id="federation.registration.approve" className="primary-button" disabled={busy !== '' || Boolean(actor && !document)} onClick={() => actor ? submit() : onProof()}>{actor ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />} {actor ? 'Approve registration' : 'Verify administrator'}</button></>}><label className="field"><span>Signed registration JSON</span><textarea rows={9} value={document} onChange={(event) => setDocument(event.target.value)} /></label>{(parseError || error) && <p className="form-error" role="alert">{parseError || error}</p>}</ModalDialog>;
}

function ActivateAcceptanceDialog({ open, actor, busy, error, onClose, onProof, onSubmit }: { open: boolean; actor?: AuthorityActor; busy: string; error: string; onClose(): void; onProof(): void; onSubmit(request: Parameters<NonNullable<typeof window.h2a>['activateFederationAcceptance']>[0]): void }): React.JSX.Element {
  const [document, setDocument] = useState(''); const [parseError, setParseError] = useState('');
  function submit(): void { try { setParseError(''); if (!actor) throw new Error('Verified administrator required.'); onSubmit({ actor, acceptance: JSON.parse(document) }); } catch (cause) { setParseError(cause instanceof Error ? cause.message : 'Acceptance JSON is invalid.'); } }
  return <ModalDialog open={open} title="Activate federation acceptance" description="Paste the host-signed acceptance and activate only after its node and key pins match the out-of-band comparison." onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button><button data-control-id="federation.acceptance.activate" className="primary-button" disabled={busy !== '' || Boolean(actor && !document)} onClick={() => actor ? submit() : onProof()}>{actor ? <Link2 size={16} /> : <ShieldAlert size={16} />} {actor ? 'Activate peer' : 'Verify administrator'}</button></>}><label className="field"><span>Signed acceptance JSON</span><textarea rows={9} value={document} onChange={(event) => setDocument(event.target.value)} /></label>{(parseError || error) && <p className="form-error" role="alert">{parseError || error}</p>}</ModalDialog>;
}

function CapabilityPicker({ selected, onChange }: { selected: FederationCapability[]; onChange(value: FederationCapability[]): void }): React.JSX.Element { return <fieldset className="federation-capabilities"><legend>Granted capabilities</legend>{capabilities.map((capability) => <label key={capability}><input type="checkbox" checked={selected.includes(capability)} onChange={() => onChange(selected.includes(capability) ? selected.filter((item) => item !== capability) : [...selected, capability])} /><span>{capability}</span></label>)}</fieldset>; }
function HandshakeColumn({ title, count, children, action }: { title: string; count: number; children: React.ReactNode; action?: React.ReactNode }): React.JSX.Element { return <section className="handshake-column"><header><h3>{title}</h3><div>{action}<span>{count}</span></div></header><div>{count ? children : <p className="column-empty">No documents</p>}</div></section>; }
function DocumentRow({ title, id, status, onCopy, action }: { title: string; id: string; status: string; onCopy(): void; action?: React.ReactNode }): React.JSX.Element { return <article className="document-row"><div><strong>{title}</strong><code>{id}</code></div><StatusBadge label={status} tone={statusTone(status)} /><button className="icon-button" type="button" title="Copy signed document" aria-label={`Copy ${id}`} onClick={onCopy}><Copy size={15} /></button>{action}</article>; }
function Metric({ label, value, tone }: { label: string; value: number | string; tone: string }): React.JSX.Element { return <div className={`federation-metric metric-${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
function Fact({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' }): React.JSX.Element { return <div className={`phase29-fact phase29-fact-${tone}`}><span>{label}</span><strong title={value}>{value}</strong></div>; }
function EvidenceLine({ label, value }: { label: string; value: string }): React.JSX.Element { return <div className="phase29-evidence-line"><span>{label}</span><strong>{value}</strong></div>; }
function Empty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }): React.JSX.Element { return <div className="federation-empty"><span>{icon}</span><h3>{title}</h3><p>{detail}</p></div>; }
function shortHash(value: string): string { return `${value.slice(0, 19)}...${value.slice(-10)}`; }
function statusTone(status: string): 'verified' | 'approval' | 'danger' | 'neutral' { return ['active', 'accepted', 'ready'].includes(status) ? 'verified' : ['pending', 'open', 'offline'].includes(status) ? 'approval' : ['revoked', 'expired', 'rejected'].includes(status) ? 'danger' : 'neutral'; }
function isExchangeablePeer(status: string): boolean { return status === 'active' || status === 'offline'; }
function resolveAdministrator(state: OrganizationAuthorityState): AuthorityActor | undefined { const proof = state.assurance.find((item) => item.purpose === 'administer trusted federation peers' && new Date(item.expires_at).getTime() > Date.now()); if (!proof) return undefined; const membership = state.memberships.find((item) => item.membership_id === proof.membership_id && item.status === 'active' && item.role_ids.includes('role_authority_admin')); const credential = state.credentials.find((item) => item.membership_id === membership?.membership_id && item.status === 'active' && new Date(item.expires_at).getTime() > Date.now()); return membership && credential ? { membership_id: membership.membership_id, human_proof_id: proof.human_proof_id, authority_credential_id: credential.credential_id } : undefined; }
function resolveRecoverableAdministrator(state: OrganizationAuthorityState): { organizationId: string; membershipId: string; humanProofId: string } | undefined { const proof = state.assurance.find((item) => item.purpose === 'administer trusted federation peers' && new Date(item.expires_at).getTime() > Date.now()); if (!proof) return undefined; const membership = state.memberships.find((item) => item.membership_id === proof.membership_id && item.status === 'active' && item.role_ids.includes('role_authority_admin')); if (!membership) return undefined; const activeCredential = state.credentials.some((item) => item.membership_id === membership.membership_id && item.status === 'active' && new Date(item.expires_at).getTime() > Date.now()); return activeCredential ? undefined : { organizationId: membership.organization_id, membershipId: membership.membership_id, humanProofId: proof.human_proof_id }; }
