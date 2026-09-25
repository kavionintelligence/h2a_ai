import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTROL_PLANE_PROTOCOL_VERSION, type ControlPlaneAttachRequest, type ControlPlaneCanonicalState } from '@h2a/contracts';
import { H2AControlPlaneHost } from '@h2a/control-plane';
import { LocalAppearancePreferencesRepository } from '@h2a/storage';
import { phase34CanonicalState } from './fixtures/phase34-state';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Phase 34 host-owned control plane', () => {
  it('projects one canonical state and rejects malformed source state', async () => {
    const root = await temporaryRoot();
    const valid = phase34CanonicalState();
    const host = new H2AControlPlaneHost({ load: async () => valid }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'host_phase34' });
    await host.initialize();
    const attachment = host.attach(attachRequest('renderer_one'));
    const snapshot = await host.getSnapshot(lease(attachment));

    expect(snapshot.canonical.collaboration).toEqual(valid.collaboration);
    expect(snapshot.office.counts.agents).toBe(valid.collaboration.workplace.agents.length);
    expect(snapshot.appearance.presentation_mode).toBe('office');
    expect(snapshot.connection).toMatchObject({ status: 'connected', read_only: false });

    const invalidHost = new H2AControlPlaneHost({ load: async () => ({ ...valid, collaboration: { malformed: true } } as unknown as ControlPlaneCanonicalState) }, new LocalAppearancePreferencesRepository(await temporaryRoot()));
    await expect(invalidHost.initialize()).rejects.toThrow();
  });

  it('negotiates and enforces scoped capabilities without raising the trust ceiling', async () => {
    const root = await temporaryRoot();
    const valid = phase34CanonicalState();
    const governedSource: ControlPlaneCanonicalState = {
      ...valid,
      enterprise: {
        ...valid.enterprise,
        posture: { ...valid.enterprise.posture, trust_modes: { ...valid.enterprise.posture.trust_modes, governed: 1 } }
      }
    };
    const host = new H2AControlPlaneHost({ load: async () => governedSource }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'host_capabilities' });
    await host.initialize();
    const observer = host.attach({ client_id: 'observer', protocol_version: 1, requested_capabilities: ['workspace.observe'] });
    expect(observer.granted_capabilities).toEqual(['workspace.observe']);
    expect((await host.getSnapshot(lease(observer))).office.trust_ceiling).toBe('connected-observed');
    await expect(host.execute({ ...lease(observer), command: { type: 'workspace.refresh' } })).rejects.toThrow('CONTROL_PLANE_CAPABILITY_DENIED:workspace.refresh');
    expect(() => host.attach({ client_id: 'unsupported', protocol_version: 2, requested_capabilities: ['workspace.observe'] } as never)).toThrow();
  });

  it('orders changes, detects gaps, bounds replay, and requires snapshot fallback', async () => {
    const root = await temporaryRoot();
    let state = phase34CanonicalState();
    const host = new H2AControlPlaneHost({ load: async () => state }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'host_replay', replayLimit: 2 });
    await host.initialize();
    const attachment = host.attach(attachRequest('renderer_replay'));
    const original = await host.getSnapshot(lease(attachment));

    state = withAgentAction(state, 'first canonical change');
    expect(await host.refresh('collaboration')).toBe(true);
    state = withAgentAction(state, 'second canonical change');
    expect(await host.refresh('collaboration')).toBe(true);
    expect(host.replay({ ...lease(attachment), after_cursor: original.cursor })).toMatchObject({
      mode: 'events',
      latest_cursor: 3,
      events: [{ sequence: 2 }, { sequence: 3 }]
    });

    state = withAgentAction(state, 'third canonical change');
    await host.refresh('collaboration');
    expect(host.replay({ ...lease(attachment), after_cursor: 0 })).toEqual({ mode: 'snapshot-required', reason: 'cursor-too-old', latest_cursor: 4 });
    expect(host.replay({ ...lease(attachment), after_cursor: 99 })).toEqual({ mode: 'snapshot-required', reason: 'cursor-ahead', latest_cursor: 4 });

    const restarted = new H2AControlPlaneHost({ load: async () => state }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'host_restarted' });
    await restarted.initialize();
    expect(restarted.replay({ ...lease(attachment), after_cursor: 4 })).toEqual({ mode: 'snapshot-required', reason: 'host-restarted', latest_cursor: 0 });
  });

  it('serializes overlapping refreshes so a delayed older read cannot replace newer canonical state', async () => {
    const root = await temporaryRoot();
    let state = phase34CanonicalState();
    let loadCount = 0;
    let releaseDelayedLoad!: () => void;
    let signalDelayedLoad!: () => void;
    const delayedLoadStarted = new Promise<void>((resolve) => { signalDelayedLoad = resolve; });
    const releaseDelayed = new Promise<void>((resolve) => { releaseDelayedLoad = resolve; });
    const host = new H2AControlPlaneHost({
      load: async () => {
        const captured = state;
        loadCount += 1;
        if (loadCount === 2) {
          signalDelayedLoad();
          await releaseDelayed;
        }
        return captured;
      }
    }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'host_serial_refresh' });
    await host.initialize();
    const attachment = host.attach(attachRequest('renderer_serial_refresh'));

    state = withAgentAction(state, 'delayed older state');
    const delayedRefresh = host.refresh('collaboration');
    await delayedLoadStarted;
    state = withAgentAction(state, 'latest state');
    const latestRefresh = host.refresh('collaboration');
    releaseDelayedLoad();
    await Promise.all([delayedRefresh, latestRefresh]);

    const snapshot = await host.getSnapshot(lease(attachment));
    expect(snapshot.canonical.collaboration.workplace.agents[0]?.currentAction).toBe('latest state');
    expect(snapshot.aggregate_version).toBe(4);
    expect(snapshot.cursor).toBe(3);
  });

  it('invalidates old generations and denies commands after disconnect or expiry', async () => {
    const root = await temporaryRoot();
    let now = new Date('2026-08-26T12:00:00.000Z');
    const host = new H2AControlPlaneHost({ load: async () => phase34CanonicalState() }, new LocalAppearancePreferencesRepository(root, () => now), {
      clock: () => now,
      leaseDurationMs: 1_000,
      hostInstanceId: 'host_leases'
    });
    await host.initialize();
    const first = host.attach(attachRequest('same_renderer'));
    const second = host.attach(attachRequest('same_renderer'));
    await expect(host.getSnapshot(lease(first))).rejects.toThrow('CONTROL_PLANE_DISCONNECTED_READ_ONLY');
    await expect(host.getSnapshot({ ...lease(second), generation: 'generation_stale' })).rejects.toThrow('CONTROL_PLANE_CONNECTION_STALE');

    host.detach(lease(second));
    await expect(host.execute({ ...lease(second), command: { type: 'workspace.refresh' } })).rejects.toThrow('CONTROL_PLANE_DISCONNECTED_READ_ONLY');

    const third = host.attach(attachRequest('expiring_renderer'));
    now = new Date('2026-08-26T12:00:02.000Z');
    await expect(host.execute({ ...lease(third), command: { type: 'workspace.refresh' } })).rejects.toThrow('CONTROL_PLANE_ATTACHMENT_EXPIRED');
  });

  it('persists appearance per data root and survives a host restart', async () => {
    const rootA = await temporaryRoot();
    const rootB = await temporaryRoot();
    const source = { load: async () => phase34CanonicalState() };
    const hostA = new H2AControlPlaneHost(source, new LocalAppearancePreferencesRepository(rootA), { hostInstanceId: 'host_a' });
    await hostA.initialize();
    const attachedA = hostA.attach(attachRequest('renderer_a'));
    await hostA.execute({ ...lease(attachedA), command: { type: 'appearance.set', presentation_mode: 'office', reduced_motion: true } });

    const restartedA = new H2AControlPlaneHost(source, new LocalAppearancePreferencesRepository(rootA), { hostInstanceId: 'host_a_restart' });
    await restartedA.initialize();
    const snapshotA = await restartedA.getSnapshot(lease(restartedA.attach(attachRequest('renderer_a_restart'))));
    expect(snapshotA.appearance).toMatchObject({ presentation_mode: 'office', reduced_motion: true });

    const hostB = new H2AControlPlaneHost(source, new LocalAppearancePreferencesRepository(rootB), { hostInstanceId: 'host_b' });
    await hostB.initialize();
    const snapshotB = await hostB.getSnapshot(lease(hostB.attach(attachRequest('renderer_b'))));
    expect(snapshotB.appearance).toMatchObject({ presentation_mode: 'office', reduced_motion: false });
    expect(await readFile(join(rootA, 'settings/appearance-preferences.json'), 'utf8')).toContain('"presentation_mode": "office"');
    await expect(readFile(join(rootA, 'office/state.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

function withAgentAction(state: ControlPlaneCanonicalState, action: string): ControlPlaneCanonicalState {
  return {
    ...state,
    collaboration: {
      ...state.collaboration,
      workplace: {
        ...state.collaboration.workplace,
        agents: state.collaboration.workplace.agents.map((agent, index) => index === 0 ? { ...agent, currentAction: action } : agent)
      }
    }
  };
}

function lease(attachment: { host_instance_id: string; lease_id: string; client_id: string; connection: { generation: string } }): { host_instance_id: string; lease_id: string; client_id: string; generation: string } {
  return { host_instance_id: attachment.host_instance_id, lease_id: attachment.lease_id, client_id: attachment.client_id, generation: attachment.connection.generation };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase34-'));
  roots.push(root);
  return root;
}

function attachRequest(client_id: string): ControlPlaneAttachRequest {
  return { client_id, protocol_version: CONTROL_PLANE_PROTOCOL_VERSION, requested_capabilities: ['workspace.observe', 'workspace.refresh', 'appearance.read', 'appearance.write'] };
}
