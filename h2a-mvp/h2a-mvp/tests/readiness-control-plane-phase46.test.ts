import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { H2AControlPlaneHost } from '@h2a/control-plane';
import { LocalAppearancePreferencesRepository } from '@h2a/storage';
import type { ControlPlaneAttachResponse, ControlPlaneCanonicalState, OfficeCommand, OperatorReadiness } from '@h2a/contracts';
import { phase34CanonicalState } from './fixtures/phase34-state';

const roots: string[] = [];
const now = new Date('2026-09-01T12:00:00.000Z');
const hash = (character: string) => `sha256:${character.repeat(64)}`;
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('Phase 46 readiness repair control plane', () => {
  it('deduplicates repair clicks, binds exact-purpose proof, refreshes automatically, and executes at most once', async () => {
    let state = repairableState();
    const calls: Array<{ command: string; generation: string; expected: OperatorReadiness }> = [];
    const proof = { proof_id: 'proof_phase46', human_id: 'human_admin', purpose: 'repair prerequisites for Claude control review', verified_at: now.toISOString(), expires_at: at(300) };
    const { host, owner } = await fixture(() => state, {
      humanProofResolver: { resolve: async (proofId) => proofId === proof.proof_id ? proof : null },
      repairExecutor: { execute: async (command, generation, expected) => {
        calls.push({ command, generation, expected });
        state = repairedState(state);
      } }
    });
    const before = await host.getSnapshot(lease(owner));
    const command = readiness(before, 'phase26.claude-code.run');
    expect(command.status).toBe('repairable');

    const first = await execute(host, owner, repairCommand(command, before));
    const duplicate = await execute(host, owner, repairCommand(command, before));
    expect(duplicate.human_proof_challenge?.challenge_id).toBe(first.human_proof_challenge?.challenge_id);
    expect(first.human_proof_challenge).toMatchObject({ human_id: 'human_admin', purpose: proof.purpose, status: 'pending' });

    const challenge = first.human_proof_challenge!;
    const completed = await execute(host, owner, { type: 'human-proof.complete', challenge_id: challenge.challenge_id, proof_id: proof.proof_id, source_route: challenge.source_route, source_mode: challenge.source_mode });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: command.command_id, generation: command.generation_hash });
    expect(readiness(completed, command.command_id).status).toBe('ready');
    await expect(execute(host, owner, { type: 'human-proof.complete', challenge_id: challenge.challenge_id, proof_id: proof.proof_id, source_route: challenge.source_route, source_mode: challenge.source_mode })).rejects.toThrow('HUMAN_PROOF_CHALLENGE_REPLAYED');

    const restarted = await restartedHost(() => state);
    const persisted = await restarted.host.getSnapshot(lease(restarted.owner));
    expect(readiness(persisted, command.command_id).status).toBe('ready');
    expect(persisted.human_proof_challenge).toBeNull();
  });

  it('rejects stale generations before proof and leaves failed continuations retryable', async () => {
    let state = repairableState();
    let fail = true;
    const proof = { proof_id: 'proof_retry', human_id: 'human_admin', purpose: 'repair prerequisites for Claude control review', verified_at: now.toISOString(), expires_at: at(300) };
    const { host, owner } = await fixture(() => state, {
      humanProofResolver: { resolve: async () => proof },
      repairExecutor: { execute: async () => {
        if (fail) throw new Error('PARTIAL_REPAIR_FAILED');
        state = repairedState(state);
      } }
    });
    const snapshot = await host.getSnapshot(lease(owner));
    const command = readiness(snapshot, 'phase26.claude-code.run');
    state.organization.credentials[0]!.credential_id = 'credential_replaced_elsewhere';
    await host.refresh('external-change');
    await expect(execute(host, owner, repairCommand(command, snapshot))).rejects.toThrow('READINESS_GENERATION_STALE');

    state = repairableState();
    await host.refresh('restore-repairable');
    const current = await host.getSnapshot(lease(owner));
    const currentCommand = readiness(current, 'phase26.claude-code.run');
    const challenged = await execute(host, owner, repairCommand(currentCommand, current));
    const challenge = challenged.human_proof_challenge!;
    await expect(execute(host, owner, { type: 'human-proof.complete', challenge_id: challenge.challenge_id, proof_id: proof.proof_id, source_route: challenge.source_route, source_mode: challenge.source_mode })).rejects.toThrow('PARTIAL_REPAIR_FAILED');
    expect((await host.getSnapshot(lease(owner))).human_proof_challenge?.status).toBe('pending');

    fail = false;
    const retried = await execute(host, owner, { type: 'human-proof.complete', challenge_id: challenge.challenge_id, proof_id: proof.proof_id, source_route: challenge.source_route, source_mode: challenge.source_mode });
    expect(readiness(retried, currentCommand.command_id).status).toBe('ready');
  });
});

