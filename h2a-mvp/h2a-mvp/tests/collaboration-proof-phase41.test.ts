import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { H2AControlPlaneHost } from '@h2a/control-plane';
import { LocalAppearancePreferencesRepository } from '@h2a/storage';
import type { ControlPlaneAttachRequest, ControlPlaneAttachResponse, ControlPlaneCanonicalState, OfficeCommand } from '@h2a/contracts';
import { phase34CanonicalState } from './fixtures/phase34-state';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('Phase 41 truthful collaboration and in-place Human Proof', () => {
  it('projects real provider, least-context, approval, federation, and runtime records without protected values', async () => {
    const state = phase41State();
    const { host, owner } = await fixture(state);
    const snapshot = await host.getSnapshot(lease(owner));

    expect(snapshot.office.collaboration.signals.map((signal) => signal.kind)).toEqual(expect.arrayContaining(['provider-run', 'governed-message', 'least-context-handoff', 'approval-route', 'federation-envelope']));
    const handoff = snapshot.office.collaboration.signals.find((signal) => signal.kind === 'least-context-handoff');
    expect(handoff).toMatchObject({ released_fields: ['case_id', 'system_name'], withheld_fields: ['owner_email', 'control_summary', 'recovery_secret'], predecessor_hashes: [`sha256:${'2'.repeat(64)}`] });
    expect(snapshot.office.collaboration.portals[0]).toMatchObject({ state: 'replay-blocked', maximum_context_fields: 3 });
    expect(snapshot.office.entities.some((entity) => entity.kind === 'runtime-session' && entity.primary_id === 'terminal_phase41')).toBe(true);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('NEVER-PERSIST-PHASE41-SECRET');
    expect(serialized).not.toContain('owner@example.test');
    expect(serialized).not.toContain('provider response body');
  });

  it('binds a real proof to exact human, purpose, route, mode, command, and freshness', async () => {
    let now = new Date('2026-08-31T09:00:00.000Z');
    const proofs = new Map<string, { proof_id: string; human_id: string; purpose: string; verified_at: string; expires_at: string }>();
    const { host, owner } = await fixture(phase34CanonicalState(), {
      clock: () => now,
      leaseDurationMs: 60 * 60 * 1000,
      humanProofResolver: { resolve: async (proofId) => proofs.get(proofId) ?? null }
    });
    const requested = await execute(host, owner, proofRequest());
    const challenge = requested.human_proof_challenge!;
    proofs.set('proof_wrong', proof('proof_wrong', 'human_wrong', challenge.purpose, now));
    await expect(execute(host, owner, complete(challenge, 'proof_wrong'))).rejects.toThrow('HUMAN_PROOF_BINDING_MISMATCH');

    proofs.set('proof_stale', { ...proof('proof_stale', challenge.human_id, challenge.purpose, now), verified_at: '2026-08-31T08:59:59.000Z' });
    await expect(execute(host, owner, complete(challenge, 'proof_stale'))).rejects.toThrow('HUMAN_PROOF_STALE');

    proofs.set('proof_good', proof('proof_good', challenge.human_id, challenge.purpose, now));
    await expect(execute(host, owner, { ...complete(challenge, 'proof_good'), source_route: 'federation' })).rejects.toThrow('HUMAN_PROOF_SOURCE_BINDING_MISMATCH');
    const verified = await execute(host, owner, complete(challenge, 'proof_good'));
    expect(verified.human_proof_challenge).toMatchObject({ status: 'verified', proof_id: 'proof_good', version: 2 });
    await expect(execute(host, owner, complete(challenge, 'proof_good'))).rejects.toThrow('HUMAN_PROOF_CHALLENGE_REPLAYED');

    const dismissed = await execute(host, owner, { type: 'human-proof.dismiss', challenge_id: challenge.challenge_id });
    expect(dismissed.human_proof_challenge).toBeNull();
    now = new Date('2026-08-31T09:06:00.000Z');
    const expired = await execute(host, owner, proofRequest({ command: 'expired-command' }));
    now = new Date('2026-08-31T09:12:00.000Z');
    await expect(execute(host, owner, complete(expired.human_proof_challenge!, 'proof_good'))).rejects.toThrow(/HUMAN_PROOF_CHALLENGE_(EXPIRED|SUPERSEDED)/u);
  });

  it('deduplicates and queues challenges, fails closed on cancel, and preserves them across renderer reattachment', async () => {
    const { host, owner } = await fixture(phase34CanonicalState());
    const first = await execute(host, owner, proofRequest());
    const duplicate = await execute(host, owner, proofRequest());
    expect(duplicate.human_proof_challenge?.challenge_id).toBe(first.human_proof_challenge?.challenge_id);
    expect(duplicate.cursor).toBe(first.cursor);

    await execute(host, owner, proofRequest({ human_id: 'human_employee_002', purpose: 'approve protected action', command: 'approval.decide' }));
    const reattached = host.attach(attach('renderer_owner'));
    const restored = await host.getSnapshot(lease(reattached));
    expect(restored.human_proof_challenge?.challenge_id).toBe(first.human_proof_challenge?.challenge_id);
    const afterCancel = await execute(host, reattached, { type: 'human-proof.cancel', challenge_id: first.human_proof_challenge!.challenge_id });
    expect(afterCancel.human_proof_challenge).toMatchObject({ human_id: 'human_employee_002', command: 'approval.decide' });
  });

  it('runs explicitly allowed non-sensitive continuations at most once and requires confirmation for sensitive effects', async () => {
    const calls: string[] = [];
    const proofs = new Map<string, ReturnType<typeof proof>>();
    const now = new Date('2026-08-31T10:00:00.000Z');
    const { host, owner } = await fixture(phase34CanonicalState(), {
      clock: () => now,
      humanProofResolver: { resolve: async (proofId) => proofs.get(proofId) ?? null },
      continuationExecutor: { execute: async (operationKey) => { calls.push(operationKey); } }
    });
    const nonSensitive = await execute(host, owner, proofRequest({ continuation_mode: 'exact-once', continuation_operation_key: 'refresh-canonical', sensitivity: 'non-sensitive' }));
    proofs.set('proof_auto', proof('proof_auto', 'human_employee_001', 'administer protected context', now));
    await execute(host, owner, complete(nonSensitive.human_proof_challenge!, 'proof_auto'));
    expect(calls).toEqual(['refresh-canonical']);
    await expect(execute(host, owner, complete(nonSensitive.human_proof_challenge!, 'proof_auto'))).rejects.toThrow();

    await execute(host, owner, { type: 'human-proof.dismiss', challenge_id: nonSensitive.human_proof_challenge!.challenge_id });
    const sensitive = await execute(host, owner, proofRequest({ command: 'approval.resume', continuation_mode: 'exact-once', continuation_operation_key: 'resume-protected-effect', sensitivity: 'sensitive-confirm' }));
    proofs.set('proof_sensitive', proof('proof_sensitive', 'human_employee_001', 'administer protected context', now));
    await execute(host, owner, complete(sensitive.human_proof_challenge!, 'proof_sensitive'));
    expect(calls).toEqual(['refresh-canonical']);
    await execute(host, owner, { type: 'human-proof.continue', challenge_id: sensitive.human_proof_challenge!.challenge_id, source_route: 'context-broker', source_mode: 'office' });
    expect(calls).toEqual(['refresh-canonical', 'resume-protected-effect']);
    await expect(execute(host, owner, { type: 'human-proof.continue', challenge_id: sensitive.human_proof_challenge!.challenge_id, source_route: 'context-broker', source_mode: 'office' })).rejects.toThrow('HUMAN_PROOF_CONTINUATION_REPLAYED');
  });

  it('keeps observers read-only, exposes truthful transports, and replays challenge events without duplicates', async () => {
    const { host, owner } = await fixture(phase41State());
    const observer = host.attach({ client_id: 'observer', protocol_version: 1, requested_capabilities: ['workspace.observe', 'human-proof.challenge'] });
    const observed = await host.getSnapshot(lease(observer));
    expect(observed.operator_session).toMatchObject({ status: 'read-only', attached_observers: 2, input_owner_client_id: 'renderer_owner' });
    expect(observed.transports.filter((item) => item.status === 'enabled').map((item) => item.kind)).toEqual(['electron-ipc', 'loopback-a2a']);
    expect(observed.transports.filter((item) => item.status === 'disabled')).toHaveLength(3);
    await expect(execute(host, observer, proofRequest())).rejects.toThrow('CONTROL_PLANE_INPUT_OWNER_REQUIRED');

    const before = (await host.getSnapshot(lease(owner))).cursor;
    const requested = await execute(host, owner, proofRequest());
    const replay = host.replay({ ...lease(owner), after_cursor: before });
    expect(replay.mode).toBe('events');
    if (replay.mode === 'events') expect(replay.events.filter((event) => event.kind === 'human-proof-changed')).toHaveLength(1);
    expect(requested.notifications.filter((item) => item.kind === 'human-proof')).toHaveLength(1);
  });
});

