import {
  guidedWorkflowStateSchema,
  type ControlPlaneCanonicalState,
  type GuidedWorkflow,
  type GuidedWorkflowAction,
  type GuidedWorkflowDestination,
  type GuidedWorkflowId,
  type GuidedWorkflowState,
  type GuidedWorkflowStep,
  type GuidedWorkflowStepStatus
} from '@h2a/contracts';

interface StepInput {
  id: string;
  title: string;
  complete: boolean;
  status?: GuidedWorkflowStepStatus;
  reasonCode: string;
  reason: string;
  destination: GuidedWorkflowDestination;
  label: string;
  evidence?: string[];
  purpose?: string;
  humanId?: string;
  kind?: GuidedWorkflowAction['kind'];
  dependsOn: string[];
}

interface WorkflowInput {
  id: GuidedWorkflowId;
  title: string;
  summary: string;
  steps: StepInput[];
}

export class GuidedWorkflowService {
  public project(canonical: ControlPlaneCanonicalState, selected: GuidedWorkflowId, generatedAt: string): GuidedWorkflowState {
    const workflows = workflowInputs(canonical).map((input) => buildWorkflow(input, generatedAt));
    const selectedWorkflow = workflows.find((workflow) => workflow.workflow_id === selected) ?? workflows[0]!;
    const activeStep = selectedWorkflow.steps.find((step) => step.step_id === selectedWorkflow.active_step_id) ?? null;
    return guidedWorkflowStateSchema.parse({
      schema_version: 1,
      selected_workflow_id: selectedWorkflow.workflow_id,
      workflows,
      next_action: activeStep?.action ?? null,
      active_step: activeStep,
      generated_at: generatedAt
    });
  }
}

function buildWorkflow(input: WorkflowInput, generatedAt: string): GuidedWorkflow {
  assertExplicitDependencies(input);
  const completed = new Set(input.steps.filter((item) => item.complete).map((item) => item.id));
  const steps = input.steps.map((item): GuidedWorkflowStep => {
    const prerequisites = item.dependsOn;
    if (!prerequisites.every((dependencyId) => completed.has(dependencyId))) {
      return { step_id: item.id, title: item.title, status: 'not-started', reason_code: 'PREREQUISITE_PENDING', prerequisites, evidence_refs: item.evidence ?? [], action: null };
    }
    if (item.complete) {
      return { step_id: item.id, title: item.title, status: 'succeeded', reason_code: 'PERSISTED_REQUIREMENT_SATISFIED', prerequisites, evidence_refs: item.evidence ?? [], action: null };
    }
    const status = item.status ?? 'ready';
    const kind = ['failed', 'denied', 'revoked', 'expired'].includes(status) ? 'retry' : item.kind ?? 'navigate';
    return {
      step_id: item.id,
      title: item.title,
      status,
      reason_code: item.reasonCode,
      prerequisites,
      evidence_refs: item.evidence ?? [],
      action: {
        action_id: `${input.id}.${item.id}`,
        kind,
        label: kind === 'retry' && !item.label.startsWith('Retry') ? `Retry ${item.label.toLowerCase()}` : item.label,
        reason: item.reason,
        destination: item.destination,
        operation_key: `${input.id}:${item.id}`,
        proof_purpose: item.purpose ?? null,
        proof_human_id: item.humanId ?? null
      }
    };
  });
  const completedSteps = steps.filter((step) => step.status === 'succeeded').length;
  const activeStep = steps.find((step) => step.status !== 'succeeded' && step.status !== 'not-started');
  const blocked = activeStep && ['failed', 'denied', 'revoked', 'expired'].includes(activeStep.status);
  return {
    workflow_id: input.id,
    title: input.title,
    summary: input.summary,
    status: completedSteps === steps.length ? 'complete' : blocked ? 'blocked' : completedSteps === 0 ? 'not-started' : 'in-progress',
    active_step_id: activeStep?.step_id ?? null,
    completed_steps: completedSteps,
    total_steps: steps.length,
    steps,
    dependency_edges: input.steps.flatMap((item) => item.dependsOn.map((dependencyId) => ({
      edge_id: `${input.id}.${dependencyId}.${item.id}`,
      predecessor_step_id: dependencyId,
      successor_step_id: item.id,
      condition: 'succeeded' as const,
      on_unsatisfied: 'block' as const
    }))),
    updated_at: generatedAt
  };
}

