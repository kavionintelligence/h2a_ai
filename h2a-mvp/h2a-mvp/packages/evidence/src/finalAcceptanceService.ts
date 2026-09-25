import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { basename } from 'node:path';
import {
  defaultFeatureConfig, finalAcceptanceExportReceiptSchema, finalAcceptanceManifestSchema, finalAcceptancePackageSchema, finalAcceptanceStateSchema, finalAcceptanceVerificationReceiptSchema, phase44SessionReceiptSchema,
  type AgentIdentityState, type AuthorityApprovalState, type AuthorityEventRecord, type ContextBrokerState,
  type EnterpriseOverviewState, type FinalAcceptanceAttackResult, type FinalAcceptanceExportReceipt,
  type FinalAcceptanceGate, type FinalAcceptanceManifest, type FinalAcceptanceState, type FrameworkConnectorState,
  type FinalAcceptancePackage, type FinalAcceptanceVerificationReceipt, type H2AFeatureConfig, type HumanIdentityV2State, type LiveRuntimeState, type OrganizationAuthorityState, type Phase44SessionReceipt, type VerifyFinalAcceptancePackageRequest
} from '@h2a/contracts';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from './index';

interface StatePort<T> { getState(): Promise<T>; }
export interface FinalAcceptancePorts {
  humans: StatePort<HumanIdentityV2State>; organization: StatePort<OrganizationAuthorityState>;
  agents: StatePort<AgentIdentityState>; approvals: StatePort<AuthorityApprovalState>;
  context: StatePort<ContextBrokerState>; connectors: StatePort<FrameworkConnectorState>;
  live: StatePort<LiveRuntimeState>; enterprise: StatePort<EnterpriseOverviewState>;
  config?: { get(): Promise<H2AFeatureConfig> };
  signer?: { signOrganizationRecord(value: unknown): Promise<{ canonicalHash: string; signature: string }>; getOrganizationPublicKey(): Promise<string> };
}

export class FinalAcceptanceService {
  private readonly store: AtomicFileStore;
  private readonly manifest: VersionedJsonRepository<'h2a.final-acceptance.manifest', FinalAcceptanceManifest>;

  public constructor(dataPath: string, private readonly evidence: EvidenceLedgerPort, private readonly ports: FinalAcceptancePorts, private readonly clock: () => Date = () => new Date()) {
    this.store = new AtomicFileStore(dataPath);
    this.manifest = new VersionedJsonRepository(this.store, 'acceptance/phase22-manifest-v2.json', 'h2a.final-acceptance.manifest', finalAcceptanceManifestSchema, {
      initialData: defaultManifest(basename(dataPath), clock()), clock
    });
  }

  public async initialize(): Promise<FinalAcceptanceState> { await this.manifest.read(); return this.getState(); }

