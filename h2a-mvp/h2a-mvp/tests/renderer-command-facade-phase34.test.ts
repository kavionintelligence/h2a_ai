import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ControlPlaneAttachRequest, ControlPlaneCommandRequest, ControlPlaneEventEnvelope, ControlPlaneLeaseRequest, ControlPlaneReplayRequest, H2ADesktopApi } from '@h2a/contracts';
import { H2AControlPlaneHost } from '@h2a/control-plane';
import { LocalAppearancePreferencesRepository } from '@h2a/storage';
import { ControlPlaneCommandFacade } from '../apps/desktop/renderer/src/control-plane/commandFacade';
import { phase34CanonicalState } from './fixtures/phase34-state';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Phase 34 renderer command facade', () => {
  it('coalesces concurrent initial connections into one live attachment', async () => {
    const root = await temporaryRoot();
    const host = new H2AControlPlaneHost({ load: async () => phase34CanonicalState() }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'host_facade_concurrent_connect' });
    await host.initialize();
    const bridge = bridgeFor(host);
    const facade = new ControlPlaneCommandFacade(bridge.api);

    const [first, second] = await Promise.all([facade.connect(), facade.connect()]);

    expect(bridge.attachRequests).toHaveLength(1);
    expect(first).toBe(second);
    expect(facade.current()?.connection).toMatchObject({ status: 'connected', read_only: false });
  });

  it('coalesces a burst of canonical events into one snapshot pull', async () => {
    const root = await temporaryRoot();
    let state = phase34CanonicalState();
    const host = new H2AControlPlaneHost({ load: async () => state }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'host_facade_event_burst' });
    await host.initialize();
    const bridge = bridgeFor(host);
    const getSnapshot = bridge.api.getControlPlaneSnapshot;
    let snapshotPulls = 0;
    bridge.api.getControlPlaneSnapshot = async (request) => {
      snapshotPulls += 1;
      return getSnapshot(request);
    };
    const facade = new ControlPlaneCommandFacade(bridge.api);
    await facade.connect();

    for (const action of ['first', 'second', 'third']) {
      state = withAgentAction(state, action);
      await host.refresh('collaboration');
    }
    await waitFor(() => facade.current()?.cursor === 4);

    expect(snapshotPulls).toBe(2);
    expect(facade.current()?.canonical.collaboration.workplace.agents[0]?.currentAction).toBe('third');
  });

  it('maps commands to the public preload API and denies disconnected cached state', async () => {
    const root = await temporaryRoot();
    const host = new H2AControlPlaneHost({ load: async () => phase34CanonicalState() }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'host_facade_commands' });
    await host.initialize();
    const bridge = bridgeFor(host);
    const facade = new ControlPlaneCommandFacade(bridge.api);

    await facade.connect();
    const office = await facade.execute({ type: 'appearance.set', presentation_mode: 'office', reduced_motion: true });
    expect(bridge.executeRequests).toHaveLength(1);
    expect(bridge.executeRequests[0]?.command).toEqual({ type: 'appearance.set', presentation_mode: 'office', reduced_motion: true });
    expect(office.appearance).toMatchObject({ presentation_mode: 'office', reduced_motion: true });

    await facade.disconnect();
    expect(facade.current()).toBeUndefined();
    await expect(facade.execute({ type: 'workspace.refresh' })).rejects.toThrow('CONTROL_PLANE_DISCONNECTED_READ_ONLY');
    expect(bridge.executeRequests).toHaveLength(1);
  });

  it('recovers a lost event through bounded replay before publishing current state', async () => {
    const root = await temporaryRoot();
    let state = phase34CanonicalState();
    const host = new H2AControlPlaneHost({ load: async () => state }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'host_facade_replay' });
    await host.initialize();
    const bridge = bridgeFor(host);
    const facade = new ControlPlaneCommandFacade(bridge.api);
    await facade.connect();

    bridge.holdEvents = true;
    state = withAgentAction(state, 'first update');
    await host.refresh('collaboration');
    state = withAgentAction(state, 'second update');
    await host.refresh('collaboration');
    expect(bridge.heldEvents.map((event) => event.sequence)).toEqual([2, 3]);

    bridge.holdEvents = false;
    bridge.deliver(bridge.heldEvents[1]!);
    await waitFor(() => facade.current()?.cursor === 3);

    expect(bridge.replayRequests).toHaveLength(1);
    expect(bridge.replayRequests[0]?.after_cursor).toBe(1);
    expect(facade.current()?.canonical.collaboration.workplace.agents[0]?.currentAction).toBe('second update');
    expect(facade.current()?.connection).toMatchObject({ status: 'connected', read_only: false });
  });

  it('does not let a delayed command response roll the renderer back after a newer event snapshot', async () => {
    const root = await temporaryRoot();
    let state = phase34CanonicalState();
    const host = new H2AControlPlaneHost({ load: async () => state }, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'host_facade_monotonic' });
    await host.initialize();
    const bridge = bridgeFor(host);
    const execute = bridge.api.executeOfficeCommand;
    let releaseCommand!: () => void;
    let signalCommand!: () => void;
    const commandStarted = new Promise<void>((resolve) => { signalCommand = resolve; });
    const release = new Promise<void>((resolve) => { releaseCommand = resolve; });
    bridge.api.executeOfficeCommand = async (request) => {
      const snapshot = await execute(request);
      signalCommand();
      await release;
      return snapshot;
    };
    const facade = new ControlPlaneCommandFacade(bridge.api);
    await facade.connect();

    const delayedCommand = facade.execute({ type: 'workspace.refresh' });
    await commandStarted;
    state = withAgentAction(state, 'new event state');
    await host.refresh('collaboration');
    await waitFor(() => facade.current()?.canonical.collaboration.workplace.agents[0]?.currentAction === 'new event state');
    releaseCommand();

    const result = await delayedCommand;
    expect(result.canonical.collaboration.workplace.agents[0]?.currentAction).toBe('new event state');
    expect(facade.current()?.canonical.collaboration.workplace.agents[0]?.currentAction).toBe('new event state');
  });

  it('reattaches and safely completes Human Proof when the operator lease expires during camera verification', async () => {
    const root = await temporaryRoot();
    let now = new Date('2026-08-31T18:00:00.000Z');
    const host = new H2AControlPlaneHost(
      { load: async () => phase34CanonicalState() },
      new LocalAppearancePreferencesRepository(root),
      {
        hostInstanceId: 'host_facade_proof_reconnect',
        leaseDurationMs: 1_000,
        clock: () => now,
        humanProofResolver: {
          resolve: async (proofId) => proofId === 'proof_after_camera'
            ? {
                proof_id: proofId,
                human_id: 'human_employee_001',
                purpose: 'administer protected context',
                verified_at: now.toISOString(),
                expires_at: new Date(now.getTime() + 300_000).toISOString()
              }
            : null
        }
      }
    );
    await host.initialize();
    const bridge = bridgeFor(host);
    const facade = new ControlPlaneCommandFacade(bridge.api);
    const initial = await facade.connect();

    const requested = await facade.execute({
      type: 'human-proof.request',
      human_id: 'human_employee_001',
      purpose: 'administer protected context',
      command: 'context.revocation.prove',
      source_route: 'context-broker',
      source_mode: initial.appearance.presentation_mode,
      source_scroll_y: 420,
      source_focus_id: 'prove-revocation',
      continuation_mode: 'refresh-only',
      continuation_operation_key: null,
      sensitivity: 'non-sensitive'
    });
    const challenge = requested.human_proof_challenge!;

    now = new Date('2026-08-31T18:00:02.000Z');
    const verified = await facade.execute({
      type: 'human-proof.complete',
      challenge_id: challenge.challenge_id,
      proof_id: 'proof_after_camera',
      source_route: challenge.source_route,
      source_mode: challenge.source_mode
    });

    expect(bridge.attachRequests).toHaveLength(2);
    expect(verified.human_proof_challenge).toMatchObject({ status: 'verified', proof_id: 'proof_after_camera' });
    expect(facade.current()?.connection).toMatchObject({ status: 'connected', read_only: false });

    const dismissed = await facade.execute({ type: 'human-proof.dismiss', challenge_id: challenge.challenge_id });
    expect(dismissed.human_proof_challenge).toBeNull();
  });
});

