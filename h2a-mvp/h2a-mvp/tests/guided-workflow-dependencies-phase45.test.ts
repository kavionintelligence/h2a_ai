import { describe, expect, it } from 'vitest';
import { GuidedWorkflowService } from '@h2a/office';
import { analyzeDependencyGraph, OperatorJourneyProjectionService, remediationForReasonCode } from '../packages/operator-experience/src/index';
import { phase34CanonicalState } from './fixtures/phase34-state';

const generatedAt = '2026-09-01T15:30:00.000Z';

describe('Phase 45 explicit dependency graph', () => {
  it('resolves parallel and serial work independently', () => {
    const parallel = analyzeDependencyGraph([
      { node_id: 'research', status: 'pending' },
      { node_id: 'design', status: 'pending' }
    ], []);
    expect(parallel).toMatchObject({ valid: true, ready_node_ids: ['research', 'design'], waiting_node_ids: [] });

    const serialWaiting = analyzeDependencyGraph([
      { node_id: 'research', status: 'running' },
      { node_id: 'implementation', status: 'pending' }
    ], [{ edge_id: 'edge_1', predecessor_node_id: 'research', successor_node_id: 'implementation', condition: 'succeeded', on_unsatisfied: 'wait' }]);
    expect(serialWaiting.ready_node_ids).toEqual([]);
    expect(serialWaiting.waiting_node_ids).toEqual(['implementation']);

    const serialReady = analyzeDependencyGraph([
      { node_id: 'research', status: 'succeeded' },
      { node_id: 'implementation', status: 'pending' }
    ], [{ edge_id: 'edge_1', predecessor_node_id: 'research', successor_node_id: 'implementation', condition: 'succeeded', on_unsatisfied: 'wait' }]);
    expect(serialReady.ready_node_ids).toEqual(['implementation']);
  });

  it('fails closed for cyclic, missing, and denied edges', () => {
    const cycle = analyzeDependencyGraph([
      { node_id: 'a', status: 'pending' }, { node_id: 'b', status: 'pending' }
    ], [
      { edge_id: 'a-b', predecessor_node_id: 'a', successor_node_id: 'b', condition: 'succeeded', on_unsatisfied: 'wait' },
      { edge_id: 'b-a', predecessor_node_id: 'b', successor_node_id: 'a', condition: 'succeeded', on_unsatisfied: 'wait' }
    ]);
    expect(cycle.valid).toBe(false);
    expect(cycle.cycle_node_ids).toEqual(['a', 'b']);

    const missing = analyzeDependencyGraph([{ node_id: 'a', status: 'pending' }], [{ edge_id: 'missing', predecessor_node_id: 'missing', successor_node_id: 'a', condition: 'succeeded', on_unsatisfied: 'wait' }]);
    expect(missing).toMatchObject({ valid: false, missing_edge_ids: ['missing'] });

    const denied = analyzeDependencyGraph([
      { node_id: 'approval', status: 'denied' }, { node_id: 'publish', status: 'pending' }
    ], [{ edge_id: 'approval-publish', predecessor_node_id: 'approval', successor_node_id: 'publish', condition: 'approved', on_unsatisfied: 'deny' }]);
    expect(denied.denied_edge_ids).toEqual(['approval-publish']);
    expect(denied.blocked_node_ids).toEqual(['publish']);
  });

  it('projects declared edges while preserving every current active step, ID, blocker, and action', () => {
    const state = new GuidedWorkflowService().project(phase34CanonicalState(), 'set-up-people', generatedAt);
    const expectedActive = new Map([
      ['set-up-people', 'enroll-two-humans'],
      ['connect-agents', 'create-ceremony'],
      ['run-governed-task', 'bind-mandates-and-tasks'],
      ['approve-protected-action', 'configure-policy'],
      ['connect-friend-node', 'configure-node'],
      ['prepare-hp-demonstration', 'create-clean-phase44-root']
    ]);
    const projection = new OperatorJourneyProjectionService();
    for (const workflow of state.workflows) {
      expect(workflow.active_step_id).toBe(expectedActive.get(workflow.workflow_id));
      expect(workflow.dependency_edges).toHaveLength(workflow.steps.reduce((count, step) => count + step.prerequisites.length, 0));
      for (const edge of workflow.dependency_edges) {
        expect(workflow.steps.find((step) => step.step_id === edge.successor_step_id)?.prerequisites).toContain(edge.predecessor_step_id);
      }
      const journey = projection.project(workflow);
      expect(journey.journey_id).toBe(workflow.workflow_id);
      expect(journey.active_step_id).toBe(workflow.active_step_id);
      expect(journey.steps.map((step) => step.step_id)).toEqual(workflow.steps.map((step) => step.step_id));
      expect(journey.steps.map((step) => step.reason_code)).toEqual(workflow.steps.map((step) => step.reason_code));
      expect(journey.steps.map((step) => step.canonical_reference_ids)).toEqual(workflow.steps.map((step) => step.evidence_refs));
    }
  });

  it('maps readable remediation without hiding or changing the original reason code', () => {
    expect(remediationForReasonCode('HUMAN_PROOF_EXPIRED')).toMatchObject({ remediation_id: 'refresh-human-proof', preserves_exact_scope: true, exposes_original_reason_code: true });
    expect(remediationForReasonCode('UNKNOWN_DOMAIN_DENIAL')).toMatchObject({ remediation_id: 'inspect-technical-details', automatic: false, exposes_original_reason_code: true });
  });
});

