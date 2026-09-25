import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  demonstrationConductorCommandSchema,
  demonstrationConductorSchema,
  finalAcceptanceExportReceiptSchema,
  type AuthorityEventRecord,
  type CeremonyState,
  type DemonstrationConductor,
  type DemonstrationConductorCommand,
  type DemonstrationConductorStep,
  type FinalAcceptanceExportReceipt,
  type FinalAcceptanceState,
  type FinalAcceptanceVerificationReceipt
} from '@h2a/contracts';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';
import type { EvidenceLedgerPort } from './index';

interface AcceptancePort {
  getState(): Promise<FinalAcceptanceState>;
  exportPackage(): Promise<FinalAcceptanceExportReceipt>;
  verifyExportedPackage(input: { relative_path: string; operation_key: string }): Promise<FinalAcceptanceVerificationReceipt>;
}

interface CeremonyPort {
  getState(): Promise<CeremonyState>;
  createSession(input: { title: string; idempotency_key: string }): Promise<CeremonyState>;
}

export interface DemonstrationConductorPorts {
  acceptance: AcceptancePort;
  ceremony: CeremonyPort;
  requireLiveness(): Promise<void>;
}

const persistedSchema = z.object({
  active: demonstrationConductorSchema.nullable(),
  operation_keys: z.array(z.string().trim().min(1).max(240)).max(500),
  package_receipt: finalAcceptanceExportReceiptSchema.nullable()
}).strict();
type PersistedConductor = z.infer<typeof persistedSchema>;

interface StepFact {
  step_id: string;
  journey_id: string;
  title: string;
  passed: boolean;
  failed?: boolean;
  safe_automation: boolean;
  pause_kind: DemonstrationConductorStep['pause_kind'];
  reason_code: string;
  evidence_refs: string[];
}

