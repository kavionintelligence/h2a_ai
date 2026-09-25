import { createHash, randomUUID } from 'node:crypto';
import {
  agentActivitySchema,
  assignmentResponseSchema,
  collaborationMessageSchema,
  collaborationStateSchema,
  createAssignmentRequestSchema,
  recordAssignmentResponseRequestSchema,
  sendCollaborationMessageRequestSchema,
  updateAssignmentRequestSchema,
  type AgentActivity,
  type AgentRuntimeSummary,
  type AssignmentResponse,
  type AssignmentStatus,
  type CollaborationMessage,
  type CollaborationState,
  type CreateAssignmentRequest,
  type RecordAssignmentResponseRequest,
  type SendCollaborationMessageRequest,
  type UpdateAssignmentRequest,
  type WorkAssignmentSummary
} from '@h2a/contracts';
import type { EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, LocalJsonlRepository, type WorkplaceRepository } from '@h2a/storage';

const allowedTransitions: Record<AssignmentStatus, AssignmentStatus[]> = {
  queued: ['active', 'blocked'],
  active: ['approval', 'blocked', 'complete'],
  approval: ['active', 'blocked'],
  blocked: ['queued', 'active'],
  complete: ['active']
};

export class AgentCollaborationService {
  private readonly messages: LocalJsonlRepository<CollaborationMessage>;
  private readonly responses: LocalJsonlRepository<AssignmentResponse>;
  private readonly activity: LocalJsonlRepository<AgentActivity>;
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly workplace: WorkplaceRepository,
    private readonly clock: () => Date = () => new Date()
  ) {
    const store = new AtomicFileStore(dataPath);
    this.messages = new LocalJsonlRepository(store, 'workplace/messages.jsonl', collaborationMessageSchema);
    this.responses = new LocalJsonlRepository(store, 'workplace/responses.jsonl', assignmentResponseSchema);
    this.activity = new LocalJsonlRepository(store, 'workplace/activity.jsonl', agentActivitySchema);
  }

  public async initialize(): Promise<CollaborationState> {
    return this.getState();
  }

  public async getState(): Promise<CollaborationState> {
    const [workplace, messages, responses, activity] = await Promise.all([
      this.workplace.getSnapshot(),
      this.messages.list(),
      this.responses.list(),
      this.activity.list()
    ]);
    return collaborationStateSchema.parse({
      workplace,
      messages,
      responses,
      activity: [...activity].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    });
  }

  public createAssignment(request: CreateAssignmentRequest, mandateIdOverride?: string): Promise<CollaborationState> {
    return this.serialize(async () => {
      const input = createAssignmentRequestSchema.parse(request);
      const snapshot = await this.workplace.getSnapshot();
      const assignee = requireAgent(snapshot.agents, input.assigneeId);
      const now = this.clock().toISOString();
      const assignmentId = `wrk_${randomUUID()}`;
      const traceId = input.ceremony?.trace_id ?? `tr_${randomUUID()}`;
      const assignment: WorkAssignmentSummary = {
        id: assignmentId,
        title: input.title,
        objective: input.objective,
        status: 'queued',
        assigneeId: assignee.id,
        mandateId: mandateIdOverride ?? assignee.mandateId,
        risk: input.risk,
        priority: input.priority,
        dependsOn: input.dependsOn,
        requestedAction: input.requestedAction,
        traceId,
        createdAt: now,
        updatedAt: now,
        responseCount: 0,
        messageCount: 0
      };

      await this.workplace.replaceAssignments([...snapshot.assignments, assignment]);
      await this.activity.append({
        id: `act_${randomUUID()}`,
        agentId: assignee.id,
        assignmentId,
        kind: 'assignment',
        level: 'info',
        summary: 'Assignment queued',
        detail: input.objective,
        createdAt: now
      });
      const event = await this.evidence.append({
        trace_id: traceId,
        actor: { type: 'system', id: 'h2a_command_floor' },
        subject: { type: 'assignment', id: assignmentId },
        mandate_id: mandateIdOverride ?? assignee.mandateId,
        event_type: 'WORK_ASSIGNED',
        payload: {
          assignee_agent_id: assignee.id,
          title: assignment.title,
          priority: assignment.priority,
          risk: assignment.risk,
          mandate_state: (mandateIdOverride ?? assignee.mandateId) === 'mnd_unassigned' ? 'required' : 'reference-present',
          ceremony_id: input.ceremony?.ceremony_id,
          idempotency_key: input.ceremony?.idempotency_key
        }
      });
      await this.updateRecentEvents(snapshot.events, event.event_id, 'WORK_ASSIGNED', assignee.name, `${assignment.title} queued for ${assignee.name}.`, now);
      return this.getState();
    });
  }

  public updateAssignment(request: UpdateAssignmentRequest): Promise<CollaborationState> {
    return this.serialize(async () => {
      const input = updateAssignmentRequestSchema.parse(request);
      const snapshot = await this.workplace.getSnapshot();
      const index = snapshot.assignments.findIndex((item) => item.id === input.assignmentId);
      if (index < 0) throw new Error('Work assignment was not found.');

      const current = snapshot.assignments[index];
      const previousAssignee = requireAgent(snapshot.agents, current.assigneeId);
      const nextAssignee = input.assigneeId ? requireAgent(snapshot.agents, input.assigneeId) : previousAssignee;
      const isReassignment = nextAssignee.id !== previousAssignee.id;
      const nextStatus = input.status ?? current.status;
      if (input.status && input.status !== current.status && !allowedTransitions[current.status].includes(input.status)) {
        throw new Error(`Assignment cannot move from ${current.status} to ${input.status}.`);
      }

      const now = this.clock().toISOString();
      const traceId = current.traceId ?? `tr_${randomUUID()}`;
      const next: WorkAssignmentSummary = {
        ...current,
        assigneeId: nextAssignee.id,
        mandateId: isReassignment ? nextAssignee.mandateId : current.mandateId,
        status: nextStatus,
        traceId,
        updatedAt: now
      };
      const assignments = [...snapshot.assignments];
      assignments[index] = next;
      await this.workplace.replaceAssignments(assignments);

      const agents = updateAgentProjection(snapshot.agents, previousAssignee, nextAssignee, next);
      await this.workplace.replaceAgents(agents);
      const summary = input.assigneeId && input.assigneeId !== current.assigneeId
        ? `${current.title} reassigned to ${nextAssignee.name}.`
        : `${current.title} moved to ${nextStatus}.`;
      await this.activity.append({
        id: `act_${randomUUID()}`,
        agentId: nextAssignee.id,
        assignmentId: current.id,
        kind: input.assigneeId && input.assigneeId !== current.assigneeId ? 'assignment' : 'status',
        level: nextStatus === 'blocked' || nextStatus === 'approval' ? 'attention' : nextStatus === 'complete' ? 'success' : 'info',
        summary,
        createdAt: now
      });
      const event = await this.evidence.append({
        trace_id: traceId,
        actor: { type: 'system', id: 'h2a_command_floor' },
        subject: { type: 'assignment', id: current.id },
        mandate_id: next.mandateId,
        event_type: input.assigneeId && input.assigneeId !== current.assigneeId ? 'WORK_ASSIGNED' : 'WORK_STATUS_CHANGED',
        payload: {
          previous_status: current.status,
          status: nextStatus,
          previous_assignee_id: current.assigneeId,
          assignee_agent_id: nextAssignee.id
        }
      });
      await this.updateRecentEvents(snapshot.events, event.event_id, event.event_type, nextAssignee.name, summary, now);
      return this.getState();
    });
  }

  public rebindAssignmentAuthority(request: { assignmentId: string; agentId: string; mandateId: string }): Promise<CollaborationState> {
    return this.serialize(async () => {
      const snapshot = await this.workplace.getSnapshot();
      const assignmentIndex = snapshot.assignments.findIndex((item) => item.id === request.assignmentId);
      if (assignmentIndex < 0) throw new Error('Work assignment was not found.');
      const agentIndex = snapshot.agents.findIndex((item) => item.id === request.agentId);
      if (agentIndex < 0) throw new Error('Assigned agent was not found in the workplace.');
      const current = snapshot.assignments[assignmentIndex];
      if (current.assigneeId !== request.agentId) throw new Error('Authority can only be rebound for the current assignment owner.');

      const now = this.clock().toISOString();
      const assignments = [...snapshot.assignments];
      assignments[assignmentIndex] = { ...current, mandateId: request.mandateId, updatedAt: now };
      const agents = [...snapshot.agents];
      agents[agentIndex] = { ...agents[agentIndex], mandateId: request.mandateId };
      await this.workplace.replaceAgents(agents);
      await this.workplace.replaceAssignments(assignments);

      const event = await this.evidence.append({
        trace_id: current.traceId ?? `tr_${randomUUID()}`,
        actor: { type: 'system', id: 'h2a_authority_projection' },
        subject: { type: 'assignment', id: current.id },
        mandate_id: request.mandateId,
        event_type: 'WORK_AUTHORITY_REBOUND',
        payload: {
          assignee_agent_id: request.agentId,
          previous_mandate_id: current.mandateId,
          replacement_mandate_id: request.mandateId
        }
      });
      await this.updateRecentEvents(snapshot.events, event.event_id, event.event_type, agents[agentIndex].name, `${current.title} authority rebound to an active signed mandate.`, now);
      return this.getState();
    });
  }

  public recordResponse(request: RecordAssignmentResponseRequest): Promise<CollaborationState> {
    return this.serialize(async () => {
      const input = recordAssignmentResponseRequestSchema.parse(request);
      const snapshot = await this.workplace.getSnapshot();
      const index = snapshot.assignments.findIndex((item) => item.id === input.assignmentId);
      if (index < 0) throw new Error('Work assignment was not found.');
      const assignment = snapshot.assignments[index];
      const agent = requireAgent(snapshot.agents, input.agentId);
      if (assignment.assigneeId !== agent.id) throw new Error('Only the assigned agent can record this response.');

      const now = this.clock().toISOString();
      const traceId = assignment.traceId ?? `tr_${randomUUID()}`;
      await this.responses.append({
        id: `rsp_${randomUUID()}`,
        assignmentId: assignment.id,
        agentId: agent.id,
        body: input.body,
        traceId,
        createdAt: now
      });
      const assignments = [...snapshot.assignments];
      assignments[index] = {
        ...assignment,
        response: input.body,
        responseCount: assignment.responseCount + 1,
        traceId,
        updatedAt: now
      };
      await this.workplace.replaceAssignments(assignments);
      await this.activity.append({
        id: `act_${randomUUID()}`,
        agentId: agent.id,
        assignmentId: assignment.id,
        kind: 'response',
        level: 'success',
        summary: 'Response recorded',
        detail: input.body,
        createdAt: now
      });
      const event = await this.evidence.append({
        trace_id: traceId,
        actor: { type: 'agent', id: agent.id },
        subject: { type: 'assignment', id: assignment.id },
        mandate_id: assignment.mandateId,
        event_type: 'WORK_RESPONSE_RECORDED',
        payload: { response_hash: digest(input.body), response_length: input.body.length }
      });
      await this.updateRecentEvents(snapshot.events, event.event_id, 'WORK_RESPONSE_RECORDED', agent.name, `${agent.name} recorded a response for ${assignment.title}.`, now);
      return this.getState();
    });
  }

  public sendMessage(request: SendCollaborationMessageRequest): Promise<CollaborationState> {
    return this.serialize(async () => {
      const input = sendCollaborationMessageRequestSchema.parse(request);
      const snapshot = await this.workplace.getSnapshot();
      const index = snapshot.assignments.findIndex((item) => item.id === input.assignmentId);
      if (index < 0) throw new Error('Work assignment was not found.');
      const assignment = snapshot.assignments[index];
      const from = requireAgent(snapshot.agents, input.fromAgentId);
      const to = requireAgent(snapshot.agents, input.toAgentId);
      const now = this.clock().toISOString();
      const traceId = assignment.traceId ?? `tr_${randomUUID()}`;
      const messageId = `msg_${randomUUID()}`;
      await this.messages.append({
        id: messageId,
        assignmentId: assignment.id,
        fromAgentId: from.id,
        toAgentId: to.id,
        act: input.act,
        subject: input.subject,
        body: input.body,
        mandateId: assignment.mandateId,
        traceId,
        createdAt: now,
        deliveryStatus: 'delivered'
      });
      const assignments = [...snapshot.assignments];
      assignments[index] = {
        ...assignment,
        messageCount: assignment.messageCount + 1,
        traceId,
        updatedAt: now
      };
      await this.workplace.replaceAssignments(assignments);
      await Promise.all([
        this.activity.append({ id: `act_${randomUUID()}`, agentId: from.id, assignmentId: assignment.id, kind: 'message', level: 'info', summary: `${input.act} sent to ${to.name}`, detail: input.subject, createdAt: now }),
        this.activity.append({ id: `act_${randomUUID()}`, agentId: to.id, assignmentId: assignment.id, kind: 'message', level: 'info', summary: `${input.act} received from ${from.name}`, detail: input.subject, createdAt: now })
      ]);
      const event = await this.evidence.append({
        trace_id: traceId,
        actor: { type: 'agent', id: from.id },
        subject: { type: 'message', id: messageId },
        mandate_id: assignment.mandateId,
        event_type: 'WORK_MESSAGE_SENT',
        payload: {
          assignment_id: assignment.id,
          to_agent_id: to.id,
          act: input.act,
          subject: input.subject,
          body_hash: digest(input.body)
        }
      });
      await this.updateRecentEvents(snapshot.events, event.event_id, 'WORK_MESSAGE_SENT', from.name, `${from.name} sent ${input.act} to ${to.name}.`, now);
      return this.getState();
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async updateRecentEvents(
    current: CollaborationState['workplace']['events'],
    id: string,
    type: string,
    actor: string,
    summary: string,
    timestamp: string
  ): Promise<void> {
    await this.workplace.replaceRecentEvents([
      { id, type, actor, summary, time: timestamp, integrity: 'verified' as const },
      ...current
    ].slice(0, 20));
  }
}

function requireAgent(agents: AgentRuntimeSummary[], id: string): AgentRuntimeSummary {
  const agent = agents.find((item) => item.id === id);
  if (!agent) throw new Error('Assigned agent was not found in the workplace.');
  if (agent.status === 'offline') throw new Error('Offline agents cannot receive collaboration updates.');
  return agent;
}

function updateAgentProjection(
  agents: AgentRuntimeSummary[],
  previousAssignee: AgentRuntimeSummary,
  nextAssignee: AgentRuntimeSummary,
  assignment: WorkAssignmentSummary
): AgentRuntimeSummary[] {
  return agents.map((agent) => {
    if (agent.id === previousAssignee.id && previousAssignee.id !== nextAssignee.id) {
      return { ...agent, status: 'ready', currentAction: 'Available for assignment', progress: 0 };
    }
    if (agent.id !== nextAssignee.id) return agent;
    const status = assignment.status === 'active'
      ? 'working'
      : assignment.status === 'approval'
        ? 'approval-required'
        : assignment.status === 'blocked'
          ? 'blocked'
          : 'ready';
    const progress = assignment.status === 'complete' ? 100 : assignment.status === 'queued' ? 0 : Math.max(agent.progress, 25);
    return {
      ...agent,
      status,
      currentAction: assignment.status === 'complete' ? `Completed: ${assignment.title}` : assignment.title,
      progress
    };
  });
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}
