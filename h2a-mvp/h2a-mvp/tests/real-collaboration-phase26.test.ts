import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isRealCollaborationLaneRunnable, realCollaborationLaneSchema, type ExecuteFrameworkRequest, type RealCollaborationLane, type RealCollaborationLaneId } from '@h2a/contracts';
import { ConnectorRegistry, electronNodeModeEnvironment, FrameworkConnectorService } from '@h2a/connectors';
import { canonicalize, hashCanonical, LocalAuthorityEventLedger } from '@h2a/evidence';
import { MessageBroker } from '@h2a/messaging';
import { completedLaneDependencies, newestFrameworkRun, phase26AssignmentForBinding } from '@h2a/agents';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))));

describe('Phase 26 real framework execution', () => {
  it('allows any ready lane to run while retaining only completed predecessor hashes', () => {
    const lanes = [
      lane('claude-code', 'succeeded', 'assignment_claude', hashCanonical('claude')),
      lane('gemini-antigravity', 'not-ready', 'assignment_antigravity'),
      lane('framework', 'ready', 'assignment_framework'),
      lane('openai-codex', 'ready', 'assignment_codex')
    ];

    expect(isRealCollaborationLaneRunnable(lanes[2]!, lanes)).toBe(true);
    expect(isRealCollaborationLaneRunnable(lanes[3]!, lanes)).toBe(true);
    expect(completedLaneDependencies(lanes, 'openai-codex')).toEqual({
      assignmentIds: ['assignment_claude'],
      outputHashes: [hashCanonical('claude')]
    });
  });

  it('serializes arbitrary-order starts while another lane is active', () => {
    const lanes = [
      lane('claude-code', 'ready', 'assignment_claude'),
      lane('gemini-antigravity', 'running', 'assignment_antigravity'),
      lane('framework', 'ready', 'assignment_framework'),
      lane('openai-codex', 'failed', 'assignment_codex')
    ];

    expect(isRealCollaborationLaneRunnable(lanes[0]!, lanes)).toBe(false);
    expect(isRealCollaborationLaneRunnable(lanes[2]!, lanes)).toBe(false);
    expect(isRealCollaborationLaneRunnable(lanes[3]!, lanes)).toBe(false);
  });

  it('keeps Phase 26 pinned to bootstrap work when a newer project assignment uses the same agent', () => {
    const assignments = [
      { id: 'phase25_assignment', assigneeId: 'binding_claude' },
      { id: 'phase49_assignment', assigneeId: 'binding_claude' }
    ] as never;

    expect(phase26AssignmentForBinding(assignments, ['phase25_assignment'], 'binding_claude')?.id).toBe('phase25_assignment');
  });

  it('starts framework scripts in Node mode when hosted by Electron', () => {
    expect(electronNodeModeEnvironment({ electron: '40.0.0' })).toEqual({ ELECTRON_RUN_AS_NODE: '1' });
    expect(electronNodeModeEnvironment({})).toEqual({});
  });

  it('reconstructs the newest framework result without deleting earlier failures', () => {
    const failed = frameworkRun('framework_run_failed', '2026-08-22T07:30:00.000Z', 'failed');
    const succeeded = frameworkRun('framework_run_succeeded', '2026-08-22T07:36:00.000Z', 'succeeded');
    expect(newestFrameworkRun([failed, succeeded])?.run_id).toBe('framework_run_succeeded');
    expect(newestFrameworkRun([succeeded, failed])?.run_id).toBe('framework_run_succeeded');
  });

  it.each(['custom-cli', 'mcp'] as const)('executes a signed zero-disclosure task through the %s subprocess', async (kind) => {
    const root = await mkdtemp(join(tmpdir(), `h2a-phase26-${kind}-`)); roots.push(root);
    const ledger = new LocalAuthorityEventLedger(root);
    const registry = new ConnectorRegistry(root, ledger);
    const broker = new MessageBroker(root, registry, ledger, { authorize: async () => { throw new Error('Phase 26 framework execution must not request protected context.'); } });
    const organization = keys();
    const authority = {
      signOrganizationRecord: async (value: unknown) => ({ canonicalHash: hashCanonical(value), signature: `ed25519:${sign(null, Buffer.from(canonicalize(value)), organization.privateKeyPem).toString('base64')}` }),
      getOrganizationPublicKey: async () => organization.publicKeyPem
    };
    const service = new FrameworkConnectorService(root, broker, ledger, resolve('.'), undefined, { registry, authority });
    await broker.initialize(); await service.initialize();

    const state = await service.execute(request(kind));
    const run = state.collaboration_runs.at(-1);
    expect(run).toMatchObject({ status: 'succeeded', ceremony_id: 'ceremony_phase26', assignment_id: `assignment_${kind}`, trust_mode: 'connected-observed' });
    expect(run?.steps[0]).toMatchObject({ connector_kind: kind, status: 'acknowledged', task_id: `assignment_${kind}` });
    expect(run?.steps[0]?.output_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const delivery = state.protocol.deliveries.at(-1);
    expect(delivery).toMatchObject({ status: 'acknowledged' });
    expect(delivery?.result_frame?.payload.output).toMatchObject({ framework: kind, zero_disclosure: true, dependency_task_ids: ['assignment_claude'] });
    expect(delivery?.acknowledgement_frame?.payload).toMatchObject({ accepted: true, result_frame_id: delivery?.result_frame?.frame_id });
    expect((await ledger.verify()).status).toBe('verified');
  }, 30_000);

  it('rejects A2A execution until a pinned HTTPS peer is configured', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2a-phase26-a2a-')); roots.push(root);
    const ledger = new LocalAuthorityEventLedger(root);
    const registry = new ConnectorRegistry(root, ledger);
    const broker = new MessageBroker(root, registry, ledger, { authorize: async () => { throw new Error('not used'); } });
    const organization = keys();
    const service = new FrameworkConnectorService(root, broker, ledger, resolve('.'), undefined, { registry, authority: { signOrganizationRecord: async (value) => ({ canonicalHash: hashCanonical(value), signature: `ed25519:${sign(null, Buffer.from(canonicalize(value)), organization.privateKeyPem).toString('base64')}` }), getOrganizationPublicKey: async () => organization.publicKeyPem } });
    await broker.initialize(); await service.initialize();
    await expect(service.execute({ ...request('mcp'), kind: 'a2a' } as never)).rejects.toThrow('Agent Card and HTTPS');
  });
});