  public async getState(): Promise<FinalAcceptanceState> {
    const [manifest, events, integrity, humans, organization, agents, approvals, context, connectors, live, enterprise, config] = await Promise.all([
      this.manifest.read(), this.evidence.list(), this.evidence.verify(), this.ports.humans.getState(), this.ports.organization.getState(),
      this.ports.agents.getState(), this.ports.approvals.getState(), this.ports.context.getState(), this.ports.connectors.getState(),
      this.ports.live.getState(), this.ports.enterprise.getState(), this.ports.config?.get() ?? Promise.resolve(defaultFeatureConfig)
    ]);
    const sharedTrace = findSharedTrace(manifest, live, connectors);
    const attacks = attackResults(events, manifest.trace_prefix);
    const requiredLivenessHumans = [...new Set(events.filter((event) => event.event_type === 'HUMAN_VERIFIED_V2' && payload(event, 'liveness_mode') === 'required').map((event) => payload(event, 'human_id') || (event.actor.type === 'human' ? event.actor.id : '')).filter(Boolean))];
    const withdrawal = [...events].reverse().find((event) => event.event_type === 'APPROVAL_INVALIDATED_V2' && payload(event, 'status') === 'withdrawn');
    const integration = [...events].reverse().find((event) => payload(event, 'project_event_type') === 'PROJECT_CHANGE_INTEGRATED');
    const gates = evaluateGates({ manifest, events, humans, organization, agents, approvals, context, connectors, live, enterprise, sharedTrace, attacks, integrity: integrity.status, requiredLivenessHumans });
    const failed = gates.some((item) => item.status === 'failed') || integrity.status === 'failed';
    const passed = gates.filter((item) => item.status === 'passed').length;
    const status = failed ? 'failed' : passed === gates.length ? 'passed' : sharedTrace ? 'ready' : 'blocked';
    const cleanSession = manifest.session_id.startsWith('phase44-');
    const packageEligible = status === 'passed' && cleanSession && config.livenessMode === 'required' && requiredLivenessHumans.length >= 2 && Boolean(withdrawal && integration) && integrity.status === 'verified';
    return finalAcceptanceStateSchema.parse({ schema_version: 2, generated_at: this.clock().toISOString(), manifest, status, shared_trace_id: sharedTrace,
      completion: { passed, total: gates.length }, gates, attacks, evidence_integrity: integrity.status,
      phase44_readiness: { clean_session: cleanSession, required_liveness_mode: config.livenessMode === 'required', liveness_verified_human_ids: requiredLivenessHumans, approval_withdrawal_evidence_ref: withdrawal?.event_id ?? null, project_integration_evidence_ref: integration?.event_id ?? null, package_eligible: packageEligible },
      blockers: [
        ...gates.filter((item) => item.status !== 'passed').map((item) => `${item.title}: ${item.operator_action ?? item.summary}`),
        ...(!cleanSession ? ['Final ceremony must run from a clean Phase 44 data root.'] : []),
        ...(config.livenessMode !== 'required' ? ['Required liveness is not enabled.'] : []),
        ...(requiredLivenessHumans.length < 2 ? ['Two distinct humans must verify with required liveness.'] : []),
        ...(!withdrawal ? ['A durable withdrawn approval request is required.'] : []),
        ...(!integration ? ['A governed project integration receipt is required.'] : [])
      ] });
  }

  public async exportPackage(): Promise<FinalAcceptanceExportReceipt> {
    const state = await this.getState();
    if (!state.phase44_readiness.package_eligible || state.status !== 'passed') throw new Error('FINAL_ACCEPTANCE_PACKAGE_NOT_ELIGIBLE');
    if (!this.ports.signer) throw new Error('FINAL_ACCEPTANCE_SIGNER_UNAVAILABLE');
    const integrity = await this.evidence.verify();
    if (integrity.status !== 'verified' || !integrity.headHash || integrity.recordCount < 1) throw new Error('FINAL_ACCEPTANCE_LEDGER_NOT_VERIFIED');
    const exportId = `phase22_${randomUUID()}`;
    const createdAt = this.clock().toISOString();
    const relativePath = `exports/h2a-phase22-${createdAt.replace(/[:.]/gu, '-')}.json`;
    const content = { schema_version: 3 as const, kind: 'h2a.final-acceptance.package' as const, export_id: exportId, created_at: createdAt, privacy_profile: 'acceptance-minimized-v3' as const, source: { ledger_head_hash: integrity.headHash, ledger_record_count: integrity.recordCount }, state };
    const packageHash = hashCanonical(content);
    const publicKey = await this.ports.signer.getOrganizationPublicKey();
    const signed = await this.ports.signer.signOrganizationRecord({ ...content, package_hash: packageHash });
    const keyFingerprint = `sha256:${createHash('sha256').update(createPublicKey(publicKey).export({ type: 'spki', format: 'der' })).digest('hex')}`;
    const output = finalAcceptancePackageSchema.parse({ ...content, package_hash: packageHash, signer: { algorithm: 'Ed25519', public_key_pem: publicKey, key_fingerprint: keyFingerprint }, signature: signed.signature });
    assertPackage(output);
    await this.store.write(relativePath, `${JSON.stringify(output, null, 2)}\n`);
    await this.evidence.append({ trace_id: state.shared_trace_id!, actor: { type: 'system', id: 'h2a-final-acceptance' }, subject: { type: 'outcome', id: exportId }, event_type: 'FINAL_ACCEPTANCE_PACKAGE_EXPORTED', payload: { package_hash: packageHash, signer_fingerprint: keyFingerprint, status: state.status, passed_gates: state.completion.passed, total_gates: state.completion.total, privacy_profile: 'acceptance-minimized-v3', verifier_status: 'verified' } });
    return finalAcceptanceExportReceiptSchema.parse({ export_id: exportId, relative_path: relativePath, created_at: createdAt, package_hash: packageHash, status: state.status, passed_gates: state.completion.passed, total_gates: state.completion.total, signer_fingerprint: keyFingerprint, verifier_status: 'verified' });
  }

