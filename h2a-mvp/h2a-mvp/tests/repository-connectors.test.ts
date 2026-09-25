import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryConnector, exportRunTrace } from '../apps/governance/connectors';
import type { Memory } from '../apps/governance/contracts';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('Supplied repository HTTP contracts (stubbed upstream, not live service proof)', () => {
  it('publishes only reviewed Mem0 records, disables extraction and scopes searches', async () => {
    vi.stubEnv('MEM0_API_URL', 'http://127.0.0.1:19999'); vi.stubEnv('MEM0_API_KEY', 'test-only-key');
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })); vi.stubGlobal('fetch', fetcher);
    const connector = new MemoryConnector();
    const memory = { status: 'proposed', memory_id: 'm1', room_id: 'room-a', content: 'Reviewed fact', content_hash: 'h1' } as Memory;
    await expect(connector.publish(memory)).rejects.toThrow('human-reviewed'); expect(fetcher).not.toHaveBeenCalled();
    memory.status = 'published'; memory.reviewed_by = 'reviewer';
    await connector.publish(memory); await connector.search('room-a', 'fact');
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe('http://127.0.0.1:19999/memories');
    expect(JSON.parse(calls[0][1].body as string)).toMatchObject({ infer: false, user_id: 'byosync:room-a', metadata: { byosync_memory_id: 'm1', reviewed_by: 'reviewer' } });
    expect(JSON.parse(calls[1][1].body as string)).toMatchObject({ filters: { user_id: 'byosync:room-a' }, top_k: 20 });
  });
  it('rejects insecure remote endpoints instead of sending service credentials', () => {
    vi.stubEnv('MEM0_API_URL', 'http://remote.example'); vi.stubEnv('MEM0_API_KEY', 'test-only');
    expect(() => new MemoryConnector()).toThrow('HTTPS');
  });
  it('exports real run metadata to Langfuse without prompts or source contents and checks partial errors', async () => {
    vi.stubEnv('LANGFUSE_HOST', 'http://127.0.0.1:19998'); vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'test-public'); vi.stubEnv('LANGFUSE_SECRET_KEY', 'test-secret');
    const fetcher = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })); vi.stubGlobal('fetch', fetcher);
    const run = { run_id: 'test-run', room_id: 'r', requested_by: 'h', created_at: new Date().toISOString(), status: 'succeeded', steps: [{ agent_id: 'a', engine: 'claude', summary: 'PRIVATE SOURCE CONTENT', output_hash: 'sha256:test-fixture-bundle-hash', duration_ms: 10 }] };
    expect((await exportRunTrace(run)).status).toBe('exported');
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toContain('/api/public/otel/v1/traces');
    expect(calls[0][1].body).not.toContain('PRIVATE SOURCE CONTENT');
    expect(calls[0][1].body).toContain('sha256:test-fixture-bundle-hash');
    expect(JSON.parse(calls[0][1].body as string).resourceSpans[0].scopeSpans[0].spans[0].traceId).toMatch(/^[a-f0-9]{32}$/);
    fetcher.mockImplementation(async () => new Response(JSON.stringify({ partialSuccess: { rejectedSpans: '1' } }), { status: 200 }));
    await expect(exportRunTrace(run)).rejects.toThrow('rejected');
  });
});
