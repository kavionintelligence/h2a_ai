import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  agentIdentityStateSchema,
  type AuthorityEventType,
  authorityApprovalStateSchema,
  connectorProtocolStateSchema,
  contextBrokerStateSchema,
  federationStateSchema,
  frameworkConnectorStateSchema,
  humanIdentityV2StateSchema,
  liveRuntimeStateSchema,
  mandateStateSchema,
  organizationAuthorityStateSchema
} from '@h2a/contracts';
import { CeremonyCoordinator, type CeremonyCoordinatorPorts } from '@h2a/ceremony';
import { LocalAuthorityEventLedger } from '@h2a/evidence';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('Phase 24 ceremony session and shared trace backbone', () => {
  it('persists one phase22 trace across creation, assessment, and restart', async () => {
    const { coordinator, ledger, root, ports } = await fixture();
    const created = await coordinator.createSession({ title: 'HP CTO/CISO demonstration', idempotency_key: 'create-one' });
    const session = created.sessions[0]!;
    expect(session.trace_id).toMatch(/^phase22_/u);

    const assessed = await coordinator.runStep({ ceremony_id: session.ceremony_id, step_id: 'prerequisites-assessed', idempotency_key: 'assess-one' });
    expect(assessed.sessions[0]!.steps.find((step) => step.step_id === 'prerequisites-assessed')?.status).toBe('passed');
    const events = await ledger.list();
    expect(events).toHaveLength(3);
    expect(new Set(events.map((event) => event.trace_id))).toEqual(new Set([session.trace_id]));
    expect(events.every((event) => event.payload.ceremony_id === session.ceremony_id)).toBe(true);

    const restarted = new CeremonyCoordinator(root, ledger, ports);
    const restored = await restarted.initialize();
    expect(restored.active_ceremony_id).toBe(session.ceremony_id);
    expect(restored.sessions[0]!.trace_id).toBe(session.trace_id);
    expect(restored.sessions[0]!.steps.find((step) => step.step_id === 'prerequisites-assessed')?.evidence_refs).toHaveLength(2);
  });

  it('deduplicates create and step commands by idempotency key', async () => {
    const { coordinator, ledger } = await fixture();
    const first = await coordinator.createSession({ title: 'Demonstration', idempotency_key: 'same-create' });
    const duplicate = await coordinator.createSession({ title: 'Changed title', idempotency_key: 'same-create' });
    expect(duplicate.sessions).toHaveLength(1);
    const ceremonyId = first.active_ceremony_id!;
    await coordinator.runStep({ ceremony_id: ceremonyId, step_id: 'prerequisites-assessed', idempotency_key: 'same-step' });
    await coordinator.runStep({ ceremony_id: ceremonyId, step_id: 'prerequisites-assessed', idempotency_key: 'same-step' });
    expect(await ledger.list()).toHaveLength(3);
  });

  it('records a partial failure and safely retries with a new operation key', async () => {
    let fail = true;
    const { coordinator, ledger } = await fixture({
      organization: { getState: async () => { if (fail) { fail = false; throw new Error('Injected organization read failure.'); } return emptyOrganization(); } }
    });
    const created = await coordinator.createSession({ title: 'Recovery demonstration', idempotency_key: 'create-recovery' });
    const ceremonyId = created.active_ceremony_id!;
    await expect(coordinator.runStep({ ceremony_id: ceremonyId, step_id: 'prerequisites-assessed', idempotency_key: 'attempt-failed' })).rejects.toThrow('Injected organization read failure.');
    expect((await coordinator.getState()).sessions[0]!.steps.find((step) => step.step_id === 'prerequisites-assessed')?.status).toBe('failed');
    const recovered = await coordinator.runStep({ ceremony_id: ceremonyId, step_id: 'prerequisites-assessed', idempotency_key: 'attempt-retry' });
    expect(recovered.sessions[0]!.steps.find((step) => step.step_id === 'prerequisites-assessed')?.status).toBe('passed');
    expect((await ledger.list()).map((event) => event.event_type)).toContain('CEREMONY_STEP_FAILED');
  });

  it('recognizes only same-trace Phase 26 provider and framework successes', async () => {
    let traceId = 'phase22_pending';
    const connectorProtocol = connectorProtocolStateSchema.parse({ connectors: [], deliveries: [], dead_letter_count: 0 });
    const { coordinator } = await fixture({
      live: { getState: async () => liveRuntimeStateSchema.parse({ providers: [], runs: [
        liveRun('run_claude', 'claude-code', traceId), liveRun('run_antigravity', 'gemini-antigravity', traceId), liveRun('run_codex', 'openai-codex', traceId),
        liveRun('run_wrong_trace', 'openai-codex', 'phase22_other')
      ], output: [] }) },
      frameworks: { getState: async () => frameworkConnectorStateSchema.parse({ declarations: [], protocol: connectorProtocol, collaboration_runs: [frameworkRun('framework_same_trace', traceId), frameworkRun('framework_other_trace', 'phase22_other')] }) }
    });
    const created = await coordinator.createSession({ title: 'Trace-bound provider ceremony', idempotency_key: 'create-provider-trace' });
    traceId = created.sessions[0]!.trace_id;
    const assessed = await coordinator.runStep({ ceremony_id: created.active_ceremony_id!, step_id: 'prerequisites-assessed', idempotency_key: 'assess-provider-trace' });
    const session = assessed.sessions[0]!;
    expect(session.steps.find((step) => step.step_id === 'shared-provider-task')).toMatchObject({ status: 'ready', evidence_refs: ['run_claude', 'run_antigravity', 'run_codex'] });
    expect(session.steps.find((step) => step.step_id === 'external-framework')).toMatchObject({ status: 'ready', evidence_refs: ['framework_same_trace'] });
  });

  it('projects Phase 30 readiness only from exact same-trace evidence', async () => {
    const { coordinator, ledger } = await fixture();
    const created = await coordinator.createSession({ title: 'Security ceremony', idempotency_key: 'create-security' });
    const session = created.sessions[0]!;
    const append = (event_type: AuthorityEventType, reason: string, trace_id = session.trace_id) => ledger.append({
      trace_id,
      actor: { type: 'system', id: 'phase30-test' },
      subject: { type: 'outcome', id: `${event_type}_${reason}` },
      event_type,
      payload: event_type.startsWith('LIVE_RUNTIME_') ? { termination_reason: reason } : { reason_code: reason }
    });
    await append('POLICY_DENIED', 'REPLAY_DETECTED');
    await append('APPROVAL_INVALIDATED_V2', 'APPROVAL_SIGNATURE_INVALID');
    await append('DELEGATION_DENIED', 'CHILD_EXPANDS_PARENT_AUTHORITY');
    await append('CONTEXT_DISCLOSURE_DENIED', 'CONTEXT_SCOPE_DENIED');
    await append('FEDERATION_ENVELOPE_REJECTED', 'PAYLOAD_HASH_INVALID');
    await append('LIVE_RUNTIME_FAILED', 'PROVIDER_EXIT_NONZERO');
    await append('LIVE_RUNTIME_CANCELLED', 'OPERATOR_CANCELLED:PHASE30_OPERATOR_CANCEL');
    await append('LIVE_RUNTIME_REVOKED', 'PHASE30_AUTHORITY_REVOKED');
    await append('LIVE_RUNTIME_FAILED', 'HOST_PROCESS_RESTARTED');
    await append('LIVE_RUNTIME_REVOKED', 'PHASE30_AUTHORITY_REVOKED', 'phase22_other');

    const assessed = await coordinator.runStep({ ceremony_id: session.ceremony_id, step_id: 'prerequisites-assessed', idempotency_key: 'assess-security' });
    const steps = assessed.sessions[0]!.steps;
    expect(steps.find((step) => step.step_id === 'adversarial-controls')).toMatchObject({ status: 'ready', evidence_refs: expect.arrayContaining([expect.stringMatching(/^evt_/u)]) });
    expect(steps.find((step) => step.step_id === 'runtime-containment')).toMatchObject({ status: 'ready' });
    expect(steps.find((step) => step.step_id === 'restart-recovery')).toMatchObject({ status: 'ready' });
  });

  it('rejects cross-ceremony trace binding and superseded sessions', async () => {
    const { coordinator } = await fixture();
    const first = await coordinator.createSession({ title: 'First ceremony', idempotency_key: 'first' });
    const firstSession = first.sessions[0]!;
    const resourceKinds = ['human-proof', 'mandate', 'context-grant', 'approval', 'live-run'] as const;
    for (const kind of resourceKinds) await coordinator.bindResource({ ceremony_id: firstSession.ceremony_id, trace_id: firstSession.trace_id, idempotency_key: `bind-${kind}` }, kind, `resource-${kind}`);
    const second = await coordinator.createSession({ title: 'Second ceremony', idempotency_key: 'second' });
    const secondSession = second.sessions[1]!;
    await expect(coordinator.assertBinding(firstSession.ceremony_id, firstSession.trace_id)).rejects.toThrow('not active');
    await expect(coordinator.assertBinding(secondSession.ceremony_id, firstSession.trace_id)).rejects.toThrow('different ceremony');
    await expect(coordinator.runStep({ ceremony_id: firstSession.ceremony_id, step_id: 'prerequisites-assessed', idempotency_key: 'wrong-session' })).rejects.toThrow('not active');
    for (const kind of resourceKinds) await expect(coordinator.assertResourceBinding(secondSession.ceremony_id, secondSession.trace_id, kind, `resource-${kind}`)).rejects.toThrow('different ceremony');
  });
});