function assertExplicitDependencies(input: WorkflowInput): void {
  const ids = input.steps.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error(`WORKFLOW_STEP_ID_DUPLICATE:${input.id}`);
  const known = new Set(ids);
  for (const item of input.steps) {
    for (const dependencyId of item.dependsOn) {
      if (!known.has(dependencyId)) throw new Error(`WORKFLOW_DEPENDENCY_MISSING:${input.id}:${item.id}:${dependencyId}`);
      if (dependencyId === item.id) throw new Error(`WORKFLOW_DEPENDENCY_SELF_REFERENCE:${input.id}:${item.id}`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(input.steps.map((item) => [item.id, item]));
  const visit = (stepId: string): void => {
    if (visiting.has(stepId)) throw new Error(`WORKFLOW_DEPENDENCY_CYCLE:${input.id}:${stepId}`);
    if (visited.has(stepId)) return;
    visiting.add(stepId);
    for (const dependencyId of byId.get(stepId)!.dependsOn) visit(dependencyId);
    visiting.delete(stepId);
    visited.add(stepId);
  };
  for (const stepId of ids) visit(stepId);
}

function workflowInputs(canonical: ControlPlaneCanonicalState): WorkflowInput[] {
  const gate = (id: string) => canonical.final_acceptance.gates.find((item) => item.gate_id === id);
  const ceremony = canonical.ceremony.sessions.find((item) => item.ceremony_id === canonical.ceremony.active_ceremony_id);
  const bootstrap = canonical.guided_bootstrap;
  const activeMemberships = canonical.organization.memberships.filter((item) => item.status === 'active');
  const activeCredentials = canonical.organization.credentials.filter((item) => item.status === 'active');
  const freshHumans = bootstrap.humans.filter((human) => human.proof_status === 'fresh');
  const hasExpiredHuman = bootstrap.humans.some((human) => human.proof_status === 'expired');
  const activeGrants = canonical.context_broker.grants.filter((item) => item.status === 'active');
  const revokedGrant = canonical.context_broker.grants.find((item) => item.status === 'revoked');
  const activePolicy = canonical.approvals.policies.find((item) => item.status === 'active');
  const latestRequest = canonical.approvals.requests.at(-1);
  const requestDecisions = latestRequest ? canonical.approvals.decisions.filter((item) => item.approval_request_id === latestRequest.approval_request_id) : [];
  const completedResume = latestRequest ? canonical.approvals.resumes.find((item) => item.approval_request_id === latestRequest.approval_request_id && item.status === 'completed') : undefined;
  const activePeer = canonical.federation.peers.find((item) => item.status === 'active');
  const revokedPeer = canonical.federation.peers.find((item) => item.status === 'revoked');
  const acceptedTask = canonical.federation.receipts.find((item) => item.payload_type === 'task' && item.decision === 'accepted');
  const acceptedAck = canonical.federation.receipts.find((item) => item.payload_type === 'ack' && item.decision === 'accepted');
  const denialReceipt = canonical.federation.receipts.find((item) => item.decision === 'rejected' && ['FEDERATION_SEQUENCE_REPLAY', 'FEDERATION_PEER_INACTIVE', 'FEDERATION_ENVELOPE_EXPIRED'].includes(item.reason_code));
  const providerGate = gate('shared-provider-task');
  const frameworkGate = gate('external-framework');
  const contextGate = gate('context-minimization');
  const approvalGate = gate('authority-escalation');
  const evidenceGate = gate('evidence-reconstruction');
  const prerequisiteStep = ceremony?.steps.find((item) => item.step_id === 'prerequisites-assessed');
  const finalPackageEvent = canonical.evidence.events.find((item) => item.event.event_type === 'FINAL_ACCEPTANCE_PACKAGE_EXPORTED' && item.event.trace_id === canonical.final_acceptance.shared_trace_id);
  const requiredLivenessHumans = canonical.final_acceptance.phase44_readiness.liveness_verified_human_ids;
  const firstHumanId = bootstrap.administrator_human_id ?? bootstrap.humans[0]?.human_id;
  const secondHumanId = bootstrap.operator_human_id ?? bootstrap.humans.find((item) => item.human_id !== firstHumanId)?.human_id;
  const proofsComplete = bootstrap.humans.length === 2 && freshHumans.length === 2;
  const providerFailure = providerGate?.status === 'failed' || canonical.enterprise.traces.some((trace) => trace.event_types.some((eventType) => eventType.includes('FAILED') || eventType.includes('FAILURE')));
  const approverHumanId = canonical.organization.memberships.find((membership) => membership.membership_id === latestRequest?.eligible_membership_ids[0])?.human_id ?? null;

  return [
    {
      id: 'set-up-people', title: 'Set up people', summary: 'Enroll and verify two humans, establish signed organization authority, and prove separation of duty.',
      steps: declareDependencies([
        step('enroll-two-humans', 'Enroll two people', bootstrap.humans.length === 2 || canonical.enterprise.posture.active_humans >= 2, 'TWO_ENROLLED_HUMANS_REQUIRED', 'Two independently enrolled people are required before authority can be separated.', 'human-proof', 'Open Human Proof', [], 'authorize H2A command floor'),
        step('verify-two-humans', 'Verify both people', proofsComplete, hasExpiredHuman ? 'HUMAN_PROOF_EXPIRED' : 'FRESH_HUMAN_PROOF_REQUIRED', 'Each selected person needs a current purpose-bound Human Proof.', 'human-proof', hasExpiredHuman ? 'Refresh Human Proof' : 'Verify people', [], 'authorize H2A command floor', bootstrap.humans.find((human) => human.proof_status !== 'fresh')?.human_id, hasExpiredHuman ? 'expired' : 'awaiting-human'),
        step('establish-authority', 'Establish organization authority', activeMemberships.length >= 2 && activeCredentials.length >= 2, 'ORGANIZATION_AUTHORITY_REQUIRED', 'Create distinct active memberships and signed authority credentials for the two verified people.', 'people-authority', 'Configure authority', gate('organization-authority')?.evidence_refs),
        step('confirm-separation', 'Confirm separation of duty', gate('organization-authority')?.status === 'passed', 'SEPARATION_OF_DUTY_INCOMPLETE', 'The acceptance ledger must resolve distinct active authority roles.', 'demo-gate', 'Assess authority evidence', gate('organization-authority')?.evidence_refs, undefined, undefined, undefined, 'orchestrate')
      ], {
        'enroll-two-humans': [],
        'verify-two-humans': ['enroll-two-humans'],
        'establish-authority': ['verify-two-humans'],
        'confirm-separation': ['establish-authority']
      })
    },
    {
      id: 'connect-agents', title: 'Connect agents', summary: 'Create the shared ceremony, issue Passports, attest runtime sessions, and expose real provider readiness.',
      steps: declareDependencies([
        step('create-ceremony', 'Create shared ceremony', Boolean(ceremony), 'CEREMONY_REQUIRED', 'A durable ceremony and phase22 trace must exist before workload identities are linked.', 'demo-gate', 'Create ceremony'),
        step('issue-workload-identities', 'Issue workload identities', bootstrap.steps.find((item) => item.step_id === 'workload-identity')?.status === 'passed' && bootstrap.participants.every((item) => item.status === 'ready'), 'PASSPORT_SESSION_REQUIRED', 'Four provider/framework participants need active Passport V2 and runtime session references.', 'demo-gate', 'Create participants', bootstrap.steps.find((item) => item.step_id === 'workload-identity')?.evidence_refs),
        step('inspect-provider-readiness', 'Inspect provider readiness', bootstrap.participants.every((item) => item.status === 'ready'), 'PROVIDER_PREREQUISITE_REQUIRED', 'Resolve every explicit dependency, configuration, or authentication prerequisite before execution.', 'settings', 'Open connector settings')
      ], {
        'create-ceremony': [],
        'issue-workload-identities': ['create-ceremony'],
        'inspect-provider-readiness': ['issue-workload-identities']
      })
    },
    {
      id: 'run-governed-task', title: 'Run governed task', summary: 'Bind assignments and mandates, disclose least context, then run the real provider and framework lanes in order.',
      steps: declareDependencies([
        step('bind-mandates-and-tasks', 'Bind mandates and assignments', bootstrap.steps.find((item) => item.step_id === 'mandates-and-tasks')?.status === 'passed', 'MANDATE_ASSIGNMENT_REQUIRED', 'Issue the bounded mandate graph and four persisted assignments.', 'demo-gate', 'Issue mandates and tasks', bootstrap.steps.find((item) => item.step_id === 'mandates-and-tasks')?.evidence_refs),
        step('issue-context-grants', 'Issue least-context grants', contextGate?.status === 'passed' || activeGrants.length >= 4, revokedGrant && activeGrants.length === 0 ? 'CONTEXT_GRANT_REVOKED' : 'ACTIVE_CONTEXT_GRANTS_REQUIRED', 'Seal the artifact and issue recipient-bound grants before any provider receives context.', 'context-broker', revokedGrant && activeGrants.length === 0 ? 'Renew context grants' : 'Prepare least context', contextGate?.evidence_refs, 'administer protected context', bootstrap.administrator_human_id ?? undefined, revokedGrant && activeGrants.length === 0 ? 'revoked' : undefined),
        step('run-provider-lanes', 'Run provider lanes', providerGate?.status === 'passed', providerFailure ? 'PROVIDER_EXECUTION_FAILED' : 'PROVIDER_RUNS_REQUIRED', 'Run Claude, Antigravity, and Codex on the shared trace; retry only the failed lane.', 'command-floor', providerFailure ? 'Retry failed provider' : 'Run provider lanes', providerGate?.evidence_refs, undefined, undefined, providerFailure ? 'failed' : undefined),
        step('run-framework-lane', 'Run framework lane', frameworkGate?.status === 'passed', 'FRAMEWORK_ACK_REQUIRED', 'The conformant framework delivery must be signed and acknowledged on the same trace.', 'command-floor', 'Run framework lane', frameworkGate?.evidence_refs)
      ], {
        'bind-mandates-and-tasks': [],
        'issue-context-grants': ['bind-mandates-and-tasks'],
        'run-provider-lanes': ['issue-context-grants'],
        'run-framework-lane': ['run-provider-lanes']
      })
    },
    {
      id: 'approve-protected-action', title: 'Approve protected action', summary: 'Freeze one exact effect, route it to an independent human, and resume it exactly once.',
      steps: declareDependencies([
        step('configure-policy', 'Configure approval policy', Boolean(activePolicy), 'ACTIVE_APPROVAL_POLICY_REQUIRED', 'Create a purpose-bound quorum policy before routing protected work.', 'authority-inbox', 'Configure policy'),
        step('route-request', 'Route protected request', Boolean(latestRequest), 'PROTECTED_REQUEST_REQUIRED', 'Verify the requester for the exact purpose and freeze the requested effect.', 'authority-inbox', 'Route protected action', [], 'request restricted findings publication', bootstrap.operator_human_id ?? undefined, 'awaiting-human'),
        step('independent-decision', 'Record independent decision', requestDecisions.length > 0, latestRequest?.status === 'rejected' ? 'APPROVAL_REJECTED' : 'INDEPENDENT_APPROVER_REQUIRED', 'A different eligible employee must verify the policy purpose and sign the decision.', 'authority-inbox', latestRequest?.status === 'rejected' ? 'Route replacement request' : 'Review approval', requestDecisions.map((item) => item.approval_decision_id), activePolicy?.proof_purpose, approverHumanId ?? undefined, latestRequest?.status === 'rejected' ? 'denied' : 'awaiting-approval'),
        step('resume-once', 'Resume exactly once', Boolean(completedResume) || approvalGate?.status === 'passed', 'EXACTLY_ONCE_RESUME_REQUIRED', 'Consume the approved one-use child mandate and persist one completed effect.', 'authority-inbox', 'Resume approved action', approvalGate?.evidence_refs)
      ], {
        'configure-policy': [],
        'route-request': ['configure-policy'],
        'independent-decision': ['route-request'],
        'resume-once': ['independent-decision']
      })
    },
    {
      id: 'connect-friend-node', title: 'Connect friend node', summary: 'Pin a second local root, exchange minimized envelopes, and persist replay and revocation denials.',
      steps: declareDependencies([
        step('configure-node', 'Configure local node', Boolean(canonical.federation.local_node), 'FEDERATION_NODE_REQUIRED', 'Create this installation identity before accepting a friend node.', 'federation', 'Configure node', [], 'administer trusted federation peers', bootstrap.administrator_human_id ?? undefined, 'awaiting-human'),
        step('activate-peer', 'Activate pinned peer', Boolean(activePeer), revokedPeer ? 'FEDERATION_PEER_INACTIVE' : 'ACTIVE_PINNED_PEER_REQUIRED', 'Complete invitation, registration, acceptance, and key-pin verification on both roots.', 'federation', revokedPeer ? 'Create replacement peer' : 'Complete handshake', [], 'administer trusted federation peers', bootstrap.administrator_human_id ?? undefined, revokedPeer ? 'revoked' : undefined),
        step('exchange-task', 'Exchange bounded task', Boolean(acceptedTask), 'FEDERATION_TASK_REQUIRED', 'Send one least-context task over the real loopback listener.', 'federation', 'Send task', acceptedTask ? [acceptedTask.receipt_id] : []),
        step('acknowledge-task', 'Acknowledge receipt', Boolean(acceptedAck), 'FEDERATION_ACK_REQUIRED', 'The receiving node must return a signed acknowledgement.', 'federation', 'Acknowledge task', acceptedAck ? [acceptedAck.receipt_id] : []),
        step('prove-denials', 'Prove replay and revocation denial', Boolean(denialReceipt), 'FEDERATION_DENIAL_PROOF_REQUIRED', 'Persist a reason-coded denial without disclosing the task body.', 'federation', 'Run denial proofs', denialReceipt ? [denialReceipt.receipt_id] : [])
      ], {
        'configure-node': [],
        'activate-peer': ['configure-node'],
        'exchange-task': ['activate-peer'],
        'acknowledge-task': ['exchange-task'],
        'prove-denials': ['acknowledge-task']
      })
    },
    {
      id: 'prepare-hp-demonstration', title: 'Prepare HP demonstration', summary: 'Assess every real gate, reconstruct the shared trace, and keep export fail-closed until acceptance passes.',
      steps: declareDependencies([
        step('create-clean-phase44-root', 'Create clean Phase 44 root', canonical.final_acceptance.phase44_readiness.clean_session, 'CLEAN_PHASE44_SESSION_REQUIRED', 'Create the isolated final-acceptance root, then launch H2A with its generated H2A_DATA_PATH.', 'demo-gate', 'Prepare clean session'),
        step('lock-required-liveness', 'Lock required liveness', canonical.final_acceptance.phase44_readiness.required_liveness_mode, 'REQUIRED_LIVENESS_DISABLED', 'Enable required liveness for the final ceremony. This control only strengthens policy.', 'demo-gate', 'Require liveness'),
        step('verify-first-human', 'Verify first human with liveness', Boolean(firstHumanId && requiredLivenessHumans.includes(firstHumanId)), 'FIRST_REQUIRED_LIVENESS_PROOF_REQUIRED', 'The Administrator / Approver must complete the shared in-place liveness challenge.', 'human-proof', 'Verify first human', [], 'complete Phase 44 required-liveness acceptance', firstHumanId),
        step('verify-second-human', 'Verify second human with liveness', Boolean(secondHumanId && requiredLivenessHumans.includes(secondHumanId)), 'SECOND_REQUIRED_LIVENESS_PROOF_REQUIRED', 'The Operator must independently complete the shared in-place liveness challenge.', 'human-proof', 'Verify second human', [], 'complete Phase 44 required-liveness acceptance', secondHumanId),
        step('prove-approval-withdrawal', 'Prove approval withdrawal', Boolean(canonical.final_acceptance.phase44_readiness.approval_withdrawal_evidence_ref), 'APPROVAL_WITHDRAWAL_EVIDENCE_REQUIRED', 'Create a disposable protected request and withdraw it with the exact-purpose shared proof dialog.', 'authority-inbox', 'Open withdrawal workflow', canonical.final_acceptance.phase44_readiness.approval_withdrawal_evidence_ref ? [canonical.final_acceptance.phase44_readiness.approval_withdrawal_evidence_ref] : [], 'withdraw protected approval request', firstHumanId),
        step('complete-project-integration', 'Complete governed project delivery', Boolean(canonical.final_acceptance.phase44_readiness.project_integration_evidence_ref), 'PROJECT_INTEGRATION_EVIDENCE_REQUIRED', 'Integrate a real validated assignment through the independent approval boundary.', 'command-floor', 'Open project delivery', canonical.final_acceptance.phase44_readiness.project_integration_evidence_ref ? [canonical.final_acceptance.phase44_readiness.project_integration_evidence_ref] : []),
        step('create-acceptance-ceremony', 'Create acceptance ceremony', Boolean(ceremony), 'CEREMONY_REQUIRED', 'Create a clean durable ceremony before assessing enterprise readiness.', 'demo-gate', 'Create ceremony'),
        step('assess-prerequisites', 'Assess prerequisites', prerequisiteStep?.status === 'passed', prerequisiteStep?.status === 'failed' ? 'PREREQUISITE_ASSESSMENT_FAILED' : 'PREREQUISITES_NOT_ASSESSED', 'Run the safe prerequisite assessment against current persisted state.', 'demo-gate', 'Assess prerequisites', prerequisiteStep?.evidence_refs, undefined, undefined, prerequisiteStep?.status === 'failed' ? 'failed' : undefined, 'orchestrate'),
        step('complete-control-gates', 'Complete control gates', canonical.final_acceptance.completion.passed === canonical.final_acceptance.completion.total, 'ACCEPTANCE_GATES_INCOMPLETE', `${canonical.final_acceptance.completion.passed} of ${canonical.final_acceptance.completion.total} evidence gates currently pass.`, 'demo-gate', 'Open remaining gate', canonical.final_acceptance.gates.flatMap((item) => item.evidence_refs)),
        step('reconstruct-evidence', 'Reconstruct shared trace', evidenceGate?.status === 'passed', 'TRACE_RECONSTRUCTION_INCOMPLETE', 'Resolve both humans, authority, Passports, sessions, grants, decisions, actions, and outputs on one trace.', 'evidence', 'Inspect trace reconstruction', evidenceGate?.evidence_refs),
        step('export-package', 'Export signed minimized package', Boolean(finalPackageEvent), canonical.final_acceptance.phase44_readiness.package_eligible ? 'PACKAGE_EXPORT_REQUIRED' : 'FINAL_ACCEPTANCE_REQUIRED', canonical.final_acceptance.phase44_readiness.package_eligible ? 'Export and independently verify the organization-signed minimized package.' : 'Export remains blocked until the verified ledger and all Phase 44 requirements pass.', 'demo-gate', 'Export acceptance package', finalPackageEvent ? [finalPackageEvent.event.event_id] : [])
      ], {
        'create-clean-phase44-root': [],
        'lock-required-liveness': ['create-clean-phase44-root'],
        'verify-first-human': ['lock-required-liveness'],
        'verify-second-human': ['verify-first-human'],
        'prove-approval-withdrawal': ['verify-second-human'],
        'complete-project-integration': ['prove-approval-withdrawal'],
        'create-acceptance-ceremony': ['complete-project-integration'],
        'assess-prerequisites': ['create-acceptance-ceremony'],
        'complete-control-gates': ['assess-prerequisites'],
        'reconstruct-evidence': ['complete-control-gates'],
        'export-package': ['reconstruct-evidence']
      })
    }
  ];
}

function step(
  id: string,
  title: string,
  complete: boolean,
  reasonCode: string,
  reason: string,
  destination: GuidedWorkflowDestination,
  label: string,
  evidence: string[] = [],
  purpose?: string,
  humanId?: string,
  status?: GuidedWorkflowStepStatus,
  kind?: GuidedWorkflowAction['kind']
): StepInput {
  return { id, title, complete, reasonCode, reason, destination, label, evidence, purpose, humanId, status, kind, dependsOn: [] };
}

function declareDependencies(steps: StepInput[], dependencies: Record<string, string[]>): StepInput[] {
  const stepIds = new Set(steps.map((item) => item.id));
  if (Object.keys(dependencies).length !== steps.length || Object.keys(dependencies).some((stepId) => !stepIds.has(stepId))) {
    throw new Error('WORKFLOW_DEPENDENCY_DECLARATION_INCOMPLETE');
  }
  return steps.map((item) => ({ ...item, dependsOn: [...dependencies[item.id]!] }));
}
