import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  resumeScenarioRequestSchema,
  scenarioRunSchema,
  scenarioStateSchema,
  startScenarioRequestSchema,
  type AgentRuntimeSummary,
  type AuthorizeActionRequest,
  type Mandate,
  type MandateState,
  type ResumeScenarioRequest,
  type ScenarioDefinition,
  type ScenarioOutcome,
  type ScenarioRun,
  type ScenarioState,
  type ScenarioStep,
  type StartScenarioRequest,
  type WorkAssignmentSummary
} from '@h2a/contracts';
import type { EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository, type WorkplaceRepository } from '@h2a/storage';
import { SandboxResourceAdapter, type ResourceAdapterPort } from '@h2a/resources';
import type { AgentCollaborationService } from './collaborationService';
import {
  DisabledBedrockRuntime,
  DisabledLiveCliRuntime,
  ScriptedWorkplaceRuntime,
  type AgentRuntimePort
} from './runtimeAdapters';

interface MandateRuntimePort {
  getState(): Promise<MandateState>;
  authorize(request: AuthorizeActionRequest): Promise<MandateState>;
}

export const scenarioCatalogue: ScenarioDefinition[] = [{
  scenarioId: 'governed-enterprise-review',
  name: 'Governed enterprise review',
  description: 'Coordinator and delegated specialists route a bounded review through policy, disclosure, execution, responses, and evidence.',
  minimumAgents: 2,
  supportedOutcomes: ['normal', 'denied', 'approval', 'failure', 'timeout', 'revocation']
}];

