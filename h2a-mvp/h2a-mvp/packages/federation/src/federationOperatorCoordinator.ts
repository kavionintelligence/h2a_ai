import { hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';
import {
  federationOperatorStateSchema, proveFederationReplayRequestSchema, proveFederationRevocationRequestSchema,
  sendFederationAcknowledgementRequestSchema, sendFederationOperatorHeartbeatRequestSchema, sendFederationTaskRequestSchema,
  startFederationListenerRequestSchema, stopFederationListenerRequestSchema, taskEnvelopeSchema,
  type AgentIdentityState, type AuthorityEventType, type ContextBrokerState, type FederationEnvelope,
  type FederationOperatorState, type LeastContextState, type TaskEnvelope
} from '@h2a/contracts';
import { FederationHttpClient, FederationHttpServer } from './federationHttp';
import type { FederationAuthorityPort, FederationService } from './federationService';

interface OperatorPorts {
  federation: FederationService;
  authority: FederationAuthorityPort;
  organization: { signOrganizationRecord(value: unknown): Promise<{ canonicalHash: string; signature: string }> };
  agents: { getState(): Promise<AgentIdentityState> };
  leastContext: { getState(): Promise<LeastContextState>; renewGrant(request: unknown): Promise<LeastContextState> };
  context: { getState(): Promise<ContextBrokerState>; authorize(task: TaskEnvelope, request: { context_grant_id: string; requested_fields: string[]; purpose: string }): Promise<{ authorized: boolean; reason_code: string; granted_fields: Record<string, unknown>; withheld_fields: string[] }> };
}

export interface DispatchFederatedWorkGraphTaskRequest {
  actor: { membership_id: string; human_proof_id: string; authority_credential_id: string };
  organization_id: string;
  peer_id: string;
  ceremony_id: string;
  trace_id: string;
  task_id: string;
  requestor_human_id: string;
  assigned_agent_id: string;
  passport_id: string;
  runtime_attestation_id: string;
  mandate_id: string;
  context_grant_id: string;
  objective: string;
  dependency_task_ids: string[];
  output_contract: Record<string, unknown>;
  idempotency_key: string;
  expires_at: string;
}

export class FederationOperatorCoordinator {
  private readonly repository: VersionedJsonRepository<'h2a.phase29.federation-operator', FederationOperatorState>;
  private listener: FederationHttpServer | undefined;
  private replayEnvelope: FederationEnvelope | undefined;
  private queue: Promise<void> = Promise.resolve();

  public constructor(dataPath: string, private readonly evidence: EvidenceLedgerPort, private readonly ports: OperatorPorts, private readonly clock: () => Date = () => new Date()) {
    this.repository = new VersionedJsonRepository(new AtomicFileStore(dataPath), 'federation/phase29-operator-v1.json', 'h2a.phase29.federation-operator', federationOperatorStateSchema, { initialData: emptyState(clock), clock });
  }

  public async initialize(): Promise<FederationOperatorState> {
    const state = await this.repository.read();
    if (state.listener.status !== 'stopped') await this.repository.write({ ...state, listener: { status: 'stopped', endpoint: null, last_error: null }, updated_at: this.clock().toISOString() });
    return this.getState();
  }

  public getState(): Promise<FederationOperatorState> { return this.serialize(() => this.repository.read()); }

  public startListener(request: unknown): Promise<FederationOperatorState> {
    return this.serialize(async () => {
      const input = startFederationListenerRequestSchema.parse(request);
      const node = required((await this.ports.federation.getState()).local_node, 'Configure this federation node before starting its listener.');
      await this.authorize(input.actor, node.organization_id, 'listen');
      if (this.listener) return this.repository.read();
      const target = new URL(node.endpoint);
      if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(target.hostname)) throw new Error('Phase 29 listener remains loopback-only.');
      if (target.protocol !== 'http:') throw new Error('Phase 29 local listener requires an HTTP loopback endpoint.');
      const port = Number(target.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Configure an explicit loopback listener port.');
      this.listener = new FederationHttpServer(this.ports.federation, async (envelope) => {
        if (envelope.payload.type === 'task') {
          const current = await this.repository.read();
          await this.repository.write({ ...current, ceremony_id: envelope.ceremony_id ?? current.ceremony_id, trace_id: envelope.trace_id, last_received_task: { envelope_id: envelope.envelope_id, peer_id: envelope.peer_id, task_id: envelope.payload.task.task_id, payload_hash: envelope.payload_hash, received_at: this.clock().toISOString() }, updated_at: this.clock().toISOString() });
          return { type: 'ack', acknowledged_envelope_id: envelope.envelope_id, status: 'accepted', received_context_fields: envelope.payload.context_field_names, output_ref: `federation-receipt:${envelope.payload_hash}`, output_hash: hashCanonical({ envelope_id: envelope.envelope_id, payload_hash: envelope.payload_hash, fields: envelope.payload.context_field_names }), reason_code: 'FEDERATED_TASK_ACCEPTED' };
        }
        return { type: 'ack', acknowledged_envelope_id: envelope.envelope_id, status: 'accepted', received_context_fields: [], reason_code: `FEDERATED_${envelope.payload.type.toUpperCase()}_ACCEPTED` };
      }, { host: target.hostname, port });
      try {
        const endpoint = await this.listener.start();
        const next = { ...(await this.repository.read()), ceremony_id: input.ceremony.ceremony_id, trace_id: input.ceremony.trace_id, listener: { status: 'running' as const, endpoint, last_error: null }, updated_at: this.clock().toISOString() };
        await this.repository.write(next);
        await this.record(input.ceremony.trace_id, 'FEDERATION_NODE_CONFIGURED', node.node_id, { operation: 'listener-started', endpoint, ceremony_id: input.ceremony.ceremony_id });
        return next;
      } catch (error) {
        this.listener = undefined;
        const message = error instanceof Error ? error.message : 'Federation listener failed.';
        const next = { ...(await this.repository.read()), listener: { status: 'failed' as const, endpoint: null, last_error: message }, updated_at: this.clock().toISOString() };
        await this.repository.write(next);
        throw error;
      }
    });
  }

  public stopListener(request: unknown): Promise<FederationOperatorState> {
    return this.serialize(async () => {
      const input = stopFederationListenerRequestSchema.parse(request);
      const node = required((await this.ports.federation.getState()).local_node, 'Federation node is unavailable.');
      await this.authorize(input.actor, node.organization_id, 'listen');
      await this.listener?.close(); this.listener = undefined;
      const next = { ...(await this.repository.read()), listener: { status: 'stopped' as const, endpoint: null, last_error: null }, updated_at: this.clock().toISOString() };
      await this.repository.write(next);
      await this.record(input.ceremony.trace_id, 'FEDERATION_NODE_CONFIGURED', node.node_id, { operation: 'listener-stopped', ceremony_id: input.ceremony.ceremony_id });
      return next;
    });
  }

  public sendTask(request: unknown): Promise<FederationOperatorState> {
    return this.serialize(async () => {
      const input = sendFederationTaskRequestSchema.parse(request);
      const [federation, initialLeast, initialContext] = await Promise.all([this.ports.federation.getState(), this.ports.leastContext.getState(), this.ports.context.getState()]);
      const node = required(federation.local_node, 'Federation node is unavailable.');
      await this.authorize(input.actor, node.organization_id, 'send');
      const peer = required(federation.peers.find((item) => item.peer_id === input.peer_id && isExchangeablePeer(item.status)), 'Select an active or recoverable offline federation peer.');
      let least = initialLeast;
      let context = initialContext;
      let lane = required(least.lanes.find((item) => item.lane_id === input.lane_id && item.status === 'acknowledged'), 'Selected Phase 27 lane is not acknowledged.');
      let governedGrant = context.grants.find((item) => item.grant.context_grant_id === lane.context_grant_id && item.status === 'active' && new Date(item.grant.expires_at).getTime() > this.clock().getTime());
      if (!governedGrant) {
        least = await this.ports.leastContext.renewGrant({ actor: input.actor, lane_id: input.lane_id, ceremony: input.ceremony });
        context = await this.ports.context.getState();
        lane = required(least.lanes.find((item) => item.lane_id === input.lane_id && item.status === 'acknowledged'), 'Renewed Phase 27 lane is not acknowledged.');
        governedGrant = context.grants.find((item) => item.grant.context_grant_id === lane.context_grant_id && item.status === 'active' && new Date(item.grant.expires_at).getTime() > this.clock().getTime());
      }
      governedGrant = required(governedGrant, 'Selected Context Grant renewal did not produce active authority.');
      const grant = governedGrant.grant;
      const task = await this.taskFor(lane, grant.purpose, input.ceremony, node.organization_id);
      const disclosure = await this.ports.context.authorize(task, { context_grant_id: grant.context_grant_id, requested_fields: lane.requested_fields, purpose: grant.purpose });
      if (!disclosure.authorized) throw new Error(`Federated context disclosure denied: ${disclosure.reason_code}.`);
      const envelope = await this.ports.federation.signEnvelope(peer.peer_id, { type: 'task', task, context_projection: disclosure.granted_fields, context_field_names: Object.keys(disclosure.granted_fields), projection_hash: hashCanonical(disclosure.granted_fields) }, { traceId: input.ceremony.trace_id, ceremonyId: input.ceremony.ceremony_id, idempotencyKey: input.ceremony.idempotency_key, taskId: task.task_id, mandateId: task.mandate_id, contextGrantId: task.context_grant_id });
      this.replayEnvelope = envelope;
      try {
        const acknowledgement = await this.client(peer).exchange(envelope);
        const next = { ...(await this.repository.read()), ceremony_id: input.ceremony.ceremony_id, trace_id: input.ceremony.trace_id, last_outbound: { envelope_id: envelope.envelope_id, peer_id: peer.peer_id, payload_type: 'task' as const, payload_hash: envelope.payload_hash, sequence: envelope.sequence, acknowledgement_envelope_id: acknowledgement.envelope_id, acknowledgement_hash: acknowledgement.payload_hash, status: 'acknowledged' as const, reason_code: acknowledgement.payload.type === 'ack' ? acknowledgement.payload.reason_code : 'ACK_INVALID' }, replay_proof: null, updated_at: this.clock().toISOString() };
        await this.repository.write(next);
        await this.record(input.ceremony.trace_id, 'FEDERATION_ENVELOPE_ACCEPTED', envelope.envelope_id, { operation: 'task-acknowledged', peer_id: peer.peer_id, task_id: task.task_id, mandate_id: task.mandate_id, context_grant_id: task.context_grant_id, payload_hash: envelope.payload_hash, acknowledgement_hash: acknowledgement.payload_hash, ceremony_id: input.ceremony.ceremony_id });
        return next;
      } catch (error) { return this.failOutbound(envelope, error); }
    });
  }

  public dispatchWorkGraphTask(input: DispatchFederatedWorkGraphTaskRequest): Promise<{ envelopeId: string; acknowledgementId: string; evidenceRefs: string[] }> {
    return this.serialize(async () => {
      const federation = await this.ports.federation.getState();
      const node = required(federation.local_node, 'Federation node is unavailable.');
      if (node.organization_id !== input.organization_id) throw new Error('WORK_GRAPH_ORGANIZATION_MISMATCH');
      await this.authorize(input.actor, node.organization_id, 'send');
      const peer = required(federation.peers.find((item) => item.peer_id === input.peer_id && item.status === 'active'), 'Paired-node work requires an active pinned federation peer.');
      const unsigned = {
        schema_version: 2 as const,
        task_id: input.task_id,
        organization_id: input.organization_id,
        trace_id: input.trace_id,
        ceremony_id: input.ceremony_id,
        requestor_human_id: input.requestor_human_id,
        assigned_agent_id: input.assigned_agent_id,
        passport_id: input.passport_id,
        runtime_attestation_id: input.runtime_attestation_id,
        mandate_id: input.mandate_id,
        context_grant_id: input.context_grant_id,
        objective: input.objective,
        dependency_task_ids: input.dependency_task_ids,
        output_contract: input.output_contract,
        sequence: 49,
        idempotency_key: input.idempotency_key,
        issued_at: this.clock().toISOString(),
        expires_at: input.expires_at
      };
      const signature = await this.ports.organization.signOrganizationRecord(unsigned);
      const task = taskEnvelopeSchema.parse({ ...unsigned, canonical_hash: signature.canonicalHash, organization_signature: signature.signature });
      const projection: Record<string, never> = {};
      const envelope = await this.ports.federation.signEnvelope(peer.peer_id, {
        type: 'task',
        task,
        context_projection: projection,
        context_field_names: [],
        projection_hash: hashCanonical(projection)
      }, {
        traceId: input.trace_id,
        ceremonyId: input.ceremony_id,
        idempotencyKey: input.idempotency_key,
        taskId: task.task_id,
        mandateId: task.mandate_id,
        contextGrantId: task.context_grant_id
      });
      const acknowledgement = await this.client(peer).exchange(envelope);
      if (acknowledgement.payload.type !== 'ack' || acknowledgement.payload.status !== 'accepted') throw new Error('FEDERATED_WORK_GRAPH_ACKNOWLEDGEMENT_INVALID');
      const event = await this.evidence.append({
        trace_id: input.trace_id,
        actor: { type: 'human', id: input.actor.membership_id },
        subject: { type: 'federation_envelope', id: envelope.envelope_id },
        mandate_id: input.mandate_id,
        event_type: 'FEDERATION_ENVELOPE_ACCEPTED',
        payload: {
          operation: 'work-graph-task-dispatched',
          peer_id: peer.peer_id,
          task_id: task.task_id,
          passport_id: task.passport_id,
          runtime_attestation_id: task.runtime_attestation_id,
          context_grant_id: task.context_grant_id,
          payload_hash: envelope.payload_hash,
          acknowledgement_id: acknowledgement.envelope_id,
          acknowledgement_hash: acknowledgement.payload_hash,
          protected_values: 'excluded'
        }
      });
      return { envelopeId: envelope.envelope_id, acknowledgementId: acknowledgement.envelope_id, evidenceRefs: [event.event_id, envelope.envelope_id, acknowledgement.envelope_id] };
    });
  }

  public sendAcknowledgement(request: unknown): Promise<FederationOperatorState> { return this.serialize(async () => {
    const input = sendFederationAcknowledgementRequestSchema.parse(request); const state = await this.repository.read(); const received = required(state.last_received_task, 'No received federated task is available to acknowledge.');
    if (received.peer_id !== input.peer_id) throw new Error('Received task belongs to a different peer.');
    return this.exchangeSimple(input, { type: 'ack', acknowledged_envelope_id: received.envelope_id, status: 'completed', received_context_fields: [], output_ref: `phase29-complete:${received.payload_hash}`, output_hash: hashCanonical(received), reason_code: 'FEDERATED_TASK_COMPLETED' });
  }); }

  public sendHeartbeat(request: unknown): Promise<FederationOperatorState> { return this.serialize(async () => this.exchangeSimple(sendFederationOperatorHeartbeatRequestSchema.parse(request), { type: 'heartbeat', sent_at: this.clock().toISOString() })); }

  public proveReplay(request: unknown): Promise<FederationOperatorState> { return this.serialize(async () => {
    const input = proveFederationReplayRequestSchema.parse(request); const envelope = required(this.replayEnvelope, 'Run a federated task in this application session before proving replay denial.'); const federation = await this.ports.federation.getState(); const node = required(federation.local_node, 'Federation node is unavailable.'); await this.authorize(input.actor, node.organization_id, 'send'); const peer = await this.ports.federation.peer(envelope.peer_id);
    let blocked = false; let reason = 'REPLAY_WAS_NOT_BLOCKED';
    try { await this.client(peer).exchange(envelope); } catch (error) { blocked = true; reason = normalizeReason(error); }
    if (!blocked) throw new Error(reason);
    const next = { ...(await this.repository.read()), replay_proof: { envelope_id: envelope.envelope_id, blocked, reason_code: reason }, updated_at: this.clock().toISOString() };
    await this.repository.write(next); await this.record(input.ceremony.trace_id, 'FEDERATION_ENVELOPE_REJECTED', envelope.envelope_id, { operation: 'replay-proof', peer_id: envelope.peer_id, reason_code: reason, ceremony_id: input.ceremony.ceremony_id }); return next;
  }); }

  public proveRevocation(request: unknown): Promise<FederationOperatorState> { return this.serialize(async () => {
    const input = proveFederationRevocationRequestSchema.parse(request); const federation = await this.ports.federation.getState(); const node = required(federation.local_node, 'Federation node is unavailable.'); await this.authorize(input.actor, node.organization_id, 'send'); let blocked = false; let reason = 'REVOKED_PEER_WAS_NOT_BLOCKED';
    try { await this.ports.federation.signEnvelope(input.peer_id, { type: 'heartbeat', sent_at: this.clock().toISOString() }, { traceId: input.ceremony.trace_id, ceremonyId: input.ceremony.ceremony_id }); } catch (error) { blocked = true; reason = normalizeReason(error); }
    if (!blocked) throw new Error(reason);
    const next = { ...(await this.repository.read()), revocation_proof: { peer_id: input.peer_id, blocked, reason_code: reason }, updated_at: this.clock().toISOString() };
    await this.repository.write(next); await this.record(input.ceremony.trace_id, 'FEDERATION_ENVELOPE_REJECTED', input.peer_id, { operation: 'revoked-peer-proof', reason_code: reason, ceremony_id: input.ceremony.ceremony_id }); return next;
  }); }

  public async close(): Promise<void> { await this.listener?.close(); this.listener = undefined; }

  private async exchangeSimple(input: { actor: { membership_id: string; human_proof_id: string; authority_credential_id: string }; peer_id: string; ceremony: { ceremony_id: string; trace_id: string; idempotency_key: string } }, payload: { type: 'heartbeat'; sent_at: string } | { type: 'ack'; acknowledged_envelope_id: string; status: 'completed'; received_context_fields: string[]; output_ref: string; output_hash: string; reason_code: string }): Promise<FederationOperatorState> {
    const federation = await this.ports.federation.getState(); const node = required(federation.local_node, 'Federation node is unavailable.'); await this.authorize(input.actor, node.organization_id, 'send'); const peer = required(federation.peers.find((item) => item.peer_id === input.peer_id && isExchangeablePeer(item.status)), 'Select an active or recoverable offline federation peer.');
    const envelope = await this.ports.federation.signEnvelope(peer.peer_id, payload, { traceId: input.ceremony.trace_id, ceremonyId: input.ceremony.ceremony_id, idempotencyKey: input.ceremony.idempotency_key }); this.replayEnvelope = envelope;
    try { const ack = await this.client(peer).exchange(envelope); const next = { ...(await this.repository.read()), ceremony_id: input.ceremony.ceremony_id, trace_id: input.ceremony.trace_id, last_outbound: { envelope_id: envelope.envelope_id, peer_id: peer.peer_id, payload_type: payload.type, payload_hash: envelope.payload_hash, sequence: envelope.sequence, acknowledgement_envelope_id: ack.envelope_id, acknowledgement_hash: ack.payload_hash, status: 'acknowledged' as const, reason_code: ack.payload.type === 'ack' ? ack.payload.reason_code : 'ACK_INVALID' }, updated_at: this.clock().toISOString() }; await this.repository.write(next); return next; } catch (error) { return this.failOutbound(envelope, error); }
  }

  private async taskFor(lane: LeastContextState['lanes'][number], purpose: string, ceremony: { ceremony_id: string; trace_id: string; idempotency_key: string }, organizationId: string): Promise<TaskEnvelope> {
    if (!lane.assignment_id || !lane.agent_id || !lane.passport_id || !lane.runtime_session_id || !lane.mandate_id || !lane.context_grant_id) throw new Error('Phase 27 lane authority references are incomplete.');
    const identity = await this.ports.agents.getState();
    const session = required(identity.runtimeSessions?.find((item) => item.runtime_session_id === lane.runtime_session_id && item.passport_id === lane.passport_id), 'Phase 27 runtime session no longer resolves to its Passport.');
    const passport = required(identity.passportsV2?.find((item) => item.passport_id === lane.passport_id), 'Phase 27 Passport no longer resolves.');
    const unsigned = { schema_version: 2 as const, task_id: lane.assignment_id, organization_id: organizationId, trace_id: ceremony.trace_id, ceremony_id: ceremony.ceremony_id, requestor_human_id: passport.sponsor_human_id, assigned_agent_id: lane.agent_id, passport_id: lane.passport_id, runtime_attestation_id: session.runtime_attestation_id, mandate_id: lane.mandate_id, context_grant_id: lane.context_grant_id, objective: purpose, dependency_task_ids: [], output_contract: { type: 'object', delivery: 'signed-federation-acknowledgement', protected_values: 'excluded' }, sequence: 29, idempotency_key: ceremony.idempotency_key, issued_at: this.clock().toISOString(), expires_at: new Date(this.clock().getTime() + 10 * 60_000).toISOString() };
    const signed = await this.ports.organization.signOrganizationRecord(unsigned); return taskEnvelopeSchema.parse({ ...unsigned, canonical_hash: signed.canonicalHash, organization_signature: signed.signature });
  }

  private client(peer: Awaited<ReturnType<FederationService['peer']>>): FederationHttpClient { return new FederationHttpClient(this.ports.federation, { endpoint: peer.remote_node.endpoint, expectedTlsCertificateFingerprint: peer.pinned_tls_certificate_fingerprint, timeoutMs: 10_000 }); }
  private async authorize(actor: { membership_id: string; human_proof_id: string; authority_credential_id: string }, organizationId: string, action: string): Promise<void> { await this.ports.authority.authorizeProtectedOperation({ organizationId, membershipId: actor.membership_id, humanProofId: actor.human_proof_id, authorityCredentialId: actor.authority_credential_id }, 'federation-envelope', action, 'federation.node.manage'); }
  private async failOutbound(envelope: FederationEnvelope, error: unknown): Promise<FederationOperatorState> { const next = { ...(await this.repository.read()), last_outbound: { envelope_id: envelope.envelope_id, peer_id: envelope.peer_id, payload_type: envelope.payload.type === 'task' || envelope.payload.type === 'heartbeat' || envelope.payload.type === 'ack' ? envelope.payload.type : 'heartbeat' as const, payload_hash: envelope.payload_hash, sequence: envelope.sequence, acknowledgement_envelope_id: null, acknowledgement_hash: null, status: 'failed' as const, reason_code: normalizeReason(error) }, updated_at: this.clock().toISOString() }; await this.repository.write(next); throw error; }
  private record(traceId: string, eventType: AuthorityEventType, subjectId: string, payload: Record<string, unknown>) { return this.evidence.append({ trace_id: traceId, actor: { type: 'system', id: 'h2a-phase29-operator' }, subject: { type: 'federation_envelope', id: subjectId }, event_type: eventType, payload }); }
  private serialize<T>(operation: () => Promise<T>): Promise<T> { const result = this.queue.then(operation, operation); this.queue = result.then(() => undefined, () => undefined); return result; }
}

function emptyState(clock: () => Date): FederationOperatorState { return federationOperatorStateSchema.parse({ schema_version: 1, ceremony_id: null, trace_id: null, listener: { status: 'stopped', endpoint: null, last_error: null }, last_outbound: null, last_received_task: null, replay_proof: null, revocation_proof: null, updated_at: clock().toISOString() }); }
function required<T>(value: T | null | undefined, message: string): T { if (value === null || value === undefined) throw new Error(message); return value; }
function isExchangeablePeer(status: string): boolean { return status === 'active' || status === 'offline'; }
function normalizeReason(error: unknown): string { const message = error instanceof Error ? error.message : 'FEDERATION_OPERATION_FAILED'; const match = message.match(/FEDERATION_[A-Z_]+/u); return (match?.[0] ?? message.replace(/[^A-Za-z0-9_.-]+/gu, '_')).slice(0, 200); }
