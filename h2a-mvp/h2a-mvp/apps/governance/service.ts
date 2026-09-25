import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { activeBiometricModelSet, agentPassportSchema, type AgentPassport, type AgentRuntimeSummary, type AuthorityEventType, type HumanProofState, type Mandate as NativeMandate } from '@h2a/contracts';
import { AtomicFileStore, LocalWorkplaceRepository, VersionedJsonRepository } from '@h2a/storage';
import { LocalAuthorityEventLedger, hashCanonical } from '@h2a/evidence';
import { AuthoritySignatureService } from '@h2a/identity';
import { MandateService } from '@h2a/mandates';
import { AgentCollaborationService } from '@h2a/agents';
import type { Action, Agent, AssuranceFinding, AuditEvent, Binding, DiscoveryScan, Human, Memory, Room, Snapshot } from './contracts';
import { ActorDirectory, currentActor } from './actors';

const id = z.string().trim().min(1).max(160);
const date = z.string().datetime({ offset: true });
// Validate the integration boundary while preserving every Census field, including future fields.
const censusEntitySchema = z.object({
  agent_id: id, name: z.string().min(1), provider: z.string().nullable(), model: z.string().nullable(), framework: z.string().nullable(),
  endpoint: z.string().nullable(), protocols: z.array(z.string()), tools: z.array(z.string()),
  capabilities: z.array(z.object({ name: z.string(), basis: z.string(), confidence: z.number(), evidence: z.array(z.unknown()) }).passthrough()),
  fingerprint: z.record(z.string(), z.unknown()),
  classification: z.object({ is_agent: z.boolean(), classification: z.string(), confidence: z.number(), entity_type: z.string(), reasons: z.array(z.string()), evidence: z.array(z.unknown()) }).passthrough(),
  registered: z.boolean(), shadow: z.boolean(), discovery_sources: z.array(z.string()),
  first_seen: date, last_seen: date, activity_status: z.enum(['active', 'stale']), evidence_age_seconds: z.number(),
  confidence: z.number(), evidence: z.array(z.unknown()), identity_decisions: z.array(z.unknown())
}).passthrough();
const scanSchema = z.object({
  scan_id: id, started_at: date, completed_at: date, correlation_id: z.string(), agents: z.array(censusEntitySchema),
  errors: z.array(z.object({ source: z.string(), code: z.string(), message: z.string() }).passthrough()),
  discovery_sources: z.array(z.string()), observed_agent_ids: z.array(z.string()), configured_source_count: z.number().int().min(0)
}).passthrough();
const discoverySchema = z.object({
  agent_id: id, name: z.string().min(1), framework: z.string(), discovery_status: z.literal('discovered'),
  census_agent_id: id.optional(), discovery_snapshot: censusEntitySchema.optional(), imported_at: date.optional(), import_scan_id: id.optional(), legacy_identity: z.boolean().optional(),
  discovery_source: z.string().optional(), evidence: z.unknown().optional()
});
const bindingSchema = z.object({ binding_id: id, agent_id: id, human_id: id, relationship: z.literal('owner'), status: z.literal('active'), created_at: date });
const roomSchema = z.object({ room_id: id, name: z.string().min(2).max(160), human_ids: z.array(id), agent_ids: z.array(id), created_at: date });
const actionSchema = z.object({
  action_id: id, agent_id: id, passport_id: id, mandate_id: id, room_id: id, action: id, label: z.string(),
  status: z.enum(['executed', 'pending', 'denied', 'rejected', 'failed']), decision: z.enum(['ALLOWED', 'REQUIRES_APPROVAL', 'DENIED']), reason: z.string(),
  approval_id: id.optional(), requested_at: date, executed_at: date.optional(), execution_count: z.number().int().min(0).max(1),
  result: z.object({ summary: z.string(), details: z.record(z.string(), z.unknown()).optional(), artifact: z.object({ name: z.string(), path: z.string(), content_hash: z.string() }).optional() }).optional(),
  execution_receipt: z.object({ algorithm: z.literal('Ed25519'), signedBy: id, canonicalHash: z.string(), value: z.string() }).optional(),
  idempotency_key: id
});
const memorySchema = z.object({
  memory_id: id, title: z.string().min(2).max(160), content: z.string().min(1).max(12000), status: z.enum(['proposed', 'published', 'rejected']),
  created_by_agent: id, agent_id: id, passport_id: id, mandate_id: id, room_id: id, source_action_id: id,
  sources: z.array(z.object({ title: z.string(), url: z.string().min(1) })).min(1), content_hash: z.string(), created_at: date,
  proposed_by: id.optional(), reviewed_by: id.optional(), reviewed_at: date.optional(), review_note: z.string().optional()
});
const stateSchema = z.object({ agents: z.array(discoverySchema), bindings: z.array(bindingSchema), rooms: z.array(roomSchema), actions: z.array(actionSchema), memories: z.array(memorySchema), assignment_rooms: z.record(z.string(), id).default({}), last_scan: scanSchema.optional() });
type State = z.infer<typeof stateSchema>;
const emptyState = (): State => ({ agents: [], bindings: [], rooms: [], actions: [], memories: [], assignment_rooms: {} });
const operatorProof = () => `${currentActor().mode}:${currentActor().human_id}`;
const ORGANIZATION = process.env.BYOSYNC_ORGANIZATION ?? 'Local organization';
const allowedActions = ['inventory_report', 'verify_integrity'];
const actionLabels: Record<string, string> = {
  inventory_report: 'Generate current AI estate report',
  verify_integrity: 'Verify governance evidence integrity',
  evidence_export: 'Export signed governance evidence pack',
  crm_write: 'Write to CRM',
  purchase: 'Purchase external service'
};

export interface DiscoveryProvider {
  scan(): Promise<DiscoveryScan>;
  configured: boolean;
  endpoint: string;
}
export class DemoError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** Reuses native H2A signatures, policies, approvals, atomic files and hash-linked audit. */
export class GovernanceService {
  private readonly store: AtomicFileStore;
  private readonly repository: VersionedJsonRepository<'byosync.governance.v1', State>;
  private readonly passports: VersionedJsonRepository<'h2a.agents.passports', AgentPassport[]>;
  private readonly signatures: AuthoritySignatureService;
  private readonly workplace: LocalWorkplaceRepository;
  readonly ledger: LocalAuthorityEventLedger;
  readonly policy: MandateService;
  readonly collaboration: AgentCollaborationService;
  private queue: Promise<unknown> = Promise.resolve();
  // Only scans explicitly requested during this server session are import candidates.
  // Discovery results are deliberately absent from GET /api/state and initial UI state.
  private readonly scans = new Map<string, DiscoveryScan>();

