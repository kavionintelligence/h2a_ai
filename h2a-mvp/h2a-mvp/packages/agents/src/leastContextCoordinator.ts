import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import {
  V2_CONTRACT_VERSION,
  connectorManifestSchema,
  leastContextStateSchema,
  prepareLeastContextRequestSchema,
  proveLeastContextRevocationRequestSchema,
  renewLeastContextGrantRequestSchema,
  runLeastContextLaneRequestSchema,
  taskEnvelopeSchema,
  type AgentIdentityState,
  type CeremonyCorrelation,
  type ConnectorImportRequest,
  type ContextBrokerState,
  type ContextGrantLifecycleRequest,
  type CreateContextArtifactRequest,
  type GovernedAgentMessage,
  type GuidedBootstrapState,
  type IssueContextGrantRequest,
  type LeastContextLaneId,
  type LeastContextState,
  type PrepareLeastContextRequest,
  type RealCollaborationState,
  type RecordGovernedMessageRequest,
  type TaskEnvelope
} from '@h2a/contracts';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { LocalProcessTransport, type MessageBroker } from '@h2a/messaging';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const LANE_ORDER: LeastContextLaneId[] = ['claude-code', 'gemini-antigravity', 'framework', 'openai-codex'];
const PURPOSE: Record<LeastContextLaneId, string> = {
  'claude-code': 'review authorized incident controls',
  'gemini-antigravity': 'review authorized architecture context',
  framework: 'validate authorized interoperability context',
  'openai-codex': 'consolidate authorized evidence references'
};
const RULES: Record<LeastContextLaneId, Array<{ field: string; maximum_classification: 'internal' | 'confidential' | 'restricted'; transformation: 'value' | 'mask' | 'summarize' | 'reference' }>> = {
  'claude-code': [{ field: 'case_id', maximum_classification: 'internal', transformation: 'value' }, { field: 'system_name', maximum_classification: 'internal', transformation: 'value' }],
  'gemini-antigravity': [{ field: 'case_id', maximum_classification: 'internal', transformation: 'value' }, { field: 'owner_email', maximum_classification: 'confidential', transformation: 'mask' }],
  framework: [{ field: 'case_id', maximum_classification: 'internal', transformation: 'value' }, { field: 'control_summary', maximum_classification: 'confidential', transformation: 'summarize' }],
  'openai-codex': [{ field: 'case_id', maximum_classification: 'internal', transformation: 'value' }, { field: 'recovery_secret', maximum_classification: 'restricted', transformation: 'reference' }]
};
const ALL_FIELDS = ['case_id', 'system_name', 'owner_email', 'control_summary', 'recovery_secret'];

const protectedKeySchema = z.object({ connector_manifest_id: z.string().min(1), sealed_runtime_private_key: z.string().min(1) }).strict();
type ProtectedKey = z.infer<typeof protectedKeySchema>;

export interface LeastContextKeyProtector { seal(value: string): Promise<string>; open(value: string): Promise<string>; }
export interface LeastContextPorts {
  bootstrap: { getState(): Promise<GuidedBootstrapState> };
  realCollaboration: { getState(): Promise<RealCollaborationState> };
  agents: { getState(): Promise<AgentIdentityState> };
  organization: { signOrganizationRecord(value: unknown): Promise<{ canonicalHash: string; signature: string }>; getOrganizationPublicKey(): Promise<string> };
  ceremony: { assertBinding(ceremonyId: string, traceId: string): Promise<unknown> };
  context: {
    getState(): Promise<ContextBrokerState>;
    createArtifact(request: CreateContextArtifactRequest): Promise<ContextBrokerState>;
    issueGrant(request: IssueContextGrantRequest): Promise<ContextBrokerState>;
    updateGrant(request: ContextGrantLifecycleRequest): Promise<ContextBrokerState>;
    authorize(task: TaskEnvelope, request: { context_grant_id: string; requested_fields: string[]; purpose: string }): Promise<{ authorized: boolean; reason_code: string; granted_fields: Record<string, unknown>; withheld_fields: string[] }>;
  };
  connectors: { import(request: ConnectorImportRequest): Promise<unknown> };
  messages: Pick<MessageBroker, 'enqueue' | 'deliver' | 'recordGovernedMessage' | 'nextGovernedMessageSequence'>;
}