async function fixture(overrides: Partial<CeremonyCoordinatorPorts> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase24-'));
  roots.push(root);
  const ledger = new LocalAuthorityEventLedger(root);
  const ports = { ...emptyPorts(), ...overrides };
  const coordinator = new CeremonyCoordinator(root, ledger, ports);
  await coordinator.initialize();
  return { coordinator, ledger, root, ports };
}

function emptyOrganization() { return organizationAuthorityStateSchema.parse({ organizations: [], memberships: [], roles: [], credentials: [], assurance: [], decisions: [] }); }
function emptyPorts(): CeremonyCoordinatorPorts {
  const connectorProtocol = connectorProtocolStateSchema.parse({ connectors: [], deliveries: [], dead_letter_count: 0 });
  return {
    humans: { getState: async () => humanIdentityV2StateSchema.parse({ identities: [], enrollments: [], active_proofs: [], selected_human_id: null, last_result: null }) },
    organization: { getState: async () => emptyOrganization() },
    agents: { getState: async () => agentIdentityStateSchema.parse({ passports: [], passportsV2: [], bindings: [], providers: [], credentials: [], humanProofRequired: true, attestations: [], runtimeSessions: [] }) },
    mandates: { getState: async () => mandateStateSchema.parse({ mandates: [], delegations: [], approvals: [], decisions: [], humanProofRequired: true }) },
    approvals: { getState: async () => authorityApprovalStateSchema.parse({ policies: [], requests: [], request_contexts: [], decisions: [], mandate_extensions: [], resumes: [] }) },
    context: { getState: async () => contextBrokerStateSchema.parse({ artifacts: [], grants: [], disclosures: [], messages: [] }) },
    connectorProtocol: { getState: async () => connectorProtocol },
    frameworks: { getState: async () => frameworkConnectorStateSchema.parse({ declarations: [], protocol: connectorProtocol, collaboration_runs: [] }) },
    live: { getState: async () => liveRuntimeStateSchema.parse({ providers: [], runs: [], output: [] }) },
    federation: { getState: async () => federationStateSchema.parse({ local_node: null, invitations: [], registrations: [], acceptances: [], peers: [], receipts: [], remote_listener_enabled: false }) }
  };
}