async function fixture(state: ControlPlaneCanonicalState, options: ConstructorParameters<typeof H2AControlPlaneHost>[2] = {}) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase41-')); roots.push(root);
  const host = new H2AControlPlaneHost({ load: async () => state }, new LocalAppearancePreferencesRepository(root, options.clock), { hostInstanceId: 'phase41_host', ...options });
  await host.initialize();
  const owner = host.attach(attach('renderer_owner'));
  return { host, owner };
}

function attach(client_id: string): ControlPlaneAttachRequest {
  return { client_id, protocol_version: 1, requested_capabilities: ['workspace.observe', 'workspace.refresh', 'workspace.control', 'appearance.read', 'appearance.write', 'human-proof.challenge'] };
}
function lease(value: ControlPlaneAttachResponse) { return { host_instance_id: value.host_instance_id, lease_id: value.lease_id, client_id: value.client_id, generation: value.connection.generation }; }
function execute(host: H2AControlPlaneHost, attachment: ControlPlaneAttachResponse, command: OfficeCommand) { return host.execute({ ...lease(attachment), command }); }
function proofRequest(overrides: Partial<Extract<OfficeCommand, { type: 'human-proof.request' }>> = {}): Extract<OfficeCommand, { type: 'human-proof.request' }> {
  return { type: 'human-proof.request', human_id: 'human_employee_001', purpose: 'administer protected context', command: 'context.issue-grant', source_route: 'context-broker', source_mode: 'office', source_scroll_y: 420, source_focus_id: 'issue-grant', continuation_mode: 'refresh-only', continuation_operation_key: null, sensitivity: 'non-sensitive', ...overrides };
}
function complete(challenge: NonNullable<Awaited<ReturnType<H2AControlPlaneHost['getSnapshot']>>['human_proof_challenge']>, proof_id: string): Extract<OfficeCommand, { type: 'human-proof.complete' }> {
  return { type: 'human-proof.complete', challenge_id: challenge.challenge_id, proof_id, source_route: challenge.source_route, source_mode: challenge.source_mode };
}
function proof(proof_id: string, human_id: string, purpose: string, now: Date) { return { proof_id, human_id, purpose, verified_at: now.toISOString(), expires_at: new Date(now.getTime() + 300_000).toISOString() }; }