async function fixture(load: () => ControlPlaneCanonicalState, options: ConstructorParameters<typeof H2AControlPlaneHost>[2]) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase46-')); roots.push(root);
  const host = new H2AControlPlaneHost({ load: async () => load() }, new LocalAppearancePreferencesRepository(root, () => now), { hostInstanceId: `host_${roots.length}`, clock: () => now, ...options });
  await host.initialize();
  const owner = host.attach({ client_id: `renderer_${roots.length}`, protocol_version: 1, requested_capabilities: ['workspace.observe', 'workspace.refresh', 'workspace.control', 'appearance.read', 'appearance.write', 'human-proof.challenge'] });
  return { host, owner, root };
}
async function restartedHost(load: () => ControlPlaneCanonicalState) { return fixture(load, {}); }
function lease(value: ControlPlaneAttachResponse) { return { host_instance_id: value.host_instance_id, lease_id: value.lease_id, client_id: value.client_id, generation: value.connection.generation }; }
function execute(host: H2AControlPlaneHost, attachment: ControlPlaneAttachResponse, command: OfficeCommand) { return host.execute({ ...lease(attachment), command }); }
function readiness(snapshot: Awaited<ReturnType<H2AControlPlaneHost['getSnapshot']>>, commandId: string) { return snapshot.readiness.commands.find((item) => item.command_id === commandId)!; }
function repairCommand(command: OperatorReadiness, snapshot: Awaited<ReturnType<H2AControlPlaneHost['getSnapshot']>>): Extract<OfficeCommand, { type: 'readiness.repair' }> {
  return { type: 'readiness.repair', readiness_id: command.readiness_id, expected_generation_hash: command.generation_hash, source_route: 'command-floor', source_mode: snapshot.appearance.presentation_mode, source_scroll_y: 240, source_focus_id: 'phase26-run' };
}