function lane(laneId: RealCollaborationLaneId, status: RealCollaborationLane['status'], assignmentId: string, outputHash: string | null = null): RealCollaborationLane {
  return realCollaborationLaneSchema.parse({
    lane_id: laneId,
    title: laneId,
    provider: laneId === 'framework' ? 'custom-cli' : laneId,
    status,
    health: status === 'not-ready' ? 'degraded' : 'ready',
    detail: 'Test lane.',
    agent_id: `agent_${laneId}`,
    passport_id: `passport_${laneId}`,
    binding_id: `binding_${laneId}`,
    runtime_session_id: `session_${laneId}`,
    mandate_id: `mandate_${laneId}`,
    assignment_id: assignmentId,
    run_id: null,
    output_hash: outputHash,
    dependency_output_hashes: [],
    started_at: null,
    completed_at: null,
    error: null
  });
}

function request(kind: 'mcp' | 'custom-cli'): ExecuteFrameworkRequest {
  return {
    kind,
    organization_id: 'org_hp_demo', requestor_human_id: 'human_operator', assigned_agent_id: 'agent_framework',
    passport_id: 'passport_framework', runtime_attestation_id: 'attestation_framework', runtime_session_id: 'session_framework',
    mandate_id: 'mandate_framework', assignment_id: `assignment_${kind}`,
    objective: 'Execute only the signed Phase 26 zero-disclosure framework assignment.',
    dependency_task_ids: ['assignment_claude'], dependency_output_hashes: [hashCanonical('claude-output')], timeout_seconds: 15,
    ceremony: { ceremony_id: 'ceremony_phase26', trace_id: 'phase22_phase26_framework', idempotency_key: `execute_${kind}` }
  };
}

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return { publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
}

function frameworkRun(runId: string, completedAt: string, status: 'failed' | 'succeeded') {
  return {
    run_id: runId, trace_id: 'phase22_phase26_framework', ceremony_id: 'ceremony_phase26', assignment_id: 'assignment_mcp',
    passport_id: 'passport_framework', runtime_session_id: 'session_framework', mandate_id: 'mandate_framework', status,
    trust_mode: 'connected-observed' as const, started_at: completedAt, completed_at: completedAt, evidence_integrity: 'verified' as const,
    steps: [{ step_id: 'step_mcp', connector_kind: 'mcp' as const, connector_manifest_id: 'connector_phase26_mcp_v1', delivery_id: `delivery_${runId}`, task_id: 'assignment_mcp', status: status === 'succeeded' ? 'acknowledged' as const : 'failed' as const, output_hash: status === 'succeeded' ? hashCanonical(runId) : undefined }]
  };
}
