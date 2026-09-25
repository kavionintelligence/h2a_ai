import { createHash, generateKeyPairSync, sign, X509Certificate } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuthorityActor, FederatedPayload, FederationEnvelope, FederationState, TaskEnvelope } from '@h2a/contracts';
import { canonicalize, hashCanonical, LocalAuthorityEventLedger } from '@h2a/evidence';
import { FederationHttpClient, FederationHttpServer, FederationService } from '@h2a/federation';

const roots: string[] = [];
const servers: FederationHttpServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.close())); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('Phase 20 multi-node friend-agent federation', () => {
  it('pins independent node keys and exchanges only a bounded signed task projection', async () => {
    const pair = await pairedNodes();
    expect(pair.hostState.local_node!.key_fingerprint).not.toBe(pair.friendState.local_node!.key_fingerprint);
    expect(pair.hostState.peers[0]).toMatchObject({ peer_id: pair.peerId, status: 'active', pinned_key_fingerprint: pair.friendState.local_node!.key_fingerprint, capabilities: ['task.receive', 'context.receive', 'heartbeat', 'ack', 'revocation'] });

    const hidden = 'ORG-WIDE-PAYROLL-SECRET-2048';
    const task = signedTask(pair.organization.privateKeyPem);
    const payload: FederatedPayload = { type: 'task', task, context_projection: { supplier_name: 'Acme' }, context_field_names: ['supplier_name'], projection_hash: hashCanonical({ supplier_name: 'Acme' }) };
    const outbound = await pair.host.signEnvelope(pair.peerId, payload, { traceId: task.trace_id, taskId: task.task_id, mandateId: task.mandate_id, contextGrantId: task.context_grant_id });
    const accepted = await pair.friend.receiveEnvelope(outbound);
    expect(accepted.payload).toMatchObject({ type: 'task', context_projection: { supplier_name: 'Acme' }, context_field_names: ['supplier_name'] });
    expect(JSON.stringify(accepted)).not.toContain(hidden);
    const friendPublic = JSON.stringify(await pair.friend.getState());
    expect(friendPublic).not.toContain('Acme');
    expect(friendPublic).not.toContain(hidden);
    expect(await containsLiteral(pair.friendRoot, hidden)).toBe(false);
    expect(await containsLiteral(pair.friendRoot, 'Acme')).toBe(false);

    const ack = await pair.friend.signEnvelope(pair.peerId, { type: 'ack', acknowledged_envelope_id: outbound.envelope_id, status: 'completed', received_context_fields: ['supplier_name'], output_ref: 'friend-agent-output', output_hash: hashCanonical({ result: 'reviewed' }), reason_code: 'TASK_COMPLETED' }, { traceId: task.trace_id, taskId: task.task_id, mandateId: task.mandate_id, contextGrantId: task.context_grant_id });
    await expect(pair.host.receiveEnvelope(ack)).resolves.toMatchObject({ payload: { type: 'ack', status: 'completed' } });
    expect((await pair.host.getState()).receipts[0]).toMatchObject({ payload_type: 'ack', decision: 'accepted', acknowledged_envelope_id: outbound.envelope_id, acknowledgement_status: 'completed', output_ref: 'friend-agent-output', output_hash: ack.payload.type === 'ack' ? ack.payload.output_hash : undefined });
    expect((await pair.friend.getState()).receipts[0]).toMatchObject({ payload_type: 'task', payload_hash: outbound.payload_hash, decision: 'accepted' });
  });

  it('rejects pin mismatch, invitation replay, envelope replay, forgery, credentials, and revoked peers', async () => {
    const host = await node('org_host', 'Host Node', 'http://127.0.0.1:40101/h2a/federation/v2/envelopes');
    const friend = await node('org_friend', 'Friend Node', 'http://127.0.0.1:40102/h2a/federation/v2/envelopes');
    const invitationState = await host.service.createInvitation({ actor: actor(), allowed_capabilities: ['task.receive', 'context.receive', 'heartbeat', 'ack', 'revocation'], maximum_context_fields: 2, expires_at: future(10) });
    const invitation = invitationState.invitations[0];
    await expect(friend.service.acceptInvitation({ actor: actor(), invitation, expected_inviter_key_fingerprint: hashCanonical('wrong-pin'), requested_capabilities: ['task.receive'] })).rejects.toThrow('fingerprint');
    const registrationState = await friend.service.acceptInvitation({ actor: actor(), invitation, expected_inviter_key_fingerprint: invitation.inviter_node.key_fingerprint, requested_capabilities: ['task.receive', 'context.receive', 'heartbeat', 'ack', 'revocation'] });
    const registration = registrationState.registrations[0];
    const approved = await host.service.approveRegistration({ actor: actor(), registration });
    await friend.service.activateAcceptance({ actor: actor(), acceptance: approved.acceptances[0] });
    await expect(host.service.approveRegistration({ actor: actor(), registration })).rejects.toThrow('Open matching');

    const task = signedTask(keyPair().privateKeyPem);
    const envelope = await host.service.signEnvelope(approved.peers[0].peer_id, { type: 'task', task, context_projection: { supplier_name: 'Acme' }, context_field_names: ['supplier_name'], projection_hash: hashCanonical({ supplier_name: 'Acme' }) }, { traceId: task.trace_id, taskId: task.task_id, mandateId: task.mandate_id, contextGrantId: task.context_grant_id });
    await friend.service.receiveEnvelope(envelope);
    await expect(friend.service.receiveEnvelope(envelope)).rejects.toThrow('REPLAY');
    const forged: FederationEnvelope = { ...envelope, envelope_id: 'forged-envelope', sequence: envelope.sequence + 1, nonce: 'forged-nonce', payload: { ...envelope.payload, context_projection: { supplier_name: 'Tampered' } } as FederatedPayload };
    await expect(friend.service.receiveEnvelope(forged)).rejects.toThrow(/HASH|SIGNATURE/u);
    await expect(host.service.signEnvelope(approved.peers[0].peer_id, { type: 'task', task, context_projection: { api_key: 'key-1234567890abcdefghijklmnop' }, context_field_names: ['api_key'], projection_hash: hashCanonical({ api_key: 'key-1234567890abcdefghijklmnop' }) }, { traceId: task.trace_id, taskId: task.task_id, mandateId: task.mandate_id, contextGrantId: task.context_grant_id })).rejects.toThrow('CREDENTIAL');
    await host.service.revokePeer({ actor: actor(), peer_id: approved.peers[0].peer_id, reason_code: 'OPERATOR_REVOKED' });
    await expect(host.service.signEnvelope(approved.peers[0].peer_id, { type: 'heartbeat', sent_at: new Date().toISOString() }, { traceId: 'trace_revoked' })).rejects.toThrow('INACTIVE');
  });

  it('persists replay defense across restart and records signed heartbeats', async () => {
    const pair = await pairedNodes();
    const heartbeat = await pair.host.signEnvelope(pair.peerId, { type: 'heartbeat', sent_at: new Date().toISOString() }, { traceId: 'trace_heartbeat' });
    await pair.friend.receiveEnvelope(heartbeat);
    const restarted = new FederationService(pair.friendRoot, pair.friendLedger, authority(), protector());
    await restarted.initialize();
    await expect(restarted.receiveEnvelope(heartbeat)).rejects.toThrow('REPLAY');
    const state = await restarted.getState();
    expect(state.peers[0]).toMatchObject({ inbound_sequence: 1, status: 'active' });
    expect(state.receipts.some((receipt) => receipt.payload_type === 'heartbeat' && receipt.decision === 'accepted')).toBe(true);
    expect((await pair.friendLedger.list()).some((event) => event.event_type === 'FEDERATION_HEARTBEAT_RECORDED')).toBe(true);
  });

  it('uses bounded TLS transport with certificate pinning and enforces secure remote endpoint policy', async () => {
    const certificate = await readFile(join(process.cwd(), 'tests', 'fixtures', 'federation-loopback-cert.pem'), 'utf8');
    const privateKey = await readFile(join(process.cwd(), 'tests', 'fixtures', 'federation-loopback-key.pem'), 'utf8');
    const certificatePin = `sha256:${createHash('sha256').update(new X509Certificate(certificate).raw).digest('hex')}`;
    const friendRoot = await temporaryRoot('h2a-federation-http-friend-');
    const friendLedger = new LocalAuthorityEventLedger(friendRoot);
    const friend = new FederationService(friendRoot, friendLedger, authority(), protector());
    await friend.initialize();
    const server = new FederationHttpServer(friend, async (envelope) => ({ type: 'ack', acknowledged_envelope_id: envelope.envelope_id, status: 'completed', received_context_fields: envelope.payload.type === 'task' ? envelope.payload.context_field_names : [], output_ref: 'friend-runtime-result', output_hash: hashCanonical({ completed: true }), reason_code: 'REMOTE_AGENT_COMPLETED' }), { tls: { cert: certificate, key: privateKey } });
    servers.push(server);
    const endpoint = await server.start();
    await friend.configureNode({ actor: actor(), organization_id: 'org_friend', display_name: 'Friend TLS Node', endpoint, tls_certificate_fingerprint: certificatePin, remote_listener_enabled: false });

    const host = await node('org_host', 'Host Node', 'http://127.0.0.1:40103/h2a/federation/v2/envelopes');
    const pair = await handshake(host.service, friend);
    const task = signedTask(keyPair().privateKeyPem);
    const envelope = await host.service.signEnvelope(pair.peerId, { type: 'task', task, context_projection: { risk_tier: 'low' }, context_field_names: ['risk_tier'], projection_hash: hashCanonical({ risk_tier: 'low' }) }, { traceId: task.trace_id, taskId: task.task_id, mandateId: task.mandate_id, contextGrantId: task.context_grant_id });
    await expect(new FederationHttpClient(host.service, { endpoint, expectedTlsCertificateFingerprint: `sha256:${'0'.repeat(64)}` }).exchange(envelope)).rejects.toThrow('pin mismatch');
    const response = await new FederationHttpClient(host.service, { endpoint, expectedTlsCertificateFingerprint: certificatePin }).exchange(envelope);
    expect(response.payload).toMatchObject({ type: 'ack', status: 'completed', received_context_fields: ['risk_tier'] });
    await expect(host.service.configureNode({ actor: actor(), organization_id: 'org_host', display_name: 'Unsafe Remote', endpoint: 'http://192.0.2.10:8080/h2a/federation/v2/envelopes', remote_listener_enabled: false })).rejects.toThrow('loopback-only');
    expect(() => new FederationHttpClient(host.service, { endpoint: 'http://192.0.2.10:8080/h2a/federation/v2/envelopes' })).toThrow('HTTPS');
  });
});

