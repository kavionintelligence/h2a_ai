import type {
  AgentRuntimeSummary,
  ControlPlaneCanonicalState,
  OfficeEntity,
  OfficeEntityActivity,
  OfficeEntityKind,
  OfficeEntityStatus,
  WorkAssignmentSummary
} from '@h2a/contracts';

interface EntityInput {
  kind: OfficeEntityKind;
  primaryId: string;
  label: string;
  detail: string;
  status: OfficeEntityStatus;
  activity?: OfficeEntityActivity;
  activityBasis?: OfficeEntity['activity_basis'];
  sourceDomain: string;
  relatedIds?: string[];
  authorityChain?: string[];
  contextFields?: string[];
  withheldContextFields?: string[];
  predecessorHashes?: string[];
  providerHealth?: string | null;
  outputHash?: string | null;
  reasonCode?: string | null;
  evidenceRefs?: string[];
  traceId?: string | null;
  selectableAgentId?: string | null;
  updatedAt?: string | null;
}

export function projectOfficeEntities(canonical: ControlPlaneCanonicalState): OfficeEntity[] {
  const entities: OfficeEntity[] = [];
  const push = (input: EntityInput): void => { entities.push(entity(input)); };

  for (const node of canonical.enterprise.nodes.filter((item) => item.kind === 'human')) {
    push({
      kind: 'human', primaryId: node.node_id.replace(/^human:/u, ''), label: node.label, detail: node.detail,
      status: normalizeLifecycle(node.status), sourceDomain: 'enterprise', evidenceRefs: node.evidence_refs,
      relatedIds: relatedNodeIds(canonical, node.node_id), updatedAt: canonical.enterprise.generated_at
    });
  }

  const passportNodes = new Map(canonical.enterprise.nodes.filter((item) => item.kind === 'passport').map((item) => [item.node_id.replace(/^passport:/u, ''), item]));
  for (const passport of canonical.agent_identity.passportsV2 ?? []) {
    const node = passportNodes.get(passport.passport_id);
    const evidenceRefs = unique([...(node?.evidence_refs ?? []), ...evidenceFor(canonical, passport.passport_id)]);
    push({
      kind: 'passport', primaryId: passport.passport_id, label: passport.name, detail: `${passport.role} · ${passport.risk_tier}`,
      status: normalizeLifecycle(passport.status), sourceDomain: 'agent-identity', evidenceRefs,
      relatedIds: [passport.agent_id, passport.sponsor_human_id, passport.sponsor_membership_id, passport.connector_manifest_id],
      authorityChain: [passport.sponsor_human_id, passport.sponsor_membership_id, passport.issuance_authority_credential_id, passport.issuance_human_proof_id],
      providerHealth: connectorHealth(canonical, passport.connector_manifest_id), updatedAt: passport.issued_at
    });
  }
  for (const passport of canonical.agent_identity.passports.filter((item) => !(canonical.agent_identity.passportsV2 ?? []).some((v2) => v2.passport_id === item.passport_id))) {
    const node = passportNodes.get(passport.passport_id);
    push({
      kind: 'passport', primaryId: passport.passport_id, label: passport.name, detail: `${passport.role} · ${passport.runtime}`,
      status: normalizeLifecycle(passport.status), sourceDomain: 'agent-identity', evidenceRefs: unique([...(node?.evidence_refs ?? []), ...evidenceFor(canonical, passport.passport_id)]),
      relatedIds: [passport.agent_id, passport.owner_human_id], authorityChain: [passport.owner_human_id, passport.owner_human_proof_id], updatedAt: passport.updated_at
    });
  }

  const providerIds = new Set<string>([
    ...canonical.agent_identity.providers.map((provider) => provider.id),
    ...canonical.enterprise.nodes.filter((node) => node.kind === 'connector').map((node) => node.node_id.replace(/^connector:/u, ''))
  ]);
  for (const providerId of providerIds) {
    const definition = canonical.agent_identity.providers.find((item) => item.id === providerId);
    const node = canonical.enterprise.nodes.find((item) => item.kind === 'connector' && item.node_id.replace(/^connector:/u, '') === providerId);
    const health = node?.status ?? definition?.availability ?? 'unavailable';
    push({
      kind: 'provider', primaryId: providerId, label: node?.label ?? definition?.label ?? providerId,
      detail: node?.detail ?? definition?.description ?? 'Connector discovered from canonical state.',
      status: providerStatus(health), sourceDomain: node ? 'enterprise' : 'agent-identity', providerHealth: health,
      evidenceRefs: node?.evidence_refs ?? [], relatedIds: [], updatedAt: canonical.enterprise.generated_at
    });
  }

  for (const agent of canonical.collaboration.workplace.agents) push(agentEntity(canonical, agent));
  for (const assignment of canonical.collaboration.workplace.assignments) push(assignmentEntity(canonical, assignment));
  const workplaceAssignmentIds = new Set(canonical.collaboration.workplace.assignments.map((assignment) => assignment.id));
  canonical.guided_bootstrap.assignment_ids.forEach((assignmentId, index) => {
    if (workplaceAssignmentIds.has(assignmentId)) return;
    const participant = canonical.guided_bootstrap.participants[index];
    const evidenceRefs = evidenceFor(canonical, assignmentId);
    const traceId = canonical.guided_bootstrap.trace_id;
    push({
      kind: 'assignment', primaryId: assignmentId,
      label: participant ? `${participant.name} assignment` : `Guided assignment ${index + 1}`,
      detail: participant ? `${participant.lane} ceremony work` : 'Ceremony-bound guided work',
      status: evidenceRefs.length > 0 ? 'queued' : 'warning',
      activity: evidenceRefs.length > 0 ? 'canonical-wait' : 'decorative-idle',
      activityBasis: evidenceRefs.length > 0 ? 'canonical-state' : 'decorative', sourceDomain: 'guided-bootstrap',
      evidenceRefs, relatedIds: unique([participant?.agent_id, participant?.passport_id, participant?.runtime_session_id]),
      authorityChain: unique([participant?.passport_id, participant?.runtime_session_id, canonical.guided_bootstrap.child_mandate_ids[index]]),
      providerHealth: participant ? connectorHealth(canonical, participant.provider) : null,
      traceId, selectableAgentId: participant?.binding_id ?? participant?.agent_id ?? null,
      updatedAt: canonical.guided_bootstrap.updated_at
    });
  });

  for (const request of canonical.approvals.requests) {
    const evidenceRefs = unique([...evidenceFor(canonical, request.approval_request_id), ...enterpriseEvidence(canonical, 'approval', request.approval_request_id)]);
    const status = approvalStatus(request.status);
    push({
      kind: 'approval', primaryId: request.approval_request_id, label: `${request.required_action} · ${request.required_resource}`,
      detail: `${request.eligible_membership_ids.length} eligible memberships · ${request.approval_policy_id}`,
      status, sourceDomain: 'approvals', evidenceRefs,
      activity: persistedActivity(status, evidenceRefs), activityBasis: persistedBasis(status, evidenceRefs),
      relatedIds: [request.task_id, request.requesting_human_id, request.requesting_agent_id, request.mandate_id, request.review_context_grant_id],
      authorityChain: [request.requesting_human_id, request.requesting_agent_id, request.mandate_id, request.approval_policy_id],
      traceId: traceForTask(canonical, request.task_id), updatedAt: request.requested_at
    });
  }
  for (const request of canonical.mandates.approvals.filter((item) => !canonical.approvals.requests.some((v2) => v2.approval_request_id === item.approvalRequestId))) {
    const evidenceRefs = evidenceFor(canonical, request.approvalRequestId);
    const status = approvalStatus(request.status);
    push({
      kind: 'approval', primaryId: request.approvalRequestId, label: request.authorizationRequest.action,
      detail: `${request.authorizationRequest.resource} · ${request.agentId}`, status, sourceDomain: 'mandates', evidenceRefs,
      activity: persistedActivity(status, evidenceRefs), activityBasis: persistedBasis(status, evidenceRefs),
      relatedIds: [request.agentId, request.mandateId], authorityChain: [request.agentId, request.mandateId],
      reasonCode: decisionReason(canonical, request.authorizationRequest.traceId, request.agentId), traceId: request.authorizationRequest.traceId,
      updatedAt: request.resolvedAt ?? request.requestedAt
    });
  }

  for (const governed of canonical.context_broker.grants) {
    const grant = governed.grant;
    const evidenceRefs = unique([...evidenceFor(canonical, grant.context_grant_id), ...enterpriseEvidence(canonical, 'context-grant', grant.context_grant_id)]);
    const status = governed.status === 'active' ? 'ready' : governed.status === 'revoked' ? 'revoked' : 'offline';
    push({
      kind: 'context-grant', primaryId: grant.context_grant_id, label: grant.purpose,
      detail: `${grant.allowed_fields.length} authorized fields · ${governed.use_count}/${governed.maximum_uses} uses`,
      status, sourceDomain: 'context-broker', evidenceRefs,
      activity: status === 'revoked' && evidenceRefs.length > 0 ? 'persisted-denial' : status === 'ready' ? 'canonical-wait' : 'inactive',
      activityBasis: status === 'revoked' && evidenceRefs.length > 0 ? 'persisted-evidence' : 'canonical-state',
      relatedIds: [grant.task_id, grant.mandate_id, grant.recipient_agent_id, grant.recipient_passport_id, ...grant.artifact_refs],
      authorityChain: [grant.recipient_agent_id, grant.recipient_passport_id, grant.mandate_id], contextFields: grant.allowed_fields,
      reasonCode: status === 'revoked' ? 'CONTEXT_GRANT_REVOKED' : null, traceId: traceForTask(canonical, grant.task_id), updatedAt: governed.updated_at
    });
  }

  for (const peer of canonical.federation.peers) {
    const evidenceRefs = unique([...evidenceFor(canonical, peer.peer_id), ...enterpriseEvidence(canonical, 'federation-node', peer.remote_node.node_id)]);
    const status = peer.status === 'active' ? 'ready' : peer.status === 'revoked' ? 'revoked' : peer.status === 'offline' || peer.status === 'expired' ? 'offline' : 'waiting';
    push({
      kind: 'federation-peer', primaryId: peer.peer_id, label: peer.remote_node.display_name,
      detail: `${peer.capabilities.length} capabilities · ${peer.maximum_context_fields} field limit`, status,
      sourceDomain: 'federation', evidenceRefs,
      activity: status === 'revoked' && evidenceRefs.length > 0 ? 'persisted-denial' : status === 'ready' ? 'canonical-wait' : 'inactive',
      activityBasis: status === 'revoked' && evidenceRefs.length > 0 ? 'persisted-evidence' : 'canonical-state',
      relatedIds: [peer.local_node_id, peer.remote_node.node_id], reasonCode: latestFederationReason(canonical, peer.peer_id), updatedAt: peer.updated_at
    });
  }

  for (const trace of canonical.enterprise.traces) {
    const evidenceRefs = canonical.evidence.events.filter((record) => record.event.trace_id === trace.trace_id).map((record) => record.event.event_id);
    const status: OfficeEntityStatus = trace.integrity_status === 'failed' ? 'failed' : trace.resolution_status === 'complete' ? 'succeeded' : trace.integrity_status === 'warning' ? 'warning' : 'waiting';
    push({
      kind: 'trace', primaryId: trace.trace_id, label: trace.trace_id,
      detail: `${trace.event_count} events · ${trace.resolution_status}`, status, sourceDomain: 'enterprise', evidenceRefs,
      activity: persistedActivity(status, evidenceRefs), activityBasis: persistedBasis(status, evidenceRefs),
      relatedIds: unique(Object.values(trace.references).flat()), outputHash: trace.references.output_hashes.at(-1) ?? null,
      reasonCode: trace.missing_links.length > 0 ? `MISSING_${trace.missing_links.join('_').toUpperCase().replaceAll('-', '_')}` : null,
      traceId: trace.trace_id, updatedAt: trace.updated_at
    });
  }

  for (const lane of canonical.least_context.lanes.filter((item) => item.disclosure_id || item.delivery_id || item.handoff_message_id)) {
    const primaryId = lane.handoff_message_id ?? lane.delivery_id ?? lane.disclosure_id!;
    const evidenceRefs = unique([
      ...evidenceFor(canonical, lane.disclosure_id ?? undefined),
      ...evidenceFor(canonical, lane.delivery_id ?? undefined),
      ...evidenceFor(canonical, lane.handoff_message_id ?? undefined)
    ]);
    const status: OfficeEntityStatus = lane.status === 'acknowledged' ? 'succeeded' : lane.status === 'denied' ? 'blocked' : lane.status === 'running' ? 'working' : lane.status === 'ready' ? 'queued' : 'waiting';
    push({
      kind: 'handoff', primaryId, label: lane.title,
      detail: `${lane.released_fields.length} released · ${lane.withheld_fields.length} withheld`,
      status, activity: status === 'succeeded' && evidenceRefs.length > 0 ? 'persisted-success' : status === 'blocked' && evidenceRefs.length > 0 ? 'persisted-denial' : status === 'working' ? 'canonical-handoff' : 'canonical-wait',
      activityBasis: (status === 'succeeded' || status === 'blocked') && evidenceRefs.length > 0 ? 'persisted-evidence' : 'canonical-state',
      sourceDomain: 'least-context', evidenceRefs,
      relatedIds: unique([lane.agent_id, lane.passport_id, lane.runtime_session_id, lane.mandate_id, lane.assignment_id, lane.context_grant_id, lane.disclosure_id, lane.delivery_id]),
      authorityChain: unique([lane.passport_id, lane.runtime_session_id, lane.mandate_id, lane.assignment_id, lane.context_grant_id]),
      contextFields: lane.released_fields, withheldContextFields: lane.withheld_fields, predecessorHashes: lane.predecessor_hashes,
      outputHash: lane.output_hash, reasonCode: lane.status === 'denied' ? lane.error ?? 'CONTEXT_DELIVERY_DENIED' : null,
      traceId: canonical.least_context.trace_id, updatedAt: canonical.least_context.updated_at
    });
  }

  for (const message of canonical.context_broker.messages) {
    const evidenceRefs = evidenceFor(canonical, message.message_id);
    const status: OfficeEntityStatus = message.status === 'delivered' ? 'succeeded' : message.status === 'rejected' ? 'blocked' : message.status === 'expired' ? 'offline' : 'queued';
    push({
      kind: 'message', primaryId: message.message_id, label: `${message.speech_act} · sequence ${message.sequence}`,
      detail: message.content_ref, status, activity: message.status === 'delivered' ? 'canonical-handoff' : persistedActivity(status, evidenceRefs),
      activityBasis: evidenceRefs.length > 0 ? 'persisted-evidence' : 'canonical-state', sourceDomain: 'context-broker', evidenceRefs,
      relatedIds: [message.task_id, message.sender_passport_id, message.recipient_passport_id, message.mandate_id, message.context_grant_id],
      authorityChain: [message.sender_passport_id, message.mandate_id, message.context_grant_id], outputHash: message.content_hash,
      reasonCode: message.status === 'rejected' ? 'GOVERNED_MESSAGE_REJECTED' : null, traceId: message.trace_id, updatedAt: message.created_at
    });
  }

  for (const receipt of canonical.federation.receipts) {
    const evidenceRefs = evidenceFor(canonical, receipt.envelope_id);
    const status: OfficeEntityStatus = receipt.decision === 'accepted' ? 'succeeded' : 'blocked';
    push({
      kind: 'federation-envelope', primaryId: receipt.receipt_id,
      label: `${receipt.payload_type} · sequence ${receipt.sequence}`,
      detail: receipt.decision === 'accepted' ? 'Signed envelope accepted' : `Signed envelope rejected · ${receipt.reason_code}`,
      status, activity: evidenceRefs.length > 0 ? (status === 'succeeded' ? 'persisted-success' : 'persisted-denial') : 'canonical-wait',
      activityBasis: evidenceRefs.length > 0 ? 'persisted-evidence' : 'canonical-state', sourceDomain: 'federation', evidenceRefs,
      relatedIds: [receipt.peer_id, receipt.envelope_id, receipt.sender_node_id, receipt.recipient_node_id],
      outputHash: receipt.payload_hash, reasonCode: receipt.reason_code, traceId: receipt.trace_id, updatedAt: receipt.received_at
    });
  }

  for (const session of canonical.runtime_attachment.sessions) {
    const evidenceRefs = evidenceFor(canonical, session.session_id);
    const status: OfficeEntityStatus = session.status === 'running' || session.status === 'awaiting-input' ? 'working' : session.status === 'exited' ? 'succeeded' : session.status === 'cancelled' || session.status === 'revoked' ? 'blocked' : session.status === 'failed' ? 'failed' : 'queued';
    push({
      kind: 'runtime-session', primaryId: session.session_id, label: `${session.provider} terminal`, detail: `${session.purpose} · ${session.status}`,
      status, activity: persistedActivity(status, evidenceRefs), activityBasis: persistedBasis(status, evidenceRefs), sourceDomain: 'runtime-attachment', evidenceRefs,
      relatedIds: [session.agent_id, session.passport_id, session.binding_id, session.runtime_session_id, session.mandate_id, session.run_id],
      authorityChain: [session.passport_id, session.runtime_session_id, session.mandate_id], outputHash: session.output_hash,
      reasonCode: session.termination_reason ?? null, traceId: session.trace_id, selectableAgentId: session.agent_id, updatedAt: session.updated_at
    });
  }

  for (const alert of projectAlerts(canonical)) push(alert);
  return uniqueBy(entities, (item) => item.entity_id).sort((left, right) => `${left.kind}:${left.entity_id}`.localeCompare(`${right.kind}:${right.entity_id}`));
}

