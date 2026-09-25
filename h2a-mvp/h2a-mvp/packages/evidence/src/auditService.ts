import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  agentPassportSchema,
  agentRuntimeBindingSchema,
  approvalRequestSchema,
  assignmentResponseSchema,
  auditControlSchema,
  authorizationResultSchema,
  biometricEnrollmentSchema,
  collaborationMessageSchema,
  delegationEdgeSchema,
  evidenceExplorerStateSchema,
  evidenceExportReceiptSchema,
  evidenceQuerySchema,
  humanIdentitySchema,
  humanProofAttemptSchema,
  humanProofSchema,
  mandateSchema,
  scenarioRunSchema,
  type AgentPassport,
  type AgentRuntimeBinding,
  type ApprovalRequest,
  type AssignmentResponse,
  type AuditControl,
  type AuthorizationResult,
  type AuthorityEventRecord,
  type BiometricEnrollment,
  type CollaborationMessage,
  type DelegationEdge,
  type EvidenceExplorerState,
  type EvidenceExportReceipt,
  type EvidenceIdentityChain,
  type EvidenceInvestigationRecord,
  type EvidenceQuery,
  type EnterpriseOverviewState,
  type HumanIdentity,
  type HumanProof,
  type HumanProofAttempt,
  type Mandate,
  type ScenarioRun,
  type WorkAssignmentSummary
} from '@h2a/contracts';
import { AtomicFileStore, LocalJsonlRepository, VersionedJsonRepository, type WorkplaceRepository } from '@h2a/storage';
import { hashCanonical, type EvidenceLedgerPort } from './index';

const protectedEvents = new Set([
  'ACTION_REQUESTED', 'POLICY_ALLOWED', 'POLICY_DENIED', 'HUMAN_APPROVAL_REQUIRED',
  'HUMAN_APPROVED', 'HUMAN_REJECTED', 'RUNTIME_EXECUTION_STARTED',
  'RUNTIME_EXECUTION_FAILED', 'RUNTIME_EXECUTION_TIMED_OUT', 'ACTION_EXECUTED'
]);

