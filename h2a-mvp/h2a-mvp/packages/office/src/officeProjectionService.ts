import { officeStateSchema, type ControlPlaneCanonicalState, type OfficeState } from '@h2a/contracts';
import { projectOfficeEntities } from './officeEntityProjection';
import { GuidedWorkflowService } from './guidedWorkflowService';

export class OfficeProjectionService {
  private readonly workflows = new GuidedWorkflowService();

  public project(canonical: ControlPlaneCanonicalState, generatedAt: string, selectedWorkflowId: OfficeState['workflow']['selected_workflow_id'] = 'set-up-people'): OfficeState {
    const hasLiveAgent = canonical.collaboration.workplace.agents.some((agent) => agent.provider !== 'scripted');
    const trustCeiling = canonical.enterprise.posture.trust_modes.governed > 0 || canonical.enterprise.posture.trust_modes['connected-observed'] > 0
        ? 'connected-observed'
        : 'unverified';
    const acceptanceStatus = canonical.final_acceptance.status === 'passed'
      ? 'passed'
      : canonical.final_acceptance.status === 'blocked'
        ? 'blocked'
        : 'incomplete';

    const entities = projectOfficeEntities(canonical);
    const alerts = entities.filter((entity) => entity.kind === 'alert');
    return officeStateSchema.parse({
      schema_version: 2,
      generated_at: generatedAt,
      runtime_mode: hasLiveAgent ? 'live-and-scripted' : 'scripted-rehearsal',
      trust_ceiling: trustCeiling,
      evidence_integrity: canonical.system.evidenceIntegrity,
      counts: {
        humans: canonical.enterprise.posture.active_humans,
        agents: canonical.collaboration.workplace.agents.length,
        assignments: canonical.collaboration.workplace.assignments.length,
        pending_approvals: canonical.enterprise.posture.pending_approvals,
        active_context_grants: canonical.enterprise.posture.active_context_grants,
        active_federation_peers: canonical.enterprise.posture.active_federation_peers
      },
      selected_agent_id: canonical.collaboration.workplace.agents[0]?.id ?? null,
      active_trace_id: canonical.final_acceptance.shared_trace_id,
      acceptance: {
        status: acceptanceStatus,
        passed: canonical.final_acceptance.completion.passed,
        total: canonical.final_acceptance.completion.total
      },
      workflow: this.workflows.project(canonical, selectedWorkflowId, generatedAt),
      collaboration: {
        signals: collaborationSignals(canonical, entities),
        portals: canonical.federation.peers.map((peer) => ({
          peer_id: peer.peer_id,
          label: boundedDisplay(peer.remote_node.display_name, 180),
          state: peer.status === 'revoked' ? 'revoked'
            : canonical.federation_operator.replay_proof?.blocked && peer.status === 'active' ? 'replay-blocked'
              : peer.status === 'active' ? 'active' : 'offline',
          key_fingerprint: peer.pinned_key_fingerprint,
          maximum_context_fields: peer.maximum_context_fields,
          last_reason_code: [...canonical.federation.receipts].reverse().find((receipt) => receipt.peer_id === peer.peer_id)?.reason_code ?? null
        }))
      },
      entities,
      alerts: {
        total: alerts.length,
        blocking: alerts.filter((alert) => ['blocked', 'failed', 'revoked'].includes(alert.status)).length
      }
    });
  }
}

