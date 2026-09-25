// TEST ONLY: loopback protocol peers and explicit test telemetry.
// Production startup never imports this module or installs these sources.
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

export async function censusTestSources({ includePeer = false } = {}) {
  const requests = [];
  let origin;
  const server = createServer(async (req, res) => {
    requests.push({ method: req.method, path: req.url });
    const json = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url === '/agent-card.json') return json({
      name: 'Marketing Research Agent', description: 'Test-only research protocol peer', version: '1.0.0', protocolVersion: '0.3.0',
      url: `${origin}/a2a`, provider: { organization: 'Test Provider', url: origin }, capabilities: {},
      defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
      skills: [{ id: 'research', name: 'literature_search', description: 'Test literature research', tags: ['research'] }],
    });
    if (includePeer && req.url === '/product-card.json') return json({
      name: 'Product Intelligence Agent', description: 'Test-only product research peer', version: '1.0.0', protocolVersion: '0.3.0',
      url: `${origin}/product-a2a`, capabilities: {}, defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
      skills: [{ id: 'product-research', name: 'product_research', description: 'Test product intelligence', tags: ['research'] }],
    });
    if (req.url === '/inventory') return json({ entries: [{ id: 'test-status-service', name: 'Test Status API', endpoint: `${origin}/status`, protocols: ['http'] }] });
    if (req.url === '/failing-source') return json({ error: 'test-only unavailable source' }, 503);
    if (req.url === '/mcp' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (input.method === 'initialize') return json({ jsonrpc: '2.0', id: input.id, result: { protocolVersion: '2025-11-25', serverInfo: { name: 'Test Tools Server', version: '1' }, capabilities: { tools: {} } } });
      if (input.method === 'notifications/initialized') return json({});
      if (input.method === 'tools/list') return json({ jsonrpc: '2.0', id: input.id, result: { tools: [{ name: 'paper_search', description: 'Test tool', inputSchema: { type: 'object' } }] } });
      return json({ jsonrpc: '2.0', id: input.id, error: { code: -32601, message: 'No execution in discovery peer' } });
    }
    if (req.url === '/status' || req.url === '/health') return json({ status: 'ok' });
    json({ error: 'not found' }, 404);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, requests,
    env: { CENSUS_DISCOVERY_SOURCES: JSON.stringify({ a2a: [{ url: `${origin}/agent-card.json` }, ...(includePeer ? [{ url: `${origin}/product-card.json` }] : []), { url: `${origin}/failing-source` }], mcp: [{ url: `${origin}/mcp` }], api_registry: [{ url: `${origin}/inventory` }] }), CENSUS_ALLOWED_ORIGINS: origin, CENSUS_ALLOW_PRIVATE: 'true', CENSUS_ALLOW_HTTP: 'true', CENSUS_TIMEOUT_SECONDS: '1', CENSUS_EVENT_WINDOW_SECONDS: '5' },
    async ingest(censusUrl, token) {
      const identities = [{ key: 'marketing', name: 'Marketing Research Agent', endpoint: `${origin}/a2a` }, ...(includePeer ? [{ key: 'product', name: 'Product Intelligence Agent', endpoint: `${origin}/product-a2a` }] : [])];
      const events = identities.flatMap(identity => ['llm_call', 'tool_call', 'planning', 'memory_access', 'autonomous_action'].map(kind => ({
        event_id: `integration-test-${identity.key}-${kind}`, timestamp: new Date().toISOString(), source: 'explicit-integration-test-telemetry', service: identity.name, endpoint: identity.endpoint, event_type: kind,
        model: kind === 'llm_call' ? 'test-model' : undefined, tool: kind === 'tool_call' ? 'paper_search' : undefined,
        metadata: { framework: 'CrewAI', llm_provider: 'Test Provider' },
      })));
      const response = await fetch(censusUrl + '/events', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) });
      assert.equal(response.status, 200, await response.text());
    },
    async close() { await new Promise(resolve => server.close(resolve)); },
  };
}
