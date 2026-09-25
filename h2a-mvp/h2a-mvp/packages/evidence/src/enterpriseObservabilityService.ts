import {
  enterpriseOverviewStateSchema,
  type AgentIdentityState,
  type AuthorityApprovalState,
  type AuthorityEventRecord,
  type CollaborationState,
  type ContextBrokerState,
  type EnterpriseClaim,
  type EnterpriseEntityKind,
  type EnterpriseOverviewState,
  type EnterpriseRelationship,
  type EnterpriseTopologyEdge,
  type EnterpriseTopologyNode,
  type FederationState,
  type FrameworkConnectorState,
  type HumanIdentityV2State,
  type LiveRuntimeState,
  type MandateState,
  type OrganizationAuthorityState,
  type RuntimeTrustMode
} from '@h2a/contracts';
import type { EvidenceLedgerPort } from './index';

export interface EnterpriseObservationPorts {
  organization: { getState(): Promise<OrganizationAuthorityState> };
  humans: { getState(): Promise<HumanIdentityV2State> };
  agents: { getState(): Promise<AgentIdentityState> };
  collaboration: { getState(): Promise<CollaborationState> };
  mandates: { getState(): Promise<MandateState> };
  approvals: { getState(): Promise<AuthorityApprovalState> };
  context: { getState(): Promise<ContextBrokerState> };
  connectors: { getState(): Promise<FrameworkConnectorState> };
  live: { getState(): Promise<LiveRuntimeState> };
  federation: { getState(): Promise<FederationState> };
}

export class EnterpriseObservabilityService {
  public constructor(
    private readonly evidence: EvidenceLedgerPort,
    private readonly ports: EnterpriseObservationPorts,
    private readonly clock: () => Date = () => new Date()
  ) {}

