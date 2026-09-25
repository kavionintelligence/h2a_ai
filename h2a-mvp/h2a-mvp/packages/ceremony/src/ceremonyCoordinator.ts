import { randomUUID } from 'node:crypto';
import {
  ceremonySessionSchema,
  ceremonyStateSchema,
  type AgentIdentityState,
  type AuthorityEventRecord,
  type AuthorityApprovalState,
  type CeremonyParticipant,
  type CeremonyCorrelation,
  type CeremonyResourceKind,
  type CeremonySession,
  type CeremonyState,
  type CeremonyStep,
  type CeremonyStepId,
  type ConnectorProtocolState,
  type ContextBrokerState,
  type CreateCeremonySessionRequest,
  type FederationState,
  type FrameworkConnectorState,
  type HumanIdentityV2State,
  type LiveRuntimeState,
  type MandateState,
  type OrganizationAuthorityState,
  type RunCeremonyStepRequest
} from '@h2a/contracts';
import { type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

interface StatePort<T> { getState(): Promise<T>; }

export interface CeremonyCoordinatorPorts {
  humans: StatePort<HumanIdentityV2State>;
  organization: StatePort<OrganizationAuthorityState>;
  agents: StatePort<AgentIdentityState>;
  mandates: StatePort<MandateState>;
  approvals: StatePort<AuthorityApprovalState>;
  context: StatePort<ContextBrokerState>;
  connectorProtocol: StatePort<ConnectorProtocolState>;
  frameworks: StatePort<FrameworkConnectorState>;
  live: StatePort<LiveRuntimeState>;
  federation: StatePort<FederationState>;
}

export class CeremonyCoordinator {
  private readonly repository: VersionedJsonRepository<'h2a.ceremony.state', CeremonyState>;
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly ports: CeremonyCoordinatorPorts,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.repository = new VersionedJsonRepository(
      new AtomicFileStore(dataPath),
      'ceremony/phase24-state-v1.json',
      'h2a.ceremony.state',
      ceremonyStateSchema,
      { initialData: { schema_version: 1, active_ceremony_id: null, sessions: [] }, clock }
    );
  }

  public async initialize(): Promise<CeremonyState> { return this.repository.read(); }
  public async getState(): Promise<CeremonyState> { return this.repository.read(); }

  public createSession(input: CreateCeremonySessionRequest): Promise<CeremonyState> {
    return this.serialized(() => this.createSessionUnlocked(input));
  }

  public runStep(input: RunCeremonyStepRequest): Promise<CeremonyState> {
    return this.serialized(() => this.runStepUnlocked(input));
  }

  public async assertBinding(ceremonyId: string, traceId: string): Promise<CeremonySession> {
    const session = (await this.repository.read()).sessions.find((item) => item.ceremony_id === ceremonyId);
    if (!session || session.status !== 'active') throw new Error('Ceremony session is not active.');
    if (session.trace_id !== traceId) throw new Error('Resource trace belongs to a different ceremony.');
    return session;
  }

  public bindResource(correlation: CeremonyCorrelation, kind: CeremonyResourceKind, resourceId: string): Promise<CeremonyState> {
    return this.serialized(async () => {
      const current = await this.repository.read();
      const index = current.sessions.findIndex((item) => item.ceremony_id === correlation.ceremony_id);
      const session = await this.assertBinding(correlation.ceremony_id, correlation.trace_id);
      const owner = current.sessions.find((item) => item.resources.some((resource) => resource.kind === kind && resource.resource_id === resourceId));
      if (owner && owner.ceremony_id !== session.ceremony_id) throw new Error(`${kind} resource belongs to a different ceremony.`);
      if (owner) return current;
      const updated = ceremonySessionSchema.parse({ ...session, resources: [...session.resources, { kind, resource_id: resourceId, ceremony_id: session.ceremony_id, trace_id: session.trace_id, bound_at: this.clock().toISOString() }], updated_at: this.clock().toISOString() });
      return this.replaceSession(current, index, updated);
    });
  }

  public async assertResourceBinding(ceremonyId: string, traceId: string, kind: CeremonyResourceKind, resourceId: string): Promise<void> {
    const state = await this.repository.read();
    await this.assertBinding(ceremonyId, traceId);
    const owner = state.sessions.find((item) => item.resources.some((resource) => resource.kind === kind && resource.resource_id === resourceId));
    if (!owner) throw new Error(`${kind} resource is not bound to a ceremony.`);
    if (owner.ceremony_id !== ceremonyId || owner.trace_id !== traceId) throw new Error(`${kind} resource belongs to a different ceremony.`);
  }

  private async createSessionUnlocked(input: CreateCeremonySessionRequest): Promise<CeremonyState> {
    const current = await this.repository.read();
    const existing = current.sessions.find((item) => item.create_idempotency_key === input.idempotency_key);
    if (existing) return current;
    const now = this.clock().toISOString();
    const ceremonyId = `ceremony_${randomUUID()}`;
    const traceId = `phase22_${randomUUID()}`;
    const createdEvent = await this.evidence.append({
      trace_id: traceId,
      actor: { type: 'system', id: 'h2a-ceremony-coordinator' },
      subject: { type: 'ceremony', id: ceremonyId },
      event_type: 'CEREMONY_SESSION_CREATED',
      payload: { ceremony_id: ceremonyId, idempotency_key: input.idempotency_key, title: input.title }
    });
    const sessions = current.sessions.map((session) => session.status === 'active' ? supersede(session, now) : session);
    const session = ceremonySessionSchema.parse({
      schema_version: 1,
      ceremony_id: ceremonyId,
      trace_id: traceId,
      title: input.title,
      status: 'active',
      create_idempotency_key: input.idempotency_key,
      participants: [],
      resources: [],
      steps: initialSteps(now, createdEvent.event_id),
      created_at: now,
      updated_at: now
    });
    return this.repository.write({ schema_version: 1, active_ceremony_id: ceremonyId, sessions: [...sessions, session] });
  }

  private async runStepUnlocked(input: RunCeremonyStepRequest): Promise<CeremonyState> {
    const current = await this.repository.read();
    const index = current.sessions.findIndex((item) => item.ceremony_id === input.ceremony_id);
    if (index < 0) throw new Error('Ceremony session was not found.');
    const session = current.sessions[index]!;
    if (session.status !== 'active' || current.active_ceremony_id !== session.ceremony_id) throw new Error('Ceremony session is not active.');
    const step = session.steps.find((item) => item.step_id === input.step_id)!;
    if (step.idempotency_keys.includes(input.idempotency_key)) return current;
    const startedAt = this.clock().toISOString();
    const started = await this.evidence.append({
      trace_id: session.trace_id,
      actor: { type: 'system', id: 'h2a-ceremony-coordinator' },
      subject: { type: 'ceremony', id: session.ceremony_id },
      event_type: 'CEREMONY_STEP_STARTED',
      payload: { ceremony_id: session.ceremony_id, step_id: step.step_id, idempotency_key: input.idempotency_key }
    });
    try {
      const snapshot = await this.readPublicState();
      const projection = project(snapshot, session.trace_id);
      const completedAt = this.clock().toISOString();
      const completed = await this.evidence.append({
        trace_id: session.trace_id,
        actor: { type: 'system', id: 'h2a-ceremony-coordinator' },
        subject: { type: 'ceremony', id: session.ceremony_id },
        event_type: 'CEREMONY_STEP_PASSED',
        parent_event_id: started.event_id,
        payload: { ceremony_id: session.ceremony_id, step_id: step.step_id, idempotency_key: input.idempotency_key, ...projection.summary }
      });
      const updated = ceremonySessionSchema.parse({ ...session, participants: projection.participants, steps: mergeProjectedSteps(session.steps, projection.steps, step.step_id, input.idempotency_key, started.event_id, completed.event_id, startedAt, completedAt), updated_at: completedAt });
      return this.replaceSession(current, index, updated);
    } catch (error) {
      const completedAt = this.clock().toISOString();
      const message = error instanceof Error ? error.message : 'Prerequisite assessment failed.';
      const failed = await this.evidence.append({
        trace_id: session.trace_id,
        actor: { type: 'system', id: 'h2a-ceremony-coordinator' },
        subject: { type: 'ceremony', id: session.ceremony_id },
        event_type: 'CEREMONY_STEP_FAILED',
        parent_event_id: started.event_id,
        payload: { ceremony_id: session.ceremony_id, step_id: step.step_id, idempotency_key: input.idempotency_key, reason: message }
      });
      const steps = session.steps.map((item) => item.step_id === step.step_id ? { ...item, status: 'failed' as const, blocker: message, attempts: item.attempts + 1, idempotency_keys: [...item.idempotency_keys, input.idempotency_key], evidence_refs: [...item.evidence_refs, started.event_id, failed.event_id], started_at: startedAt, completed_at: completedAt } : item);
      await this.replaceSession(current, index, ceremonySessionSchema.parse({ ...session, steps, updated_at: completedAt }));
      throw error;
    }
  }

  private async readPublicState() {
    const [humans, organization, agents, mandates, approvals, context, connectorProtocol, frameworks, live, federation, events] = await Promise.all([
      this.ports.humans.getState(), this.ports.organization.getState(), this.ports.agents.getState(), this.ports.mandates.getState(),
      this.ports.approvals.getState(), this.ports.context.getState(), this.ports.connectorProtocol.getState(), this.ports.frameworks.getState(),
      this.ports.live.getState(), this.ports.federation.getState(), this.evidence.list()
    ]);
    return { humans, organization, agents, mandates, approvals, context, connectorProtocol, frameworks, live, federation, events };
  }

  private async replaceSession(current: CeremonyState, index: number, session: CeremonySession): Promise<CeremonyState> {
    const sessions = [...current.sessions]; sessions[index] = session;
    return this.repository.write({ ...current, sessions });
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

type PublicSnapshot = Awaited<ReturnType<CeremonyCoordinator['readPublicState']>>;

function project(snapshot: PublicSnapshot, traceId: string): { participants: CeremonyParticipant[]; steps: Map<CeremonyStepId, Pick<CeremonyStep, 'status' | 'blocker' | 'evidence_refs'>>; summary: Record<string, number> } {
  const activeHumans = snapshot.humans.identities.filter((item) => item.status === 'active');
  const activeAgents = snapshot.agents.passportsV2?.filter((item) => item.status === 'active') ?? [];
  const participants: CeremonyParticipant[] = [
    ...activeHumans.map((item) => ({ participant_id: `participant_${item.human_id}`, kind: 'human' as const, subject_id: item.human_id, display_name: item.display_name, role: 'Human operator', status: 'candidate' as const, evidence_refs: snapshot.humans.active_proofs.filter((proof) => proof.human_id === item.human_id).map((proof) => proof.human_proof_id) })),
    ...activeAgents.map((item) => ({ participant_id: `participant_${item.agent_id}`, kind: 'agent' as const, subject_id: item.agent_id, display_name: item.name, role: item.role, status: 'candidate' as const, evidence_refs: [item.passport_id] }))
  ];
  const ready = (condition: boolean, blocker: string, refs: string[] = []) => ({ status: condition ? 'ready' as const : 'not-ready' as const, blocker: condition ? null : blocker, evidence_refs: refs });
  const activeMemberships = snapshot.organization.memberships.filter((item) => item.status === 'active');
  const activeCredentials = snapshot.organization.credentials.filter((item) => item.status === 'active');
  const runtimeSessions = snapshot.agents.runtimeSessions?.filter((item) => ['ready', 'working'].includes(item.state)) ?? [];
  const requiredProviders = ['claude-code', 'gemini-antigravity', 'openai-codex'] as const;
  const successfulProviderRuns = snapshot.live.runs.filter((item) => item.trace_id === traceId && item.status === 'succeeded');
  const providerTaskReady = requiredProviders.every((provider) => successfulProviderRuns.some((item) => item.provider === provider));
  const successfulFrameworkRuns = snapshot.frameworks.collaboration_runs.filter((item) => item.trace_id === traceId && item.status === 'succeeded');
  const phase30 = projectPhase30(snapshot.events.filter((item) => item.trace_id === traceId));
  const steps = new Map<CeremonyStepId, Pick<CeremonyStep, 'status' | 'blocker' | 'evidence_refs'>>([
    ['organization-authority', ready(activeMemberships.length >= 2 && activeCredentials.length >= 2, 'Create two active memberships with authority credentials.', [...activeMemberships.map((item) => item.membership_id), ...activeCredentials.map((item) => item.credential_id)])],
    ['workload-identity', ready(activeAgents.length >= 4 && runtimeSessions.length >= 4, 'Attest four active Passport V2 runtime participants.', [...activeAgents.map((item) => item.passport_id), ...runtimeSessions.map((item) => item.runtime_session_id)])],
    ['shared-provider-task', ready(providerTaskReady, 'Complete successful Claude, Antigravity, and Codex runs on this ceremony trace in Phase 26.', successfulProviderRuns.map((item) => item.run_id))],
    ['external-framework', ready(successfulFrameworkRuns.length > 0, 'Complete a conformant framework run on this ceremony trace in Phase 26.', successfulFrameworkRuns.map((item) => item.run_id))],
    ['context-minimization', ready(snapshot.context.grants.some((item) => item.status === 'active'), 'Issue an active Context Grant in Phase 27.', snapshot.context.grants.map((item) => item.grant.context_grant_id))],
    ['authority-escalation', ready(snapshot.approvals.policies.some((item) => item.status === 'active'), 'Create an active approval policy before Phase 28.', snapshot.approvals.policies.map((item) => item.approval_policy_id))],
    ['runtime-containment', ready(phase30.containment.length === 2, 'Run cancellation and revocation controls in Phase 30.', phase30.containment.map((item) => item.event_id))],
    ['adversarial-controls', ready(phase30.attacks.length === 6, 'Run the adversarial control matrix in Phase 30.', phase30.attacks.map((item) => item.event_id))],
    ['restart-recovery', ready(Boolean(phase30.restart), 'Complete the guided restart checkpoint for this ceremony.', phase30.restart ? [phase30.restart.event_id] : [])],
    ['evidence-reconstruction', ready(false, 'Complete the shared trace before final evidence reconstruction.')]
  ]);
  return { participants, steps, summary: { humans: activeHumans.length, agents: activeAgents.length, memberships: activeMemberships.length, credentials: activeCredentials.length, mandates: snapshot.mandates.mandates.length, connector_manifests: snapshot.connectorProtocol.connectors.length, live_runs: snapshot.live.runs.length, federation_peers: snapshot.federation.peers.length } };
}

function projectPhase30(events: AuthorityEventRecord[]): { attacks: AuthorityEventRecord[]; containment: AuthorityEventRecord[]; restart?: AuthorityEventRecord } {
  const reason = (event: AuthorityEventRecord): string => String(event.payload.reason_code ?? event.payload.termination_reason ?? '');
  const latest = (predicate: (event: AuthorityEventRecord) => boolean): AuthorityEventRecord | undefined => [...events].reverse().find(predicate);
  const attacks = [
    latest((event) => event.event_type === 'POLICY_DENIED' && reason(event) === 'REPLAY_DETECTED'),
    latest((event) => event.event_type === 'APPROVAL_INVALIDATED_V2' && reason(event) === 'APPROVAL_SIGNATURE_INVALID'),
    latest((event) => event.event_type === 'DELEGATION_DENIED' && reason(event) === 'CHILD_EXPANDS_PARENT_AUTHORITY'),
    latest((event) => event.event_type === 'CONTEXT_DISCLOSURE_DENIED' && reason(event) === 'CONTEXT_SCOPE_DENIED'),
    latest((event) => event.event_type === 'FEDERATION_ENVELOPE_REJECTED' && /HASH|SIGNATURE/iu.test(reason(event))),
    latest((event) => event.event_type === 'LIVE_RUNTIME_FAILED' && reason(event) === 'PROVIDER_EXIT_NONZERO')
  ].filter((event): event is AuthorityEventRecord => Boolean(event));
  const containment = [
    latest((event) => event.event_type === 'LIVE_RUNTIME_CANCELLED' && reason(event) === 'OPERATOR_CANCELLED:PHASE30_OPERATOR_CANCEL'),
    latest((event) => event.event_type === 'LIVE_RUNTIME_REVOKED' && reason(event) === 'PHASE30_AUTHORITY_REVOKED')
  ].filter((event): event is AuthorityEventRecord => Boolean(event));
  const restart = latest((event) => event.event_type === 'LIVE_RUNTIME_FAILED' && reason(event) === 'HOST_PROCESS_RESTARTED');
  return { attacks, containment, ...(restart ? { restart } : {}) };
}

function initialSteps(now: string, eventId: string): CeremonyStep[] {
  const titles: Record<CeremonyStepId, string> = {
    'session-created': 'Ceremony session created', 'prerequisites-assessed': 'Prerequisites assessed',
    'organization-authority': 'Organization authority', 'workload-identity': 'Workload identity',
    'shared-provider-task': 'Shared provider task', 'external-framework': 'External framework',
    'context-minimization': 'Context minimization', 'authority-escalation': 'Authority escalation',
    'runtime-containment': 'Runtime containment', 'adversarial-controls': 'Adversarial controls',
    'restart-recovery': 'Restart recovery', 'evidence-reconstruction': 'Evidence reconstruction'
  };
  return Object.entries(titles).map(([stepId, title]) => ({ step_id: stepId as CeremonyStepId, title, status: stepId === 'session-created' ? 'passed' : stepId === 'prerequisites-assessed' ? 'ready' : 'not-ready', blocker: stepId === 'session-created' ? null : stepId === 'prerequisites-assessed' ? null : 'Run prerequisite assessment to calculate readiness.', attempts: stepId === 'session-created' ? 1 : 0, idempotency_keys: [], evidence_refs: stepId === 'session-created' ? [eventId] : [], started_at: stepId === 'session-created' ? now : null, completed_at: stepId === 'session-created' ? now : null }));
}

function mergeProjectedSteps(current: CeremonyStep[], projected: ReturnType<typeof project>['steps'], completedStep: CeremonyStepId, idempotencyKey: string, startedEvent: string, completedEvent: string, startedAt: string, completedAt: string): CeremonyStep[] {
  return current.map((step) => {
    if (step.step_id === completedStep) return { ...step, status: 'passed', blocker: null, attempts: step.attempts + 1, idempotency_keys: [...step.idempotency_keys, idempotencyKey], evidence_refs: [...step.evidence_refs, startedEvent, completedEvent], started_at: startedAt, completed_at: completedAt };
    const next = projected.get(step.step_id);
    return next ? { ...step, ...next } : step;
  });
}

function supersede(session: CeremonySession, now: string): CeremonySession {
  return ceremonySessionSchema.parse({ ...session, status: 'superseded', steps: session.steps.map((step) => step.status === 'passed' ? step : { ...step, status: 'superseded', blocker: 'A newer ceremony session superseded this session.' }), participants: session.participants.map((participant) => ({ ...participant, status: 'superseded' })), updated_at: now });
}
