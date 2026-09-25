import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  V2_CONTRACT_VERSION,
  contextArtifactSchema,
  contextBrokerStateSchema,
  contextDisclosureSchema,
  contextGrantLifecycleRequestSchema,
  contextResponsePayloadSchema,
  createContextArtifactRequestSchema,
  governedContextGrantSchema,
  issueContextGrantRequestSchema,
  type AuthorityActor,
  type ContextArtifact,
  type ContextBrokerState,
  type ContextDisclosure,
  type ContextGrantLifecycleRequest,
  type ContextRequestPayload,
  type ContextResponsePayload,
  type ContextTransformation,
  type CreateContextArtifactRequest,
  type GovernedContextGrant,
  type IssueContextGrantRequest,
  type TaskEnvelope
} from '@h2a/contracts';
import { hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const sealedArtifactSchema = z.object({
  encrypted_payload_ref: z.string().min(1),
  artifact_id: z.string().min(1),
  sealed_payload: z.string().min(1),
  payload_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  created_at: z.string().datetime({ offset: true })
}).strict();
type SealedArtifact = z.infer<typeof sealedArtifactSchema>;

export interface ContextPayloadProtector {
  seal(plaintext: string): Promise<string>;
  open(ciphertext: string): Promise<string>;
}

export interface ContextAuthorityPort {
  authorizeProtectedOperation(context: { organizationId: string; membershipId: string; humanProofId: string; authorityCredentialId: string } | undefined, resource: string, action: string, requiredApprovalPower?: string): Promise<{ humanId: string; humanProofId: string }>;
  signOrganizationRecord(value: unknown): Promise<{ canonicalHash: string; signature: string }>;
}

export interface ContextRecipientPort {
  assertRecipient(input: { organizationId: string; taskId: string; mandateId: string; agentId: string; passportId: string }): Promise<void>;
}

export class ContextBrokerService {
  private readonly artifacts: VersionedJsonRepository<'h2a.v2.context-artifacts', ContextArtifact[]>;
  private readonly sealed: VersionedJsonRepository<'h2a.v2.context-artifact-secrets', SealedArtifact[]>;
  private readonly grants: VersionedJsonRepository<'h2a.v2.context-grants', GovernedContextGrant[]>;
  private readonly disclosures: VersionedJsonRepository<'h2a.v2.context-disclosures', ContextDisclosure[]>;
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly evidence: EvidenceLedgerPort,
    private readonly authority: ContextAuthorityPort,
    private readonly recipients: ContextRecipientPort,
    private readonly protector: ContextPayloadProtector,
    private readonly clock: () => Date = () => new Date()
  ) {
    const store = new AtomicFileStore(dataPath);
    this.artifacts = new VersionedJsonRepository(store, 'contexts/artifacts-v2.json', 'h2a.v2.context-artifacts', z.array(contextArtifactSchema), { initialData: [], clock });
    this.sealed = new VersionedJsonRepository(store, 'contexts/private/artifact-payloads-v2.json', 'h2a.v2.context-artifact-secrets', z.array(sealedArtifactSchema), { initialData: [], clock });
    this.grants = new VersionedJsonRepository(store, 'contexts/grants-v2.json', 'h2a.v2.context-grants', z.array(governedContextGrantSchema), { initialData: [], clock });
    this.disclosures = new VersionedJsonRepository(store, 'contexts/disclosures-v2.json', 'h2a.v2.context-disclosures', z.array(contextDisclosureSchema).max(500), { initialData: [], clock });
  }

  public async initialize(): Promise<void> {
    await Promise.all([this.artifacts.read(), this.sealed.read(), this.grants.read(), this.disclosures.read()]);
    await this.getState();
  }

  public getState(): Promise<ContextBrokerState> {
    return this.serialize(async () => {
      await this.expireGrants();
      return contextBrokerStateSchema.parse({ artifacts: await this.artifacts.read(), grants: await this.grants.read(), disclosures: await this.disclosures.read(), messages: [] });
    });
  }

  public createArtifact(request: CreateContextArtifactRequest): Promise<ContextBrokerState> {
    return this.serialize(async () => {
      const input = createContextArtifactRequestSchema.parse(request);
      if (input.fields.some((item) => item.value === undefined)) throw new Error('Artifact fields cannot contain undefined values.');
      const actor = await this.authorizeActor(input.actor, input.organization_id, 'context-artifact', 'create');
      const now = this.clock().toISOString();
      const artifactId = `artifact_${randomUUID()}`;
      const payloadRef = `sealed_${randomUUID()}`;
      const payload = Object.fromEntries(input.fields.map((item) => [item.field, item.value]));
      const unsigned = {
        artifact_id: artifactId,
        organization_id: input.organization_id,
        name: input.name,
        source_resource: input.source_resource,
        owner_human_id: actor.humanId,
        fields: input.fields.map((item) => ({ field: item.field, classification: item.classification, value_hash: hashCanonical(item.value) })),
        encrypted_payload_ref: payloadRef,
        status: 'active' as const,
        created_at: now,
        updated_at: now
      };
      const signed = await this.authority.signOrganizationRecord(unsigned);
      const artifact = contextArtifactSchema.parse({ ...unsigned, canonical_hash: signed.canonicalHash, organization_signature: signed.signature });
      const sealed = sealedArtifactSchema.parse({ encrypted_payload_ref: payloadRef, artifact_id: artifactId, sealed_payload: await this.protector.seal(JSON.stringify(payload)), payload_hash: hashCanonical(payload), created_at: now });
      await this.artifacts.write([...(await this.artifacts.read()), artifact]);
      await this.sealed.write([...(await this.sealed.read()), sealed]);
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_context_${artifactId}`, actor: { type: 'human', id: actor.humanId }, subject: { type: 'context_artifact', id: artifactId }, event_type: 'CONTEXT_ARTIFACT_CREATED', payload: { organization_id: input.organization_id, source_resource: input.source_resource, field_names: artifact.fields.map((item) => item.field), classifications: artifact.fields.map((item) => item.classification), field_hashes: artifact.fields.map((item) => item.value_hash), ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.stateUnlocked();
    });
  }

  public issueGrant(request: IssueContextGrantRequest): Promise<ContextBrokerState> {
    return this.serialize(async () => {
      const input = issueContextGrantRequestSchema.parse(request);
      const actor = await this.authorizeActor(input.actor, input.organization_id, 'context-grant', 'issue', 'context.grant.issue');
      if (new Date(input.expires_at).getTime() <= this.clock().getTime()) throw new Error('Context Grant expiry must be in the future.');
      await this.recipients.assertRecipient({ organizationId: input.organization_id, taskId: input.task_id, mandateId: input.mandate_id, agentId: input.recipient_agent_id, passportId: input.recipient_passport_id });
      const names = input.field_rules.map((item) => item.field);
      if (new Set(names).size !== names.length) throw new Error('Context Grant field names must be unambiguous and unique.');
      const artifacts = await this.artifacts.read();
      for (const rule of input.field_rules) {
        const artifact = artifacts.find((item) => item.artifact_id === rule.artifact_id && item.organization_id === input.organization_id && item.status === 'active');
        const field = artifact?.fields.find((item) => item.field === rule.field);
        if (!field) throw new Error(`Active artifact field not found: ${rule.field}.`);
        if (classificationRank(field.classification) > classificationRank(rule.maximum_classification)) throw new Error(`Field ${rule.field} exceeds the grant classification ceiling.`);
      }
      const now = this.clock().toISOString();
      const transformations = [...new Set(input.field_rules.map((item) => mapTransformation(item.transformation)))];
      const unsignedGrant = {
        schema_version: V2_CONTRACT_VERSION,
        context_grant_id: `grant_${randomUUID()}`,
        organization_id: input.organization_id,
        task_id: input.task_id,
        mandate_id: input.mandate_id,
        recipient_agent_id: input.recipient_agent_id,
        recipient_passport_id: input.recipient_passport_id,
        purpose: input.purpose,
        allowed_fields: names,
        artifact_refs: [...new Set(input.field_rules.map((item) => item.artifact_id))],
        transformations,
        withheld_field_hashes: artifacts.flatMap((artifact) => artifact.fields).filter((field) => !names.includes(field.field)).map((field) => field.value_hash),
        token_budget: input.token_budget,
        issued_at: now,
        expires_at: input.expires_at
      };
      const grantSignature = await this.authority.signOrganizationRecord(unsignedGrant);
      const grant = { ...unsignedGrant, canonical_hash: grantSignature.canonicalHash, organization_signature: grantSignature.signature };
      const unsignedRecord = { grant, field_rules: input.field_rules, status: 'active' as const, maximum_uses: input.maximum_uses, use_count: 0, updated_at: now };
      const recordSignature = await this.authority.signOrganizationRecord(unsignedRecord);
      const record = governedContextGrantSchema.parse({ ...unsignedRecord, canonical_hash: recordSignature.canonicalHash, organization_signature: recordSignature.signature });
      await this.grants.write([...(await this.grants.read()), record]);
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_context_${grant.context_grant_id}`, actor: { type: 'human', id: actor.humanId }, subject: { type: 'context_grant', id: grant.context_grant_id }, mandate_id: grant.mandate_id, event_type: 'CONTEXT_GRANT_ISSUED', payload: { organization_id: grant.organization_id, task_id: grant.task_id, recipient_agent_id: grant.recipient_agent_id, recipient_passport_id: grant.recipient_passport_id, allowed_fields: grant.allowed_fields, transformations: grant.transformations, artifact_refs: grant.artifact_refs, token_budget: grant.token_budget, expires_at: grant.expires_at, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.stateUnlocked();
    });
  }

  public updateGrant(request: ContextGrantLifecycleRequest): Promise<ContextBrokerState> {
    return this.serialize(async () => {
      const input = contextGrantLifecycleRequestSchema.parse(request);
      const grants = await this.grants.read();
      const current = grants.find((item) => item.grant.context_grant_id === input.context_grant_id);
      if (!current) throw new Error('Context Grant not found.');
      const actor = await this.authorizeActor(input.actor, current.grant.organization_id, 'context-grant', 'revoke');
      const updated = await this.signGrantRecord({ ...stripRecordSignature(current), status: 'revoked', updated_at: this.clock().toISOString() });
      await this.grants.write(grants.map((item) => item.grant.context_grant_id === input.context_grant_id ? updated : item));
      await this.evidence.append({ trace_id: input.ceremony?.trace_id ?? `tr_context_${input.context_grant_id}`, actor: { type: 'human', id: actor.humanId }, subject: { type: 'context_grant', id: input.context_grant_id }, mandate_id: current.grant.mandate_id, event_type: 'CONTEXT_GRANT_REVOKED', payload: { task_id: current.grant.task_id, recipient_agent_id: current.grant.recipient_agent_id, ceremony_id: input.ceremony?.ceremony_id, idempotency_key: input.ceremony?.idempotency_key } });
      return this.stateUnlocked();
    });
  }

  public authorize(task: TaskEnvelope, request: ContextRequestPayload): Promise<ContextResponsePayload> {
    return this.serialize(async () => {
      await this.expireGrants();
      const idempotencyKey = hashCanonical({ task_id: task.task_id, context_grant_id: request.context_grant_id, fields: [...request.requested_fields].sort(), purpose: request.purpose });
      const previous = (await this.disclosures.read()).find((item) => item.idempotency_key === idempotencyKey);
      const record = (await this.grants.read()).find((item) => item.grant.context_grant_id === request.context_grant_id);
      const denial = this.denialReason(task, request, record);
      if (denial || !record) return this.deny(task, request, record, idempotencyKey, denial ?? 'CONTEXT_GRANT_NOT_FOUND', previous);
      const payloads = await this.loadPayloads(record.grant.artifact_refs);
      const projection: Record<string, unknown> = {};
      const granted: string[] = [];
      const withheld: string[] = [];
      const transformationByField: Record<string, ContextTransformation> = {};
      const disclosedHashes: string[] = [];
      const withheldHashes: string[] = [];
      const artifacts = await this.artifacts.read();
      for (const fieldName of request.requested_fields) {
        const rule = record.field_rules.find((item) => item.field === fieldName);
        const artifact = rule ? artifacts.find((item) => item.artifact_id === rule.artifact_id) : undefined;
        const metadata = artifact?.fields.find((item) => item.field === fieldName);
        if (!rule || !artifact || !metadata || !record.grant.allowed_fields.includes(fieldName) || classificationRank(metadata.classification) > classificationRank(rule.maximum_classification)) {
          withheld.push(fieldName);
          if (metadata) withheldHashes.push(metadata.value_hash);
          continue;
        }
        const value = payloads.get(artifact.artifact_id)?.[fieldName];
        const transformed = transform(value, rule.transformation, artifact.artifact_id, fieldName);
        const candidate = { ...projection, [fieldName]: transformed };
        if (estimatedTokens(candidate) > record.grant.token_budget) {
          withheld.push(fieldName); withheldHashes.push(metadata.value_hash); continue;
        }
        projection[fieldName] = transformed;
        granted.push(fieldName);
        transformationByField[fieldName] = rule.transformation;
        disclosedHashes.push(hashCanonical(transformed));
      }
      const reason = granted.length ? 'CONTEXT_GRANT_ACTIVE' : 'NO_FIELDS_AUTHORIZED';
      const disclosure = previous ?? await this.createDisclosure(task, request, record, idempotencyKey, granted.length ? 'authorized' : 'denied', reason, granted, withheld, transformationByField, disclosedHashes, withheldHashes, projection);
      if (!previous && disclosure.status === 'authorized') {
        const updated = await this.signGrantRecord({ ...stripRecordSignature(record), use_count: record.use_count + 1, updated_at: this.clock().toISOString() });
        await this.grants.write((await this.grants.read()).map((item) => item.grant.context_grant_id === record.grant.context_grant_id ? updated : item));
      }
      return contextResponsePayloadSchema.parse({ authorized: disclosure.status === 'authorized', reason_code: disclosure.reason_code, granted_fields: disclosure.status === 'authorized' ? projection : {}, withheld_fields: disclosure.withheld_fields });
    });
  }

  public async proveContextLeakage(traceId: string): Promise<{ reasonCode: string; evidenceRef: string }> {
      await this.expireGrants();
      const record = [...await this.grants.read()].reverse().find((item) => item.status === 'active');
      if (!record) throw new Error('No active Context Grant is available for the leakage test.');
      const grant = record.grant;
      const task = {
        schema_version: V2_CONTRACT_VERSION, task_id: grant.task_id, organization_id: grant.organization_id, trace_id: traceId,
        requestor_human_id: 'phase30-red-team', assigned_agent_id: grant.recipient_agent_id, passport_id: grant.recipient_passport_id,
        runtime_attestation_id: 'phase30-boundary-probe', mandate_id: grant.mandate_id, context_grant_id: grant.context_grant_id,
        objective: 'Attempt disclosure of a field outside the signed Context Grant.', dependency_task_ids: [], output_contract: {}, sequence: 30,
        idempotency_key: `phase30_leakage_${randomUUID()}`, issued_at: this.clock().toISOString(), expires_at: new Date(this.clock().getTime() + 60_000).toISOString(),
        canonical_hash: hashCanonical({ probe: 'context-leakage' }), organization_signature: `ed25519:${Buffer.alloc(64).toString('base64')}`
      } as TaskEnvelope;
      const response = await this.authorize(task, { context_grant_id: grant.context_grant_id, requested_fields: ['credential_material'], purpose: grant.purpose });
      if (response.authorized) throw new Error('The Context Broker released a field outside the signed grant.');
      const disclosure = (await this.disclosures.read()).find((item) => item.task_id === task.task_id && item.idempotency_key === hashCanonical({ task_id: task.task_id, context_grant_id: grant.context_grant_id, fields: ['credential_material'], purpose: grant.purpose }));
      const event = disclosure && (await this.evidence.list()).find((item) => item.subject?.id === disclosure.disclosure_id && item.event_type === 'CONTEXT_DISCLOSURE_DENIED');
      if (!event) throw new Error('Context denial evidence was not persisted.');
      return { reasonCode: response.reason_code, evidenceRef: event.event_id };
  }

  private denialReason(task: TaskEnvelope, request: ContextRequestPayload, record: GovernedContextGrant | undefined): string | undefined {
    if (!record) return 'CONTEXT_GRANT_NOT_FOUND';
    if (record.status !== 'active') return `CONTEXT_GRANT_${record.status.toUpperCase()}`;
    if (record.use_count >= record.maximum_uses) return 'CONTEXT_GRANT_USE_LIMIT';
    const grant = record.grant;
    if (task.context_grant_id !== grant.context_grant_id || task.organization_id !== grant.organization_id || task.task_id !== grant.task_id || task.mandate_id !== grant.mandate_id || task.assigned_agent_id !== grant.recipient_agent_id || task.passport_id !== grant.recipient_passport_id) return 'CONTEXT_GRANT_RECIPIENT_MISMATCH';
    if (request.purpose !== grant.purpose) return 'CONTEXT_GRANT_PURPOSE_MISMATCH';
    return undefined;
  }

  private async deny(task: TaskEnvelope, request: ContextRequestPayload, record: GovernedContextGrant | undefined, idempotencyKey: string, reason: string, previous?: ContextDisclosure): Promise<ContextResponsePayload> {
    const requested = [...new Set(request.requested_fields)];
    if (!previous) await this.createDisclosure(task, request, record, idempotencyKey, 'denied', reason, [], requested, {}, [], [], {});
    return contextResponsePayloadSchema.parse({ authorized: false, reason_code: reason, granted_fields: {}, withheld_fields: requested });
  }

  private async createDisclosure(task: TaskEnvelope, request: ContextRequestPayload, record: GovernedContextGrant | undefined, idempotencyKey: string, status: 'authorized' | 'denied', reason: string, granted: string[], withheld: string[], transformations: Record<string, ContextTransformation>, disclosedHashes: string[], withheldHashes: string[], projection: Record<string, unknown>): Promise<ContextDisclosure> {
    const unsigned = {
      disclosure_id: `disclosure_${randomUUID()}`,
      organization_id: task.organization_id,
      context_grant_id: request.context_grant_id,
      task_id: task.task_id,
      mandate_id: task.mandate_id,
      recipient_agent_id: task.assigned_agent_id,
      recipient_passport_id: task.passport_id,
      purpose: request.purpose,
      requested_fields: [...new Set(request.requested_fields)],
      granted_fields: granted,
      withheld_fields: withheld,
      transformation_by_field: transformations,
      disclosed_value_hashes: disclosedHashes,
      withheld_value_hashes: withheldHashes,
      projection_hash: hashCanonical(projection),
      reason_code: reason,
      status,
      idempotency_key: idempotencyKey,
      disclosed_at: this.clock().toISOString()
    };
    const signed = await this.authority.signOrganizationRecord(unsigned);
    const disclosure = contextDisclosureSchema.parse({ ...unsigned, canonical_hash: signed.canonicalHash, organization_signature: signed.signature });
    await this.disclosures.write([disclosure, ...(await this.disclosures.read())].slice(0, 500));
    await this.evidence.append({ trace_id: task.trace_id, actor: { type: 'system', id: 'h2a-context-broker' }, subject: { type: 'context_disclosure', id: disclosure.disclosure_id }, mandate_id: task.mandate_id, event_type: status === 'authorized' ? 'CONTEXT_DISCLOSURE_AUTHORIZED' : 'CONTEXT_DISCLOSURE_DENIED', payload: { context_grant_id: request.context_grant_id, task_id: task.task_id, recipient_agent_id: task.assigned_agent_id, requested_fields: disclosure.requested_fields, granted_fields: granted, withheld_fields: withheld, transformations, projection_hash: disclosure.projection_hash, reason_code: reason } });
    return disclosure;
  }

  private async loadPayloads(artifactIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const [artifacts, secrets] = await Promise.all([this.artifacts.read(), this.sealed.read()]);
    const result = new Map<string, Record<string, unknown>>();
    for (const artifactId of artifactIds) {
      const artifact = artifacts.find((item) => item.artifact_id === artifactId && item.status === 'active');
      const secret = artifact && secrets.find((item) => item.artifact_id === artifactId && item.encrypted_payload_ref === artifact.encrypted_payload_ref);
      if (!artifact || !secret) throw new Error('Context artifact payload is unavailable.');
      const parsed = JSON.parse(await this.protector.open(secret.sealed_payload)) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || hashCanonical(parsed) !== secret.payload_hash) throw new Error('Context artifact payload integrity failed.');
      const values = parsed as Record<string, unknown>;
      if (!artifact.fields.every((field) => hashCanonical(values[field.field]) === field.value_hash)) throw new Error('Context artifact field integrity failed.');
      result.set(artifactId, values);
    }
    return result;
  }

  private async expireGrants(): Promise<void> {
    const grants = await this.grants.read();
    const expired = grants.filter((item) => item.status === 'active' && new Date(item.grant.expires_at).getTime() <= this.clock().getTime());
    if (!expired.length) return;
    const replacements = new Map<string, GovernedContextGrant>();
    for (const item of expired) replacements.set(item.grant.context_grant_id, await this.signGrantRecord({ ...stripRecordSignature(item), status: 'expired', updated_at: this.clock().toISOString() }));
    await this.grants.write(grants.map((item) => replacements.get(item.grant.context_grant_id) ?? item));
    for (const item of expired) await this.evidence.append({ trace_id: `tr_context_${item.grant.context_grant_id}`, actor: { type: 'system', id: 'h2a-context-broker' }, subject: { type: 'context_grant', id: item.grant.context_grant_id }, mandate_id: item.grant.mandate_id, event_type: 'CONTEXT_GRANT_EXPIRED', payload: { task_id: item.grant.task_id, recipient_agent_id: item.grant.recipient_agent_id } });
  }

  private async signGrantRecord(unsigned: Omit<GovernedContextGrant, 'canonical_hash' | 'organization_signature'>): Promise<GovernedContextGrant> {
    const signed = await this.authority.signOrganizationRecord(unsigned);
    return governedContextGrantSchema.parse({ ...unsigned, canonical_hash: signed.canonicalHash, organization_signature: signed.signature });
  }

  private authorizeActor(actor: AuthorityActor, organizationId: string, resource: string, action: string, power?: string) {
    return this.authority.authorizeProtectedOperation({ organizationId, membershipId: actor.membership_id, humanProofId: actor.human_proof_id, authorityCredentialId: actor.authority_credential_id }, resource, action, power);
  }

  private async stateUnlocked(): Promise<ContextBrokerState> {
    return contextBrokerStateSchema.parse({ artifacts: await this.artifacts.read(), grants: await this.grants.read(), disclosures: await this.disclosures.read(), messages: [] });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function stripRecordSignature(record: GovernedContextGrant): Omit<GovernedContextGrant, 'canonical_hash' | 'organization_signature'> {
  const unsigned: Partial<GovernedContextGrant> = { ...record };
  delete unsigned.canonical_hash;
  delete unsigned.organization_signature;
  return unsigned as Omit<GovernedContextGrant, 'canonical_hash' | 'organization_signature'>;
}
function classificationRank(value: 'public' | 'internal' | 'confidential' | 'restricted'): number { return ['public', 'internal', 'confidential', 'restricted'].indexOf(value); }
function mapTransformation(value: ContextTransformation): 'mask' | 'summarize' | 'reference' | 'filter' { return value === 'value' ? 'filter' : value; }
function transform(value: unknown, rule: ContextTransformation, artifactId: string, field: string): unknown {
  if (rule === 'value') return value;
  if (rule === 'mask') return `[MASKED:${typeof value}]`;
  if (rule === 'reference') return `h2a-ref:${artifactId}:${field}`;
  if (Array.isArray(value)) return { type: 'array', item_count: value.length };
  if (value && typeof value === 'object') return { type: 'object', field_count: Object.keys(value).length };
  if (typeof value === 'string') return { type: 'string', character_count: value.length };
  return { type: typeof value };
}
function estimatedTokens(value: unknown): number { return Math.ceil(JSON.stringify(value).length / 4); }
