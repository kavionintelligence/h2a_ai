import { generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { z } from 'zod';
import {
  connectorDeliveryResultSchema,
  connectorFrameSchema,
  governedAgentMessageSchema,
  recordGovernedMessageRequestSchema,
  contextRequestPayloadSchema,
  contextResponsePayloadSchema,
  deliveryRecordSchema,
  taskEnvelopeSchema,
  type ConnectorDeliveryResult,
  type ConnectorFrame,
  type ConnectorProtocolState,
  type ContextRequestPayload,
  type ContextResponsePayload,
  type DeliveryRecord,
  type GovernedAgentMessage,
  type RecordGovernedMessageRequest,
  type TaskEnvelope
} from '@h2a/contracts';
import type { ConnectorRegistry } from '@h2a/connectors';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const deliveriesSchema = z.array(deliveryRecordSchema);
const brokerKeySchema = z.object({ public_key_pem: z.string(), private_key_pem: z.string() }).strict();
const governedMessagesSchema = z.array(governedAgentMessageSchema).max(500);
type BrokerKey = z.infer<typeof brokerKeySchema>;

export interface ConnectorAuthorizationPort {
  authorize(task: TaskEnvelope, request: ContextRequestPayload): Promise<ContextResponsePayload>;
}

export interface ConnectorTransport {
  deliver(
    frame: ConnectorFrame,
    brokerPublicKeyPem: string,
    authorize: (request: ConnectorFrame) => Promise<ConnectorFrame>
  ): Promise<ConnectorDeliveryResult>;
}

export class MessageBroker {
  private readonly deliveries: VersionedJsonRepository<'h2a.messaging.deliveries', DeliveryRecord[]>;
  private readonly keys: VersionedJsonRepository<'h2a.messaging.broker-key', BrokerKey>;
  private readonly messages: VersionedJsonRepository<'h2a.v2.governed-agent-messages', GovernedAgentMessage[]>;
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    dataPath: string,
    private readonly registry: ConnectorRegistry,
    private readonly evidence: EvidenceLedgerPort,
    private readonly authorization: ConnectorAuthorizationPort,
    private readonly clock: () => Date = () => new Date()
  ) {
    const store = new AtomicFileStore(dataPath);
    this.deliveries = new VersionedJsonRepository(store, 'messaging/deliveries.json', 'h2a.messaging.deliveries', deliveriesSchema, { initialData: [], clock });
    this.keys = new VersionedJsonRepository(store, 'messaging/broker-key.json', 'h2a.messaging.broker-key', brokerKeySchema, { initialData: createKey(), clock });
    this.messages = new VersionedJsonRepository(store, 'messaging/governed-agent-messages-v2.json', 'h2a.v2.governed-agent-messages', governedMessagesSchema, { initialData: [], clock });
  }

  public async initialize(): Promise<ConnectorProtocolState> {
    await this.keys.read();
    await this.messages.read();
    return this.getState();
  }

  public async getState(): Promise<ConnectorProtocolState> {
    return this.registry.project(await this.deliveries.read());
  }

  public async getPublicKey(): Promise<string> {
    return (await this.keys.read()).public_key_pem;
  }

  public async getGovernedMessages(): Promise<GovernedAgentMessage[]> {
    const now = this.clock().getTime();
    const current = await this.messages.read();
    const next = current.map((item) => item.status === 'queued' && new Date(item.expires_at).getTime() <= now ? { ...item, status: 'expired' as const } : item);
    if (next.some((item, index) => item.status !== current[index]?.status)) await this.messages.write(next);
    return next;
  }

  public async nextGovernedMessageSequence(connectorManifestId: string, taskId: string): Promise<number> {
    const messages = await this.messages.read();
    return messages
      .filter((item) => item.sender_connector_manifest_id === connectorManifestId && item.task_id === taskId)
      .reduce((highest, item) => Math.max(highest, item.sequence), -1) + 1;
  }

  public recordGovernedMessage(request: RecordGovernedMessageRequest): Promise<GovernedAgentMessage> {
    return this.serialize(async () => {
      const input = recordGovernedMessageRequestSchema.parse(request);
      if (new Date(input.expires_at).getTime() <= this.clock().getTime()) throw new Error('Governed message has expired.');
      const [sender, recipient, deliveries, messages] = await Promise.all([
        this.registry.require(input.sender_connector_manifest_id),
        this.registry.require(input.recipient_connector_manifest_id),
        this.deliveries.read(),
        this.messages.read()
      ]);
      const authorityTask = deliveries.find((item) => item.task.task_id === input.task_id && item.task.trace_id === input.trace_id && item.task.mandate_id === input.mandate_id && item.task.context_grant_id === input.context_grant_id && item.task.passport_id === input.sender_passport_id);
      if (!authorityTask) throw new Error('Governed message has no matching durable task authority.');
      if (!recipient.manifest.capabilities.includes('task.receive')) throw new Error('Recipient connector cannot receive governed work.');
      const { sender_signature, ...unsigned } = input;
      if (!verify(null, Buffer.from(canonicalize(unsigned)), sender.runtime_public_key_pem, Buffer.from(sender_signature.slice('ed25519:'.length), 'base64'))) throw new Error('Governed message signature is invalid.');
      const existing = messages.find((item) => item.deduplication_id === input.deduplication_id);
      if (existing) return existing;
      const highest = messages.filter((item) => item.sender_connector_manifest_id === input.sender_connector_manifest_id && item.task_id === input.task_id).reduce((value, item) => Math.max(value, item.sequence), -1);
      if (input.sequence <= highest) throw new Error('Governed message sequence is replayed or out of order.');
      const record = governedAgentMessageSchema.parse({ ...input, status: 'delivered' });
      await this.messages.write([...messages, record].slice(-500));
      await this.evidence.append({ trace_id: input.trace_id, actor: { type: 'agent', id: input.sender_passport_id }, subject: { type: 'message', id: input.message_id }, mandate_id: input.mandate_id, event_type: 'GOVERNED_MESSAGE_ACCEPTED', payload: { task_id: input.task_id, sender_passport_id: input.sender_passport_id, recipient_passport_id: input.recipient_passport_id, context_grant_id: input.context_grant_id, speech_act: input.speech_act, content_ref: input.content_ref, content_hash: input.content_hash, sequence: input.sequence, deduplication_id: input.deduplication_id } });
      return record;
    });
  }

  public enqueue(taskValue: TaskEnvelope, connectorManifestId: string, organizationPublicKeyPem: string, maxAttempts = 3): Promise<DeliveryRecord> {
    return this.serialize(async () => {
      const task = taskEnvelopeSchema.parse(taskValue);
      await this.registry.require(connectorManifestId);
      verifyTask(task, organizationPublicKeyPem, this.clock());
      const records = await this.deliveries.read();
      const existing = records.find((item) => item.task.idempotency_key === task.idempotency_key);
      if (existing) return existing;
      const now = this.clock().toISOString();
      const sequence = records.filter((item) => item.connector_manifest_id === connectorManifestId).reduce((highest, item) => Math.max(highest, item.frame.sequence), -1) + 1;
      const frame = await this.signFrame({
        kind: 'task', connectorManifestId, taskId: task.task_id, traceId: task.trace_id,
        sequence, idempotencyKey: task.idempotency_key, expiresAt: task.expires_at,
        payload: { task }
      });
      const record = deliveryRecordSchema.parse({
        delivery_id: `delivery_${randomUUID()}`, connector_manifest_id: connectorManifestId,
        task, frame, status: 'queued', attempts: 0, max_attempts: maxAttempts,
        next_attempt_at: now, created_at: now, updated_at: now
      });
      await this.deliveries.write([...records, record]);
      await this.recordEvent(record, 'CONNECTOR_DELIVERY_QUEUED', { task_id: task.task_id, idempotency_key: task.idempotency_key });
      return record;
    });
  }

  public deliver(deliveryId: string, transport: ConnectorTransport): Promise<DeliveryRecord> {
    return this.serialize(async () => {
      const records = await this.deliveries.read();
      const index = records.findIndex((item) => item.delivery_id === deliveryId);
      if (index < 0) throw new Error('Delivery was not found.');
      const current = records[index];
      if (current.status === 'acknowledged' || current.status === 'cancelled' || current.status === 'dead-letter') return current;
      if (new Date(current.task.expires_at).getTime() <= this.clock().getTime()) {
        records[index] = deliveryRecordSchema.parse({ ...current, attempts: current.max_attempts, updated_at: this.clock().toISOString() });
        return this.fail(records, index, 'Task envelope expired before delivery.');
      }
      const connector = await this.registry.require(current.connector_manifest_id);
      const inFlight = deliveryRecordSchema.parse({ ...current, status: 'in-flight', attempts: current.attempts + 1, updated_at: this.clock().toISOString() });
      records[index] = inFlight;
      await this.deliveries.write(records);
      try {
        const outcome = connectorDeliveryResultSchema.parse(await transport.deliver(
          current.frame,
          await this.getPublicKey(),
          (request) => this.authorizeContext(current, request, connector.runtime_public_key_pem)
        ));
        verifyConnectorFrame(outcome.result, connector.runtime_public_key_pem, current, ['result']);
        verifyConnectorFrame(outcome.acknowledgement, connector.runtime_public_key_pem, current, ['acknowledgement']);
        const acknowledged = deliveryRecordSchema.parse({
          ...inFlight, status: 'acknowledged', result_frame: outcome.result,
          acknowledgement_frame: outcome.acknowledgement, last_error: undefined,
          updated_at: this.clock().toISOString()
        });
        records[index] = acknowledged;
        await this.deliveries.write(records);
        await this.registry.updateHealth(current.connector_manifest_id, 'healthy', 'Signed delivery acknowledged.');
        await this.recordEvent(acknowledged, 'CONNECTOR_DELIVERY_ACKNOWLEDGED', { attempts: acknowledged.attempts, result_hash: outcome.result.payload_hash });
        return acknowledged;
      } catch (error) {
        const message = errorMessage(error);
        await this.registry.updateHealth(current.connector_manifest_id, 'degraded', message.slice(0, 500));
        return this.fail(records, index, message.slice(0, 1000));
      }
    });
  }

  public cancel(deliveryId: string, reason: string): Promise<DeliveryRecord> {
    return this.serialize(async () => {
      const records = await this.deliveries.read();
      const index = records.findIndex((item) => item.delivery_id === deliveryId);
      if (index < 0) throw new Error('Delivery was not found.');
      if (records[index].status === 'acknowledged') throw new Error('Acknowledged delivery cannot be cancelled.');
      const cancelled = deliveryRecordSchema.parse({ ...records[index], status: 'cancelled', last_error: reason, updated_at: this.clock().toISOString() });
      records[index] = cancelled;
      await this.deliveries.write(records);
      await this.recordEvent(cancelled, 'CONNECTOR_DELIVERY_CANCELLED', { reason });
      return cancelled;
    });
  }

  private async authorizeContext(delivery: DeliveryRecord, request: ConnectorFrame, runtimePublicKeyPem: string): Promise<ConnectorFrame> {
    verifyConnectorFrame(request, runtimePublicKeyPem, delivery, ['context-request']);
    const payload = contextRequestPayloadSchema.parse(request.payload);
    if (payload.context_grant_id !== delivery.task.context_grant_id) throw new Error('Context request references a different grant.');
    const decision = contextResponsePayloadSchema.parse(await this.authorization.authorize(delivery.task, payload));
    return this.signFrame({
      kind: 'context-response', connectorManifestId: delivery.connector_manifest_id,
      taskId: delivery.task.task_id, traceId: delivery.task.trace_id,
      sequence: request.sequence + 1, idempotencyKey: delivery.task.idempotency_key,
      causationId: request.frame_id, expiresAt: delivery.task.expires_at, payload: decision
    });
  }

  private async signFrame(input: {
    kind: ConnectorFrame['kind']; connectorManifestId: string; taskId: string; traceId: string;
    sequence: number; idempotencyKey: string; expiresAt: string; payload: Record<string, unknown>; causationId?: string;
  }): Promise<ConnectorFrame> {
    const unsigned = {
      protocol_version: '1.0' as const, frame_id: `frame_${randomUUID()}`, kind: input.kind,
      connector_manifest_id: input.connectorManifestId, task_id: input.taskId, trace_id: input.traceId,
      sequence: input.sequence, idempotency_key: input.idempotencyKey, causation_id: input.causationId,
      created_at: this.clock().toISOString(), expires_at: input.expiresAt,
      payload: input.payload, payload_hash: hashCanonical(input.payload)
    };
    const key = await this.keys.read();
    return connectorFrameSchema.parse({ ...unsigned, sender_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), key.private_key_pem).toString('base64')}` });
  }

  private async fail(records: DeliveryRecord[], index: number, message: string): Promise<DeliveryRecord> {
    const current = records[index];
    const dead = current.attempts >= current.max_attempts;
    const next = deliveryRecordSchema.parse({
      ...current, status: dead ? 'dead-letter' : 'retrying', last_error: message,
      next_attempt_at: new Date(this.clock().getTime() + Math.min(30_000, 1_000 * (2 ** Math.max(0, current.attempts - 1)))).toISOString(),
      updated_at: this.clock().toISOString()
    });
    records[index] = next;
    await this.deliveries.write(records);
    await this.recordEvent(next, dead ? 'CONNECTOR_DELIVERY_DEAD_LETTERED' : 'CONNECTOR_DELIVERY_RETRY_SCHEDULED', { attempts: next.attempts, error: message });
    return next;
  }

  private async recordEvent(record: DeliveryRecord, eventType: 'CONNECTOR_DELIVERY_QUEUED' | 'CONNECTOR_DELIVERY_ACKNOWLEDGED' | 'CONNECTOR_DELIVERY_RETRY_SCHEDULED' | 'CONNECTOR_DELIVERY_DEAD_LETTERED' | 'CONNECTOR_DELIVERY_CANCELLED', payload: Record<string, unknown>): Promise<void> {
    await this.evidence.append({ trace_id: record.task.trace_id, actor: { type: 'system', id: 'h2a-message-broker' }, subject: { type: 'connector_delivery', id: record.delivery_id }, mandate_id: record.task.mandate_id, event_type: eventType, payload });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

export function verifyConnectorFrame(frameValue: ConnectorFrame, publicKeyPem: string, delivery?: DeliveryRecord, kinds?: ConnectorFrame['kind'][]): ConnectorFrame {
  const frame = connectorFrameSchema.parse(frameValue);
  if (kinds && !kinds.includes(frame.kind)) throw new Error(`Unexpected connector frame kind: ${frame.kind}.`);
  if (new Date(frame.expires_at).getTime() <= Date.now()) throw new Error('Connector frame has expired.');
  if (hashCanonical(frame.payload) !== frame.payload_hash) throw new Error('Connector frame payload hash is invalid.');
  const { sender_signature, ...unsigned } = frame;
  if (!verify(null, Buffer.from(canonicalize(unsigned)), publicKeyPem, Buffer.from(sender_signature.slice('ed25519:'.length), 'base64'))) throw new Error('Connector frame signature is invalid.');
  if (delivery && (frame.task_id !== delivery.task.task_id || frame.trace_id !== delivery.task.trace_id || frame.idempotency_key !== delivery.task.idempotency_key || frame.connector_manifest_id !== delivery.connector_manifest_id)) throw new Error('Connector frame does not match its delivery authority references.');
  if (delivery && frame.sequence <= delivery.frame.sequence) throw new Error('Connector frame sequence is replayed or out of order.');
  return frame;
}

export function compactTaskAuthority(taskValue: TaskEnvelope) {
  const task = taskEnvelopeSchema.parse(taskValue);
  const authority = {
    organization_id: task.organization_id,
    task_id: task.task_id,
    trace_id: task.trace_id,
    requestor_human_id: task.requestor_human_id,
    assigned_agent_id: task.assigned_agent_id,
    passport_id: task.passport_id,
    runtime_attestation_id: task.runtime_attestation_id,
    mandate_id: task.mandate_id,
    context_grant_id: task.context_grant_id
  };
  return { ...authority, authority_hash: hashCanonical(authority) };
}

function verifyTask(task: TaskEnvelope, publicKeyPem: string, now: Date): void {
  if (new Date(task.expires_at).getTime() <= now.getTime()) throw new Error('Task envelope has expired.');
  const { canonical_hash, organization_signature, ...unsigned } = task;
  if (hashCanonical(unsigned) !== canonical_hash) throw new Error('Task envelope canonical hash is invalid.');
  if (!verify(null, Buffer.from(canonicalize(unsigned)), publicKeyPem, Buffer.from(organization_signature.slice('ed25519:'.length), 'base64'))) throw new Error('Task envelope organization signature is invalid.');
}

function createKey(): BrokerKey {
  const pair = generateKeyPairSync('ed25519');
  return { public_key_pem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(), private_key_pem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Connector delivery failed.';
}