export class LeastContextCoordinator {
  private readonly repository: VersionedJsonRepository<'h2a.least-context.state', LeastContextState>;
  private readonly keys: VersionedJsonRepository<'h2a.least-context.keys', ProtectedKey[]>;
  private queue: Promise<void> = Promise.resolve();

  public constructor(dataPath: string, private readonly evidence: EvidenceLedgerPort, private readonly ports: LeastContextPorts, private readonly protector: LeastContextKeyProtector, private readonly projectRoot: string, private readonly clock: () => Date = () => new Date()) {
    const store = new AtomicFileStore(dataPath);
    this.repository = new VersionedJsonRepository(store, 'contexts/phase27-state-v1.json', 'h2a.least-context.state', leastContextStateSchema, { initialData: emptyState(clock), clock });
    this.keys = new VersionedJsonRepository(store, 'contexts/private/phase27-connector-keys-v1.json', 'h2a.least-context.keys', z.array(protectedKeySchema), { initialData: [], clock });
  }

  public async initialize(): Promise<LeastContextState> { await Promise.all([this.repository.read(), this.keys.read()]); return this.getState(); }
  public getState(): Promise<LeastContextState> { return this.serialize(() => this.repository.read()); }

  public prepare(request: PrepareLeastContextRequest): Promise<LeastContextState> {
    return this.serialize(async () => {
      const input = prepareLeastContextRequestSchema.parse(request);
      await this.ports.ceremony.assertBinding(input.ceremony.ceremony_id, input.ceremony.trace_id);
      const current = await this.repository.read();
      const recovering = input.recovery_mode && current.ceremony_id === input.ceremony.ceremony_id && Boolean(current.artifact_id);
      if (current.ceremony_id === input.ceremony.ceremony_id && current.artifact_id && !recovering) return current;
      const [bootstrap, phase26, identity] = await Promise.all([this.ports.bootstrap.getState(), this.ports.realCollaboration.getState(), this.ports.agents.getState()]);
      if (bootstrap.ceremony_id !== input.ceremony.ceremony_id || bootstrap.trace_id !== input.ceremony.trace_id) throw new Error('Phase 25 bootstrap belongs to a different ceremony.');
      if (phase26.ceremony_id !== input.ceremony.ceremony_id || phase26.trace_id !== input.ceremony.trace_id || !phase26.lanes.every((lane) => lane.status === 'succeeded' && lane.output_hash)) throw new Error('All four Phase 26 lanes must succeed on this ceremony trace before Phase 27.');

      const organization = organizationId(identity, bootstrap);
      const artifactFields = [
        { field: 'case_id', classification: 'internal' as const, value: input.fields.case_id },
        { field: 'system_name', classification: 'internal' as const, value: input.fields.system_name },
        { field: 'owner_email', classification: 'confidential' as const, value: input.fields.owner_email },
        { field: 'control_summary', classification: 'confidential' as const, value: input.fields.control_summary },
        { field: 'recovery_secret', classification: 'restricted' as const, value: input.fields.recovery_secret }
      ];
      let contextState = await this.ports.context.getState();
      let artifact = recovering ? undefined : contextState.artifacts.find((item) => item.organization_id === organization && item.name === input.artifact_name && item.source_resource === input.source_resource && item.status === 'active' && artifactFields.every((field) => item.fields.some((candidate) => candidate.field === field.field && candidate.classification === field.classification && candidate.value_hash === hashCanonical(field.value))));
      if (!artifact) {
        contextState = await this.ports.context.createArtifact({ actor: input.actor, ceremony: correlation(input.ceremony, 'artifact'), organization_id: organization, name: input.artifact_name, source_resource: input.source_resource, fields: artifactFields });
        artifact = [...contextState.artifacts].reverse().find((item) => item.organization_id === organization && item.name === input.artifact_name && item.source_resource === input.source_resource && artifactFields.every((field) => item.fields.some((candidate) => candidate.field === field.field && candidate.value_hash === hashCanonical(field.value))));
      }
      if (!artifact) throw new Error('Phase 27 protected artifact was not persisted.');

      const lanes = [] as LeastContextState['lanes'];
      for (const laneId of LANE_ORDER) {
        const participant = bootstrap.participants.find((item) => item.lane === laneId);
        const phase26Lane = phase26.lanes.find((item) => item.lane_id === laneId);
        if (!participant?.agent_id || !participant.passport_id || !participant.runtime_session_id || !phase26Lane?.mandate_id || !phase26Lane.assignment_id) {
          const missing = [!participant?.agent_id && 'durable agent', !participant?.passport_id && 'Passport', !participant?.runtime_session_id && 'runtime session', !phase26Lane?.mandate_id && 'active mandate', !phase26Lane?.assignment_id && 'mandate-bound assignment'].filter((value): value is string => Boolean(value));
          throw new Error(`Phase 27 could not resolve ${laneId}: ${missing.join(', ')}. Refresh Phase 26 and repair signed authority.`);
        }
        const connector = await this.ensureConnector(laneId, input.ceremony);
        let grant = [...contextState.grants].reverse().find((item) => item.status === 'active' && item.grant.task_id === phase26Lane.assignment_id && item.grant.mandate_id === phase26Lane.mandate_id && item.grant.recipient_agent_id === participant.agent_id && item.grant.recipient_passport_id === participant.passport_id && item.grant.purpose === PURPOSE[laneId] && item.grant.artifact_refs.includes(artifact.artifact_id));
        if (!grant) {
          contextState = await this.ports.context.issueGrant({
            actor: input.actor, ceremony: correlation(input.ceremony, `grant_${laneId}`), organization_id: artifact.organization_id,
            task_id: phase26Lane.assignment_id, mandate_id: phase26Lane.mandate_id, recipient_agent_id: participant.agent_id, recipient_passport_id: participant.passport_id,
            purpose: PURPOSE[laneId], field_rules: RULES[laneId].map((rule) => ({ artifact_id: artifact.artifact_id, ...rule })), token_budget: 120, maximum_uses: 2,
            expires_at: new Date(this.clock().getTime() + 120 * 60_000).toISOString()
          });
          grant = [...contextState.grants].reverse().find((item) => item.grant.task_id === phase26Lane.assignment_id && item.grant.recipient_agent_id === participant.agent_id && item.grant.artifact_refs.includes(artifact.artifact_id));
        }
        if (!grant) throw new Error(`Phase 27 Context Grant was not persisted for ${laneId}.`);
        lanes.push({ lane_id: laneId, title: laneTitle(laneId), status: 'ready', agent_id: participant.agent_id, passport_id: participant.passport_id, runtime_session_id: participant.runtime_session_id, mandate_id: phase26Lane.mandate_id, assignment_id: phase26Lane.assignment_id, connector_manifest_id: connector, context_grant_id: grant.grant.context_grant_id, requested_fields: ALL_FIELDS, released_fields: [], withheld_fields: [], transformations: {}, token_budget: grant.grant.token_budget, projected_tokens: null, use_count: 0, disclosure_id: null, delivery_id: null, handoff_message_id: null, projection_hash: null, output_hash: null, execution_kind: null, provider_output_hash: null, predecessor_hashes: [], error: null });
      }
      if (recovering) {
        for (const prior of current.lanes) {
          const record = contextState.grants.find((item) => item.grant.context_grant_id === prior.context_grant_id);
          if (record?.status === 'active') {
            contextState = await this.ports.context.updateGrant({ actor: input.actor, context_grant_id: record.grant.context_grant_id, action: 'revoke', ceremony: correlation(input.ceremony, `supersede_grant_${prior.lane_id}`) });
          }
        }
      }
      const next = leastContextStateSchema.parse({ ...current, ceremony_id: input.ceremony.ceremony_id, trace_id: input.ceremony.trace_id, status: 'ready', artifact_id: artifact.artifact_id, artifact_name: artifact.name, lanes, revocation: recovering ? { context_grant_id: null, disclosure_id: null, reason_code: null, provider_launch_blocked: false, passed: false } : current.revocation, last_error: null, updated_at: this.clock().toISOString() });
      await this.repository.write(next);
      await this.evidence.append({ trace_id: input.ceremony.trace_id, actor: { type: 'system', id: 'h2a-least-context' }, subject: { type: 'context_artifact', id: artifact.artifact_id }, event_type: 'LEAST_CONTEXT_WORKFLOW_PREPARED', payload: { ceremony_id: input.ceremony.ceremony_id, recovery_mode: recovering, superseded_artifact_id: recovering ? current.artifact_id : undefined, lane_grants: lanes.map((lane) => ({ lane_id: lane.lane_id, context_grant_id: lane.context_grant_id, token_budget: lane.token_budget })), idempotency_key: input.ceremony.idempotency_key } });
      return next;
    });
  }

