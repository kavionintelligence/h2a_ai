import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';
import { hashCanonical } from '@h2a/evidence';
import type { DiscoveryProvider } from './service';

const identifier = z.string().trim().min(1).max(160);
const timestamp = z.string().datetime({ offset: true });
const scalar = z.union([z.string().max(4000), z.number(), z.boolean(), z.null()]);

export const telemetryInputSchema = z.object({
  event_id: identifier.optional(),
  trace_id: identifier,
  parent_event_id: identifier.optional(),
  occurred_at: timestamp.optional(),
  source: z.enum(['byosync', 'agent-census', 'claw-hunter', 'shadow-ai-guard', 'aiostack', 'langfuse', 'mem0', 'claw-orchestrator', 'custom']),
  kind: z.enum(['agent_discovered', 'model_call', 'tool_call', 'mcp_call', 'action', 'policy_decision', 'approval', 'memory_access', 'runtime_status']),
  agent_id: identifier.optional(),
  human_id: identifier.optional(),
  external_identity: z.string().trim().max(300).optional(),
  system: z.string().trim().min(1).max(300),
  operation: z.string().trim().min(1).max(300),
  outcome: z.enum(['observed', 'allowed', 'denied', 'pending', 'succeeded', 'failed', 'unknown']),
  risk: z.enum(['none', 'low', 'medium', 'high', 'critical', 'unknown']).default('unknown'),
  evidence: z.record(z.string().max(100), scalar).default({}),
}).strict();

export const sourceReportInputSchema = z.object({
  report_id: identifier.optional(),
  source: z.enum(['claw-hunter', 'shadow-ai-guard', 'aiostack', 'langfuse', 'mem0', 'claw-orchestrator', 'custom']),
  observed_at: timestamp.optional(),
  collector: z.string().trim().min(1).max(160),
  collector_version: z.string().trim().max(80).optional(),
  host: z.string().trim().min(1).max(300),
  status: z.enum(['healthy', 'degraded', 'silent', 'error']),
  summary: z.object({
    observed_agents: z.number().int().min(0).max(1_000_000).default(0),
    shadow_agents: z.number().int().min(0).max(1_000_000).default(0),
    findings: z.number().int().min(0).max(1_000_000).default(0),
  }).strict(),
  findings: z.array(z.object({
    finding_id: identifier.optional(),
    title: z.string().trim().min(1).max(300),
    severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
    agent_id: identifier.optional(),
    category: z.string().trim().min(1).max(120),
    detail: z.string().trim().min(1).max(4000),
    evidence: z.record(z.string().max(100), scalar).default({}),
  }).strict()).max(5000).default([]),
}).strict();