function phase41State(): ControlPlaneCanonicalState {
  const state = phase34CanonicalState();
  state.real_collaboration = { ...state.real_collaboration, ceremony_id: 'ceremony_phase41', trace_id: 'trace_phase41', status: 'succeeded', lanes: state.real_collaboration.lanes.map((lane, index) => ({ ...lane, status: 'succeeded', agent_id: `agent_${lane.lane_id}`, passport_id: `passport_${lane.lane_id}`, binding_id: `binding_${lane.lane_id}`, runtime_session_id: `runtime_${lane.lane_id}`, mandate_id: `mandate_${lane.lane_id}`, assignment_id: `assignment_${lane.lane_id}`, run_id: `run_${lane.lane_id}`, output_hash: `sha256:${String(index + 1).repeat(64)}`, dependency_output_hashes: index === 0 ? [] : [`sha256:${String(index).repeat(64)}`], completed_at: '2026-08-31T08:20:00.000Z' })) };
  state.least_context = { ...state.least_context, ceremony_id: 'ceremony_phase41', trace_id: 'trace_phase41', status: 'succeeded', artifact_id: 'artifact_phase41', lanes: state.least_context.lanes.map((lane, index) => index === 0 ? { ...lane, status: 'acknowledged', agent_id: 'agent_claude', passport_id: 'passport_claude', runtime_session_id: 'runtime_claude', mandate_id: 'mandate_claude', assignment_id: 'assignment_claude', context_grant_id: 'grant_claude', requested_fields: ['case_id', 'system_name', 'owner_email', 'control_summary', 'recovery_secret'], released_fields: ['case_id', 'system_name'], withheld_fields: ['owner_email', 'control_summary', 'recovery_secret'], disclosure_id: 'disclosure_phase41', delivery_id: 'delivery_phase41', handoff_message_id: 'message_phase41', projection_hash: `sha256:${'1'.repeat(64)}`, output_hash: `sha256:${'3'.repeat(64)}`, predecessor_hashes: [`sha256:${'2'.repeat(64)}`], projected_tokens: 12, use_count: 1, execution_kind: 'official-provider-cli', provider_output_hash: `sha256:${'4'.repeat(64)}` } : lane) };
  state.context_broker.messages = [{ message_id: 'governed_message_phase41', organization_id: 'org_hp_demo', task_id: 'assignment_claude', trace_id: 'trace_phase41', sender_connector_manifest_id: 'connector_claude', recipient_connector_manifest_id: 'connector_codex', sender_passport_id: 'passport_claude', recipient_passport_id: 'passport_codex', mandate_id: 'mandate_claude', context_grant_id: 'grant_claude', speech_act: 'handoff', content_ref: 'phase41-projection-reference', content_hash: `sha256:${'a'.repeat(64)}`, sequence: 1, deduplication_id: 'dedupe_phase41', status: 'delivered', created_at: '2026-08-31T08:21:00.000Z', expires_at: '2026-08-31T08:26:00.000Z', sender_signature: `ed25519:${'A'.repeat(88)}` }];
  state.approvals.requests = [{ schema_version: 2, approval_request_id: 'approval_phase41', organization_id: 'org_hp_demo', task_id: 'assignment_claude', requesting_human_id: 'human_employee_001', requesting_agent_id: 'agent_claude', mandate_id: 'mandate_claude', required_resource: 'findings', required_action: 'publish', requested_effect_hash: `sha256:${'5'.repeat(64)}`, review_context_grant_id: 'grant_review', approval_policy_id: 'policy_phase41', eligible_membership_ids: ['membership_employee_002'], status: 'pending', requested_at: '2026-08-31T08:22:00.000Z', expires_at: '2026-08-31T08:27:00.000Z' }];
  state.federation.peers = [{ schema_version: 2, peer_id: 'peer_phase41', invitation_id: 'invite_phase41', local_node_id: 'node_a', remote_node: { schema_version: 2, node_id: 'node_b', organization_id: 'org_hp_demo', display_name: 'HP Finance Node', public_key_pem: `-----BEGIN PUBLIC KEY-----\n${'A'.repeat(44)}\n-----END PUBLIC KEY-----`, key_fingerprint: `sha256:${'6'.repeat(64)}`, endpoint: 'http://127.0.0.1:43121/h2a/federation/v2/envelopes', endpoint_policy: 'loopback-only', capabilities: ['task.receive'], status: 'active', created_at: '2026-08-31T08:00:00.000Z', updated_at: '2026-08-31T08:00:00.000Z', canonical_hash: `sha256:${'7'.repeat(64)}`, node_signature: `ed25519:${'A'.repeat(88)}` }, pinned_key_fingerprint: `sha256:${'6'.repeat(64)}`, capabilities: ['task.receive'], maximum_context_fields: 3, status: 'active', outbound_sequence: 4, inbound_sequence: 3, accepted_at: '2026-08-31T08:00:00.000Z', expires_at: '2026-09-01T08:00:00.000Z', updated_at: '2026-08-31T08:25:00.000Z' }];
  state.federation.receipts = [{ receipt_id: 'receipt_phase41', envelope_id: 'envelope_phase41', peer_id: 'peer_phase41', sender_node_id: 'node_b', recipient_node_id: 'node_a', payload_type: 'task', payload_hash: `sha256:${'8'.repeat(64)}`, trace_id: 'trace_phase41', task_id: 'assignment_claude', sequence: 3, nonce: 'nonce_phase41', decision: 'accepted', reason_code: 'ACCEPTED', received_at: '2026-08-31T08:25:00.000Z' }];
  state.federation_operator = { ...state.federation_operator, ceremony_id: 'ceremony_phase41', trace_id: 'trace_phase41', replay_proof: { envelope_id: 'envelope_replay', blocked: true, reason_code: 'FEDERATION_SEQUENCE_REPLAY' } };
  state.runtime_attachment.sessions = [{ session_id: 'terminal_phase41', run_id: 'run_terminal_phase41', provider: 'claude-code', transport: 'interactive-pty', purpose: 'interactive-session', agent_id: 'agent_claude', passport_id: 'passport_claude', binding_id: 'binding_claude', runtime_session_id: 'runtime_claude', mandate_id: 'mandate_claude', trace_id: 'trace_phase41', workspace_path: 'C:\\workspace', argument_policy: [], configuration_scope: 'agent-isolated', trust_mode: 'connected-observed', status: 'running', process_id: 4242, cols: 100, rows: 28, first_cursor: 0, last_cursor: 4, output_hash: `sha256:${'9'.repeat(64)}`, started_at: '2026-08-31T08:30:00.000Z', updated_at: '2026-08-31T08:30:00.000Z' }];
  return state;
}
