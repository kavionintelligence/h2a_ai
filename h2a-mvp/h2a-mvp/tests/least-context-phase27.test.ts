import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContextBrokerState, GovernedAgentMessage, TaskEnvelope } from '@h2a/contracts';
import { LeastContextCoordinator } from '@h2a/agents';
import { hashCanonical, LocalAuthorityEventLedger } from '@h2a/evidence';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('Phase 27 least-context collaboration', () => {
  it('binds four distinct grants, ordered projections, signed handoffs, and a durable revocation denial', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2a-phase27-')); roots.push(root);
    const fixture = fixturePorts();
    const coordinator = new LeastContextCoordinator(root, new LocalAuthorityEventLedger(root), fixture.ports, { seal: async (value) => Buffer.from(value).toString('base64'), open: async (value) => Buffer.from(value, 'base64').toString() }, process.cwd());
    await coordinator.initialize();
    const ceremony = { ceremony_id: 'ceremony_phase27', trace_id: 'phase22_trace_phase27', idempotency_key: 'phase27_prepare' };
    const prepared = await coordinator.prepare({ actor: { membership_id: 'membership_admin', human_proof_id: 'proof_admin', authority_credential_id: 'credential_admin' }, ceremony, artifact_name: 'Real protected incident record', source_resource: 'operator-entered', fields: { case_id: 'INC-2701', system_name: 'Payment control plane', owner_email: 'owner@example.test', control_summary: 'Privileged recovery requires two-person approval.', recovery_secret: 'NEVER-PERSIST-THIS-SECRET' } });
    expect(prepared.status).toBe('ready');
    expect(prepared.lanes.map((lane) => lane.context_grant_id)).toHaveLength(4);
    expect(new Set(prepared.lanes.map((lane) => JSON.stringify(lane.transformations))).size).toBe(1); // transformations are populated by disclosures, not preparation
    expect(fixture.grants.map((grant) => grant.field_rules.map((rule) => `${rule.field}:${rule.transformation}`).join('|'))).toEqual([
      'case_id:value|system_name:value', 'case_id:value|owner_email:mask', 'case_id:value|control_summary:summarize', 'case_id:value|recovery_secret:reference'
    ]);

    let state = prepared;
    for (const lane of prepared.lanes) state = await coordinator.runLane({ ceremony: { ...ceremony, idempotency_key: `phase27_run_${lane.lane_id}` }, lane_id: lane.lane_id });
    expect(state.status).toBe('succeeded');
    expect(state.lanes.every((lane) => lane.status === 'acknowledged' && lane.disclosure_id && lane.delivery_id && lane.handoff_message_id)).toBe(true);
    expect(state.lanes.every((lane) => lane.released_fields.length === 2 && lane.withheld_fields.length === 3 && lane.projected_tokens === 14)).toBe(true);
    expect(fixture.tasks.map((task) => task.output_contract.predecessor_hashes)).toEqual([
      [hash('phase26-0')],
      [hash('phase26-0'), hash('phase26-1'), hash('phase27-0')],
      [hash('phase26-0'), hash('phase26-1'), hash('phase26-2'), hash('phase27-0'), hash('phase27-1')],
      [hash('phase26-0'), hash('phase26-1'), hash('phase26-2'), hash('phase26-3'), hash('phase27-0'), hash('phase27-1'), hash('phase27-2')]
    ]);
    expect(JSON.stringify(state)).not.toContain('NEVER-PERSIST-THIS-SECRET');

    const revoked = await coordinator.proveRevocation({ actor: { membership_id: 'membership_admin', human_proof_id: 'proof_admin', authority_credential_id: 'credential_admin' }, ceremony: { ...ceremony, idempotency_key: 'phase27_revoke' }, lane_id: 'claude-code' });
    expect(revoked.status).toBe('revocation-proved');
    expect(revoked.revocation).toMatchObject({ reason_code: 'CONTEXT_GRANT_REVOKED', provider_launch_blocked: true, passed: true });
    expect(fixture.deliveries).toBe(4);

    fixture.phase26Lanes[0].mandate_id = 'mandate_rotated_0';
    const renewed = await coordinator.renewGrant({ actor: { membership_id: 'membership_admin', human_proof_id: 'proof_admin', authority_credential_id: 'credential_admin' }, ceremony: { ...ceremony, idempotency_key: 'phase29_renew_claude' }, lane_id: 'claude-code' });
    expect(renewed.lanes[0].context_grant_id).not.toBe(revoked.lanes[0].context_grant_id);
    expect(fixture.context.grants.at(-1)).toMatchObject({ status: 'active', use_count: 0, grant: { task_id: 'assignment_0', mandate_id: 'mandate_rotated_0', recipient_agent_id: 'agent_0', recipient_passport_id: 'passport_0', purpose: 'review authorized incident controls', allowed_fields: ['case_id', 'system_name'] } });
    expect(renewed.lanes[0]).toMatchObject({ assignment_id: 'assignment_0', mandate_id: 'mandate_rotated_0' });
    expect(revoked.revocation).toMatchObject({ context_grant_id: revoked.lanes[0].context_grant_id, passed: true });

    const restored = new LeastContextCoordinator(root, new LocalAuthorityEventLedger(root), fixture.ports, { seal: async (value) => Buffer.from(value).toString('base64'), open: async (value) => Buffer.from(value, 'base64').toString() }, process.cwd());
    expect(await restored.initialize()).toEqual(renewed);
  });

  it('reuses an exact hash-matching artifact after an interrupted preparation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2a-phase27-retry-')); roots.push(root);
    const fixture = fixturePorts();
    fixture.context.artifacts.push({ artifact_id: 'artifact_phase27', organization_id: 'org_hp_demo', name: 'Real protected incident record', source_resource: 'operator-entered', owner_human_id: 'human_admin', fields: [
      ['case_id', 'internal', 'INC-2701'], ['system_name', 'internal', 'Payment control plane'], ['owner_email', 'confidential', 'owner@example.test'], ['control_summary', 'confidential', 'Privileged recovery requires two-person approval.'], ['recovery_secret', 'restricted', 'NEVER-PERSIST-THIS-SECRET']
    ].map(([field, classification, value]) => ({ field: field!, classification: classification as never, value_hash: hashCanonical(value) })), encrypted_payload_ref: 'sealed', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), canonical_hash: hash('artifact'), organization_signature: `ed25519:${'A'.repeat(88)}` });
    const coordinator = new LeastContextCoordinator(root, new LocalAuthorityEventLedger(root), fixture.ports, { seal: async (value) => Buffer.from(value).toString('base64'), open: async (value) => Buffer.from(value, 'base64').toString() }, process.cwd());
    await coordinator.initialize();
    await coordinator.prepare({ actor: { membership_id: 'membership_admin', human_proof_id: 'proof_admin', authority_credential_id: 'credential_admin' }, ceremony: { ceremony_id: 'ceremony_phase27', trace_id: 'phase22_trace_phase27', idempotency_key: 'phase27_retry' }, artifact_name: 'Real protected incident record', source_resource: 'operator-entered', fields: { case_id: 'INC-2701', system_name: 'Payment control plane', owner_email: 'owner@example.test', control_summary: 'Privileged recovery requires two-person approval.', recovery_secret: 'NEVER-PERSIST-THIS-SECRET' } });

    expect(fixture.context.artifacts).toHaveLength(1);
    expect(fixture.context.grants).toHaveLength(4);
  });

  it('re-seals protected context, rotates connector authority, and revokes predecessor grants', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2a-phase27-recovery-')); roots.push(root);
    const fixture = fixturePorts();
    const coordinator = new LeastContextCoordinator(root, new LocalAuthorityEventLedger(root), fixture.ports, { seal: async (value) => `current:${Buffer.from(value).toString('base64')}`, open: async (value) => Buffer.from(value.replace(/^current:/u, ''), 'base64').toString() }, process.cwd());
    await coordinator.initialize();
    const ceremony = { ceremony_id: 'ceremony_phase27', trace_id: 'phase22_trace_phase27', idempotency_key: 'phase27_prepare' };
    const fields = { case_id: 'INC-2701-R', system_name: 'Recovered control plane', owner_email: 'owner@example.test', control_summary: 'Recovered least-context material.', recovery_secret: 'RECOVERED-SECRET' };
    const prepared = await coordinator.prepare({ actor: actor(), ceremony, artifact_name: 'Protected recovery record', source_resource: 'operator-reentered', fields });
    const recovered = await coordinator.prepare({ actor: actor(), ceremony: { ...ceremony, idempotency_key: 'phase27_recover' }, recovery_mode: true, artifact_name: 'Protected recovery record', source_resource: 'operator-reentered', fields });

    expect(recovered.artifact_id).not.toBe(prepared.artifact_id);
    expect(recovered.status).toBe('ready');
    expect(recovered.lanes.every((lane) => lane.status === 'ready' && lane.context_grant_id)).toBe(true);
    expect(fixture.context.grants.slice(0, 4).every((grant) => grant.status === 'revoked')).toBe(true);
    expect(fixture.context.grants.slice(4).every((grant) => grant.status === 'active' && grant.grant.artifact_refs.includes(recovered.artifact_id!))).toBe(true);
    expect((await new LocalAuthorityEventLedger(root).list()).some((event) => event.event_type === 'LEAST_CONTEXT_WORKFLOW_PREPARED' && event.payload.recovery_mode === true && event.payload.superseded_artifact_id === prepared.artifact_id)).toBe(true);
    expect((await coordinator.runLane({ ceremony: { ...ceremony, idempotency_key: 'phase27_recovered_run' }, lane_id: 'claude-code' })).lanes[0].status).toBe('acknowledged');
  });
});