export const auditControls: AuditControl[] = z.array(auditControlSchema).parse([
  { controlId: 'CTRL_ATTRIBUTION', title: 'Human-to-agent attribution', securityObjective: 'attribution', implementation: 'Signed Human Proof, organization membership, authority credential, Passport V2, runtime session, mandate, and decision records resolve into one investigation topology.', evidenceEventTypes: ['HUMAN_VERIFIED_V2', 'AUTHORITY_CREDENTIAL_ISSUED', 'AGENT_PASSPORT_V2_ISSUED', 'RUNTIME_ATTESTED', 'ACTION_REQUESTED'], verification: 'Phase 21 complete/partial trace tests and Evidence Explorer V2 topology.', status: 'implemented' },
  { controlId: 'CTRL_ORGANIZATION_AUTHORITY', title: 'Organization-scoped human authority', securityObjective: 'least-privilege', implementation: 'Active memberships, scoped roles, signed authority credentials, lifecycle, and policy binding gate protected human operations.', evidenceEventTypes: ['MEMBERSHIP_JOINED', 'AUTHORITY_CREDENTIAL_ISSUED', 'HUMAN_AUTHORITY_ALLOWED', 'HUMAN_AUTHORITY_DENIED'], verification: 'Organization authority policy tests and Employee Authority view.', status: 'implemented' },
  { controlId: 'CTRL_LEAST_PRIVILEGE', title: 'Deterministic least privilege', securityObjective: 'least-privilege', implementation: 'Every protected action is evaluated against signed mandate scope, limits, disclosure, lifecycle, and subject identity.', evidenceEventTypes: ['POLICY_ALLOWED', 'POLICY_DENIED', 'CONTEXT_DISCLOSED'], verification: 'Mandate policy matrix and governed scenario tests.', status: 'implemented' },
  { controlId: 'CTRL_DELEGATION', title: 'Bounded delegation', securityObjective: 'least-privilege', implementation: 'Child authority must remain equal to or narrower than its parent and ancestry is reconstructed from persisted edges.', evidenceEventTypes: ['DELEGATION_CREATED', 'DELEGATION_DENIED'], verification: 'Negative attenuation tests and visible delegation ancestry.', status: 'implemented' },
  { controlId: 'CTRL_HUMAN_OVERSIGHT', title: 'Human oversight and quorum', securityObjective: 'human-oversight', implementation: 'Sensitive actions pause, route only to eligible independent employees, require exact-purpose Human Proof and quorum, then resume exactly once under a narrow mandate.', evidenceEventTypes: ['AUTHORITY_ESCALATION_REQUESTED', 'APPROVAL_ROUTED', 'APPROVAL_DECISION_SIGNED', 'APPROVAL_QUORUM_REACHED', 'APPROVED_ACTION_RESUMED'], verification: 'Multi-human approval suite, Authority Inbox, and enterprise trace coverage.', status: 'implemented' },
  { controlId: 'CTRL_CONTAINMENT', title: 'Revocation containment', securityObjective: 'containment', implementation: 'Root revocation invalidates descendants, pending approvals, bound runtimes, and affected work.', evidenceEventTypes: ['MANDATE_REVOKED', 'POLICY_DENIED'], verification: 'Cascade revocation tests and revoked scenario path.', status: 'implemented' },
  { controlId: 'CTRL_CONTEXT_MINIMIZATION', title: 'Purpose-bound context minimization', securityObjective: 'privacy', implementation: 'Context Grants bind recipient, task, mandate, purpose, fields, transformations, budget, use, expiry, and revocation before disclosure.', evidenceEventTypes: ['CONTEXT_GRANT_ISSUED', 'CONTEXT_DISCLOSURE_AUTHORIZED', 'CONTEXT_DISCLOSURE_DENIED', 'GOVERNED_MESSAGE_REJECTED'], verification: 'Context Broker leakage suite and Context Grant trace resolution.', status: 'implemented' },
  { controlId: 'CTRL_PRIVACY', title: 'Evidence data minimization', securityObjective: 'privacy', implementation: 'Authority evidence and Evidence V2 exports retain identifiers, classifications, status, and hashes while excluding biometric secrets, private keys, credentials, prompts, context values, commands, paths, and response bodies.', evidenceEventTypes: ['WORK_MESSAGE_SENT', 'WORK_RESPONSE_RECORDED', 'CONTEXT_DISCLOSED', 'AUDIT_BUNDLE_EXPORTED'], verification: 'Phase 21 V2 export privacy test and protected-repository separation tests.', status: 'implemented' },
  { controlId: 'CTRL_INTEGRITY', title: 'Tamper-evident local ledger', securityObjective: 'integrity', implementation: 'Canonical SHA-256 event hashes and previous-hash links are verified before append and surfaced with exact failure location.', evidenceEventTypes: ['AUDIT_BUNDLE_EXPORTED'], verification: 'Payload mutation test, chain verification report, and export manifest hash.', status: 'implemented' },
  { controlId: 'CTRL_SECRETS', title: 'Trusted-process secret isolation', securityObjective: 'secret-isolation', implementation: 'Signing keys, workload private keys, biometric helper data, provider credentials, and protected context values never enter enterprise topology, audit export, or renderer IPC.', evidenceEventTypes: ['AGENT_PASSPORT_V2_ISSUED', 'BIOMETRIC_ENROLLED_V2', 'CONTEXT_ARTIFACT_CREATED'], verification: 'Renderer boundary scan, protected-store tests, and Evidence V2 negative assertions.', status: 'implemented' },
  { controlId: 'CTRL_RUNTIME_TRUST', title: 'Truthful runtime trust', securityObjective: 'containment', implementation: 'Runtime sessions, connectors, and live runs expose enforced trust ceilings; host CLI execution remains connected-observed until isolation is proven.', evidenceEventTypes: ['RUNTIME_ATTESTED', 'LIVE_RUNTIME_STARTED', 'LIVE_RUNTIME_REVOKED'], verification: 'Process Supervisor lifecycle tests and Command Floor trust posture.', status: 'implemented' },
  { controlId: 'CTRL_FEDERATION', title: 'Pinned bounded federation', securityObjective: 'integrity', implementation: 'Independent node identities, key/TLS pins, signed envelopes, capability/context attenuation, expiry, nonce, sequence, and revocation govern friend-node traffic.', evidenceEventTypes: ['FEDERATION_PEER_ACTIVATED', 'FEDERATION_ENVELOPE_ACCEPTED', 'FEDERATION_ENVELOPE_REJECTED', 'FEDERATION_PEER_REVOKED'], verification: 'Two-node TLS, replay, forgery, scope, and restart tests plus topology inspection.', status: 'implemented' },
  { controlId: 'CTRL_EVIDENCE_V2', title: 'Cross-domain evidence resolution', securityObjective: 'integrity', implementation: 'Persisted traces resolve across humans, authority, Passports, runtime sessions, connectors, Context Grants, approvals, federation nodes, live runs, and output hashes without inventing missing entities.', evidenceEventTypes: ['ACTION_EXECUTED', 'AUDIT_BUNDLE_EXPORTED'], verification: 'Phase 21 complete/partial resolver tests, claim challenge matrix, and minimized V2 export.', status: 'implemented' },
  { controlId: 'CTRL_PORTABILITY', title: 'Provider and backend portability', securityObjective: 'portability', implementation: 'Provider-neutral runtime, repository, protector, identity, federation, and evidence ports expose named replacement seams for CLI, Bedrock, API, MongoDB, KMS/HSM, IdP, and SIEM integrations.', evidenceEventTypes: ['RUNTIME_EXECUTION_STARTED', 'LIVE_RUNTIME_STARTED'], verification: 'Adapter contracts and Enterprise topology replacement-seam inventory.', status: 'boundary' }
]);

