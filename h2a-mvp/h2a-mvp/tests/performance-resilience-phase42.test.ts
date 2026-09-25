import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTROL_PLANE_PROTOCOL_VERSION, type AgentRuntimeSummary, type ControlPlaneAttachResponse, type ControlPlaneCapability, type OfficeState } from '@h2a/contracts';
import { H2AControlPlaneHost } from '@h2a/control-plane';
import { OfficeProjectionService } from '@h2a/office';
import { LocalAppearancePreferencesRepository } from '@h2a/storage';
import { buildOfficeSceneModel } from '../apps/desktop/renderer/src/office/sceneModel';
import { phase34CanonicalState } from './fixtures/phase34-state';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('Phase 42 performance and resilience boundaries', () => {
  it('keeps a twenty-agent Office model deterministic under repeated projection', () => {
    const agents = Array.from({ length: 20 }, (_, index) => agent(index));
    const value = office(agents.length);
    const first = buildOfficeSceneModel(value, agents);
    expect(first.entities.filter((entity) => entity.agentId)).toHaveLength(20);
    for (let iteration = 0; iteration < 500; iteration += 1) {
      const next = buildOfficeSceneModel(value, agents);
      expect(next.entities.map((entity) => entity.id)).toEqual(first.entities.map((entity) => entity.id));
    }
  });

  it('bounds reconnect generations, observers, host attachments, and stale replay', async () => {
    const host = await createHost({ replayLimit: 4 });
    let current: ControlPlaneAttachResponse | undefined;
    for (let iteration = 0; iteration < 100; iteration += 1) current = host.attach(attachRequest('renderer-storm'));
    const snapshot = await host.getSnapshot(lease(current!));
    expect(snapshot.operator_session).toMatchObject({ status: 'connected', attached_observers: 1, input_owner_client_id: 'renderer-storm' });

    for (let iteration = 0; iteration < 10; iteration += 1) {
      await host.execute({ ...lease(current!), command: { type: 'appearance.set', presentation_mode: iteration % 2 === 0 ? 'control' : 'office' } });
    }
    expect(host.replay({ ...lease(current!), after_cursor: 0 })).toMatchObject({ mode: 'snapshot-required', reason: 'cursor-too-old' });

    const observers: ControlPlaneAttachResponse[] = [];
    for (let index = 0; index < 255; index += 1) observers.push(host.attach(attachRequest(`observer-${index}`, ['workspace.observe'])));
    expect(() => host.attach(attachRequest('observer-over-limit', ['workspace.observe']))).toThrow('CONTROL_PLANE_ATTACHMENT_LIMIT');
  });

  it('deduplicates proof clicks and fails closed when distinct proof demand reaches its queue bound', async () => {
    const host = await createHost();
    const attachment = host.attach(attachRequest('proof-operator'));
    const request = (index: number) => ({
      ...lease(attachment),
      command: {
        type: 'human-proof.request' as const,
        human_id: 'human_employee_001', purpose: `phase42-purpose-${index}`, command: `phase42-command-${index}`,
        source_route: 'command-floor', source_mode: 'office' as const, source_scroll_y: 0, source_focus_id: null,
        continuation_mode: 'refresh-only' as const, continuation_operation_key: null, sensitivity: 'non-sensitive' as const
      }
    });
    await host.execute(request(0));
    await host.execute(request(0));
    for (let index = 1; index < 32; index += 1) await host.execute(request(index));
    await expect(host.execute(request(32))).rejects.toThrow('HUMAN_PROOF_QUEUE_FULL');
  });
});

async function createHost(options: { replayLimit?: number } = {}): Promise<H2AControlPlaneHost> {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase42-'));
  roots.push(root);
  const host = new H2AControlPlaneHost({ load: async () => phase34CanonicalState() }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'host_phase42', ...options });
  await host.initialize();
  return host;
}

function attachRequest(client_id: string, requested_capabilities: ControlPlaneCapability[] = ['workspace.observe', 'workspace.refresh', 'workspace.control', 'appearance.read', 'appearance.write', 'human-proof.challenge']) {
  return { client_id, protocol_version: CONTROL_PLANE_PROTOCOL_VERSION, requested_capabilities };
}

function lease(attachment: ControlPlaneAttachResponse) {
  return { host_instance_id: attachment.host_instance_id, lease_id: attachment.lease_id, client_id: attachment.client_id, generation: attachment.connection.generation };
}

function agent(index: number): AgentRuntimeSummary {
  const providers: AgentRuntimeSummary['provider'][] = ['claude-code', 'openai-codex', 'gemini-antigravity', 'custom-cli'];
  const id = `agent-phase42-${String(index).padStart(2, '0')}`;
  return { id, passportId: `passport-${id}`, name: `Agent ${index + 1}`, initials: `A${index + 1}`, role: 'Bounded collaborator', provider: providers[index % providers.length]!, providerLabel: providers[index % providers.length]!, model: 'installed-cli', status: index % 3 === 0 ? 'working' : 'ready', currentAction: index % 3 === 0 ? 'Running canonical assignment' : 'Awaiting assignment', mandateId: `mandate-${id}`, mandateLabel: 'Phase 42 bounded work', progress: index % 3 === 0 ? 45 : 0, accent: '#2f75a9' };
}

function office(agentCount: number): OfficeState {
  const base = phase34CanonicalState();
  const projected = new OfficeProjectionService().project(base, '2026-08-31T09:00:00.000Z');
  return {
    ...projected,
    counts: { humans: 3, agents: agentCount, assignments: agentCount, pending_approvals: 0, active_context_grants: agentCount, active_federation_peers: 2 },
    selected_agent_id: null, active_trace_id: 'trace_phase42', acceptance: { status: 'incomplete', passed: 9, total: 11 },
    collaboration: { signals: [], portals: [] }, entities: [], alerts: { total: 0, blocking: 0 }
  };
}