function liveRun(runId: string, provider: 'claude-code' | 'gemini-antigravity' | 'openai-codex', traceId: string) {
  const now = '2026-08-22T07:41:32.000Z';
  return { run_id: runId, provider, agent_id: `agent_${provider}`, passport_id: `passport_${provider}`, binding_id: `binding_${provider}`, runtime_session_id: `session_${provider}`, mandate_id: `mandate_${provider}`, trace_id: traceId, workspace_path: 'C:\\h2a', executable: 'provider.exe', argument_policy: ['bounded'], environment_keys: [], prompt_hash: `sha256:${'1'.repeat(64)}`, trust_mode: 'connected-observed' as const, status: 'succeeded' as const, exit_code: 0, output_summary: 'Succeeded.', started_at: now, completed_at: now, updated_at: now };
}

function frameworkRun(runId: string, traceId: string) {
  const now = '2026-08-22T07:36:31.000Z';
  return { run_id: runId, trace_id: traceId, mandate_id: 'mandate_framework', status: 'succeeded' as const, trust_mode: 'connected-observed' as const, steps: [{ step_id: 'step_mcp', connector_kind: 'mcp' as const, connector_manifest_id: 'connector_mcp', delivery_id: `delivery_${runId}`, task_id: 'task_framework', status: 'acknowledged' as const, output_hash: `sha256:${'2'.repeat(64)}` }], started_at: now, completed_at: now, evidence_integrity: 'verified' as const };
}