  public runLane(request: unknown): Promise<LeastContextState> {
    return this.serialize(async () => {
      const input = runLeastContextLaneRequestSchema.parse(request);
      await this.ports.ceremony.assertBinding(input.ceremony.ceremony_id, input.ceremony.trace_id);
      let current = await this.repository.read();
      this.requireCeremony(current, input.ceremony);
      const index = LANE_ORDER.indexOf(input.lane_id);
      if (!current.lanes.slice(0, index).every((lane) => lane.status === 'acknowledged')) throw new Error(`Complete every preceding Phase 27 handoff before ${input.lane_id}.`);
      const lane = current.lanes[index];
      if (lane.status === 'acknowledged') return current;
      if (!lane.connector_manifest_id || !lane.context_grant_id || !lane.assignment_id || !lane.agent_id || !lane.passport_id || !lane.runtime_session_id || !lane.mandate_id) throw new Error('Phase 27 lane authority is incomplete.');
      current = replaceLane(current, input.lane_id, { status: 'running', error: null }); await this.repository.write(current);
      const phase26 = await this.ports.realCollaboration.getState();
      const predecessorHashes = [...phase26.lanes.slice(0, index + 1).map((item) => item.output_hash).filter((value): value is string => Boolean(value)), ...current.lanes.slice(0, index).map((item) => item.output_hash).filter((value): value is string => Boolean(value))];
      const task = await this.taskFor(lane, input.ceremony, index, predecessorHashes);
      const queued = await this.ports.messages.enqueue(task, lane.connector_manifest_id, await this.ports.organization.getOrganizationPublicKey());
      const directory = await mkdtemp(join(tmpdir(), 'h2a-phase27-'));
      const keyPath = join(directory, 'runtime-private.pem');
      const privateKey = await this.openKey(lane.connector_manifest_id);
      await writeFile(keyPath, privateKey, { encoding: 'utf8', mode: 0o600 });
      const transport = new LocalProcessTransport({ command: process.execPath, args: [resolve(this.projectRoot, 'out/main/phase27ContextAgent.js')], connectorManifestId: lane.connector_manifest_id, connectorPrivateKeyPath: keyPath, cwd: resolve(this.projectRoot), timeoutMs: 210_000, env: { ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}), H2A_REQUESTED_FIELDS: ALL_FIELDS.join(','), H2A_PHASE27_PROVIDER: input.lane_id, H2A_PHASE27_WORKSPACE: resolve(this.projectRoot) } });
      try {
        const delivered = await this.ports.messages.deliver(queued.delivery_id, transport);
        if (delivered.status !== 'acknowledged' || !delivered.result_frame?.payload_hash) throw new Error(delivered.last_error ?? 'Phase 27 signed connector delivery failed.');
        const contextState = await this.ports.context.getState();
        const disclosure = contextState.disclosures.find((item) => item.task_id === lane.assignment_id && item.context_grant_id === lane.context_grant_id);
        if (!disclosure || disclosure.status !== 'authorized') throw new Error('Phase 27 connector was acknowledged without an authorized disclosure receipt.');
        const recipient = current.lanes[(index + 1) % current.lanes.length];
        const handoffSequence = await this.ports.messages.nextGovernedMessageSequence(lane.connector_manifest_id, lane.assignment_id);
        const handoff = await this.recordHandoff(lane, recipient, input.ceremony, delivered.result_frame.payload_hash, privateKey, handoffSequence);
        const output = (delivered.result_frame.payload as { output?: { projected_tokens?: unknown; execution_kind?: unknown; provider_output_hash?: unknown } }).output;
        const expectedExecution = input.lane_id === 'framework' ? 'signed-framework-connector' : 'official-provider-cli';
        if (output?.execution_kind !== expectedExecution || typeof output.provider_output_hash !== 'string') throw new Error(`Phase 27 ${input.lane_id} did not return the required real execution proof.`);
        current = replaceLane(current, input.lane_id, { status: 'acknowledged', released_fields: disclosure.granted_fields, withheld_fields: disclosure.withheld_fields, transformations: disclosure.transformation_by_field, projected_tokens: typeof output?.projected_tokens === 'number' ? output.projected_tokens : null, use_count: contextState.grants.find((item) => item.grant.context_grant_id === lane.context_grant_id)?.use_count ?? 0, disclosure_id: disclosure.disclosure_id, delivery_id: delivered.delivery_id, handoff_message_id: handoff.message_id, projection_hash: disclosure.projection_hash, output_hash: delivered.result_frame.payload_hash, execution_kind: expectedExecution, provider_output_hash: output.provider_output_hash, predecessor_hashes: predecessorHashes, error: null });
        if (current.lanes.every((item) => item.status === 'acknowledged')) current = leastContextStateSchema.parse({ ...current, status: 'succeeded', updated_at: this.clock().toISOString() });
        await this.repository.write(current);
        return current;
      } catch (error) {
        current = replaceLane(current, input.lane_id, { status: 'ready', error: errorMessage(error) }); await this.repository.write(current); throw error;
      } finally { await transport.close(); await rm(directory, { recursive: true, force: true }); }
    });
  }

  public renewGrant(request: unknown): Promise<LeastContextState> {
    return this.serialize(async () => {
      const input = renewLeastContextGrantRequestSchema.parse(request);
      await this.ports.ceremony.assertBinding(input.ceremony.ceremony_id, input.ceremony.trace_id);
      const current = await this.repository.read();
      this.requireCeremony(current, input.ceremony);
      const lane = current.lanes.find((item) => item.lane_id === input.lane_id);
      if (!lane?.context_grant_id || !lane.assignment_id || !lane.agent_id || !lane.passport_id || !lane.mandate_id) throw new Error('Selected Phase 27 lane authority is incomplete.');
      let context = await this.ports.context.getState();
      const prior = context.grants.find((item) => item.grant.context_grant_id === lane.context_grant_id);
      if (!prior) throw new Error('Selected Phase 27 Context Grant could not be resolved.');
      if (prior.status === 'active' && new Date(prior.grant.expires_at).getTime() > this.clock().getTime()) return current;
      const artifact = context.artifacts.find((item) => item.artifact_id === current.artifact_id && item.status === 'active');
      if (!artifact) throw new Error('The sealed Phase 27 artifact is not active.');
      const phase26 = await this.ports.realCollaboration.getState();
      const liveAuthority = phase26.lanes.find((item) => item.lane_id === input.lane_id && item.status === 'succeeded' && item.assignment_id && item.mandate_id);
      if (!liveAuthority?.assignment_id || !liveAuthority.mandate_id) throw new Error('Selected lane has no current signed Phase 26 assignment and mandate.');
      context = await this.ports.context.issueGrant({
        actor: input.actor,
        ceremony: correlation(input.ceremony, `renew_grant_${input.lane_id}`),
        organization_id: prior.grant.organization_id,
        task_id: liveAuthority.assignment_id,
        mandate_id: liveAuthority.mandate_id,
        recipient_agent_id: prior.grant.recipient_agent_id,
        recipient_passport_id: prior.grant.recipient_passport_id,
        purpose: prior.grant.purpose,
        field_rules: prior.field_rules,
        token_budget: prior.grant.token_budget,
        maximum_uses: prior.maximum_uses,
        expires_at: new Date(this.clock().getTime() + 120 * 60_000).toISOString()
      });
      const replacement = [...context.grants].reverse().find((item) => item.status === 'active' && item.grant.context_grant_id !== prior.grant.context_grant_id && item.grant.task_id === liveAuthority.assignment_id && item.grant.mandate_id === liveAuthority.mandate_id && item.grant.recipient_agent_id === prior.grant.recipient_agent_id && item.grant.recipient_passport_id === prior.grant.recipient_passport_id && item.grant.purpose === prior.grant.purpose && item.grant.allowed_fields.join('\u0000') === prior.grant.allowed_fields.join('\u0000'));
      if (!replacement) throw new Error('Replacement Context Grant was not persisted.');
      const next = replaceLane(current, input.lane_id, { context_grant_id: replacement.grant.context_grant_id, assignment_id: liveAuthority.assignment_id, mandate_id: liveAuthority.mandate_id, runtime_session_id: liveAuthority.runtime_session_id ?? lane.runtime_session_id, token_budget: replacement.grant.token_budget, use_count: 0, error: null });
      await this.repository.write(next);
      return next;
    });
  }

  public proveRevocation(request: unknown): Promise<LeastContextState> {
    return this.serialize(async () => {
      const input = proveLeastContextRevocationRequestSchema.parse(request);
      await this.ports.ceremony.assertBinding(input.ceremony.ceremony_id, input.ceremony.trace_id);
      let current = await this.repository.read(); this.requireCeremony(current, input.ceremony);
      if (current.status !== 'succeeded' && current.status !== 'revocation-proved') throw new Error('Complete all four Phase 27 deliveries before the revocation proof.');
      if (current.revocation.passed) return current;
      const lane = current.lanes.find((item) => item.lane_id === input.lane_id);
      if (!lane?.context_grant_id || !lane.assignment_id || !lane.agent_id || !lane.passport_id || !lane.runtime_session_id || !lane.mandate_id) throw new Error('Revocation target authority is incomplete.');
      await this.ports.context.updateGrant({ actor: input.actor, ceremony: correlation(input.ceremony, `revoke_${input.lane_id}`), context_grant_id: lane.context_grant_id, action: 'revoke' });
      const task = await this.taskFor(lane, input.ceremony, 99, lane.predecessor_hashes);
      const response = await this.ports.context.authorize(task, { context_grant_id: lane.context_grant_id, requested_fields: ['case_id', 'revocation_probe'], purpose: PURPOSE[input.lane_id] });
      const contextState = await this.ports.context.getState();
      const disclosure = contextState.disclosures.find((item) => item.context_grant_id === lane.context_grant_id && item.reason_code === 'CONTEXT_GRANT_REVOKED');
      if (response.authorized || response.reason_code !== 'CONTEXT_GRANT_REVOKED' || !disclosure) throw new Error('Revocation proof did not fail closed with a durable denial receipt.');
      current = leastContextStateSchema.parse({ ...current, status: 'revocation-proved', revocation: { context_grant_id: lane.context_grant_id, disclosure_id: disclosure.disclosure_id, reason_code: response.reason_code, provider_launch_blocked: true, passed: true }, updated_at: this.clock().toISOString() });
      await this.repository.write(current);
      await this.evidence.append({ trace_id: input.ceremony.trace_id, actor: { type: 'system', id: 'h2a-least-context' }, subject: { type: 'context_disclosure', id: disclosure.disclosure_id }, mandate_id: lane.mandate_id, event_type: 'LEAST_CONTEXT_REVOCATION_PROVED', payload: { context_grant_id: lane.context_grant_id, reason_code: response.reason_code, provider_launch_blocked: true, released_fields: [] } });
      return current;
    });
  }

  private async ensureConnector(lane: LeastContextLaneId, ceremony: CeremonyCorrelation): Promise<string> {
    const connectorId = `connector_phase27_${lane.replaceAll('-', '_')}_v1`;
    const publisher = generateKeyPairSync('ed25519'); const runtime = generateKeyPairSync('ed25519');
    const publisherPrivate = publisher.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const runtimePrivate = runtime.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const unsigned = { schema_version: V2_CONTRACT_VERSION, connector_manifest_id: connectorId, name: `H2A Phase 27 ${laneTitle(lane)}`, provider: lane, adapter_version: '1.0.0', protocol: 'local-cli' as const, auth_method: 'none' as const, trust_ceiling: 'connected-observed' as const, capabilities: ['task.receive', 'context.request', 'result.return', 'acknowledgement.return'], executable: process.execPath, h2a_extension_required: true, status: 'available' as const, probed_at: this.clock().toISOString() };
    const manifest = connectorManifestSchema.parse({ ...unsigned, canonical_hash: hashCanonical(unsigned), publisher_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), publisherPrivate).toString('base64')}` });
    await this.ports.connectors.import({ manifest, publisher_public_key_pem: publisher.publicKey.export({ type: 'spki', format: 'pem' }).toString(), runtime_public_key_pem: runtime.publicKey.export({ type: 'spki', format: 'pem' }).toString(), ceremony: correlation(ceremony, `connector_${lane}`) });
    const keys = await this.keys.read();
    await this.keys.write([...keys.filter((item) => item.connector_manifest_id !== connectorId), { connector_manifest_id: connectorId, sealed_runtime_private_key: await this.protector.seal(runtimePrivate) }]);
    return connectorId;
  }

  private async taskFor(lane: LeastContextState['lanes'][number], ceremony: CeremonyCorrelation, sequence: number, predecessors: string[]): Promise<TaskEnvelope> {
    const unsigned = { schema_version: V2_CONTRACT_VERSION, task_id: lane.assignment_id!, organization_id: (await this.ports.agents.getState()).passportsV2?.find((item) => item.passport_id === lane.passport_id)?.organization_id ?? 'org_hp_demo', trace_id: ceremony.trace_id, ceremony_id: ceremony.ceremony_id, requestor_human_id: (await this.ports.agents.getState()).passportsV2?.find((item) => item.passport_id === lane.passport_id)?.sponsor_human_id ?? 'unknown', assigned_agent_id: lane.agent_id!, passport_id: lane.passport_id!, runtime_attestation_id: (await this.ports.agents.getState()).runtimeSessions?.find((item) => item.runtime_session_id === lane.runtime_session_id)?.runtime_attestation_id ?? 'unresolved', mandate_id: lane.mandate_id!, context_grant_id: lane.context_grant_id!, objective: PURPOSE[lane.lane_id], dependency_task_ids: predecessors.map((_, index) => `predecessor_${index}`), output_contract: { type: 'object', values: 'excluded', predecessor_hashes: predecessors }, sequence, idempotency_key: `${ceremony.idempotency_key}_${lane.lane_id}_${sequence}`, issued_at: this.clock().toISOString(), expires_at: new Date(this.clock().getTime() + 10 * 60_000).toISOString() };
    const signed = await this.ports.organization.signOrganizationRecord(unsigned);
    return taskEnvelopeSchema.parse({ ...unsigned, canonical_hash: signed.canonicalHash, organization_signature: signed.signature });
  }

  private async recordHandoff(sender: LeastContextState['lanes'][number], recipient: LeastContextState['lanes'][number], ceremony: CeremonyCorrelation, contentHash: string, privateKey: string, sequence: number): Promise<GovernedAgentMessage> {
    const unsigned: Omit<RecordGovernedMessageRequest, 'sender_signature'> = { message_id: `message_phase27_${randomUUID()}`, organization_id: (await this.ports.agents.getState()).passportsV2?.find((item) => item.passport_id === sender.passport_id)?.organization_id ?? 'org_hp_demo', task_id: sender.assignment_id!, trace_id: ceremony.trace_id, sender_connector_manifest_id: sender.connector_manifest_id!, recipient_connector_manifest_id: recipient.connector_manifest_id!, sender_passport_id: sender.passport_id!, recipient_passport_id: recipient.passport_id!, mandate_id: sender.mandate_id!, context_grant_id: sender.context_grant_id!, speech_act: 'handoff', content_ref: `phase27-projection-${sender.lane_id}`, content_hash: contentHash, sequence, deduplication_id: `${ceremony.idempotency_key}_handoff_${sender.lane_id}`, created_at: this.clock().toISOString(), expires_at: new Date(this.clock().getTime() + 60 * 60_000).toISOString() };
    return this.ports.messages.recordGovernedMessage({ ...unsigned, sender_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), privateKey).toString('base64')}` });
  }

  private async openKey(connectorId: string): Promise<string> { const key = (await this.keys.read()).find((item) => item.connector_manifest_id === connectorId); if (!key) throw new Error('Phase 27 connector signing key is unavailable.'); return this.protector.open(key.sealed_runtime_private_key); }
  private requireCeremony(state: LeastContextState, ceremony: CeremonyCorrelation): void { if (state.ceremony_id !== ceremony.ceremony_id || state.trace_id !== ceremony.trace_id) throw new Error('Phase 27 state belongs to a different ceremony.'); }
  private serialize<T>(operation: () => Promise<T>): Promise<T> { const result = this.queue.then(operation); this.queue = result.then(() => undefined, () => undefined); return result; }
}

