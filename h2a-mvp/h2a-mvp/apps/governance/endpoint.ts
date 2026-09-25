import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { CensusEntity, DiscoveryScan } from './contracts';
import type { DiscoveryProvider } from './service';

const run = promisify(execFile);
const reportSchema = z.object({ host: z.string(), platform: z.string(), coverage: z.string(),
  tools: z.array(z.object({ id: z.string(), name: z.string(), provider: z.string().nullable(), category: z.string().nullable(), running: z.boolean(), evidence: z.array(z.object({ kind: z.string(), value: z.string() })) })),
  errors: z.array(z.object({ source: z.string(), code: z.string(), message: z.string() })) });

export function withEndpointDiscovery(census: DiscoveryProvider, root: string): DiscoveryProvider {
  return { configured: true, endpoint: 'This server endpoint + configured Census sources', scan: async () => {
    const started = new Date().toISOString();
    const scan: DiscoveryScan = { scan_id: `SCAN-${randomUUID()}`, correlation_id: randomUUID(), started_at: started, completed_at: started,
      agents: [], errors: [], discovery_sources: ['endpoint-inventory'], observed_agent_ids: [], configured_source_count: 1 };
    try {
      const { stdout } = await run(process.env.BYOSYNC_COLLECTOR_PYTHON || 'python', [resolve(root, 'scripts/endpoint_collect.py')],
        { timeout: 25000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
      const report = reportSchema.parse(JSON.parse(stdout));
      scan.errors.push(...report.errors);
      scan.coverage = report.coverage;
      for (const tool of report.tools) {
        const identity = createHash('sha256').update(`${report.host}:${tool.id}`).digest('hex').slice(0, 24);
        const evidence = tool.evidence.map(item => ({ ...item, source: 'shadow-ai-guard-registry', observed_at: started }));
        const entity: CensusEntity = { agent_id: `ENDPOINT-${identity}`, name: `${tool.name} · ${report.host}`, provider: tool.provider,
          model: null, framework: 'endpoint-inventory', endpoint: null, protocols: [], tools: [], capabilities: [],
          fingerprint: { host: report.host, tool_id: tool.id, running: tool.running, platform: report.platform },
          classification: { is_agent: false, classification: tool.running ? 'ai_process_name_match' : tool.evidence.some(item => item.kind === 'binary_on_path') ? 'installed_ai_tool' : 'ai_configuration_present', confidence: 0.85,
            entity_type: tool.category || 'ai_tool', reasons: ['Known tool matched the Shadow AI Guard registry.', 'Process names can overlap across tools; verify the executable before attributing activity.', 'Presence does not prove autonomous behavior, authorization or model activity.'], evidence },
          registered: false, shadow: false, authorization_status: 'unreviewed', discovery_sources: ['endpoint-inventory'],
          first_seen: started, last_seen: started, activity_status: 'active', evidence_age_seconds: 0, confidence: 0.85, evidence, identity_decisions: [] };
        scan.agents.push(entity);
      }
    } catch {
      scan.errors.push({ source: 'endpoint-inventory', code: 'collector_failed', message: 'Endpoint collector failed. Check Python/PyYAML and local permissions; zero findings is not a clean bill of health.' });
    }
    if (census.configured) {
      try {
        const remote = await census.scan();
        scan.agents.push(...remote.agents); scan.errors.push(...remote.errors);
        scan.discovery_sources.push(...remote.discovery_sources); scan.configured_source_count += remote.configured_source_count;
      } catch { scan.errors.push({ source: 'agent-census', code: 'unavailable', message: 'Configured Census service is unavailable.' }); }
    }
    scan.observed_agent_ids = scan.agents.map(item => item.agent_id);
    scan.completed_at = new Date().toISOString();
    return scan;
  } };
}
