import { createServer } from 'node:net';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentIdentityState, AuthorityActor, ContextBrokerState, LeastContextState } from '@h2a/contracts';
import { hashCanonical, LocalAuthorityEventLedger } from '@h2a/evidence';
import { FederationOperatorCoordinator, FederationService } from '@h2a/federation';

const roots: string[] = [];
const coordinators: FederationOperatorCoordinator[] = [];

afterEach(async () => {
  await Promise.all(coordinators.splice(0).map((coordinator) => coordinator.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Phase 29 local two-node operator federation', () => {
  it('dispatches a Phase 49 work-graph task through the real pinned-peer transport', async () => {
    const [hostPort, friendPort] = await Promise.all([freePort(), freePort()]);
    const host = await node('org_host', 'HP Control Node', hostPort);
    const friend = await node('org_friend', 'Friend Agent Node', friendPort);
    const peerId = await handshake(host.service, friend.service);
    const hostCoordinator = coordinator(host, 'NEVER-RELEASE');
    const friendCoordinator = coordinator(friend, 'NEVER-RELEASE');
    coordinators.push(hostCoordinator, friendCoordinator);
    await Promise.all([hostCoordinator.initialize(), friendCoordinator.initialize()]);
    await Promise.all([
      hostCoordinator.startListener({ actor: actor(), ceremony: ceremony('host-work-graph-listener') }),
      friendCoordinator.startListener({ actor: actor(), ceremony: ceremony('friend-work-graph-listener') })
    ]);

    const result = await hostCoordinator.dispatchWorkGraphTask({
      actor: actor(), organization_id: 'org_host', peer_id: peerId, ceremony_id: 'phase49_goal', trace_id: 'tr_phase49_remote',
      task_id: 'project_assignment_remote', requestor_human_id: 'human_admin', assigned_agent_id: 'remote_agent', passport_id: 'remote_passport',
      runtime_attestation_id: 'remote_attestation', mandate_id: 'remote_mandate', context_grant_id: 'remote_zero_disclosure_grant',
      objective: 'Validate the approved storefront implementation on the paired node.', dependency_task_ids: ['project_assignment_implementation'],
      output_contract: { expected_outputs: ['Signed QA result'], protected_values: 'excluded' }, idempotency_key: 'phase49_remote_dispatch', expires_at: future(20)
    });

    expect(result.envelopeId).toMatch(/^fenv_/u);
    expect(result.acknowledgementId).toMatch(/^fenv_/u);
    expect((await friendCoordinator.getState()).last_received_task).toMatchObject({ task_id: 'project_assignment_remote' });
    const event = (await host.ledger.list()).find((item) => item.event_type === 'FEDERATION_ENVELOPE_ACCEPTED' && item.payload.operation === 'work-graph-task-dispatched');
    expect(event?.payload).toMatchObject({ task_id: 'project_assignment_remote', protected_values: 'excluded' });
    expect(await containsLiteral(host.root, 'NEVER-RELEASE')).toBe(false);
    expect(await containsLiteral(friend.root, 'NEVER-RELEASE')).toBe(false);
  });

  it('recovers a trusted peer after the heartbeat observation window expires', async () => {
    let now = new Date();
    const clock = () => new Date(now);
    const [hostPort, friendPort] = await Promise.all([freePort(), freePort()]);
    const host = await node('org_host', 'HP Control Node', hostPort, clock);
    const friend = await node('org_friend', 'Friend Agent Node', friendPort, clock);
    const peerId = await handshake(host.service, friend.service);
    const hostCoordinator = coordinator(host, 'RECOVERY-SECRET', clock);
    const friendCoordinator = coordinator(friend, 'RECOVERY-SECRET', clock);
    coordinators.push(hostCoordinator, friendCoordinator);
    await Promise.all([hostCoordinator.initialize(), friendCoordinator.initialize()]);
    await Promise.all([
      hostCoordinator.startListener({ actor: actor(), ceremony: ceremony('host-listener') }),
      friendCoordinator.startListener({ actor: actor(), ceremony: ceremony('friend-listener') })
    ]);

    now = new Date(now.getTime() + 91_000);
    expect((await host.service.getState()).peers[0].status).toBe('offline');
    expect((await friend.service.getState()).peers[0].status).toBe('offline');

    await expect(hostCoordinator.sendHeartbeat({ actor: actor(), peer_id: peerId, ceremony: ceremony('recover-heartbeat') })).resolves.toMatchObject({ last_outbound: { status: 'acknowledged', payload_type: 'heartbeat' } });
    expect((await host.service.getState()).peers[0].status).toBe('active');
    expect((await friend.service.getState()).peers[0].status).toBe('active');
  });

  it('exchanges a bounded task and proves replay, revocation, privacy, and restart persistence', async () => {
    const [hostPort, friendPort] = await Promise.all([freePort(), freePort()]);
    const host = await node('org_host', 'HP Control Node', hostPort);
    const friend = await node('org_friend', 'Friend Agent Node', friendPort);
    const peerId = await handshake(host.service, friend.service);

    const protectedMarker = 'RECOVERY-SECRET-MUST-NOT-PERSIST';
    const hostCoordinator = coordinator(host, protectedMarker);
    const friendCoordinator = coordinator(friend, protectedMarker);
    coordinators.push(hostCoordinator, friendCoordinator);
    await Promise.all([hostCoordinator.initialize(), friendCoordinator.initialize()]);
    await Promise.all([
      hostCoordinator.startListener({ actor: actor(), ceremony: ceremony('host-listener') }),
      friendCoordinator.startListener({ actor: actor(), ceremony: ceremony('friend-listener') })
    ]);

    const exchanged = await hostCoordinator.sendTask({ actor: actor(), peer_id: peerId, lane_id: 'gemini-antigravity', ceremony: ceremony('task') });
    expect(exchanged.last_outbound).toMatchObject({ peer_id: peerId, payload_type: 'task', status: 'acknowledged' });
    expect(exchanged.last_outbound?.acknowledgement_hash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect((await friendCoordinator.getState()).last_received_task).toMatchObject({ peer_id: peerId, task_id: 'assignment_phase29' });

    const replay = await hostCoordinator.proveReplay({ actor: actor(), ceremony: ceremony('replay') });
    expect(replay.replay_proof).toMatchObject({ blocked: true });
    expect(replay.replay_proof?.reason_code).toContain('REPLAY');

    await friendCoordinator.sendAcknowledgement({ actor: actor(), peer_id: peerId, ceremony: ceremony('ack') });
    await expect(friendCoordinator.sendHeartbeat({ actor: actor(), peer_id: peerId, ceremony: ceremony('heartbeat') })).resolves.toMatchObject({ last_outbound: { status: 'acknowledged', payload_type: 'heartbeat' } });

    await host.service.revokePeer({ actor: actor(), peer_id: peerId, reason_code: 'PHASE29_OPERATOR_REVOKED', ceremony: ceremony('revoke') });
    const revoked = await hostCoordinator.proveRevocation({ actor: actor(), peer_id: peerId, ceremony: ceremony('revocation-proof') });
    expect(revoked.revocation_proof).toMatchObject({ peer_id: peerId, blocked: true });

    expect(await containsLiteral(host.root, protectedMarker)).toBe(false);
    expect(await containsLiteral(friend.root, protectedMarker)).toBe(false);

    await hostCoordinator.close();
    const restarted = coordinator(host, protectedMarker);
    coordinators.push(restarted);
    const persisted = await restarted.initialize();
    expect(persisted.listener.status).toBe('stopped');
    expect(persisted.last_outbound?.payload_hash).toBe(exchanged.last_outbound?.payload_hash);
    expect(persisted.replay_proof?.blocked).toBe(true);
    expect(persisted.revocation_proof?.blocked).toBe(true);
    const events = await host.ledger.list();
    expect(events.some((event) => event.event_type === 'FEDERATION_ENVELOPE_ACCEPTED' && event.payload.operation === 'task-acknowledged')).toBe(true);
    expect(events.some((event) => event.event_type === 'FEDERATION_ENVELOPE_REJECTED' && event.payload.operation === 'replay-proof')).toBe(true);
  });
});

async function node(organizationId: string, displayName: string, port: number, clock: () => Date = () => new Date()) {
  const root = await mkdtemp(join(tmpdir(), `h2a-phase29-${organizationId}-`));
  roots.push(root);
  const ledger = new LocalAuthorityEventLedger(root);
  const service = new FederationService(root, ledger, authority(), protector(), clock);
  await service.initialize();
  await service.configureNode({ actor: actor(), organization_id: organizationId, display_name: displayName, endpoint: `http://127.0.0.1:${port}/h2a/federation/v2/envelopes`, remote_listener_enabled: false });
  return { root, ledger, service };
}

async function handshake(host: FederationService, friend: FederationService): Promise<string> {
  const invitation = (await host.createInvitation({ actor: actor(), invited_organization_id: 'org_friend', allowed_capabilities: ['task.receive', 'context.receive', 'message.receive', 'heartbeat', 'ack', 'revocation'], maximum_context_fields: 3, expires_at: future(20) })).invitations[0];
  const registration = (await friend.acceptInvitation({ actor: actor(), invitation, expected_inviter_key_fingerprint: invitation.inviter_node.key_fingerprint, requested_capabilities: invitation.allowed_capabilities })).registrations[0];
  const hostState = await host.approveRegistration({ actor: actor(), registration });
  await friend.activateAcceptance({ actor: actor(), acceptance: hostState.acceptances[0] });
  return hostState.peers[0].peer_id;
}

function coordinator(nodeValue: Awaited<ReturnType<typeof node>>, protectedMarker: string, clock: () => Date = () => new Date()): FederationOperatorCoordinator {
  return new FederationOperatorCoordinator(nodeValue.root, nodeValue.ledger, {
    federation: nodeValue.service,
    authority: authority(),
    organization: { signOrganizationRecord: async (value) => ({ canonicalHash: hashCanonical(value), signature: `ed25519:${Buffer.alloc(64).toString('base64')}` }) },
    agents: { getState: async () => identityState() },
    leastContext: { getState: async () => leastContextState(), renewGrant: async () => leastContextState() },
    context: {
      getState: async () => contextState(),
      authorize: async () => ({ authorized: true, reason_code: 'CONTEXT_GRANT_ACTIVE', granted_fields: { case_id: 'HP-29', recovery_secret: protectedMarker }, withheld_fields: [] })
    }
  }, clock);
}

function identityState(): AgentIdentityState {
  return { passports: [], bindings: [], providers: [], credentials: [], humanProofRequired: false, passportsV2: [{ passport_id: 'passport_phase29', agent_id: 'agent_phase29', sponsor_human_id: 'human_admin' }], runtimeSessions: [{ runtime_session_id: 'runtime_phase29', passport_id: 'passport_phase29', runtime_attestation_id: 'attestation_phase29' }] } as unknown as AgentIdentityState;
}
function leastContextState(): LeastContextState {
  return { lanes: [{ lane_id: 'gemini-antigravity', status: 'acknowledged', assignment_id: 'assignment_phase29', agent_id: 'agent_phase29', passport_id: 'passport_phase29', runtime_session_id: 'runtime_phase29', mandate_id: 'mandate_phase29', context_grant_id: 'grant_phase29', requested_fields: ['case_id', 'recovery_secret'] }] } as LeastContextState;
}
function contextState(): ContextBrokerState {
  return { artifacts: [], disclosures: [], messages: [], grants: [{ status: 'active', grant: { context_grant_id: 'grant_phase29', purpose: 'Share the bounded Phase 29 incident projection.', expires_at: future(20) } }] } as unknown as ContextBrokerState;
}
function authority() { return { authorizeProtectedOperation: async () => ({ humanId: 'human_admin', humanProofId: 'proof_admin' }) }; }
function protector() { return { seal: async (value: string) => Buffer.from(value).toString('base64'), open: async (value: string) => Buffer.from(value, 'base64').toString('utf8') }; }
function actor(): AuthorityActor { return { membership_id: 'membership_admin', human_proof_id: 'proof_admin', authority_credential_id: 'credential_admin' }; }
function ceremony(suffix: string) { return { ceremony_id: 'ceremony_phase29', trace_id: 'phase22_phase29_shared_trace', idempotency_key: `phase29_${suffix}` }; }
function future(minutes: number): string { return new Date(Date.now() + minutes * 60_000).toISOString(); }
async function freePort(): Promise<number> { return new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') { server.close(); reject(new Error('Could not allocate a loopback port.')); return; } server.close((error) => error ? reject(error) : resolve(address.port)); }); }); }
async function containsLiteral(root: string, literal: string): Promise<boolean> { for (const entry of await readdir(root, { withFileTypes: true })) { const path = join(root, entry.name); if (entry.isDirectory()) { if (await containsLiteral(path, literal)) return true; } else if ((await readFile(path)).includes(Buffer.from(literal))) return true; } return false; }