function agentEntity(canonical: ControlPlaneCanonicalState, agent: AgentRuntimeSummary): EntityInput {
  const binding = canonical.agent_identity.bindings.find((item) => item.binding_id === agent.id || item.agent_id === agent.id);
  const passport = (canonical.agent_identity.passportsV2 ?? []).find((item) => item.passport_id === agent.passportId || item.agent_id === binding?.agent_id);
  const session = (canonical.agent_identity.runtimeSessions ?? []).find((item) => item.passport_id === passport?.passport_id);
  const assignment = latestAssignment(canonical, agent.id);
  const traceId = assignment?.traceId ?? latestScenarioTrace(canonical, assignment?.id);
  const evidenceRefs = unique([
    ...(session?.evidence_refs ?? []), ...evidenceFor(canonical, agent.id), ...evidenceFor(canonical, assignment?.id),
    ...enterpriseEvidence(canonical, 'agent', binding?.agent_id ?? agent.id)
  ]);
  const outputHash = outputHashForTrace(canonical, traceId);
  const reasonCode = scenarioReason(canonical, assignment?.id) ?? activityReason(canonical, agent.id);
  const status = agentStatus(agent, assignment, session?.state, reasonCode, outputHash, evidenceRefs);
  const handoff = canonical.context_broker.messages.some((message) => message.status === 'delivered' && message.sender_passport_id === passport?.passport_id && message.trace_id === traceId);
  const activity = handoff && status === 'working' ? 'canonical-handoff' : persistedActivity(status, evidenceRefs);
  const grant = canonical.context_broker.grants.find((item) => item.grant.recipient_agent_id === (passport?.agent_id ?? binding?.agent_id) && item.status === 'active');
  const mandate = canonical.mandates.mandates.find((item) => item.mandateId === agent.mandateId);
  return {
    kind: agent.provider === 'custom-cli' ? 'framework-agent' : 'agent', primaryId: agent.id, label: agent.name,
    detail: `${agent.role} · ${agent.currentAction}`, status, activity,
    activityBasis: activity.startsWith('persisted-') ? 'persisted-evidence' : status === 'idle' || status === 'ready' ? 'decorative' : 'canonical-state',
    sourceDomain: 'collaboration', evidenceRefs, relatedIds: unique([agent.passportId, agent.mandateId, assignment?.id, session?.runtime_session_id, binding?.binding_id]),
    authorityChain: unique([passport?.sponsor_human_id, passport?.sponsor_membership_id, agent.passportId, session?.runtime_attestation_id, agent.mandateId, mandate?.parentMandateId]),
    contextFields: grant?.grant.allowed_fields ?? [], providerHealth: connectorHealth(canonical, passport?.connector_manifest_id ?? agent.provider),
    outputHash, reasonCode, traceId: traceId ?? null, selectableAgentId: agent.id, updatedAt: assignment?.updatedAt ?? session?.last_seen_at ?? canonical.collaboration.workplace.generatedAt
  };
}