function fixturePorts() {
  const laneIds = ['claude-code', 'gemini-antigravity', 'framework', 'openai-codex'] as const;
  const participants = laneIds.map((lane, index) => ({ lane, name: lane, provider: lane === 'framework' ? 'custom-cli' : lane, agent_id: `agent_${index}`, binding_id: `binding_${index}`, passport_id: `passport_${index}`, runtime_session_id: `session_${index}`, status: 'ready', blocker: null }));
  const phase26Lanes = laneIds.map((lane_id, index) => ({ lane_id, title: lane_id, provider: lane_id === 'framework' ? 'custom-cli' : lane_id, status: 'succeeded', health: 'ready', detail: 'Succeeded', agent_id: `agent_${index}`, passport_id: `passport_${index}`, binding_id: `binding_${index}`, runtime_session_id: `session_${index}`, mandate_id: `mandate_${index}`, assignment_id: `assignment_${index}`, run_id: `run_${index}`, output_hash: hash(`phase26-${index}`), dependency_output_hashes: [], started_at: new Date().toISOString(), completed_at: new Date().toISOString(), error: null }));
  const context: ContextBrokerState = { artifacts: [], grants: [], disclosures: [], messages: [] };
  const grants: Array<{ field_rules: Array<{ field: string; transformation: string }> }> = [];
  const tasks: TaskEnvelope[] = [];
  let deliveries = 0;
  let queuedTask: TaskEnvelope | undefined;
  const governedSequences = new Map<string, number>();
  const ports = {
    bootstrap: { getState: async () => ({ schema_version: 1, ceremony_id: 'ceremony_phase27', trace_id: 'phase22_trace_phase27', status: 'complete', administrator_human_id: 'human_admin', operator_human_id: 'human_operator', humans: [], organization_id: 'org_hp_demo', authority_credential_ids: [], participants, mandate_ids: [], assignment_ids: phase26Lanes.map((lane) => lane.assignment_id), steps: [], last_error: null, updated_at: new Date().toISOString() }) as never },
    realCollaboration: { getState: async () => ({ schema_version: 1, ceremony_id: 'ceremony_phase27', trace_id: 'phase22_trace_phase27', status: 'succeeded', workspace_path: process.cwd(), framework_kind: 'mcp', lanes: phase26Lanes, completed_idempotency_keys: [], last_error: null, updated_at: new Date().toISOString() }) as never },
    agents: { getState: async () => ({ passportsV2: participants.map((item, index) => ({ passport_id: item.passport_id, agent_id: item.agent_id, organization_id: 'org_hp_demo', sponsor_human_id: index ? 'human_operator' : 'human_admin', status: 'active' })), runtimeSessions: participants.map((item, index) => ({ runtime_session_id: item.runtime_session_id, runtime_attestation_id: `attestation_${index}` })) }) as never },
    organization: { signOrganizationRecord: async (value: unknown) => ({ canonicalHash: hashCanonical(value), signature: `ed25519:${'A'.repeat(88)}` }), getOrganizationPublicKey: async () => 'public-key' },
    ceremony: { assertBinding: async () => undefined },
    context: {
      getState: async () => context,
      createArtifact: async (request: { organization_id: string; name: string; source_resource: string; fields: Array<{ field: string; classification: string; value: unknown }> }) => { const artifactId = `artifact_phase27_${context.artifacts.length}`; context.artifacts.push({ artifact_id: artifactId, organization_id: request.organization_id, name: request.name, source_resource: request.source_resource, owner_human_id: 'human_admin', fields: request.fields.map((field) => ({ field: field.field, classification: field.classification as never, value_hash: hashCanonical(field.value) })), encrypted_payload_ref: `sealed_${artifactId}`, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), canonical_hash: hash(artifactId), organization_signature: `ed25519:${'A'.repeat(88)}` }); return context; },
      issueGrant: async (request: { task_id: string; mandate_id: string; recipient_agent_id: string; recipient_passport_id: string; purpose: string; field_rules: Array<{ artifact_id: string; field: string; maximum_classification: string; transformation: string }>; token_budget: number; maximum_uses: number; expires_at: string }) => { const id = `grant_${context.grants.length}`; grants.push(request); context.grants.push({ grant: { schema_version: 2, context_grant_id: id, organization_id: 'org_hp_demo', task_id: request.task_id, mandate_id: request.mandate_id, recipient_agent_id: request.recipient_agent_id, recipient_passport_id: request.recipient_passport_id, purpose: request.purpose, allowed_fields: request.field_rules.map((rule) => rule.field), artifact_refs: [...new Set(request.field_rules.map((rule) => rule.artifact_id))], transformations: request.field_rules.map((rule) => rule.transformation === 'value' ? 'filter' : rule.transformation) as never, withheld_field_hashes: [], token_budget: request.token_budget, issued_at: new Date().toISOString(), expires_at: request.expires_at, canonical_hash: hash(id), organization_signature: `ed25519:${'A'.repeat(88)}` }, field_rules: request.field_rules as never, status: 'active', maximum_uses: request.maximum_uses, use_count: 0, updated_at: new Date().toISOString(), canonical_hash: hash(`${id}-record`), organization_signature: `ed25519:${'A'.repeat(88)}` }); return context; },
      updateGrant: async (request: { context_grant_id: string }) => { const grant = context.grants.find((item) => item.grant.context_grant_id === request.context_grant_id)!; grant.status = 'revoked'; return context; },
      authorize: async (task: TaskEnvelope, request: { context_grant_id: string; requested_fields: string[]; purpose?: string }) => { const grant = context.grants.find((item) => item.grant.context_grant_id === request.context_grant_id)!; const denied = grant.status === 'revoked'; const rules = grant.field_rules; const released = denied ? [] : rules.map((rule) => rule.field); const withheld = request.requested_fields.filter((field) => !released.includes(field)); const disclosure = { disclosure_id: `disclosure_${context.disclosures.length}`, organization_id: 'org_hp_demo', context_grant_id: request.context_grant_id, task_id: task.task_id, mandate_id: task.mandate_id, recipient_agent_id: task.assigned_agent_id, recipient_passport_id: task.passport_id, purpose: request.purpose ?? grant.grant.purpose, requested_fields: request.requested_fields, granted_fields: released, withheld_fields: withheld, transformation_by_field: Object.fromEntries(rules.map((rule) => [rule.field, rule.transformation])), disclosed_value_hashes: [], withheld_value_hashes: [], projection_hash: hash(`projection-${context.disclosures.length}`), reason_code: denied ? 'CONTEXT_GRANT_REVOKED' : 'CONTEXT_GRANT_ACTIVE', status: denied ? 'denied' : 'authorized', idempotency_key: hashCanonical({ task: task.task_id, count: context.disclosures.length }), disclosed_at: new Date().toISOString(), canonical_hash: hash(`disclosure-${context.disclosures.length}`), organization_signature: `ed25519:${'A'.repeat(88)}` }; context.disclosures.unshift(disclosure as never); if (!denied) grant.use_count += 1; return { authorized: !denied, reason_code: disclosure.reason_code, granted_fields: denied ? {} : Object.fromEntries(released.map((field) => [field, 'projected'])), withheld_fields: withheld }; }
    },
    connectors: { import: async () => undefined },
    messages: {
      enqueue: async (task: TaskEnvelope) => { queuedTask = task; tasks.push(task); return { delivery_id: `delivery_${tasks.length}` } as never; },
      deliver: async () => { deliveries += 1; await ports.context.authorize(queuedTask!, { context_grant_id: queuedTask!.context_grant_id, requested_fields: ['case_id', 'system_name', 'owner_email', 'control_summary', 'recovery_secret'] }); const lane = laneIds[deliveries - 1]; return { delivery_id: `delivery_${deliveries}`, status: 'acknowledged', result_frame: { payload_hash: hash(`phase27-${deliveries - 1}`), payload: { output: { projected_tokens: 14, execution_kind: lane === 'framework' ? 'signed-framework-connector' : 'official-provider-cli', provider_output_hash: hash(`provider-${deliveries - 1}`) } } } } as never; },
      nextGovernedMessageSequence: async (connectorManifestId: string, taskId: string) => governedSequences.get(`${connectorManifestId}:${taskId}`) ?? 0,
      recordGovernedMessage: async (message: GovernedAgentMessage) => { governedSequences.set(`${message.sender_connector_manifest_id}:${message.task_id}`, message.sequence + 1); return { ...message, status: 'delivered' } as never; }
    }
  };
  return { ports: ports as never, context, grants, tasks, phase26Lanes, get deliveries() { return deliveries; } };
}
function actor() { return { membership_id: 'membership_admin', human_proof_id: 'proof_admin', authority_credential_id: 'credential_admin' }; }
function hash(value: string): `sha256:${string}` { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