  constructor(readonly dataPath: string, private readonly discovery: DiscoveryProvider, private readonly clock: () => Date = () => new Date(), readonly directory = new ActorDirectory()) {
    this.store = new AtomicFileStore(dataPath);
    this.repository = new VersionedJsonRepository(this.store, 'byosync/state.json', 'byosync.governance.v1', stateSchema, { initialData: emptyState(), clock });
    this.passports = new VersionedJsonRepository(this.store, 'passports/registry.json', 'h2a.agents.passports', z.array(agentPassportSchema), { initialData: [], clock });
    this.signatures = new AuthoritySignatureService(dataPath);
    this.workplace = new LocalWorkplaceRepository(dataPath, clock);
    this.ledger = new LocalAuthorityEventLedger(dataPath, 'traces/governance.jsonl', clock);
    // A local operator is explicit and never represented as enterprise SSO or biometric proof.
    const noBiometricProof = { getState: async (): Promise<HumanProofState> => ({ identity: null, enrollment: null, activeProof: null, recentAttempts: [], failedAttempts: 0, lockedUntil: null, modelSet: activeBiometricModelSet }) };
    const presenter = { authorizeProtectedOperation: async () => ({ humanId: currentActor().human_id, humanProofId: operatorProof() }) };
    this.policy = new MandateService(dataPath, this.ledger, noBiometricProof, this.workplace, clock, presenter);
    this.collaboration = new AgentCollaborationService(dataPath, this.ledger, this.workplace, clock);
  }