function assignmentEntity(canonical: ControlPlaneCanonicalState, assignment: WorkAssignmentSummary): EntityInput {
  const evidenceRefs = evidenceFor(canonical, assignment.id);
  const traceId = assignment.traceId ?? latestScenarioTrace(canonical, assignment.id);
  const outputHash = outputHashForTrace(canonical, traceId);
  const reasonCode = scenarioReason(canonical, assignment.id) ?? decisionReason(canonical, traceId, assignment.assigneeId);
  const status = assignmentStatus(assignment, outputHash, evidenceRefs, reasonCode);
  const agent = canonical.collaboration.workplace.agents.find((item) => item.id === assignment.assigneeId);
  const grant = canonical.context_broker.grants.find((item) => item.grant.task_id === assignment.id && item.status === 'active');
  return {
    kind: 'assignment', primaryId: assignment.id, label: assignment.title, detail: assignment.objective,
    status, activity: persistedActivity(status, evidenceRefs), activityBasis: persistedBasis(status, evidenceRefs), sourceDomain: 'collaboration',
    evidenceRefs, relatedIds: unique([assignment.assigneeId, assignment.mandateId, ...assignment.dependsOn]),
    authorityChain: unique([agent?.passportId, assignment.assigneeId, assignment.mandateId]), contextFields: grant?.grant.allowed_fields ?? [],
    providerHealth: agent ? connectorHealth(canonical, agent.provider) : null, outputHash, reasonCode, traceId: traceId ?? null,
    selectableAgentId: assignment.assigneeId, updatedAt: assignment.updatedAt
  };
}

