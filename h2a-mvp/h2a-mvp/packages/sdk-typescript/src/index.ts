import { createHash, randomUUID, sign, verify } from 'node:crypto';
import { createInterface } from 'node:readline';

export interface ProtocolFrame {
  protocol_version: '1.0'; frame_id: string; kind: string; connector_manifest_id: string;
  task_id: string; trace_id: string; sequence: number; idempotency_key: string;
  causation_id?: string; created_at: string; expires_at: string; payload: Record<string, unknown>;
  payload_hash: string; sender_signature: string;
}

export interface AgentSdkOptions {
  connectorManifestId: string;
  privateKeyPem: string;
  brokerPublicKeyPem: string;
  handleTask(task: Record<string, unknown>, context: Record<string, unknown>): Promise<Record<string, unknown>>;
  requestedFields(task: Record<string, unknown>): string[];
}

export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item ?? null)).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
  }
  throw new TypeError(`Unsupported canonical value: ${typeof value}.`);
}

export function hashCanonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

export function verifyFrame(frame: ProtocolFrame, publicKeyPem: string, expectedKind?: string): ProtocolFrame {
  if (frame.protocol_version !== '1.0' || (expectedKind && frame.kind !== expectedKind)) throw new Error('Unexpected protocol frame.');
  if (new Date(frame.expires_at).getTime() <= Date.now()) throw new Error('Protocol frame expired.');
  if (hashCanonical(frame.payload) !== frame.payload_hash) throw new Error('Protocol payload hash mismatch.');
  const { sender_signature, ...unsigned } = frame;
  if (!verify(null, Buffer.from(canonicalize(unsigned)), publicKeyPem, Buffer.from(sender_signature.slice('ed25519:'.length), 'base64'))) throw new Error('Protocol signature invalid.');
  return frame;
}

export function signFrame(input: Omit<ProtocolFrame, 'frame_id' | 'created_at' | 'payload_hash' | 'sender_signature'>, privateKeyPem: string): ProtocolFrame {
  const unsigned = { ...input, frame_id: `frame_${randomUUID()}`, created_at: new Date().toISOString(), payload_hash: hashCanonical(input.payload) };
  return { ...unsigned, sender_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), privateKeyPem).toString('base64')}` };
}

export function runLineProtocolAgent(options: AgentSdkOptions): void {
  const completed = new Map<string, { result: ProtocolFrame; acknowledgement: ProtocolFrame }>();
  const pending = new Map<string, { taskFrame: ProtocolFrame; task: Record<string, unknown> }>();
  const input = createInterface({ input: process.stdin });
  const send = (value: unknown): void => { process.stdout.write(`${JSON.stringify(value)}\n`); };

  input.on('line', (line) => {
    void (async () => {
      const message = JSON.parse(line) as { type: string; frame: ProtocolFrame };
      if (message.type === 'deliver') {
        const taskFrame = verifyFrame(message.frame, options.brokerPublicKeyPem, 'task');
        if (taskFrame.connector_manifest_id !== options.connectorManifestId) throw new Error('Task addressed to another connector.');
        const cached = completed.get(taskFrame.idempotency_key);
        if (cached) { send({ type: 'completed', ...cached, duplicate: true }); return; }
        const task = (taskFrame.payload.task ?? {}) as Record<string, unknown>;
        pending.set(taskFrame.task_id, { taskFrame, task });
        send({ type: 'context-request', frame: signFrame({
          protocol_version: '1.0', kind: 'context-request', connector_manifest_id: taskFrame.connector_manifest_id,
          task_id: taskFrame.task_id, trace_id: taskFrame.trace_id, sequence: taskFrame.sequence + 1,
          idempotency_key: taskFrame.idempotency_key, causation_id: taskFrame.frame_id,
          expires_at: taskFrame.expires_at,
          payload: { context_grant_id: String(task.context_grant_id), requested_fields: options.requestedFields(task), purpose: String(task.objective) }
        }, options.privateKeyPem) });
        return;
      }
      if (message.type === 'context-response') {
        const response = verifyFrame(message.frame, options.brokerPublicKeyPem, 'context-response');
        const active = pending.get(response.task_id);
        if (!active) throw new Error('No pending task for context response.');
        if (response.payload.authorized !== true) throw new Error(`Context denied: ${String(response.payload.reason_code)}.`);
        const output = await options.handleTask(active.task, response.payload.granted_fields as Record<string, unknown>);
        const base = {
          protocol_version: '1.0' as const, connector_manifest_id: response.connector_manifest_id,
          task_id: response.task_id, trace_id: response.trace_id, idempotency_key: response.idempotency_key,
          expires_at: response.expires_at
        };
        const result = signFrame({ ...base, kind: 'result', sequence: response.sequence + 1, causation_id: response.frame_id, payload: { status: 'succeeded', output } }, options.privateKeyPem);
        const acknowledgement = signFrame({ ...base, kind: 'acknowledgement', sequence: response.sequence + 2, causation_id: result.frame_id, payload: { accepted: true, result_frame_id: result.frame_id } }, options.privateKeyPem);
        const outcome = { result, acknowledgement };
        completed.set(response.idempotency_key, outcome);
        pending.delete(response.task_id);
        send({ type: 'completed', ...outcome, duplicate: false });
      }
    })().catch((error) => send({ type: 'error', message: error instanceof Error ? error.message : 'Agent SDK failed.' }));
  });
}

