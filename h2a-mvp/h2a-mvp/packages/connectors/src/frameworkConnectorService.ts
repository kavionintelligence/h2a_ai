import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { delimiter, resolve } from 'node:path';
import { z } from 'zod';
import {
  frameworkCollaborationRunSchema,
  frameworkConnectorDeclarationSchema,
  frameworkConnectorStateSchema,
  frameworkProbeRequestSchema,
  connectorManifestSchema,
  executeFrameworkRequestSchema,
  taskEnvelopeSchema,
  V2_CONTRACT_VERSION,
  type ConnectorImportRequest,
  type DeliveryRecord,
  type TaskEnvelope,
  type ExecuteFrameworkRequest,
  type ConnectorProtocolState,
  type FrameworkCollaborationRun,
  type FrameworkConnectorDeclaration,
  type FrameworkConnectorKind,
  type FrameworkConnectorState,
  type FrameworkProbeRequest
} from '@h2a/contracts';
import { canonicalize, hashCanonical, type EvidenceLedgerPort } from '@h2a/evidence';
import { DirectProcessTransport, McpConnectorTransport, type ConnectorTransport } from '@h2a/messaging';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const declarationsSchema = z.array(frameworkConnectorDeclarationSchema);
const runsSchema = z.array(frameworkCollaborationRunSchema);
const executionKeySchema = z.object({ publisher_private_key_pem: z.string(), publisher_public_key_pem: z.string(), runtime_private_key_pem: z.string(), runtime_public_key_pem: z.string() }).strict();

export interface ConnectorProtocolStatePort {
  getState(): Promise<ConnectorProtocolState>;
  getPublicKey?(): Promise<string>;
  enqueue?(task: TaskEnvelope, connectorManifestId: string, organizationPublicKeyPem: string): Promise<DeliveryRecord>;
  deliver?(deliveryId: string, transport: ConnectorTransport): Promise<DeliveryRecord>;
}

export interface FrameworkExecutionAuthorityPort {
  signOrganizationRecord(value: unknown): Promise<{ canonicalHash: string; signature: string }>;
  getOrganizationPublicKey(): Promise<string>;
}

export interface FrameworkConnectorRegistryPort {
  import(request: ConnectorImportRequest): Promise<unknown>;
}

export class FrameworkConnectorService {
  private readonly declarations: VersionedJsonRepository<'h2a.framework-connectors.declarations', FrameworkConnectorDeclaration[]>;
  private readonly runs: VersionedJsonRepository<'h2a.framework-connectors.runs', FrameworkCollaborationRun[]>;
  private readonly executionKeys: VersionedJsonRepository<'h2a.phase26.framework-execution-key', z.infer<typeof executionKeySchema>>;

  public constructor(
    dataPath: string,
    private readonly protocol: ConnectorProtocolStatePort,
    private readonly evidence: EvidenceLedgerPort,
    private readonly projectRoot: string,
    private readonly clock: () => Date = () => new Date(),
    private readonly execution?: { registry: FrameworkConnectorRegistryPort; authority: FrameworkExecutionAuthorityPort }
  ) {
    const store = new AtomicFileStore(dataPath);
    this.declarations = new VersionedJsonRepository(store, 'connectors/framework-declarations.json', 'h2a.framework-connectors.declarations', declarationsSchema, { initialData: [], clock });
    this.runs = new VersionedJsonRepository(store, 'connectors/framework-collaboration-runs.json', 'h2a.framework-connectors.runs', runsSchema, { initialData: [], clock });
    this.executionKeys = new VersionedJsonRepository(store, 'connectors/phase26-framework-keys.json', 'h2a.phase26.framework-execution-key', executionKeySchema, { initialData: createExecutionKeys(), clock });
  }

  public async initialize(): Promise<FrameworkConnectorState> {
    await this.declarations.write(this.probeDeclarations());
    await this.runs.read();
    await this.executionKeys.read();
    return this.getState();
  }

  public async getState(): Promise<FrameworkConnectorState> {
    return frameworkConnectorStateSchema.parse({
      declarations: await this.declarations.read(),
      protocol: await this.protocol.getState(),
      collaboration_runs: await this.runs.read()
    });
  }