function projectAlerts(canonical: ControlPlaneCanonicalState): EntityInput[] {
  const alerts: EntityInput[] = [];
  if (canonical.evidence.integrity.status !== 'verified') {
    alerts.push({
      kind: 'alert', primaryId: `evidence-integrity-${canonical.evidence.integrity.status}`, label: 'Evidence integrity',
      detail: canonical.evidence.integrity.reason ?? `Evidence ledger status is ${canonical.evidence.integrity.status}.`,
      status: canonical.evidence.integrity.status === 'failed' ? 'failed' : 'warning', sourceDomain: 'evidence',
      evidenceRefs: canonical.evidence.integrity.failedEventId ? [canonical.evidence.integrity.failedEventId] : [],
      reasonCode: canonical.evidence.integrity.status === 'failed' ? 'EVIDENCE_INTEGRITY_FAILED' : 'EVIDENCE_INTEGRITY_WARNING',
      activity: canonical.evidence.integrity.failedEventId ? 'persisted-failure' : 'inactive',
      activityBasis: canonical.evidence.integrity.failedEventId ? 'persisted-evidence' : 'canonical-state'
    });
  }
  for (const run of canonical.scenarios.runs) {
    for (const step of run.steps.filter((item) => ['denied', 'failed', 'timed-out', 'revoked'].includes(item.status))) {
      const evidenceRefs = evidenceFor(canonical, step.assignmentId);
      alerts.push({
        kind: 'alert', primaryId: `scenario-${run.runId}-${step.stepId}`, label: `${step.status} · ${step.action}`,
        detail: `${step.resource} · ${step.assignmentId}`, status: step.status === 'failed' || step.status === 'timed-out' ? 'failed' : step.status === 'revoked' ? 'revoked' : 'blocked',
        sourceDomain: 'scenarios', evidenceRefs, activity: evidenceRefs.length > 0 ? (step.status === 'failed' || step.status === 'timed-out' ? 'persisted-failure' : 'persisted-denial') : 'inactive',
        activityBasis: evidenceRefs.length > 0 ? 'persisted-evidence' : 'canonical-state', relatedIds: [run.runId, step.assignmentId, step.runtimeAgentId, step.mandateId],
        reasonCode: step.reasonCode ?? step.status.toUpperCase().replaceAll('-', '_'), traceId: run.traceId, updatedAt: step.completedAt ?? run.updatedAt
      });
    }
  }
  for (const record of canonical.evidence.events.filter((item) => [
    'LIVE_RUNTIME_CANCELLED', 'LIVE_RUNTIME_REVOKED', 'LIVE_RUNTIME_FAILED',
    'RUNTIME_EXECUTION_FAILED', 'RUNTIME_EXECUTION_TIMED_OUT'
  ].includes(item.event.event_type))) {
    const event = record.event;
    const revoked = event.event_type === 'LIVE_RUNTIME_REVOKED';
    const cancelled = event.event_type === 'LIVE_RUNTIME_CANCELLED';
    const status: OfficeEntityStatus = revoked ? 'revoked' : cancelled ? 'blocked' : 'failed';
    const reasonCode = payloadReason(event.payload, cancelled ? 'OPERATOR_CANCELLED' : revoked ? 'RUNTIME_AUTHORITY_REVOKED' : 'PROVIDER_FAILURE');
    alerts.push({
      kind: 'alert', primaryId: `runtime-${event.event_id}`, label: runtimeAlertLabel(event.event_type),
      detail: `${event.subject?.id ?? 'runtime'} · ${event.trace_id}`, status, sourceDomain: 'evidence',
      evidenceRefs: [event.event_id], activity: status === 'failed' ? 'persisted-failure' : 'persisted-denial',
      activityBasis: 'persisted-evidence', relatedIds: unique([event.subject?.id, event.mandate_id]),
      reasonCode, traceId: event.trace_id, updatedAt: event.timestamp
    });
  }
  for (const receipt of canonical.federation.receipts.filter((item) => item.decision === 'rejected')) {
    const evidenceRefs = evidenceFor(canonical, receipt.envelope_id);
    alerts.push({
      kind: 'alert', primaryId: `federation-${receipt.receipt_id}`, label: `Federation ${receipt.payload_type} denied`, detail: receipt.peer_id,
      status: 'blocked', sourceDomain: 'federation', evidenceRefs,
      activity: evidenceRefs.length > 0 ? 'persisted-denial' : 'inactive', activityBasis: evidenceRefs.length > 0 ? 'persisted-evidence' : 'canonical-state',
      relatedIds: [receipt.peer_id, receipt.envelope_id], reasonCode: receipt.reason_code, traceId: receipt.trace_id, updatedAt: receipt.received_at
    });
  }
  return alerts;
}