function repairableState(): ControlPlaneCanonicalState {
  const state = phase34CanonicalState();
  const expiring = at(300); const future = at(3_600); const past = at(-3_600);
  state.guided_bootstrap.humans = [{ human_id: 'human_admin', display_name: 'Varun', membership_id: 'membership_admin', enrollment_id: 'enrollment_admin', token_set_size: 20, required_matches: 1, model_set_hash: hash('1'), proof_id: 'proof_existing', proof_expires_at: future, proof_status: 'fresh', assurance_level: 'substantial' }];
  state.organization.memberships = [{ schema_version: 2, membership_id: 'membership_admin', organization_id: 'org_hp_demo', human_id: 'human_admin', employee_id: 'H2A-ADMIN-01', department: 'Security', role_ids: ['role_admin'], status: 'active', effective_from: past, effective_until: future, updated_at: past }];
  state.organization.credentials = [{ schema_version: 2, credential_id: 'credential_admin', organization_id: 'org_hp_demo', membership_id: 'membership_admin', role_ids: ['role_admin'], resource_constraints: ['repository'], action_constraints: ['review'], approval_policy_ids: ['policy_1'], issued_at: past, expires_at: expiring, status: 'active', canonical_hash: hash('2'), organization_signature: 'ed25519:test' }];
  state.agent_identity.passportsV2 = [{ schema_version: 2, passport_id: 'passport_claude', agent_id: 'agent_claude', organization_id: 'org_hp_demo', sponsor_human_id: 'human_admin', sponsor_membership_id: 'membership_admin', issuance_human_proof_id: 'proof_existing', issuance_authority_credential_id: 'credential_admin', connector_manifest_id: 'connector_claude-code_v1', name: 'Claude Reviewer', role: 'Control reviewer', purpose: 'Review bounded enterprise controls.', risk_tier: 'restricted', capabilities: ['review'], workload_public_key: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----', status: 'active', issued_at: past, expires_at: future, canonical_hash: hash('3'), organization_signature: 'ed25519:test' }];
  state.agent_identity.bindings = [{ binding_id: 'binding_claude', agent_id: 'agent_claude', display_name: 'Claude Reviewer', role: 'Control reviewer', provider: 'claude-code', model: 'subscription', cwd: 'C:\\workspace', status: 'idle', connection_state: 'connected', current_action: 'Awaiting work', progress: 0, live_session_id: 'session_claude', created_at: past, last_seen_at: now.toISOString() }];
  state.agent_identity.attestations = [{ schema_version: 2, attestation_id: 'attestation_claude', passport_id: 'passport_claude', connector_manifest_id: 'connector_claude-code_v1', provider: 'claude-code', adapter_version: '1.0.0', session_public_key: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----', challenge_nonce: 'nonce_phase46', challenge_signature: 'ed25519:test', trust_mode: 'connected-observed', trust_evidence_refs: [], issued_at: past, expires_at: expiring, canonical_hash: hash('4'), organization_signature: 'ed25519:test' }];
  state.agent_identity.runtimeSessions = [{ schema_version: 2, runtime_session_id: 'session_claude', passport_id: 'passport_claude', connector_manifest_id: 'connector_claude-code_v1', runtime_attestation_id: 'attestation_claude', trust_mode: 'connected-observed', state: 'ready', started_at: past, last_seen_at: now.toISOString(), evidence_refs: [] }];
  state.mandates.mandates = [{ mandateId: 'mandate_claude', version: 1, depth: 0, issuer: { humanId: 'human_admin', humanProofId: 'proof_existing' }, subject: { agentId: 'agent_claude', passportId: 'passport_claude' }, objective: 'Review bounded enterprise control evidence.', resources: ['repository'], actions: ['review'], prohibitedActions: [], limits: { parameterEquals: {} }, disclosure: { allowedFields: ['case_id'] }, approvals: { requiredActions: ['publish'] }, delegation: { allowed: false, allowedAgentIds: [], maxDepth: 0 }, issuedAt: past, expiresAt: expiring, status: 'active', signature: { algorithm: 'Ed25519', signedBy: 'human_admin', canonicalHash: hash('5'), value: 'ed25519:test' } }];
  state.collaboration.workplace.assignments = [{ id: 'assignment_claude', title: 'Control review', objective: 'Review bounded enterprise control evidence.', status: 'queued', assigneeId: 'binding_claude', mandateId: 'mandate_claude', risk: 'restricted', priority: 3, dependsOn: [], requestedAction: 'review', updatedAt: now.toISOString(), responseCount: 0, messageCount: 0 }];
  state.real_collaboration.lanes[0] = { ...state.real_collaboration.lanes[0]!, status: 'ready', health: 'ready', detail: 'Official provider is ready.', agent_id: 'agent_claude', passport_id: 'passport_claude', binding_id: 'binding_claude', runtime_session_id: 'session_claude', mandate_id: 'mandate_claude', assignment_id: 'assignment_claude' };
  return state;
}

function repairedState(input: ControlPlaneCanonicalState): ControlPlaneCanonicalState {
  const state = structuredClone(input); const future = at(3_600);
  state.organization.credentials[0]!.expires_at = future;
  state.agent_identity.attestations![0]!.expires_at = future;
  state.mandates.mandates[0]!.expiresAt = future;
  return state;
}
function at(seconds: number) { return new Date(now.getTime() + seconds * 1_000).toISOString(); }