  public async probe(request: FrameworkProbeRequest = {}): Promise<FrameworkConnectorState> {
    const input = frameworkProbeRequestSchema.parse(request);
    const current = await this.declarations.read();
    const probed = this.probeDeclarations();
    const next = input.kind
      ? current.map((item) => probed.find((candidate) => candidate.kind === input.kind && candidate.connector_id === item.connector_id) ?? item)
      : probed;
    await this.declarations.write(next);
    await this.evidence.append({
      trace_id: `tr_framework_probe_${this.clock().getTime()}`,
      actor: { type: 'system', id: 'h2a-framework-connector-service' },
      subject: { type: 'connector_manifest', id: input.kind ?? 'framework-catalogue' },
      event_type: 'FRAMEWORK_CONNECTOR_PROBED',
      payload: {
        kind: input.kind ?? 'all',
        ready: next.filter((item) => item.health === 'ready').map((item) => item.kind),
        unavailable: next.filter((item) => item.health !== 'ready').map((item) => ({ kind: item.kind, health: item.health }))
      }
    });
    return this.getState();
  }

  public async recordCollaboration(run: FrameworkCollaborationRun): Promise<FrameworkConnectorState> {
    const validated = frameworkCollaborationRunSchema.parse(run);
    const current = await this.runs.read();
    await this.runs.write([...current.filter((item) => item.run_id !== validated.run_id), validated].slice(-100));
    await this.evidence.append({
      trace_id: validated.trace_id,
      actor: { type: 'system', id: 'h2a-framework-connector-service' },
      subject: { type: 'outcome', id: validated.run_id },
      mandate_id: validated.mandate_id,
      event_type: 'FRAMEWORK_COLLABORATION_COMPLETED',
      payload: {
        status: validated.status,
        trust_mode: validated.trust_mode,
        connector_kinds: validated.steps.map((step) => step.connector_kind),
        delivery_ids: validated.steps.map((step) => step.delivery_id)
      }
    });
    return this.getState();
  }