  public async verifyExportedPackage(input: VerifyFinalAcceptancePackageRequest): Promise<FinalAcceptanceVerificationReceipt> {
    const prior = (await this.evidence.list()).filter((event) => payload(event, 'operation_key') === input.operation_key);
    const priorVerification = prior.find((event) => event.event_type === 'FINAL_ACCEPTANCE_PACKAGE_VERIFIED');
    const priorTamper = prior.find((event) => event.event_type === 'FINAL_ACCEPTANCE_PACKAGE_TAMPER_REJECTED');
    if (priorVerification && priorTamper) {
      return finalAcceptanceVerificationReceiptSchema.parse({
        relative_path: payload(priorVerification, 'relative_path'), package_hash: payload(priorVerification, 'package_hash'), status: 'verified',
        tamper_test: 'rejected', tamper_reason: payload(priorTamper, 'reason_code'), verification_evidence_ref: priorVerification.event_id,
        tamper_evidence_ref: priorTamper.event_id, verified_at: priorVerification.timestamp
      });
    }
    const raw = await this.store.read(input.relative_path);
    if (!raw) throw new Error('FINAL_ACCEPTANCE_PACKAGE_NOT_FOUND');
    let decoded: unknown;
    try { decoded = JSON.parse(raw) as unknown; }
    catch { throw new Error('FINAL_ACCEPTANCE_PACKAGE_JSON_INVALID'); }
    const value = finalAcceptancePackageSchema.parse(decoded);
    assertPackage(value);
    const verification = await this.evidence.append({
      trace_id: value.state.shared_trace_id!, actor: { type: 'system', id: 'h2a-package-verifier' }, subject: { type: 'outcome', id: value.export_id },
      event_type: 'FINAL_ACCEPTANCE_PACKAGE_VERIFIED', payload: { operation_key: input.operation_key, relative_path: input.relative_path, package_hash: value.package_hash, signer_fingerprint: value.signer.key_fingerprint, verifier_status: 'verified' }
    });
    const tampered = structuredClone(value);
    tampered.state.blockers = [...tampered.state.blockers, 'one-byte-tamper-probe'];
    let tamperReason = 'PACKAGE_TAMPER_NOT_REJECTED';
    try { assertPackage(tampered); }
    catch (error) { tamperReason = error instanceof Error ? error.message : 'PACKAGE_TAMPER_REJECTED'; }
    if (tamperReason === 'PACKAGE_TAMPER_NOT_REJECTED') throw new Error(tamperReason);
    const tamper = await this.evidence.append({
      trace_id: value.state.shared_trace_id!, actor: { type: 'system', id: 'h2a-package-verifier' }, subject: { type: 'outcome', id: value.export_id },
      parent_event_id: verification.event_id, event_type: 'FINAL_ACCEPTANCE_PACKAGE_TAMPER_REJECTED',
      payload: { operation_key: input.operation_key, relative_path: input.relative_path, package_hash: value.package_hash, reason_code: tamperReason, mutation: 'in-memory-content-byte-change' }
    });
    return finalAcceptanceVerificationReceiptSchema.parse({
      relative_path: input.relative_path, package_hash: value.package_hash, status: 'verified', tamper_test: 'rejected', tamper_reason: tamperReason,
      verification_evidence_ref: verification.event_id, tamper_evidence_ref: tamper.event_id, verified_at: verification.timestamp
    });
  }

