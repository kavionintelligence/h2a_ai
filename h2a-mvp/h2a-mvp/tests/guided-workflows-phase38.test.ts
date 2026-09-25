import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ControlPlaneCanonicalState } from '@h2a/contracts';
import { CONTROL_PLANE_PROTOCOL_VERSION } from '@h2a/contracts';
import { GuidedWorkflowService } from '@h2a/office';
import { H2AControlPlaneHost } from '@h2a/control-plane';
import { LocalAppearancePreferencesRepository } from '@h2a/storage';
import { phase34CanonicalState } from './fixtures/phase34-state';

const roots: string[] = [];
const generatedAt = '2026-08-27T12:00:00.000Z';

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('Phase 38 guided workflow projection', () => {
  it('exposes six clean workflows with exactly one actionable prerequisite and no route loop', () => {
    const state = project(phase34CanonicalState());
    expect(state.workflows).toHaveLength(6);
    expect(state.next_action).toMatchObject({ action_id: 'set-up-people.enroll-two-humans', destination: 'human-proof' });
    const selected = state.workflows[0]!;
    expect(selected.steps.filter((step) => step.action)).toHaveLength(1);
    expect(selected.steps.slice(1).every((step) => step.status === 'not-started' && step.action === null)).toBe(true);
    expect(new Set(selected.steps.map((step) => step.step_id)).size).toBe(selected.steps.length);
  });

  it('resumes a partial people workflow at an expired exact-purpose Human Proof for the correct subject', () => {
    const canonical = phase34CanonicalState();
    canonical.guided_bootstrap.humans = [human('human_admin', 'expired'), human('human_operator', 'fresh')];
    const state = project(canonical);
    expect(state.active_step).toMatchObject({ step_id: 'verify-two-humans', status: 'expired', reason_code: 'HUMAN_PROOF_EXPIRED' });
    expect(state.next_action).toMatchObject({
      kind: 'retry', destination: 'human-proof', proof_purpose: 'authorize H2A command floor', proof_human_id: 'human_admin'
    });
    expect(state.workflows[0]!.steps[0]!.action).toBeNull();
  });

  it('stops denied approval, revoked federation, and failed-provider cases at their failed step', () => {
    const approval = phase34CanonicalState();
    approval.guided_bootstrap.operator_human_id = 'human_operator';
    approval.organization.memberships = [{ membership_id: 'membership_approver', human_id: 'human_approver' } as ControlPlaneCanonicalState['organization']['memberships'][number]];
    approval.approvals.policies = [{ approval_policy_id: 'policy_1', status: 'active', proof_purpose: 'approve restricted findings publication' } as ControlPlaneCanonicalState['approvals']['policies'][number]];
    approval.approvals.requests = [{ approval_request_id: 'request_1', status: 'rejected', eligible_membership_ids: ['membership_approver'] } as ControlPlaneCanonicalState['approvals']['requests'][number]];
    expect(project(approval, 'approve-protected-action').active_step).toMatchObject({ step_id: 'independent-decision', status: 'denied' });

    const federation = phase34CanonicalState();
    federation.federation.local_node = {} as ControlPlaneCanonicalState['federation']['local_node'];
    federation.federation.peers = [{ status: 'revoked' } as ControlPlaneCanonicalState['federation']['peers'][number]];
    expect(project(federation, 'connect-friend-node').active_step).toMatchObject({ step_id: 'activate-peer', status: 'revoked' });

    const provider = phase34CanonicalState();
    provider.guided_bootstrap.steps.find((step) => step.step_id === 'mandates-and-tasks')!.status = 'passed';
    provider.final_acceptance.gates.find((gate) => gate.gate_id === 'context-minimization')!.status = 'passed';
    provider.final_acceptance.gates.find((gate) => gate.gate_id === 'shared-provider-task')!.status = 'failed';
    expect(project(provider, 'run-governed-task').active_step).toMatchObject({ step_id: 'run-provider-lanes', status: 'failed', reason_code: 'PROVIDER_EXECUTION_FAILED' });
  });

  it('does not repeat completed approval work and preserves separation-of-duty references', () => {
    const canonical = phase34CanonicalState();
    canonical.organization.memberships = [{ membership_id: 'membership_approver', human_id: 'human_approver' } as ControlPlaneCanonicalState['organization']['memberships'][number]];
    canonical.approvals.policies = [{ approval_policy_id: 'policy_1', status: 'active', proof_purpose: 'approve restricted findings publication' } as ControlPlaneCanonicalState['approvals']['policies'][number]];
    canonical.approvals.requests = [{ approval_request_id: 'request_1', status: 'approved', eligible_membership_ids: ['membership_approver'] } as ControlPlaneCanonicalState['approvals']['requests'][number]];
    canonical.approvals.decisions = [{ approval_request_id: 'request_1', approval_decision_id: 'decision_1', approver_human_id: 'human_approver' } as ControlPlaneCanonicalState['approvals']['decisions'][number]];
    canonical.approvals.resumes = [{ approval_request_id: 'request_1', status: 'completed' } as ControlPlaneCanonicalState['approvals']['resumes'][number]];
    const workflow = project(canonical, 'approve-protected-action').workflows.find((item) => item.workflow_id === 'approve-protected-action')!;
    expect(workflow.status).toBe('complete');
    expect(workflow.steps.every((step) => step.status === 'succeeded' && step.action === null)).toBe(true);
  });

  it('persists selected workflow across host restart without persisting a duplicate success state', async () => {
    const root = await temporaryRoot();
    const source = { load: async () => phase34CanonicalState() };
    const first = new H2AControlPlaneHost(source, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'phase38_first' });
    await first.initialize();
    const attached = first.attach({ client_id: 'phase38_client', protocol_version: CONTROL_PLANE_PROTOCOL_VERSION, requested_capabilities: ['workspace.observe', 'workspace.refresh', 'appearance.read', 'appearance.write'] });
    const lease = { host_instance_id: attached.host_instance_id, lease_id: attached.lease_id, client_id: attached.client_id, generation: attached.connection.generation };
    const selected = await first.execute({ ...lease, command: { type: 'workflow.select', workflow_id: 'connect-friend-node' } });
    expect(selected.office.workflow.selected_workflow_id).toBe('connect-friend-node');

    const restarted = new H2AControlPlaneHost(source, new LocalAppearancePreferencesRepository(root), { hostInstanceId: 'phase38_restarted' });
    await restarted.initialize();
    const nextAttach = restarted.attach({ client_id: 'phase38_client_restart', protocol_version: CONTROL_PLANE_PROTOCOL_VERSION, requested_capabilities: ['workspace.observe', 'workspace.refresh', 'appearance.read', 'appearance.write'] });
    const restored = await restarted.getSnapshot({ host_instance_id: nextAttach.host_instance_id, lease_id: nextAttach.lease_id, client_id: nextAttach.client_id, generation: nextAttach.connection.generation });
    expect(restored.office.workflow.selected_workflow_id).toBe('connect-friend-node');
    expect(restored.office.workflow.next_action?.action_id).toBe('connect-friend-node.configure-node');
  });

  it('runs an allowlisted safe orchestration once and rejects the completed stale step', async () => {
    const root = await temporaryRoot();
    const canonical = phase34CanonicalState();
    canonical.ceremony.active_ceremony_id = 'ceremony_phase38';
    canonical.ceremony.sessions = [ceremonySession()];
    canonical.final_acceptance.manifest.session_id = 'phase44-2026-08-31T00-00-00-000Z-00000000-0000-4000-8000-000000000000';
    canonical.final_acceptance.phase44_readiness = { clean_session: true, required_liveness_mode: true, liveness_verified_human_ids: ['human_admin', 'human_operator'], approval_withdrawal_evidence_ref: 'evt_withdrawn', project_integration_evidence_ref: 'evt_integrated', package_eligible: false };
    canonical.guided_bootstrap.administrator_human_id = 'human_admin';
    canonical.guided_bootstrap.operator_human_id = 'human_operator';
    let executions = 0;
    const host = new H2AControlPlaneHost({ load: async () => canonical }, new LocalAppearancePreferencesRepository(root), {
      hostInstanceId: 'phase38_orchestration',
      workflowExecutor: {
        execute: async (operationKey) => {
          expect(operationKey).toBe('prepare-hp-demonstration:assess-prerequisites');
          executions += 1;
          canonical.ceremony.sessions[0]!.steps.find((step) => step.step_id === 'prerequisites-assessed')!.status = 'passed';
        }
      }
    });
    await host.initialize();
    const attached = host.attach({ client_id: 'phase38_orchestrator', protocol_version: CONTROL_PLANE_PROTOCOL_VERSION, requested_capabilities: ['workspace.observe', 'workspace.refresh', 'workspace.control', 'appearance.read', 'appearance.write'] });
    const lease = { host_instance_id: attached.host_instance_id, lease_id: attached.lease_id, client_id: attached.client_id, generation: attached.connection.generation };
    await host.execute({ ...lease, command: { type: 'workflow.select', workflow_id: 'prepare-hp-demonstration' } });
    const advanced = await host.execute({ ...lease, command: { type: 'workflow.advance', workflow_id: 'prepare-hp-demonstration', step_id: 'assess-prerequisites' } });
    expect(executions).toBe(1);
    expect(advanced.office.workflow.active_step?.step_id).toBe('complete-control-gates');
    await expect(host.execute({ ...lease, command: { type: 'workflow.advance', workflow_id: 'prepare-hp-demonstration', step_id: 'assess-prerequisites' } })).rejects.toThrow('WORKFLOW_STEP_STALE_OR_NOT_ORCHESTRATABLE');
    expect(executions).toBe(1);
  });
});