function collaborationSignals(canonical: ControlPlaneCanonicalState, entities: OfficeState['entities']): Array<OfficeState['collaboration']['signals'][number]> {
  const entityId = (...primaryIds: Array<string | null | undefined>): string | null => {
    const candidates = new Set(primaryIds.filter((id): id is string => Boolean(id)));
    return entities.find((entity) => candidates.has(entity.primary_id))?.entity_id ?? null;
  };
  const evidence = (id: string | null | undefined): string[] => id
    ? canonical.evidence.events.filter((record) => record.event.subject?.id === id).map((record) => record.event.event_id)
    : [];
  const providerRuns = canonical.real_collaboration.lanes.filter((lane) => lane.run_id).map((lane) => ({
    signal_id: `provider-run:${lane.run_id!}`,
    target_entity_id: entityId(lane.agent_id, lane.binding_id, lane.passport_id),
    kind: 'provider-run' as const,
    title: boundedDisplay(lane.title, 180),
    status: lane.status === 'succeeded' ? 'succeeded' as const : lane.status === 'failed' || lane.status === 'timed-out' ? 'failed' as const : lane.status === 'cancelled' ? 'blocked' as const : lane.status === 'running' || lane.status === 'starting' ? 'working' as const : 'waiting' as const,
    trace_id: canonical.real_collaboration.trace_id,
    sender_id: lane.agent_id,
    recipient_id: null,
    released_fields: [],
    withheld_fields: [],
    predecessor_hashes: lane.dependency_output_hashes,
    output_hash: lane.output_hash,
    reason_code: lane.error ? 'PROVIDER_EXECUTION_FAILED' : null,
    evidence_refs: evidence(lane.run_id),
    updated_at: lane.completed_at ?? lane.started_at ?? canonical.real_collaboration.updated_at
  }));
  const handoffs = canonical.least_context.lanes.filter((lane) => lane.disclosure_id || lane.handoff_message_id).map((lane) => ({
    signal_id: `least-context:${lane.handoff_message_id ?? lane.disclosure_id!}`,
    target_entity_id: entityId(lane.handoff_message_id, lane.delivery_id, lane.disclosure_id, lane.agent_id),
    kind: 'least-context-handoff' as const,
    title: boundedDisplay(lane.title, 180),
    status: lane.status === 'acknowledged' ? 'succeeded' as const : lane.status === 'denied' ? 'blocked' as const : lane.status === 'running' ? 'working' as const : 'waiting' as const,
    trace_id: canonical.least_context.trace_id,
    sender_id: lane.passport_id,
    recipient_id: lane.agent_id,
    released_fields: lane.released_fields,
    withheld_fields: lane.withheld_fields,
    predecessor_hashes: lane.predecessor_hashes,
    output_hash: lane.output_hash,
    reason_code: lane.status === 'denied' ? 'CONTEXT_DELIVERY_DENIED' : null,
    evidence_refs: [...evidence(lane.disclosure_id), ...evidence(lane.handoff_message_id)],
    updated_at: canonical.least_context.updated_at
  }));
  const governedMessages = canonical.context_broker.messages.map((message) => ({
    signal_id: `governed-message:${message.message_id}`,
    target_entity_id: entityId(message.message_id, message.recipient_passport_id),
    kind: 'governed-message' as const,
    title: `${message.speech_act} · sequence ${message.sequence}`,
    status: message.status === 'delivered' ? 'succeeded' as const : message.status === 'rejected' ? 'blocked' as const : message.status === 'expired' ? 'offline' as const : 'queued' as const,
    trace_id: message.trace_id,
    sender_id: message.sender_passport_id,
    recipient_id: message.recipient_passport_id,
    released_fields: canonical.context_broker.grants.find((grant) => grant.grant.context_grant_id === message.context_grant_id)?.grant.allowed_fields ?? [],
    withheld_fields: [], predecessor_hashes: [], output_hash: message.content_hash,
    reason_code: message.status === 'rejected' ? 'GOVERNED_MESSAGE_REJECTED' : null,
    evidence_refs: evidence(message.message_id), updated_at: message.created_at
  }));
  const workGraphSignals = (canonical.goal_work_graph?.graphs ?? []).flatMap((graph) => graph.nodes.map((node) => ({
    signal_id: `work-graph:${graph.graph_id}:${node.node_id}`,
    target_entity_id: entityId(node.agent_id, node.runtime_binding_id, node.project_assignment_id),
    kind: 'work-graph' as const,
    title: boundedDisplay(node.title, 180),
    status: node.status === 'succeeded' ? 'succeeded' as const
      : ['failed', 'denied', 'cancelled', 'revoked', 'replacement-required'].includes(node.status) ? 'blocked' as const
        : node.status === 'running' ? 'working' as const
          : node.status === 'ready' ? 'queued' as const : 'waiting' as const,
    trace_id: graph.trace_id,
    sender_id: node.human_owner_id,
    recipient_id: node.agent_id,
    released_fields: node.allowed_context_fields,
    withheld_fields: node.withheld_context_fields,
    predecessor_hashes: graph.dependency_edges.filter((edge) => edge.successor_node_id === node.node_id).flatMap((edge) => {
      const predecessor = graph.nodes.find((item) => item.node_id === edge.predecessor_node_id);
      return predecessor?.output_hash ? [predecessor.output_hash] : [];
    }),
    output_hash: node.output_hash ?? null,
    reason_code: node.reason_code,
    evidence_refs: node.evidence_refs,
    updated_at: graph.updated_at
  })));
  const approvals = canonical.approvals.requests.map((request) => ({
    signal_id: `approval-route:${request.approval_request_id}`,
    target_entity_id: entityId(request.approval_request_id, request.requesting_agent_id),
    kind: 'approval-route' as const,
    title: `${request.required_action} · ${request.required_resource}`,
    status: request.status === 'approved' ? 'succeeded' as const : request.status === 'pending' ? 'waiting' as const : request.status === 'rejected' || request.status === 'withdrawn' || request.status === 'invalidated' ? 'blocked' as const : 'offline' as const,
    trace_id: canonical.human_escalation.trace_id,
    sender_id: request.requesting_human_id,
    recipient_id: request.eligible_membership_ids[0] ?? null,
    released_fields: [], withheld_fields: [], predecessor_hashes: [],
    output_hash: request.requested_effect_hash,
    reason_code: request.status === 'pending' || request.status === 'approved' ? null : `APPROVAL_${request.status.toUpperCase()}`,
    evidence_refs: evidence(request.approval_request_id),
    updated_at: request.requested_at
  }));
  const envelopes = canonical.federation.receipts.map((receipt) => ({
    signal_id: `federation-envelope:${receipt.receipt_id}`,
    target_entity_id: entityId(receipt.receipt_id, receipt.peer_id),
    kind: 'federation-envelope' as const,
    title: `${receipt.payload_type} · sequence ${receipt.sequence}`,
    status: receipt.decision === 'accepted' ? 'succeeded' as const : 'blocked' as const,
    trace_id: receipt.trace_id,
    sender_id: receipt.sender_node_id,
    recipient_id: receipt.recipient_node_id,
    released_fields: [], withheld_fields: [], predecessor_hashes: [],
    output_hash: receipt.payload_hash,
    reason_code: receipt.reason_code,
    evidence_refs: evidence(receipt.envelope_id),
    updated_at: receipt.received_at
  }));
  return [...workGraphSignals, ...providerRuns, ...governedMessages, ...handoffs, ...approvals, ...envelopes].sort((left, right) => (right.updated_at ?? '').localeCompare(left.updated_at ?? ''));
}

function boundedDisplay(value: string, maximum: number): string { const normalized = value.trim(); return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 3)}...`; }