  public async preparePhase44Session(): Promise<Phase44SessionReceipt> {
    const createdAt = this.clock().toISOString();
    const sessionId = `phase44-${createdAt.replace(/[:.]/gu, '-')}-${randomUUID()}`;
    const relativeRoot = `phase44-sessions/${sessionId}`;
    const sessionStore = new AtomicFileStore(this.store.resolvePath(relativeRoot));
    const config = { ...defaultFeatureConfig, livenessMode: 'required' as const };
    const envelope = (kind: string, data: unknown): string => `${JSON.stringify({ schemaVersion: 1, kind, updatedAt: createdAt, data }, null, 2)}\n`;
    await Promise.all([
      sessionStore.write('workplace/fleet.json', envelope('h2a.workplace.fleet', [])),
      sessionStore.write('workplace/assignments.json', envelope('h2a.workplace.assignments', [])),
      sessionStore.write('evidence/recent-events.json', envelope('h2a.evidence.recent-events', [])),
      sessionStore.write('settings/feature-config.json', envelope('h2a.settings.feature-config', config)),
      sessionStore.write('SESSION.json', `${JSON.stringify({ schema_version: 1, session_id: sessionId, created_at: createdAt, purpose: 'Phase 44 clean final acceptance', preview_data: false, prepopulated_success: false }, null, 2)}\n`)
    ]);
    const dataPath = this.store.resolvePath(relativeRoot);
    return phase44SessionReceiptSchema.parse({ session_id: sessionId, data_path: dataPath, created_at: createdAt, liveness_mode: 'required', launch_command: `$env:H2A_DATA_PATH='${dataPath.replaceAll("'", "''")}'; pnpm dev` });
  }
}

interface EvaluationInput {
  manifest: FinalAcceptanceManifest; events: AuthorityEventRecord[]; humans: HumanIdentityV2State; organization: OrganizationAuthorityState;
  agents: AgentIdentityState; approvals: AuthorityApprovalState; context: ContextBrokerState; connectors: FrameworkConnectorState;
  live: LiveRuntimeState; enterprise: EnterpriseOverviewState; sharedTrace: string | null; attacks: FinalAcceptanceAttackResult[];
  integrity: 'verified' | 'warning' | 'failed';
  requiredLivenessHumans: string[];
}