export class ScriptedScenarioService {
  private readonly runs: VersionedJsonRepository<'h2a.scenarios.runs', ScenarioRun[]>;
  private readonly adapters: AgentRuntimePort[];
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly workplace: WorkplaceRepository,
    private readonly collaboration: AgentCollaborationService,
    private readonly mandates: MandateRuntimePort,
    private readonly resource: ResourceAdapterPort = new SandboxResourceAdapter(),
    runtime: AgentRuntimePort = new ScriptedWorkplaceRuntime(),
    private readonly clock: () => Date = () => new Date()
  ) {
    this.runs = new VersionedJsonRepository(new AtomicFileStore(dataPath), 'scenarios/runs.json', 'h2a.scenarios.runs', z.array(scenarioRunSchema), { initialData: [], clock });
    this.adapters = [runtime, new DisabledLiveCliRuntime(), new DisabledBedrockRuntime()];
  }

  public async initialize(): Promise<ScenarioState> {
    await this.runs.read();
    return this.getStateUnlocked();
  }

  public getState(): Promise<ScenarioState> { return this.serialize(() => this.getStateUnlocked()); }

  public start(request: StartScenarioRequest): Promise<ScenarioState> {
    return this.serialize(async () => {
      const input = startScenarioRequestSchema.parse(request);
      const definition = scenarioCatalogue.find((item) => item.scenarioId === input.scenarioId);
      if (!definition || !definition.supportedOutcomes.includes(input.outcome)) throw new Error('Scenario definition or outcome is not supported.');
      const mandateState = await this.mandates.getState();
      const root = mandateState.mandates.find((item) => item.mandateId === input.rootMandateId);
      if (!root || root.parentMandateId) throw new Error('A root mandate is required to start the governed scenario.');
      if (input.outcome === 'revocation' && root.status !== 'revoked') throw new Error('The revocation outcome requires a revoked root mandate.');
      if (input.outcome !== 'revocation' && root.status !== 'active') throw new Error('The selected root mandate is not active.');

      const chain = authorityChain(root, mandateState.mandates);
      if (chain.length < definition.minimumAgents) throw new Error('The primary scenario requires a root mandate and at least one delegated child mandate.');
      const snapshot = await this.workplace.getSnapshot();
      const agents = chain.map((mandate) => requireBoundAgent(snapshot.agents, mandate));
      const coordinator = agents[0];
      const runId = `run_${randomUUID()}`;
      const traceId = `tr_scenario_${runId}`;
      const specialistAssignments: WorkAssignmentSummary[] = [];

      for (let index = 1; index < chain.length; index += 1) {
        const before = await this.collaboration.getState();
        const next = await this.collaboration.createAssignment({
          title: `${agents[index].role} delegated review`,
          objective: `Evaluate ${chain[index].resources[0]} for ${root.objective} and return a bounded specialist result.`,
          assigneeId: agents[index].id,
          risk: input.outcome === 'approval' ? 'sensitive' : 'standard',
          priority: index + 1,
          dependsOn: [],
          requestedAction: chooseAction(chain[index], input.outcome === 'approval')
        });
        specialistAssignments.push(findCreated(before.workplace.assignments, next.workplace.assignments));
      }

      const beforeCoordinator = await this.collaboration.getState();
      const coordinatorState = await this.collaboration.createAssignment({
        title: 'Consolidate governed enterprise review',
        objective: root.objective,
        assigneeId: coordinator.id,
        risk: input.outcome === 'approval' ? 'sensitive' : 'standard',
        priority: 1,
        dependsOn: specialistAssignments.map((item) => item.id),
        requestedAction: chooseAction(root, input.outcome === 'approval')
      });
      const coordinatorAssignment = findCreated(beforeCoordinator.workplace.assignments, coordinatorState.workplace.assignments);
      const orderedMandates = [...chain.slice(1), root];
      const orderedAgents = [...agents.slice(1), coordinator];
      const orderedAssignments = [...specialistAssignments, coordinatorAssignment];
      const outcomeTarget = selectOutcomeTarget(input.outcome, orderedMandates);
      const steps = orderedMandates.map((mandate, index) => buildStep(mandate, orderedAgents[index], orderedAssignments[index], index, input.outcome, outcomeTarget));
      let run = scenarioRunSchema.parse({ runId, scenarioId: input.scenarioId, rootMandateId: root.mandateId, requestedOutcome: input.outcome, status: 'running', traceId, coordinatorRuntimeId: coordinator.id, steps, currentStepIndex: 0, createdAt: this.clock().toISOString(), updatedAt: this.clock().toISOString() });
      await this.runs.write([...(await this.runs.read()), run]);
      await this.evidence.append({ trace_id: traceId, actor: { type: 'system', id: 'h2a-scenario' }, subject: { type: 'assignment', id: coordinatorAssignment.id }, mandate_id: root.mandateId, event_type: 'SCENARIO_STARTED', payload: { scenario_id: input.scenarioId, run_id: runId, requested_outcome: input.outcome, assignment_ids: orderedAssignments.map((item) => item.id), mandate_ids: orderedMandates.map((item) => item.mandateId) } });
      run = await this.continueRun(run);
      await this.replaceRun(run);
      return this.getStateUnlocked();
    });
  }

  public resume(request: ResumeScenarioRequest): Promise<ScenarioState> {
    return this.serialize(async () => {
      const input = resumeScenarioRequestSchema.parse(request);
      const run = (await this.runs.read()).find((item) => item.runId === input.runId);
      if (!run || run.status !== 'approval-required') throw new Error('A paused approval-required scenario run was not found.');
      const step = run.steps[run.currentStepIndex];
      const approval = (await this.mandates.getState()).approvals.find((item) => item.approvalRequestId === step.approvalRequestId);
      if (!approval || approval.status === 'pending') throw new Error('The Human Approval is still pending.');
      if (approval.status !== 'approved') {
        await this.blockAssignment(step.assignmentId);
        const denied = updateRun(run, run.currentStepIndex, { status: 'denied', reasonCode: 'APPROVAL_REJECTED', completedAt: this.clock().toISOString() }, 'denied', this.clock);
        await this.replaceRun(denied);
        return this.getStateUnlocked();
      }
      const resumed = scenarioRunSchema.parse({ ...run, status: 'running', updatedAt: this.clock().toISOString() });
      const completed = await this.continueRun(resumed, true);
      await this.replaceRun(completed);
      return this.getStateUnlocked();
    });
  }

  private async continueRun(initial: ScenarioRun, approvalGranted = false): Promise<ScenarioRun> {
    let run = initial;
    for (let index = run.currentStepIndex; index < run.steps.length; index += 1) {
      let step = run.steps[index];
      const mandate = (await this.mandates.getState()).mandates.find((item) => item.mandateId === step.mandateId);
      if (!mandate) throw new Error('Scenario authority disappeared during execution.');
      const snapshot = await this.workplace.getSnapshot();
      const agent = snapshot.agents.find((item) => item.id === step.runtimeAgentId);
      const assignment = snapshot.assignments.find((item) => item.id === step.assignmentId);
      if (!agent || !assignment) throw new Error('Scenario runtime state is incomplete.');

      if (!approvalGranted || step.status !== 'approval-required') {
        run = updateRun(run, index, { status: 'authorizing', startedAt: this.clock().toISOString() }, 'running', this.clock);
        await this.replaceRun(run);
        const policyState = await this.mandates.authorize(toAuthorization(step, mandate));
        const decision = policyState.decisions[0];
        step = { ...run.steps[index], decisionTraceId: decision.traceId, reasonCode: decision.reasonCode, approvalRequestId: decision.approvalRequestId };
        if (decision.decision === 'DENY') {
          await this.blockAssignment(step.assignmentId);
          const terminal = decision.reasonCode === 'MANDATE_REVOKED' ? 'revoked' as const : 'denied' as const;
          return updateRun(run, index, { ...step, status: terminal, completedAt: this.clock().toISOString() }, terminal, this.clock, true);
        }
        if (decision.decision === 'REQUIRES_HUMAN_APPROVAL') {
          await this.moveToApproval(step.assignmentId);
          return updateRun(run, index, { ...step, status: 'approval-required' }, 'approval-required', this.clock);
        }
      }
      approvalGranted = false;

      await this.activateAssignment(step.assignmentId);
      const context = await this.resource.execute({ resourceId: step.resource, action: step.action, fields: step.requestedFields, traceId: step.decisionTraceId ?? run.traceId });
      if (context.status !== 'complete') {
        await this.blockAssignment(step.assignmentId);
        return updateRun(run, index, { ...step, status: 'failed', reasonCode: 'PARAMETER_NOT_ALLOWED', completedAt: this.clock().toISOString() }, 'failed', this.clock, true);
      }
      await this.evidence.append({ trace_id: step.decisionTraceId ?? run.traceId, actor: { type: 'system', id: 'h2a-resource' }, subject: { type: 'resource', id: step.resource }, mandate_id: step.mandateId, event_type: 'CONTEXT_DISCLOSED', payload: { disclosed_fields: context.disclosedFields, assignment_id: step.assignmentId } });
      if (agent.id !== run.coordinatorRuntimeId) {
        await this.collaboration.sendMessage({ assignmentId: step.assignmentId, fromAgentId: run.coordinatorRuntimeId, toAgentId: agent.id, act: 'request', subject: 'Governed scenario dispatch', body: `Execute ${step.action} on ${step.resource} under mandate ${step.mandateId}.` });
      }
      run = updateRun(run, index, { ...step, status: 'executing' }, 'running', this.clock);
      await this.replaceRun(run);
      const executionId = `exec_${randomUUID()}`;
      await this.evidence.append({ trace_id: step.decisionTraceId ?? run.traceId, actor: { type: 'agent', id: agent.id }, subject: { type: 'assignment', id: step.assignmentId }, mandate_id: step.mandateId, event_type: 'RUNTIME_EXECUTION_STARTED', payload: { execution_id: executionId, adapter_mode: 'scripted-workplace', provider_lane: agent.provider, model_lane: agent.model } });
      const profile = profileFor(run.requestedOutcome, index, 0);
      const result = await this.adapters[0].execute({ executionId, scenarioRunId: run.runId, stepId: step.stepId, traceId: step.decisionTraceId ?? run.traceId, agent: { runtimeId: agent.id, passportId: agent.passportId, name: agent.name, role: agent.role, provider: agent.provider, model: agent.model }, assignment, mandateId: step.mandateId, action: step.action, resource: step.resource, disclosedContext: context.data ?? {}, profile });
      if (result.status !== 'complete') {
        await this.blockAssignment(step.assignmentId);
        const runStatus = result.status === 'failed' ? 'failed' as const : 'timed-out' as const;
        await this.evidence.append({ trace_id: step.decisionTraceId ?? run.traceId, actor: { type: 'agent', id: agent.id }, subject: { type: 'assignment', id: step.assignmentId }, mandate_id: step.mandateId, event_type: result.status === 'failed' ? 'RUNTIME_EXECUTION_FAILED' : 'RUNTIME_EXECUTION_TIMED_OUT', payload: { execution_id: executionId, result_code: result.resultCode, virtual_duration_ms: result.virtualDurationMs } });
        return updateRun(run, index, { ...step, status: runStatus, output: result.output, completedAt: result.completedAt }, runStatus, this.clock, true);
      }
      await this.collaboration.recordResponse({ assignmentId: step.assignmentId, agentId: agent.id, body: result.output });
      await this.completeAssignment(step.assignmentId);
      await this.evidence.append({ trace_id: step.decisionTraceId ?? run.traceId, actor: { type: 'agent', id: agent.id }, subject: { type: 'assignment', id: step.assignmentId }, mandate_id: step.mandateId, event_type: 'ACTION_EXECUTED', payload: { execution_id: executionId, result_code: result.resultCode, virtual_duration_ms: result.virtualDurationMs, output_length: result.output.length } });
      run = updateRun(run, index, { ...step, status: 'complete', output: result.output, completedAt: result.completedAt }, 'running', this.clock);
      await this.replaceRun(run);
    }
    const complete = scenarioRunSchema.parse({ ...run, status: 'succeeded', currentStepIndex: run.steps.length, updatedAt: this.clock().toISOString(), completedAt: this.clock().toISOString() });
    await this.evidence.append({ trace_id: run.traceId, actor: { type: 'system', id: 'h2a-scenario' }, subject: { type: 'assignment', id: run.steps.at(-1)!.assignmentId }, mandate_id: run.rootMandateId, event_type: 'WORKFLOW_COMPLETED', payload: { scenario_id: run.scenarioId, run_id: run.runId, status: complete.status, step_count: run.steps.length } });
    return complete;
  }

  private async moveToApproval(assignmentId: string): Promise<void> {
    const assignment = (await this.collaboration.getState()).workplace.assignments.find((item) => item.id === assignmentId);
    if (assignment?.status === 'queued') await this.collaboration.updateAssignment({ assignmentId, status: 'active' });
    await this.collaboration.updateAssignment({ assignmentId, status: 'approval' });
  }
  private async activateAssignment(assignmentId: string): Promise<void> {
    const assignment = (await this.collaboration.getState()).workplace.assignments.find((item) => item.id === assignmentId);
    if (assignment?.status === 'approval') await this.collaboration.updateAssignment({ assignmentId, status: 'active' });
    else if (assignment?.status === 'queued' || assignment?.status === 'blocked') await this.collaboration.updateAssignment({ assignmentId, status: 'active' });
  }
  private async completeAssignment(assignmentId: string): Promise<void> { await this.collaboration.updateAssignment({ assignmentId, status: 'complete' }); }
  private async blockAssignment(assignmentId: string): Promise<void> {
    const assignment = (await this.collaboration.getState()).workplace.assignments.find((item) => item.id === assignmentId);
    if (assignment && assignment.status !== 'blocked') await this.collaboration.updateAssignment({ assignmentId, status: 'blocked' });
  }

  private async replaceRun(run: ScenarioRun): Promise<void> {
    const runs = await this.runs.read();
    await this.runs.write(runs.map((item) => item.runId === run.runId ? scenarioRunSchema.parse(run) : item));
  }

  private async getStateUnlocked(): Promise<ScenarioState> {
    return scenarioStateSchema.parse({ definitions: scenarioCatalogue, runs: (await this.runs.read()).slice().reverse(), adapters: this.adapters.map((adapter) => adapter.descriptor) });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function authorityChain(root: Mandate, all: Mandate[]): Mandate[] {
  const ids = new Set([root.mandateId]);
  let changed = true;
  while (changed) { changed = false; for (const mandate of all) if (mandate.parentMandateId && ids.has(mandate.parentMandateId) && !ids.has(mandate.mandateId)) { ids.add(mandate.mandateId); changed = true; } }
  return all.filter((mandate) => ids.has(mandate.mandateId)).sort((left, right) => left.depth - right.depth || left.issuedAt.localeCompare(right.issuedAt));
}

function requireBoundAgent(agents: AgentRuntimeSummary[], mandate: Mandate): AgentRuntimeSummary {
  const agent = agents.find((item) => item.passportId === mandate.subject.passportId && item.mandateId === mandate.mandateId);
  if (!agent) throw new Error(`Mandate ${mandate.mandateId} is not projected to an Agent Runtime Binding.`);
  if (agent.status === 'offline') throw new Error(`Agent ${agent.name} is offline.`);
  return agent;
}

function findCreated(before: WorkAssignmentSummary[], after: WorkAssignmentSummary[]): WorkAssignmentSummary {
  const existing = new Set(before.map((item) => item.id));
  const created = after.find((item) => !existing.has(item.id));
  if (!created) throw new Error('Scenario assignment was not persisted.');
  return created;
}

function chooseAction(mandate: Mandate, allowApproval: boolean): string {
  if (allowApproval && mandate.approvals.requiredActions[0]) return mandate.approvals.requiredActions[0];
  const action = mandate.actions.find((item) => !mandate.approvals.requiredActions.includes(item));
  if (!action) throw new Error(`Mandate ${mandate.mandateId} has no action that can execute without Human Approval.`);
  return action;
}

function selectOutcomeTarget(outcome: ScenarioOutcome, mandates: Mandate[]): number {
  if (outcome === 'approval') {
    const index = mandates.findIndex((mandate) => mandate.approvals.requiredActions.length > 0);
    if (index < 0) throw new Error('The approval outcome requires at least one mandate with a Human Approval action.');
    return index;
  }
  return 0;
}

function buildStep(mandate: Mandate, agent: AgentRuntimeSummary, assignment: WorkAssignmentSummary, index: number, outcome: ScenarioOutcome, outcomeTarget: number): ScenarioStep {
  const action = outcome === 'denied' && index === outcomeTarget ? 'h2a.scope.escape' : outcome === 'approval' && index === outcomeTarget ? mandate.approvals.requiredActions[0] : chooseAction(mandate, false);
  return {
    stepId: `step_${randomUUID()}`, sequence: index + 1, assignmentId: assignment.id, runtimeAgentId: agent.id,
    mandateId: mandate.mandateId, action, resource: mandate.resources[0], requestedFields: mandate.disclosure.allowedFields.slice(0, 2),
    parameters: { ...mandate.limits.parameterEquals, amount: Math.min(mandate.limits.maxAmount ?? 1, 1), records: 1, durationMinutes: 1 }, status: 'queued'
  };
}

function toAuthorization(step: ScenarioStep, mandate: Mandate): AuthorizeActionRequest {
  return { agentId: mandate.subject.agentId, mandateId: mandate.mandateId, resource: step.resource, action: step.action, parameters: step.parameters, requestedFields: step.requestedFields, idempotencyKey: `${step.stepId}-authorize`, assignmentId: step.assignmentId };
}

function profileFor(outcome: ScenarioOutcome, index: number, target: number): 'success' | 'failure' | 'timeout' {
  if (index !== target) return 'success';
  return outcome === 'failure' ? 'failure' : outcome === 'timeout' ? 'timeout' : 'success';
}

function updateRun(run: ScenarioRun, index: number, step: Partial<ScenarioStep>, status: ScenarioRun['status'], clock: () => Date, terminal = false): ScenarioRun {
  const steps = run.steps.map((item, stepIndex) => stepIndex === index ? { ...item, ...step } : item);
  return scenarioRunSchema.parse({ ...run, steps, status, currentStepIndex: terminal ? index : status === 'running' && steps[index].status === 'complete' ? index + 1 : index, updatedAt: clock().toISOString(), ...(terminal ? { completedAt: clock().toISOString() } : {}) });
}
