import { createHash, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { z } from 'zod';
import {
  acceptFederationInvitationRequestSchema,
  activateFederationAcceptanceRequestSchema,
  approveFederationRegistrationRequestSchema,
  configureFederationNodeRequestSchema,
  createFederationInvitationRequestSchema,
  federatedPayloadSchema,
  federationAcceptanceSchema,
  federationEnvelopeReceiptSchema,
  federationEnvelopeSchema,
  federationInvitationSchema,
  federationNodeIdentitySchema,
  federationPeerSchema,
  federationRegistrationSchema,
  federationStateSchema,
  revokeFederationPeerRequestSchema,
  type AcceptFederationInvitationRequest,
  type ActivateFederationAcceptanceRequest,
  type ApproveFederationRegistrationRequest,
  type ConfigureFederationNodeRequest,
  type CreateFederationInvitationRequest,
  type FederatedPayload,
  type FederationAcceptance,
  type FederationCapability,
  type FederationEnvelope,
  type FederationEnvelopeReceipt,
  type FederationInvitation,
  type FederationNodeIdentity,
  type FederationPeer,
  type FederationRegistration,
  type FederationState,
  type RevokeFederationPeerRequest
} from '@h2a/contracts';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const localNodeSchema = federationNodeIdentitySchema.nullable();
const nodeSecretSchema = z.object({ node_id: z.string().min(1), sealed_private_key: z.string().min(1), public_key_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/) }).strict().nullable();
type NodeSecret = z.infer<typeof nodeSecretSchema>;

export interface FederationKeyProtector {
  seal(plaintext: string): Promise<string>;
  open(ciphertext: string): Promise<string>;
}

export interface FederationAuthorityPort {
  authorizeProtectedOperation(context: { organizationId: string; membershipId: string; humanProofId: string; authorityCredentialId: string } | undefined, resource: string, action: string, requiredApprovalPower?: string): Promise<{ humanId: string; humanProofId: string }>;
}

export interface FederationEnvelopeOptions {
  traceId: string;
  ceremonyId?: string;
  idempotencyKey?: string;
  taskId?: string;
  mandateId?: string;
  contextGrantId?: string;
  expiresAt?: string;
}

export interface FederationDetachedSignature {
  canonical_hash: string;
  node_signature: string;
}