const telemetryRecordSchema = telemetryInputSchema.extend({
  event_id: identifier,
  occurred_at: timestamp,
  received_at: timestamp,
  evidence_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

const sourceReportRecordSchema = sourceReportInputSchema.extend({
  report_id: identifier,
  observed_at: timestamp,
  received_at: timestamp,
  payload_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  findings: z.array(z.object({
    finding_id: identifier,
    title: z.string(),
    severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
    agent_id: identifier.optional(),
    category: z.string(),
    detail: z.string(),
    evidence: z.record(z.string(), scalar),
  }).strict()).max(5000),
});

const platformStateSchema = z.object({
  telemetry: z.array(telemetryRecordSchema).max(50_000).default([]),
  source_reports: z.array(sourceReportRecordSchema).max(2_000).default([]),
});

type PlatformState = z.infer<typeof platformStateSchema>;
export type TelemetryInput = z.input<typeof telemetryInputSchema>;
export type SourceReportInput = z.input<typeof sourceReportInputSchema>;

const emptyState = (): PlatformState => ({ telemetry: [], source_reports: [] });

/**
 * Portable observability boundary for collectors and agent runtimes.
 * It keeps raw secrets and prompt bodies out of the product: only bounded labels,
 * normalized facts, and a canonical evidence hash are persisted.
 */
export class PlatformService {
  private readonly repository: VersionedJsonRepository<'byosync.platform.v1', PlatformState>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    dataPath: string,
    private readonly discovery: DiscoveryProvider,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.repository = new VersionedJsonRepository(
      new AtomicFileStore(dataPath),
      'byosync/platform.json',
      'byosync.platform.v1',
      platformStateSchema,
      { initialData: emptyState(), clock },
    );
  }

  async initialize(): Promise<void> { await this.repository.read(); }

  ingestTelemetry(input: TelemetryInput | TelemetryInput[]) {
    return this.mutate(async state => {
      const records = (Array.isArray(input) ? input : [input]).map(item => telemetryInputSchema.parse(item));
      if (records.length > 1000) throw new Error('A telemetry batch cannot exceed 1000 events.');
      const receivedAt = this.clock().toISOString();
      for (const item of records) {
        const eventId = item.event_id ?? `EVT-${randomUUID()}`;
        if (state.telemetry.some(event => event.event_id === eventId)) continue;
        state.telemetry.push({ ...item, event_id: eventId, occurred_at: item.occurred_at ?? receivedAt, received_at: receivedAt, evidence_hash: hashCanonical(item) });
      }
      state.telemetry = state.telemetry.slice(-50_000);
    });
  }

  ingestSourceReport(input: SourceReportInput) {
    return this.mutate(async state => {
      const item = sourceReportInputSchema.parse(input);
      const reportId = item.report_id ?? `RPT-${randomUUID()}`;
      if (state.source_reports.some(report => report.report_id === reportId)) return;
      const receivedAt = this.clock().toISOString();
      state.source_reports.push({
        ...item,
        report_id: reportId,
        observed_at: item.observed_at ?? receivedAt,
        received_at: receivedAt,
        payload_hash: hashCanonical(item),
        findings: item.findings.map(finding => ({ ...finding, finding_id: finding.finding_id ?? `FND-${randomUUID()}` })),
      });
      state.source_reports = state.source_reports.slice(-2_000);
    });
  }

  async telemetry(traceId?: string, limit = 500) {
    await this.queue;
    const state = await this.repository.read();
    const filtered = traceId ? state.telemetry.filter(event => event.trace_id === traceId) : state.telemetry;
    return filtered.slice(-Math.min(Math.max(limit, 1), 5000));
  }

  async identityTrace<T extends { timestamp: string }>(agentId: string, authorityEvents: T[]) {
    await this.queue;
    const state = await this.repository.read();
    const telemetry = state.telemetry.filter(event => event.agent_id === agentId);
    return [
      ...authorityEvents.map(event => ({ lane: 'authority' as const, timestamp: event.timestamp, record: event })),
      ...telemetry.map(event => ({ lane: 'runtime' as const, timestamp: event.occurred_at, record: event })),
    ].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  async reports(limit = 100) {
    await this.queue;
    const state = await this.repository.read();
    return state.source_reports.slice(-Math.min(Math.max(limit, 1), 500));
  }

  async status(options: { host: string; authRequired: boolean; namedUsers?: boolean; governanceIntegrity: string; governanceRecords: number }) {
    await this.queue;
    const state = await this.repository.read();
    const latestBySource = new Map<string, PlatformState['source_reports'][number]>();
    for (const report of state.source_reports) latestBySource.set(report.source, report);
    return {
      product: 'ByoSync',
      version: '1.1.0',
      deployment: { host: options.host, portable: true, persistence: 'atomic local files', auth: options.namedUsers ? 'named-user personal credential; roles and room membership' : options.authRequired ? 'access-token cookie/bearer' : 'loopback local operator' },
      authority: { engine: 'H2A', integrity: options.governanceIntegrity, evidence_records: options.governanceRecords },
      components: [
        { id: 'h2a-authority', name: 'H2A identity and authority', status: options.governanceIntegrity === 'verified' ? 'healthy' : 'degraded', mode: 'native' },
        { id: 'agent-census', name: 'Discovery collectors', status: this.discovery.configured ? 'configured' : 'not-configured', mode: 'read-only; inspect last scan for coverage', endpoint: this.discovery.endpoint },
        { id: 'cli-rooms', name: 'Claude Code / Codex rooms', status: 'ready', mode: 'approval-gated CLI adapters; authentication verified per run' },
        { id: 'collector-api', name: 'Endpoint and platform report intake', status: 'ready', mode: 'native', accepted_sources: ['claw-hunter', 'shadow-ai-guard', 'aiostack', 'custom'] },
        { id: 'telemetry-api', name: 'Normalized agent trace intake', status: 'ready', mode: 'native', accepted_sources: ['langfuse', 'aiostack', 'claw-orchestrator', 'mem0', 'custom'] },
        { id: 'reviewed-memory', name: 'Reviewed company memory', status: 'healthy', mode: process.env.MEM0_API_URL && process.env.MEM0_API_KEY ? 'local-plus-mem0-configured; inspect sync result' : 'native-local; Mem0 not connected' },
      ],
      intake: { telemetry_events: state.telemetry.length, source_reports: state.source_reports.length, latest_by_source: Object.fromEntries([...latestBySource].map(([source, report]) => [source, { report_id: report.report_id, status: report.status, observed_at: report.observed_at }])) },
      generated_at: this.clock().toISOString(),
    };
  }

  private mutate(operation: (state: PlatformState) => Promise<void>): Promise<PlatformState> {
    const result = this.queue.then(async () => {
      const state = await this.repository.read();
      await operation(state);
      await this.repository.write(state);
      return structuredClone(state);
    });
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}