function emptyState(clock: () => Date): LeastContextState { return leastContextStateSchema.parse({ schema_version: 1, ceremony_id: null, trace_id: null, status: 'not-started', artifact_id: null, artifact_name: null, lanes: LANE_ORDER.map((lane_id) => ({ lane_id, title: laneTitle(lane_id), status: 'not-ready', agent_id: null, passport_id: null, runtime_session_id: null, mandate_id: null, assignment_id: null, connector_manifest_id: null, context_grant_id: null, requested_fields: ALL_FIELDS, released_fields: [], withheld_fields: [], transformations: {}, token_budget: 120, projected_tokens: null, use_count: 0, disclosure_id: null, delivery_id: null, handoff_message_id: null, projection_hash: null, output_hash: null, execution_kind: null, provider_output_hash: null, predecessor_hashes: [], error: null })), revocation: { context_grant_id: null, disclosure_id: null, reason_code: null, provider_launch_blocked: false, passed: false }, last_error: null, updated_at: clock().toISOString() }); }
function replaceLane(state: LeastContextState, laneId: LeastContextLaneId, patch: Partial<LeastContextState['lanes'][number]>): LeastContextState { return leastContextStateSchema.parse({ ...state, status: patch.status === 'running' ? 'running' : state.status, lanes: state.lanes.map((lane) => lane.lane_id === laneId ? { ...lane, ...patch } : lane), updated_at: new Date().toISOString() }); }
function laneTitle(lane: LeastContextLaneId): string { return ({ 'claude-code': 'Claude bounded disclosure', 'gemini-antigravity': 'Antigravity masked disclosure', framework: 'Framework summarized disclosure', 'openai-codex': 'Codex reference-only disclosure' })[lane]; }
function organizationId(identity: AgentIdentityState, bootstrap: GuidedBootstrapState): string { const passportId = bootstrap.participants.find((item) => item.passport_id)?.passport_id; const organization = identity.passportsV2?.find((item) => item.passport_id === passportId)?.organization_id; if (!organization) throw new Error('Phase 25 organization identity is unavailable.'); return organization; }
function correlation(ceremony: CeremonyCorrelation, action: string): CeremonyCorrelation { return { ceremony_id: ceremony.ceremony_id, trace_id: ceremony.trace_id, idempotency_key: `${ceremony.idempotency_key}_${action}`.slice(0, 200) }; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Phase 27 operation failed.'; }
