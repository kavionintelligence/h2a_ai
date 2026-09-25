import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import type { AgentRuntimeSummary, OfficeState } from '@h2a/contracts';
import { OfficeCamera } from '../apps/desktop/renderer/src/office/OfficeCamera';
import { findOfficePath } from '../apps/desktop/renderer/src/office/pathfinding';
import { allocateOfficeSeats } from '../apps/desktop/renderer/src/office/seatAllocation';
import { installOfficeContextRecovery, shouldRunSceneTicker } from '../apps/desktop/renderer/src/office/sceneLifecycle';
import { buildOfficeSceneModel } from '../apps/desktop/renderer/src/office/sceneModel';
import { OFFICE_GRID_HEIGHT, OFFICE_GRID_WIDTH, isOfficeTileWalkable, officeSpawn, officeStations } from '../apps/desktop/renderer/src/office/officeTheme';

describe('Phase 36 original office engine contracts', () => {
  it('finds only walkable routes and deterministically allocates preferred provider seats', () => {
    const agents = [agent('agent-codex', 'openai-codex'), agent('agent-claude', 'claude-code'), agent('agent-framework', 'custom-cli')];
    const allocations = allocateOfficeSeats(agents);
    expect(allocations.map(({ agent: allocated, station }) => [allocated.id, station.provider])).toEqual([
      ['agent-claude', 'claude-code'],
      ['agent-codex', 'openai-codex'],
      ['agent-framework', 'custom-cli']
    ]);
    const goal = officeStations[0].seat;
    const path = findOfficePath({ width: OFFICE_GRID_WIDTH, height: OFFICE_GRID_HEIGHT, isWalkable: isOfficeTileWalkable }, officeSpawn, goal);
    expect(path.length).toBeGreaterThan(0);
    expect(path.at(-1)).toEqual(goal);
    expect(path.every((point) => isOfficeTileWalkable(point.x, point.y))).toBe(true);
  });

  it('bounds camera zoom and pan while preserving a full-map reset', () => {
    const world = new Container();
    const camera = new OfficeCamera(world, 960, 640);
    camera.resize(480, 320);
    const reset = camera.snapshot();
    expect(reset.zoom).toBe(0.7);
    camera.zoomBy(20);
    expect(camera.snapshot().zoom).toBe(2.4);
    camera.panBy(100_000, 100_000);
    expect(camera.snapshot()).toMatchObject({ x: 0, y: 0 });
    camera.reset();
    expect(camera.snapshot()).toEqual(reset);
  });

  it('enters low-power idle unless visible canonical movement requires a ticker', () => {
    expect(shouldRunSceneTicker({ documentVisible: true, intersecting: true, reducedMotion: false, movingCharacters: 1 })).toBe(true);
    expect(shouldRunSceneTicker({ documentVisible: true, intersecting: true, reducedMotion: false, movingCharacters: 0 })).toBe(false);
    expect(shouldRunSceneTicker({ documentVisible: true, intersecting: true, reducedMotion: true, movingCharacters: 4 })).toBe(false);
    expect(shouldRunSceneTicker({ documentVisible: false, intersecting: true, reducedMotion: false, movingCharacters: 4 })).toBe(false);
  });

  it('recovers context loss with a bounded retry budget and removable listener', async () => {
    vi.useFakeTimers();
    const canvas = new EventTarget();
    const recover = vi.fn();
    const failed = vi.fn();
    const controller = installOfficeContextRecovery(canvas, recover, failed, { maxAttempts: 2, delayMs: 5 });
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(5);
    expect(recover).toHaveBeenCalledWith(1);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(5);
    expect(recover).toHaveBeenCalledWith(2);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(failed).toHaveBeenCalledOnce();
    controller.dispose();
    vi.useRealTimers();
  });

  it('projects canonical entities into a canvas-independent accessible roster', () => {
    const agents = [agent('agent-claude', 'claude-code')];
    const model = buildOfficeSceneModel(office(), agents);
    expect(model.entities.filter((entity) => entity.kind === 'zone')).toHaveLength(6);
    expect(model.entities.filter((entity) => entity.kind === 'station')).toHaveLength(6);
    expect(model.entities.find((entity) => entity.agentId === 'agent-claude')).toMatchObject({
      label: 'Agent agent-claude',
      detail: expect.stringContaining('Claude station')
    });
  });
});

function agent(id: string, provider: AgentRuntimeSummary['provider']): AgentRuntimeSummary {
  return {
    id,
    passportId: `passport-${id}`,
    name: `Agent ${id}`,
    initials: 'A',
    role: 'Security analyst',
    provider,
    providerLabel: provider,
    model: 'installed-cli',
    status: 'ready',
    currentAction: 'Awaiting assignment',
    mandateId: `mandate-${id}`,
    mandateLabel: 'Bounded review',
    progress: 0,
    accent: '#2f75a9'
  };
}

function office(): OfficeState {
  return {
    schema_version: 2,
    generated_at: '2026-08-26T12:00:00.000Z',
    runtime_mode: 'live-and-scripted',
    trust_ceiling: 'connected-observed',
    evidence_integrity: 'verified',
    counts: { humans: 2, agents: 1, assignments: 0, pending_approvals: 0, active_context_grants: 0, active_federation_peers: 0 },
    selected_agent_id: 'agent-claude',
    active_trace_id: 'trace-phase36',
    acceptance: { status: 'incomplete', passed: 0, total: 11 },
    workflow: {
      schema_version: 1,
      selected_workflow_id: 'set-up-people',
      workflows: ['set-up-people', 'connect-agents', 'run-governed-task', 'approve-protected-action', 'connect-friend-node', 'prepare-hp-demonstration'].map((workflow_id) => ({
        workflow_id,
        title: workflow_id,
        summary: 'Phase 36 renderer fixture.',
        status: 'not-started',
        active_step_id: 'fixture-step',
        completed_steps: 0,
        total_steps: 1,
        steps: [{ step_id: 'fixture-step', title: 'Fixture step', status: 'ready', reason_code: 'FIXTURE', prerequisites: [], evidence_refs: [], action: null }],
        dependency_edges: [],
        updated_at: '2026-08-26T12:00:00.000Z'
      })) as OfficeState['workflow']['workflows'],
      next_action: null,
      active_step: null,
      generated_at: '2026-08-26T12:00:00.000Z'
    },
    collaboration: { signals: [], portals: [] },
    entities: [],
    alerts: { total: 0, blocking: 0 }
  };
}
