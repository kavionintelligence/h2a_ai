import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  acceptFederationPairingRequestSchema,
  authorityActorSchema,
  cancelFederationPairingRequestSchema,
  confirmFederationPairingRequestSchema,
  createFederationPairingRequestSchema,
  discoveredNodeSchema,
  federationAcceptanceSchema,
  federationInvitationSchema,
  federationPairingSchema,
  federationPairingStateSchema,
  federationPairingViewSchema,
  federationRegistrationSchema,
  nodeDiscoverySnapshotSchema,
  signedNodePresenceSchema,
  type AcceptFederationPairingRequest,
  type AuthorityEventType,
  type CancelFederationPairingRequest,
  type ConfirmFederationPairingRequest,
  type CreateFederationPairingRequest,
  type FederationPairingState,
  type FederationPairingView,
  type FederationState,
  type DiscoveredAgentAdvertisement,
  type SignedNodePresence
} from '@h2a/contracts';
import { hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';
import type { FederationService } from './federationService';
import {
  SameHostNodeDiscoveryPort,
  SecureLanNodeDiscoveryPort,
  newTransportMessageId,
  type NodeDiscoveryPort,
  type PairingTransportRecord,
  type PairingTransportUnsigned
} from './nodeDiscovery';

const internalPairingSchema = z.object({
  pairing: federationPairingSchema,
  direction: z.enum(['outgoing', 'incoming']),
  remote_display_name: z.string().min(1).max(120),
  remote_key_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  connection_code: z.string().regex(/^[A-Z0-9]{8}$/u),
  local_nonce: z.string().min(16).max(240),
  remote_nonce: z.string().min(16).max(240).nullable(),
  invitation: federationInvitationSchema.nullable(),
  registration: federationRegistrationSchema.nullable(),
  acceptance: federationAcceptanceSchema.nullable(),
  actor: authorityActorSchema.nullable(),
  processed_message_ids: z.array(z.string().min(1).max(240)).max(500)
}).strict();
type InternalPairing = z.infer<typeof internalPairingSchema>;

export interface FederationPairingCoordinatorPorts {
  federation: FederationService;
  aliases?(): Promise<string[]>;
  agentCatalogue?(): Promise<DiscoveredAgentAdvertisement[]>;
}

export class FederationPairingCoordinator {
  private readonly repository: VersionedJsonRepository<'h2a.v1.federation-simple-pairings', InternalPairing[]>;
  private readonly transports: NodeDiscoveryPort[];
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly ports: FederationPairingCoordinatorPorts,
    transports?: NodeDiscoveryPort[],
    private readonly clock: () => Date = () => new Date()
  ) {
    this.repository = new VersionedJsonRepository(new AtomicFileStore(dataPath), 'federation/simple-pairings-v1.json', 'h2a.v1.federation-simple-pairings', z.array(internalPairingSchema).max(200), { initialData: [], clock });
    this.transports = transports ?? [new SameHostNodeDiscoveryPort(), new SecureLanNodeDiscoveryPort()];
  }

  public async initialize(): Promise<FederationPairingState> {
    await this.repository.read();
    return this.getState();
  }

  public getState(search = ''): Promise<FederationPairingState> {
    return this.serialize(async () => {
      const federation = await this.ports.federation.getState();
      await this.publishPresence(federation);
      await this.reconcileMessages(federation);
      const refreshedFederation = await this.ports.federation.getState();
      await this.reconcileLifecycle(refreshedFederation);
      return this.stateUnlocked(refreshedFederation, search);
    });
  }

  public createRequest(request: CreateFederationPairingRequest): Promise<FederationPairingState> {
    return this.serialize(async () => {
      const input = createFederationPairingRequestSchema.parse(request);
      const federation = await this.ports.federation.getState();
      const local = required(federation.local_node, 'Configure this federation node before adding a coworker.');
      await this.publishPresence(federation);
      const presence = (await this.listPresences()).find((item) => item.discovery_id === input.discovery_id && item.node.node_id !== local.node_id);
      if (!presence) throw new Error('DISCOVERED_NODE_NOT_AVAILABLE');
      if (presence.node.organization_id !== local.organization_id) throw new Error('FEDERATION_ORGANIZATION_MISMATCH');
      if (input.requested_capabilities.some((capability) => !presence.node.capabilities.includes(capability))) throw new Error('FEDERATION_CAPABILITY_ESCALATION');
      if (input.maximum_context_fields > 3) throw new Error('FEDERATION_CONTEXT_LIMIT_ESCALATION');
      const existing = (await this.repository.read()).find((item) => item.direction === 'outgoing' && item.pairing.discovery_id === input.discovery_id && !terminal(item.pairing.status));
      if (existing) return this.stateUnlocked(federation, '');
      const before = await this.ports.federation.getState();
      const nextState = await this.ports.federation.createInvitation({
        actor: input.actor,
        invited_organization_id: presence.node.organization_id,
        allowed_capabilities: input.requested_capabilities,
        maximum_context_fields: input.maximum_context_fields,
        expires_at: new Date(this.clock().getTime() + 10 * 60_000).toISOString(),
        ...(input.ceremony ? { ceremony: input.ceremony } : {})
      });
      const invitation = nextState.invitations.find((item) => !before.invitations.some((old) => old.invitation_id === item.invitation_id)) ?? nextState.invitations[0];
      if (!invitation) throw new Error('FEDERATION_INVITATION_NOT_CREATED');
      const now = this.clock().toISOString();
      const localNonce = `pair_nonce_${randomBytes(24).toString('hex')}`;
      const pairingId = `pairing_${randomUUID()}`;
      const pairing = federationPairingSchema.parse({
        schema_version: 1, pairing_id: pairingId, discovery_id: presence.discovery_id,
        local_node_id: local.node_id, remote_node_id: presence.node.node_id,
        local_organization_id: local.organization_id, remote_organization_id: presence.node.organization_id,
        requested_capabilities: input.requested_capabilities, maximum_context_fields: input.maximum_context_fields,
        status: 'requested', local_proof_id: input.actor.human_proof_id, remote_proof_id: null,
        comparison_code: null, transcript_hash: hashCanonical({ pairing_id: pairingId, invitation_hash: invitation.canonical_hash }),
        local_confirmed_at: null, remote_confirmed_at: null, invitation_id: invitation.invitation_id,
        registration_id: null, acceptance_id: null, local_peer_id: null, remote_peer_id: null,
        reason_code: null, evidence_refs: [], expires_at: invitation.expires_at, updated_at: now, trust_ceiling: 'connected-observed'
      });
      const record = internalPairingSchema.parse({ pairing, direction: 'outgoing', remote_display_name: presence.node.display_name, remote_key_fingerprint: presence.node.key_fingerprint, connection_code: presence.connection_code, local_nonce: localNonce, remote_nonce: null, invitation, registration: null, acceptance: null, actor: input.actor, processed_message_ids: [] });
      await this.repository.write([record, ...(await this.repository.read())].slice(0, 200));
      await this.sendSigned(local, presence.node.node_id, pairingId, 'pairing-request', { invitation, initiator_nonce: localNonce, connection_code: presence.connection_code });
      await this.record(input.actor.membership_id, pairingId, input.ceremony?.trace_id, 'FEDERATION_PAIRING_REQUESTED', { remote_node_id: presence.node.node_id, invitation_id: invitation.invitation_id, requested_capabilities: input.requested_capabilities, maximum_context_fields: input.maximum_context_fields });
      return this.stateUnlocked(nextState, '');
    });
  }

  public acceptRequest(request: AcceptFederationPairingRequest): Promise<FederationPairingState> {
    return this.serialize(async () => {
      const input = acceptFederationPairingRequestSchema.parse(request);
      const records = await this.repository.read();
      const current = required(records.find((item) => item.pairing.pairing_id === input.pairing_id && item.direction === 'incoming'), 'PAIRING_REQUEST_NOT_FOUND');
      if (terminal(current.pairing.status)) throw new Error('PAIRING_REQUEST_NOT_ACTIVE');
      const invitation = required(current.invitation, 'PAIRING_INVITATION_NOT_AVAILABLE');
      const before = await this.ports.federation.getState();
      const nextFederation = await this.ports.federation.acceptInvitation({ actor: input.actor, invitation, expected_inviter_key_fingerprint: current.remote_key_fingerprint, requested_capabilities: current.pairing.requested_capabilities, ...(input.ceremony ? { ceremony: input.ceremony } : {}) });
      const registration = nextFederation.registrations.find((item) => !before.registrations.some((old) => old.registration_id === item.registration_id)) ?? nextFederation.registrations.find((item) => item.invitation_id === invitation.invitation_id);
      if (!registration) throw new Error('FEDERATION_REGISTRATION_NOT_CREATED');
      const local = required(nextFederation.local_node, 'Federation node is unavailable.');
      const responderNonce = `pair_nonce_${randomBytes(24).toString('hex')}`;
      const updated = withTranscript({ ...current, registration, local_nonce: responderNonce, remote_nonce: current.local_nonce, actor: input.actor, pairing: { ...current.pairing, remote_proof_id: input.actor.human_proof_id, registration_id: registration.registration_id } }, this.clock);
      await this.repository.write(replace(records, updated));
      await this.sendSigned(local, current.pairing.remote_node_id, current.pairing.pairing_id, 'pairing-registration', { registration, responder_nonce: responderNonce });
      await this.record(input.actor.membership_id, current.pairing.pairing_id, input.ceremony?.trace_id, 'FEDERATION_PAIRING_REMOTE_PROOF_ACCEPTED', { registration_id: registration.registration_id, remote_node_id: current.pairing.remote_node_id });
      return this.stateUnlocked(nextFederation, '');
    });
  }

  public confirm(request: ConfirmFederationPairingRequest): Promise<FederationPairingState> {
    return this.serialize(async () => {
      const input = confirmFederationPairingRequestSchema.parse(request);
      let records = await this.repository.read();
      let current = required(records.find((item) => item.pairing.pairing_id === input.pairing_id), 'PAIRING_REQUEST_NOT_FOUND');
      if (!current.pairing.comparison_code || input.comparison_code !== current.pairing.comparison_code) throw new Error('FEDERATION_COMPARISON_CODE_MISMATCH');
      if (new Date(current.pairing.expires_at).getTime() <= this.clock().getTime()) throw new Error('FEDERATION_PAIRING_EXPIRED');
      if (current.pairing.local_confirmed_at && ['active', 'offline', 'activating', 'local-confirmed'].includes(current.pairing.status)) return this.stateUnlocked(await this.ports.federation.getState(), '');
      const now = this.clock().toISOString();
      current = internalPairingSchema.parse({ ...current, actor: input.actor, pairing: { ...current.pairing, local_proof_id: input.actor.human_proof_id, local_confirmed_at: current.pairing.local_confirmed_at ?? now, status: current.pairing.remote_confirmed_at ? 'activating' : 'local-confirmed', updated_at: now } });
      records = replace(records, current);
      await this.repository.write(records);
      const local = required((await this.ports.federation.getState()).local_node, 'Federation node is unavailable.');
      const comparisonCode = required(current.pairing.comparison_code, 'FEDERATION_COMPARISON_CODE_NOT_AVAILABLE');
      await this.sendSigned(local, current.pairing.remote_node_id, current.pairing.pairing_id, 'pairing-confirmation', { transcript_hash: current.pairing.transcript_hash, comparison_code_hash: sha256(comparisonCode), confirmed_at: now });
      await this.record(input.actor.membership_id, current.pairing.pairing_id, input.ceremony?.trace_id, 'FEDERATION_PAIRING_CODE_CONFIRMED', { transcript_hash: current.pairing.transcript_hash, local_node_id: local.node_id });
      await this.reconcileMessages(await this.ports.federation.getState());
      await this.activateReady(input.ceremony?.trace_id);
      const federation = await this.ports.federation.getState();
      return this.stateUnlocked(federation, '');
    });
  }

  public cancel(request: CancelFederationPairingRequest): Promise<FederationPairingState> {
    return this.serialize(async () => {
      const input = cancelFederationPairingRequestSchema.parse(request);
      const records = await this.repository.read();
      const current = required(records.find((item) => item.pairing.pairing_id === input.pairing_id), 'PAIRING_REQUEST_NOT_FOUND');
      const now = this.clock().toISOString();
      const updated = internalPairingSchema.parse({ ...current, actor: input.actor, pairing: { ...current.pairing, status: 'cancelled', reason_code: 'OPERATOR_CANCELLED', updated_at: now } });
      await this.repository.write(replace(records, updated));
      const local = required((await this.ports.federation.getState()).local_node, 'Federation node is unavailable.');
      await this.sendSigned(local, current.pairing.remote_node_id, current.pairing.pairing_id, 'pairing-cancelled', { reason_code: 'OPERATOR_CANCELLED' });
      await this.record(input.actor.membership_id, current.pairing.pairing_id, input.ceremony?.trace_id, 'FEDERATION_PAIRING_CANCELLED', { reason_code: 'OPERATOR_CANCELLED' });
      return this.stateUnlocked(await this.ports.federation.getState(), '');
    });
  }

  public async close(): Promise<void> { await Promise.all(this.transports.map((transport) => transport.close())); }

  private async publishPresence(federation: FederationState): Promise<void> {
    const node = federation.local_node;
    if (!node || node.status !== 'active') return;
    const now = this.clock();
    const bucket = Math.floor(now.getTime() / (10 * 60_000));
    const connectionCode = alphaCode(`${node.key_fingerprint}:${bucket}`, 8);
    const unsigned = {
      schema_version: 1 as const, discovery_id: `discovery_${node.node_id}`, mode: 'same-host' as const, node,
      search_names: unique([node.display_name, node.node_id, ...(await this.ports.aliases?.() ?? [])]).slice(0, 20),
      agents: await this.ports.agentCatalogue?.() ?? [],
      connection_code: connectionCode, pairing_code_hint: connectionCode.slice(-4), issued_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 45_000).toISOString()
    };
    const signed = signedNodePresenceSchema.parse({ ...unsigned, ...(await this.ports.federation.signPairingRecord(unsigned)) });
    await this.transports[0]!.publishPresence(signed);
    const lan = this.transports.find((item) => item.mode === 'secure-lan');
    if (lan && node.endpoint_policy === 'https-required' && process.env.H2A_SECURE_LAN_DISCOVERY === '1') {
      const lanUnsigned = { ...unsigned, mode: 'secure-lan' as const };
      await lan.publishPresence(signedNodePresenceSchema.parse({ ...lanUnsigned, ...(await this.ports.federation.signPairingRecord(lanUnsigned)) }));
    }
  }

  private async listPresences(): Promise<SignedNodePresence[]> {
    const lists = await Promise.all(this.transports.map((transport) => transport.listPresences().catch(() => [])));
    const deduplicated = new Map<string, SignedNodePresence>();
    for (const value of lists.flat()) {
      const current = deduplicated.get(value.node.node_id);
      if (!current || new Date(value.issued_at).getTime() > new Date(current.issued_at).getTime()) deduplicated.set(value.node.node_id, value);
    }
    return [...deduplicated.values()];
  }

  private async reconcileMessages(federation: FederationState): Promise<void> {
    const local = federation.local_node;
    if (!local) return;
    let records = await this.repository.read();
    const messages = (await Promise.all(this.transports.map((transport) => transport.receive(local.node_id).catch(() => [])))).flat().sort((a, b) => a.issued_at.localeCompare(b.issued_at));
    for (const message of messages) {
      const existing = records.find((item) => item.pairing.pairing_id === message.pairing_id);
      if (existing?.processed_message_ids.includes(message.message_id)) continue;
      if (message.type === 'pairing-request') {
        if (existing) continue;
        const payload = z.object({ invitation: federationInvitationSchema, initiator_nonce: z.string().min(16), connection_code: z.string().regex(/^[A-Z0-9]{8}$/u) }).parse(message.payload);
        if (payload.invitation.inviter_node.node_id !== message.sender_node.node_id || payload.invitation.inviter_node.key_fingerprint !== message.sender_node.key_fingerprint) throw new Error('FEDERATION_PAIRING_TRANSCRIPT_MISMATCH');
        if (payload.invitation.invited_organization_id && payload.invitation.invited_organization_id !== local.organization_id) continue;
        const now = this.clock().toISOString();
        const pairing = federationPairingSchema.parse({ schema_version: 1, pairing_id: message.pairing_id, discovery_id: `discovery_${message.sender_node.node_id}`, local_node_id: local.node_id, remote_node_id: message.sender_node.node_id, local_organization_id: local.organization_id, remote_organization_id: message.sender_node.organization_id, requested_capabilities: payload.invitation.allowed_capabilities, maximum_context_fields: payload.invitation.maximum_context_fields, status: 'remote-proof-required', local_proof_id: null, remote_proof_id: null, comparison_code: null, transcript_hash: hashCanonical({ pairing_id: message.pairing_id, invitation_hash: payload.invitation.canonical_hash }), local_confirmed_at: null, remote_confirmed_at: null, invitation_id: payload.invitation.invitation_id, registration_id: null, acceptance_id: null, local_peer_id: null, remote_peer_id: null, reason_code: null, evidence_refs: [], expires_at: payload.invitation.expires_at, updated_at: now, trust_ceiling: 'connected-observed' });
        records = [internalPairingSchema.parse({ pairing, direction: 'incoming', remote_display_name: message.sender_node.display_name, remote_key_fingerprint: message.sender_node.key_fingerprint, connection_code: payload.connection_code, local_nonce: payload.initiator_nonce, remote_nonce: null, invitation: payload.invitation, registration: null, acceptance: null, actor: null, processed_message_ids: [message.message_id] }), ...records];
        continue;
      }
      if (!existing) continue;
      let updated: InternalPairing = { ...existing, processed_message_ids: [...existing.processed_message_ids, message.message_id].slice(-500) };
      if (message.type === 'pairing-registration' && existing.direction === 'outgoing') {
        const payload = z.object({ registration: federationRegistrationSchema, responder_nonce: z.string().min(16) }).parse(message.payload);
        if (payload.registration.invitation_id !== existing.invitation?.invitation_id || payload.registration.joining_node.node_id !== message.sender_node.node_id) throw new Error('FEDERATION_PAIRING_TRANSCRIPT_MISMATCH');
        updated = withTranscript({ ...updated, registration: payload.registration, remote_nonce: payload.responder_nonce, pairing: { ...updated.pairing, remote_proof_id: 'remote-proof-confirmed', registration_id: payload.registration.registration_id } }, this.clock);
      } else if (message.type === 'pairing-confirmation') {
        const payload = z.object({ transcript_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/u), comparison_code_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/u), confirmed_at: z.string().datetime({ offset: true }) }).parse(message.payload);
        if (payload.transcript_hash !== existing.pairing.transcript_hash || !existing.pairing.comparison_code || payload.comparison_code_hash !== sha256(existing.pairing.comparison_code)) throw new Error('FEDERATION_PAIRING_CONFIRMATION_INVALID');
        updated = internalPairingSchema.parse({ ...updated, pairing: { ...updated.pairing, remote_confirmed_at: updated.pairing.remote_confirmed_at ?? payload.confirmed_at, status: updated.pairing.local_confirmed_at ? 'activating' : 'remote-confirmed', updated_at: this.clock().toISOString() } });
      } else if (message.type === 'pairing-acceptance' && existing.direction === 'incoming') {
        const payload = z.object({ acceptance: federationAcceptanceSchema }).parse(message.payload);
        if (payload.acceptance.registration_id !== existing.registration?.registration_id) throw new Error('FEDERATION_PAIRING_ACCEPTANCE_INVALID');
        updated = internalPairingSchema.parse({ ...updated, acceptance: payload.acceptance, pairing: { ...updated.pairing, acceptance_id: payload.acceptance.acceptance_id, local_peer_id: payload.acceptance.peer_id, remote_peer_id: payload.acceptance.peer_id, status: 'activating', updated_at: this.clock().toISOString() } });
      } else if (message.type === 'pairing-cancelled') {
        updated = internalPairingSchema.parse({ ...updated, pairing: { ...updated.pairing, status: 'cancelled', reason_code: 'REMOTE_CANCELLED', updated_at: this.clock().toISOString() } });
      }
      records = replace(records, updated);
    }
    await this.repository.write(records);
    await this.activateReady();
  }

  private async activateReady(traceId?: string): Promise<void> {
    let records = await this.repository.read();
    for (let current of records) {
      if (!current.pairing.local_confirmed_at || !current.pairing.remote_confirmed_at || !current.actor) continue;
      const actor = current.actor;
      try {
        if (current.direction === 'outgoing' && !current.acceptance && current.registration) {
          const before = await this.ports.federation.getState();
          const next = await this.ports.federation.approveRegistration({ actor: current.actor, registration: current.registration });
          const acceptance = next.acceptances.find((item) => !before.acceptances.some((old) => old.acceptance_id === item.acceptance_id)) ?? next.acceptances.find((item) => item.registration_id === current.registration?.registration_id);
          if (!acceptance) throw new Error('FEDERATION_ACCEPTANCE_NOT_CREATED');
          current = internalPairingSchema.parse({ ...current, acceptance, pairing: { ...current.pairing, acceptance_id: acceptance.acceptance_id, local_peer_id: acceptance.peer_id, remote_peer_id: acceptance.peer_id, status: 'active', updated_at: this.clock().toISOString() } });
          records = replace(records, current); await this.repository.write(records);
          const local = required(next.local_node, 'Federation node is unavailable.');
          await this.sendSigned(local, current.pairing.remote_node_id, current.pairing.pairing_id, 'pairing-acceptance', { acceptance });
          await this.record(actor.membership_id, current.pairing.pairing_id, traceId, 'FEDERATION_PAIRING_ACTIVATED', { peer_id: acceptance.peer_id, transcript_hash: current.pairing.transcript_hash });
        } else if (current.direction === 'incoming' && current.acceptance) {
          const acceptance = current.acceptance;
          const next = await this.ports.federation.activateAcceptance({ actor, acceptance });
          current = internalPairingSchema.parse({ ...current, pairing: { ...current.pairing, local_peer_id: acceptance.peer_id, remote_peer_id: acceptance.peer_id, status: 'active', updated_at: this.clock().toISOString() } });
          records = replace(records, current); await this.repository.write(records);
          await this.record(actor.membership_id, current.pairing.pairing_id, traceId, 'FEDERATION_PAIRING_ACTIVATED', { peer_id: acceptance.peer_id, transcript_hash: current.pairing.transcript_hash, local_node_id: next.local_node?.node_id });
        }
      } catch (error) {
        if (!isAdministratorProofError(error)) throw error;
        current = internalPairingSchema.parse({
          ...current,
          actor: null,
          pairing: {
            ...current.pairing,
            local_proof_id: null,
            status: 'local-proof-required',
            reason_code: 'FEDERATION_ADMINISTRATOR_PROOF_REQUIRED',
            updated_at: this.clock().toISOString()
          }
        });
        records = replace(records, current);
        await this.repository.write(records);
      }
    }
  }

  private async reconcileLifecycle(federation: FederationState): Promise<void> {
    const presences = await this.listPresences();
    const now = this.clock();
    const records = await this.repository.read();
    const next = records.map((item): InternalPairing => {
      const peer = federation.peers.find((candidate) => candidate.peer_id === item.pairing.local_peer_id);
      let status = item.pairing.status;
      let reason = item.pairing.reason_code;
      if (peer?.status === 'revoked') { status = 'replacement-required'; reason = 'FEDERATION_PEER_REVOKED'; }
      else if (status === 'active' && !presences.some((presence) => presence.node.node_id === item.pairing.remote_node_id)) status = 'offline';
      else if (status === 'offline' && presences.some((presence) => presence.node.node_id === item.pairing.remote_node_id)) status = 'active';
      else if (!terminal(status) && new Date(item.pairing.expires_at).getTime() <= now.getTime()) { status = 'expired'; reason = 'FEDERATION_PAIRING_EXPIRED'; }
      return internalPairingSchema.parse({ ...item, pairing: { ...item.pairing, status, reason_code: reason, updated_at: status === item.pairing.status ? item.pairing.updated_at : now.toISOString() } });
    });
    if (hashCanonical(next) !== hashCanonical(records)) await this.repository.write(next);
  }

  private async stateUnlocked(federation: FederationState, search: string): Promise<FederationPairingState> {
    const local = federation.local_node;
    const normalized = search.trim().toLocaleLowerCase();
    const nodes = (await this.listPresences()).filter((presence) => presence.node.node_id !== local?.node_id && presence.node.organization_id === local?.organization_id).filter((presence) => !normalized || [presence.node.display_name, presence.node.node_id, ...presence.search_names, ...presence.agents.flatMap((agent) => [agent.display_name, agent.agent_id]), presence.connection_code].some((value) => value.toLocaleLowerCase().includes(normalized))).map((presence) => discoveredNodeSchema.parse({ discovery_id: presence.discovery_id, mode: presence.mode, node_id: presence.node.node_id, organization_id: presence.node.organization_id, display_name: presence.node.display_name, endpoint_policy: presence.node.endpoint_policy, capabilities: presence.node.capabilities, key_fingerprint: presence.node.key_fingerprint, pairing_code_hint: presence.pairing_code_hint, advertised_fields: ['node_id', 'organization_id', 'display_name', 'endpoint_policy', 'capabilities', 'key_fingerprint', 'pairing_code_hint', 'agent_catalog', 'expires_at'], discovered_at: presence.issued_at, expires_at: presence.expires_at, trust_status: 'unconfirmed', search_names: presence.search_names, connection_code: presence.connection_code, agents: presence.agents }));
    const discovery = nodeDiscoverySnapshotSchema.parse({ schema_version: 1, mode: 'same-host', availability: local ? 'available' : 'disabled', nodes, telemetry: 'disabled', generated_at: this.clock().toISOString() });
    const pairings: FederationPairingView[] = (await this.repository.read()).map((item) => federationPairingViewSchema.parse({ pairing: item.pairing, direction: item.direction, remote_display_name: item.remote_display_name, remote_key_fingerprint: item.remote_key_fingerprint, connection_code: item.connection_code, local_confirmed: Boolean(item.pairing.local_confirmed_at), remote_confirmed: Boolean(item.pairing.remote_confirmed_at), invitation: item.invitation, registration: item.registration, acceptance: item.acceptance }));
    return federationPairingStateSchema.parse({ schema_version: 1, discovery, pairings, public_directory: 'disabled', global_username_lookup: 'disabled', secure_lan: { enabled: process.env.H2A_SECURE_LAN_DISCOVERY === '1', policy: process.env.H2A_SECURE_LAN_DISCOVERY === '1' ? 'https-pinned-only' : 'disabled', implementation: 'node-built-in-udp-multicast', dependency_license: 'Node.js built-in / MIT' }, generated_at: this.clock().toISOString(), trust_ceiling: 'connected-observed' });
  }

  private async sendSigned(local: NonNullable<FederationState['local_node']>, recipientNodeId: string, pairingId: string, type: PairingTransportRecord['type'], payload: unknown): Promise<void> {
    const unsigned: PairingTransportUnsigned = { schema_version: 1, message_id: newTransportMessageId(), type, sender_node: local, recipient_node_id: recipientNodeId, pairing_id: pairingId, payload, issued_at: this.clock().toISOString(), expires_at: new Date(this.clock().getTime() + 10 * 60_000).toISOString() };
    const record = { ...unsigned, ...(await this.ports.federation.signPairingRecord(unsigned)) } as PairingTransportRecord;
    await this.transports[0]!.send(record);
    const lan = this.transports.find((item) => item.mode === 'secure-lan');
    if (lan && local.endpoint_policy === 'https-required' && process.env.H2A_SECURE_LAN_DISCOVERY === '1') await lan.send(record);
  }

  private async record(actorId: string, pairingId: string, traceId: string | undefined, eventType: AuthorityEventType, payload: Record<string, unknown>): Promise<void> {
    const receipt = await this.evidence.append({ trace_id: traceId ?? `tr_pairing_${pairingId}`, actor: { type: 'human', id: actorId }, subject: { type: 'federation_peer', id: pairingId }, event_type: eventType, payload: { ...payload, trust_ceiling: 'connected-observed' } });
    const records = await this.repository.read();
    const current = records.find((item) => item.pairing.pairing_id === pairingId);
    if (current && !current.pairing.evidence_refs.includes(receipt.event_id)) await this.repository.write(replace(records, internalPairingSchema.parse({ ...current, pairing: { ...current.pairing, evidence_refs: [...current.pairing.evidence_refs, receipt.event_id].slice(-200) } })));
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function withTranscript(value: InternalPairing, clock: () => Date): InternalPairing {
  const invitation = required(value.invitation, 'PAIRING_INVITATION_NOT_AVAILABLE');
  const registration = required(value.registration, 'PAIRING_REGISTRATION_NOT_AVAILABLE');
  const initiatorNonce = value.direction === 'outgoing' ? value.local_nonce : required(value.remote_nonce, 'PAIRING_INITIATOR_NONCE_NOT_AVAILABLE');
  const responderNonce = value.direction === 'incoming' ? value.local_nonce : required(value.remote_nonce, 'PAIRING_RESPONDER_NONCE_NOT_AVAILABLE');
  const transcriptHash = hashCanonical({ invitation_hash: invitation.canonical_hash, registration_hash: registration.canonical_hash, initiator_fingerprint: invitation.inviter_node.key_fingerprint, responder_fingerprint: registration.joining_node.key_fingerprint, initiator_nonce: initiatorNonce, responder_nonce: responderNonce, organization_id: invitation.inviter_node.organization_id });
  const comparisonCode = digits(`${invitation.inviter_node.key_fingerprint}:${registration.joining_node.key_fingerprint}:${initiatorNonce}:${responderNonce}:${invitation.inviter_node.organization_id}:${transcriptHash}`);
  return internalPairingSchema.parse({ ...value, pairing: { ...value.pairing, comparison_code: comparisonCode, transcript_hash: transcriptHash, status: 'comparison-required', updated_at: clock().toISOString() } });
}

function replace(records: InternalPairing[], value: InternalPairing): InternalPairing[] { return records.map((item) => item.pairing.pairing_id === value.pairing.pairing_id ? value : item); }
function required<T>(value: T | null | undefined, message: string): T { if (value === null || value === undefined) throw new Error(message); return value; }
function isAdministratorProofError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /HUMAN_PROOF|Fresh Human Proof|CREDENTIAL_(?:INACTIVE|EXPIRED)|AUTHORITY_(?:DENIED|MISSING)/iu.test(message);
}
function terminal(status: string): boolean { return ['active', 'offline', 'expired', 'cancelled', 'revoked', 'replacement-required'].includes(status); }
function sha256(value: string): string { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function digits(value: string): string { return String(Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 12), 16) % 1_000_000).padStart(6, '0'); }
function alphaCode(value: string, length: number): string { const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; const digest = createHash('sha256').update(value).digest(); let result = ''; for (let index = 0; index < length; index += 1) result += alphabet[digest[index]! % alphabet.length]; return result; }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