  public async getState(): Promise<EnterpriseOverviewState> {
    const [organization, humans, agents, collaboration, mandates, approvals, context, connectors, live, federation, events, integrity] = await Promise.all([
      this.ports.organization.getState(), this.ports.humans.getState(), this.ports.agents.getState(), this.ports.collaboration.getState(),
      this.ports.mandates.getState(), this.ports.approvals.getState(), this.ports.context.getState(), this.ports.connectors.getState(),
      this.ports.live.getState(), this.ports.federation.getState(), this.evidence.list(), this.evidence.verify()
    ]);
    const nodes: EnterpriseTopologyNode[] = [];
    const edges: EnterpriseTopologyEdge[] = [];
    const refs = (value: string): string[] => events.filter((event) => event.subject?.id === value || JSON.stringify(event.payload).includes(value)).map((event) => event.event_id).slice(-100);
    const addNode = (kind: EnterpriseEntityKind, value: { id: string; label: string; detail: string; status: string; organizationId?: string; trustMode?: RuntimeTrustMode }): void => {
      const nodeId = entityId(kind, value.id);
      if (nodes.some((node) => node.node_id === nodeId)) return;
      nodes.push({ node_id: nodeId, kind, label: boundedDisplay(value.label, 180), detail: boundedDisplay(value.detail, 500), status: value.status, ...(value.organizationId ? { organization_id: value.organizationId } : {}), ...(value.trustMode ? { trust_mode: value.trustMode } : {}), evidence_refs: refs(value.id) });
    };
    const addEdge = (fromKind: EnterpriseEntityKind, fromId: string, toKind: EnterpriseEntityKind, toId: string, relationship: EnterpriseRelationship, status = 'active'): void => {
      const from = entityId(fromKind, fromId); const to = entityId(toKind, toId);
      if (!nodes.some((node) => node.node_id === from) || !nodes.some((node) => node.node_id === to)) return;
      const edgeId = `edge:${relationship}:${from}:${to}`;
      if (!edges.some((edge) => edge.edge_id === edgeId)) edges.push({ edge_id: edgeId, from_node_id: from, to_node_id: to, relationship, status, evidence_refs: unique([...refs(fromId), ...refs(toId)]).slice(-100) });
    };

    for (const item of organization.organizations) addNode('organization', { id: item.organization_id, label: item.name, detail: `Policy ${item.policy_version}`, status: item.status, organizationId: item.organization_id });
    for (const item of humans.identities) addNode('human', { id: item.human_id, label: item.display_name, detail: item.active_membership_id ?? 'No active membership', status: item.status, organizationId: item.organization_id });
    for (const item of organization.memberships) addNode('membership', { id: item.membership_id, label: item.employee_id, detail: `${item.department} / ${item.role_ids.join(', ') || 'no role'}`, status: item.status, organizationId: item.organization_id });
    for (const item of organization.credentials) addNode('authority-credential', { id: item.credential_id, label: item.credential_id, detail: item.role_ids.join(', '), status: item.status, organizationId: item.organization_id });
    for (const item of humans.active_proofs) addNode('human-proof', { id: item.human_proof_id, label: item.purpose, detail: `${item.assurance_level} / ${item.matched_record_count} records`, status: new Date(item.expires_at).getTime() > this.clock().getTime() ? 'active' : 'expired', organizationId: item.organization_id });
    for (const item of collaboration.workplace.agents) addNode('agent', { id: item.id, label: item.name, detail: `${item.role} / ${item.provider}`, status: item.status });
    for (const item of agents.passportsV2 ?? []) addNode('passport', { id: item.passport_id, label: item.name, detail: `${item.role} / ${item.risk_tier}`, status: item.status, organizationId: item.organization_id });
    for (const item of agents.bindings) addNode('runtime', { id: item.binding_id, label: `${item.provider} binding`, detail: `${item.model} / ${item.connection_state}`, status: item.status });
    for (const item of agents.attestations ?? []) addNode('runtime', { id: item.attestation_id, label: `${item.provider} attestation`, detail: `${item.connector_manifest_id} / ${item.adapter_version}`, status: new Date(item.expires_at).getTime() > this.clock().getTime() ? 'active' : 'expired', trustMode: item.trust_mode });
    for (const item of agents.runtimeSessions ?? []) addNode('runtime', { id: item.runtime_session_id, label: item.provider_session_ref ?? item.runtime_session_id, detail: `${item.connector_manifest_id} / ${item.runtime_attestation_id}`, status: item.state, trustMode: item.trust_mode });
    for (const item of mandates.mandates) addNode('mandate', { id: item.mandateId, label: item.objective, detail: `${item.subject.agentId} / depth ${item.depth}`, status: item.status });
    for (const item of connectors.declarations) addNode('connector', { id: item.connector_id, label: item.name, detail: `${item.protocol} / ${item.endpoint_policy}`, status: item.health, trustMode: item.trust_ceiling });
    for (const item of connectors.protocol.connectors) addNode('connector', { id: item.manifest.connector_manifest_id, label: item.manifest.name, detail: `${item.manifest.provider} / ${item.manifest.protocol}`, status: item.health, trustMode: item.manifest.trust_ceiling });
    for (const item of context.grants) addNode('context-grant', { id: item.grant.context_grant_id, label: item.grant.purpose, detail: `${item.grant.allowed_fields.length} fields / ${item.grant.recipient_agent_id}`, status: item.status, organizationId: item.grant.organization_id });
    for (const item of approvals.requests) addNode('approval', { id: item.approval_request_id, label: `${item.required_resource}:${item.required_action}`, detail: `${item.eligible_membership_ids.length} eligible / ${item.approval_policy_id}`, status: item.status, organizationId: item.organization_id });
    if (federation.local_node) addNode('federation-node', { id: federation.local_node.node_id, label: federation.local_node.display_name, detail: federation.local_node.endpoint_policy, status: federation.local_node.status, organizationId: federation.local_node.organization_id });
    for (const peer of federation.peers) addNode('federation-node', { id: peer.remote_node.node_id, label: peer.remote_node.display_name, detail: `${peer.capabilities.length} capabilities / ${peer.maximum_context_fields} fields`, status: peer.status, organizationId: peer.remote_node.organization_id });
    for (const run of live.runs) addNode('live-run', { id: run.run_id, label: `${run.provider} process`, detail: run.termination_reason ?? run.trace_id, status: run.status, trustMode: run.trust_mode });
    for (const hash of collectOutputHashes(events, approvals, connectors)) addNode('output', { id: hash, label: 'Minimized output', detail: hash, status: 'recorded' });

    for (const item of humans.identities) { addEdge('organization', item.organization_id, 'human', item.human_id, 'contains', item.status); if (item.active_membership_id) addEdge('human', item.human_id, 'membership', item.active_membership_id, 'member-of', item.status); }
    for (const item of organization.credentials) addEdge('membership', item.membership_id, 'authority-credential', item.credential_id, 'authorized-by', item.status);
    for (const item of humans.active_proofs) addEdge('human', item.human_id, 'human-proof', item.human_proof_id, 'proves', 'active');
    for (const item of agents.passportsV2 ?? []) { addEdge('human', item.sponsor_human_id, 'passport', item.passport_id, 'sponsors', item.status); addEdge('agent', item.agent_id, 'passport', item.passport_id, 'identifies', item.status); addEdge('membership', item.sponsor_membership_id, 'passport', item.passport_id, 'authorized-by', item.status); addEdge('authority-credential', item.issuance_authority_credential_id, 'passport', item.passport_id, 'authorized-by', item.status); }
    for (const item of agents.runtimeSessions ?? []) { const passport = (agents.passportsV2 ?? []).find((value) => value.passport_id === item.passport_id); if (passport) addEdge('passport', item.passport_id, 'runtime', item.runtime_session_id, 'runs-as', item.state); addEdge('runtime', item.runtime_session_id, 'connector', item.connector_manifest_id, 'connects-through', item.state); }
    for (const item of agents.attestations ?? []) { addEdge('passport', item.passport_id, 'runtime', item.attestation_id, 'runs-as', 'active'); addEdge('runtime', item.attestation_id, 'connector', item.connector_manifest_id, 'connects-through', 'active'); }
    for (const item of mandates.mandates) { addEdge('agent', item.subject.agentId, 'mandate', item.mandateId, 'authorized-by', item.status); addEdge('passport', item.subject.passportId, 'mandate', item.mandateId, 'authorized-by', item.status); addEdge('human', item.issuer.humanId, 'mandate', item.mandateId, 'authorized-by', item.status); }
    for (const item of context.grants) { addEdge('agent', item.grant.recipient_agent_id, 'context-grant', item.grant.context_grant_id, 'bounded-by', item.status); addEdge('passport', item.grant.recipient_passport_id, 'context-grant', item.grant.context_grant_id, 'bounded-by', item.status); addEdge('mandate', item.grant.mandate_id, 'context-grant', item.grant.context_grant_id, 'bounded-by', item.status); }
    for (const item of approvals.requests) { addEdge('human', item.requesting_human_id, 'approval', item.approval_request_id, 'authorized-by', item.status); addEdge('agent', item.requesting_agent_id, 'approval', item.approval_request_id, 'authorized-by', item.status); addEdge('mandate', item.mandate_id, 'approval', item.approval_request_id, 'authorized-by', item.status); addEdge('context-grant', item.review_context_grant_id, 'approval', item.approval_request_id, 'bounded-by', item.status); }
    for (const decision of approvals.decisions) addEdge('membership', decision.approver_membership_id, 'approval', decision.approval_request_id, 'approved-by', decision.decision);
    if (federation.local_node) for (const peer of federation.peers) addEdge('federation-node', federation.local_node.node_id, 'federation-node', peer.remote_node.node_id, 'federated-with', peer.status);
    for (const run of live.runs) { addEdge('runtime', run.runtime_session_id, 'live-run', run.run_id, 'executed', run.status); for (const hash of outputHashesForTrace(events, run.trace_id)) addEdge('live-run', run.run_id, 'output', hash, 'produced', run.status); }
    for (const step of connectors.collaboration_runs.flatMap((run) => run.steps)) if (step.output_hash) addEdge('connector', step.connector_manifest_id, 'output', step.output_hash, 'produced', step.status);

    const nodeIds = new Set(nodes.map((node) => node.node_id));
    const traces = resolveTraces(events, integrity.status, nodeIds);
    const trustModes = { unverified: 0, 'connected-observed': 0, governed: 0, 'external-attested': 0 };
    for (const node of nodes) if (node.trust_mode) trustModes[node.trust_mode] += 1;
    return enterpriseOverviewStateSchema.parse({
      schema_version: 2, generated_at: this.clock().toISOString(),
      posture: {
        organizations: organization.organizations.filter((item) => item.status === 'active').length,
        active_humans: humans.identities.filter((item) => item.status === 'active').length,
        active_credentials: organization.credentials.filter((item) => item.status === 'active').length,
        active_agents: (agents.passportsV2 ?? []).filter((item) => item.status === 'active').length,
        active_context_grants: context.grants.filter((item) => item.status === 'active').length,
        pending_approvals: approvals.requests.filter((item) => item.status === 'pending').length,
        active_federation_peers: federation.peers.filter((item) => item.status === 'active').length,
        healthy_connectors: connectors.declarations.filter((item) => item.health === 'ready').length,
        live_processes: live.runs.filter((item) => ['starting', 'running'].includes(item.status)).length,
        trust_modes: trustModes, evidence_integrity: integrity.status, evidence_records: integrity.recordCount
      },
      nodes, edges, traces, replacement_seams: replacementSeams(), claims: claims(events)
    });
  }
}