async function pairedNodes() {
  const host = await node('org_host', 'Host Node', 'http://127.0.0.1:40001/h2a/federation/v2/envelopes');
  const friend = await node('org_friend', 'Friend Node', 'http://127.0.0.1:40002/h2a/federation/v2/envelopes');
  const handshakeState = await handshake(host.service, friend.service);
  return { host: host.service, friend: friend.service, hostState: handshakeState.hostState, friendState: handshakeState.friendState, peerId: handshakeState.peerId, hostRoot: host.root, friendRoot: friend.root, hostLedger: host.ledger, friendLedger: friend.ledger, organization: keyPair() };
}

async function handshake(host: FederationService, friend: FederationService): Promise<{ hostState: FederationState; friendState: FederationState; peerId: string }> {
  const invitationState = await host.createInvitation({ actor: actor(), invited_organization_id: 'org_friend', allowed_capabilities: ['task.receive', 'context.receive', 'heartbeat', 'ack', 'revocation'], maximum_context_fields: 3, expires_at: future(10) });
  const invitation = invitationState.invitations[0];
  const registrationState = await friend.acceptInvitation({ actor: actor(), invitation, expected_inviter_key_fingerprint: invitation.inviter_node.key_fingerprint, requested_capabilities: ['task.receive', 'context.receive', 'heartbeat', 'ack', 'revocation'] });
  const hostState = await host.approveRegistration({ actor: actor(), registration: registrationState.registrations[0] });
  const friendState = await friend.activateAcceptance({ actor: actor(), acceptance: hostState.acceptances[0] });
  return { hostState, friendState, peerId: hostState.peers[0].peer_id };
}