  public async execute(request: ExecuteFrameworkRequest): Promise<FrameworkConnectorState> {
    const input = executeFrameworkRequestSchema.parse(request);
    if (!this.execution || !this.protocol.enqueue || !this.protocol.deliver) throw new Error('Framework execution is not composed in this runtime.');
    if (input.kind === 'a2a') throw new Error('A2A execution requires a configured peer Agent Card and HTTPS transport; use MCP or custom CLI for the local Phase 26 run.');
    const declaration = (await this.declarations.read()).find((item) => item.kind === input.kind);
    if (!declaration || declaration.health !== 'ready') throw new Error(declaration?.detail ?? 'Framework connector is unavailable.');
    const keys = await this.executionKeys.read();
    const connectorManifestId = `connector_phase26_${input.kind.replace('-', '_')}_v1`;
    const protocol = input.kind === 'mcp' ? 'mcp' as const : 'local-cli' as const;
    const unsignedManifest = {
      schema_version: V2_CONTRACT_VERSION, connector_manifest_id: connectorManifestId,
      name: input.kind === 'mcp' ? 'H2A Phase 26 MCP Participant' : 'H2A Phase 26 Custom CLI Participant',
      provider: input.kind, adapter_version: '1.0.0', protocol, auth_method: 'none' as const,
      trust_ceiling: 'connected-observed' as const, capabilities: ['task.receive', 'result.return', 'acknowledgement.return', 'zero-disclosure'],
      executable: process.execPath, h2a_extension_required: true, status: 'available' as const, probed_at: this.clock().toISOString()
    };
    const manifest = connectorManifestSchema.parse({ ...unsignedManifest, canonical_hash: hashCanonical(unsignedManifest), publisher_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsignedManifest)), keys.publisher_private_key_pem).toString('base64')}` });
    await this.execution.registry.import({ manifest, publisher_public_key_pem: keys.publisher_public_key_pem, runtime_public_key_pem: keys.runtime_public_key_pem, ceremony: input.ceremony });
    const now = this.clock();
    const unsignedTask = {
      schema_version: V2_CONTRACT_VERSION, task_id: input.assignment_id, organization_id: input.organization_id,
      trace_id: input.ceremony.trace_id, ceremony_id: input.ceremony.ceremony_id, requestor_human_id: input.requestor_human_id,
      assigned_agent_id: input.assigned_agent_id, passport_id: input.passport_id, runtime_attestation_id: input.runtime_attestation_id,
      mandate_id: input.mandate_id, context_grant_id: 'ctx_phase26_zero_disclosure', objective: input.objective,
      dependency_task_ids: input.dependency_task_ids, output_contract: { format: 'phase26-security-finding', dependency_output_hashes: input.dependency_output_hashes, protected_context: false },
      sequence: 0, idempotency_key: input.ceremony.idempotency_key, issued_at: now.toISOString(), expires_at: new Date(now.getTime() + input.timeout_seconds * 1000 + 30_000).toISOString()
    };
    const signed = await this.execution.authority.signOrganizationRecord(unsignedTask);
    const task = taskEnvelopeSchema.parse({ ...unsignedTask, canonical_hash: signed.canonicalHash, organization_signature: signed.signature });
    const queued = await this.protocol.enqueue(task, connectorManifestId, await this.execution.authority.getOrganizationPublicKey());
    const startedAt = this.clock().toISOString();
    const transport = await this.createTransport(input.kind, connectorManifestId, keys.runtime_private_key_pem, input.timeout_seconds * 1000);
    let delivered: DeliveryRecord;
    try { delivered = await this.protocol.deliver(queued.delivery_id, transport); }
    finally { await closeTransport(transport); }
    const succeeded = delivered.status === 'acknowledged';
    const run = frameworkCollaborationRunSchema.parse({
      run_id: `framework_run_${input.ceremony.idempotency_key}`, trace_id: input.ceremony.trace_id, ceremony_id: input.ceremony.ceremony_id,
      assignment_id: input.assignment_id, passport_id: input.passport_id, runtime_session_id: input.runtime_session_id, mandate_id: input.mandate_id,
      status: succeeded ? 'succeeded' : 'failed', trust_mode: 'connected-observed', started_at: startedAt, completed_at: this.clock().toISOString(),
      evidence_integrity: (await this.evidence.verify()).status === 'verified' ? 'verified' : 'warning',
      steps: [{ step_id: `step_${input.kind}`, connector_kind: input.kind, connector_manifest_id: connectorManifestId, delivery_id: delivered.delivery_id, task_id: task.task_id, status: succeeded ? 'acknowledged' : 'failed', output_hash: delivered.result_frame?.payload_hash }]
    });
    await this.recordCollaboration(run);
    if (!succeeded) throw new Error(delivered.last_error ?? 'Framework delivery failed.');
    return this.getState();
  }

  private async createTransport(kind: 'mcp' | 'custom-cli', connectorManifestId: string, privateKey: string, timeoutMs: number): Promise<ConnectorTransport> {
    const nodeModeEnvironment = electronNodeModeEnvironment();
    if (kind === 'custom-cli') return new DirectProcessTransport({ command: process.execPath, args: ['--experimental-strip-types', resolve(this.projectRoot, 'packages/sdk-typescript/src/phase26FrameworkAgent.ts')], cwd: this.projectRoot, env: nodeModeEnvironment, connectorManifestId, runtimePrivateKeyPem: privateKey, timeoutMs });
    const directory = await mkdtemp(join(tmpdir(), 'h2a-phase26-mcp-'));
    const keyPath = join(directory, 'runtime-private.pem');
    await writeFile(keyPath, privateKey, { encoding: 'utf8', mode: 0o600 });
    const transport = new McpConnectorTransport({ command: process.execPath, args: ['--experimental-strip-types', resolve(this.projectRoot, 'packages/sdk-typescript/src/phase26McpAgent.ts')], cwd: this.projectRoot, env: { ...nodeModeEnvironment, H2A_CONNECTOR_MANIFEST_ID: connectorManifestId, H2A_CONNECTOR_PRIVATE_KEY_PATH: keyPath }, timeoutMs });
    const originalClose = transport.close.bind(transport);
    transport.close = async () => { await originalClose(); await rm(directory, { recursive: true, force: true }); };
    return transport;
  }

  private probeDeclarations(): FrameworkConnectorDeclaration[] {
    const checkedAt = this.clock().toISOString();
    const n8n = executable('n8n');
    const openclaw = executable('openclaw');
    const python = executable(process.platform === 'win32' ? 'python.exe' : 'python3') ?? executable('python');
    const langgraph = python ? pythonModule(python, 'langgraph') : false;
    const setup = (name: string): string => `docs/plan2/connectors/${name}.md`;
    const item = (value: Omit<FrameworkConnectorDeclaration, 'adapter_version' | 'trust_ceiling' | 'checked_at'>): FrameworkConnectorDeclaration =>
      frameworkConnectorDeclarationSchema.parse({ ...value, adapter_version: '1.0.0', trust_ceiling: 'connected-observed', checked_at: checkedAt });

    return [
      item({ connector_id: 'framework_n8n', kind: 'n8n', name: 'n8n Signed Webhook', protocol: 'signed-webhook', capabilities: ['task.receive', 'context.request', 'result.return', 'webhook.verify'], health: n8n ? 'configuration-required' : 'dependency-missing', detail: n8n ? 'n8n is installed; import and configure the signed H2A workflow.' : 'n8n is not installed. The signed webhook bridge and importable workflow remain available.', setup_document: setup('N8N_CONNECTOR.md'), dependency: 'n8n', endpoint_policy: 'loopback-only' }),
      item({ connector_id: 'framework_langgraph', kind: 'langgraph', name: 'LangGraph Middleware', protocol: 'local-cli', capabilities: ['task.receive', 'context.request', 'result.return', 'graph.middleware'], health: langgraph ? 'ready' : 'dependency-missing', detail: langgraph ? 'Python LangGraph is installed and the H2A middleware can load.' : 'Python is available but LangGraph is not installed; install the pinned optional requirements.', setup_document: setup('LANGGRAPH_CONNECTOR.md'), dependency: 'langgraph', endpoint_policy: 'none' }),
      item({ connector_id: 'framework_mcp', kind: 'mcp', name: 'MCP Gateway', protocol: 'mcp', capabilities: ['tools.call', 'task.receive', 'context.request', 'result.return', 'stdio'], health: packageReadable(this.projectRoot, '@modelcontextprotocol/sdk') ? 'ready' : 'dependency-missing', detail: packageReadable(this.projectRoot, '@modelcontextprotocol/sdk') ? 'Official MCP TypeScript SDK is installed; stdio gateway is ready.' : 'Official MCP TypeScript SDK is not installed.', setup_document: setup('MCP_CONNECTOR.md'), dependency: '@modelcontextprotocol/sdk', endpoint_policy: 'none' }),
      item({ connector_id: 'framework_a2a', kind: 'a2a', name: 'A2A 1.0 Transport', protocol: 'a2a-1.0', capabilities: ['message.send', 'task.cancel', 'h2a.extension.required'], health: packageReadable(this.projectRoot, '@a2a-js/sdk') ? 'ready' : 'dependency-missing', detail: packageReadable(this.projectRoot, '@a2a-js/sdk') ? 'Official A2A JavaScript SDK 1.0 transport is ready.' : 'Official A2A JavaScript SDK is not installed.', setup_document: setup('A2A_CONNECTOR.md'), dependency: '@a2a-js/sdk', endpoint_policy: 'https-required' }),
      item({ connector_id: 'framework_openclaw', kind: 'openclaw', name: 'OpenClaw Policy Plugin', protocol: 'signed-webhook', capabilities: ['before_agent_run', 'before_tool_call', 'agent_end', 'gateway.lifecycle'], health: openclaw ? 'configuration-required' : 'dependency-missing', detail: openclaw ? 'OpenClaw is installed; link, validate, enable, and restart its Gateway.' : 'OpenClaw is not installed. The typed policy plugin package is ready for a supported host.', setup_document: setup('OPENCLAW_CONNECTOR.md'), dependency: 'openclaw >= 2026.5.17', endpoint_policy: 'loopback-only' }),
      item({ connector_id: 'framework_custom_cli', kind: 'custom-cli', name: 'Custom CLI SDK', protocol: 'local-cli', capabilities: ['task.receive', 'context.request', 'result.return', 'cancellation'], health: 'ready', detail: 'The signed JSON-line SDK and supervised local process transport are ready.', setup_document: setup('CUSTOM_CONNECTORS.md'), dependency: 'Node.js 22+', endpoint_policy: 'none' }),
      item({ connector_id: 'framework_custom_http', kind: 'custom-http', name: 'Custom HTTP Adapter', protocol: 'custom-http', capabilities: ['task.receive', 'context.request', 'result.return', 'signed-http'], health: 'configuration-required', detail: 'Configure a loopback endpoint or an HTTPS endpoint before delivery.', setup_document: setup('CUSTOM_CONNECTORS.md'), endpoint_policy: 'https-required' }),
      apiDeclaration('openai-api', 'OpenAI API', 'OPENAI_API_KEY', checkedAt),
      apiDeclaration('anthropic-api', 'Anthropic API', 'ANTHROPIC_API_KEY', checkedAt),
      apiDeclaration('gemini-api', 'Gemini API', 'GEMINI_API_KEY', checkedAt),
      apiDeclaration('bedrock-api', 'AWS Bedrock', 'AWS_REGION', checkedAt)
    ];
  }
}

export function electronNodeModeEnvironment(versions: { electron?: string; node?: string } = process.versions): NodeJS.ProcessEnv {
  return versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {};
}

function createExecutionKeys() {
  const publisher = generateKeyPairSync('ed25519');
  const runtime = generateKeyPairSync('ed25519');
  return { publisher_private_key_pem: publisher.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publisher_public_key_pem: publisher.publicKey.export({ type: 'spki', format: 'pem' }).toString(), runtime_private_key_pem: runtime.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), runtime_public_key_pem: runtime.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

async function closeTransport(transport: ConnectorTransport): Promise<void> {
  if ('close' in transport && typeof transport.close === 'function') await transport.close();
}

function apiDeclaration(kind: Extract<FrameworkConnectorKind, `${string}-api`>, name: string, environmentKey: string, checkedAt: string): FrameworkConnectorDeclaration {
  const configured = Boolean(process.env[environmentKey]);
  return frameworkConnectorDeclarationSchema.parse({
    connector_id: `framework_${kind.replaceAll('-', '_')}`,
    kind,
    name,
    protocol: 'provider-api',
    adapter_version: '1.0.0',
    trust_ceiling: 'connected-observed',
    capabilities: ['task.execute', 'structured-output'],
    health: configured ? 'configuration-required' : 'authentication-required',
    detail: configured ? `${environmentKey} is present; provider-specific live acceptance is still required.` : `${environmentKey} is not configured; no credential value was read or stored.`,
    setup_document: 'docs/plan2/connectors/PROVIDER_API_CONNECTORS.md',
    dependency: environmentKey,
    endpoint_policy: 'https-required',
    checked_at: checkedAt
  });
}

function executable(name: string): string | undefined {
  if (name.includes('/') || name.includes('\\')) {
    try { accessSync(name, constants.X_OK); return resolve(name); } catch { return undefined; }
  }
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const suffix of process.platform === 'win32' ? ['', '.exe', '.cmd'] : ['']) {
      const candidate = resolve(directory, `${name}${suffix}`);
      try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
    }
  }
  return undefined;
}

function pythonModule(python: string, module: string): boolean {
  const result = spawnSync(python, ['-c', `import importlib.util,sys;sys.exit(0 if importlib.util.find_spec(${JSON.stringify(module)}) else 1)`], { stdio: 'ignore', timeout: 5000, windowsHide: true });
  return result.status === 0;
}

function packageReadable(projectRoot: string, name: string): boolean {
  try { accessSync(resolve(projectRoot, 'node_modules', ...name.split('/'), 'package.json'), constants.R_OK); return true; } catch { return false; }
}