function evaluateGates(input: EvaluationInput): FinalAcceptanceGate[] {
  const make = (gate_id: FinalAcceptanceGate['gate_id'], title: string, status: FinalAcceptanceGate['status'], summary: string, evidence_refs: string[], operator_action?: string): FinalAcceptanceGate => ({ gate_id, title, status, summary, evidence_refs, ...(operator_action ? { operator_action } : {}) });
  const activeHumans = input.humans.identities.filter((item) => item.status === 'active');
  const enrolled = new Set(input.humans.enrollments.filter((item) => item.status === 'active' && item.policy.token_set_size >= 20 && item.policy.token_set_size <= 70).map((item) => item.human_id));
  const mismatchTargets = new Set(input.events
    .filter((event) => event.event_type === 'HUMAN_PROOF_ATTEMPTED_V2' && payload(event, 'reason_code') === 'BIOMETRIC_MISMATCH')
    .map((event) => payload(event, 'human_id') || (event.actor.type === 'human' ? event.actor.id : ''))
    .filter(Boolean));
  const activeMembers = input.organization.memberships.filter((item) => item.status === 'active');
  const credentials = input.organization.credentials.filter((item) => item.status === 'active');
  const roles = new Set(activeMembers.flatMap((item) => item.role_ids));
  const phaseRuns = input.live.runs.filter((run) => run.trace_id.startsWith(input.manifest.trace_prefix));
  const traceRuns = input.sharedTrace ? phaseRuns.filter((run) => run.trace_id === input.sharedTrace && run.status === 'succeeded') : [];
  const passports = new Set(traceRuns.map((run) => run.passport_id));
  const sessions = input.agents.runtimeSessions?.filter((item) => ['ready', 'working'].includes(item.state) && passports.has(item.passport_id)) ?? [];
  const framework = input.sharedTrace ? input.connectors.collaboration_runs.find((run) => run.trace_id === input.sharedTrace && run.status === 'succeeded' && run.steps.some((step) => input.manifest.accepted_frameworks.includes(step.connector_kind))) : undefined;
  const traceEvents = input.sharedTrace ? input.events.filter((event) => event.trace_id === input.sharedTrace) : [];
  const traceTypes = new Set(traceEvents.map((event) => event.event_type));
  const trace = input.sharedTrace ? input.enterprise.traces.find((item) => item.trace_id === input.sharedTrace) : undefined;
  const contextPassed = Boolean(trace?.references.context_grant_ids.length) && traceTypes.has('CONTEXT_DISCLOSURE_AUTHORIZED') && input.context.disclosures.some((item) => item.status === 'authorized' && trace!.references.context_grant_ids.includes(item.context_grant_id));
  const approvalIds = trace?.references.approval_ids ?? [];
  const decisions = input.approvals.decisions.filter((item) => approvalIds.includes(item.approval_request_id));
  const approvalPassed = decisions.length > 0 && input.approvals.resumes.some((item) => approvalIds.includes(item.approval_request_id) && item.status === 'completed');
  const containment = input.events.filter((event) => event.trace_id.startsWith(input.manifest.trace_prefix) && ['LIVE_RUNTIME_CANCELLED', 'LIVE_RUNTIME_REVOKED', 'MANDATE_REVOKED'].includes(event.event_type));
  const recovery = input.events.filter((event) => event.trace_id.startsWith(input.manifest.trace_prefix) && event.event_type === 'LIVE_RUNTIME_FAILED' && payload(event, 'termination_reason') === 'HOST_PROCESS_RESTARTED');
  const evidencePassed = Boolean(trace && trace.resolution_status === 'complete' && trace.references.output_hashes.length >= 3 && input.integrity === 'verified');
  return [
    make('two-human-ceremony', 'Two-human biometric ceremony', activeHumans.filter((item) => enrolled.has(item.human_id)).length >= 2 && mismatchTargets.size >= 2 && input.requiredLivenessHumans.length >= 2 ? 'passed' : 'user-action-required', `${activeHumans.length} active humans, ${enrolled.size} valid token sets, ${mismatchTargets.size} distinct mismatch targets, ${input.requiredLivenessHumans.length} required-liveness verifications.`, [...activeHumans.map((item) => item.human_id), ...mismatchTargets, ...input.requiredLivenessHumans], 'Verify both enrolled people with required liveness and complete both cross-person camera rejections.'),
    make('organization-authority', 'Organization authority separation', activeMembers.length >= 2 && credentials.length >= 2 && roles.size >= 2 ? 'passed' : 'pending', `${activeMembers.length} active memberships, ${credentials.length} active credentials, ${roles.size} distinct roles.`, [...activeMembers.map((item) => item.membership_id), ...credentials.map((item) => item.credential_id)], 'Create two active employees with distinct authority roles and credentials.'),
    make('workload-identity', 'Passport and runtime workload proof', passports.size === 3 && sessions.length === passports.size ? 'passed' : 'pending', `${passports.size} Phase 22 Passports and ${sessions.length} active workload sessions resolve.`, [...passports, ...sessions.map((item) => item.runtime_session_id)], 'Attest an active Passport V2 runtime session for every provider participant.'),
    make('shared-provider-task', 'Claude, Codex, and Google provider task', input.sharedTrace ? 'passed' : 'user-action-required', input.sharedTrace ? `All required providers succeeded on ${input.sharedTrace}.` : 'No single Phase 22 trace contains successful output from all required providers and a framework agent.', traceRuns.map((run) => run.run_id), 'Authenticate Gemini or approve Antigravity as the Google lane, then run all three real provider portions on one Phase 22 trace.'),
    make('external-framework', 'Conformant external framework participant', framework ? 'passed' : 'pending', framework ? `${framework.steps.length} signed framework steps completed.` : 'No accepted framework collaboration completed on the shared trace.', framework ? [framework.run_id, ...framework.steps.map((step) => step.delivery_id)] : [], 'Run MCP, A2A, LangGraph, OpenClaw, n8n, or custom CLI on the same trace.'),
    make('context-minimization', 'Actual runtime context minimization', contextPassed ? 'passed' : 'pending', contextPassed ? 'Authorized Context Grant disclosure resolves on the shared provider trace.' : 'The shared trace does not yet resolve an authorized Context Grant disclosure.', trace?.references.context_grant_ids ?? [], 'Authorize each runtime input through Context Broker and retain projection hashes on the shared trace.'),
    make('authority-escalation', 'Cross-human authority escalation', approvalPassed ? 'passed' : 'user-action-required', `${decisions.length} qualifying approval decisions and ${input.approvals.resumes.filter((item) => approvalIds.includes(item.approval_request_id) && item.status === 'completed').length} completed resumes.`, [...approvalIds, ...decisions.map((item) => item.approval_decision_id)], 'Have the eligible second employee biometrically approve the exact paused action and resume it once.'),
    make('runtime-containment', 'Real cancellation and revocation', containment.length >= 2 ? 'passed' : 'pending', `${containment.length} Phase 22 containment events are persisted.`, containment.map((event) => event.event_id), 'Cancel and revoke real in-flight or next provider execution under Phase 22 traces.'),
    make('adversarial-controls', 'Red-team controls', input.attacks.every((item) => item.status === 'blocked') ? 'passed' : 'pending', `${input.attacks.filter((item) => item.status === 'blocked').length} of ${input.attacks.length} required attacks are blocked in Phase 22 evidence.`, input.attacks.flatMap((item) => item.evidence_refs), 'Run replay, forged approval, over-broad delegation, leakage, tamper, and provider-failure attacks against the isolated session.'),
    make('restart-recovery', 'Restart and clean-session recovery', recovery.length ? 'passed' : 'pending', `${recovery.length} interrupted Phase 22 runs recovered without a false success state.`, recovery.map((event) => event.event_id), 'Restart during an active isolated-session run and verify orphan recovery plus non-destructive clean-session creation.'),
    make('evidence-reconstruction', 'Complete final evidence reconstruction', evidencePassed ? 'passed' : input.integrity === 'failed' ? 'failed' : 'pending', trace ? `${trace.resolution_status} trace with ${trace.references.output_hashes.length} output hashes; ledger ${input.integrity}.` : `No shared Phase 22 enterprise trace; ledger ${input.integrity}.`, trace ? [trace.trace_id, ...trace.references.output_hashes] : [], 'Resolve the shared trace through both humans, authority, Passports, sessions, grants, approvals, actions, and all outputs.')
  ];
}