function entityId(kind: EnterpriseEntityKind, id: string): string { return `${kind}:${id}`; }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function boundedDisplay(value: string, maximum: number): string { const normalized = value.trim(); return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 3)}...`; }

const referenceAliases = {
  human_ids: ['human_id', 'requesting_human_id', 'issuer_human_id', 'sponsor_human_id'], membership_ids: ['membership_id', 'requesting_membership_id', 'approver_membership_id', 'issuer_membership_id', 'sponsor_membership_id'],
  authority_credential_ids: ['authority_credential_id', 'issuer_authority_credential_id', 'issuance_authority_credential_id'], human_proof_ids: ['human_proof_id', 'issuer_human_proof_id', 'issuance_human_proof_id'],
  passport_ids: ['passport_id', 'recipient_passport_id', 'sender_passport_id'], runtime_ids: ['runtime_id', 'binding_id', 'runtime_session_id', 'runtime_attestation_id', 'attestation_id'],
  mandate_ids: ['mandate_id', 'child_mandate_id', 'parent_mandate_id'], context_grant_ids: ['context_grant_id', 'review_context_grant_id'], approval_ids: ['approval_request_id', 'approval_id'],
  connector_ids: ['connector_id', 'connector_manifest_id', 'sender_connector_manifest_id', 'recipient_connector_manifest_id'], federation_node_ids: ['node_id', 'sender_node_id', 'recipient_node_id', 'remote_node_id', 'local_node_id'],
  live_run_ids: ['run_id'], output_hashes: ['output_hash', 'result_hash']
} as const;

function resolveTraces(events: AuthorityEventRecord[], integrity: 'verified' | 'warning' | 'failed', nodeIds: Set<string>): EnterpriseOverviewState['traces'] {
  const groups = new Map<string, AuthorityEventRecord[]>();
  for (const event of events) groups.set(event.trace_id, [...(groups.get(event.trace_id) ?? []), event]);
  return [...groups.entries()].map(([traceId, records]) => {
    const references = Object.fromEntries(Object.entries(referenceAliases).map(([name, aliases]) => [name, collectValues(records.map((record) => record.payload), aliases)])) as EnterpriseOverviewState['traces'][number]['references'];
    for (const record of records) { if (record.actor.type === 'human') references.human_ids = unique([...references.human_ids, record.actor.id]); }
    const missing: EnterpriseOverviewState['traces'][number]['missing_links'] = [];
    const mappings: Array<[keyof typeof references, EnterpriseEntityKind, EnterpriseOverviewState['traces'][number]['missing_links'][number]]> = [
      ['human_ids', 'human', 'human'], ['membership_ids', 'membership', 'membership'], ['authority_credential_ids', 'authority-credential', 'authority-credential'], ['human_proof_ids', 'human-proof', 'human-proof'],
      ['passport_ids', 'passport', 'passport'], ['runtime_ids', 'runtime', 'runtime'], ['mandate_ids', 'mandate', 'mandate'], ['context_grant_ids', 'context-grant', 'context-grant'], ['approval_ids', 'approval', 'approval'],
      ['connector_ids', 'connector', 'connector'], ['federation_node_ids', 'federation-node', 'federation-node'], ['output_hashes', 'output', 'output']
    ];
    for (const [field, kind, label] of mappings) if (references[field].length && references[field].some((id) => !nodeIds.has(entityId(kind, id)))) missing.push(label);
    const hasAuthority = Object.values(references).some((values) => values.length > 0);
    return {
      trace_id: traceId, started_at: records[0]!.timestamp, updated_at: records.at(-1)!.timestamp, event_count: records.length,
      actor_ids: unique(records.map((record) => record.actor.id)), subject_ids: unique(records.flatMap((record) => record.subject ? [record.subject.id] : [])), event_types: unique(records.map((record) => record.event_type)), references,
      resolution_status: !hasAuthority ? 'not-applicable' as const : missing.length ? 'partial' as const : 'complete' as const, missing_links: unique(missing), integrity_status: integrity
    };
  }).sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function collectValues(values: unknown[], aliases: readonly string[]): string[] {
  const found: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (aliases.includes(key) && typeof nested === 'string') found.push(nested);
      else if (aliases.includes(key) && Array.isArray(nested)) found.push(...nested.filter((item): item is string => typeof item === 'string'));
      visit(nested);
    }
  };
  values.forEach(visit); return unique(found);
}

function collectOutputHashes(events: AuthorityEventRecord[], approvals: AuthorityApprovalState, connectors: FrameworkConnectorState): string[] {
  return unique([...collectValues(events.map((event) => event.payload), referenceAliases.output_hashes), ...approvals.resumes.flatMap((item) => item.output_hash ? [item.output_hash] : []), ...connectors.collaboration_runs.flatMap((run) => run.steps.flatMap((step) => step.output_hash ? [step.output_hash] : []))]);
}
function outputHashesForTrace(events: AuthorityEventRecord[], traceId: string): string[] { return collectValues(events.filter((event) => event.trace_id === traceId).map((event) => event.payload), referenceAliases.output_hashes); }

function claims(events: AuthorityEventRecord[]): EnterpriseClaim[] {
  const count = (types: string[]): number => events.filter((event) => types.includes(event.event_type)).length;
  const define = (claim_id: string, claim: string, status: EnterpriseClaim['status'], evidence_event_types: string[], challenge: string): EnterpriseClaim => ({ claim_id, claim, status, evidence_event_types, matching_event_count: count(evidence_event_types), challenge });
  return [
    define('claim_human_bound', 'Protected agent authority resolves to a verified human and organization membership.', 'verified', ['HUMAN_VERIFIED_V2', 'AGENT_PASSPORT_V2_ISSUED', 'HUMAN_AUTHORITY_ALLOWED'], 'Challenge by selecting a protected trace and verify Human Proof, membership, credential, Passport, runtime, and mandate links.'),
    define('claim_least_context', 'Agents receive only purpose-bound Context Grant fields.', 'verified', ['CONTEXT_GRANT_ISSUED', 'CONTEXT_DISCLOSURE_AUTHORIZED', 'CONTEXT_DISCLOSURE_DENIED'], 'Challenge with an unauthorized field or recipient and inspect the denial and absence of plaintext in export.'),
    define('claim_approval', 'Missing authority pauses and resumes only after eligible purpose-bound human approval.', 'verified', ['AUTHORITY_ESCALATION_REQUESTED', 'APPROVAL_DECISION_SIGNED', 'APPROVED_ACTION_RESUMED'], 'Challenge separation of duty, proof purpose, quorum, expiry, and exact-once resume.'),
    define('claim_provider_control', 'Host provider processes are supervised and attributable but not container-governed.', 'connected-observed', ['LIVE_RUNTIME_STARTED', 'LIVE_RUNTIME_SUCCEEDED', 'LIVE_RUNTIME_CANCELLED', 'LIVE_RUNTIME_TIMED_OUT', 'LIVE_RUNTIME_REVOKED'], 'Challenge cancellation, timeout, or revocation; do not interpret host authentication as governed containment.'),
    define('claim_federation', 'Friend nodes exchange signed bounded envelopes through pinned identities.', 'verified', ['FEDERATION_PEER_ACTIVATED', 'FEDERATION_ENVELOPE_ACCEPTED', 'FEDERATION_ENVELOPE_REJECTED'], 'Challenge the TLS/key pin, organization binding, sequence, nonce, capability, and context limits.'),
    define('claim_backend', 'Local repositories expose typed replacement seams for enterprise services.', 'boundary', [], 'Replace ports with MongoDB, KMS/HSM, IdP, or Bedrock adapters; no backend deployment is claimed.'),
    define('claim_biometric_accuracy', 'Production biometric FAR/FRR is not claimed from the local demonstration.', 'deferred', ['HUMAN_VERIFIED_V2'], 'Require licensed models, multiple genuine/impostor participants, and measured calibration before a production accuracy claim.')
  ];
}

function replacementSeams(): EnterpriseOverviewState['replacement_seams'] {
  return [
    { seam_id: 'seam_storage', boundary: 'Persistence', local_implementation: 'Atomic JSON/JSONL repositories', replacement_target: 'MongoDB, DynamoDB, or organization data service', contract: 'VersionedJsonRepository and domain state ports', readiness: 'ready' },
    { seam_id: 'seam_secrets', boundary: 'Key and secret custody', local_implementation: 'Electron safeStorage protector ports', replacement_target: 'AWS KMS, CloudHSM, or enterprise vault', contract: 'protector seal/open and provider secret store', readiness: 'ready' },
    { seam_id: 'seam_identity', boundary: 'Workforce identity', local_implementation: 'Local Human Identity V2 and membership registry', replacement_target: 'Enterprise IdP, HRIS, SCIM, and WebAuthn', contract: 'Human identity and Organization Authority state ports', readiness: 'partial' },
    { seam_id: 'seam_biometrics', boundary: 'Biometric verification', local_implementation: 'Local face/liveness/distance/BCH provider', replacement_target: 'Licensed biometric provider or enterprise authenticator', contract: 'Biometric provider and Human Proof contracts', readiness: 'ready' },
    { seam_id: 'seam_runtime', boundary: 'Agent execution', local_implementation: 'Supervised local CLI and framework connectors', replacement_target: 'H2A Gateway, container workers, or AWS Bedrock', contract: 'runtime adapter and signed connector protocol', readiness: 'partial' },
    { seam_id: 'seam_federation', boundary: 'Node transport', local_implementation: 'Pinned loopback HTTP/HTTPS federation', replacement_target: 'Managed mTLS gateway and public node registry', contract: 'Federation V2 envelopes and transport ports', readiness: 'partial' },
    { seam_id: 'seam_evidence', boundary: 'Audit and retention', local_implementation: 'Hash-linked local authority ledger', replacement_target: 'Enterprise SIEM, immutable object retention, and compliance archive', contract: 'EvidenceLedgerPort and minimized V2 export', readiness: 'ready' }
  ];
}
