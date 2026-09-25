import {
  guidedBootstrapStateSchema,
  prepareGuidedBootstrapRequestSchema,
  runGuidedBootstrapStepRequestSchema,
  type AgentIdentityState,
  type BootstrapOrganizationRequest,
  type CeremonyCorrelation,
  type CollaborationState,
  type CreateAgentRequest,
  type CreateAssignmentRequest,
  type CreateAuthorityRoleRequest,
  type CreateMandateRequest,
  type DelegateMandateRequest,
  type FinalAcceptanceState,
  type GuidedBootstrapParticipantLane,
  type GuidedBootstrapState,
  type HumanIdentityV2State,
  type IssueAuthorityCredentialRequest,
  type JoinMembershipRequest,
  type MandateState,
  type MembershipLifecycleRequest,
  type OrganizationAuthorityState,
  type PrepareGuidedBootstrapRequest,
  type RunGuidedBootstrapStepRequest
} from '@h2a/contracts';
import { type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const OPERATOR_ROLE = 'role_h2a_operator';
const APPROVER_ROLE = 'role_h2a_security_approver';
const ADMIN_ROLE = 'role_authority_admin';
const ROOT_OBJECTIVE = 'Coordinate the bounded HP enterprise security-control and evidence review.';
const ROOT_ASSIGNMENT_TITLE = 'H2A Codex Coordinator: consolidate security review';

const participantSpecs: Array<{
  lane: GuidedBootstrapParticipantLane;
  name: string;
  role: string;
  provider: CreateAgentRequest['provider'];
  model: string;
  connector: string;
  capabilities: string[];
}> = [
  { lane: 'openai-codex', name: 'H2A Codex Coordinator', role: 'Security review coordinator', provider: 'openai-codex', model: 'gpt-5-codex', connector: 'connector_openai-codex_v1', capabilities: ['evidence.read', 'findings.write', 'task.delegate'] },
  { lane: 'claude-code', name: 'H2A Claude Control Reviewer', role: 'Control evidence reviewer', provider: 'claude-code', model: 'claude-sonnet-4-5', connector: 'connector_claude-code_v1', capabilities: ['evidence.read', 'findings.write'] },
  { lane: 'gemini-antigravity', name: 'H2A Antigravity Architecture Reviewer', role: 'Architecture risk reviewer', provider: 'gemini-antigravity', model: 'gemini-3.1-pro-high', connector: 'connector_gemini-antigravity_v1', capabilities: ['evidence.read', 'findings.write'] },
  { lane: 'framework', name: 'H2A Framework Interop Agent', role: 'External framework participant', provider: 'custom-cli', model: 'custom-runtime', connector: 'connector_custom-cli_v1', capabilities: ['evidence.read', 'findings.write'] }
];

export interface GuidedBootstrapPorts {
  humans: { getState(selectedHumanId?: string): Promise<HumanIdentityV2State> };
  acceptance: { getState(): Promise<FinalAcceptanceState> };
  organization: {
    getState(): Promise<OrganizationAuthorityState>;
    bootstrap(request: BootstrapOrganizationRequest): Promise<OrganizationAuthorityState>;
    createRole(request: CreateAuthorityRoleRequest): Promise<OrganizationAuthorityState>;
    joinMembership(request: JoinMembershipRequest): Promise<OrganizationAuthorityState>;
    updateMembership(request: MembershipLifecycleRequest): Promise<OrganizationAuthorityState>;
    issueCredential(request: IssueAuthorityCredentialRequest): Promise<OrganizationAuthorityState>;
  };
  agents: { getState(): Promise<AgentIdentityState>; createAgent(request: CreateAgentRequest): Promise<AgentIdentityState> };
  mandates: { getState(): Promise<MandateState>; create(request: CreateMandateRequest): Promise<MandateState>; delegate(request: DelegateMandateRequest): Promise<MandateState> };
  collaboration: { getState(): Promise<CollaborationState>; createAssignment(request: CreateAssignmentRequest): Promise<CollaborationState> };
  ceremony: {
    assertBinding(ceremonyId: string, traceId: string): Promise<unknown>;
    bindResource(correlation: CeremonyCorrelation, kind: 'human-proof' | 'authority-membership' | 'authority-credential' | 'agent-passport' | 'runtime-session' | 'mandate' | 'assignment', resourceId: string): Promise<unknown>;
  };
}

export class GuidedBootstrapCoordinator {
  private readonly repository: VersionedJsonRepository<'h2a.guided-bootstrap.state', GuidedBootstrapState>;
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly ports: GuidedBootstrapPorts,
    private readonly workspacePath: string,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.repository = new VersionedJsonRepository(new AtomicFileStore(dataPath), 'bootstrap/phase25-state-v1.json', 'h2a.guided-bootstrap.state', guidedBootstrapStateSchema, { initialData: emptyState(clock()), clock });
  }

  public async initialize(): Promise<GuidedBootstrapState> { await this.repository.read(); return this.getState(); }
  public getState(): Promise<GuidedBootstrapState> { return this.serialized(async () => this.project(await this.repository.read())); }
  public prepare(request: PrepareGuidedBootstrapRequest): Promise<GuidedBootstrapState> { return this.serialized(() => this.prepareUnlocked(request)); }
  public runStep(request: RunGuidedBootstrapStepRequest): Promise<GuidedBootstrapState> { return this.serialized(() => this.runStepUnlocked(request)); }

  private async prepareUnlocked(request: PrepareGuidedBootstrapRequest): Promise<GuidedBootstrapState> {
    const input = prepareGuidedBootstrapRequestSchema.parse(request);
    await this.ports.ceremony.assertBinding(input.ceremony.ceremony_id, input.ceremony.trace_id);
    const current = await this.repository.read();
    if (current.completed_idempotency_keys.includes(input.ceremony.idempotency_key)) return this.project(current);
    const [humans, acceptance] = await Promise.all([this.ports.humans.getState(), this.ports.acceptance.getState()]);
    const selected = requireHumans(humans, input.administrator_human_id, input.operator_human_id, this.clock);
    if (acceptance.gates.find((gate) => gate.gate_id === 'two-human-ceremony')?.status !== 'passed') throw new Error('Two-human cross-person biometric acceptance must pass before enterprise bootstrap.');
    for (const item of selected) await this.ports.ceremony.bindResource(correlation(input.ceremony, `proof_${item.proof!.human_proof_id}`), 'human-proof', item.proof!.human_proof_id);
    const prepared = guidedBootstrapStateSchema.parse({
      ...current,
      ceremony_id: input.ceremony.ceremony_id,
      trace_id: input.ceremony.trace_id,
      status: 'in-progress',
      administrator_human_id: input.administrator_human_id,
      operator_human_id: input.operator_human_id,
      cross_person_test_status: 'passed',
      completed_idempotency_keys: [...current.completed_idempotency_keys, input.ceremony.idempotency_key],
      last_error: null,
      updated_at: this.clock().toISOString()
    });
    const event = await this.evidence.append({ trace_id: input.ceremony.trace_id, actor: { type: 'human', id: input.administrator_human_id }, subject: { type: 'ceremony', id: input.ceremony.ceremony_id }, event_type: 'GUIDED_BOOTSTRAP_PREPARED', payload: { ceremony_id: input.ceremony.ceremony_id, administrator_human_id: input.administrator_human_id, operator_human_id: input.operator_human_id, proof_ids: selected.map((item) => item.proof!.human_proof_id), idempotency_key: input.ceremony.idempotency_key } });
    prepared.steps[0] = { ...prepared.steps[0], status: 'passed', blocker: null, evidence_refs: [event.event_id, ...selected.map((item) => item.proof!.human_proof_id)] };
    await this.repository.write(prepared);
    return this.project(prepared);
  }

  private async runStepUnlocked(request: RunGuidedBootstrapStepRequest): Promise<GuidedBootstrapState> {
    const input = runGuidedBootstrapStepRequestSchema.parse(request);
    await this.ports.ceremony.assertBinding(input.ceremony.ceremony_id, input.ceremony.trace_id);
    const current = await this.repository.read();
    this.requirePrepared(current, input.ceremony);
    if (current.completed_idempotency_keys.includes(input.ceremony.idempotency_key)) return this.project(current);
    const index = stepIndex(input.step_id);
    const projected = await this.project(current);
    if (!projected.steps.slice(0, index).every((step) => step.status === 'passed')) {
      throw new Error(`Complete every preceding Phase 25 step before ${input.step_id}.`);
    }
    if (input.step_id !== 'restart-recovery') {
      const currentHumans = await this.ports.humans.getState();
      const selectedHumans = requireHumans(currentHumans, current.administrator_human_id!, current.operator_human_id!, this.clock);
      for (const item of selectedHumans) await this.ports.ceremony.bindResource(correlation(input.ceremony, `proof_${item.proof.human_proof_id}`), 'human-proof', item.proof.human_proof_id);
    }
    const running = guidedBootstrapStateSchema.parse({ ...current, steps: current.steps.map((step, stepIndexValue) => stepIndexValue === index ? { ...step, status: 'running', blocker: null } : step), last_error: null, updated_at: this.clock().toISOString() });
    await this.repository.write(running);
    try {
      if (input.step_id === 'organization-authority') await this.configureAuthority(running, input.ceremony);
      if (input.step_id === 'workload-identity') await this.createParticipants(running, input.ceremony);
      if (input.step_id === 'mandates-and-tasks') await this.createMandatesAndTasks(running, input.ceremony);
      if (input.step_id === 'restart-recovery') {
        const projection = await this.project(running);
        if (!projection.steps.slice(0, 4).every((step) => step.status === 'passed')) throw new Error('Restart recovery cannot pass until the complete bootstrap graph resolves.');
      }
      const event = await this.evidence.append({ trace_id: input.ceremony.trace_id, actor: { type: 'system', id: 'h2a-guided-bootstrap' }, subject: { type: 'ceremony', id: input.ceremony.ceremony_id }, event_type: 'GUIDED_BOOTSTRAP_STEP_PASSED', payload: { ceremony_id: input.ceremony.ceremony_id, step_id: input.step_id, idempotency_key: input.ceremony.idempotency_key } });
      const latest = await this.repository.read();
      const next = guidedBootstrapStateSchema.parse({ ...latest, completed_idempotency_keys: [...latest.completed_idempotency_keys, input.ceremony.idempotency_key], steps: latest.steps.map((step, stepIndexValue) => stepIndexValue === index ? { ...step, status: 'passed', blocker: null, evidence_refs: [...step.evidence_refs, event.event_id] } : step), last_error: null, updated_at: this.clock().toISOString() });
      await this.repository.write(next);
      return this.project(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Guided bootstrap step failed.';
      const event = await this.evidence.append({ trace_id: input.ceremony.trace_id, actor: { type: 'system', id: 'h2a-guided-bootstrap' }, subject: { type: 'ceremony', id: input.ceremony.ceremony_id }, event_type: 'GUIDED_BOOTSTRAP_STEP_FAILED', payload: { ceremony_id: input.ceremony.ceremony_id, step_id: input.step_id, reason: message, idempotency_key: input.ceremony.idempotency_key } });
      const latest = await this.repository.read();
      await this.repository.write(guidedBootstrapStateSchema.parse({ ...latest, status: 'blocked', steps: latest.steps.map((step, stepIndexValue) => stepIndexValue === index ? { ...step, status: 'failed', blocker: message, evidence_refs: [...step.evidence_refs, event.event_id] } : step), last_error: message, updated_at: this.clock().toISOString() }));
      throw error;
    }
  }

  private async configureAuthority(state: GuidedBootstrapState, ceremony: CeremonyCorrelation): Promise<void> {
    const humans = await this.ports.humans.getState();
    const [administrator, operator] = requireHumans(humans, state.administrator_human_id!, state.operator_human_id!, this.clock);
    if (administrator.identity.organization_id !== operator.identity.organization_id) {
      throw new Error('Phase 25 administrator and operator must belong to the same organization.');
    }
    let organization = await this.ports.organization.getState();
    if (organization.organizations.length === 0) {
      if (!administrator.identity.active_membership_id) throw new Error('The selected administrator identity is not bound to a membership ID.');
      organization = await this.ports.organization.bootstrap({
        organization_id: administrator.identity.organization_id,
        name: 'HP Enterprise Demo',
        policy_version: 'policy_2026_01',
        human_id: administrator.identity.human_id,
        membership_id: administrator.identity.active_membership_id,
        human_proof_id: administrator.proof.human_proof_id,
        employee_id: 'H2A-ADMIN-01',
        department: 'Enterprise Security',
        credential_expires_at: new Date(this.clock().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ceremony: correlation(ceremony, 'authority_root')
      });
    }
    const activeOrganizations = organization.organizations.filter((item) => item.status === 'active');
    if (activeOrganizations.length !== 1) throw new Error('Phase 25 requires exactly one active organization authority root.');
    const org = activeOrganizations[0]!;
    if (org.organization_id !== administrator.identity.organization_id) throw new Error('The active authority root does not match the selected administrator organization.');
    const adminMembership = organization.memberships.find((item) => item.human_id === state.administrator_human_id && item.status === 'active');
    if (!adminMembership) throw new Error('The selected administrator does not hold the active authority-root membership.');
    const adminProof = currentProof(humans, state.administrator_human_id!, this.clock);
    const adminCredential = organization.credentials.find((item) => item.membership_id === adminMembership.membership_id && item.status === 'active' && item.role_ids.includes(ADMIN_ROLE));
    if (!adminCredential) throw new Error('The selected administrator requires an active Authority Administrator credential.');
    const actor = { membership_id: adminMembership.membership_id, human_proof_id: adminProof.human_proof_id, authority_credential_id: adminCredential.credential_id };
    if (!organization.roles.some((item) => item.role_id === OPERATOR_ROLE)) {
      organization = await this.ports.organization.createRole({ actor, role_id: OPERATOR_ROLE, organization_id: org.organization_id, name: 'H2A Operator', description: 'Creates bounded assignments and handles approved evidence artifacts.', authority_scopes: [{ resource: 'assignment', actions: ['create', 'read'], max_records: 100 }, { resource: 'context-artifact', actions: ['create'], max_records: 100 }], approval_powers: [], ceremony: correlation(ceremony, 'role_operator') });
    }
    if (!organization.roles.some((item) => item.role_id === APPROVER_ROLE)) {
      organization = await this.ports.organization.createRole({ actor, role_id: APPROVER_ROLE, organization_id: org.organization_id, name: 'Security Approver', description: 'Independently approves protected mandate and context actions.', authority_scopes: [{ resource: 'mandate', actions: ['approve'] }, { resource: 'context-grant', actions: ['issue', 'revoke'] }, { resource: 'approval-request', actions: ['decide'] }], approval_powers: ['mandate.approve', 'context.grant.issue'], ceremony: correlation(ceremony, 'role_approver') });
    }
    if (!adminMembership.role_ids.includes(APPROVER_ROLE)) {
      organization = await this.ports.organization.updateMembership({ actor, membership_id: adminMembership.membership_id, action: 'assign-roles', role_ids: [...new Set([...adminMembership.role_ids, APPROVER_ROLE])], ceremony: correlation(ceremony, 'membership_approver_roles') });
    }
    const operatorIdentity = humans.identities.find((item) => item.human_id === state.operator_human_id)!;
    if (!operatorIdentity.active_membership_id) throw new Error('The selected operator identity is not bound to a membership ID.');
    let operatorMembership = organization.memberships.find((item) => item.human_id === state.operator_human_id && item.status === 'active');
    if (!operatorMembership) {
      organization = await this.ports.organization.joinMembership({ actor, organization_id: org.organization_id, membership_id: operatorIdentity.active_membership_id, human_id: operatorIdentity.human_id, employee_id: 'H2A-OPERATOR-01', department: 'Enterprise Security Operations', manager_membership_id: adminMembership.membership_id, role_ids: [OPERATOR_ROLE], ceremony: correlation(ceremony, 'membership_operator') });
      operatorMembership = organization.memberships.find((item) => item.human_id === state.operator_human_id && item.status === 'active');
    }
    if (!operatorMembership?.role_ids.includes(OPERATOR_ROLE)) throw new Error('Operator membership does not contain the bounded operator role.');
    const expiry = new Date(this.clock().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    if (!organization.credentials.some((item) => item.membership_id === operatorMembership.membership_id && item.status === 'active' && item.role_ids.includes(OPERATOR_ROLE))) {
      organization = await this.ports.organization.issueCredential({ actor, organization_id: org.organization_id, membership_id: operatorMembership.membership_id, role_ids: [OPERATOR_ROLE], resource_constraints: ['assignment', 'context-artifact'], action_constraints: ['create', 'read'], approval_policy_ids: [], expires_at: expiry, ceremony: correlation(ceremony, 'credential_operator') });
    }
    if (!organization.credentials.some((item) => item.membership_id === adminMembership.membership_id && item.status === 'active' && item.role_ids.includes(APPROVER_ROLE))) {
      organization = await this.ports.organization.issueCredential({ actor, organization_id: org.organization_id, membership_id: adminMembership.membership_id, role_ids: [ADMIN_ROLE, APPROVER_ROLE], resource_constraints: [], action_constraints: [], approval_policy_ids: [], expires_at: expiry, ceremony: correlation(ceremony, 'credential_approver') });
    }
    const operatorCredential = organization.credentials.find((item) => item.membership_id === operatorMembership!.membership_id && item.status === 'active');
    const approverCredential = organization.credentials.find((item) => item.membership_id === adminMembership.membership_id && item.status === 'active');
    await this.ports.ceremony.bindResource(correlation(ceremony, 'bind_operator_membership'), 'authority-membership', operatorMembership.membership_id);
    await this.ports.ceremony.bindResource(correlation(ceremony, 'bind_approver_membership'), 'authority-membership', adminMembership.membership_id);
    await this.ports.ceremony.bindResource(correlation(ceremony, 'bind_operator_credential'), 'authority-credential', operatorCredential!.credential_id);
    await this.ports.ceremony.bindResource(correlation(ceremony, 'bind_approver_credential'), 'authority-credential', approverCredential!.credential_id);
  }

  private async createParticipants(state: GuidedBootstrapState, ceremony: CeremonyCorrelation): Promise<void> {
    const [humans, organization] = await Promise.all([this.ports.humans.getState(), this.ports.organization.getState()]);
    const proof = currentProof(humans, state.administrator_human_id!, this.clock);
    const membership = organization.memberships.find((item) => item.human_id === state.administrator_human_id && item.status === 'active');
    const credential = organization.credentials.find((item) => item.membership_id === membership?.membership_id && item.status === 'active' && item.role_ids.includes(ADMIN_ROLE));
    if (!membership || !credential) throw new Error('Active administrator authority is required to sponsor participants.');
    const sponsorAuthority = { organizationId: membership.organization_id, membershipId: membership.membership_id, humanProofId: proof.human_proof_id, authorityCredentialId: credential.credential_id };
    for (const spec of participantSpecs) {
      let agents = await this.ports.agents.getState();
      const existing = agents.passportsV2?.find((item) => item.name === spec.name || item.connector_manifest_id === spec.connector);
      if (existing && (existing.sponsor_human_id !== state.administrator_human_id || existing.organization_id !== membership.organization_id)) throw new Error(`${spec.name} is bound to the wrong sponsor or organization.`);
      if (!existing) {
        agents = await this.ports.agents.createAgent({ name: spec.name, role: spec.role, provider: spec.provider, model: spec.model, workspace: this.workspacePath, capabilities: spec.capabilities, purpose: `${spec.role} for the bounded HP CTO/CISO security-review ceremony.`, riskTier: 'restricted', connectorManifestId: spec.connector, trustMode: 'connected-observed', expiresAt: new Date(this.clock().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), attestationExpiresAt: new Date(this.clock().getTime() + 8 * 60 * 60 * 1000).toISOString(), sponsorAuthority, ceremony: correlation(ceremony, `participant_${spec.lane}`) });
      }
      const passport = agents.passportsV2?.find((item) => item.name === spec.name && item.connector_manifest_id === spec.connector);
      const session = agents.runtimeSessions?.find((item) => item.passport_id === passport?.passport_id && ['ready', 'working'].includes(item.state));
      if (!passport || !session) throw new Error(`${spec.name} did not produce an active Passport V2 runtime session.`);
      await this.ports.ceremony.bindResource(correlation(ceremony, `bind_passport_${spec.lane}`), 'agent-passport', passport.passport_id);
      await this.ports.ceremony.bindResource(correlation(ceremony, `bind_session_${spec.lane}`), 'runtime-session', session.runtime_session_id);
    }
    const agents = await this.ports.agents.getState();
    const workloadKeys = participantSpecs.map((spec) => agents.passportsV2?.find((item) => item.name === spec.name)?.workload_public_key);
    if (workloadKeys.some((key) => !key) || new Set(workloadKeys).size !== participantSpecs.length) throw new Error('Copied or missing workload identity detected across Phase 25 participants.');
  }

  private async createMandatesAndTasks(state: GuidedBootstrapState, ceremony: CeremonyCorrelation): Promise<void> {
    const [humans, organization, agents] = await Promise.all([this.ports.humans.getState(), this.ports.organization.getState(), this.ports.agents.getState()]);
    const proof = currentProof(humans, state.administrator_human_id!, this.clock);
    const membership = organization.memberships.find((item) => item.human_id === state.administrator_human_id && item.status === 'active');
    const credential = organization.credentials.find((item) => item.membership_id === membership?.membership_id && item.status === 'active' && item.role_ids.includes(ADMIN_ROLE));
    if (!membership || !credential) throw new Error('Active administrator authority is required to issue mandates.');
    const humanAuthority = { organizationId: membership.organization_id, membershipId: membership.membership_id, humanProofId: proof.human_proof_id, authorityCredentialId: credential.credential_id };
    const participants = participantSpecs.map((spec) => agents.passportsV2?.find((item) => item.name === spec.name));
    if (participants.some((item) => !item)) throw new Error('All four Passport V2 participants are required before mandate issuance.');
    const [rootPassport, ...childPassports] = participants as NonNullable<(typeof participants)[number]>[];
    let mandates = await this.ports.mandates.getState();
    let root = mandates.mandates.find((item) => item.objective === ROOT_OBJECTIVE && item.subject.agentId === rootPassport.agent_id);
    const expiresAt = new Date(this.clock().getTime() + 8 * 60 * 60 * 1000).toISOString();
    if (!root) {
      mandates = await this.ports.mandates.create({ agentId: rootPassport.agent_id, objective: ROOT_OBJECTIVE, resources: ['hp.security-controls', 'hp.evidence-ledger'], actions: ['evidence.read', 'findings.write', 'task.delegate'], prohibitedActions: ['credential.read', 'system.modify'], limits: { maxRecords: 100, maxDurationMinutes: 120, parameterEquals: { environment: 'local-demo' } }, allowedFields: ['control_id', 'status', 'evidence_hash', 'finding'], approvalActions: ['findings.publish'], delegation: { allowed: true, allowedAgentIds: childPassports.map((item) => item.agent_id), maxDepth: 1 }, expiresAt, humanAuthority, ceremony: correlation(ceremony, 'mandate_root') });
      root = mandates.mandates.find((item) => item.objective === ROOT_OBJECTIVE && item.subject.agentId === rootPassport.agent_id);
    }
    if (!root) throw new Error('Root mandate was not persisted.');
    for (const passport of childPassports) {
      const objective = ROOT_OBJECTIVE;
      if (!mandates.mandates.some((item) => item.parentMandateId === root!.mandateId && item.subject.agentId === passport.agent_id)) {
        mandates = await this.ports.mandates.delegate({ parentMandateId: root.mandateId, fromAgentId: rootPassport.agent_id, agentId: passport.agent_id, objective, resources: ['hp.evidence-ledger'], actions: ['evidence.read', 'findings.write'], prohibitedActions: ['credential.read', 'system.modify'], limits: { maxRecords: 40, maxDurationMinutes: 60, parameterEquals: { environment: 'local-demo' } }, allowedFields: ['control_id', 'status', 'evidence_hash', 'finding'], approvalActions: ['findings.publish'], delegation: { allowed: false, allowedAgentIds: [], maxDepth: 0 }, expiresAt, humanAuthority, ceremony: correlation(ceremony, `mandate_${passport.agent_id}`) });
      }
    }
    mandates = await this.ports.mandates.getState();
    const ceremonyMandates = mandates.mandates.filter((item) => item.mandateId === root!.mandateId || item.parentMandateId === root!.mandateId);
    if (ceremonyMandates.length !== 4) throw new Error('The Phase 25 mandate graph must contain one root and three bounded children.');
    for (const mandate of ceremonyMandates) await this.ports.ceremony.bindResource(correlation(ceremony, `bind_${mandate.mandateId}`), 'mandate', mandate.mandateId);
    let collaboration = await this.ports.collaboration.getState();
    const childAssignments: string[] = [];
    for (const passport of childPassports) {
      const assigneeId = agents.bindings.find((item) => item.agent_id === passport.agent_id)?.binding_id;
      if (!assigneeId) throw new Error(`Runtime binding for ${passport.name} was not found.`);
      const title = `${passport.name}: bounded evidence review`;
      let assignment = collaboration.workplace.assignments.find((item) => item.title === title && item.assigneeId === assigneeId);
      if (!assignment) {
        collaboration = await this.ports.collaboration.createAssignment({ title, objective: `Inspect only the disclosed HP control evidence and return structured findings for ${passport.role}.`, assigneeId, risk: 'restricted', priority: 2, dependsOn: [], requestedAction: 'evidence.read', ceremony: correlation(ceremony, `assignment_${passport.agent_id}`) });
        assignment = collaboration.workplace.assignments.find((item) => item.title === title && item.assigneeId === assigneeId);
      }
      if (!assignment) throw new Error(`Assignment for ${passport.name} was not persisted.`);
      childAssignments.push(assignment.id);
    }
    const rootAssigneeId = agents.bindings.find((item) => item.agent_id === rootPassport.agent_id)?.binding_id;
    if (!rootAssigneeId) throw new Error('Runtime binding for H2A Codex Coordinator was not found.');
    let rootAssignment = collaboration.workplace.assignments.find((item) => item.title === ROOT_ASSIGNMENT_TITLE && item.assigneeId === rootAssigneeId);
    if (!rootAssignment) {
      collaboration = await this.ports.collaboration.createAssignment({ title: ROOT_ASSIGNMENT_TITLE, objective: 'Consolidate the three bounded specialist findings into the HP CTO/CISO review package.', assigneeId: rootAssigneeId, risk: 'restricted', priority: 1, dependsOn: childAssignments, requestedAction: 'findings.write', ceremony: correlation(ceremony, 'assignment_root') });
      rootAssignment = collaboration.workplace.assignments.find((item) => item.title === ROOT_ASSIGNMENT_TITLE && item.assigneeId === rootAssigneeId);
    }
    for (const assignment of [...collaboration.workplace.assignments.filter((item) => childAssignments.includes(item.id)), rootAssignment!]) await this.ports.ceremony.bindResource(correlation(ceremony, `bind_${assignment.id}`), 'assignment', assignment.id);
  }

  private async project(state: GuidedBootstrapState): Promise<GuidedBootstrapState> {
    const [humans, acceptance, organization, agents, mandates, collaboration] = await Promise.all([this.ports.humans.getState(), this.ports.acceptance.getState(), this.ports.organization.getState(), this.ports.agents.getState(), this.ports.mandates.getState(), this.ports.collaboration.getState()]);
    const humanRows = [state.administrator_human_id, state.operator_human_id].filter((value): value is string => Boolean(value)).map((humanId) => projectHuman(humans, humanId, this.clock));
    const crossPassed = acceptance.gates.find((gate) => gate.gate_id === 'two-human-ceremony')?.status === 'passed';
    const org = organization.organizations.find((item) => item.status === 'active');
    const operatorMembership = organization.memberships.find((item) => item.human_id === state.operator_human_id && item.status === 'active' && item.role_ids.includes(OPERATOR_ROLE));
    const approverMembership = organization.memberships.find((item) => item.human_id === state.administrator_human_id && item.status === 'active' && item.role_ids.includes(APPROVER_ROLE));
    const operatorCredential = organization.credentials.find((item) => item.membership_id === operatorMembership?.membership_id && item.status === 'active' && item.role_ids.includes(OPERATOR_ROLE));
    const approverCredential = organization.credentials.find((item) => item.membership_id === approverMembership?.membership_id && item.status === 'active' && item.role_ids.includes(APPROVER_ROLE));
    const participants = participantSpecs.map((spec) => {
      const passport = agents.passportsV2?.find((item) => item.name === spec.name && item.connector_manifest_id === spec.connector);
      const session = agents.runtimeSessions?.find((item) => item.passport_id === passport?.passport_id && ['ready', 'working'].includes(item.state));
      const status = passport && session ? 'ready' as const : 'missing' as const;
      const binding = agents.bindings.find((item) => item.agent_id === passport?.agent_id);
      return { lane: spec.lane, name: spec.name, provider: spec.provider, agent_id: passport?.agent_id ?? null, binding_id: binding?.binding_id ?? null, passport_id: passport?.passport_id ?? null, runtime_session_id: session?.runtime_session_id ?? null, status, blocker: status === 'ready' ? null : 'Passport V2 and an active workload-attested runtime session are required.' };
    });
    const root = mandates.mandates.find((item) => item.objective === ROOT_OBJECTIVE && item.status === 'active');
    const children = mandates.mandates.filter((item) => item.parentMandateId === root?.mandateId && item.status === 'active');
    const participantBindingIds = new Set(participants.map((item) => item.binding_id).filter(Boolean));
    const phase25Titles = new Set([
      ROOT_ASSIGNMENT_TITLE,
      ...participantSpecs.filter((spec) => spec.lane !== 'openai-codex').map((spec) => `${spec.name}: bounded evidence review`)
    ]);
    const assignments = collaboration.workplace.assignments.filter((item) => participantBindingIds.has(item.assigneeId) && item.traceId === state.trace_id && phase25Titles.has(item.title));
    const freshHumans = humanRows.length === 2 && humanRows.every((item) => item.proof_status === 'fresh');
    const authorityReady = Boolean(org && operatorMembership && approverMembership && operatorCredential && approverCredential);
    const participantsReady = participants.every((item) => item.status === 'ready');
    const mandateReady = Boolean(root && children.length === 3 && assignments.length === 4);
    const steps = [...state.steps];
    steps[0] = freshHumans && crossPassed
      ? { ...steps[0]!, status: 'passed', blocker: null }
      : { ...steps[0]!, status: 'user-action-required', blocker: freshHumans ? 'Complete the two-person cross-match acceptance before continuing.' : 'Refresh both selected humans in Human Proof.' };
    steps[1] = statusStep(steps[1]!, authorityReady, 'Create distinct operator and security-approver memberships and credentials.');
    steps[2] = statusStep(steps[2]!, participantsReady, 'Create and attest all four Passport V2 participants.');
    steps[3] = statusStep(steps[3]!, mandateReady, 'Issue one root mandate, three bounded children, and four linked assignments.');
    if (mandateReady && steps[4]!.status === 'not-ready') steps[4] = { ...steps[4]!, status: 'ready', blocker: null };
    const complete = steps.every((step) => step.status === 'passed');
    return guidedBootstrapStateSchema.parse({ ...state, status: complete ? 'ready' : state.last_error ? 'blocked' : state.ceremony_id ? 'in-progress' : 'not-started', cross_person_test_status: crossPassed ? 'passed' : 'pending', humans: humanRows, organization_id: org?.organization_id ?? null, operator_role_id: organization.roles.some((item) => item.role_id === OPERATOR_ROLE) ? OPERATOR_ROLE : null, approver_role_id: organization.roles.some((item) => item.role_id === APPROVER_ROLE) ? APPROVER_ROLE : null, operator_credential_id: operatorCredential?.credential_id ?? null, approver_credential_id: approverCredential?.credential_id ?? null, participants, root_mandate_id: root?.mandateId ?? null, child_mandate_ids: children.map((item) => item.mandateId), assignment_ids: assignments.map((item) => item.id), steps, updated_at: this.clock().toISOString() });
  }

  private requirePrepared(state: GuidedBootstrapState, ceremony: CeremonyCorrelation): void {
    if (!state.ceremony_id || !state.trace_id || !state.administrator_human_id || !state.operator_human_id) throw new Error('Prepare the two-human Phase 25 bootstrap first.');
    if (state.ceremony_id !== ceremony.ceremony_id || state.trace_id !== ceremony.trace_id) throw new Error('Bootstrap state belongs to a different ceremony.');
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function emptyState(now: Date): GuidedBootstrapState {
  const titles = ['Human readiness', 'Organization authority', 'Workload identity', 'Mandates and tasks', 'Restart recovery'];
  const ids = ['human-readiness', 'organization-authority', 'workload-identity', 'mandates-and-tasks', 'restart-recovery'] as const;
  return guidedBootstrapStateSchema.parse({ schema_version: 1, ceremony_id: null, trace_id: null, status: 'not-started', administrator_human_id: null, operator_human_id: null, cross_person_test_status: 'pending', humans: [], organization_id: null, operator_role_id: null, approver_role_id: null, operator_credential_id: null, approver_credential_id: null, participants: participantSpecs.map((spec) => ({ lane: spec.lane, name: spec.name, provider: spec.provider, agent_id: null, binding_id: null, passport_id: null, runtime_session_id: null, status: 'missing', blocker: 'Participant has not been created.' })), root_mandate_id: null, child_mandate_ids: [], assignment_ids: [], steps: ids.map((step_id, index) => ({ step_id, title: titles[index]!, status: index === 0 ? 'user-action-required' : 'not-ready', blocker: index === 0 ? 'Select and freshly verify two enrolled humans.' : 'Complete the preceding step.', evidence_refs: [] })), completed_idempotency_keys: [], last_error: null, updated_at: now.toISOString() });
}

function requireHumans(state: HumanIdentityV2State, administratorId: string, operatorId: string, clock: () => Date) {
  if (administratorId === operatorId) throw new Error('Administrator and operator must be different humans.');
  return [administratorId, operatorId].map((humanId) => {
    const identity = state.identities.find((item) => item.human_id === humanId);
    if (!identity || identity.status !== 'active') throw new Error(`${humanId} must be freshly verified and active.`);
    const enrollment = state.enrollments.find((item) => item.human_id === humanId && item.status === 'active');
    if (!enrollment || enrollment.policy.token_set_size < 20 || enrollment.policy.token_set_size > 70) throw new Error(`${humanId} requires one active 20-70 record enrollment.`);
    const proof = currentProof(state, humanId, clock);
    return { identity, enrollment, proof };
  });
}

function currentProof(state: HumanIdentityV2State, humanId: string, clock: () => Date) {
  const proof = state.active_proofs.find((item) => item.human_id === humanId && new Date(item.expires_at).getTime() > clock().getTime());
  if (!proof) throw new Error(`${humanId} requires a fresh Human Proof.`);
  return proof;
}

function projectHuman(state: HumanIdentityV2State, humanId: string, clock: () => Date) {
  const identity = state.identities.find((item) => item.human_id === humanId)!;
  const enrollment = state.enrollments.find((item) => item.human_id === humanId && item.status === 'active')!;
  const proof = state.active_proofs.find((item) => item.human_id === humanId);
  const fresh = Boolean(proof && new Date(proof.expires_at).getTime() > clock().getTime());
  return { human_id: humanId, display_name: identity.display_name, membership_id: identity.active_membership_id, enrollment_id: enrollment.enrollment_id, token_set_size: enrollment.policy.token_set_size, required_matches: enrollment.policy.required_matches, model_set_hash: enrollment.model_set_hash, proof_id: proof?.human_proof_id ?? null, proof_expires_at: proof?.expires_at ?? null, proof_status: fresh ? 'fresh' as const : proof ? 'expired' as const : 'missing' as const, assurance_level: proof?.assurance_level ?? null };
}

function correlation(base: CeremonyCorrelation, suffix: string): CeremonyCorrelation { return { ...base, idempotency_key: `${base.idempotency_key}_${suffix}` }; }
function stepIndex(step: RunGuidedBootstrapStepRequest['step_id']): number { return { 'organization-authority': 1, 'workload-identity': 2, 'mandates-and-tasks': 3, 'restart-recovery': 4 }[step]; }
function statusStep<T extends GuidedBootstrapState['steps'][number]>(current: T, ready: boolean, blocker: string): T {
  if (current.status === 'passed') return current;
  return { ...current, status: ready ? 'ready' : current.status === 'failed' ? 'failed' : 'not-ready', blocker: ready ? null : current.status === 'failed' ? current.blocker ?? blocker : blocker };
}
