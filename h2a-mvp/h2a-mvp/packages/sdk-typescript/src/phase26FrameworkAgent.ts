import { createHash, sign, verify } from 'node:crypto';
import { createInterface } from 'node:readline';
import { canonicalize } from './index.ts';

createInterface({ input: process.stdin }).once('line', (line) => {
  try {
    const input = JSON.parse(line) as Record<string, unknown>;
    const frame = input.frame as Record<string, unknown>;
    const brokerKey = String(input.broker_public_key_pem);
    const privateKey = String(input.runtime_private_key_pem);
    const manifestId = String(input.connector_manifest_id);
    verifyFrame(frame, brokerKey, manifestId);
    const task = frame.payload && typeof frame.payload === 'object' ? (frame.payload as Record<string, unknown>).task as Record<string, unknown> : {};
    const output = { status: 'succeeded', framework: 'custom-cli', objective_hash: hash(String(task.objective)), dependency_task_ids: task.dependency_task_ids ?? [], zero_disclosure: true };
    const result = signFrame(frame, manifestId, privateKey, 'result', Number(frame.sequence) + 1, { status: 'succeeded', output });
    const acknowledgement = signFrame(frame, manifestId, privateKey, 'acknowledgement', Number(frame.sequence) + 2, { accepted: true, result_frame_id: result.frame_id });
    process.stdout.write(`${JSON.stringify({ type: 'completed', result, acknowledgement })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Framework execution failed.' })}\n`);
    process.exitCode = 1;
  }
});

function verifyFrame(frame: Record<string, unknown>, publicKey: string, manifestId: string): void {
  if (frame.kind !== 'task' || frame.connector_manifest_id !== manifestId) throw new Error('Framework task authority does not match the allowlisted connector.');
  const signature = String(frame.sender_signature);
  const unsigned = { ...frame }; delete unsigned.sender_signature;
  if (!verify(null, Buffer.from(canonicalize(unsigned)), publicKey, Buffer.from(signature.slice('ed25519:'.length), 'base64'))) throw new Error('Framework task signature is invalid.');
}

function signFrame(task: Record<string, unknown>, manifestId: string, privateKey: string, kind: 'result' | 'acknowledgement', sequence: number, payload: Record<string, unknown>) {
  const unsigned = { protocol_version: '1.0', frame_id: `frame_phase26_${kind}_${sequence}`, kind, connector_manifest_id: manifestId, task_id: task.task_id, trace_id: task.trace_id, sequence, idempotency_key: task.idempotency_key, causation_id: task.frame_id, created_at: new Date().toISOString(), expires_at: task.expires_at, payload, payload_hash: hash(payload) };
  return { ...unsigned, sender_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), privateKey).toString('base64')}` };
}

function hash(value: unknown): string { return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`; }
