import {
  configureHumanEscalationRequestSchema, humanEscalationStateSchema, startHumanEscalationRejectionRequestSchema,
  startHumanEscalationRequestSchema, type AgentIdentityState, type AuthorityActor, type AuthorityApprovalState,
  type CeremonyCorrelation, type CollaborationState, type ContextBrokerState, type CreateApprovalPolicyRequest,
  type CreateAssignmentRequest, type CreateAuthorityRoleRequest, type HumanEscalationState, type HumanIdentityV2State,
  type IssueAuthorityCredentialRequest, type IssueContextGrantRequest, type LeastContextState, type LiveRuntimeState,
  type MandateState, type MembershipLifecycleRequest, type OrganizationAuthorityState, type RequestAuthorityEscalation,
  type StartLiveRunRequest, type UpdateAssignmentRequest
} from '@h2a/contracts';
import { hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const POLICY_ID = 'policy_phase28_findings_publish';
const ROLE_ID = 'role_phase28_findings_approver';
const APPROVAL_PURPOSE = 'approve restricted findings publication';
const REQUEST_PURPOSE = 'request restricted findings publication';
const RESOURCE = 'hp.evidence-ledger';
const ACTION = 'findings.publish';
const POWER = 'findings.publish.approve';

export interface HumanEscalationPorts {
  leastContext: { getState(): Promise<LeastContextState> };
  ceremony: { assertBinding(ceremonyId: string, traceId: string): Promise<unknown>; bindResource(correlation: CeremonyCorrelation, kind: 'assignment' | 'mandate' | 'live-run', resourceId: string): Promise<unknown> };
  humans: { getState(selectedHumanId?: string): Promise<HumanIdentityV2State> };
  organization: {
    getState(): Promise<OrganizationAuthorityState>;
    createRole(request: CreateAuthorityRoleRequest): Promise<OrganizationAuthorityState>;
    updateMembership(request: MembershipLifecycleRequest): Promise<OrganizationAuthorityState>;
    issueCredential(request: IssueAuthorityCredentialRequest): Promise<OrganizationAuthorityState>;
  };
  approvals: {
    getState(): Promise<AuthorityApprovalState>;
    createPolicy(request: CreateApprovalPolicyRequest): Promise<AuthorityApprovalState>;
    requestEscalation(request: RequestAuthorityEscalation): Promise<AuthorityApprovalState>;
    recoverInterruptedResume(approvalRequestId: string, idempotencyKey: string, providerRunObserved: boolean): Promise<AuthorityApprovalState>;
  };
  agents: { getState(): Promise<AgentIdentityState> };
  mandates: { getState(): Promise<MandateState>; authorize(request: Parameters<MandateStatePort['authorize']>[0]): Promise<MandateState> };
  collaboration: {
    getState(): Promise<CollaborationState>;
    createAssignment(request: CreateAssignmentRequest): Promise<CollaborationState>;
    updateAssignment(request: UpdateAssignmentRequest): Promise<CollaborationState>;
    recordResponse(request: { assignmentId: string; agentId: string; body: string }): Promise<CollaborationState>;
  };
  context: { getState(): Promise<ContextBrokerState>; issueGrant(request: IssueContextGrantRequest): Promise<ContextBrokerState> };
  runtime: { getState(): Promise<LiveRuntimeState>; start(request: StartLiveRunRequest): Promise<LiveRuntimeState> };
}
interface MandateStatePort { authorize(request: { agentId: string; mandateId: string; resource: string; action: string; parameters: Record<string, unknown>; requestedFields: string[]; idempotencyKey: string; assignmentId?: string }): Promise<MandateState> }

export class HumanEscalationCoordinator {
  private readonly repository: VersionedJsonRepository<'h2a.human-escalation.state', HumanEscalationState>;
  private queue: Promise<void> = Promise.resolve();

  public constructor(dataPath: string, private readonly evidence: EvidenceLedgerPort, private readonly ports: HumanEscalationPorts, private readonly workspacePath: string, private readonly clock: () => Date = () => new Date()) {
    this.repository = new VersionedJsonRepository(new AtomicFileStore(dataPath), 'authority/phase28-state-v1.json', 'h2a.human-escalation.state', humanEscalationStateSchema, { initialData: emptyState(clock), clock });
  }

  public async initialize(): Promise<HumanEscalationState> {
    const state = await this.repository.read();
    const approvals = await this.ports.approvals.getState();
    const executing = approvals.resumes.find((item) => item.approval_request_id === state.approval_request_id && item.status === 'executing');
    if (executing) {
      const runtime = await this.ports.runtime.getState();
      await this.ports.approvals.recoverInterruptedResume(executing.approval_request_id, executing.idempotency_key, runtime.runs.some((item) => item.idempotency_key === executing.idempotency_key));
    }
    return this.getState();
  }
  public getState(): Promise<HumanEscalationState> { return this.serialize(async () => this.reconcile(await this.repository.read())); }

  public configure(request: unknown): Promise<HumanEscalationState> {
    return this.serialize(async () => {
      const input = configureHumanEscalationRequestSchema.parse(request);
      await this.requirePrerequisites(input.ceremony);
      const existing = await this.repository.read();
      if (existing.completed_idempotency_keys.includes(input.ceremony.idempotency_key)) return this.reconcile(existing);
      let organization = await this.ports.organization.getState();
      const actorMembership = required(organization.memberships.find((item) => item.membership_id === input.actor.membership_id && item.status === 'active'), 'Verified authority administrator membership is unavailable.');
      let actor = {
        ...input.actor,
        authority_credential_id: required(
          organization.credentials.find((item) => item.membership_id === actorMembership.membership_id && item.status === 'active'),
          'Active authority administrator credential is unavailable.'
        ).credential_id
      };
      const requester = required(organization.memberships.find((item) => item.status === 'active' && item.membership_id !== actorMembership.membership_id && item.role_ids.includes('role_h2a_operator')), 'A distinct active operator membership is required.');
      if (!organization.roles.some((item) => item.role_id === ROLE_ID)) organization = await this.ports.organization.createRole({ actor, organization_id: actorMembership.organization_id, role_id: ROLE_ID, name: 'Findings Publication Approver', description: 'Independently approves the exact restricted findings publication effect.', authority_scopes: [{ resource: RESOURCE, actions: [ACTION] }], approval_powers: [POWER], ceremony: suffix(input.ceremony, 'role') });
      const approver = required(organization.memberships.find((item) => item.membership_id === actorMembership.membership_id), 'Approver membership disappeared.');
      if (!approver.role_ids.includes(ROLE_ID)) organization = await this.ports.organization.updateMembership({ actor, membership_id: approver.membership_id, action: 'assign-roles', role_ids: [...new Set([...approver.role_ids, ROLE_ID])], ceremony: suffix(input.ceremony, 'membership') });
      let approvals = await this.ports.approvals.getState();
      if (!approvals.policies.some((item) => item.approval_policy_id === POLICY_ID)) approvals = await this.ports.approvals.createPolicy({ actor, organization_id: actorMembership.organization_id, approval_policy_id: POLICY_ID, name: 'Restricted findings publication', eligible_role_ids: [ROLE_ID], quorum: 1, separation_of_duty: true, risk_tiers: ['restricted'], proof_purpose: APPROVAL_PURPOSE, decision_ttl_seconds: 600, ceremony: suffix(input.ceremony, 'policy') });
      organization = await this.ports.organization.getState();
      const currentApprover = required(organization.memberships.find((item) => item.membership_id === approver.membership_id), 'Approver membership is unavailable.');
      const activeCredential = organization.credentials.find((item) => item.membership_id === currentApprover.membership_id && item.status === 'active' && item.approval_policy_ids.includes(POLICY_ID) && item.role_ids.includes(ROLE_ID));
      if (!activeCredential) organization = await this.ports.organization.issueCredential({ actor, organization_id: currentApprover.organization_id, membership_id: currentApprover.membership_id, role_ids: currentApprover.role_ids, resource_constraints: [], action_constraints: [], approval_policy_ids: [POLICY_ID], expires_at: new Date(this.clock().getTime() + 2 * 60 * 60 * 1000).toISOString(), ceremony: suffix(input.ceremony, 'credential') });
      actor = {
        ...actor,
        authority_credential_id: required(
          organization.credentials.find((item) => item.membership_id === currentApprover.membership_id && item.status === 'active' && item.approval_policy_ids.includes(POLICY_ID) && item.role_ids.includes(ROLE_ID)),
          'Phase 28 authority credential was not activated.'
        ).credential_id
      };

      const identity = await this.ports.agents.getState();
      const passport = required(identity.passportsV2?.find((item) => item.connector_manifest_id === 'connector_claude-code_v1' && item.status === 'active'), 'Active Claude Passport V2 is required.');
      const binding = required(identity.bindings.find((item) => item.agent_id === passport.agent_id && item.connection_state === 'connected'), 'Connected Claude runtime binding is required.');
      const session = required(identity.runtimeSessions?.find((item) => item.runtime_session_id === binding.live_session_id && ['ready', 'working'].includes(item.state)), 'Active Claude runtime session is required.');
      const mandates = await this.ports.mandates.getState();
      const mandate = required([...mandates.mandates].reverse().find((item) => item.subject.passportId === passport.passport_id && item.status === 'active' && new Date(item.expiresAt).getTime() > this.clock().getTime()), 'Active Claude mandate is required.');
      const before = await this.ports.collaboration.getState();
      const priorAssignment = before.workplace.assignments.find((item) => item.traceId === input.ceremony.trace_id && item.title === 'Restricted findings publication' && item.assigneeId === binding.binding_id);
      const created = priorAssignment ? before : await this.ports.collaboration.createAssignment({ title: 'Restricted findings publication', objective: 'Publish the approved HP control finding after independent human authorization.', assigneeId: binding.binding_id, risk: 'restricted', priority: 1, dependsOn: [], requestedAction: ACTION, ceremony: suffix(input.ceremony, 'assignment') });
      const assignment = priorAssignment ?? required(created.workplace.assignments.find((item) => !before.workplace.assignments.some((old) => old.id === item.id)), 'Phase 28 assignment was not persisted.');
      await this.ports.ceremony.bindResource(suffix(input.ceremony, 'assignment-bind'), 'assignment', assignment.id);
      const contextBefore = await this.ports.context.getState();
      const least = await this.ports.leastContext.getState();
      const artifact = required(least.artifact_id, 'Phase 27 protected artifact is unavailable.');
      const priorGrant = contextBefore.grants.find((item) => item.grant.task_id === assignment.id && item.grant.purpose === 'review restricted findings publication' && item.status === 'active');
      const contextAfter = priorGrant ? contextBefore : await this.ports.context.issueGrant({ actor, organization_id: actorMembership.organization_id, task_id: assignment.id, mandate_id: mandate.mandateId, recipient_agent_id: mandate.subject.agentId, recipient_passport_id: passport.passport_id, purpose: 'review restricted findings publication', field_rules: [{ artifact_id: artifact, field: 'case_id', maximum_classification: 'confidential', transformation: 'reference' }, { artifact_id: artifact, field: 'control_summary', maximum_classification: 'restricted', transformation: 'summarize' }], token_budget: 120, maximum_uses: 2, expires_at: new Date(this.clock().getTime() + 60 * 60 * 1000).toISOString(), ceremony: suffix(input.ceremony, 'review-grant') });
      const grant = priorGrant ?? required(contextAfter.grants.find((item) => !contextBefore.grants.some((old) => old.grant.context_grant_id === item.grant.context_grant_id)), 'Review Context Grant was not persisted.');
      const effectHash = hashCanonical({ assignment_id: assignment.id, agent_id: binding.binding_id, passport_id: passport.passport_id, mandate_id: mandate.mandateId, resource: RESOURCE, action: ACTION, requested_fields: ['control_id', 'status', 'evidence_hash', 'finding'], review_context_grant_id: grant.grant.context_grant_id });
      const next = humanEscalationStateSchema.parse({ ...existing, ceremony_id: input.ceremony.ceremony_id, trace_id: input.ceremony.trace_id, status: 'ready', requester_human_id: requester.human_id, requester_membership_id: requester.membership_id, approver_human_id: currentApprover.human_id, approver_membership_id: currentApprover.membership_id, policy_id: POLICY_ID, assignment_id: assignment.id, agent_id: mandate.subject.agentId, passport_id: passport.passport_id, binding_id: binding.binding_id, runtime_session_id: session.runtime_session_id, parent_mandate_id: mandate.mandateId, review_context_grant_id: grant.grant.context_grant_id, requested_effect_hash: effectHash, completed_idempotency_keys: [...existing.completed_idempotency_keys, input.ceremony.idempotency_key], last_error: null, updated_at: this.clock().toISOString() });
      await this.repository.write(next);
      return next;
    });
  }

  public start(request: unknown): Promise<HumanEscalationState> { return this.serialize(async () => this.createRequest(startHumanEscalationRequestSchema.parse(request).actor, startHumanEscalationRequestSchema.parse(request).ceremony, false)); }
  public startRejection(request: unknown): Promise<HumanEscalationState> { return this.serialize(async () => { const input = startHumanEscalationRejectionRequestSchema.parse(request); return this.createRequest(input.actor, input.ceremony, true); }); }

  public resume(input: { approvalRequestId: string; taskId: string; agentId: string; mandateId: string; resource: string; action: string; requestedEffectHash: string; idempotencyKey: string }): Promise<unknown> {
    return this.serialize(async () => {
      const state = await this.repository.read();
      if (input.approvalRequestId !== state.approval_request_id || input.taskId !== state.assignment_id || input.agentId !== state.binding_id || input.requestedEffectHash !== state.requested_effect_hash || input.resource !== RESOURCE || input.action !== ACTION) throw new Error('Approved effect does not match the frozen Phase 28 request.');
      if (!state.passport_id || !state.binding_id || !state.runtime_session_id || !state.trace_id || !state.ceremony_id || !state.assignment_id) throw new Error('Phase 28 runtime references are incomplete.');
      await this.ports.collaboration.updateAssignment({ assignmentId: state.assignment_id, status: 'active' });
      const ceremony = { ceremony_id: state.ceremony_id, trace_id: state.trace_id, idempotency_key: input.idempotencyKey };
      const runtime = await this.ports.runtime.start({ provider: 'claude-code', agent_id: state.binding_id, passport_id: state.passport_id, binding_id: state.binding_id, runtime_session_id: state.runtime_session_id, mandate_id: input.mandateId, trace_id: state.trace_id, workspace_path: this.workspacePath, prompt: `Execute only the independently approved findings publication effect ${state.requested_effect_hash}. Review grant: ${state.review_context_grant_id}. Return a concise acknowledgement; do not modify files.`, timeout_seconds: 120, ceremony });
      const run = required(runtime.runs.find((item) => item.idempotency_key === input.idempotencyKey), 'Supervised Phase 28 run was not persisted.');
      await this.ports.ceremony.bindResource(suffix(ceremony, 'run-bind'), 'live-run', run.run_id);
      await this.repository.write(humanEscalationStateSchema.parse({ ...state, status: 'running', run_id: run.run_id, updated_at: this.clock().toISOString() }));
      const terminal = await this.waitForRun(run.run_id);
      if (terminal.status !== 'succeeded') throw new Error(`Approved provider execution failed: ${terminal.termination_reason ?? terminal.status}.`);
      const outputHash = hashCanonical(terminal.output_summary ?? '');
      await this.ports.collaboration.recordResponse({ assignmentId: state.assignment_id, agentId: state.binding_id, body: `Phase 28 approved effect completed. Output hash: ${outputHash}` });
      await this.ports.collaboration.updateAssignment({ assignmentId: state.assignment_id, status: 'complete' });
      await this.repository.write(humanEscalationStateSchema.parse({ ...state, status: 'completed', run_id: run.run_id, output_hash: outputHash, last_error: null, updated_at: this.clock().toISOString() }));
      return { assignment_id: state.assignment_id, run_id: run.run_id, output_hash: outputHash, requested_effect_hash: state.requested_effect_hash };
    });
  }

  private async createRequest(actor: AuthorityActor, ceremony: CeremonyCorrelation, rejection: boolean): Promise<HumanEscalationState> {
    await this.requirePrerequisites(ceremony);
    let state = await this.reconcile(await this.repository.read());
    if (rejection && state.status !== 'completed') throw new Error('Complete the approved action before creating the rejection-path request.');
    if (!rejection && state.status !== 'ready') throw new Error('Phase 28 must be configured and ready before requesting approval.');
    const organization = await this.ports.organization.getState();
    const membership = required(organization.memberships.find((item) => item.membership_id === actor.membership_id && item.human_id === state.requester_human_id && item.status === 'active'), 'The verified requester must be the ceremony operator.');
    const human = await this.ports.humans.getState(membership.human_id);
    const proof = human.active_proofs.find((item) => item.human_proof_id === actor.human_proof_id && item.membership_id === membership.membership_id && item.purpose === REQUEST_PURPOSE && new Date(item.expires_at).getTime() > this.clock().getTime());
    if (!proof) throw new Error(`Fresh Human Proof required for purpose: ${REQUEST_PURPOSE}.`);
    if (!state.assignment_id || !state.agent_id || !state.binding_id || !state.parent_mandate_id || !state.review_context_grant_id || !state.policy_id || !state.requested_effect_hash || !state.requester_human_id || !state.requester_membership_id) throw new Error('Phase 28 frozen authority references are incomplete.');
    if (rejection) {
      const collaboration = await this.ports.collaboration.getState();
      const original = required(collaboration.workplace.assignments.find((item) => item.id === state.assignment_id), 'Original Phase 28 assignment is unavailable.');
      state = humanEscalationStateSchema.parse({ ...state, requested_effect_hash: hashCanonical({ rejection_of: state.requested_effect_hash, assignment_id: original.id, action: ACTION, outcome: 'must-not-execute' }), rejection_request_id: null, updated_at: this.clock().toISOString() });
    }
    const assignmentId = required(state.assignment_id, 'Phase 28 assignment is unavailable.');
    const agentId = required(state.agent_id, 'Phase 28 durable agent is unavailable.');
    const bindingId = required(state.binding_id, 'Phase 28 runtime binding is unavailable.');
    const mandateId = required(state.parent_mandate_id, 'Phase 28 mandate is unavailable.');
    const effectHash = required(state.requested_effect_hash, 'Phase 28 effect hash is unavailable.');
    const reviewGrantId = required(state.review_context_grant_id, 'Phase 28 review grant is unavailable.');
    const policyId = required(state.policy_id, 'Phase 28 approval policy is unavailable.');
    const requesterHumanId = required(state.requester_human_id, 'Phase 28 requester is unavailable.');
    const requesterMembershipId = required(state.requester_membership_id, 'Phase 28 requester membership is unavailable.');
    await this.ports.collaboration.updateAssignment({ assignmentId, status: 'active' });
    const policy = await this.ports.mandates.authorize({ agentId, mandateId, resource: RESOURCE, action: ACTION, parameters: { environment: 'local-demo', records: 1 }, requestedFields: ['control_id', 'status', 'evidence_hash', 'finding'], idempotencyKey: `${ceremony.idempotency_key}_policy`, assignmentId });
    const decision = policy.decisions.at(-1);
    if (decision?.decision !== 'REQUIRES_HUMAN_APPROVAL') throw new Error(`Protected action did not pause for approval: ${decision?.reasonCode ?? 'NO_DECISION'}.`);
    await this.ports.collaboration.updateAssignment({ assignmentId, status: 'approval' });
    const before = await this.ports.approvals.getState();
    const after = await this.ports.approvals.requestEscalation({ organization_id: membership.organization_id, task_id: assignmentId, requesting_human_id: requesterHumanId, requesting_membership_id: requesterMembershipId, requesting_agent_id: bindingId, mandate_id: mandateId, required_resource: RESOURCE, required_action: ACTION, required_approval_power: POWER, requested_effect_hash: effectHash, review_context_grant_id: reviewGrantId, approval_policy_id: policyId, risk_tier: 'restricted', record_count: 1, idempotency_key: `${ceremony.idempotency_key}_resume`, ceremony });
    const approval = required(after.requests.find((item) => !before.requests.some((old) => old.approval_request_id === item.approval_request_id)), 'Phase 28 approval request was not persisted.');
    const next = humanEscalationStateSchema.parse({ ...state, status: rejection ? 'rejection-pending' : 'approval-pending', approval_request_id: rejection ? state.approval_request_id : approval.approval_request_id, rejection_request_id: rejection ? approval.approval_request_id : null, last_error: null, updated_at: this.clock().toISOString() });
    await this.repository.write(next);
    return next;
  }

  private async reconcile(state: HumanEscalationState): Promise<HumanEscalationState> {
    if (!state.approval_request_id && !state.rejection_request_id) return state;
    const approvals = await this.ports.approvals.getState();
    const next = reconcileHumanEscalationState(state, approvals.requests, this.clock().toISOString());
    // Reconciliation is read by the filesystem refresh feed. A timestamp alone
    // must not create another write and recursively schedule the same refresh.
    if (JSON.stringify({ ...next, updated_at: state.updated_at }) === JSON.stringify(state)) return state;
    await this.repository.write(next);
    return next;
  }

  private async requirePrerequisites(ceremony: CeremonyCorrelation): Promise<void> { await this.ports.ceremony.assertBinding(ceremony.ceremony_id, ceremony.trace_id); const least = await this.ports.leastContext.getState(); if (least.status !== 'revocation-proved' || least.ceremony_id !== ceremony.ceremony_id || least.trace_id !== ceremony.trace_id) throw new Error('Phase 27 revocation proof must complete on this ceremony before Phase 28.'); }
  private async waitForRun(runId: string) { for (let index = 0; index < 520; index += 1) { const run = (await this.ports.runtime.getState()).runs.find((item) => item.run_id === runId); if (run && ['succeeded', 'failed', 'cancelled', 'timed-out', 'revoked'].includes(run.status)) return run; await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error('Phase 28 provider execution did not reach a terminal state.'); }
  private serialize<T>(operation: () => Promise<T>): Promise<T> { const result = this.queue.then(operation, operation); this.queue = result.then(() => undefined, () => undefined); return result; }
}

function emptyState(clock: () => Date): HumanEscalationState { return humanEscalationStateSchema.parse({ schema_version: 1, ceremony_id: null, trace_id: null, status: 'not-started', requester_human_id: null, requester_membership_id: null, approver_human_id: null, approver_membership_id: null, policy_id: null, assignment_id: null, agent_id: null, passport_id: null, binding_id: null, runtime_session_id: null, parent_mandate_id: null, review_context_grant_id: null, requested_effect_hash: null, approval_request_id: null, run_id: null, output_hash: null, rejection_request_id: null, completed_idempotency_keys: [], last_error: null, updated_at: clock().toISOString() }); }
function required<T>(value: T | undefined | null, message: string): T { if (value === undefined || value === null) throw new Error(message); return value; }
function suffix(ceremony: CeremonyCorrelation, value: string): CeremonyCorrelation { return { ...ceremony, idempotency_key: `${ceremony.idempotency_key}_${value}`.slice(0, 200) }; }

export function reconcileHumanEscalationState(state: HumanEscalationState, requests: AuthorityApprovalState['requests'], updatedAt: string): HumanEscalationState {
  const primary = requests.find((item) => item.approval_request_id === state.approval_request_id);
  const rejection = requests.find((item) => item.approval_request_id === state.rejection_request_id);
  if (rejection?.status === 'rejected') return humanEscalationStateSchema.parse({ ...state, status: 'completed-with-rejection', updated_at: updatedAt });
  if (state.status === 'rejection-pending' && rejection && ['expired', 'invalidated', 'withdrawn'].includes(rejection.status)) {
    return humanEscalationStateSchema.parse({
      ...state,
      status: 'completed',
      requested_effect_hash: primary?.requested_effect_hash ?? state.requested_effect_hash,
      rejection_request_id: null,
      last_error: null,
      updated_at: updatedAt
    });
  }
  if (primary && ['expired', 'invalidated', 'withdrawn'].includes(primary.status) && !state.run_id && !state.output_hash) {
    return humanEscalationStateSchema.parse({ ...state, status: 'ready', approval_request_id: null, last_error: null, updated_at: updatedAt });
  }
  const status = primary?.status === 'approved' && state.status === 'approval-pending' ? 'approved' : state.status;
  return humanEscalationStateSchema.parse({ ...state, status, updated_at: updatedAt });
}