function project(canonical: ControlPlaneCanonicalState, selected: Parameters<GuidedWorkflowService['project']>[1] = 'set-up-people') {
  return new GuidedWorkflowService().project(canonical, selected, generatedAt);
}

function human(humanId: string, proofStatus: 'fresh' | 'expired') {
  return {
    human_id: humanId,
    display_name: humanId,
    membership_id: `membership_${humanId}`,
    enrollment_id: `enrollment_${humanId}`,
    token_set_size: 20,
    required_matches: 1,
    model_set_hash: `sha256:${'a'.repeat(64)}`,
    proof_id: `proof_${humanId}`,
    proof_expires_at: proofStatus === 'fresh' ? '2026-08-27T13:00:00.000Z' : '2026-08-27T11:00:00.000Z',
    proof_status: proofStatus,
    assurance_level: 'substantial' as const
  };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase38-'));
  roots.push(root);
  return root;
}

function ceremonySession(): ControlPlaneCanonicalState['ceremony']['sessions'][number] {
  const ids = ['session-created', 'prerequisites-assessed', 'organization-authority', 'workload-identity', 'shared-provider-task', 'external-framework', 'context-minimization', 'authority-escalation', 'runtime-containment', 'adversarial-controls', 'restart-recovery', 'evidence-reconstruction'] as const;
  return {
    schema_version: 1,
    ceremony_id: 'ceremony_phase38',
    trace_id: 'phase22_phase38',
    title: 'Phase 38 ceremony',
    status: 'active',
    create_idempotency_key: 'phase38_create',
    participants: [],
    resources: [],
    steps: ids.map((step_id) => ({
      step_id,
      title: step_id.replaceAll('-', ' '),
      status: step_id === 'session-created' ? 'passed' : step_id === 'prerequisites-assessed' ? 'ready' : 'not-ready',
      blocker: step_id === 'session-created' ? null : 'Complete the preceding requirement.',
      attempts: 0,
      idempotency_keys: [],
      evidence_refs: [],
      started_at: null,
      completed_at: step_id === 'session-created' ? generatedAt : null
    })),
    created_at: generatedAt,
    updated_at: generatedAt
  };
}