async function node(organizationId: string, name: string, endpoint: string) {
  const root = await temporaryRoot(`h2a-federation-${organizationId}-`);
  const ledger = new LocalAuthorityEventLedger(root);
  const service = new FederationService(root, ledger, authority(), protector());
  await service.initialize();
  await service.configureNode({ actor: actor(), organization_id: organizationId, display_name: name, endpoint, remote_listener_enabled: false });
  return { root, ledger, service };
}

function authority() { return { authorizeProtectedOperation: async () => ({ humanId: 'human_admin', humanProofId: 'proof_admin' }) }; }
function protector() { return { seal: async (value: string) => Buffer.from(value).toString('base64'), open: async (value: string) => Buffer.from(value, 'base64').toString('utf8') }; }
function actor(): AuthorityActor { return { membership_id: 'membership_admin', human_proof_id: 'proof_admin', authority_credential_id: 'credential_admin' }; }
function future(minutes: number): string { return new Date(Date.now() + minutes * 60_000).toISOString(); }
function keyPair() { const pair = generateKeyPairSync('ed25519'); return { publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }; }
function signedTask(privateKeyPem: string): TaskEnvelope { const now = new Date(); const unsigned = { schema_version: 2 as const, task_id: 'task_federated_supplier', organization_id: 'org_host', trace_id: 'trace_federation_20', requestor_human_id: 'human_admin', assigned_agent_id: 'friend_agent', passport_id: 'passport_friend_agent', runtime_attestation_id: 'attestation_friend_agent', mandate_id: 'mandate_federated_supplier', context_grant_id: 'grant_federated_supplier', objective: 'Review the bounded supplier record.', dependency_task_ids: [], output_contract: { type: 'object' }, sequence: 1, idempotency_key: 'idem_federation_20', issued_at: now.toISOString(), expires_at: new Date(now.getTime() + 60_000).toISOString() }; return { ...unsigned, canonical_hash: hashCanonical(unsigned), organization_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), privateKeyPem).toString('base64')}` }; }
async function temporaryRoot(prefix: string): Promise<string> { const root = await mkdtemp(join(tmpdir(), prefix)); roots.push(root); return root; }
async function containsLiteral(root: string, literal: string): Promise<boolean> { for (const entry of await readdir(root, { withFileTypes: true })) { const path = join(root, entry.name); if (entry.isDirectory()) { if (await containsLiteral(path, literal)) return true; } else if ((await readFile(path)).includes(Buffer.from(literal))) return true; } return false; }
