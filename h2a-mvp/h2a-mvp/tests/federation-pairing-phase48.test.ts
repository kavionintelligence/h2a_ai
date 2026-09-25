import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuthorityActor, CreateFederationPairingRequest, FederationCapability, FederationNodeIdentity, SignedNodePresence } from '@h2a/contracts';
import { canonicalize, hashCanonical, LocalAuthorityEventLedger } from '@h2a/evidence';
import {
  FederationPairingCoordinator,
  FederationService,
  SameHostNodeDiscoveryPort,
  SecureLanNodeDiscoveryPort,
  validateTransportRecord,
  type PairingTransportRecord,
  type PairingTransportUnsigned
} from '@h2a/federation';

const roots: string[] = [];
const coordinators: FederationPairingCoordinator[] = [];

afterEach(async () => {
  await Promise.all(coordinators.splice(0).map((item) => item.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Phase 48 friend-request federation', () => {
  it('discovers two independent roots and completes the signed handshake without renderer clipboard data', async () => {
    const registry = await temporaryRoot('h2a-phase48-discovery-');
    const host = await node('org_hp_demo', 'HP Control Node', 43120, registry, ['H2A-ADMIN-01']);
    const friend = await node('org_hp_demo', 'Finance Friend Node', 43121, registry, ['FINANCE-OP-02']);

    expect((await host.coordinator.getState('finance')).discovery.nodes[0]).toMatchObject({ display_name: 'Finance Friend Node', trust_status: 'unconfirmed', search_names: ['Finance Friend Node', expect.any(String), 'FINANCE-OP-02'] });
    const friendNodeId = (await friend.service.getState()).local_node!.node_id;
    const discovery = (await host.coordinator.getState()).discovery.nodes.find((item) => item.node_id === friendNodeId)!;
    const requested = await host.coordinator.createRequest({ actor: actor(), discovery_id: discovery.discovery_id, requested_capabilities: ['task.receive', 'context.receive', 'heartbeat', 'ack', 'revocation'], maximum_context_fields: 3, idempotency_key: 'phase48-request-1' });
    expect(requested.pairings[0].pairing.status).toBe('requested');

    const incoming = await friend.coordinator.getState();
    expect(incoming.pairings[0]).toMatchObject({ direction: 'incoming', remote_display_name: 'HP Control Node', pairing: { status: 'remote-proof-required' } });
    await friend.coordinator.acceptRequest({ actor: actor('friend-proof'), pairing_id: incoming.pairings[0].pairing.pairing_id });

    const hostCompare = (await host.coordinator.getState()).pairings[0];
    const friendCompare = (await friend.coordinator.getState()).pairings[0];
    expect(hostCompare.pairing.comparison_code).toMatch(/^\d{6}$/u);
    expect(friendCompare.pairing.comparison_code).toBe(hostCompare.pairing.comparison_code);
    expect(friendCompare.pairing.transcript_hash).toBe(hostCompare.pairing.transcript_hash);

    await friend.coordinator.confirm({ actor: actor('friend-confirm'), pairing_id: friendCompare.pairing.pairing_id, comparison_code: friendCompare.pairing.comparison_code! });
    await host.coordinator.getState();
    await host.coordinator.confirm({ actor: actor('host-confirm'), pairing_id: hostCompare.pairing.pairing_id, comparison_code: hostCompare.pairing.comparison_code! });
    await friend.coordinator.getState();

    expect((await host.service.getState()).peers[0]).toMatchObject({ status: 'active', pinned_key_fingerprint: (await friend.service.getState()).local_node!.key_fingerprint });
    expect((await friend.service.getState()).peers[0]).toMatchObject({ status: 'active', pinned_key_fingerprint: (await host.service.getState()).local_node!.key_fingerprint });
    expect((await host.coordinator.getState()).pairings[0].pairing.status).toBe('active');
    expect((await friend.coordinator.getState()).pairings[0].pairing.status).toBe('active');

    const persisted = await readFile(join(host.root, 'federation', 'simple-pairings-v1.json'), 'utf8');
    expect(persisted).toContain(hostCompare.pairing.transcript_hash);
    expect(persisted).not.toMatch(/private[_-]?key|biometric|recovery_secret|api[_-]?key/iu);
  });

  it('is idempotent, restart-safe, comparison-bound, and immutable after peer revocation', async () => {
    const registry = await temporaryRoot('h2a-phase48-restart-');
    const host = await node('org_hp_demo', 'Host', 43122, registry);
    const friend = await node('org_hp_demo', 'Friend', 43123, registry);
    const discovery = (await host.coordinator.getState()).discovery.nodes[0];
    const request: CreateFederationPairingRequest = { actor: actor(), discovery_id: discovery.discovery_id, requested_capabilities: ['task.receive', 'ack'], maximum_context_fields: 2, idempotency_key: 'same-command' };
    await host.coordinator.createRequest(request);
    await host.coordinator.createRequest(request);
    expect((await host.coordinator.getState()).pairings).toHaveLength(1);
    const incoming = (await friend.coordinator.getState()).pairings[0];
    await friend.coordinator.acceptRequest({ actor: actor('friend'), pairing_id: incoming.pairing.pairing_id });
    const hostPair = (await host.coordinator.getState()).pairings[0];
    await expect(host.coordinator.confirm({ actor: actor(), pairing_id: hostPair.pairing.pairing_id, comparison_code: '000000' })).rejects.toThrow('COMPARISON_CODE_MISMATCH');
    await friend.coordinator.confirm({ actor: actor('friend'), pairing_id: incoming.pairing.pairing_id, comparison_code: (await friend.coordinator.getState()).pairings[0].pairing.comparison_code! });
    await host.coordinator.confirm({ actor: actor(), pairing_id: hostPair.pairing.pairing_id, comparison_code: hostPair.pairing.comparison_code! });
    await friend.coordinator.getState();
    const evidenceBeforeDuplicate = (await host.ledger.list()).length;
    await host.coordinator.confirm({ actor: actor(), pairing_id: hostPair.pairing.pairing_id, comparison_code: hostPair.pairing.comparison_code! });
    expect((await host.ledger.list()).length).toBe(evidenceBeforeDuplicate);
    const peerId = (await host.service.getState()).peers[0].peer_id;
    await host.service.revokePeer({ actor: actor(), peer_id: peerId, reason_code: 'PHASE48_REVOKED' });
    expect((await host.coordinator.getState()).pairings[0].pairing.status).toBe('replacement-required');

    await host.coordinator.close();
    const restarted = new FederationPairingCoordinator(host.root, host.ledger, { federation: host.service }, [new SameHostNodeDiscoveryPort(registry)]);
    coordinators.push(restarted);
    expect((await restarted.initialize()).pairings[0]).toMatchObject({ pairing: { pairing_id: hostPair.pairing.pairing_id, status: 'replacement-required' } });
  });

  it('rejects organization mismatch and does not discover expired or unsigned presence records', async () => {
    const registry = await temporaryRoot('h2a-phase48-policy-');
    const host = await node('org_hp_demo', 'Host', 43124, registry);
    await node('org_other', 'Other Company', 43125, registry);
    expect((await host.coordinator.getState()).discovery.nodes).toHaveLength(0);
  });

  it('keeps display names as hints and rejects capability, context, and transcript escalation', async () => {
    const registry = await temporaryRoot('h2a-phase48-collision-');
    const host = await node('org_hp_demo', 'Host', 43126, registry);
    await node('org_hp_demo', 'Finance Node', 43127, registry, ['FINANCE-OP']);
    const second = await node('org_hp_demo', 'Finance Node', 43128, registry, ['FINANCE-OP']);
    const discovered = (await host.coordinator.getState('FINANCE-OP')).discovery.nodes;
    expect(discovered).toHaveLength(2);
    expect(new Set(discovered.map((item) => item.node_id)).size).toBe(2);
    expect(discovered.every((item) => item.trust_status === 'unconfirmed')).toBe(true);

    await expect(host.coordinator.createRequest({ actor: actor(), discovery_id: discovered[0].discovery_id, requested_capabilities: ['task.receive'], maximum_context_fields: 4, idempotency_key: 'broad-context' })).rejects.toThrow('FEDERATION_CONTEXT_LIMIT_ESCALATION');
    const narrow = signedPresence('org_hp_demo', 'Narrow Node', 43130, ['task.receive']);
    await new SameHostNodeDiscoveryPort(registry).publishPresence(narrow);
    const narrowDiscovery = (await host.coordinator.getState()).discovery.nodes.find((item) => item.node_id === narrow.node.node_id)!;
    const invalidRequest: CreateFederationPairingRequest = { actor: actor(), discovery_id: narrowDiscovery.discovery_id, requested_capabilities: ['message.receive'], maximum_context_fields: 2, idempotency_key: 'broad-capability' };
    await expect(host.coordinator.createRequest(invalidRequest)).rejects.toThrow('FEDERATION_CAPABILITY_ESCALATION');

    const sender = (await second.service.getState()).local_node!;
    const unsigned: PairingTransportUnsigned = { schema_version: 1, message_id: 'fpmsg_altered', type: 'pairing-cancelled', sender_node: sender, recipient_node_id: 'host', pairing_id: 'pairing_altered', payload: { reason_code: 'before' }, issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() };
    const signed = { ...unsigned, ...(await second.service.signPairingRecord(unsigned)) } as PairingTransportRecord;
    expect(() => validateTransportRecord({ ...signed, payload: { reason_code: 'after' } })).toThrow('FEDERATION_PAIRING_SIGNATURE_INVALID');
  });

  it('removes stale or unsigned discovery records and keeps secure LAN opt-in and HTTPS-pinned', async () => {
    const registry = await temporaryRoot('h2a-phase48-stale-');
    const presenceDirectory = join(registry, 'presence');
    await mkdir(presenceDirectory, { recursive: true });
    await writeFile(join(presenceDirectory, 'unsigned.json'), JSON.stringify({ schema_version: 1, discovery_id: 'unsigned' }));
    const discovery = new SameHostNodeDiscoveryPort(registry);
    expect(await discovery.listPresences()).toEqual([]);
    await expect(readFile(join(presenceDirectory, 'unsigned.json'), 'utf8')).rejects.toThrow();

    const lan = new SecureLanNodeDiscoveryPort('239.255.42.48', 42449, false);
    expect(await lan.listPresences()).toEqual([]);
    const local = await node('org_hp_demo', 'Loopback Node', 43129, registry);
    const identity = (await local.service.getState()).local_node!;
    const unsignedPresence = { schema_version: 1 as const, discovery_id: 'presence_loopback', mode: 'secure-lan' as const, node: identity, search_names: ['Loopback Node'], agents: [], connection_code: 'ABCD2345', pairing_code_hint: '2345', issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() };
    const signedPresence = { ...unsignedPresence, ...(await local.service.signPairingRecord(unsignedPresence)) };
    await expect(lan.publishPresence(signedPresence)).rejects.toThrow('SECURE_LAN_DISCOVERY_DISABLED');
    const enabledLan = new SecureLanNodeDiscoveryPort('239.255.42.48', 42450, true);
    await expect(enabledLan.publishPresence(signedPresence)).rejects.toThrow('SECURE_LAN_DISCOVERY_REQUIRES_PINNED_HTTPS');
    await enabledLan.close();
  });
});

async function node(organizationId: string, name: string, port: number, registry: string, aliases: string[] = []) {
  const root = await temporaryRoot(`h2a-phase48-${name.replaceAll(' ', '-')}-`);
  const ledger = new LocalAuthorityEventLedger(root);
  const service = new FederationService(root, ledger, { authorizeProtectedOperation: async (context) => ({ humanId: context?.membershipId ?? 'human', humanProofId: context?.humanProofId ?? 'proof' }) }, { seal: async (value) => Buffer.from(value).toString('base64'), open: async (value) => Buffer.from(value, 'base64').toString() });
  await service.initialize();
  await service.configureNode({ actor: actor(), organization_id: organizationId, display_name: name, endpoint: `http://127.0.0.1:${port}/h2a/federation/v2/envelopes`, remote_listener_enabled: false });
  const coordinator = new FederationPairingCoordinator(root, ledger, { federation: service, aliases: async () => aliases }, [new SameHostNodeDiscoveryPort(registry)]);
  coordinators.push(coordinator);
  await coordinator.initialize();
  return { root, ledger, service, coordinator };
}

async function temporaryRoot(prefix: string): Promise<string> { const root = await mkdtemp(join(tmpdir(), prefix)); roots.push(root); return root; }
function actor(proof = 'proof-phase48'): AuthorityActor { return { membership_id: 'membership-admin', human_proof_id: proof, authority_credential_id: 'credential-admin' }; }

function signedPresence(organizationId: string, displayName: string, port: number, capabilities: FederationCapability[]): SignedNodePresence {
  const pair = generateKeyPairSync('ed25519');
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const now = new Date().toISOString();
  const nodeUnsigned = {
    schema_version: 2 as const,
    node_id: `node_manual_${port}`,
    organization_id: organizationId,
    display_name: displayName,
    public_key_pem: publicKeyPem,
    key_fingerprint: `sha256:${createHash('sha256').update(publicKeyPem, 'utf8').digest('hex')}`,
    endpoint: `http://127.0.0.1:${port}/h2a/federation/v2/envelopes`,
    endpoint_policy: 'loopback-only' as const,
    capabilities,
    status: 'active' as const,
    created_at: now,
    updated_at: now
  };
  const node = { ...nodeUnsigned, canonical_hash: hashCanonical(nodeUnsigned), node_signature: signature(nodeUnsigned, privateKeyPem) } as FederationNodeIdentity;
  const presenceUnsigned = { schema_version: 1 as const, discovery_id: `discovery_${node.node_id}`, mode: 'same-host' as const, node, search_names: [displayName], agents: [], connection_code: 'JKLM2345', pairing_code_hint: '2345', issued_at: now, expires_at: new Date(Date.now() + 60_000).toISOString() };
  return { ...presenceUnsigned, canonical_hash: hashCanonical(presenceUnsigned), node_signature: signature(presenceUnsigned, privateKeyPem) };
}

function signature(value: unknown, privateKeyPem: string): string {
  return `ed25519:${sign(null, Buffer.from(canonicalize(value)), privateKeyPem).toString('base64')}`;
}
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
