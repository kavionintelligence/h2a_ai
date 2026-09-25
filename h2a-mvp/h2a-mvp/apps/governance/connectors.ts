import { createHash } from 'node:crypto';
import type { Memory } from './contracts';

function baseUrl(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error('Connector URL cannot contain credentials, query or fragment.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Remote connectors require HTTPS.');
  return url.toString().replace(/\/$/, '');
}

/** Uses the self-hosted Mem0 server contract in the supplied server/main.py. */
export class MemoryConnector {
  private readonly base = process.env.MEM0_API_URL ? baseUrl(process.env.MEM0_API_URL) : null;
  private readonly key = process.env.MEM0_API_KEY;
  get configured() { return Boolean(this.base && this.key); }
  private async call(path: string, body: unknown) {
    if (!this.configured) throw new Error('Mem0 is not configured; local reviewed memory remains available.');
    const response = await fetch(`${this.base}${path}`, { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-API-Key': this.key! }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Mem0 returned HTTP ${response.status}.`);
    return response.json();
  }
  async publish(memory: Memory) {
    if (memory.status !== 'published' || !memory.reviewed_by) throw new Error('Only human-reviewed published memory can enter Mem0.');
    return this.call('/memories', { messages: [{ role: 'user', content: memory.content }], infer: false,
      user_id: `byosync:${memory.room_id}`, metadata: { byosync_memory_id: memory.memory_id, content_hash: memory.content_hash, reviewed_by: memory.reviewed_by, room_id: memory.room_id } });
  }
  async search(roomId: string, query: string) {
    return this.call('/search', { query, filters: { user_id: `byosync:${roomId}` }, top_k: 20 });
  }
}

/** OTLP/HTTP JSON, using the supplied Langfuse otel/attributes.ts contract. */
export async function exportRunTrace(run: { run_id: string; room_id: string; requested_by: string; created_at: string; finished_at?: string; status: string; steps: Array<{ agent_id: string; engine: string; summary?: string; output_hash?: string; duration_ms?: number }> }) {
  if (!process.env.LANGFUSE_HOST || !process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) return { status: 'not-configured' };
  const traceId = createHash('sha256').update(run.run_id).digest('hex').slice(0, 32);
  const spanId = createHash('sha256').update(`${run.run_id}:root`).digest('hex').slice(0, 16);
  const attr = (key: string, value: string) => ({ key, value: { stringValue: value } });
  const metadata = { run_id: run.run_id, status: run.status, steps: run.steps.map(step => ({ agent_id: step.agent_id, engine: step.engine, duration_ms: step.duration_ms, output_hash: step.output_hash, summary_hash: step.summary ? createHash('sha256').update(step.summary).digest('hex') : undefined })) };
  const response = await fetch(`${baseUrl(process.env.LANGFUSE_HOST)}/api/public/otel/v1/traces`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString('base64')}` },
    body: JSON.stringify({ resourceSpans: [{ resource: { attributes: [attr('service.name', 'byosync')] }, scopeSpans: [{ scope: { name: 'byosync-room-runtime', version: '1.2.0' }, spans: [{
      traceId, spanId, name: 'ByoSync governed CLI collaboration', kind: 1,
      startTimeUnixNano: (BigInt(Date.parse(run.created_at)) * 1000000n).toString(),
      endTimeUnixNano: (BigInt(Date.parse(run.finished_at || new Date().toISOString())) * 1000000n).toString(),
      attributes: [attr('user.id', run.requested_by), attr('session.id', run.room_id), attr('langfuse.trace.name', 'ByoSync governed CLI collaboration'),
        attr('langfuse.observation.type', 'span'), attr('langfuse.observation.metadata', JSON.stringify(metadata)), attr('langfuse.trace.metadata', JSON.stringify(metadata))],
      status: { code: run.status === 'succeeded' ? 1 : 2 }
    }] }] }] }) });
  if (!response.ok) throw new Error(`Langfuse returned HTTP ${response.status}.`);
  const result = await response.json() as { partialSuccess?: { rejectedSpans?: string | number; errorMessage?: string } };
  if (Number(result.partialSuccess?.rejectedSpans || 0) > 0 || result.partialSuccess?.errorMessage) throw new Error('Langfuse rejected one or more ingestion records.');
  return { status: 'exported', trace_id: traceId };
}