function assertPackage(value: FinalAcceptancePackage): void {
  const unsigned = { schema_version: value.schema_version, kind: value.kind, export_id: value.export_id, created_at: value.created_at, privacy_profile: value.privacy_profile, source: value.source, state: value.state };
  if (hashCanonical(unsigned) !== value.package_hash) throw new Error('FINAL_ACCEPTANCE_PACKAGE_HASH_INVALID');
  const signedPayload = { ...unsigned, package_hash: value.package_hash };
  const signature = Buffer.from(value.signature.slice('ed25519:'.length), 'base64');
  if (!verify(null, Buffer.from(canonicalize(signedPayload)), value.signer.public_key_pem, signature)) throw new Error('FINAL_ACCEPTANCE_PACKAGE_SIGNATURE_INVALID');
  const serialized = JSON.stringify(value).toLowerCase();
  if (['recovery_secret', 'sealed_payload', 'biometric_token', 'private_key'].some((field) => serialized.includes(`"${field}"`))) throw new Error('FINAL_ACCEPTANCE_PACKAGE_PRIVACY_VIOLATION');
}


function attackResults(events: AuthorityEventRecord[], prefix: string): FinalAcceptanceAttackResult[] {
  const phase = events.filter((event) => event.trace_id.startsWith(prefix));
  const byReason = (codes: string[]) => phase.filter((event) => codes.includes(payload(event, 'reason_code')));
  const make = (attack_id: FinalAcceptanceAttackResult['attack_id'], matches: AuthorityEventRecord[], reason_codes: string[]): FinalAcceptanceAttackResult => ({ attack_id, status: matches.length ? 'blocked' : 'not-observed', reason_codes, evidence_refs: matches.map((event) => event.event_id) });
  return [
    make('replay', byReason(['REPLAY_DETECTED', 'FEDERATION_SEQUENCE_REPLAY', 'FEDERATION_NONCE_REPLAY']), ['REPLAY_DETECTED', 'FEDERATION_SEQUENCE_REPLAY', 'FEDERATION_NONCE_REPLAY']),
    make('forged-approval', phase.filter((event) => ['APPROVAL_INVALIDATED_V2', 'APPROVAL_REJECTED_V2'].includes(event.event_type)), ['APPROVAL_SIGNATURE_INVALID', 'APPROVAL_INVALIDATED']),
    make('over-broad-delegation', phase.filter((event) => event.event_type === 'DELEGATION_DENIED'), ['CHILD_EXPANDS_PARENT_AUTHORITY']),
    make('context-leakage', phase.filter((event) => event.event_type === 'CONTEXT_DISCLOSURE_DENIED'), ['CONTEXT_SCOPE_DENIED']),
    make('tamper', phase.filter((event) => event.event_type === 'FEDERATION_ENVELOPE_REJECTED' && /HASH|SIGNATURE/iu.test(payload(event, 'reason_code'))), ['PAYLOAD_HASH_INVALID', 'SIGNATURE_INVALID']),
    make('provider-failure', phase.filter((event) => event.event_type === 'LIVE_RUNTIME_FAILED'), ['PROVIDER_FAILURE'])
  ];
}

