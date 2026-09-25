import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  agentPassportSchema, approvalRequestSchema, authorizationResultSchema,
  authorizeActionRequestSchema, createMandateRequestSchema, delegateMandateRequestSchema,
  delegationEdgeSchema, mandateLifecycleRequestSchema, mandateSchema, mandateStateSchema,
  resolveApprovalRequestSchema,
  type AgentPassport, type ApprovalRequest, type AuthorizationResult,
  type AuthorizeActionRequest, type CreateMandateRequest, type DelegateMandateRequest,
  type DelegationEdge, type Mandate, type MandateLifecycleRequest, type MandateState,
  type HumanAuthorityContext, type PolicyReasonCode, type ResolveApprovalRequest
} from '@h2a/contracts';
import type { EvidenceLedgerPort } from '@h2a/evidence';
import { AuthoritySignatureService, type HumanProofStatePort } from '@h2a/identity';
import { AtomicFileStore, LocalJsonlRepository, VersionedJsonRepository, type WorkplaceRepository } from '@h2a/storage';

export interface ProtectedHumanAuthorityPort {
  authorizeProtectedOperation(context: HumanAuthorityContext | undefined, resource: string, action: string, requiredApprovalPower?: string): Promise<{ humanId: string; humanProofId: string }>;
}

export class MandateService {
  private readonly mandates: VersionedJsonRepository<'h2a.mandates.registry', Mandate[]>;
  private readonly delegations: VersionedJsonRepository<'h2a.mandates.delegations', DelegationEdge[]>;
  private readonly approvals: VersionedJsonRepository<'h2a.mandates.approvals', ApprovalRequest[]>;
  private readonly passports: VersionedJsonRepository<'h2a.agents.passports', AgentPassport[]>;
  private readonly decisions: LocalJsonlRepository<AuthorizationResult>;
  private readonly signatures: AuthoritySignatureService;
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly humanProof: HumanProofStatePort,
    private readonly workplace: WorkplaceRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly protectedHumanAuthority?: ProtectedHumanAuthorityPort
  ) {
    const store = new AtomicFileStore(dataPath);
    const options = { initialData: [], clock };
    this.mandates = new VersionedJsonRepository(store, 'mandates/registry.json', 'h2a.mandates.registry', z.array(mandateSchema), options);
    this.delegations = new VersionedJsonRepository(store, 'mandates/delegations.json', 'h2a.mandates.delegations', z.array(delegationEdgeSchema), options);
    this.approvals = new VersionedJsonRepository(store, 'mandates/approvals.json', 'h2a.mandates.approvals', z.array(approvalRequestSchema), options);
    this.passports = new VersionedJsonRepository(store, 'passports/registry.json', 'h2a.agents.passports', z.array(agentPassportSchema), options);
    this.decisions = new LocalJsonlRepository(store, 'mandates/decisions.jsonl', authorizationResultSchema);
    this.signatures = new AuthoritySignatureService(dataPath);
  }

  public async initialize(): Promise<void> {
    await Promise.all([this.mandates.read(), this.delegations.read(), this.approvals.read(), this.passports.read(), this.decisions.list(), this.signatures.initialize()]);
  }

  public getState(): Promise<MandateState> { return this.serialize(() => this.getStateUnlocked()); }

  public create(request: CreateMandateRequest): Promise<MandateState> {
    return this.serialize(async () => {
      const input = createMandateRequestSchema.parse(request);
      const proof = await this.requireProtectedAuthority(input.humanAuthority, 'issue', 'sign a mandate');
      const passport = await this.requireActivePassport(input.agentId);
      if (!input.actions.every((action) => passport.capabilities.includes(action))) throw new Error('Mandate actions must be contained by the Agent Passport capabilities.');
      if (new Date(input.expiresAt).getTime() <= this.clock().getTime()) throw new Error('Mandate expiry must be in the future.');
      const unsigned = buildUnsigned(input, passport, proof.subject_id, proof.human_proof_id, this.clock());
      const mandate = mandateSchema.parse({ ...unsigned, signature: await this.signatures.sign(unsigned, proof.subject_id) });
      await this.mandates.write([...(await this.mandates.read()), mandate]);
      await this.projectMandate(mandate);
      const created = await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_mandate_${mandate.mandateId}`, actor: { type: 'human', id: proof.subject_id }, subject: { type: 'mandate', id: mandate.mandateId }, mandate_id: mandate.mandateId, event_type: 'MANDATE_CREATED', payload: { agent_id: passport.agent_id, objective: mandate.objective, resources: mandate.resources, actions: mandate.actions, expires_at: mandate.expiresAt, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_mandate_${mandate.mandateId}`, actor: { type: 'human', id: proof.subject_id }, subject: { type: 'mandate', id: mandate.mandateId }, mandate_id: mandate.mandateId, parent_event_id: created.event_id, event_type: 'MANDATE_SIGNED', payload: { human_proof_id: proof.human_proof_id, canonical_hash: mandate.signature.canonicalHash, algorithm: mandate.signature.algorithm, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      await this.prependEvent('MANDATE_SIGNED', passport.name, `${passport.name} received signed authority.`);
      return this.getStateUnlocked();
    });
  }

  public delegate(request: DelegateMandateRequest): Promise<MandateState> {
    return this.serialize(async () => {
      const input = delegateMandateRequestSchema.parse(request);
      const proof = await this.requireProtectedAuthority(input.humanAuthority, 'issue', 'approve delegation');
      const all = await this.mandates.read();
      const parent = all.find((item) => item.mandateId === input.parentMandateId);
      if (!parent) throw new Error('Parent mandate was not found.');
      const parentReason = await this.validateMandateRecord(parent, all);
      if (parentReason) throw new Error(`Delegation denied: ${parentReason}.`);
      if (parent.subject.agentId !== input.fromAgentId) throw new Error('Delegating agent does not own the parent mandate.');
      const passport = await this.requireActivePassport(input.agentId);
      const attenuationError = validateAttenuation(parent, input, passport);
      if (attenuationError) {
        await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_delegation_${randomUUID()}`, actor: { type: 'agent', id: input.fromAgentId }, subject: { type: 'mandate', id: parent.mandateId }, mandate_id: parent.mandateId, event_type: 'DELEGATION_DENIED', payload: { reason_code: attenuationError, to_agent_id: input.agentId, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
        throw new Error(`Delegation denied: ${attenuationError}.`);
      }
      const unsigned = buildUnsigned(input, passport, proof.subject_id, proof.human_proof_id, this.clock(), parent);
      const child = mandateSchema.parse({ ...unsigned, signature: await this.signatures.sign(unsigned, proof.subject_id) });
      const edge = delegationEdgeSchema.parse({ delegationId: `dlg_${randomUUID()}`, parentMandateId: parent.mandateId, childMandateId: child.mandateId, fromAgentId: input.fromAgentId, toAgentId: input.agentId, createdAt: this.clock().toISOString() });
      await this.mandates.write([...all, child]);
      await this.delegations.write([...(await this.delegations.read()), edge]);
      await this.projectMandate(child);
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_delegation_${edge.delegationId}`, actor: { type: 'agent', id: input.fromAgentId }, subject: { type: 'delegation', id: edge.delegationId }, mandate_id: child.mandateId, event_type: 'DELEGATION_CREATED', payload: { parent_mandate_id: parent.mandateId, child_mandate_id: child.mandateId, to_agent_id: input.agentId, human_proof_id: proof.human_proof_id, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      await this.prependEvent('DELEGATION_CREATED', passport.name, `Bounded authority delegated to ${passport.name}.`);
      return this.getStateUnlocked();
    });
  }

  public updateLifecycle(request: MandateLifecycleRequest): Promise<MandateState> {
    return this.serialize(async () => {
      const input = mandateLifecycleRequestSchema.parse(request);
      const authorityAction = input.action === 'reactivate' ? 'issue' as const : 'revoke' as const;
      const proof = await this.requireProtectedAuthority(input.humanAuthority, authorityAction, `${input.action} a mandate`);
      const all = await this.mandates.read();
      const current = all.find((item) => item.mandateId === input.mandateId);
      if (!current) throw new Error('Mandate was not found.');
      if (current.status === 'revoked') throw new Error('A revoked mandate cannot change state.');
      if (input.action === 'reactivate' && current.status !== 'suspended') throw new Error('Only a suspended mandate can be reactivated.');
      if (input.action === 'reactivate' && isExpired(current, this.clock())) throw new Error('An expired mandate cannot be reactivated.');
      const affected = input.action === 'revoke' ? descendantsOf(current.mandateId, all) : new Set([current.mandateId]);
      const status = input.action === 'suspend' ? 'suspended' as const : input.action === 'reactivate' ? 'active' as const : 'revoked' as const;
      const updated: Mandate[] = [];
      for (const mandate of all) {
        if (!affected.has(mandate.mandateId)) { updated.push(mandate); continue; }
        const currentUnsigned = withoutSignature(mandate);
        const unsigned = { ...currentUnsigned, version: mandate.version + 1, status };
        updated.push(mandateSchema.parse({ ...unsigned, signature: await this.signatures.sign(unsigned, proof.subject_id) }));
      }
      await this.mandates.write(updated);
      if (input.action === 'revoke') await this.containRevocation(affected);
      const eventType = input.action === 'revoke' ? 'MANDATE_REVOKED' as const : 'MANDATE_AMENDED' as const;
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_mandate_${current.mandateId}`, actor: { type: 'human', id: proof.subject_id }, subject: { type: 'mandate', id: current.mandateId }, mandate_id: current.mandateId, event_type: eventType, payload: { action: input.action, affected_mandate_ids: [...affected], human_proof_id: proof.human_proof_id, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      await this.prependEvent(eventType, proof.subject_id, `${affected.size} mandate${affected.size === 1 ? '' : 's'} ${status}.`);
      return this.getStateUnlocked();
    });
  }

  public authorize(request: AuthorizeActionRequest): Promise<MandateState> {
    return this.serialize(async () => {
      const input = authorizeActionRequestSchema.parse(request);
      const prior = (await this.decisions.list()).find((item) => item.idempotencyKey === input.idempotencyKey);
      const result = prior ? this.result(input, 'DENY', 'REPLAY_DETECTED', { priorTraceId: prior.traceId }) : await this.evaluate(input);
      await this.decisions.append(result);
      const requested = await this.evidence.append({ trace_id: result.traceId, actor: { type: 'agent', id: input.agentId }, subject: { type: 'mandate', id: input.mandateId }, mandate_id: input.mandateId, event_type: 'ACTION_REQUESTED', payload: { resource: input.resource, action: input.action, idempotency_key: input.idempotencyKey, requested_fields: input.requestedFields } });
      const eventType = result.decision === 'ALLOW' ? 'POLICY_ALLOWED' as const : result.decision === 'DENY' ? 'POLICY_DENIED' as const : 'HUMAN_APPROVAL_REQUIRED' as const;
      await this.evidence.append({ trace_id: result.traceId, actor: { type: 'system', id: 'h2a-policy' }, subject: { type: 'mandate', id: input.mandateId }, mandate_id: input.mandateId, parent_event_id: requested.event_id, event_type: eventType, payload: { decision: result.decision, reason_code: result.reasonCode, approval_request_id: result.approvalRequestId ?? null, disclosure: result.disclosure } });
      await this.prependEvent(eventType, 'H2A Policy', `${input.action}: ${result.decision}`);
      return this.getStateUnlocked();
    });
  }

  public proveOverBroadDelegation(traceId: string): Promise<{ reasonCode: string; evidenceRef: string }> {
    return this.serialize(async () => {
      const all = await this.mandates.read();
      const parent = [...all].reverse().find((item) => item.status === 'active' && !isExpired(item, this.clock()) && item.delegation.allowed && item.delegation.allowedAgentIds.length > 0);
      if (!parent) throw new Error('No active delegable mandate is available for the over-broad delegation test.');
      const targetAgentId = parent.delegation.allowedAgentIds[0]!;
      const passport = await this.requireActivePassport(targetAgentId);
      const malicious = {
        ...toDelegationInput(parent),
        agentId: targetAgentId,
        resources: [...parent.resources, 'hp.unapproved-resource'],
        expiresAt: parent.expiresAt
      };
      const reasonCode = validateAttenuation(parent, malicious, passport);
      if (reasonCode !== 'CHILD_EXPANDS_PARENT_AUTHORITY') throw new Error('The delegation boundary did not reject the expanded child scope.');
      const event = await this.evidence.append({ trace_id: traceId, actor: { type: 'agent', id: parent.subject.agentId }, subject: { type: 'mandate', id: parent.mandateId }, mandate_id: parent.mandateId, event_type: 'DELEGATION_DENIED', payload: { reason_code: reasonCode, to_agent_id: targetAgentId, attempted_resource: 'hp.unapproved-resource', source: 'phase30-public-policy-boundary' } });
      return { reasonCode, evidenceRef: event.event_id };
    });
  }

  public resolveApproval(request: ResolveApprovalRequest): Promise<MandateState> {
    return this.serialize(async () => {
      const input = resolveApprovalRequestSchema.parse(request);
      const proof = await this.requireProtectedAuthority(input.humanAuthority, 'approve', 'resolve a sensitive action', 'mandate.approve');
      const approvals = await this.approvals.read();
      const approval = approvals.find((item) => item.approvalRequestId === input.approvalRequestId);
      if (!approval || approval.status !== 'pending') throw new Error('Pending approval request was not found.');
      const mandate = (await this.mandates.read()).find((item) => item.mandateId === approval.mandateId);
      if (!mandate || mandate.status !== 'active' || isExpired(mandate, this.clock())) throw new Error('Approval is blocked because mandate authority is no longer active.');
      const status = input.action === 'approve' ? 'approved' as const : 'rejected' as const;
      const resolved = approvalRequestSchema.parse({ ...approval, status, resolvedAt: this.clock().toISOString(), resolvedByHumanId: proof.subject_id, humanProofId: proof.human_proof_id });
      await this.approvals.write(approvals.map((item) => item.approvalRequestId === resolved.approvalRequestId ? resolved : item));
      const decision = this.result(approval.authorizationRequest, input.action === 'approve' ? 'ALLOW' : 'DENY', input.action === 'approve' ? 'AUTHORIZED' : 'APPROVAL_REJECTED', { approvalRequestId: approval.approvalRequestId, humanProofId: proof.human_proof_id });
      await this.decisions.append(decision);
      await this.evidence.append({ trace_id: decision.traceId, actor: { type: 'human', id: proof.subject_id }, subject: { type: 'mandate', id: mandate.mandateId }, mandate_id: mandate.mandateId, event_type: input.action === 'approve' ? 'HUMAN_APPROVED' : 'HUMAN_REJECTED', payload: { approval_request_id: approval.approvalRequestId, human_proof_id: proof.human_proof_id, action: approval.authorizationRequest.action } });
      await this.prependEvent(input.action === 'approve' ? 'HUMAN_APPROVED' : 'HUMAN_REJECTED', proof.subject_id, `${approval.authorizationRequest.action} ${status}.`);
      return this.getStateUnlocked();
    });
  }

  private async evaluate(input: AuthorizeActionRequest): Promise<AuthorizationResult> {
    const passport = (await this.passports.read()).find((item) => item.agent_id === input.agentId);
    if (!passport) return this.result(input, 'DENY', 'AGENT_NOT_REGISTERED');
    if (passport.status !== 'active' || (passport.expires_at && new Date(passport.expires_at).getTime() <= this.clock().getTime())) return this.result(input, 'DENY', 'AGENT_INACTIVE');
    const mandates = await this.mandates.read();
    const mandate = mandates.find((item) => item.mandateId === input.mandateId);
    if (!mandate) return this.result(input, 'DENY', 'MANDATE_NOT_FOUND');
    const invalid = await this.validateMandateRecord(mandate, mandates);
    if (invalid) return this.result(input, 'DENY', invalid);
    if (mandate.subject.agentId !== input.agentId) return this.result(input, 'DENY', 'MANDATE_SUBJECT_MISMATCH');
    if (!mandate.resources.includes(input.resource)) return this.result(input, 'DENY', 'RESOURCE_NOT_ALLOWED');
    if (mandate.prohibitedActions.includes(input.action)) return this.result(input, 'DENY', 'ACTION_PROHIBITED');
    const parameterReason = validateParameters(mandate, input.parameters);
    if (parameterReason) return this.result(input, 'DENY', parameterReason);
    if (!input.requestedFields.every((field) => mandate.disclosure.allowedFields.includes(field))) return this.result(input, 'DENY', 'DISCLOSURE_NOT_ALLOWED');
    if (mandate.approvals.requiredActions.includes(input.action)) {
      const approval = approvalRequestSchema.parse({ approvalRequestId: `apr_${randomUUID()}`, mandateId: mandate.mandateId, agentId: input.agentId, authorizationRequest: input, status: 'pending', requestedAt: this.clock().toISOString() });
      await this.approvals.write([...(await this.approvals.read()), approval]);
      return this.result(input, 'REQUIRES_HUMAN_APPROVAL', 'HUMAN_APPROVAL_REQUIRED', { approvalRequestId: approval.approvalRequestId }, approval.approvalRequestId);
    }
    if (!mandate.actions.includes(input.action)) return this.result(input, 'DENY', 'ACTION_NOT_ALLOWED');
    return this.result(input, 'ALLOW', 'AUTHORIZED', { evaluatedLimits: mandate.limits }, undefined, mandate.disclosure.allowedFields.filter((field) => input.requestedFields.includes(field)));
  }

  private async validateMandateRecord(mandate: Mandate, all: Mandate[]): Promise<PolicyReasonCode | undefined> {
    const { signature, ...unsigned } = mandate;
    if (!await this.signatures.verify(unsigned, signature)) return 'MANDATE_SIGNATURE_INVALID';
    if (mandate.status === 'revoked') return 'MANDATE_REVOKED';
    if (mandate.status !== 'active') return 'MANDATE_NOT_ACTIVE';
    if (isExpired(mandate, this.clock())) return 'MANDATE_EXPIRED';
    if (mandate.parentMandateId) {
      const parent = all.find((item) => item.mandateId === mandate.parentMandateId);
      if (!parent) return 'DELEGATION_CHAIN_INVALID';
      const parentReason = await this.validateMandateRecord(parent, all);
      if (parentReason) return parentReason === 'MANDATE_REVOKED' ? 'MANDATE_REVOKED' : 'DELEGATION_CHAIN_INVALID';
      if (validateAttenuation(parent, toDelegationInput(mandate), { capabilities: mandate.actions })) return 'CHILD_EXPANDS_PARENT_AUTHORITY';
    }
    return undefined;
  }

  private result(input: AuthorizeActionRequest, decision: AuthorizationResult['decision'], reasonCode: PolicyReasonCode, explanation: Record<string, unknown> = {}, approvalRequestId?: string, disclosure: string[] = []): AuthorizationResult {
    return authorizationResultSchema.parse({ idempotencyKey: input.idempotencyKey, mandateId: input.mandateId, agentId: input.agentId, resource: input.resource, action: input.action, decision, traceId: input.traceId ?? `tr_auth_${randomUUID()}`, reasonCode, obligations: decision === 'ALLOW' ? ['emit_execution_event'] : [], disclosure, explanation, approvalRequestId, evaluatedAt: this.clock().toISOString() });
  }

  private async requireHumanProof(purpose: string) {
    const state = await this.humanProof.getState('human_primary');
    const proof = state.activeProof;
    if (!proof || !state.identity || state.identity.status !== 'active' || new Date(proof.expires_at).getTime() <= this.clock().getTime()) throw new Error(`A current Human Proof is required to ${purpose}.`);
    return proof;
  }

  private async requireProtectedAuthority(context: HumanAuthorityContext | undefined, action: 'issue' | 'approve' | 'revoke', legacyPurpose: string, requiredApprovalPower?: string): Promise<{ subject_id: string; human_proof_id: string }> {
    if (!this.protectedHumanAuthority) return this.requireHumanProof(legacyPurpose);
    const result = await this.protectedHumanAuthority.authorizeProtectedOperation(context, 'mandate', action, requiredApprovalPower);
    return { subject_id: result.humanId, human_proof_id: result.humanProofId };
  }

  private async requireActivePassport(agentId: string): Promise<AgentPassport> {
    const passport = (await this.passports.read()).find((item) => item.agent_id === agentId);
    if (!passport) throw new Error('Agent Passport was not found.');
    if (passport.status !== 'active' || (passport.expires_at && new Date(passport.expires_at).getTime() <= this.clock().getTime())) throw new Error('Agent Passport is inactive.');
    return passport;
  }

  private async getStateUnlocked(): Promise<MandateState> {
    const [mandates, delegations, approvals, decisions, proof] = await Promise.all([this.mandates.read(), this.delegations.read(), this.approvals.read(), this.decisions.list(), this.humanProof.getState('human_primary')]);
    return mandateStateSchema.parse({ mandates, delegations, approvals, decisions: decisions.slice(-50).reverse(), humanProofRequired: !proof.activeProof || new Date(proof.activeProof.expires_at).getTime() <= this.clock().getTime() });
  }

  private async projectMandate(mandate: Mandate): Promise<void> {
    const snapshot = await this.workplace.getSnapshot();
    await this.workplace.replaceAgents(snapshot.agents.map((agent) => agent.passportId === mandate.subject.passportId ? { ...agent, mandateId: mandate.mandateId, mandateLabel: boundedMandateLabel(mandate.objective), currentAction: 'Authority active' } : agent));
  }

  private async containRevocation(affected: Set<string>): Promise<void> {
    const snapshot = await this.workplace.getSnapshot();
    await Promise.all([
      this.workplace.replaceAgents(snapshot.agents.map((agent) => affected.has(agent.mandateId) ? { ...agent, status: 'blocked' as const, currentAction: 'Mandate revoked' } : agent)),
      this.workplace.replaceAssignments(snapshot.assignments.map((assignment) => affected.has(assignment.mandateId) ? { ...assignment, status: 'blocked' as const, updatedAt: this.clock().toISOString() } : assignment)),
      this.approvals.write((await this.approvals.read()).map((approval) => approval.status === 'pending' && affected.has(approval.mandateId) ? { ...approval, status: 'invalidated' as const, resolvedAt: this.clock().toISOString() } : approval))
    ]);
  }

  private async prependEvent(type: string, actor: string, summary: string): Promise<void> {
    const snapshot = await this.workplace.getSnapshot();
    await this.workplace.replaceRecentEvents([{ id: `evt_${randomUUID()}`, type, actor, summary, time: this.clock().toISOString(), integrity: 'verified' as const }, ...snapshot.events].slice(0, 20));
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function boundedMandateLabel(value: string): string {
  let result = '';
  for (const character of value.trim()) {
    if ((result + character).length > 160) break;
    result += character;
  }
  return result;
}

function buildUnsigned(input: CreateMandateRequest, passport: AgentPassport, humanId: string, proofId: string, now: Date, parent?: Mandate) {
  return {
    mandateId: `mnd_${randomUUID()}`, version: 1, parentMandateId: parent?.mandateId, depth: parent ? parent.depth + 1 : 0,
    issuer: { humanId, humanProofId: proofId }, subject: { agentId: passport.agent_id, passportId: passport.passport_id },
    objective: input.objective, resources: unique(input.resources), actions: unique(input.actions), prohibitedActions: unique(input.prohibitedActions), limits: input.limits,
    disclosure: { allowedFields: unique(input.allowedFields) }, approvals: { requiredActions: unique(input.approvalActions) },
    delegation: { ...input.delegation, allowedAgentIds: unique(input.delegation.allowedAgentIds) }, issuedAt: now.toISOString(), expiresAt: input.expiresAt, status: 'active' as const
  };
}

function validateAttenuation(parent: Mandate, child: CreateMandateRequest, passport: Pick<AgentPassport, 'capabilities'>): PolicyReasonCode | undefined {
  if (!parent.delegation.allowed || !parent.delegation.allowedAgentIds.includes(child.agentId)) return 'CHILD_EXPANDS_PARENT_AUTHORITY';
  if (parent.depth + 1 > parent.delegation.maxDepth) return 'DELEGATION_DEPTH_EXCEEDED';
  if (child.objective !== parent.objective) return 'CHILD_EXPANDS_PARENT_AUTHORITY';
  if (!subset(child.resources, parent.resources) || !subset(child.actions, parent.actions) || !subset(child.actions, passport.capabilities)) return 'CHILD_EXPANDS_PARENT_AUTHORITY';
  if (!subset(parent.prohibitedActions, child.prohibitedActions) || !subset(child.allowedFields, parent.disclosure.allowedFields)) return 'CHILD_EXPANDS_PARENT_AUTHORITY';
  if (!subset(parent.approvals.requiredActions.filter((action) => child.actions.includes(action)), child.approvalActions)) return 'CHILD_EXPANDS_PARENT_AUTHORITY';
  if (new Date(child.expiresAt).getTime() > new Date(parent.expiresAt).getTime()) return 'CHILD_EXPANDS_PARENT_AUTHORITY';
  if (greater(child.limits.maxAmount, parent.limits.maxAmount) || greater(child.limits.maxRecords, parent.limits.maxRecords) || greater(child.limits.maxDurationMinutes, parent.limits.maxDurationMinutes)) return 'CHILD_EXPANDS_PARENT_AUTHORITY';
  if (Object.entries(parent.limits.parameterEquals).some(([key, value]) => child.limits.parameterEquals[key] !== value)) return 'CHILD_EXPANDS_PARENT_AUTHORITY';
  if (child.delegation.maxDepth > parent.delegation.maxDepth || !subset(child.delegation.allowedAgentIds, parent.delegation.allowedAgentIds)) return 'CHILD_EXPANDS_PARENT_AUTHORITY';
  return undefined;
}

function validateParameters(mandate: Mandate, parameters: Record<string, unknown>): PolicyReasonCode | undefined {
  if (mandate.limits.maxAmount !== undefined && Number(parameters.amount) > mandate.limits.maxAmount) return 'AMOUNT_EXCEEDS_MANDATE';
  if (mandate.limits.maxRecords !== undefined && Number(parameters.records) > mandate.limits.maxRecords) return 'RECORD_LIMIT_EXCEEDED';
  if (mandate.limits.maxDurationMinutes !== undefined && Number(parameters.durationMinutes) > mandate.limits.maxDurationMinutes) return 'DURATION_EXCEEDS_MANDATE';
  if (Object.entries(mandate.limits.parameterEquals).some(([key, value]) => parameters[key] !== value)) return 'PARAMETER_NOT_ALLOWED';
  return undefined;
}

function toDelegationInput(mandate: Mandate): CreateMandateRequest {
  return { agentId: mandate.subject.agentId, objective: mandate.objective, resources: mandate.resources, actions: mandate.actions, prohibitedActions: mandate.prohibitedActions, limits: mandate.limits, allowedFields: mandate.disclosure.allowedFields, approvalActions: mandate.approvals.requiredActions, delegation: mandate.delegation, expiresAt: mandate.expiresAt };
}

function descendantsOf(root: string, mandates: Mandate[]): Set<string> {
  const result = new Set([root]); let changed = true;
  while (changed) { changed = false; for (const mandate of mandates) if (mandate.parentMandateId && result.has(mandate.parentMandateId) && !result.has(mandate.mandateId)) { result.add(mandate.mandateId); changed = true; } }
  return result;
}

function isExpired(mandate: Mandate, now: Date): boolean { return new Date(mandate.expiresAt).getTime() <= now.getTime(); }
function withoutSignature(mandate: Mandate): Omit<Mandate, 'signature'> { const copy = { ...mandate } as Partial<Mandate>; delete copy.signature; return copy as Omit<Mandate, 'signature'>; }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function subset(child: string[], parent: string[]): boolean { return child.every((value) => parent.includes(value)); }
function greater(child: number | undefined, parent: number | undefined): boolean { return child !== undefined && (parent === undefined || child > parent); }