export class DemonstrationConductorService {
  private readonly repository: VersionedJsonRepository<'h2a.demonstration-conductor', PersistedConductor>;
  private queue: Promise<unknown> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly ports: DemonstrationConductorPorts,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.repository = new VersionedJsonRepository(
      new AtomicFileStore(dataPath), 'acceptance/demonstration-conductor.json', 'h2a.demonstration-conductor', persistedSchema,
      { initialData: { active: null, operation_keys: [], package_receipt: null }, clock }
    );
  }

  public async initialize(): Promise<DemonstrationConductor | null> {
    const persisted = await this.repository.read();
    if (persisted.active?.status !== 'running') return persisted.active;
    const now = this.clock().toISOString();
    const interrupted = demonstrationConductorSchema.parse({ ...persisted.active, status: 'interrupted', updated_at: now });
    await this.repository.write({ ...persisted, active: interrupted });
    await this.record(interrupted, 'DEMONSTRATION_CONDUCTOR_INTERRUPTED', { reason_code: 'HOST_PROCESS_RESTARTED' });
    return interrupted;
  }

  public async getState(): Promise<DemonstrationConductor | null> {
    const persisted = await this.repository.read();
    if (!persisted.active || ['cancelled', 'completed'].includes(persisted.active.status)) return persisted.active;
    const next = await this.reconcile(persisted.active);
    if (JSON.stringify(next) !== JSON.stringify(persisted.active)) await this.repository.write({ ...persisted, active: next });
    return next;
  }

  public execute(input: DemonstrationConductorCommand): Promise<DemonstrationConductor> {
    const request = demonstrationConductorCommandSchema.parse(input);
    const operation = this.queue.then(() => this.executeUnlocked(request));
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async executeUnlocked(request: DemonstrationConductorCommand): Promise<DemonstrationConductor> {
    let persisted = await this.repository.read();
    if (persisted.operation_keys.includes(request.operation_key) && persisted.active) return persisted.active;
    if (request.action === 'start') {
      if (persisted.active && !['cancelled', 'completed'].includes(persisted.active.status)) return persisted.active;
      let ceremony = await this.ports.ceremony.getState();
      let active = ceremony.sessions.find((item) => item.ceremony_id === ceremony.active_ceremony_id && item.status === 'active');
      if (!active) {
        ceremony = await this.ports.ceremony.createSession({ title: 'HP CTO/CISO final demonstration', idempotency_key: `phase51_${request.operation_key}` });
        active = ceremony.sessions.find((item) => item.ceremony_id === ceremony.active_ceremony_id && item.status === 'active');
      }
      if (!active) throw new Error('DEMONSTRATION_ACTIVE_CEREMONY_REQUIRED');
      const now = this.clock().toISOString();
      const seed = demonstrationConductorSchema.parse({
        schema_version: 1, conductor_id: `conductor_${randomUUID()}`, ceremony_id: active.ceremony_id, trace_id: active.trace_id,
        status: 'ready', active_step_id: null, steps: this.blankSteps(), canonical_cursor: 0,
        created_at: now, updated_at: now, completed_at: null, trust_ceiling: 'connected-observed'
      });
      const started = await this.reconcile(seed);
      persisted = { active: started, operation_keys: [request.operation_key], package_receipt: null };
      await this.repository.write(persisted);
      await this.record(started, 'DEMONSTRATION_CONDUCTOR_STARTED', { operation_key: request.operation_key });
      return this.advanceSafe(started, persisted, request.operation_key);
    }
    if (!persisted.active || request.conductor_id !== persisted.active.conductor_id) throw new Error('DEMONSTRATION_CONDUCTOR_NOT_FOUND');
    if (request.expected_canonical_cursor !== persisted.active.canonical_cursor) throw new Error('DEMONSTRATION_CONDUCTOR_STALE');
    if (persisted.active.status === 'completed') return persisted.active;
    if (request.action === 'cancel') {
      const now = this.clock().toISOString();
      const cancelled = demonstrationConductorSchema.parse({
        ...persisted.active, status: 'cancelled', active_step_id: null, canonical_cursor: persisted.active.canonical_cursor + 1,
        steps: persisted.active.steps.map((step) => step.status === 'running' ? { ...step, status: 'cancelled' as const } : step), updated_at: now
      });
      await this.repository.write({ ...persisted, active: cancelled, operation_keys: appendKey(persisted.operation_keys, request.operation_key) });
      await this.record(cancelled, 'DEMONSTRATION_CONDUCTOR_CANCELLED', { operation_key: request.operation_key });
      return cancelled;
    }
    const current = await this.reconcile(persisted.active.status === 'interrupted' ? { ...persisted.active, status: 'ready' } : persisted.active);
    const activeStep = current.steps.find((step) => step.step_id === current.active_step_id);
    const attempted = activeStep ? {
      ...current,
      steps: current.steps.map((step) => step.step_id === activeStep.step_id ? { ...step, attempts: step.attempts + 1 } : step)
    } : current;
    persisted = { ...persisted, active: attempted, operation_keys: appendKey(persisted.operation_keys, request.operation_key) };
    await this.repository.write(persisted);
    await this.record(attempted, 'DEMONSTRATION_CONDUCTOR_RESUMED', { operation_key: request.operation_key, action: request.action, step_id: activeStep?.step_id ?? null });
    return this.advanceSafe(attempted, persisted, request.operation_key);
  }

  private async advanceSafe(state: DemonstrationConductor, persisted: PersistedConductor, operationKey: string): Promise<DemonstrationConductor> {
    let current = await this.reconcile(state);
    for (let safeTransitions = 0; safeTransitions < current.steps.length; safeTransitions += 1) {
      const step = current.steps.find((item) => item.step_id === current.active_step_id);
      if (!step?.safe_automation || step.status !== 'ready') break;
      if (step.step_id === 'required-liveness-policy') await this.ports.requireLiveness();
      else if (step.step_id === 'export-package') persisted = { ...persisted, package_receipt: await this.ports.acceptance.exportPackage() };
      else if (step.step_id === 'verify-package-tamper') {
        if (!persisted.package_receipt) throw new Error('DEMONSTRATION_PACKAGE_RECEIPT_REQUIRED');
        await this.ports.acceptance.verifyExportedPackage({ relative_path: persisted.package_receipt.relative_path, operation_key: `${operationKey}:verify` });
      }
      current = await this.reconcile(current);
    }
    const previousPassed = new Set(state.steps.filter((item) => item.status === 'passed').map((item) => item.step_id));
    for (const passed of current.steps.filter((item) => item.status === 'passed' && !previousPassed.has(item.step_id))) {
      const event = await this.record(current, 'DEMONSTRATION_CONDUCTOR_STEP_PASSED', { step_id: passed.step_id, source_evidence_refs: passed.evidence_refs });
      passed.evidence_refs = [...new Set([...passed.evidence_refs, event.event_id])];
    }
    current = demonstrationConductorSchema.parse({ ...current, canonical_cursor: state.canonical_cursor + 1, updated_at: this.clock().toISOString() });
    await this.repository.write({ ...persisted, active: current });
    if (current.status === 'paused') await this.record(current, 'DEMONSTRATION_CONDUCTOR_PAUSED', { step_id: current.active_step_id, reason_code: current.steps.find((item) => item.step_id === current.active_step_id)?.reason_code });
    if (current.status === 'completed') await this.record(current, 'DEMONSTRATION_CONDUCTOR_COMPLETED', { evidence_refs: current.steps.flatMap((item) => item.evidence_refs) });
    return current;
  }

  private async reconcile(previous: DemonstrationConductor): Promise<DemonstrationConductor> {
    const [acceptance, events] = await Promise.all([this.ports.acceptance.getState(), this.evidence.list()]);
    const facts = this.facts(acceptance, events, previous.trace_id);
    const prior = new Map(previous.steps.map((step) => [step.step_id, step]));
    let blocked = false;
    const steps = facts.map((fact, index): DemonstrationConductorStep => {
      const dependenciesPassed = index === 0 || facts.slice(0, index).every((item) => item.passed);
      const status = fact.passed ? 'passed' : !dependenciesPassed ? 'not-started' : fact.failed ? 'failed' : fact.safe_automation ? 'ready' : 'paused';
      if (status === 'failed') blocked = true;
      return {
        step_id: fact.step_id, journey_id: fact.journey_id, title: fact.title, status,
        dependency_ids: index === 0 ? [] : [facts[index - 1]!.step_id], safe_automation: fact.safe_automation,
        pause_kind: fact.safe_automation ? null : fact.pause_kind, reason_code: fact.passed ? 'PERSISTED_EVIDENCE_ACCEPTED' : fact.reason_code,
        evidence_refs: fact.evidence_refs, attempts: prior.get(fact.step_id)?.attempts ?? 0
      };
    });
    const active = steps.find((step) => !['passed', 'not-started'].includes(step.status));
    const completed = steps.every((step) => step.status === 'passed');
    const derivedStatus = completed ? 'completed' : blocked ? 'blocked' : active?.status === 'paused' ? 'paused' : 'running';
    const status = previous.status === 'interrupted' ? 'interrupted' : derivedStatus;
    const completedAt = completed ? previous.completed_at ?? this.clock().toISOString() : null;
    const changed = previous.status !== status || previous.active_step_id !== (active?.step_id ?? null) || previous.completed_at !== completedAt || JSON.stringify(previous.steps) !== JSON.stringify(steps);
    return demonstrationConductorSchema.parse({
      ...previous, status, active_step_id: active?.step_id ?? null, steps,
      updated_at: changed ? this.clock().toISOString() : previous.updated_at, completed_at: completedAt
    });
  }

  private facts(acceptance: FinalAcceptanceState, events: AuthorityEventRecord[], traceId: string): StepFact[] {
    const gate = (id: string) => acceptance.gates.find((item) => item.gate_id === id)!;
    const traceEvents = events.filter((event) => event.trace_id === traceId || event.trace_id.startsWith(acceptance.manifest.trace_prefix));
    const eventRefs = (type: AuthorityEventRecord['event_type'], predicate: (event: AuthorityEventRecord) => boolean = () => true) => traceEvents.filter((event) => event.event_type === type && predicate(event)).map((event) => event.event_id);
    const gateFact = (id: string, journey: string, pause: StepFact['pause_kind']): StepFact => {
      const value = gate(id);
      return { step_id: id, journey_id: journey, title: value.title, passed: value.status === 'passed' && value.evidence_refs.length > 0, failed: value.status === 'failed', safe_automation: false, pause_kind: pause, reason_code: `${id.replaceAll('-', '_').toUpperCase()}_REQUIRED`, evidence_refs: value.evidence_refs };
    };
    const activation = [...eventRefs('FEDERATION_PAIRING_ACTIVATED'), ...eventRefs('FEDERATION_PEER_ACTIVATED')];
    const task = eventRefs('FEDERATION_ENVELOPE_ACCEPTED', (event) => ['task-sent', 'task-received', 'task-acknowledged'].includes(payload(event, 'operation')));
    const ack = eventRefs('FEDERATION_ENVELOPE_ACCEPTED', (event) => payload(event, 'operation').includes('ack'));
    const heartbeat = eventRefs('FEDERATION_HEARTBEAT_RECORDED');
    const replay = eventRefs('FEDERATION_ENVELOPE_REJECTED', (event) => /REPLAY/u.test(payload(event, 'reason_code')));
    const inactive = eventRefs('FEDERATION_ENVELOPE_REJECTED', (event) => payload(event, 'reason_code') === 'FEDERATION_PEER_INACTIVE');
    const revoked = eventRefs('FEDERATION_PEER_REVOKED');
    const federationRefs = [...activation, ...task, ...ack, ...heartbeat, ...replay, ...inactive, ...revoked];
    const exportRefs = eventRefs('FINAL_ACCEPTANCE_PACKAGE_EXPORTED');
    const verifyRefs = eventRefs('FINAL_ACCEPTANCE_PACKAGE_VERIFIED');
    const tamperRefs = eventRefs('FINAL_ACCEPTANCE_PACKAGE_TAMPER_REJECTED');
    const livenessIds = new Set(acceptance.phase44_readiness.liveness_verified_human_ids);
    const livenessRefs = events.filter((event) => event.event_type === 'HUMAN_VERIFIED_V2' && payload(event, 'liveness_mode') === 'required' && livenessIds.has(payload(event, 'human_id') || (event.actor.type === 'human' ? event.actor.id : ''))).map((event) => event.event_id);
    return [
      { step_id: 'clean-session', journey_id: 'prepare-hp-demonstration', title: 'Use a clean final root', passed: acceptance.phase44_readiness.clean_session, safe_automation: false, pause_kind: 'external-machine', reason_code: 'CLEAN_PHASE44_SESSION_REQUIRED', evidence_refs: acceptance.phase44_readiness.clean_session ? [acceptance.manifest.session_id] : [] },
      { step_id: 'required-liveness-policy', journey_id: 'prepare-hp-demonstration', title: 'Lock required liveness', passed: acceptance.phase44_readiness.required_liveness_mode, safe_automation: true, pause_kind: null, reason_code: 'REQUIRED_LIVENESS_DISABLED', evidence_refs: acceptance.phase44_readiness.required_liveness_mode ? [acceptance.manifest.session_id] : [] },
      { ...gateFact('two-human-ceremony', 'set-up-people', 'physical-person'), step_id: 'two-human-liveness', evidence_refs: livenessRefs },
      gateFact('organization-authority', 'set-up-people', 'human-proof'),
      gateFact('workload-identity', 'connect-agents', 'human-proof'),
      gateFact('shared-provider-task', 'run-governed-task', 'provider-consent'),
      gateFact('external-framework', 'run-governed-task', 'provider-consent'),
      gateFact('context-minimization', 'run-governed-task', 'human-proof'),
      gateFact('authority-escalation', 'approve-protected-action', 'independent-approval'),
      { step_id: 'approval-withdrawal', journey_id: 'approve-protected-action', title: 'Prove approval withdrawal', passed: Boolean(acceptance.phase44_readiness.approval_withdrawal_evidence_ref), safe_automation: false, pause_kind: 'independent-approval', reason_code: 'APPROVAL_WITHDRAWAL_EVIDENCE_REQUIRED', evidence_refs: acceptance.phase44_readiness.approval_withdrawal_evidence_ref ? [acceptance.phase44_readiness.approval_withdrawal_evidence_ref] : [] },
      { step_id: 'federation-collaboration', journey_id: 'connect-friend-node', title: 'Complete friend-node collaboration', passed: activation.length > 0 && task.length > 0 && ack.length > 0 && heartbeat.length > 0 && replay.length > 0 && inactive.length > 0 && revoked.length > 0, safe_automation: false, pause_kind: 'mutual-trust', reason_code: 'FEDERATION_TWO_NODE_ACCEPTANCE_REQUIRED', evidence_refs: federationRefs },
      { step_id: 'project-integration', journey_id: 'run-governed-task', title: 'Integrate governed project output', passed: Boolean(acceptance.phase44_readiness.project_integration_evidence_ref), safe_automation: false, pause_kind: 'independent-approval', reason_code: 'PROJECT_INTEGRATION_EVIDENCE_REQUIRED', evidence_refs: acceptance.phase44_readiness.project_integration_evidence_ref ? [acceptance.phase44_readiness.project_integration_evidence_ref] : [] },
      gateFact('runtime-containment', 'prepare-hp-demonstration', 'security-denial'),
      gateFact('adversarial-controls', 'prepare-hp-demonstration', 'security-denial'),
      gateFact('restart-recovery', 'prepare-hp-demonstration', 'external-machine'),
      gateFact('evidence-reconstruction', 'prepare-hp-demonstration', 'missing-dependency'),
      { step_id: 'export-package', journey_id: 'prepare-hp-demonstration', title: 'Export signed minimized package', passed: exportRefs.length > 0, safe_automation: true, pause_kind: null, reason_code: acceptance.phase44_readiness.package_eligible ? 'PACKAGE_EXPORT_READY' : 'FINAL_ACCEPTANCE_REQUIRED', evidence_refs: exportRefs },
      { step_id: 'verify-package-tamper', journey_id: 'prepare-hp-demonstration', title: 'Verify package and reject tampering', passed: verifyRefs.length > 0 && tamperRefs.length > 0, safe_automation: true, pause_kind: null, reason_code: 'PACKAGE_INDEPENDENT_VERIFICATION_REQUIRED', evidence_refs: [...verifyRefs, ...tamperRefs] }
    ];
  }

  private blankSteps(): DemonstrationConductorStep[] {
    return [{ step_id: 'clean-session', journey_id: 'prepare-hp-demonstration', title: 'Use a clean final root', status: 'ready', dependency_ids: [], safe_automation: false, pause_kind: 'external-machine', reason_code: 'ASSESSING_CANONICAL_STATE', evidence_refs: [], attempts: 0 }];
  }

  private record(conductor: DemonstrationConductor, eventType: AuthorityEventRecord['event_type'], details: Record<string, unknown>): Promise<AuthorityEventRecord> {
    return this.evidence.append({
      trace_id: conductor.trace_id, actor: { type: 'system', id: 'h2a-demonstration-conductor' },
      subject: { type: 'ceremony', id: conductor.ceremony_id }, event_type: eventType,
      payload: { conductor_id: conductor.conductor_id, canonical_cursor: conductor.canonical_cursor, ...details }
    });
  }
}

function payload(event: AuthorityEventRecord, key: string): string {
  const value = event.payload[key];
  return typeof value === 'string' ? value : '';
}

function appendKey(values: string[], value: string): string[] {
  return [...new Set([...values, value])].slice(-500);
}