function findSharedTrace(manifest: FinalAcceptanceManifest, live: LiveRuntimeState, connectors: FrameworkConnectorState): string | null {
  const candidates = [...new Set(live.runs.filter((run) => run.status === 'succeeded' && run.trace_id.startsWith(manifest.trace_prefix)).map((run) => run.trace_id))];
  return candidates.find((traceId) => {
    const providers = new Set(live.runs.filter((run) => run.trace_id === traceId && run.status === 'succeeded').map((run) => run.provider));
    return manifest.required_providers.every((provider) => providers.has(provider)) && connectors.collaboration_runs.some((run) => run.trace_id === traceId && run.status === 'succeeded' && run.steps.some((step) => manifest.accepted_frameworks.includes(step.connector_kind)));
  }) ?? null;
}

function payload(event: AuthorityEventRecord, key: string): string { const value = event.payload[key]; return typeof value === 'string' ? value : ''; }
function defaultManifest(sessionId: string, now: Date): FinalAcceptanceManifest {
  return finalAcceptanceManifestSchema.parse({ schema_version: 2, manifest_id: 'phase22-hp-cto-ciso', session_id: sessionId, trace_prefix: 'phase22_', required_providers: ['claude-code', 'openai-codex', 'gemini-antigravity'], accepted_frameworks: ['mcp', 'a2a', 'langgraph', 'openclaw', 'n8n', 'custom-cli'], minimum_humans: 2, biometric_record_range: [20, 70], trust_ceiling: 'connected-observed', created_at: now.toISOString() });
}