interface AuditSnapshot {
  identities: HumanIdentity[];
  proofs: HumanProof[];
  enrollments: BiometricEnrollment[];
  attempts: HumanProofAttempt[];
  passports: AgentPassport[];
  bindings: AgentRuntimeBinding[];
  mandates: Mandate[];
  delegations: DelegationEdge[];
  approvals: ApprovalRequest[];
  decisions: AuthorizationResult[];
  assignments: WorkAssignmentSummary[];
  messages: CollaborationMessage[];
  responses: AssignmentResponse[];
  scenarios: ScenarioRun[];
}

export interface EnterpriseOverviewProvider {
  getState(): Promise<EnterpriseOverviewState>;
}

export class EvidenceAuditService {
  private readonly store: AtomicFileStore;
  private readonly identities: VersionedJsonRepository<'h2a.humans.identities', HumanIdentity[]>;
  private readonly proofs: VersionedJsonRepository<'h2a.human-proof.proofs', HumanProof[]>;
  private readonly passports: VersionedJsonRepository<'h2a.agents.passports', AgentPassport[]>;
  private readonly bindings: VersionedJsonRepository<'h2a.agents.runtime-bindings', AgentRuntimeBinding[]>;
  private readonly mandates: VersionedJsonRepository<'h2a.mandates.registry', Mandate[]>;
  private readonly delegations: VersionedJsonRepository<'h2a.mandates.delegations', DelegationEdge[]>;
  private readonly approvals: VersionedJsonRepository<'h2a.mandates.approvals', ApprovalRequest[]>;
  private readonly scenarios: VersionedJsonRepository<'h2a.scenarios.runs', ScenarioRun[]>;
  private readonly enrollments: VersionedJsonRepository<'h2a.biometrics.enrollments', BiometricEnrollment[]>;
  private readonly attempts: VersionedJsonRepository<'h2a.human-proof.attempts', HumanProofAttempt[]>;
  private readonly decisions: LocalJsonlRepository<AuthorizationResult>;
  private readonly messages: LocalJsonlRepository<CollaborationMessage>;
  private readonly responses: LocalJsonlRepository<AssignmentResponse>;
  private operationQueue: Promise<void> = Promise.resolve();
  private enterpriseOverview: EnterpriseOverviewProvider | undefined;

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly workplace: WorkplaceRepository,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.store = new AtomicFileStore(dataPath);
    const initial = { initialData: [], clock };
    this.identities = new VersionedJsonRepository(this.store, 'humans/identities.json', 'h2a.humans.identities', z.array(humanIdentitySchema), initial);
    this.proofs = new VersionedJsonRepository(this.store, 'human-proofs/proofs.json', 'h2a.human-proof.proofs', z.array(humanProofSchema), initial);
    this.passports = new VersionedJsonRepository(this.store, 'passports/registry.json', 'h2a.agents.passports', z.array(agentPassportSchema), initial);
    this.bindings = new VersionedJsonRepository(this.store, 'workplace/runtime-bindings.json', 'h2a.agents.runtime-bindings', z.array(agentRuntimeBindingSchema), initial);
    this.mandates = new VersionedJsonRepository(this.store, 'mandates/registry.json', 'h2a.mandates.registry', z.array(mandateSchema), initial);
    this.delegations = new VersionedJsonRepository(this.store, 'mandates/delegations.json', 'h2a.mandates.delegations', z.array(delegationEdgeSchema), initial);
    this.approvals = new VersionedJsonRepository(this.store, 'mandates/approvals.json', 'h2a.mandates.approvals', z.array(approvalRequestSchema), initial);
    this.scenarios = new VersionedJsonRepository(this.store, 'scenarios/runs.json', 'h2a.scenarios.runs', z.array(scenarioRunSchema), initial);
    this.enrollments = new VersionedJsonRepository(this.store, 'biometric-enrollments/enrollments.json', 'h2a.biometrics.enrollments', z.array(biometricEnrollmentSchema), initial);
    this.attempts = new VersionedJsonRepository(this.store, 'human-proof-attempts/attempts.json', 'h2a.human-proof.attempts', z.array(humanProofAttemptSchema), initial);
    this.decisions = new LocalJsonlRepository(this.store, 'mandates/decisions.jsonl', authorizationResultSchema);
    this.messages = new LocalJsonlRepository(this.store, 'workplace/messages.jsonl', collaborationMessageSchema);
    this.responses = new LocalJsonlRepository(this.store, 'workplace/responses.jsonl', assignmentResponseSchema);
  }

  public async initialize(): Promise<EvidenceExplorerState> {
    return this.getState(evidenceQuerySchema.parse({}));
  }

  public setEnterpriseOverviewProvider(provider: EnterpriseOverviewProvider): void {
    this.enterpriseOverview = provider;
  }

  public getState(query: EvidenceQuery): Promise<EvidenceExplorerState> {
    return this.serialize(() => this.getStateUnlocked(evidenceQuerySchema.parse(query)));
  }

  public exportBundle(query: EvidenceQuery): Promise<EvidenceExportReceipt> {
    return this.serialize(async () => {
      const input = evidenceQuerySchema.parse(query);
      const [state, snapshot, enterprise] = await Promise.all([this.getStateUnlocked(input), this.readSnapshot(), this.enterpriseOverview?.getState()]);
      const exportId = `exp_${randomUUID()}`;
      const createdAt = this.clock().toISOString();
      const relativePath = `exports/h2a-audit-${createdAt.replace(/[:.]/gu, '-')}.json`;
      const content = {
        schemaVersion: enterprise ? 2 : 1,
        kind: enterprise ? 'h2a.audit.bundle.v2' : 'h2a.audit.bundle',
        exportId,
        createdAt,
        privacyProfile: enterprise ? 'audit-minimized-v2' : 'audit-minimized-v1',
        sourceIntegrity: state.integrity,
        query: input,
        controls: state.controls,
        investigations: state.events,
        entities: minimizedEntities(snapshot),
        ...(enterprise ? { enterprise } : {})
      };
      const bundleHash = hashCanonical(content);
      await this.store.write(relativePath, `${JSON.stringify({ ...content, bundleHash }, null, 2)}\n`);
      const receipt = evidenceExportReceiptSchema.parse({ exportId, relativePath, createdAt, sourceHeadHash: state.integrity.headHash, bundleHash, eventCount: state.events.length, privacyProfile: enterprise ? 'audit-minimized-v2' : 'audit-minimized-v1' });
      if (state.integrity.status === 'verified') {
        await this.evidence.append({ trace_id: `tr_audit_${exportId}`, actor: { type: 'system', id: 'h2a-audit' }, subject: { type: 'outcome', id: exportId }, event_type: 'AUDIT_BUNDLE_EXPORTED', payload: { relative_path: relativePath, bundle_hash: bundleHash, event_count: state.events.length, source_head_hash: state.integrity.headHash, privacy_profile: receipt.privacyProfile } });
      }
      return receipt;
    });
  }

  private async getStateUnlocked(query: EvidenceQuery): Promise<EvidenceExplorerState> {
    const [records, verification, snapshot] = await Promise.all([this.evidence.list(), this.evidence.verify(), this.readSnapshot()]);
    const investigations = records.map((event) => investigate(event, snapshot, verification.status === 'verified' ? 'verified' : event.event_id === verification.failedEventId ? 'failed' : 'warning'));
    const availableEventTypes = [...new Set(records.map((event) => event.event_type))].sort();
    const availableReasonCodes = [...new Set(investigations.flatMap((item) => item.decision ? [item.decision.reasonCode] : []))].sort();
    const filtered = investigations.filter((item) => matchesQuery(item, query));
    return evidenceExplorerStateSchema.parse({
      generatedAt: this.clock().toISOString(),
      integrity: verification,
      totalEvents: records.length,
      matchedEvents: filtered.length,
      events: filtered.sort((left, right) => right.event.timestamp.localeCompare(left.event.timestamp)).slice(0, query.limit),
      availableEventTypes,
      availableReasonCodes,
      controls: auditControls
    });
  }

  private async readSnapshot(): Promise<AuditSnapshot> {
    const [identities, proofs, passports, bindings, mandates, delegations, approvals, decisions, workplace, messages, responses, scenarios, enrollments, attempts] = await Promise.all([
      this.identities.read(), this.proofs.read(), this.passports.read(), this.bindings.read(), this.mandates.read(), this.delegations.read(),
      this.approvals.read(), this.decisions.list(), this.workplace.getSnapshot(), this.messages.list(), this.responses.list(), this.scenarios.read(),
      this.enrollments.read(), this.attempts.read()
    ]);
    return { identities, proofs, enrollments, attempts, passports, bindings, mandates, delegations, approvals, decisions, assignments: workplace.assignments, messages, responses, scenarios };
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function investigate(event: AuthorityEventRecord, snapshot: AuditSnapshot, integrityStatus: 'verified' | 'warning' | 'failed'): EvidenceInvestigationRecord {
  const decision = [...snapshot.decisions].reverse().find((item) => item.traceId === event.trace_id);
  const payloadAssignmentId = stringPayload(event.payload, 'assignment_id');
  const subjectAssignmentId = event.subject?.type === 'assignment' ? event.subject.id : undefined;
  const message = event.subject?.type === 'message' ? snapshot.messages.find((item) => item.id === event.subject?.id) : undefined;
  const decisionAssignmentId = decision
    ? snapshot.approvals.find((item) => item.approvalRequestId === decision.approvalRequestId)?.authorizationRequest.assignmentId
    : undefined;
  const assignmentId = subjectAssignmentId ?? payloadAssignmentId ?? decisionAssignmentId ?? message?.assignmentId;
  const assignment = snapshot.assignments.find((item) => item.id === assignmentId) ?? snapshot.assignments.find((item) => item.traceId === event.trace_id);
  const mandateId = event.mandate_id ?? decision?.mandateId ?? (assignment?.mandateId !== 'mnd_unassigned' ? assignment?.mandateId : undefined);
  const mandate = snapshot.mandates.find((item) => item.mandateId === mandateId);
  const scenario = snapshot.scenarios.find((item) => item.runId === stringPayload(event.payload, 'run_id') || item.traceId === event.trace_id || item.steps.some((step) => step.assignmentId === assignment?.id || step.decisionTraceId === event.trace_id));
  const actorRuntime = event.actor.type === 'agent' ? snapshot.bindings.find((item) => item.binding_id === event.actor.id) : undefined;
  const assignmentRuntime = snapshot.bindings.find((item) => item.binding_id === assignment?.assigneeId);
  const runtime = actorRuntime ?? assignmentRuntime ?? snapshot.bindings.find((item) => item.agent_id === mandate?.subject.agentId);
  const passport = snapshot.passports.find((item) => item.passport_id === mandate?.subject.passportId)
    ?? snapshot.passports.find((item) => item.agent_id === runtime?.agent_id)
    ?? (event.subject?.type === 'agent_passport' ? snapshot.passports.find((item) => item.passport_id === event.subject?.id) : undefined)
    ?? (event.actor.type === 'agent' ? snapshot.passports.find((item) => item.agent_id === event.actor.id) : undefined);
  const approvalId = decision?.approvalRequestId ?? stringPayload(event.payload, 'approval_request_id');
  const approval = snapshot.approvals.find((item) => item.approvalRequestId === approvalId) ?? snapshot.approvals.find((item) => item.authorizationRequest.idempotencyKey === decision?.idempotencyKey);
  const humanId = event.actor.type === 'human' ? event.actor.id : approval?.resolvedByHumanId ?? mandate?.issuer.humanId ?? passport?.owner_human_id;
  const human = snapshot.identities.find((item) => item.human_id === humanId);
  const humanProofId = approval?.humanProofId ?? stringPayload(event.payload, 'human_proof_id') ?? mandate?.issuer.humanProofId ?? passport?.owner_human_proof_id;
  const proof = snapshot.proofs.find((item) => item.human_proof_id === humanProofId);
  const identityChain: EvidenceIdentityChain = {
    humanId: human?.human_id ?? humanId,
    humanDisplayName: human?.display_name,
    humanProofId: proof?.human_proof_id ?? humanProofId,
    passportId: passport?.passport_id,
    durableAgentId: passport?.agent_id ?? mandate?.subject.agentId,
    agentName: passport?.name,
    runtimeId: runtime?.binding_id,
    provider: runtime?.provider,
    model: runtime?.model,
    mandateId: mandate?.mandateId,
    mandateStatus: mandate?.status,
    delegationPath: mandate ? delegationPath(mandate, snapshot.delegations, snapshot.mandates) : [],
    assignmentId: assignment?.id,
    scenarioRunId: scenario?.runId
  };
  const missingLinks = protectedEvents.has(event.event_type) ? [
    !human && 'human', !proof && 'human-proof', !passport && 'passport', !runtime && 'runtime', !mandate && 'mandate', !decision && 'decision'
  ].filter(Boolean) : [];
  return {
    event, identityChain, decision, approval, assignment,
    resolutionStatus: protectedEvents.has(event.event_type) ? missingLinks.length === 0 ? 'complete' : 'partial' : 'not-applicable',
    missingLinks: missingLinks as EvidenceInvestigationRecord['missingLinks'], integrityStatus
  };
}

function delegationPath(mandate: Mandate, edges: DelegationEdge[], mandates: Mandate[]) {
  const path: EvidenceIdentityChain['delegationPath'] = [];
  let current: Mandate | undefined = mandate;
  while (current?.parentMandateId) {
    const edge = edges.find((item) => item.childMandateId === current?.mandateId && item.parentMandateId === current.parentMandateId);
    if (!edge) break;
    path.unshift({ delegationId: edge.delegationId, parentMandateId: edge.parentMandateId, childMandateId: edge.childMandateId, fromAgentId: edge.fromAgentId, toAgentId: edge.toAgentId });
    current = mandates.find((item) => item.mandateId === edge.parentMandateId);
  }
  return path;
}

function matchesQuery(record: EvidenceInvestigationRecord, query: EvidenceQuery): boolean {
  if (query.eventTypes.length && !query.eventTypes.includes(record.event.event_type)) return false;
  if (query.actorTypes.length && !query.actorTypes.includes(record.event.actor.type)) return false;
  if (query.decisions.length && (!record.decision || !query.decisions.includes(record.decision.decision))) return false;
  if (query.reasonCodes.length && (!record.decision || !query.reasonCodes.includes(record.decision.reasonCode))) return false;
  if (query.integrityOnly && record.integrityStatus === 'verified') return false;
  if (!query.search) return true;
  return JSON.stringify(record).toLowerCase().includes(query.search.toLowerCase());
}

function minimizedEntities(snapshot: AuditSnapshot) {
  return {
    humans: snapshot.identities,
    humanProofs: snapshot.proofs.map((proof) => ({ humanProofId: proof.human_proof_id, subjectId: proof.subject_id, assuranceLevel: proof.assurance_level, verifiedAt: proof.verified_at, expiresAt: proof.expires_at, attestationHash: proof.provider_attestation_hash })),
    biometricEnrollments: snapshot.enrollments.map((enrollment) => ({ enrollmentId: enrollment.enrollment_id, subjectId: enrollment.subject_id, provider: enrollment.provider, modality: enrollment.modality, modelSet: enrollment.model_set, templateCount: enrollment.template_count, saltHash: enrollment.salt_hash, createdAt: enrollment.created_at, updatedAt: enrollment.updated_at })),
    humanProofAttempts: snapshot.attempts.map((attempt) => ({ attemptId: attempt.attempt_id, subjectId: attempt.subject_id, provider: attempt.provider, decision: attempt.decision, reasonCode: attempt.reason_code, matchedTemplateCount: attempt.matched_template_count, requiredTemplateMatches: attempt.required_template_matches, createdAt: attempt.created_at, evidenceHash: attempt.evidence_hash })),
    passports: snapshot.passports.map((passport) => ({ passportId: passport.passport_id, agentId: passport.agent_id, name: passport.name, role: passport.role, ownerHumanId: passport.owner_human_id, ownerHumanProofId: passport.owner_human_proof_id, runtime: passport.runtime, capabilities: passport.capabilities, status: passport.status, issuedAt: passport.issued_at, expiresAt: passport.expires_at, signatureHash: hashCanonical(passport.passport_signature) })),
    runtimes: snapshot.bindings.map((binding) => ({ runtimeId: binding.binding_id, agentId: binding.agent_id, provider: binding.provider, model: binding.model, status: binding.status, connectionState: binding.connection_state, createdAt: binding.created_at, lastSeenAt: binding.last_seen_at })),
    mandates: snapshot.mandates.map((mandate) => ({ ...mandate, signature: { algorithm: mandate.signature.algorithm, signedBy: mandate.signature.signedBy, canonicalHash: mandate.signature.canonicalHash } })),
    delegations: snapshot.delegations,
    decisions: snapshot.decisions,
    approvals: snapshot.approvals,
    assignments: snapshot.assignments.map(({ response: _response, ...assignment }) => assignment),
    messages: snapshot.messages.map((message) => ({ id: message.id, assignmentId: message.assignmentId, fromAgentId: message.fromAgentId, toAgentId: message.toAgentId, act: message.act, mandateId: message.mandateId, traceId: message.traceId, createdAt: message.createdAt, deliveryStatus: message.deliveryStatus, bodyHash: hashCanonical(message.body) })),
    responses: snapshot.responses.map((response) => ({ id: response.id, assignmentId: response.assignmentId, agentId: response.agentId, traceId: response.traceId, createdAt: response.createdAt, bodyHash: hashCanonical(response.body) })),
    scenarios: snapshot.scenarios.map((run) => ({ ...run, steps: run.steps.map(({ output: _output, ...step }) => step) }))
  };
}

function stringPayload(payload: Record<string, unknown>, key: string): string | undefined {
  return typeof payload[key] === 'string' ? payload[key] : undefined;
}
