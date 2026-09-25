import { resolve } from 'node:path';
import {
  cancelRealCollaborationLaneRequestSchema,
  prepareRealCollaborationRequestSchema,
  realCollaborationStateSchema,
  replaceRealCollaborationAuthorityRequestSchema,
  runRealCollaborationLaneRequestSchema,
  isRealCollaborationLaneRunnable,
  type AgentIdentityState,
  type CeremonyCorrelation,
  type CollaborationState,
  type CreateMandateRequest,
  type DelegateMandateRequest,
  type ExecuteFrameworkRequest,
  type FrameworkConnectorState,
  type GuidedBootstrapState,
  type HumanIdentityV2State,
  type LiveRuntimeState,
  type MandateState,
  type OrganizationAuthorityState,
  type RealCollaborationLane,
  type RealCollaborationLaneId,
  type RealCollaborationState,
  type StartLiveRunRequest,
  type UpdateAssignmentRequest
} from '@h2a/contracts';
import { hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const LANE_ORDER: RealCollaborationLaneId[] = ['claude-code', 'gemini-antigravity', 'framework', 'openai-codex'];
const AUTHORITY_ADMIN_ROLE = 'role_authority_admin';
const REPLACEMENT_TTL_MS = 120 * 60 * 1000;
const stateDataSchema = realCollaborationStateSchema;

export interface RealCollaborationPorts {
  bootstrap: { getState(): Promise<GuidedBootstrapState> };
  humans: { getState(selectedHumanId?: string): Promise<HumanIdentityV2State> };
  organization: { getState(): Promise<OrganizationAuthorityState> };
  ceremony: { assertBinding(ceremonyId: string, traceId: string): Promise<unknown>; bindResource(correlation: CeremonyCorrelation, kind: 'live-run' | 'connector-run' | 'mandate' | 'assignment', resourceId: string): Promise<unknown> };
  agents: { getState(): Promise<AgentIdentityState> };
  mandates: { getState(): Promise<MandateState>; create(request: CreateMandateRequest): Promise<MandateState>; delegate(request: DelegateMandateRequest): Promise<MandateState> };
  collaboration: {
    getState(): Promise<CollaborationState>;
    updateAssignment(request: UpdateAssignmentRequest): Promise<CollaborationState>;
    rebindAssignmentAuthority(request: { assignmentId: string; agentId: string; mandateId: string }): Promise<CollaborationState>;
    recordResponse(request: { assignmentId: string; agentId: string; body: string }): Promise<CollaborationState>;
  };
  runtime: { getState(): Promise<LiveRuntimeState>; start(request: StartLiveRunRequest): Promise<LiveRuntimeState>; cancel(runId: string, reason: string): Promise<LiveRuntimeState> };
  frameworks: { getState(): Promise<FrameworkConnectorState>; execute(request: ExecuteFrameworkRequest): Promise<FrameworkConnectorState> };
}

export class RealCollaborationCoordinator {
  private readonly repository: VersionedJsonRepository<'h2a.real-collaboration.state', RealCollaborationState>;
  private queue: Promise<void> = Promise.resolve();

  public constructor(dataPath: string, private readonly evidence: EvidenceLedgerPort, private readonly ports: RealCollaborationPorts, private readonly workspacePath: string, private readonly clock: () => Date = () => new Date()) {
    this.repository = new VersionedJsonRepository(new AtomicFileStore(dataPath), 'collaboration/phase26-state-v1.json', 'h2a.real-collaboration.state', stateDataSchema, { initialData: emptyState(clock), clock });
  }

  public async initialize(): Promise<RealCollaborationState> { await this.repository.read(); return this.getState(); }
  public getState(): Promise<RealCollaborationState> { return this.serialize(async () => this.reconcile(await this.repository.read())); }

  public prepare(request: unknown): Promise<RealCollaborationState> {
    return this.serialize(async () => {
      const input = prepareRealCollaborationRequestSchema.parse(request);
      await this.ports.ceremony.assertBinding(input.ceremony.ceremony_id, input.ceremony.trace_id);
      const current = await this.repository.read();
      if (current.completed_idempotency_keys.includes(input.ceremony.idempotency_key)) return this.reconcile(current);
      const projected = await this.project({ ...current, ceremony_id: input.ceremony.ceremony_id, trace_id: input.ceremony.trace_id, workspace_path: resolve(this.workspacePath), framework_kind: input.framework_kind });
      const blockers = projected.lanes.filter((lane) => lane.status === 'not-ready').map((lane) => `${lane.title}: ${lane.detail}`);
      const next = realCollaborationStateSchema.parse({ ...projected, status: blockers.length ? 'preflight-required' : 'ready', completed_idempotency_keys: [...current.completed_idempotency_keys, input.ceremony.idempotency_key], last_error: blockers.length ? blockers.join(' ') : null, updated_at: this.clock().toISOString() });
      await this.repository.write(next);
      await this.evidence.append({ trace_id: input.ceremony.trace_id, actor: { type: 'system', id: 'h2a-real-collaboration' }, subject: { type: 'ceremony', id: input.ceremony.ceremony_id }, event_type: 'REAL_COLLABORATION_PREFLIGHTED', payload: { framework_kind: input.framework_kind, ready_lanes: next.lanes.filter((lane) => lane.status === 'ready').map((lane) => lane.lane_id), blockers, idempotency_key: input.ceremony.idempotency_key } });
      return next;
    });
  }

  public replaceAuthority(request: unknown): Promise<RealCollaborationState> {
    return this.serialize(async () => {
      const input = replaceRealCollaborationAuthorityRequestSchema.parse(request);
      await this.ports.ceremony.assertBinding(input.ceremony.ceremony_id, input.ceremony.trace_id);
      let current = await this.reconcile(await this.repository.read());
      this.requireCeremony(current, input.ceremony);
      if (current.completed_idempotency_keys.includes(input.ceremony.idempotency_key)) return current;
      if (authorityRenewalBlocked(current.lanes)) throw new Error('Authority cannot be replaced while a Phase 26 execution is running.');

      const [bootstrap, humans, organization, identity] = await Promise.all([
        this.ports.bootstrap.getState(), this.ports.humans.getState(), this.ports.organization.getState(), this.ports.agents.getState()
      ]);
      if (bootstrap.ceremony_id !== input.ceremony.ceremony_id || bootstrap.trace_id !== input.ceremony.trace_id) throw new Error('Phase 25 authority belongs to a different ceremony.');
      const administratorId = bootstrap.administrator_human_id;
      if (!administratorId) throw new Error('Phase 25 administrator identity is missing.');
      const proof = humans.active_proofs.find((item) => item.human_id === administratorId
        && (!input.human_proof_id || item.human_proof_id === input.human_proof_id)
        && (!input.proof_purpose || item.purpose === input.proof_purpose)
        && new Date(item.expires_at).getTime() > this.clock().getTime());
      if (!proof) throw new Error('Fresh Administrator / Approver Human Proof is required. Verify the Phase 25 administrator in Human Proof, then retry.');
      const membership = organization.memberships.find((item) => item.human_id === administratorId && item.status === 'active');
      const credential = organization.credentials.find((item) => item.membership_id === membership?.membership_id && item.status === 'active' && item.role_ids.includes(AUTHORITY_ADMIN_ROLE));
      if (!membership || !credential) throw new Error('An active Authority Administrator membership and credential are required.');
      const humanAuthority = { organizationId: membership.organization_id, membershipId: membership.membership_id, humanProofId: proof.human_proof_id, authorityCredentialId: credential.credential_id };

      const participants = new Map(bootstrap.participants.map((item) => [item.lane, item]));
      const rootParticipant = participants.get('openai-codex');
      const childParticipants = LANE_ORDER.filter((lane) => lane !== 'openai-codex').map((lane) => participants.get(lane));
      if (!rootParticipant?.passport_id || !rootParticipant.agent_id || childParticipants.some((item) => !item?.passport_id || !item.agent_id)) throw new Error('All four Phase 25 Passport participants are required.');
      const rootPassport = identity.passportsV2?.find((item) => item.passport_id === rootParticipant.passport_id && item.status === 'active');
      const childPassports = childParticipants.map((participant) => identity.passportsV2?.find((item) => item.passport_id === participant!.passport_id && item.status === 'active'));
      if (!rootPassport || childPassports.some((item) => !item)) throw new Error('All four active Passport V2 records are required.');

      const expiresAt = new Date(this.clock().getTime() + REPLACEMENT_TTL_MS).toISOString();
      let mandates = await this.ports.mandates.getState();
      const rootTemplate = newestMandate(mandates.mandates.filter((item) => item.subject.passportId === rootPassport.passport_id && !item.parentMandateId));
      if (!rootTemplate) throw new Error('The expired Phase 25 root mandate template was not found.');
      let root = newestMandate(mandates.mandates.filter((item) => item.subject.passportId === rootPassport.passport_id && !item.parentMandateId && isCurrentMandate(item, this.clock())));
      if (!root) {
        mandates = await this.ports.mandates.create({ ...copyMandateScope(rootTemplate), agentId: rootPassport.agent_id, expiresAt, humanAuthority, ceremony: replacementCorrelation(input.ceremony, 'root') });
        root = newestMandate(mandates.mandates.filter((item) => item.subject.passportId === rootPassport.passport_id && !item.parentMandateId && isCurrentMandate(item, this.clock())));
      }
      if (!root) throw new Error('The replacement root mandate was not persisted.');

      const children = [] as MandateState['mandates'];
      for (const childPassport of childPassports as NonNullable<(typeof childPassports)[number]>[]) {
        let child = newestMandate(mandates.mandates.filter((item) => item.parentMandateId === root!.mandateId && item.subject.passportId === childPassport.passport_id && isCurrentMandate(item, this.clock())));
        if (!child) {
          const template = newestMandate(mandates.mandates.filter((item) => item.subject.passportId === childPassport.passport_id && item.parentMandateId));
          if (!template) throw new Error(`The expired Phase 25 mandate template for ${childPassport.name} was not found.`);
          mandates = await this.ports.mandates.delegate({ ...copyMandateScope(template), parentMandateId: root.mandateId, fromAgentId: rootPassport.agent_id, agentId: childPassport.agent_id, expiresAt, humanAuthority, ceremony: replacementCorrelation(input.ceremony, `child_${childPassport.agent_id}`) });
          child = newestMandate(mandates.mandates.filter((item) => item.parentMandateId === root!.mandateId && item.subject.passportId === childPassport.passport_id && isCurrentMandate(item, this.clock())));
        }
        if (!child) throw new Error(`The replacement mandate for ${childPassport.name} was not persisted.`);
        children.push(child);
      }

      const replacementMandates = [root, ...children];
      for (const mandate of replacementMandates) await this.ports.ceremony.bindResource(replacementCorrelation(input.ceremony, `bind_${mandate.mandateId}`), 'mandate', mandate.mandateId);

      let collaboration = await this.ports.collaboration.getState();
      const assignmentIds: string[] = [];
      for (const participant of bootstrap.participants) {
        const assignment = collaboration.workplace.assignments.find((item) => bootstrap.assignment_ids.includes(item.id) && item.assigneeId === participant.binding_id);
        if (!assignment || !participant.binding_id) throw new Error(`The Phase 25 assignment for ${participant.name} was not found.`);
        const expected = replacementMandates.find((item) => item.subject.agentId === participant.agent_id);
        if (!expected) throw new Error(`Replacement authority was not resolved for ${participant.name}.`);
        collaboration = await this.ports.collaboration.rebindAssignmentAuthority({ assignmentId: assignment.id, agentId: participant.binding_id, mandateId: expected.mandateId });
        const rebound = collaboration.workplace.assignments.find((item) => item.id === assignment.id);
        const reboundAgent = collaboration.workplace.agents.find((item) => item.id === participant.binding_id);
        if (!rebound || !reboundAgent || rebound.mandateId !== expected.mandateId || reboundAgent.mandateId !== expected.mandateId) throw new Error(`Assignment authority replacement failed for ${participant.name}.`);
        assignmentIds.push(rebound.id);
        await this.ports.ceremony.bindResource(replacementCorrelation(input.ceremony, `bind_${rebound.id}`), 'assignment', rebound.id);
      }

      await this.evidence.append({
        trace_id: input.ceremony.trace_id,
        actor: { type: 'human', id: administratorId },
        subject: { type: 'ceremony', id: input.ceremony.ceremony_id },
        event_type: 'REAL_COLLABORATION_AUTHORITY_REPLACED',
        payload: {
          human_proof_id: proof.human_proof_id,
          authority_credential_id: credential.credential_id,
          expired_mandate_ids: [rootTemplate.mandateId, ...childPassports.map((passport) => newestMandate(mandates.mandates.filter((item) => item.subject.passportId === passport!.passport_id && item.parentMandateId !== root!.mandateId))?.mandateId).filter((value): value is string => Boolean(value))],
          replacement_mandate_ids: replacementMandates.map((item) => item.mandateId),
          assignment_ids: assignmentIds,
          expires_at: root.expiresAt,
          idempotency_key: input.ceremony.idempotency_key
        }
      });
      current = realCollaborationStateSchema.parse({ ...current, completed_idempotency_keys: [...new Set([...current.completed_idempotency_keys, input.ceremony.idempotency_key])].slice(-100), last_error: null, updated_at: this.clock().toISOString() });
      await this.repository.write(current);
      return this.reconcile(current);
    });
  }

  public runLane(request: unknown): Promise<RealCollaborationState> {
    return this.serialize(async () => {
      const input = runRealCollaborationLaneRequestSchema.parse(request);
      await this.ports.ceremony.assertBinding(input.ceremony.ceremony_id, input.ceremony.trace_id);
      let current = await this.reconcile(await this.repository.read());
      this.requireCeremony(current, input.ceremony);
      if (current.completed_idempotency_keys.includes(input.ceremony.idempotency_key)) return current;
      const lane = current.lanes.find((item) => item.lane_id === input.lane_id)!;
      if (!isRealCollaborationLaneRunnable(lane, current.lanes)) {
        const activeLane = current.lanes.find((item) => item.lane_id !== lane.lane_id && (item.status === 'starting' || item.status === 'running'));
        if (activeLane) throw new Error(`Wait for or cancel ${activeLane.title} before starting another Phase 26 lane.`);
        throw new Error(`${lane.title} is not ready to run.`);
      }
      if (!lane.assignment_id || !lane.binding_id || !lane.passport_id || !lane.runtime_session_id || !lane.mandate_id || !lane.agent_id) throw new Error(`${lane.title} has unresolved authority links.`);
      const dependencies = completedLaneDependencies(current.lanes, input.lane_id);
      await this.ports.collaboration.updateAssignment({ assignmentId: lane.assignment_id, status: 'active' });
      const starting = replaceLane(current, input.lane_id, { status: 'starting', error: null, started_at: this.clock().toISOString(), completed_at: null, dependency_output_hashes: dependencies.outputHashes });
      const executingLane = starting.lanes.find((item) => item.lane_id === input.lane_id)!;
      await this.repository.write(starting);
      try {
        if (input.lane_id === 'framework') {
          const identity = await this.ports.agents.getState();
          const passport = identity.passportsV2?.find((item) => item.passport_id === lane.passport_id);
          const session = identity.runtimeSessions?.find((item) => item.runtime_session_id === lane.runtime_session_id);
          if (!passport || !session) throw new Error('Framework Passport or runtime session became unavailable after preflight.');
          const framework = await this.ports.frameworks.execute({ kind: starting.framework_kind, organization_id: passport.organization_id, requestor_human_id: passport.sponsor_human_id, assigned_agent_id: passport.agent_id, passport_id: passport.passport_id, runtime_attestation_id: session.runtime_attestation_id, runtime_session_id: session.runtime_session_id, mandate_id: lane.mandate_id, assignment_id: lane.assignment_id, objective: fixedObjective(input.lane_id, executingLane.dependency_output_hashes), dependency_task_ids: dependencies.assignmentIds, dependency_output_hashes: executingLane.dependency_output_hashes, timeout_seconds: 30, ceremony: input.ceremony });
          const expectedRunId = `framework_run_${input.ceremony.idempotency_key}`;
          const run = framework.collaboration_runs.find((item) => item.run_id === expectedRunId);
          if (!run) throw new Error('Framework execution did not return its correlated durable run record.');
          await this.ports.ceremony.bindResource({ ...input.ceremony, idempotency_key: `${input.ceremony.idempotency_key}_bind` }, 'connector-run', run.run_id);
          current = replaceLane(starting, input.lane_id, { run_id: run.run_id, status: run.status === 'succeeded' ? 'succeeded' : 'failed', output_hash: run.steps[0]?.output_hash ?? null, completed_at: run.completed_at, error: run.status === 'failed' ? 'Framework delivery failed.' : null });
          current = await this.finalizeLane(current, input.lane_id);
        } else {
          const runtime = await this.ports.runtime.start({ provider: input.lane_id, agent_id: lane.binding_id, passport_id: lane.passport_id, binding_id: lane.binding_id, runtime_session_id: lane.runtime_session_id, mandate_id: lane.mandate_id, trace_id: input.ceremony.trace_id, workspace_path: resolve(this.workspacePath), prompt: fixedObjective(input.lane_id, executingLane.dependency_output_hashes), timeout_seconds: 120, ceremony: input.ceremony });
          const run = runtime.runs.find((item) => item.idempotency_key === input.ceremony.idempotency_key)!;
          if (!run) throw new Error('Provider supervisor did not return a durable run record.');
          await this.ports.ceremony.bindResource({ ...input.ceremony, idempotency_key: `${input.ceremony.idempotency_key}_bind` }, 'live-run', run.run_id);
          current = replaceLane(starting, input.lane_id, { run_id: run.run_id, status: run.status === 'starting' ? 'starting' : 'running' });
        }
        current = realCollaborationStateSchema.parse({ ...current, status: current.lanes.every((item) => item.status === 'succeeded') ? 'succeeded' : 'running', completed_idempotency_keys: [...current.completed_idempotency_keys, input.ceremony.idempotency_key], last_error: null, updated_at: this.clock().toISOString() });
        await this.repository.write(current);
        return this.reconcile(current);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Real collaboration lane failed.';
        const failed = realCollaborationStateSchema.parse({ ...replaceLane(starting, input.lane_id, { status: 'failed', error: message, completed_at: this.clock().toISOString() }), status: 'blocked', last_error: message, updated_at: this.clock().toISOString() });
        await this.repository.write(failed);
        await this.ports.collaboration.updateAssignment({ assignmentId: lane.assignment_id, status: 'blocked' });
        await this.evidence.append({ trace_id: input.ceremony.trace_id, actor: { type: 'system', id: 'h2a-real-collaboration' }, subject: { type: 'assignment', id: lane.assignment_id }, mandate_id: lane.mandate_id, event_type: 'REAL_COLLABORATION_LANE_FAILED', payload: { lane_id: input.lane_id, reason: message, idempotency_key: input.ceremony.idempotency_key } });
        throw error;
      }
    });
  }

  public cancelLane(request: unknown): Promise<RealCollaborationState> {
    return this.serialize(async () => {
      const input = cancelRealCollaborationLaneRequestSchema.parse(request);
      await this.ports.ceremony.assertBinding(input.ceremony.ceremony_id, input.ceremony.trace_id);
      const current = await this.repository.read(); this.requireCeremony(current, input.ceremony);
      const lane = current.lanes.find((item) => item.lane_id === input.lane_id)!;
      if (!lane.run_id || input.lane_id === 'framework') throw new Error('This lane has no cancellable supervised provider process.');
      await this.ports.runtime.cancel(lane.run_id, input.reason);
      return this.reconcile(current);
    });
  }

  private async reconcile(state: RealCollaborationState): Promise<RealCollaborationState> {
    let next = await this.project(state);
    const runtime = await this.ports.runtime.getState();
    for (const lane of next.lanes.filter((item) => item.run_id && item.lane_id !== 'framework')) {
      const run = runtime.runs.find((item) => item.run_id === lane.run_id); if (!run) continue;
      const status = run.status === 'succeeded' ? 'succeeded' : run.status === 'failed' || run.status === 'revoked' ? 'failed' : run.status === 'cancelled' ? 'cancelled' : run.status === 'timed-out' ? 'timed-out' : 'running';
      const outputHash = ['succeeded', 'failed', 'cancelled', 'timed-out', 'revoked'].includes(run.status) ? hashCanonical(run.output_summary ?? '') : null;
      next = replaceLane(next, lane.lane_id, { status, output_hash: outputHash, completed_at: run.completed_at ?? null, error: status === 'failed' ? run.termination_reason ?? 'Provider failed.' : null });
      if (['succeeded', 'failed', 'cancelled', 'timed-out'].includes(status)) next = await this.finalizeLane(next, lane.lane_id);
    }
    const status = next.lanes.every((item) => item.status === 'succeeded') ? 'succeeded' : next.lanes.some((item) => ['starting', 'running'].includes(item.status)) ? 'running' : next.lanes.some((item) => ['failed', 'cancelled', 'timed-out'].includes(item.status)) ? 'blocked' : next.lanes.some((item) => item.status === 'not-ready') ? 'preflight-required' : next.ceremony_id ? 'ready' : 'not-started';
    const blockers = next.lanes.filter((item) => item.status === 'not-ready').map((item) => `${item.title}: ${item.detail}`);
    const lastError = status === 'preflight-required' ? blockers.join(' ') : status === 'ready' || status === 'succeeded' ? null : next.last_error;
    // State reads participate in the filesystem-driven control-plane refresh feed.
    // Rewriting an unchanged projection would trigger its own next refresh forever.
    next = realCollaborationStateSchema.parse({ ...next, status, last_error: lastError, updated_at: state.updated_at });
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      next = realCollaborationStateSchema.parse({ ...next, updated_at: this.clock().toISOString() });
      await this.repository.write(next);
    }
    return next;
  }

  private async project(state: RealCollaborationState): Promise<RealCollaborationState> {
    if (!state.ceremony_id || !state.trace_id) return state;
    const [bootstrap, identity, mandates, collaboration, runtime, frameworks] = await Promise.all([this.ports.bootstrap.getState(), this.ports.agents.getState(), this.ports.mandates.getState(), this.ports.collaboration.getState(), this.ports.runtime.getState(), this.ports.frameworks.getState()]);
    if (bootstrap.steps.find((step) => step.step_id === 'restart-recovery')?.status !== 'passed') throw new Error('Phase 25 restart recovery must pass before Phase 26 preflight.');
    const lanes = state.lanes.map((lane) => projectLane(lane, bootstrap, identity, mandates, collaboration, runtime, frameworks, state.framework_kind, this.clock(), state.trace_id!));
    return realCollaborationStateSchema.parse({ ...state, lanes, updated_at: this.clock().toISOString() });
  }

  private async finalizeLane(state: RealCollaborationState, laneId: RealCollaborationLaneId): Promise<RealCollaborationState> {
    const lane = state.lanes.find((item) => item.lane_id === laneId)!;
    if (!lane.assignment_id || !lane.binding_id || !lane.output_hash) return state;
    const collaboration = await this.ports.collaboration.getState();
    const assignment = collaboration.workplace.assignments.find((item) => item.id === lane.assignment_id);
    const target = lane.status === 'succeeded' ? 'complete' : 'blocked';
    if (assignment && assignment.status !== target) {
      if (target === 'complete' && ['queued', 'blocked', 'approval'].includes(assignment.status)) {
        await this.ports.collaboration.updateAssignment({ assignmentId: assignment.id, status: 'active' });
      }
      await this.ports.collaboration.updateAssignment({ assignmentId: assignment.id, status: target });
    }
    if (lane.status === 'succeeded' && !collaboration.responses.some((item) => item.assignmentId === lane.assignment_id && item.body.includes(lane.output_hash!))) await this.ports.collaboration.recordResponse({ assignmentId: lane.assignment_id, agentId: lane.binding_id, body: `Phase 26 ${lane.title} completed. Output hash: ${lane.output_hash}` });
    return state;
  }

  private requireCeremony(state: RealCollaborationState, ceremony: CeremonyCorrelation): void {
    if (state.ceremony_id !== ceremony.ceremony_id || state.trace_id !== ceremony.trace_id) throw new Error('Phase 26 state belongs to a different ceremony.');
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> { const result = this.queue.then(operation, operation); this.queue = result.then(() => undefined, () => undefined); return result; }
}

function projectLane(lane: RealCollaborationLane, bootstrap: GuidedBootstrapState, identity: AgentIdentityState, mandates: MandateState, collaboration: CollaborationState, runtime: LiveRuntimeState, frameworks: FrameworkConnectorState, frameworkKind: 'mcp' | 'custom-cli', now: Date, traceId: string): RealCollaborationLane {
  const provider = lane.lane_id === 'framework' ? 'custom-cli' : lane.lane_id;
  const passport = identity.passportsV2?.find((item) => item.connector_manifest_id === `connector_${provider}_v1` && item.status === 'active');
  const binding = identity.bindings.find((item) => item.agent_id === passport?.agent_id && item.connection_state === 'connected');
  const session = identity.runtimeSessions?.find((item) => item.passport_id === passport?.passport_id && item.runtime_session_id === binding?.live_session_id && ['ready', 'working'].includes(item.state));
  const attestation = identity.attestations?.find((item) => item.attestation_id === session?.runtime_attestation_id && item.passport_id === passport?.passport_id && item.connector_manifest_id === passport?.connector_manifest_id && new Date(item.expires_at).getTime() > now.getTime());
  const assignment = phase26AssignmentForBinding(collaboration.workplace.assignments, bootstrap.assignment_ids, binding?.binding_id);
  const mandate = mandates.mandates.find((item) => item.mandateId === assignment?.mandateId && item.subject.passportId === passport?.passport_id && item.status === 'active' && new Date(item.expiresAt).getTime() > now.getTime());
  const workplaceAgent = collaboration.workplace.agents.find((item) => item.id === binding?.binding_id && item.passportId === passport?.passport_id);
  const declaration = frameworks.declarations.find((item) => item.kind === frameworkKind);
  const providerStatus = runtime.providers.find((item) => item.provider === lane.lane_id);
  const health = lane.lane_id === 'framework' ? declaration?.health ?? 'dependency-missing' : providerStatus?.health ?? 'dependency-missing';
  const detail = !passport ? 'Active Passport V2 is missing.' : !binding ? 'Connected runtime binding is missing.' : !session ? 'Ready runtime session is missing.' : !attestation ? 'Active runtime attestation is missing or expired.' : !mandate ? 'Active mandate is missing or expired.' : !assignment ? 'Ceremony assignment is missing.' : !workplaceAgent ? 'Agent workplace mandate projection requires repair.' : lane.lane_id === 'framework' ? declaration?.detail ?? 'Framework declaration is missing.' : providerStatus?.detail ?? 'Provider preflight is unavailable.';
  const ready = Boolean(passport && binding && session && attestation && mandate && assignment && workplaceAgent && (health === 'ready' || health === 'authentication-required'));
  const projected = realCollaborationStateSchema.shape.lanes.element.parse({ ...lane, provider, health, detail, version: providerStatus?.version, agent_id: binding?.binding_id ?? null, passport_id: passport?.passport_id ?? null, binding_id: binding?.binding_id ?? null, runtime_session_id: session?.runtime_session_id ?? null, mandate_id: mandate?.mandateId ?? null, assignment_id: assignment?.id ?? null, status: ['starting', 'running', 'succeeded', 'failed', 'cancelled', 'timed-out'].includes(lane.status) ? lane.status : ready ? 'ready' : 'not-ready' });
  if (lane.lane_id !== 'framework' || !assignment) return projected;
  const frameworkRun = newestFrameworkRun(frameworks.collaboration_runs.filter((item) => item.assignment_id === assignment.id && item.trace_id === traceId && item.steps.some((step) => step.connector_kind === frameworkKind)));
  if (!frameworkRun) return projected;
  return realCollaborationStateSchema.shape.lanes.element.parse({
    ...projected,
    run_id: frameworkRun.run_id,
    status: frameworkRun.status === 'succeeded' ? 'succeeded' : 'failed',
    output_hash: frameworkRun.steps.find((step) => step.connector_kind === frameworkKind)?.output_hash ?? null,
    started_at: frameworkRun.started_at,
    completed_at: frameworkRun.completed_at,
    error: frameworkRun.status === 'succeeded' ? null : 'Framework delivery failed.'
  });
}

export function phase26AssignmentForBinding(assignments: CollaborationState['workplace']['assignments'], bootstrapAssignmentIds: string[], bindingId?: string): CollaborationState['workplace']['assignments'][number] | undefined {
  if (!bindingId) return undefined;
  return assignments.find((item) => bootstrapAssignmentIds.includes(item.id) && item.assigneeId === bindingId);
}

function emptyState(clock: () => Date): RealCollaborationState {
  const specs: Array<[RealCollaborationLaneId, string, RealCollaborationLane['provider']]> = [['claude-code', 'Claude control review', 'claude-code'], ['gemini-antigravity', 'Antigravity architecture review', 'gemini-antigravity'], ['framework', 'Conformant framework review', 'custom-cli'], ['openai-codex', 'Codex evidence consolidation', 'openai-codex']];
  return realCollaborationStateSchema.parse({ schema_version: 1, ceremony_id: null, trace_id: null, status: 'not-started', workspace_path: null, framework_kind: 'mcp', lanes: specs.map(([lane_id, title, provider]) => ({ lane_id, title, provider, status: 'not-ready', health: 'disabled', detail: 'Run Phase 26 preflight.', agent_id: null, passport_id: null, binding_id: null, runtime_session_id: null, mandate_id: null, assignment_id: null, run_id: null, output_hash: null, dependency_output_hashes: [], started_at: null, completed_at: null, error: null })), completed_idempotency_keys: [], last_error: null, updated_at: clock().toISOString() });
}

export function completedLaneDependencies(lanes: RealCollaborationLane[], targetLaneId: RealCollaborationLaneId): { assignmentIds: string[]; outputHashes: string[] } {
  const completed = lanes.filter((lane) => lane.lane_id !== targetLaneId && lane.status === 'succeeded' && lane.assignment_id && lane.output_hash);
  return {
    assignmentIds: completed.map((lane) => lane.assignment_id as string),
    outputHashes: completed.map((lane) => lane.output_hash as string)
  };
}

function replaceLane(state: RealCollaborationState, laneId: RealCollaborationLaneId, patch: Partial<RealCollaborationLane>): RealCollaborationState { return realCollaborationStateSchema.parse({ ...state, lanes: state.lanes.map((lane) => lane.lane_id === laneId ? { ...lane, ...patch } : lane), updated_at: new Date().toISOString() }); }
function newestMandate(mandates: MandateState['mandates']): MandateState['mandates'][number] | undefined { return [...mandates].sort((left, right) => right.issuedAt.localeCompare(left.issuedAt))[0]; }
export function newestFrameworkRun(runs: FrameworkConnectorState['collaboration_runs']): FrameworkConnectorState['collaboration_runs'][number] | undefined {
  return [...runs].sort((left, right) => (right.completed_at ?? right.started_at).localeCompare(left.completed_at ?? left.started_at))[0];
}
function isCurrentMandate(mandate: MandateState['mandates'][number], now: Date): boolean { return mandate.status === 'active' && new Date(mandate.expiresAt).getTime() > now.getTime(); }
export function authorityRenewalBlocked(lanes: RealCollaborationState['lanes']): boolean { return lanes.some((lane) => ['starting', 'running'].includes(lane.status)); }
function copyMandateScope(mandate: MandateState['mandates'][number]): Pick<CreateMandateRequest, 'objective' | 'resources' | 'actions' | 'prohibitedActions' | 'limits' | 'allowedFields' | 'approvalActions' | 'delegation'> {
  return { objective: mandate.objective, resources: mandate.resources, actions: mandate.actions, prohibitedActions: mandate.prohibitedActions, limits: mandate.limits, allowedFields: mandate.disclosure.allowedFields, approvalActions: mandate.approvals.requiredActions, delegation: mandate.delegation };
}
function replacementCorrelation(ceremony: CeremonyCorrelation, suffix: string): CeremonyCorrelation { return { ...ceremony, idempotency_key: `${ceremony.idempotency_key}_${suffix}`.slice(0, 200) }; }
function fixedObjective(lane: RealCollaborationLaneId, dependencies: string[]): string {
  const reference = dependencies.length ? ` Approved predecessor output hashes: ${dependencies.join(', ')}.` : ' No predecessor content is disclosed.';
  if (lane === 'claude-code') return `Review the H2A control-evidence assignment using only its signed authority references. Return a concise structured finding; do not modify files.${reference}`;
  if (lane === 'gemini-antigravity') return `Complete this response-only H2A architecture-risk review using only the signed identifiers and predecessor hashes in this prompt. Do not call any tool, inspect or search files, access configuration or home directories, browse, run commands, ask questions, request permissions, or modify anything. Return a concise structured finding directly in the response.${reference}`;
  if (lane === 'framework') return `Execute the signed zero-disclosure framework assignment and acknowledge its dependency references.${reference}`;
  return `Consolidate the approved specialist output hashes into a concise HP CTO/CISO status summary. Do not modify files or request additional context.${reference}`;
}