function bridgeFor(host: H2AControlPlaneHost): {
  api: Pick<H2ADesktopApi, 'attachControlPlane' | 'detachControlPlane' | 'getControlPlaneSnapshot' | 'getControlPlaneEvents' | 'executeOfficeCommand' | 'subscribeControlPlaneEvents'>;
  attachRequests: ControlPlaneAttachRequest[];
  executeRequests: ControlPlaneCommandRequest[];
  replayRequests: ControlPlaneReplayRequest[];
  heldEvents: ControlPlaneEventEnvelope[];
  holdEvents: boolean;
  deliver(event: ControlPlaneEventEnvelope): void;
} {
  const listeners = new Set<(event: ControlPlaneEventEnvelope) => void>();
  const attachRequests: ControlPlaneAttachRequest[] = [];
  const executeRequests: ControlPlaneCommandRequest[] = [];
  const replayRequests: ControlPlaneReplayRequest[] = [];
  const heldEvents: ControlPlaneEventEnvelope[] = [];
  let holdEvents = false;
  const deliver = (event: ControlPlaneEventEnvelope): void => {
      for (const listener of listeners) listener(event);
  };
  host.subscribe((event) => holdEvents ? heldEvents.push(event) : deliver(event));
  return {
    get holdEvents() { return holdEvents; },
    set holdEvents(value: boolean) { holdEvents = value; },
    deliver,
    attachRequests,
    executeRequests,
    replayRequests,
    heldEvents,
    api: {
      attachControlPlane: async (request) => {
        attachRequests.push(request);
        return host.attach(request);
      },
      detachControlPlane: async (request: ControlPlaneLeaseRequest) => host.detach(request),
      getControlPlaneSnapshot: (request: ControlPlaneLeaseRequest) => host.getSnapshot(request),
      getControlPlaneEvents: async (request: ControlPlaneReplayRequest) => {
        replayRequests.push(request);
        return host.replay(request);
      },
      executeOfficeCommand: async (request: ControlPlaneCommandRequest) => {
        executeRequests.push(request);
        return host.execute(request);
      },
      subscribeControlPlaneEvents: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    }
  };
}

function withAgentAction(state: ReturnType<typeof phase34CanonicalState>, action: string): ReturnType<typeof phase34CanonicalState> {
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

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for control-plane recovery.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase34-facade-'));
  roots.push(root);
  return root;
}
