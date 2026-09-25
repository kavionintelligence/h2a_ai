import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Phase 49 Office and Control work-graph surface', () => {
  it('uses the same canonical component and typed command path in both modes', async () => {
    const [office, control, preload, main] = await Promise.all([
      readFile(join(root, 'apps/desktop/renderer/src/App.tsx'), 'utf8'),
      readFile(join(root, 'apps/desktop/renderer/src/features/command-floor/CommandFloor.tsx'), 'utf8'),
      readFile(join(root, 'apps/desktop/preload/index.ts'), 'utf8'),
      readFile(join(root, 'apps/desktop/main/index.ts'), 'utf8')
    ]);
    expect(office).toContain("officeWorkspace === 'tasks' ? <GoalWorkGraphPanel compact");
    expect(office).toContain('<OfficeWorkspaceDrawer workspace={officeWorkspace}');
    expect(control).toContain('<GoalWorkGraphPanel projects=');
    for (const method of ['getGoalWorkGraphState', 'composeCollaborativeGoal', 'proposeWorkGraph', 'editWorkGraph', 'approveWorkGraph', 'runWorkGraph', 'runWorkGraphNode', 'cancelWorkGraphNode', 'revokeWorkGraphNode', 'reassignWorkGraphNode']) expect(preload).toContain(method);
    for (const channel of ['goal-work-graph:get-state', 'goal-work-graph:compose', 'goal-work-graph:propose', 'goal-work-graph:edit', 'goal-work-graph:approve', 'goal-work-graph:run', 'goal-work-graph:run-node', 'goal-work-graph:cancel-node', 'goal-work-graph:revoke-node', 'goal-work-graph:reassign-node']) expect(main).toContain(channel);
    expect(main).toContain('const ceremony = await activeWorkGraphCeremony');
    expect(main).toContain('trace_id: session.trace_id');
    expect(main).not.toContain("trace_id: goal.trace_id, idempotency_key: `phase49-workplace-");
  });

  it('exposes the four-command flow and complete authority/context inspection', async () => {
    const source = await readFile(join(root, 'apps/desktop/renderer/src/features/command-floor/components/GoalWorkGraphPanel.tsx'), 'utf8');
    for (const control of ['work-graph.goal.compose', 'work-graph.plan.propose', 'work-graph.plan.approve', 'work-graph.nodes.run-ready']) expect(source).toContain(`data-control-id="${control}"`);
    for (const label of ['Human owner', 'Provider', 'Target', 'Outputs', 'Tools', 'Paths', 'Hosts', 'Released', 'Withheld', 'Mandate', 'Expires', 'Validation']) expect(source).toContain(`label="${label}"`);
    expect(source).toContain("Promise.all(runnable.map");
    expect(source).toContain('execution_target');
    expect(source).toContain('onHumanProofRequired');
  });

  it('registers every Phase 49 command control', async () => {
    const registry = JSON.parse(await readFile(join(root, 'docs/plan3/CONTROL_REGISTRY.json'), 'utf8')) as { phase: number; controls: Array<{ control_id: string }>; source_coverage: Array<{ source: string; button_declarations: number }> };
    const source = await readFile(join(root, 'apps/desktop/renderer/src/features/command-floor/components/GoalWorkGraphPanel.tsx'), 'utf8');
    const ids = [...source.matchAll(/<button\b[^>]*data-control-id="([^"]+)"/gu)].map((match) => match[1]!);
    const registered = new Set(registry.controls.map((item) => item.control_id));
    expect(registry.phase).toBeGreaterThanOrEqual(49);
    expect(ids).toHaveLength(source.match(/<button\b/gu)?.length ?? 0);
    ids.forEach((id) => expect(registered).toContain(id));
    expect(registry.source_coverage.find((item) => item.source.endsWith('GoalWorkGraphPanel.tsx'))?.button_declarations).toBe(ids.length);
  });
});