export class FederationService {
  private readonly localNode: VersionedJsonRepository<'h2a.v2.federation-local-node', FederationNodeIdentity | null>;
  private readonly secret: VersionedJsonRepository<'h2a.v2.federation-node-secret', NodeSecret>;
  private readonly invitations: VersionedJsonRepository<'h2a.v2.federation-invitations', FederationInvitation[]>;
  private readonly registrations: VersionedJsonRepository<'h2a.v2.federation-registrations', FederationRegistration[]>;
  private readonly acceptances: VersionedJsonRepository<'h2a.v2.federation-acceptances', FederationAcceptance[]>;
  private readonly peers: VersionedJsonRepository<'h2a.v2.federation-peers', FederationPeer[]>;
  private readonly receipts: VersionedJsonRepository<'h2a.v2.federation-receipts', FederationEnvelopeReceipt[]>;
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly authority: FederationAuthorityPort,
    private readonly protector: FederationKeyProtector,
    private readonly clock: () => Date = () => new Date()
  ) {
    const store = new AtomicFileStore(dataPath);
    this.localNode = new VersionedJsonRepository(store, 'federation/local-node-v2.json', 'h2a.v2.federation-local-node', localNodeSchema, { initialData: null, clock });
    this.secret = new VersionedJsonRepository(store, 'federation/private/node-key-v2.json', 'h2a.v2.federation-node-secret', nodeSecretSchema, { initialData: null, clock });
    this.invitations = new VersionedJsonRepository(store, 'federation/invitations-v2.json', 'h2a.v2.federation-invitations', z.array(federationInvitationSchema).max(200), { initialData: [], clock });
    this.registrations = new VersionedJsonRepository(store, 'federation/registrations-v2.json', 'h2a.v2.federation-registrations', z.array(federationRegistrationSchema).max(200), { initialData: [], clock });
    this.acceptances = new VersionedJsonRepository(store, 'federation/acceptances-v2.json', 'h2a.v2.federation-acceptances', z.array(federationAcceptanceSchema).max(200), { initialData: [], clock });
    this.peers = new VersionedJsonRepository(store, 'federation/peers-v2.json', 'h2a.v2.federation-peers', z.array(federationPeerSchema).max(200), { initialData: [], clock });
    this.receipts = new VersionedJsonRepository(store, 'federation/envelope-receipts-v2.json', 'h2a.v2.federation-receipts', z.array(federationEnvelopeReceiptSchema).max(500), { initialData: [], clock });
  }

  public async initialize(): Promise<FederationState> {
    await Promise.all([this.localNode.read(), this.secret.read(), this.invitations.read(), this.registrations.read(), this.acceptances.read(), this.peers.read(), this.receipts.read()]);
    return this.getState();
  }

  public getState(): Promise<FederationState> {
    return this.serialize(async () => {
      await this.refreshLifecycle();
      return this.stateUnlocked();
    });
  }

  public signPairingRecord(value: unknown): Promise<FederationDetachedSignature> {
    return this.serialize(async () => ({
      canonical_hash: hashCanonical(value),
      node_signature: signatureFor(value, await this.privateKey())
    }));
  }

  public configureNode(request: ConfigureFederationNodeRequest): Promise<FederationState> {
    return this.serialize(async () => {
      const input = configureFederationNodeRequestSchema.parse(request);
      await this.authorize(input.actor, input.organization_id, 'federation-node', 'configure', 'federation.node.manage');
      assertEndpoint(input.endpoint, input.remote_listener_enabled);
      const current = await this.localNode.read();
      if (current && current.organization_id !== input.organization_id) throw new Error('Federation node organization cannot be changed after key generation.');
      const now = this.clock().toISOString();
      let privateKeyPem: string;
      let publicKeyPem: string;
      let nodeId: string;
      let createdAt: string;
      if (current) {
        privateKeyPem = await this.privateKey();
        publicKeyPem = current.public_key_pem;
        nodeId = current.node_id;
        createdAt = current.created_at;
      } else {
        const pair = generateKeyPairSync('ed25519');
        privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
        publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
        nodeId = `node_${randomUUID()}`;
        createdAt = now;
        await this.secret.write({ node_id: nodeId, sealed_private_key: await this.protector.seal(privateKeyPem), public_key_fingerprint: keyFingerprint(publicKeyPem) });
      }
      const unsigned = {
        schema_version: 2 as const, node_id: nodeId, organization_id: input.organization_id, display_name: input.display_name,
        public_key_pem: publicKeyPem, key_fingerprint: keyFingerprint(publicKeyPem), endpoint: input.endpoint,
        endpoint_policy: input.remote_listener_enabled ? 'https-required' as const : 'loopback-only' as const,
        ...(input.tls_certificate_fingerprint ? { tls_certificate_fingerprint: input.tls_certificate_fingerprint } : {}),
        capabilities: allCapabilities(), status: 'active' as const, created_at: createdAt, updated_at: now
      };
      const node = signNode(unsigned, privateKeyPem);
      await this.localNode.write(node);
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_federation_${node.node_id}`, actor: { type: 'human', id: input.actor.membership_id }, subject: { type: 'federation_node', id: node.node_id }, event_type: 'FEDERATION_NODE_CONFIGURED', payload: { organization_id: node.organization_id, key_fingerprint: node.key_fingerprint, endpoint_policy: node.endpoint_policy, remote_listener_enabled: input.remote_listener_enabled, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.stateUnlocked();
    });
  }

  public createInvitation(request: CreateFederationInvitationRequest): Promise<FederationState> {
    return this.serialize(async () => {
      const input = createFederationInvitationRequestSchema.parse(request);
      const node = await this.requireLocalNode();
      await this.authorize(input.actor, node.organization_id, 'federation-peer', 'invite', 'federation.peer.invite');
      if (new Date(input.expires_at).getTime() <= this.clock().getTime()) throw new Error('Federation invitation expiry must be in the future.');
      const unsigned = {
        schema_version: 2 as const, invitation_id: `finv_${randomUUID()}`, inviter_node: node,
        ...(input.invited_organization_id ? { invited_organization_id: input.invited_organization_id } : {}),
        allowed_capabilities: unique(input.allowed_capabilities), maximum_context_fields: input.maximum_context_fields,
        nonce: `nonce_${randomUUID()}`, issued_at: this.clock().toISOString(), expires_at: input.expires_at, status: 'open' as const
      };
      const invitation = signInvitation(unsigned, await this.privateKey());
      await this.invitations.write([invitation, ...(await this.invitations.read())].slice(0, 200));
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_federation_${invitation.invitation_id}`, actor: { type: 'human', id: input.actor.membership_id }, subject: { type: 'federation_peer', id: invitation.invitation_id }, event_type: 'FEDERATION_INVITATION_CREATED', payload: { inviter_node_id: node.node_id, invited_organization_id: input.invited_organization_id ?? 'any', capabilities: invitation.allowed_capabilities, maximum_context_fields: invitation.maximum_context_fields, expires_at: invitation.expires_at, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.stateUnlocked();
    });
  }

  public acceptInvitation(request: AcceptFederationInvitationRequest): Promise<FederationState> {
    return this.serialize(async () => {
      const input = acceptFederationInvitationRequestSchema.parse(request);
      const local = await this.requireLocalNode();
      await this.authorize(input.actor, local.organization_id, 'federation-peer', 'join', 'federation.peer.join');
      verifyNode(input.invitation.inviter_node);
      verifyInvitation(input.invitation);
      if (input.expected_inviter_key_fingerprint !== input.invitation.inviter_node.key_fingerprint) throw new Error('Inviter node fingerprint does not match the out-of-band pin.');
      if (input.invitation.status !== 'open' || new Date(input.invitation.expires_at).getTime() <= this.clock().getTime()) throw new Error('Federation invitation is not active.');
      if (input.invitation.invited_organization_id && input.invitation.invited_organization_id !== local.organization_id) throw new Error('Federation invitation is intended for a different organization.');
      if (!input.requested_capabilities.every((value) => input.invitation.allowed_capabilities.includes(value))) throw new Error('Registration requests capabilities outside the invitation.');
      assertEndpoint(input.invitation.inviter_node.endpoint, input.invitation.inviter_node.endpoint_policy === 'https-required');
      const unsigned = {
        schema_version: 2 as const, registration_id: `freg_${randomUUID()}`, invitation_id: input.invitation.invitation_id,
        invitation_nonce: input.invitation.nonce, joining_node: local, requested_capabilities: unique(input.requested_capabilities), created_at: this.clock().toISOString()
      };
      const registration = signRegistration(unsigned, await this.privateKey());
      await this.invitations.write([input.invitation, ...(await this.invitations.read()).filter((item) => item.invitation_id !== input.invitation.invitation_id)].slice(0, 200));
      await this.registrations.write([registration, ...(await this.registrations.read()).filter((item) => item.registration_id !== registration.registration_id)].slice(0, 200));
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_federation_${registration.registration_id}`, actor: { type: 'human', id: input.actor.membership_id }, subject: { type: 'federation_peer', id: input.invitation.inviter_node.node_id }, event_type: 'FEDERATION_REGISTRATION_CREATED', payload: { invitation_id: registration.invitation_id, joining_node_id: local.node_id, pinned_inviter_fingerprint: input.expected_inviter_key_fingerprint, requested_capabilities: registration.requested_capabilities, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.stateUnlocked();
    });
  }

  public approveRegistration(request: ApproveFederationRegistrationRequest): Promise<FederationState> {
    return this.serialize(async () => {
      const input = approveFederationRegistrationRequestSchema.parse(request);
      const local = await this.requireLocalNode();
      await this.authorize(input.actor, local.organization_id, 'federation-peer', 'approve', 'federation.peer.approve');
      const invitations = await this.invitations.read();
      const invitation = invitations.find((item) => item.invitation_id === input.registration.invitation_id && item.inviter_node.node_id === local.node_id);
      if (!invitation || invitation.status !== 'open' || invitation.nonce !== input.registration.invitation_nonce) throw new Error('Open matching federation invitation was not found.');
      if (new Date(invitation.expires_at).getTime() <= this.clock().getTime()) throw new Error('Federation invitation has expired.');
      verifyNode(input.registration.joining_node);
      verifyRegistration(input.registration);
      if (invitation.invited_organization_id && invitation.invited_organization_id !== input.registration.joining_node.organization_id) throw new Error('Joining organization does not match the invitation.');
      if (!input.registration.requested_capabilities.every((value) => invitation.allowed_capabilities.includes(value))) throw new Error('Registration exceeds invited capabilities.');
      assertEndpoint(input.registration.joining_node.endpoint, input.registration.joining_node.endpoint_policy === 'https-required');
      const now = this.clock();
      const peerId = `peer_${randomUUID()}`;
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
      const capabilities = unique(input.registration.requested_capabilities);
      const acceptanceUnsigned = { schema_version: 2 as const, acceptance_id: `facc_${randomUUID()}`, peer_id: peerId, invitation_id: invitation.invitation_id, registration_id: input.registration.registration_id, host_node: local, joining_node_id: input.registration.joining_node.node_id, accepted_capabilities: capabilities, maximum_context_fields: invitation.maximum_context_fields, accepted_at: now.toISOString(), expires_at: expiresAt };
      const acceptance = signAcceptance(acceptanceUnsigned, await this.privateKey());
      const peer = peerFrom(peerId, invitation.invitation_id, local.node_id, input.registration.joining_node, capabilities, invitation.maximum_context_fields, now.toISOString(), expiresAt);
      const used = signInvitation({ ...unsignedInvitation(invitation), status: 'used' }, await this.privateKey());
      await Promise.all([
        this.invitations.write(invitations.map((item) => item.invitation_id === invitation.invitation_id ? used : item)),
        this.registrations.write([input.registration, ...(await this.registrations.read()).filter((item) => item.registration_id !== input.registration.registration_id)].slice(0, 200)),
        this.acceptances.write([acceptance, ...(await this.acceptances.read()).filter((item) => item.acceptance_id !== acceptance.acceptance_id)].slice(0, 200)),
        this.peers.write([peer, ...(await this.peers.read()).filter((item) => item.peer_id !== peer.peer_id)].slice(0, 200))
      ]);
      await this.recordPeerActivated(input.actor.membership_id, peer, acceptance, input.ceremony);
      return this.stateUnlocked();
    });
  }

  public activateAcceptance(request: ActivateFederationAcceptanceRequest): Promise<FederationState> {
    return this.serialize(async () => {
      const input = activateFederationAcceptanceRequestSchema.parse(request);
      const local = await this.requireLocalNode();
      await this.authorize(input.actor, local.organization_id, 'federation-peer', 'activate', 'federation.peer.join');
      const registration = (await this.registrations.read()).find((item) => item.registration_id === input.acceptance.registration_id && item.joining_node.node_id === local.node_id);
      const invitation = (await this.invitations.read()).find((item) => item.invitation_id === input.acceptance.invitation_id);
      if (!registration || !invitation) throw new Error('Local federation registration context was not found.');
      verifyNode(input.acceptance.host_node);
      verifyAcceptance(input.acceptance);
      if (input.acceptance.joining_node_id !== local.node_id || input.acceptance.host_node.node_id !== invitation.inviter_node.node_id || input.acceptance.host_node.key_fingerprint !== invitation.inviter_node.key_fingerprint) throw new Error('Federation acceptance does not match the pinned invitation.');
      if (!input.acceptance.accepted_capabilities.every((value) => registration.requested_capabilities.includes(value))) throw new Error('Federation acceptance grants unrequested capabilities.');
      if (new Date(input.acceptance.expires_at).getTime() <= this.clock().getTime()) throw new Error('Federation acceptance has expired.');
      const peer = peerFrom(input.acceptance.peer_id, invitation.invitation_id, local.node_id, input.acceptance.host_node, input.acceptance.accepted_capabilities, input.acceptance.maximum_context_fields, input.acceptance.accepted_at, input.acceptance.expires_at);
      await Promise.all([
        this.acceptances.write([input.acceptance, ...(await this.acceptances.read()).filter((item) => item.acceptance_id !== input.acceptance.acceptance_id)].slice(0, 200)),
        this.peers.write([peer, ...(await this.peers.read()).filter((item) => item.peer_id !== peer.peer_id)].slice(0, 200))
      ]);
      await this.recordPeerActivated(input.actor.membership_id, peer, input.acceptance, input.ceremony);
      return this.stateUnlocked();
    });
  }

  public revokePeer(request: RevokeFederationPeerRequest): Promise<FederationState> {
    return this.serialize(async () => {
      const input = revokeFederationPeerRequestSchema.parse(request);
      const local = await this.requireLocalNode();
      await this.authorize(input.actor, local.organization_id, 'federation-peer', 'revoke', 'federation.peer.revoke');
      const peers = await this.peers.read();
      const peer = peers.find((item) => item.peer_id === input.peer_id);
      if (!peer) throw new Error('Federation peer was not found.');
      if (peer.status === 'revoked') return this.stateUnlocked();
      const updated = federationPeerSchema.parse({ ...peer, status: 'revoked', updated_at: this.clock().toISOString() });
      await this.peers.write(peers.map((item) => item.peer_id === peer.peer_id ? updated : item));
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_federation_${peer.peer_id}`, actor: { type: 'human', id: input.actor.membership_id }, subject: { type: 'federation_peer', id: peer.peer_id }, event_type: 'FEDERATION_PEER_REVOKED', payload: { remote_node_id: peer.remote_node.node_id, reason_code: input.reason_code, pinned_key_fingerprint: peer.pinned_key_fingerprint, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.stateUnlocked();
    });
  }

  public signEnvelope(peerId: string, payload: FederatedPayload, options: FederationEnvelopeOptions): Promise<FederationEnvelope> {
    return this.serialize(async () => {
      const validatedPayload = federatedPayloadSchema.parse(payload);
      const local = await this.requireLocalNode();
      const peers = await this.peers.read();
      const peer = peers.find((item) => item.peer_id === peerId);
      this.assertActivePeer(peer);
      assertPayloadAllowed(peer!, validatedPayload);
      assertNoCredentialMaterial(validatedPayload);
      const now = this.clock();
      const expiresAt = options.expiresAt ?? new Date(now.getTime() + 60_000).toISOString();
      if (new Date(expiresAt).getTime() <= now.getTime()) throw new Error('Federation envelope expiry must be in the future.');
      const unsigned = {
        schema_version: 2 as const, envelope_id: `fenv_${randomUUID()}`, peer_id: peer!.peer_id,
        sender_node_id: local.node_id, recipient_node_id: peer!.remote_node.node_id, origin_organization_id: local.organization_id,
        trace_id: options.traceId, ...(options.ceremonyId ? { ceremony_id: options.ceremonyId } : {}), ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}), ...(options.taskId ? { task_id: options.taskId } : {}), ...(options.mandateId ? { mandate_id: options.mandateId } : {}),
        ...(options.contextGrantId ? { context_grant_id: options.contextGrantId } : {}), payload: validatedPayload,
        payload_hash: hashCanonical(validatedPayload), sequence: peer!.outbound_sequence + 1, nonce: `nonce_${randomUUID()}`,
        issued_at: now.toISOString(), expires_at: expiresAt
      };
      const envelope = signEnvelopeRecord(unsigned, await this.privateKey());
      const updated = federationPeerSchema.parse({ ...peer!, outbound_sequence: envelope.sequence, updated_at: now.toISOString() });
      await this.peers.write(peers.map((item) => item.peer_id === peer!.peer_id ? updated : item));
      return envelope;
    });
  }

  public receiveEnvelope(value: unknown): Promise<FederationEnvelope> {
    return this.serialize(async () => {
      const envelope = federationEnvelopeSchema.parse(value);
      const local = await this.requireLocalNode();
      const peers = await this.peers.read();
      const peer = peers.find((item) => item.peer_id === envelope.peer_id);
      let reason = 'FEDERATION_ENVELOPE_ACCEPTED';
      try {
        this.assertActivePeer(peer);
        if (envelope.recipient_node_id !== local.node_id || envelope.sender_node_id !== peer!.remote_node.node_id) throw new Error('FEDERATION_NODE_BINDING_MISMATCH');
        if (envelope.origin_organization_id !== peer!.remote_node.organization_id) throw new Error('FEDERATION_ORGANIZATION_BINDING_MISMATCH');
        if (new Date(envelope.expires_at).getTime() <= this.clock().getTime()) throw new Error('FEDERATION_ENVELOPE_EXPIRED');
        if (envelope.sequence <= peer!.inbound_sequence) throw new Error('FEDERATION_SEQUENCE_REPLAY');
        if ((await this.receipts.read()).some((item) => item.sender_node_id === envelope.sender_node_id && item.nonce === envelope.nonce)) throw new Error('FEDERATION_NONCE_REPLAY');
        if (hashCanonical(envelope.payload) !== envelope.payload_hash) throw new Error('FEDERATION_PAYLOAD_HASH_INVALID');
        const unsigned = unsignedEnvelope(envelope);
        if (hashCanonical(unsigned) !== envelope.canonical_hash || !verifyRecord(unsigned, envelope.sender_signature, peer!.remote_node.public_key_pem)) throw new Error('FEDERATION_SIGNATURE_INVALID');
        assertPayloadAllowed(peer!, envelope.payload);
        assertNoCredentialMaterial(envelope.payload);
        if (envelope.payload.type === 'task' && (envelope.origin_organization_id !== envelope.payload.task.organization_id || envelope.payload.context_field_names.length > peer!.maximum_context_fields)) throw new Error('FEDERATION_CONTEXT_SCOPE_EXCEEDED');
      } catch (error) {
        reason = error instanceof Error ? error.message : 'FEDERATION_ENVELOPE_REJECTED';
        await this.recordReceipt(envelope, 'rejected', reason);
        throw new Error(reason);
      }
      const now = this.clock().toISOString();
      const nextStatus = envelope.payload.type === 'revocation' ? 'revoked' : 'active';
      // Any validated inbound envelope proves that the pinned peer is reachable.
      const updated = federationPeerSchema.parse({ ...peer!, inbound_sequence: envelope.sequence, status: nextStatus, last_heartbeat_at: now, updated_at: now });
      await this.peers.write(peers.map((item) => item.peer_id === peer!.peer_id ? updated : item));
      await this.recordReceipt(envelope, 'accepted', reason);
      return envelope;
    });
  }

  public async proveTamperedEnvelope(traceId: string, ceremonyId?: string): Promise<{ reasonCode: string; evidenceRef: string }> {
    const peer = [...await this.peers.read()].reverse().find((item) => ['active', 'offline'].includes(item.status));
    if (!peer) throw new Error('No active or offline pinned peer is available for the tamper test.');
    const local = await this.requireLocalNode();
    const payload = { type: 'heartbeat' as const, sent_at: this.clock().toISOString() };
    const envelope = federationEnvelopeSchema.parse({
      schema_version: 2, envelope_id: `fenv_${randomUUID()}`, peer_id: peer.peer_id,
      sender_node_id: peer.remote_node.node_id, recipient_node_id: local.node_id, origin_organization_id: peer.remote_node.organization_id,
      trace_id: traceId, ...(ceremonyId ? { ceremony_id: ceremonyId } : {}), payload,
      payload_hash: hashCanonical({ ...payload, sent_at: new Date(this.clock().getTime() + 1_000).toISOString() }),
      sequence: peer.inbound_sequence + 1, nonce: `nonce_${randomUUID()}`, issued_at: this.clock().toISOString(),
      expires_at: new Date(this.clock().getTime() + 60_000).toISOString(), canonical_hash: hashCanonical({ probe: 'phase30-tamper' }),
      sender_signature: `ed25519:${Buffer.alloc(64).toString('base64')}`
    });
    let reasonCode = '';
    try { await this.receiveEnvelope(envelope); }
    catch (error) { reasonCode = error instanceof Error ? error.message : 'FEDERATION_ENVELOPE_REJECTED'; }
    if (!/HASH|SIGNATURE/iu.test(reasonCode)) throw new Error(`Tamper test did not reach cryptographic rejection: ${reasonCode || 'accepted'}.`);
    const receipt = (await this.receipts.read()).find((item) => item.envelope_id === envelope.envelope_id && item.decision === 'rejected');
    const event = receipt && (await this.evidence.list()).find((item) => item.subject?.id === envelope.envelope_id && item.event_type === 'FEDERATION_ENVELOPE_REJECTED');
    if (!event) throw new Error('Federation tamper denial evidence was not persisted.');
    return { reasonCode, evidenceRef: event.event_id };
  }

  public peer(peerId: string): Promise<FederationPeer> {
    return this.serialize(async () => {
      const peer = (await this.peers.read()).find((item) => item.peer_id === peerId);
      if (!peer) throw new Error('Federation peer was not found.');
      return peer;
    });
  }

  private async stateUnlocked(): Promise<FederationState> {
    const local = await this.localNode.read();
    return federationStateSchema.parse({ local_node: local, invitations: await this.invitations.read(), registrations: await this.registrations.read(), acceptances: await this.acceptances.read(), peers: await this.peers.read(), receipts: await this.receipts.read(), remote_listener_enabled: local?.endpoint_policy === 'https-required' });
  }

  private async privateKey(): Promise<string> {
    const [node, secret] = await Promise.all([this.requireLocalNode(), this.secret.read()]);
    if (!secret || secret.node_id !== node.node_id || secret.public_key_fingerprint !== node.key_fingerprint) throw new Error('Federation node private key binding is unavailable.');
    const key = await this.protector.open(secret.sealed_private_key);
    const publicKey = generateKeyPairPublic(key);
    if (keyFingerprint(publicKey) !== node.key_fingerprint) throw new Error('Federation node private key does not match its pinned public identity.');
    return key;
  }

  private async requireLocalNode(): Promise<FederationNodeIdentity> {
    const node = await this.localNode.read();
    if (!node || node.status === 'revoked') throw new Error('Federation node is not configured and active.');
    verifyNode(node);
    return node;
  }

  private async authorize(actor: { membership_id: string; human_proof_id: string; authority_credential_id: string }, organizationId: string, resource: string, action: string, power: string): Promise<void> {
    await this.authority.authorizeProtectedOperation({ organizationId, membershipId: actor.membership_id, humanProofId: actor.human_proof_id, authorityCredentialId: actor.authority_credential_id }, resource, action, power);
  }

  private assertActivePeer(peer: FederationPeer | undefined): void {
    if (!peer) throw new Error('FEDERATION_PEER_NOT_FOUND');
    if (peer.status !== 'active' && peer.status !== 'offline') throw new Error('FEDERATION_PEER_INACTIVE');
    if (new Date(peer.expires_at).getTime() <= this.clock().getTime()) throw new Error('FEDERATION_PEER_EXPIRED');
    if (peer.pinned_key_fingerprint !== peer.remote_node.key_fingerprint) throw new Error('FEDERATION_KEY_PIN_MISMATCH');
  }

  private async recordReceipt(envelope: FederationEnvelope, decision: 'accepted' | 'rejected', reasonCode: string): Promise<void> {
    const acknowledgement = envelope.payload.type === 'ack' ? {
      acknowledged_envelope_id: envelope.payload.acknowledged_envelope_id,
      acknowledgement_status: envelope.payload.status,
      ...(envelope.payload.output_ref ? { output_ref: envelope.payload.output_ref } : {}),
      ...(envelope.payload.output_hash ? { output_hash: envelope.payload.output_hash } : {})
    } : {};
    const receipt = federationEnvelopeReceiptSchema.parse({ receipt_id: `frcp_${randomUUID()}`, envelope_id: envelope.envelope_id, peer_id: envelope.peer_id, sender_node_id: envelope.sender_node_id, recipient_node_id: envelope.recipient_node_id, payload_type: envelope.payload.type, payload_hash: envelope.payload_hash, trace_id: envelope.trace_id, ...(envelope.task_id ? { task_id: envelope.task_id } : {}), ...acknowledgement, sequence: envelope.sequence, nonce: envelope.nonce, decision, reason_code: reasonCode, received_at: this.clock().toISOString() });
    await this.receipts.write([receipt, ...(await this.receipts.read())].slice(0, 500));
    await this.evidence.append({ trace_id: envelope.trace_id, actor: { type: 'system', id: 'h2a-federation-service' }, subject: { type: 'federation_envelope', id: envelope.envelope_id }, mandate_id: envelope.mandate_id, event_type: decision === 'accepted' ? 'FEDERATION_ENVELOPE_ACCEPTED' : 'FEDERATION_ENVELOPE_REJECTED', payload: { peer_id: envelope.peer_id, sender_node_id: envelope.sender_node_id, recipient_node_id: envelope.recipient_node_id, payload_type: envelope.payload.type, payload_hash: envelope.payload_hash, sequence: envelope.sequence, decision, reason_code: reasonCode, task_id: envelope.task_id, ...acknowledgement } });
    if (decision === 'accepted' && envelope.payload.type === 'heartbeat') await this.evidence.append({ trace_id: envelope.trace_id, actor: { type: 'system', id: envelope.sender_node_id }, subject: { type: 'federation_peer', id: envelope.peer_id }, event_type: 'FEDERATION_HEARTBEAT_RECORDED', payload: { sequence: envelope.sequence, received_at: receipt.received_at } });
  }

  private async recordPeerActivated(actorId: string, peer: FederationPeer, acceptance: FederationAcceptance, ceremony?: { ceremony_id: string; trace_id: string; idempotency_key: string }): Promise<void> {
    await this.evidence.append({ trace_id: ceremony?.trace_id ?? `tr_federation_${peer.peer_id}`, actor: { type: 'human', id: actorId }, subject: { type: 'federation_peer', id: peer.peer_id }, event_type: 'FEDERATION_PEER_ACTIVATED', payload: { invitation_id: peer.invitation_id, acceptance_id: acceptance.acceptance_id, local_node_id: peer.local_node_id, remote_node_id: peer.remote_node.node_id, remote_organization_id: peer.remote_node.organization_id, pinned_key_fingerprint: peer.pinned_key_fingerprint, pinned_tls_certificate_fingerprint: peer.pinned_tls_certificate_fingerprint, capabilities: peer.capabilities, maximum_context_fields: peer.maximum_context_fields, expires_at: peer.expires_at, ceremony_id: ceremony?.ceremony_id, idempotency_key: ceremony?.idempotency_key } });
  }

  private async refreshLifecycle(): Promise<void> {
    const now = this.clock().getTime();
    const invitations = await this.invitations.read();
    const local = await this.localNode.read();
    if (local) {
      const key = await this.privateKey();
      const nextInvitations = await Promise.all(invitations.map(async (item) => item.inviter_node.node_id === local.node_id && item.status === 'open' && new Date(item.expires_at).getTime() <= now ? signInvitation({ ...unsignedInvitation(item), status: 'expired' }, key) : item));
      if (JSON.stringify(nextInvitations) !== JSON.stringify(invitations)) await this.invitations.write(nextInvitations);
    }
    const peers = await this.peers.read();
    const nextPeers = peers.map((peer) => {
      if (peer.status === 'revoked' || peer.status === 'expired') return peer;
      if (new Date(peer.expires_at).getTime() <= now) return federationPeerSchema.parse({ ...peer, status: 'expired', updated_at: this.clock().toISOString() });
      const last = new Date(peer.last_heartbeat_at ?? peer.accepted_at).getTime();
      if (peer.status === 'active' && now - last > 90_000) return federationPeerSchema.parse({ ...peer, status: 'offline', updated_at: this.clock().toISOString() });
      return peer;
    });
    if (JSON.stringify(nextPeers) !== JSON.stringify(peers)) await this.peers.write(nextPeers);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function allCapabilities(): FederationCapability[] { return ['task.receive', 'context.receive', 'message.receive', 'heartbeat', 'ack', 'revocation']; }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function keyFingerprint(publicKeyPem: string): string { return `sha256:${createHash('sha256').update(publicKeyPem, 'utf8').digest('hex')}`; }
function generateKeyPairPublic(privateKeyPem: string): string { return createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString(); }

function signatureFor(value: unknown, privateKeyPem: string): string { return `ed25519:${sign(null, Buffer.from(canonicalize(value)), privateKeyPem).toString('base64')}`; }
function verifyRecord(value: unknown, signatureValue: string, publicKeyPem: string): boolean { return signatureValue.startsWith('ed25519:') && verify(null, Buffer.from(canonicalize(value)), publicKeyPem, Buffer.from(signatureValue.slice('ed25519:'.length), 'base64')); }

export function verifyFederationPairingRecord(value: unknown, canonicalHash: string, signatureValue: string, publicKeyPem: string): void {
  if (canonicalHash !== hashCanonical(value) || !verifyRecord(value, signatureValue, publicKeyPem)) throw new Error('FEDERATION_PAIRING_SIGNATURE_INVALID');
}
function signNode(unsigned: Omit<FederationNodeIdentity, 'canonical_hash' | 'node_signature'>, key: string): FederationNodeIdentity { return federationNodeIdentitySchema.parse({ ...unsigned, canonical_hash: hashCanonical(unsigned), node_signature: signatureFor(unsigned, key) }); }
function signInvitation(unsigned: Omit<FederationInvitation, 'canonical_hash' | 'node_signature'>, key: string): FederationInvitation { return federationInvitationSchema.parse({ ...unsigned, canonical_hash: hashCanonical(unsigned), node_signature: signatureFor(unsigned, key) }); }
function signRegistration(unsigned: Omit<FederationRegistration, 'canonical_hash' | 'node_signature'>, key: string): FederationRegistration { return federationRegistrationSchema.parse({ ...unsigned, canonical_hash: hashCanonical(unsigned), node_signature: signatureFor(unsigned, key) }); }
function signAcceptance(unsigned: Omit<FederationAcceptance, 'canonical_hash' | 'node_signature'>, key: string): FederationAcceptance { return federationAcceptanceSchema.parse({ ...unsigned, canonical_hash: hashCanonical(unsigned), node_signature: signatureFor(unsigned, key) }); }
function signEnvelopeRecord(unsigned: Omit<FederationEnvelope, 'canonical_hash' | 'sender_signature'>, key: string): FederationEnvelope { return federationEnvelopeSchema.parse({ ...unsigned, canonical_hash: hashCanonical(unsigned), sender_signature: signatureFor(unsigned, key) }); }

function verifyNode(node: FederationNodeIdentity): void { const unsigned = unsignedNode(node); if (node.key_fingerprint !== keyFingerprint(node.public_key_pem) || node.canonical_hash !== hashCanonical(unsigned) || !verifyRecord(unsigned, node.node_signature, node.public_key_pem)) throw new Error('Federation node identity signature or fingerprint is invalid.'); }
function verifyInvitation(value: FederationInvitation): void { const unsigned = unsignedInvitation(value); if (value.canonical_hash !== hashCanonical(unsigned) || !verifyRecord(unsigned, value.node_signature, value.inviter_node.public_key_pem)) throw new Error('Federation invitation signature is invalid.'); }
function verifyRegistration(value: FederationRegistration): void { const unsigned = unsignedRegistration(value); if (value.canonical_hash !== hashCanonical(unsigned) || !verifyRecord(unsigned, value.node_signature, value.joining_node.public_key_pem)) throw new Error('Federation registration signature is invalid.'); }
function verifyAcceptance(value: FederationAcceptance): void { const unsigned = unsignedAcceptance(value); if (value.canonical_hash !== hashCanonical(unsigned) || !verifyRecord(unsigned, value.node_signature, value.host_node.public_key_pem)) throw new Error('Federation acceptance signature is invalid.'); }

function unsignedNode(value: FederationNodeIdentity): Omit<FederationNodeIdentity, 'canonical_hash' | 'node_signature'> { const next: Partial<FederationNodeIdentity> = { ...value }; delete next.canonical_hash; delete next.node_signature; return next as Omit<FederationNodeIdentity, 'canonical_hash' | 'node_signature'>; }
function unsignedInvitation(value: FederationInvitation): Omit<FederationInvitation, 'canonical_hash' | 'node_signature'> { const next: Partial<FederationInvitation> = { ...value }; delete next.canonical_hash; delete next.node_signature; return next as Omit<FederationInvitation, 'canonical_hash' | 'node_signature'>; }
function unsignedRegistration(value: FederationRegistration): Omit<FederationRegistration, 'canonical_hash' | 'node_signature'> { const next: Partial<FederationRegistration> = { ...value }; delete next.canonical_hash; delete next.node_signature; return next as Omit<FederationRegistration, 'canonical_hash' | 'node_signature'>; }
function unsignedAcceptance(value: FederationAcceptance): Omit<FederationAcceptance, 'canonical_hash' | 'node_signature'> { const next: Partial<FederationAcceptance> = { ...value }; delete next.canonical_hash; delete next.node_signature; return next as Omit<FederationAcceptance, 'canonical_hash' | 'node_signature'>; }
function unsignedEnvelope(value: FederationEnvelope): Omit<FederationEnvelope, 'canonical_hash' | 'sender_signature'> { const next: Partial<FederationEnvelope> = { ...value }; delete next.canonical_hash; delete next.sender_signature; return next as Omit<FederationEnvelope, 'canonical_hash' | 'sender_signature'>; }

function peerFrom(peerId: string, invitationId: string, localNodeId: string, remote: FederationNodeIdentity, capabilities: FederationCapability[], maximumContextFields: number, acceptedAt: string, expiresAt: string): FederationPeer {
  return federationPeerSchema.parse({ schema_version: 2, peer_id: peerId, invitation_id: invitationId, local_node_id: localNodeId, remote_node: remote, pinned_key_fingerprint: remote.key_fingerprint, ...(remote.tls_certificate_fingerprint ? { pinned_tls_certificate_fingerprint: remote.tls_certificate_fingerprint } : {}), capabilities, maximum_context_fields: maximumContextFields, status: 'active', outbound_sequence: 0, inbound_sequence: 0, accepted_at: acceptedAt, expires_at: expiresAt, updated_at: acceptedAt });
}

function assertEndpoint(endpoint: string, remoteEnabled: boolean): void {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Federation endpoint must use HTTP or HTTPS.');
  if (url.username || url.password) throw new Error('Federation endpoint cannot contain credentials.');
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (!remoteEnabled && !loopback) throw new Error('Federation listener is loopback-only until secure remote enablement is explicit.');
  if (!loopback && url.protocol !== 'https:') throw new Error('Remote federation requires HTTPS.');
}

function capabilityFor(payload: FederatedPayload): FederationCapability { if (payload.type === 'task') return 'task.receive'; if (payload.type === 'governed-message') return 'message.receive'; return payload.type; }
function assertPayloadAllowed(peer: FederationPeer, payload: FederatedPayload): void {
  const required = capabilityFor(payload);
  if (!peer.capabilities.includes(required)) throw new Error('FEDERATION_CAPABILITY_DENIED');
  if (payload.type === 'task') {
    if (!peer.capabilities.includes('context.receive') && payload.context_field_names.length) throw new Error('FEDERATION_CONTEXT_CAPABILITY_DENIED');
    if (payload.context_field_names.length !== Object.keys(payload.context_projection).length || !payload.context_field_names.every((field) => Object.hasOwn(payload.context_projection, field))) throw new Error('FEDERATION_CONTEXT_FIELD_MISMATCH');
    if (hashCanonical(payload.context_projection) !== payload.projection_hash) throw new Error('FEDERATION_PROJECTION_HASH_INVALID');
  }
}

function assertNoCredentialMaterial(value: unknown): void {
  const forbiddenKey = /(password|passphrase|api[_-]?key|access[_-]?token|refresh[_-]?token|secret[_-]?key|private[_-]?key|credential)/iu;
  const visit = (item: unknown, key?: string): void => {
    if (key && forbiddenKey.test(key)) throw new Error('FEDERATION_CREDENTIAL_MATERIAL_DENIED');
    if (typeof item === 'string' && /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\b(?:sk|key)-[A-Za-z0-9_-]{16,}\b/u.test(item)) throw new Error('FEDERATION_CREDENTIAL_MATERIAL_DENIED');
    if (Array.isArray(item)) item.forEach((entry) => visit(entry));
    else if (item && typeof item === 'object') Object.entries(item as Record<string, unknown>).forEach(([name, entry]) => visit(entry, name));
  };
  visit(value);
}