  async initialize(): Promise<void> {
    if (!await this.store.read('settings/h2a-signing-key.json')) {
      const key = generateKeyPairSync('ed25519', { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
      await this.store.write('settings/h2a-signing-key.json', JSON.stringify({ schemaVersion: 1, kind: 'h2a.settings.signing-key', updatedAt: this.now(), data: { algorithm: 'Ed25519', private_key_pem: key.privateKey, public_key_pem: key.publicKey } }));
    }
    for (const [path, kind] of [['workplace/fleet.json', 'h2a.workplace.fleet'], ['workplace/assignments.json', 'h2a.workplace.assignments'], ['evidence/recent-events.json', 'h2a.evidence.recent-events']]) {
      if (!await this.store.read(path)) await this.store.write(path, JSON.stringify({ schemaVersion: 1, kind, updatedAt: this.now(), data: [] }));
    }
    await this.repository.read(); await this.passports.read(); await this.signatures.initialize(); await this.policy.initialize(); await this.collaboration.initialize();
    const integrity = await this.ledger.verify();
    if (integrity.status !== 'verified') throw new DemoError('Audit integrity failed; governance state is not trusted.', 409);
    // Recover a crash between durable approval and a real local control operation.
    const state = await this.repository.read();
    // Preserve imported identities while never manufacturing missing Census evidence.
    let migrated = false;
    for (const agent of state.agents) {
      if (!agent.census_agent_id) { agent.census_agent_id = agent.agent_id; agent.legacy_identity = true; migrated = true; }
    }
    if (migrated) await this.repository.write(state);
    if (state.last_scan) this.scans.set(state.last_scan.scan_id, structuredClone(state.last_scan));
    const approvals = (await this.policy.getState()).approvals;
    for (const action of state.actions.filter(item => item.status === 'pending')) {
      const approval = approvals.find(item => item.approvalRequestId === action.approval_id);
      if ((action.decision === 'ALLOWED' && !action.approval_id) || approval?.status === 'approved') {
        try { await this.validateActiveAuthority(state, action); }
        catch (error) {
          action.status = 'denied'; action.reason = 'AUTHORITY_UNAVAILABLE_ON_RESTART';
          await this.repository.write(state);
          await this.event('POLICY_DENIED', action.agent_id, { passport_id: action.passport_id, mandate_id: action.mandate_id, room_id: action.room_id, approval_id: action.approval_id }, { action_id: action.action_id, reason_code: action.reason, reason: error instanceof Error ? error.message : String(error), stage: 'restart-recovery' });
          continue;
        }
        await this.execute(state, action);
      }
      if (approval?.status === 'rejected' || approval?.status === 'invalidated') { action.status = approval.status === 'rejected' ? 'rejected' : 'denied'; await this.repository.write(state); }
    }
    // The local effect and its signed recovery receipt are one atomic state write.
    // A stop before the following audit append must not erase execution from the trace.
    const events = await this.ledger.list();
    for (const action of state.actions.filter(item => item.status === 'executed')) {
      if (events.some(event => event.event_type === 'ACTION_EXECUTED' && event.payload.action_id === action.action_id)) continue;
      const { execution_receipt: receipt, ...committed } = action;
      if (!receipt || !await this.signatures.verify(committed, receipt)) throw new DemoError('Missing execution audit cannot be recovered without a valid signed receipt.', 409);
      await this.executionEvent(action, true);
    }
  }

  async getState(): Promise<Snapshot> { await this.queue; return this.snapshot(); }
  async trace(agentId: string): Promise<AuditEvent[]> { const state = await this.getState(); this.requireAgent(state, agentId); return state.events.filter(event => event.agent_id === agentId); }
  async passport(agentId: string) { return (await this.getState()).agents.find(agent => agent.agent_id === agentId)?.passport ?? null; }

  async discoverAgents(): Promise<DiscoveryScan> {
    let scan: DiscoveryScan;
    try { scan = scanSchema.parse(await this.discovery.scan()); }
    catch { throw new DemoError('Agent Discovery service unavailable', 503); }
    this.scans.set(scan.scan_id, structuredClone(scan));
    while (this.scans.size > 20) this.scans.delete(this.scans.keys().next().value!);
    await this.mutate(async state => { state.last_scan = structuredClone(scan); await this.repository.write(state); });
    return structuredClone(scan);
  }

  async latestDiscovery() { await this.queue; return (await this.repository.read()).last_scan ?? null; }

  setRoomMembers(roomId: string, humanIds: string[]): Promise<Snapshot> { return this.mutate(async state => {
    if (currentActor().role !== 'admin') throw new DemoError('Only an administrator can change room membership.', 403);
    const room = state.rooms.find(item => item.room_id === roomId);
    if (!room) throw new DemoError('Room not found.', 404);
    if (humanIds.some(id => !this.directory.people().some(person => person.human_id === id))) throw new DemoError('Unknown organization user.');
    room.human_ids = [...new Set(humanIds)];
    await this.repository.write(state);
    await this.event('ROOM_JOINED', room.agent_ids[0], { room_id: roomId }, { human_ids: room.human_ids, operation: 'membership_updated' }, 'human');
  }); }

  async assertBuildAuthority(roomId: string, agentId: string, expectedMandate?: string) {
    await this.queue;
    if ((await this.ledger.verify()).status !== 'verified') throw new DemoError('Audit integrity failed.', 409);
    const state = await this.repository.read();
    this.requireRoom(state, roomId, agentId);
    const authority = await this.requireGoverned(state, agentId);
    if (!authority.mandate.approvals.requiredActions.includes('product_build') || authority.mandate.prohibitedActions.includes('product_build')) throw new DemoError('Grant a product-build mandate before running this agent.', 403);
    if (expectedMandate && authority.mandate.mandateId !== expectedMandate) throw new DemoError('Mandate changed since this run was requested.', 409);
    return { passport_id: authority.passport.passport_id, mandate_id: authority.mandate.mandateId };
  }

  recordBuildEvent(agentId: string, roomId: string, mandateId: string, metadata: Record<string, unknown>, type: 'ACTION_REQUESTED' | 'ACTION_EXECUTED' | 'POLICY_DENIED' | 'HUMAN_APPROVED' | 'HUMAN_REJECTED' | 'RUNTIME_EXECUTION_FAILED' = 'ACTION_EXECUTED') {
    return this.mutate(async () => { await this.event(type, agentId, { room_id: roomId, mandate_id: mandateId }, metadata, 'human'); });
  }

  proposeBuildMemory(roomId: string, agentId: string, runId: string, title: string, content: string) {
    return this.mutate(async state => {
      this.requireRoom(state, roomId, agentId);
      const { passport, mandate } = await this.requireGoverned(state, agentId);
      if (state.memories.some(item => item.source_action_id === runId)) return;
      const memory = memorySchema.parse({ memory_id: `MEM-${randomUUID()}`, title, content, status: 'proposed', created_by_agent: agentId, proposed_by: currentActor().human_id,
        agent_id: agentId, passport_id: passport.passport_id, mandate_id: mandate.mandateId, room_id: roomId, source_action_id: runId,
        sources: [{ title: 'Actual CLI run result', url: `urn:byosync:run:${runId}` }], content_hash: '', created_at: this.now() });
      memory.content_hash = hashCanonical({ title, content, sources: memory.sources });
      state.memories.push(memory); await this.repository.write(state);
      await this.event('MEMORY_PROPOSED', agentId, { room_id: roomId, mandate_id: mandate.mandateId }, { memory_id: memory.memory_id, source_run_id: runId, content_hash: memory.content_hash }, 'agent');
    });
  }

  importAgent(censusAgentId: string, scanId?: string): Promise<Snapshot> { return this.mutate(async state => {
    // Serialized against all registry mutations: repeat clicks/refresh/restart cannot duplicate identity.
    if (state.agents.some(agent => agent.census_agent_id === censusAgentId)) return;
    const scan = scanId ? this.scans.get(scanId) : [...this.scans.values()].at(-1);
    if (!scan) throw new DemoError('Run a new scan and inspect this entity before registering it in H2A.', 409);
    const entity = scan.agents.find(item => item.agent_id === censusAgentId);
    if (!entity) throw new DemoError('The Census entity was not present in this scan.', 404);
    if (!entity.classification.is_agent && entity.framework !== 'endpoint-inventory') throw new DemoError('This entity is neither a behavior-classified agent nor a detected endpoint AI tool.', 409);
    const agent = discoverySchema.parse({
      agent_id: `H2A-AGENT-${randomUUID()}`, census_agent_id: entity.agent_id, name: entity.name, framework: entity.framework ?? '',
      discovery_status: 'discovered', discovery_source: entity.framework === 'endpoint-inventory' ? 'endpoint-inventory' : 'agent-discovery-platform', discovery_snapshot: structuredClone(entity),
      evidence: structuredClone(entity.evidence), imported_at: this.now(), import_scan_id: scan.scan_id
    });
    state.agents.push(agent); await this.repository.write(state);
    await this.event('AGENT_REGISTERED_IN_H2A', agent.agent_id, {}, {
      census_agent_id: entity.agent_id, scan_id: scan.scan_id, name: entity.name,
      source_classification: entity.classification, source_registered: entity.registered, source_shadow: entity.shadow,
      first_seen: entity.first_seen, last_seen: entity.last_seen, discovery_snapshot_hash: hashCanonical(entity)
    }, 'human');
  }); }

  bind(agentId: string, humanId: string): Promise<Snapshot> { return this.mutate(async state => { await this.bindInternal(state, agentId, humanId); }); }
  issuePassport(agentId: string): Promise<Snapshot> { return this.mutate(async state => { await this.passportInternal(state, agentId); }); }
  assignMandate(agentId: string, productBuild = false): Promise<Snapshot> { return this.mutate(async state => { await this.mandateInternal(state, agentId, productBuild); }); }

  updateMandate(agentId: string, action: 'suspend' | 'reactivate' | 'revoke'): Promise<Snapshot> { return this.mutate(async state => {
    this.requireAgent(state, agentId);
    const mandate = [...(await this.policy.getState()).mandates].reverse().find(item => item.subject.agentId === agentId);
    if (!mandate) throw new DemoError('No mandate exists for this agent.', 404);
    await this.policy.updateLifecycle({ mandateId: mandate.mandateId, action });
    await this.syncWorkplaceAgent(state, agentId);
  }); }

  createRoom(agentId: string, name = 'Governed collaboration room', peerAgentIds: string[] = []): Promise<Snapshot> { return this.mutate(async state => {
    await this.requireGoverned(state, agentId);
    for (const peerId of peerAgentIds) await this.requireGoverned(state, peerId);
    const exists = state.rooms.find(room => room.name === name && room.agent_ids.includes(agentId));
    if (exists) return;
    const room = roomSchema.parse({ room_id: `ROOM-${randomUUID()}`, name, human_ids: [currentActor().human_id], agent_ids: [...new Set([agentId, ...peerAgentIds])], created_at: this.now() });
    state.rooms.push(room); await this.repository.write(state);
    await this.event('ROOM_CREATED', agentId, { room_id: room.room_id }, { name, participants: [...room.human_ids, ...room.agent_ids] }, 'human');
    for (const participant of room.agent_ids) await this.event('ROOM_JOINED', participant, { room_id: room.room_id }, { name });
  }); }

  createWork(roomId: string, agentId: string, title: string, objective: string, risk: 'standard' | 'sensitive' | 'restricted', priority: number): Promise<Snapshot> { return this.mutate(async state => {
    const { mandate } = await this.requireGoverned(state, agentId);
    this.requireRoom(state, roomId, agentId);
    await this.syncWorkplaceAgent(state, agentId);
    const before = new Set((await this.collaboration.getState()).workplace.assignments.map(item => item.id));
    const next = await this.collaboration.createAssignment({ title, objective, assigneeId: agentId, risk, priority, dependsOn: [], requestedAction: 'governed-collaboration' }, mandate.mandateId);
    const created = next.workplace.assignments.find(item => !before.has(item.id));
    if (!created) throw new DemoError('The collaboration assignment was not persisted.', 500);
    state.assignment_rooms[created.id] = roomId;
    await this.repository.write(state);
  }); }

  updateWork(assignmentId: string, status: 'queued' | 'active' | 'approval' | 'blocked' | 'complete'): Promise<Snapshot> { return this.mutate(async state => {
    if (!state.assignment_rooms[assignmentId]) throw new DemoError('The collaboration assignment was not found in a governed room.', 404);
    const room = state.rooms.find(item => item.room_id === state.assignment_rooms[assignmentId]);
    if (!room) throw new DemoError('Room not found.', 404);
    this.requireRoom(state, room.room_id, room.agent_ids[0]);
    await this.collaboration.updateAssignment({ assignmentId, status });
  }); }

  sendHandoff(assignmentId: string, fromAgentId: string, toAgentId: string, act: 'request' | 'inform' | 'propose' | 'query' | 'response' | 'handoff', subject: string, body: string): Promise<Snapshot> { return this.mutate(async state => {
    const roomId = state.assignment_rooms[assignmentId];
    if (!roomId) throw new DemoError('The collaboration assignment was not found in a governed room.', 404);
    const room = this.requireRoom(state, roomId, fromAgentId);
    if (!room.agent_ids.includes(toAgentId)) throw new DemoError('The receiving agent is not a member of this room.', 403);
    await this.requireGoverned(state, fromAgentId); await this.requireGoverned(state, toAgentId);
    const assignment = (await this.collaboration.getState()).workplace.assignments.find(item => item.id === assignmentId);
    if (!assignment || assignment.assigneeId !== fromAgentId) throw new DemoError('Only the assigned agent can send this bounded handoff.', 403);
    await this.collaboration.sendMessage({ assignmentId, fromAgentId, toAgentId, act, subject, body });
  }); }

  recordWorkResponse(assignmentId: string, agentId: string, body: string): Promise<Snapshot> { return this.mutate(async state => {
    const roomId = state.assignment_rooms[assignmentId];
    if (!roomId) throw new DemoError('The collaboration assignment was not found in a governed room.', 404);
    this.requireRoom(state, roomId, agentId); await this.requireGoverned(state, agentId);
    await this.collaboration.recordResponse({ assignmentId, agentId, body });
  }); }

  requestAction(roomId: string, agentId: string, actionName: string, idempotencyKey = `REQ-${randomUUID()}`): Promise<Snapshot> { return this.mutate(async state => {
    if (!actionLabels[actionName]) throw new DemoError('Unknown governed action.');
    const replay = state.actions.find(action => action.idempotency_key === idempotencyKey);
    if (replay) { if (replay.room_id !== roomId || replay.agent_id !== agentId || replay.action !== actionName) throw new DemoError('Idempotency key belongs to another action.', 409); return; }
    const { passport, mandate } = await this.requireGoverned(state, agentId); this.requireRoom(state, roomId, agentId);
    const evaluated = await this.policy.authorize({ agentId, mandateId: mandate.mandateId, resource: 'governance-workspace', action: actionName, parameters: {}, requestedFields: [], idempotencyKey, traceId: this.traceId(agentId) });
    const decision = evaluated.decisions.find(item => item.idempotencyKey === idempotencyKey)!;
    const action = actionSchema.parse({ action_id: `ACT-${randomUUID()}`, agent_id: agentId, passport_id: passport.passport_id, mandate_id: mandate.mandateId, room_id: roomId,
      action: actionName, label: actionLabels[actionName], status: decision.decision === 'ALLOW' ? 'pending' : decision.decision === 'DENY' ? 'denied' : 'pending',
      decision: decision.decision === 'ALLOW' ? 'ALLOWED' : decision.decision === 'DENY' ? 'DENIED' : 'REQUIRES_APPROVAL', reason: decision.reasonCode,
      approval_id: decision.approvalRequestId, requested_at: this.now(), execution_count: 0, idempotency_key: idempotencyKey });
    state.actions.push(action); await this.repository.write(state);
    if (decision.decision === 'ALLOW') await this.execute(state, action);
  }); }

  decideApproval(approvalId: string, decision: 'approve' | 'reject'): Promise<Snapshot> { return this.mutate(async state => {
    if (!['approve', 'reject'].includes(decision)) throw new DemoError('Decision must be approve or reject.');
    const action = state.actions.find(item => item.approval_id === approvalId);
    if (!action) throw new DemoError('Approval action was not found.', 404);
    const prior = (await this.policy.getState()).approvals.find(item => item.approvalRequestId === approvalId);
    if (!prior) throw new DemoError('Approval request was not found.', 404);
    if (prior.status !== 'pending') {
      if (prior.status !== (decision === 'approve' ? 'approved' : 'rejected')) throw new DemoError('This approval has already been resolved.', 409);
      if (prior.status === 'approved' && action.execution_count === 0) { await this.validateActiveAuthority(state, action); await this.execute(state, action); }
      return;
    }
    await this.validateActiveAuthority(state, action);
    await this.policy.resolveApproval({ approvalRequestId: approvalId, action: decision });
    if (decision === 'approve') await this.execute(state, action);
    else { action.status = 'rejected'; action.reason = 'APPROVAL_REJECTED'; await this.repository.write(state); }
  }); }

  proposeMemory(roomId: string, agentId: string, title = 'Reviewed governance finding', content?: string): Promise<Snapshot> { return this.mutate(async state => {
    const { passport, mandate } = await this.requireGoverned(state, agentId); this.requireRoom(state, roomId, agentId);
    const research = [...state.actions].reverse().find(action => action.agent_id === agentId && action.room_id === roomId && action.status === 'executed' && action.result);
    if (!research?.result) throw new DemoError('Execute a governed action in this room before proposing memory.');
    const memory = memorySchema.parse({ memory_id: `MEM-${randomUUID()}`, title,
      content: content ?? research.result.summary,
      status: 'proposed', created_by_agent: agentId, proposed_by: currentActor().human_id, agent_id: agentId, passport_id: passport.passport_id, mandate_id: mandate.mandateId,
      room_id: roomId, source_action_id: research.action_id, sources: [{ title: research.label, url: `urn:byosync:action:${research.action_id}` }], content_hash: '', created_at: this.now() });
    memory.content_hash = hashCanonical({ title: memory.title, content: memory.content, sources: memory.sources });
    state.memories.push(memory); await this.repository.write(state);
    await this.event('MEMORY_PROPOSED', agentId, { room_id: roomId, passport_id: passport.passport_id, mandate_id: mandate.mandateId }, { memory_id: memory.memory_id, source_action_id: research.action_id, content_hash: memory.content_hash }, 'agent');
  }); }

  reviewMemory(memoryId: string, decision: 'approve' | 'reject', content?: string, note?: string): Promise<Snapshot> { return this.mutate(async state => {
    if (!['approve', 'reject'].includes(decision)) throw new DemoError('Decision must be approve or reject.');
    const memory = state.memories.find(item => item.memory_id === memoryId);
    if (!memory) throw new DemoError('Memory was not found.', 404);
    if (memory.status !== 'proposed') throw new DemoError('Only proposed memory can be reviewed.', 409);
    if (currentActor().mode === 'named-user' && memory.proposed_by === currentActor().human_id) throw new DemoError('A different named human must review proposed memory.', 403);
    if (hashCanonical({ title: memory.title, content: memory.content, sources: memory.sources }) !== memory.content_hash) throw new DemoError('Memory content integrity failed.', 409);
    this.requireRoom(state, memory.room_id, memory.agent_id);
    const originalHash = memory.content_hash;
    if (content !== undefined) memory.content = z.string().trim().min(1).max(12000).parse(content);
    memory.status = decision === 'approve' ? 'published' : 'rejected'; memory.reviewed_by = currentActor().human_id; memory.reviewed_at = this.now(); memory.review_note = note;
    memory.content_hash = hashCanonical({ title: memory.title, content: memory.content, sources: memory.sources });
    await this.repository.write(state);
    const refs = { room_id: memory.room_id, passport_id: memory.passport_id, mandate_id: memory.mandate_id };
    await this.event('MEMORY_REVIEWED', memory.agent_id, refs, { memory_id: memoryId, decision, original_hash: originalHash, reviewed_hash: memory.content_hash, edited: originalHash !== memory.content_hash }, 'human');
    await this.event(decision === 'approve' ? 'MEMORY_PUBLISHED' : 'MEMORY_REJECTED', memory.agent_id, refs, { memory_id: memoryId, reviewed_by: currentActor().human_id }, 'human');
  }); }

  private async bindInternal(state: State, agentId: string, humanId: string) {
    this.requireAgent(state, agentId);
    if (!this.directory.people().some(person => person.human_id === humanId)) throw new DemoError('Human was not found in the configured organization.', 404);
    const existing = state.bindings.find(binding => binding.agent_id === agentId);
    if (existing) { if (existing.human_id !== humanId) throw new DemoError('Agent is already bound to a different owner.', 409); return; }
    const binding: Binding = { binding_id: `BIND-${randomUUID()}`, agent_id: agentId, human_id: humanId, relationship: 'owner', status: 'active', created_at: this.now() };
    state.bindings.push(binding); await this.repository.write(state);
    await this.event('HUMAN_BOUND', agentId, {}, { binding_id: binding.binding_id, human_id: humanId, relationship: 'owner' }, 'human');
  }

  private async passportInternal(state: State, agentId: string) {
    const agent = this.requireAgent(state, agentId);
    const binding = state.bindings.find(item => item.agent_id === agentId && item.status === 'active');
    if (!binding) throw new DemoError('Bind an existing human owner before issuing a passport.');
    const records = await this.passports.read();
    if (records.some(passport => passport.agent_id === agentId)) return;
    const workload = generateKeyPairSync('ed25519', { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    const unsigned = { passport_id: `AP-${randomUUID()}`, agent_id: agentId, name: agent.name, role: 'Governed AI collaborator', owner_org: ORGANIZATION, owner_human_id: binding.human_id,
      owner_human_proof_id: operatorProof(), runtime: 'scripted' as const, capabilities: [...allowedActions, 'evidence_export', 'product_build'], status: 'active' as const,
      workload_public_key: workload.publicKey, issued_at: this.now(), expires_at: new Date(this.clock().getTime() + 365 * 86400000).toISOString(), updated_at: this.now() };
    const passport = agentPassportSchema.parse({ ...unsigned, passport_signature: (await this.signatures.sign(unsigned, currentActor().human_id)).value });
    await this.passports.write([...records, passport]);
    await this.syncWorkplaceAgent(state, agentId);
    await this.event('PASSPORT_ISSUED', agentId, { passport_id: passport.passport_id }, { binding_id: binding.binding_id, owner_human_id: binding.human_id, identity_assurance: 'Local operator session; enterprise SSO not configured' }, 'human');
    await this.event('CLASSIFIED_MANAGED', agentId, { passport_id: passport.passport_id }, { reason: 'Valid signed passport in H2A registry' });
  }

  private async mandateInternal(state: State, agentId: string, productBuild = false) {
    await this.requirePassport(state, agentId);
    const active = (await this.policy.getState()).mandates.find(mandate => mandate.subject.agentId === agentId && mandate.status === 'active');
    if (active && (!productBuild || active.approvals.requiredActions.includes('product_build'))) return;
    if (active) await this.policy.updateLifecycle({ mandateId: active.mandateId, action: 'revoke' });
    await this.policy.create({ agentId, objective: productBuild ? 'Generate product files in reviewed, bounded room runs; no deployment or shell execution of generated code' : 'Inspect and report on the governed AI estate', resources: ['governance-workspace'], actions: allowedActions,
      prohibitedActions: ['crm_write', 'purchase'], limits: { parameterEquals: {} }, allowedFields: [], approvalActions: productBuild ? ['evidence_export', 'product_build'] : ['evidence_export'],
      delegation: { allowed: false, maxDepth: 0, allowedAgentIds: [] }, expiresAt: new Date(this.clock().getTime() + 30 * 86400000).toISOString() });
    await this.syncWorkplaceAgent(state, agentId);
  }

  private async syncWorkplaceAgent(state: State, agentId: string): Promise<void> {
    const agent = this.requireAgent(state, agentId);
    const passport = (await this.passports.read()).find(item => item.agent_id === agentId);
    if (!passport) return;
    const mandate = [...(await this.policy.getState()).mandates].reverse().find(item => item.subject.agentId === agentId);
    const snapshot = await this.workplace.getSnapshot();
    const sourceProvider = String(agent.discovery_snapshot?.provider ?? '').toLowerCase();
    const provider: AgentRuntimeSummary['provider'] = sourceProvider.includes('bedrock') ? 'bedrock' : sourceProvider.includes('claude') ? 'claude-code' : sourceProvider.includes('codex') || sourceProvider.includes('openai') ? 'openai-codex' : 'custom-cli';
    const projected: AgentRuntimeSummary = {
      id: agentId,
      passportId: passport.passport_id,
      name: agent.name,
      initials: agent.name.split(/\s+/u).map(part => part[0]).join('').slice(0, 4).toUpperCase() || 'AI',
      role: passport.role,
      provider,
      providerLabel: agent.discovery_snapshot?.provider ?? 'Census discovered',
      model: agent.discovery_snapshot?.model ?? 'Not reported',
      status: passport.status !== 'active' || (mandate && mandate.status !== 'active') ? 'blocked' : 'ready',
      currentAction: mandate?.status === 'active' ? 'Authority active' : mandate ? `Mandate ${mandate.status}` : 'Awaiting mandate',
      mandateId: mandate?.mandateId ?? 'mnd_unassigned',
      mandateLabel: mandate?.objective ?? 'No mandate assigned',
      progress: 0,
      accent: '#2563eb'
    };
    const existing = snapshot.agents.findIndex(item => item.id === agentId);
    const agents = [...snapshot.agents];
    if (existing >= 0) agents[existing] = projected; else agents.push(projected);
    await this.workplace.replaceAgents(agents);
  }

  private async requirePassport(state: State, agentId: string): Promise<AgentPassport> {
    this.requireAgent(state, agentId);
    const passport = (await this.passports.read()).find(item => item.agent_id === agentId);
    const binding = state.bindings.find(item => item.agent_id === agentId && item.status === 'active');
    if (!passport || !binding || passport.owner_human_id !== binding.human_id) throw new DemoError('A passport and active owner binding are required.');
    if (passport.status !== 'active' || (passport.expires_at && new Date(passport.expires_at).getTime() <= this.clock().getTime())) throw new DemoError('Passport authority is inactive.', 409);
    const { passport_signature, ...unsigned } = passport;
    if (!await this.signatures.verify(unsigned, { algorithm: 'Ed25519', signedBy: binding.human_id, canonicalHash: hashCanonical(unsigned), value: passport_signature })) throw new DemoError('Passport signature is invalid.', 409);
    return passport;
  }
  private async requireGoverned(state: State, agentId: string) {
    const passport = await this.requirePassport(state, agentId);
    const mandate = (await this.policy.getState()).mandates.find(item => item.subject.agentId === agentId && item.status === 'active');
    if (!mandate || new Date(mandate.expiresAt).getTime() <= this.clock().getTime()) throw new DemoError('An active mandate is required.');
    const { signature, ...unsigned } = mandate;
    if (!await this.signatures.verify(unsigned, signature)) throw new DemoError('Mandate signature is invalid.', 409);
    return { passport, mandate };
  }
  private async validateActiveAuthority(state: State, action: Action) {
    const authority = await this.requireGoverned(state, action.agent_id); this.requireRoom(state, action.room_id, action.agent_id);
    if (authority.passport.passport_id !== action.passport_id || authority.mandate.mandateId !== action.mandate_id) throw new DemoError('Action authority changed; request a fresh approval.', 409);
    if (authority.mandate.prohibitedActions.includes(action.action) || ![...authority.mandate.actions, ...authority.mandate.approvals.requiredActions].includes(action.action)) throw new DemoError('Current mandate does not authorize this action.', 409);
  }
  private async execute(state: State, action: z.infer<typeof actionSchema>) {
    if (action.execution_count !== 0) return;
    await this.validateActiveAuthority(state, action);
    if (action.approval_id) {
      const approval = (await this.policy.getState()).approvals.find(item => item.approvalRequestId === action.approval_id);
      if (!approval || approval.status !== 'approved' || approval.agentId !== action.agent_id || approval.mandateId !== action.mandate_id || approval.authorizationRequest.idempotencyKey !== action.idempotency_key || approval.authorizationRequest.action !== action.action) throw new DemoError('Human approval is required before execution.', 409);
    } else if (action.decision !== 'ALLOWED') throw new DemoError('Policy denied execution.', 409);
    const executedAt = this.now();
    if (action.action === 'inventory_report') {
      const governed = await Promise.all(state.agents.map(async agent => {
        try { await this.requireGoverned(state, agent.agent_id); return true; } catch { return false; }
      }));
      action.result = {
        summary: `AI estate report generated from ${state.agents.length} registered identities and ${state.last_scan?.agents.length ?? 0} entities in the latest Census scan.`,
        details: {
          registered_agents: state.agents.length,
          governed_agents: governed.filter(Boolean).length,
          unowned_agents: state.agents.filter(agent => !state.bindings.some(binding => binding.agent_id === agent.agent_id)).length,
          latest_scan_entities: state.last_scan?.agents.length ?? 0,
          latest_scan_shadow_entities: state.last_scan?.agents.filter(agent => agent.shadow).length ?? 0,
          generated_at: executedAt
        }
      };
    } else if (action.action === 'verify_integrity') {
      const integrity = await this.ledger.verify();
      action.result = { summary: `Evidence ledger verification completed: ${integrity.status}.`, details: { ...integrity, verified_at: executedAt } };
    } else if (action.action === 'evidence_export') {
      const events = await this.ledger.list();
      const pack = {
        schema_version: 1,
        kind: 'byosync.evidence-pack',
        generated_at: executedAt,
        organization: ORGANIZATION,
        requested_by: currentActor().human_id,
        action_id: action.action_id,
        agent_id: action.agent_id,
        passport_id: action.passport_id,
        mandate_id: action.mandate_id,
        room_id: action.room_id,
        integrity: await this.ledger.verify(),
        events
      };
      const contentHash = hashCanonical(pack);
      const relativePath = `exports/evidence-pack-${action.action_id}.json`;
      await this.store.write(relativePath, JSON.stringify({ ...pack, content_hash: contentHash }, null, 2));
      action.result = { summary: `Evidence pack exported with ${events.length} ledger records.`, details: { record_count: events.length }, artifact: { name: `evidence-pack-${action.action_id}.json`, path: relativePath, content_hash: contentHash } };
    } else {
      throw new DemoError('No execution control is configured for this action.', 409);
    }
    action.status = 'executed'; action.executed_at = executedAt; action.execution_count = 1;
    const committed = { ...action }; delete committed.execution_receipt;
    action.execution_receipt = await this.signatures.sign(committed, 'byosync-control-plane');
    await this.repository.write(state);
    await this.executionEvent(action);
  }
  private async executionEvent(action: z.infer<typeof actionSchema>, recovered = false) {
    await this.event('ACTION_EXECUTED', action.agent_id, { passport_id: action.passport_id, mandate_id: action.mandate_id, room_id: action.room_id, approval_id: action.approval_id }, { action_id: action.action_id, action: action.action, execution_count: 1, result: action.result, execution_mode: 'local-control', recovered, execution_receipt_hash: action.execution_receipt?.canonicalHash }, 'agent', action.executed_at);
  }

  private requireAgent(state: Pick<State, 'agents'>, agentId: string) { const agent = state.agents.find(item => item.agent_id === agentId); if (!agent) throw new DemoError('Agent was not registered in H2A.', 404); return agent; }
  private requireRoom(state: State, roomId: string, agentId: string) { const room = state.rooms.find(item => item.room_id === roomId); if (!room || !room.agent_ids.includes(agentId) || (currentActor().role !== 'admin' && !room.human_ids.includes(currentActor().human_id))) throw new DemoError('Agent and current user must participate in this room.', 403); return room; }
  private now() { return this.clock().toISOString(); }
  private traceId(agentId: string) { return `tr_governance_${agentId}`; }
  private async event(type: AuthorityEventType, agentId: string, refs: Partial<Pick<AuditEvent, 'passport_id' | 'mandate_id' | 'room_id' | 'approval_id'>>, metadata: Record<string, unknown>, actor: 'human' | 'agent' | 'system' = 'system', timestamp?: string) {
    const passport = (await this.passports.read()).find(item => item.agent_id === agentId);
    await this.ledger.append({ event_type: type, trace_id: this.traceId(agentId), timestamp, actor: { type: actor, id: actor === 'human' ? currentActor().human_id : actor === 'agent' ? agentId : 'byosync-control-plane' }, mandate_id: refs.mandate_id,
      payload: { agent_id: agentId, passport_id: passport?.passport_id, ...refs, ...metadata } });
  }
  private mutate(operation: (state: State) => Promise<void>): Promise<Snapshot> {
    const result = this.queue.then(async () => {
      if ((await this.ledger.verify()).status !== 'verified') throw new DemoError('Audit integrity failed; writes are blocked.', 409);
      await operation(await this.repository.read()); return this.snapshot();
    });
    this.queue = result.then(() => undefined, () => undefined); return result;
  }
  private async snapshot(): Promise<Snapshot> {
    const [state, passports, policy, records, integrity, collaboration] = await Promise.all([this.repository.read(), this.passports.read(), this.policy.getState(), this.ledger.list(), this.ledger.verify(), this.collaboration.getState()]);
    const projectedPassports = passports.map(passport => ({ passport_id: passport.passport_id, agent_id: passport.agent_id, binding_id: state.bindings.find(item => item.agent_id === passport.agent_id)?.binding_id ?? '', owner_human_id: passport.owner_human_id, status: passport.status, issued_at: passport.issued_at, expires_at: passport.expires_at, passport_signature: passport.passport_signature }));
    const mandates = policy.mandates.map((mandate: NativeMandate) => ({ mandate_id: mandate.mandateId, agent_id: mandate.subject.agentId, passport_id: mandate.subject.passportId, purpose: mandate.objective, status: mandate.status, expires_at: mandate.expiresAt, allowed_actions: mandate.actions, approval_required_actions: mandate.approvals.requiredActions, denied_actions: mandate.prohibitedActions }));
    const agents: Agent[] = await Promise.all(state.agents.map(async agent => {
      const binding = state.bindings.find(item => item.agent_id === agent.agent_id) ?? null;
      const passport = projectedPassports.find(item => item.agent_id === agent.agent_id) ?? null;
      let status: Agent['status'] = binding ? 'Owned' : 'Registered';
      try { await this.requirePassport(state, agent.agent_id); status = 'Managed'; } catch { /* H2A authority status is separate from Census discovery classification. */ }
      return { ...agent, status, governance_status: status, owner: binding ? this.directory.people().find(person => person.human_id === binding.human_id) ?? { human_id: binding.human_id, name: 'Former operator', team: 'Unassigned' } : null, binding, passport, mandate: [...mandates].reverse().find(item => item.agent_id === agent.agent_id) ?? null };
    }));
    const approvals = policy.approvals.map(approval => {
      const action = state.actions.find(item => item.approval_id === approval.approvalRequestId);
      return { approval_id: approval.approvalRequestId, agent_id: approval.agentId, mandate_id: approval.mandateId, passport_id: action?.passport_id ?? '', room_id: action?.room_id ?? '', action_id: action?.action_id ?? '', action: approval.authorizationRequest.action, status: approval.status, requested_at: approval.requestedAt, reviewed_by: approval.resolvedByHumanId, resolved_at: approval.resolvedAt };
    });
    const events: AuditEvent[] = records.map(record => {
      const mandate = policy.mandates.find(item => item.mandateId === record.mandate_id);
      const agentId = typeof record.payload.agent_id === 'string' ? record.payload.agent_id : mandate?.subject.agentId ?? (record.actor.type === 'agent' ? record.actor.id : undefined);
      const approvalId = typeof record.payload.approval_request_id === 'string' ? record.payload.approval_request_id : typeof record.payload.approval_id === 'string' ? record.payload.approval_id : undefined;
      const parent = record.parent_event_id ? records.find(item => item.event_id === record.parent_event_id) : undefined;
      const requestKey = record.payload.idempotency_key ?? parent?.payload.idempotency_key;
      const action = state.actions.find(item => (approvalId && item.approval_id === approvalId) || (requestKey && item.idempotency_key === requestKey));
      return { event_id: record.event_id, event_type: record.event_type, timestamp: record.timestamp, actor_type: record.actor.type, actor_id: record.actor.id, agent_id: agentId,
        passport_id: typeof record.payload.passport_id === 'string' ? record.payload.passport_id : mandate?.subject.passportId,
        mandate_id: record.mandate_id, room_id: typeof record.payload.room_id === 'string' ? record.payload.room_id : action?.room_id, approval_id: approvalId,
        metadata: record.payload, event_hash: record.event_hash, previous_hash: record.previous_hash };
    });
    const findings: AssuranceFinding[] = [];
    if (integrity.status !== 'verified') findings.push({ finding_id: 'FIND-INTEGRITY', title: 'Evidence ledger integrity failure', severity: 'critical', status: 'open', subject_type: 'platform', subject_id: 'evidence-ledger', summary: integrity.reason ?? 'The hash-linked ledger did not verify.', evidence_refs: [], capability: 'Inline enforced' });
    if (!state.last_scan) findings.push({ finding_id: 'FIND-DISCOVERY-COVERAGE', title: 'AI discovery coverage has not been measured', severity: 'medium', status: 'open', subject_type: 'connector', subject_id: 'agent-census', summary: this.discovery.configured ? 'Run Census discovery to establish current coverage.' : 'Configure the Agent Census connection, then run discovery.', evidence_refs: [], capability: this.discovery.configured ? 'Connector controlled' : 'Not verified' });
    for (const [index, warning] of (state.last_scan?.errors ?? []).entries()) findings.push({ finding_id: `FIND-SCAN-${index + 1}`, title: `Discovery source warning: ${warning.source}`, severity: 'high', status: 'open', subject_type: 'connector', subject_id: warning.source, summary: warning.message, evidence_refs: [state.last_scan!.scan_id], capability: 'Observe only' });
    for (const agent of agents) {
      const refs = events.filter(event => event.agent_id === agent.agent_id).slice(-4).map(event => event.event_id);
      if (!agent.binding) findings.push({ finding_id: `FIND-OWNER-${agent.agent_id}`, title: `${agent.name} has no accountable human owner`, severity: 'high', status: 'open', subject_type: 'agent', subject_id: agent.agent_id, summary: 'The identity is registered but ownership has not been bound.', evidence_refs: refs, capability: 'Inline enforced' });
      else if (!agent.passport) findings.push({ finding_id: `FIND-PASSPORT-${agent.agent_id}`, title: `${agent.name} has no Agent Passport`, severity: 'medium', status: 'open', subject_type: 'agent', subject_id: agent.agent_id, summary: 'Ownership exists, but the agent has no signed operating identity.', evidence_refs: refs, capability: 'Inline enforced' });
      else if (agent.governance_status !== 'Managed') findings.push({ finding_id: `FIND-PASSPORT-INVALID-${agent.agent_id}`, title: `${agent.name} has invalid or inactive Passport authority`, severity: 'high', status: 'open', subject_type: 'agent', subject_id: agent.agent_id, summary: 'The Passport failed the current binding, status, expiration or signature checks. Inspect its authority before allowing work.', evidence_refs: refs, capability: 'Inline enforced' });
      else if (!agent.mandate || agent.mandate.status !== 'active') findings.push({ finding_id: `FIND-MANDATE-${agent.agent_id}`, title: `${agent.name} has no active mandate`, severity: 'high', status: 'open', subject_type: 'agent', subject_id: agent.agent_id, summary: agent.mandate ? `The latest mandate is ${agent.mandate.status}.` : 'No bounded authority has been assigned.', evidence_refs: refs, capability: 'Inline enforced' });
      else if (agent.mandate.expires_at && new Date(agent.mandate.expires_at).getTime() <= this.clock().getTime()) findings.push({ finding_id: `FIND-MANDATE-EXPIRED-${agent.agent_id}`, title: `${agent.name} has an expired mandate`, severity: 'high', status: 'open', subject_type: 'agent', subject_id: agent.agent_id, summary: `Authority expired at ${agent.mandate.expires_at}. Governed execution requires current authority.`, evidence_refs: refs, capability: 'Inline enforced' });
    }
    for (const shadow of (state.last_scan?.agents ?? []).filter(item => item.shadow && !state.agents.some(agent => agent.census_agent_id === item.agent_id))) findings.push({ finding_id: `FIND-SHADOW-${shadow.agent_id}`, title: `Unregistered AI entity: ${shadow.name}`, severity: 'high', status: 'open', subject_type: 'agent', subject_id: shadow.agent_id, summary: 'Census classified this entity as shadow AI and it has not been registered in H2A.', evidence_refs: [state.last_scan!.scan_id], capability: 'Observe only' });
    const coverage = { last_scan_at: state.last_scan?.completed_at ?? null, configured_sources: state.last_scan?.configured_source_count ?? 0, observed_entities: state.last_scan?.observed_agent_ids.length ?? 0, scan_errors: state.last_scan?.errors.length ?? 0 };
    const connections: Snapshot['assurance']['connections'] = [
      { id: 'agent-census', name: 'Agent Census', status: this.discovery.configured ? (coverage.scan_errors ? 'degraded' : 'connected') : 'not-configured', capability: this.discovery.configured ? 'Connector controlled' : 'Not verified', detail: this.discovery.configured ? this.discovery.endpoint : 'Set CENSUS_API_URL and CENSUS_API_TOKEN.' },
      { id: 'h2a-control-plane', name: 'H2A control plane', status: 'connected', capability: 'Inline enforced', detail: 'Passports, mandates, approvals, containment, and the evidence ledger execute locally.' },
      { id: 'enterprise-auth', name: 'Enterprise identity provider', status: 'not-configured', capability: 'Not verified', detail: 'The current session is a local operator. Configure enterprise SSO before shared deployment.' },
      { id: 'continuous-assurance', name: 'Continuous assurance partner', status: 'not-configured', capability: 'Not verified', detail: 'No external assurance provider is configured. Internal control evidence remains available.' }
    ];
    const snapshot: Snapshot = { session: { ...currentActor(), assurance: 'Named credentials are not enterprise SSO or biometric identity proof' }, humans: this.directory.people(), agents, bindings: state.bindings, passports: projectedPassports, mandates, rooms: state.rooms, actions: state.actions, approvals, memories: state.memories, events, collaboration: { assignments: collaboration.workplace.assignments.map(item => ({ ...item, room_id: state.assignment_rooms[item.id] ?? '' })), messages: collaboration.messages, activity: collaboration.activity }, integrity, assurance: { findings, coverage, connections } };
    if (currentActor().mode === 'named-user' && currentActor().role !== 'admin') {
      // The estate inventory is organization-wide; room content is membership-only.
      const rooms = new Set(state.rooms.filter(room => room.human_ids.includes(currentActor().human_id)).map(room => room.room_id));
      snapshot.rooms = snapshot.rooms.filter(room => rooms.has(room.room_id));
      snapshot.actions = snapshot.actions.filter(action => rooms.has(action.room_id));
      snapshot.approvals = snapshot.approvals.filter(approval => rooms.has(approval.room_id));
      snapshot.memories = snapshot.memories.filter(memory => rooms.has(memory.room_id));
      snapshot.collaboration.assignments = snapshot.collaboration.assignments.filter(work => rooms.has(work.room_id));
      const assignments = new Set(snapshot.collaboration.assignments.map(work => work.id));
      snapshot.collaboration.messages = snapshot.collaboration.messages.filter(message => assignments.has(message.assignmentId));
      snapshot.collaboration.activity = snapshot.collaboration.activity.filter(activity => activity.assignmentId && assignments.has(activity.assignmentId));
      const identityEvents = new Set(['AGENT_REGISTERED_IN_H2A', 'HUMAN_BOUND', 'PASSPORT_ISSUED', 'CLASSIFIED_MANAGED']);
      snapshot.events = snapshot.events.filter(event => event.room_id ? rooms.has(event.room_id) : identityEvents.has(event.event_type));
    }
    return snapshot;
  }
}

export function createCensusProvider(baseUrl = process.env.CENSUS_API_URL ?? 'http://127.0.0.1:8011', token = process.env.CENSUS_API_TOKEN ?? ''): DiscoveryProvider {
  return { configured: Boolean(token), endpoint: baseUrl, scan: async () => {
    // Provider credentials stay in Census. This narrowly scoped service credential stays on H2A's backend.
    if (!token) throw new DemoError('Agent Discovery service unavailable', 503);
    try {
      const url = new URL('/agents/scan', baseUrl);
      if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new DemoError('Agent Discovery service unavailable', 503);
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}', redirect: 'error', signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new DemoError('Agent Discovery service unavailable', 503);
      return scanSchema.parse(await response.json());
    } catch { throw new DemoError('Agent Discovery service unavailable', 503); }
  } };
}