function payloadReason(payload: Record<string, unknown>, fallback: string): string {
  for (const key of ['termination_reason', 'reason_code', 'result_code']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return fallback;
}

function runtimeAlertLabel(eventType: string): string {
  if (eventType === 'LIVE_RUNTIME_CANCELLED') return 'Runtime cancelled by operator';
  if (eventType === 'LIVE_RUNTIME_REVOKED') return 'Runtime authority revoked';
  if (eventType === 'RUNTIME_EXECUTION_TIMED_OUT') return 'Provider execution timed out';
  return 'Provider execution failed';
}

function entity(input: EntityInput): OfficeEntity {
  const evidenceRefs = unique(input.evidenceRefs ?? []);
  const activity = input.activity ?? persistedActivity(input.status, evidenceRefs);
  return {
    entity_id: `${input.kind}:${input.primaryId}`, kind: input.kind, primary_id: input.primaryId,
    label: boundedDisplay(input.label, 180), detail: boundedDisplay(input.detail, 500), status: input.status, activity,
    activity_basis: input.activityBasis ?? persistedBasis(input.status, evidenceRefs), source_domain: input.sourceDomain,
    related_ids: unique(input.relatedIds ?? []), authority_chain: unique(input.authorityChain ?? []), context_fields: unique(input.contextFields ?? []),
    withheld_context_fields: unique(input.withheldContextFields ?? []), predecessor_hashes: unique(input.predecessorHashes ?? []),
    provider_health: input.providerHealth ?? null, output_hash: input.outputHash ?? null, reason_code: input.reasonCode ?? null,
    evidence_refs: evidenceRefs, trace_id: input.traceId ?? null, selectable_agent_id: input.selectableAgentId ?? null, updated_at: input.updatedAt ?? null
  };
}

function boundedDisplay(value: string, maximum: number): string { const normalized = value.trim(); return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 3)}...`; }

function evidenceFor(canonical: ControlPlaneCanonicalState, id: string | undefined): string[] {
  if (!id) return [];
  return canonical.evidence.events.filter((record) => record.event.subject?.id === id || record.identityChain.assignmentId === id || record.identityChain.runtimeId === id || record.identityChain.passportId === id || record.identityChain.durableAgentId === id || record.identityChain.mandateId === id).map((record) => record.event.event_id);
}
function enterpriseEvidence(canonical: ControlPlaneCanonicalState, kind: string, id: string): string[] { return canonical.enterprise.nodes.find((node) => node.kind === kind && node.node_id.replace(new RegExp(`^${kind}:`, 'u'), '') === id)?.evidence_refs ?? []; }
function relatedNodeIds(canonical: ControlPlaneCanonicalState, id: string): string[] { return canonical.enterprise.edges.filter((edge) => edge.from_node_id === id || edge.to_node_id === id).flatMap((edge) => [edge.from_node_id, edge.to_node_id]).filter((item) => item !== id); }
function connectorHealth(canonical: ControlPlaneCanonicalState, id: string): string { return canonical.enterprise.nodes.find((node) => node.kind === 'connector' && (node.node_id === `connector:${id}` || node.node_id.endsWith(`:${id}`)))?.status ?? canonical.agent_identity.providers.find((provider) => provider.id === id)?.availability ?? 'unavailable'; }
function traceForTask(canonical: ControlPlaneCanonicalState, taskId: string): string | null { return canonical.collaboration.workplace.assignments.find((item) => item.id === taskId)?.traceId ?? canonical.scenarios.runs.find((run) => run.steps.some((step) => step.assignmentId === taskId))?.traceId ?? canonical.context_broker.messages.find((message) => message.task_id === taskId)?.trace_id ?? null; }
function latestScenarioTrace(canonical: ControlPlaneCanonicalState, assignmentId?: string): string | undefined { return assignmentId ? [...canonical.scenarios.runs].reverse().find((run) => run.steps.some((step) => step.assignmentId === assignmentId))?.traceId : undefined; }
function outputHashForTrace(canonical: ControlPlaneCanonicalState, traceId?: string | null): string | null { return traceId ? canonical.enterprise.traces.find((trace) => trace.trace_id === traceId)?.references.output_hashes.at(-1) ?? null : null; }
function latestAssignment(canonical: ControlPlaneCanonicalState, agentId: string): WorkAssignmentSummary | undefined { return [...canonical.collaboration.workplace.assignments].reverse().find((item) => item.assigneeId === agentId); }
function scenarioReason(canonical: ControlPlaneCanonicalState, assignmentId?: string): string | null { return assignmentId ? [...canonical.scenarios.runs].reverse().flatMap((run) => run.steps).reverse().find((step) => step.assignmentId === assignmentId)?.reasonCode ?? null : null; }
function decisionReason(canonical: ControlPlaneCanonicalState, traceId?: string | null, agentId?: string): string | null { return [...canonical.mandates.decisions].reverse().find((decision) => (!traceId || decision.traceId === traceId) && (!agentId || decision.agentId === agentId))?.reasonCode ?? null; }
function activityReason(canonical: ControlPlaneCanonicalState, agentId: string): string | null { const item = [...canonical.collaboration.activity].reverse().find((entry) => entry.agentId === agentId && (entry.level === 'error' || entry.level === 'attention')); return item ? item.summary.toUpperCase().replace(/[^A-Z0-9]+/gu, '_').replace(/^_|_$/gu, '').slice(0, 200) : null; }
function latestFederationReason(canonical: ControlPlaneCanonicalState, peerId: string): string | null { return [...canonical.federation.receipts].reverse().find((receipt) => receipt.peer_id === peerId)?.reason_code ?? null; }

function agentStatus(canonicalAgent: AgentRuntimeSummary, assignment: WorkAssignmentSummary | undefined, runtimeState: string | undefined, reasonCode: string | null, outputHash: string | null, evidenceRefs: string[]): OfficeEntityStatus {
  if (runtimeState === 'revoked') return 'revoked';
  if (runtimeState === 'failed') return evidenceRefs.length > 0 ? 'failed' : 'warning';
  if (canonicalAgent.status === 'offline' || runtimeState === 'stopped') return 'offline';
  if (canonicalAgent.status === 'blocked' || assignment?.status === 'blocked') return reasonCode && evidenceRefs.length > 0 ? 'blocked' : 'warning';
  if (canonicalAgent.status === 'approval-required' || assignment?.status === 'approval') return 'waiting';
  if (canonicalAgent.status === 'working' || assignment?.status === 'active' || runtimeState === 'working') return 'working';
  if (assignment?.status === 'queued') return 'queued';
  if (assignment?.status === 'complete') return outputHash && evidenceRefs.length > 0 ? 'succeeded' : 'warning';
  return canonicalAgent.status === 'ready' ? 'ready' : 'idle';
}
function assignmentStatus(assignment: WorkAssignmentSummary, outputHash: string | null, evidenceRefs: string[], reasonCode: string | null): OfficeEntityStatus {
  if (assignment.status === 'queued') return 'queued';
  if (assignment.status === 'active') return 'working';
  if (assignment.status === 'approval') return 'waiting';
  if (assignment.status === 'blocked') return reasonCode && evidenceRefs.length > 0 ? 'blocked' : 'warning';
  return outputHash && evidenceRefs.length > 0 ? 'succeeded' : 'warning';
}
function approvalStatus(status: string): OfficeEntityStatus { if (status === 'pending') return 'waiting'; if (status === 'approved') return 'succeeded'; if (status === 'rejected' || status === 'invalidated' || status === 'withdrawn') return 'blocked'; return 'offline'; }
function normalizeLifecycle(status: string): OfficeEntityStatus { if (status === 'active' || status === 'available') return 'ready'; if (status === 'revoked') return 'revoked'; if (status === 'locked' || status === 'suspended') return 'blocked'; if (status === 'failed') return 'failed'; if (status === 'offline' || status === 'expired' || status === 'retired' || status === 'terminated') return 'offline'; return 'warning'; }
function providerStatus(status: string): OfficeEntityStatus { if (['ready', 'available', 'active-demo', 'adapter-ready'].includes(status)) return 'ready'; if (['working', 'connected'].includes(status)) return 'working'; if (['failed', 'blocked'].includes(status)) return 'failed'; if (['dependency-missing', 'authentication-required'].includes(status)) return 'waiting'; return 'offline'; }
function persistedActivity(status: OfficeEntityStatus, evidenceRefs: string[]): OfficeEntityActivity { if (status === 'succeeded' && evidenceRefs.length > 0) return 'persisted-success'; if ((status === 'blocked' || status === 'revoked') && evidenceRefs.length > 0) return 'persisted-denial'; if (status === 'failed' && evidenceRefs.length > 0) return 'persisted-failure'; if (status === 'working') return 'canonical-work'; if (status === 'waiting') return 'canonical-wait'; if (status === 'queued') return 'canonical-wait'; if (status === 'offline' || status === 'revoked') return 'inactive'; return 'decorative-idle'; }
function persistedBasis(status: OfficeEntityStatus, evidenceRefs: string[]): OfficeEntity['activity_basis'] { return ['succeeded', 'blocked', 'failed', 'revoked'].includes(status) && evidenceRefs.length > 0 ? 'persisted-evidence' : ['working', 'waiting', 'queued', 'warning', 'blocked', 'failed', 'revoked'].includes(status) ? 'canonical-state' : 'decorative'; }
function unique(values: Array<string | null | undefined>): string[] { return [...new Set(values.filter((value): value is string => Boolean(value)))]; }
function uniqueBy<T>(values: T[], key: (value: T) => string): T[] { const seen = new Set<string>(); return values.filter((value) => { const id = key(value); if (seen.has(id)) return false; seen.add(id); return true; }); }
