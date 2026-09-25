import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConnectorManifest, TaskEnvelope } from '@h2a/contracts';
import { ConnectorRegistry, FrameworkConnectorService } from '@h2a/connectors';
import { canonicalize, hashCanonical, LocalAuthorityEventLedger } from '@h2a/evidence';
import { A2AConnectorTransport, LocalProcessTransport, McpConnectorTransport, MessageBroker, SignedHttpConnectorTransport } from '@h2a/messaging';

const transports: Array<{ close(): Promise<void> }> = [];
afterEach(async () => { await Promise.all(transports.splice(0).map((transport) => transport.close())); });

describe('Phase 17 framework connector catalogue', () => {
  it('reports capability and dependency health without overstating trust or exposing credentials', async () => {
    const fixture = await createFixture();
    const service = new FrameworkConnectorService(fixture.dataPath, fixture.broker, fixture.ledger, resolve('.'));
    const state = await service.initialize();

    expect(state.declarations.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'n8n', 'langgraph', 'mcp', 'a2a', 'openclaw', 'custom-cli', 'custom-http',
      'openai-api', 'anthropic-api', 'gemini-api', 'bedrock-api'
    ]));
    expect(state.declarations.every((item) => item.trust_ceiling === 'connected-observed')).toBe(true);
    expect(state.declarations.find((item) => item.kind === 'mcp')?.health).toBe('ready');
    expect(state.declarations.find((item) => item.kind === 'a2a')?.health).toBe('ready');
    expect(JSON.stringify(state.declarations)).not.toContain(process.env.OPENAI_API_KEY ?? '__unset__');

    await service.probe({ kind: 'mcp' });
    expect((await fixture.ledger.list()).map((event) => event.event_type)).toContain('FRAMEWORK_CONNECTOR_PROBED');
  });

  it('rejects insecure remote HTTP endpoints and credentials embedded in URLs', () => {
    expect(() => new SignedHttpConnectorTransport({ endpoint: 'http://agent.example.test/h2a' })).toThrow('require HTTPS');
    expect(() => new SignedHttpConnectorTransport({ endpoint: 'https://user:secret@agent.example.test/h2a' })).toThrow('must not be embedded');
    expect(() => new SignedHttpConnectorTransport({ endpoint: 'http://127.0.0.1:8080/h2a' })).not.toThrow();
  });

  it('rejects A2A Agent Cards that do not require H2A authority', () => {
    expect(() => new A2AConnectorTransport({
      agentCard: { capabilities: { extensions: [] } } as never
    })).toThrow('must require the H2A authority extension');
  });

  it('keeps host-framework boundaries pinned and syntactically valid', async () => {
    const openclaw = await readFile(resolve('integrations/openclaw/index.ts'), 'utf8');
    const n8n = await readFile(resolve('integrations/n8n/nodes/H2aSignedExchange/H2aSignedExchange.node.ts'), 'utf8');
    expect(openclaw).toContain("outcome: 'block'");
    expect(openclaw).toContain("api.on('before_tool_call'");
    expect(openclaw).toContain("api.on('agent_end'");
    expect(n8n).toContain('Remote H2A worker endpoints require HTTPS');
    const result = spawnSync('python', ['-m', 'py_compile', 'packages/sdk-python/h2a_sdk/langgraph.py'], { cwd: resolve('.'), encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });
});

describe('Phase 17 governed collaboration acceptance', () => {
  it('lets an MCP agent and local CLI agent collaborate through one signed, bounded trace', async () => {
    const fixture = await createFixture();
    const mcp = await importConnector(fixture, 'connector_mcp_risk', 'mcp', 'MCP Risk Agent');
    const cli = await importConnector(fixture, 'connector_cli_review', 'local-cli', 'CLI Review Agent');
    await fixture.broker.initialize();

    const mcpKeyPath = join(fixture.dataPath, 'mcp-private.pem');
    const cliKeyPath = join(fixture.dataPath, 'cli-private.pem');
    await writeFile(mcpKeyPath, mcp.runtime.privateKeyPem, { encoding: 'utf8', mode: 0o600 });
    await writeFile(cliKeyPath, cli.runtime.privateKeyPem, { encoding: 'utf8', mode: 0o600 });

    const mcpTransport = new McpConnectorTransport({
      command: process.execPath,
      args: ['--experimental-strip-types', resolve('packages/sdk-typescript/src/sampleMcpAgent.ts')],
      cwd: resolve('.'),
      env: { H2A_CONNECTOR_MANIFEST_ID: mcp.manifest.connector_manifest_id, H2A_CONNECTOR_PRIVATE_KEY_PATH: mcpKeyPath },
      timeoutMs: 10_000
    });
    const cliTransport = new LocalProcessTransport({
      command: process.execPath,
      args: ['--experimental-strip-types', resolve('packages/sdk-typescript/src/sampleExternalAgent.ts')],
      connectorManifestId: cli.manifest.connector_manifest_id,
      connectorPrivateKeyPath: cliKeyPath,
      cwd: resolve('.'),
      env: { H2A_REQUESTED_FIELDS: 'mcp_assessment' },
      timeoutMs: 10_000
    });
    transports.push(mcpTransport, cliTransport);

    const firstTask = signTask(unsignedTask('task_mcp_risk', 'agent_mcp', [], 1), fixture.organization.privateKeyPem);
    const firstQueued = await fixture.broker.enqueue(firstTask, mcp.manifest.connector_manifest_id, fixture.organization.publicKeyPem);
    const first = await fixture.broker.deliver(firstQueued.delivery_id, mcpTransport);
    expect(first.status).toBe('acknowledged');
    const firstOutput = first.result_frame?.payload.output as Record<string, unknown>;
    expect(firstOutput).toMatchObject({ framework: 'mcp', assessment: 'Acme:high' });

    fixture.context.mcp_assessment = firstOutput.assessment;
    const secondTask = signTask(unsignedTask('task_cli_review', 'agent_cli', [firstTask.task_id], 2), fixture.organization.privateKeyPem);
    const secondQueued = await fixture.broker.enqueue(secondTask, cli.manifest.connector_manifest_id, fixture.organization.publicKeyPem);
    const second = await fixture.broker.deliver(secondQueued.delivery_id, cliTransport);
    expect(second.status).toBe('acknowledged');
    expect(second.result_frame?.payload).toMatchObject({
      status: 'succeeded', output: { authorized_context: { mcp_assessment: 'Acme:high' } }
    });

    const integrity = await fixture.ledger.verify();
    expect(integrity.status).toBe('verified');
    const service = new FrameworkConnectorService(fixture.dataPath, fixture.broker, fixture.ledger, resolve('.'));
    await service.initialize();
    const state = await service.recordCollaboration({
      run_id: 'run_phase17_mcp_cli', trace_id: firstTask.trace_id, mandate_id: firstTask.mandate_id,
      status: 'succeeded', trust_mode: 'connected-observed', evidence_integrity: 'verified',
      started_at: first.created_at, completed_at: second.updated_at,
      steps: [
        { step_id: 'step_mcp', connector_kind: 'mcp', connector_manifest_id: mcp.manifest.connector_manifest_id, delivery_id: first.delivery_id, task_id: firstTask.task_id, status: 'acknowledged', output_hash: hashCanonical(firstOutput) },
        { step_id: 'step_cli', connector_kind: 'custom-cli', connector_manifest_id: cli.manifest.connector_manifest_id, delivery_id: second.delivery_id, task_id: secondTask.task_id, status: 'acknowledged', output_hash: second.result_frame?.payload_hash }
      ]
    });
    expect(state.collaboration_runs).toEqual([expect.objectContaining({ status: 'succeeded', trust_mode: 'connected-observed' })]);
    expect((await fixture.ledger.list()).map((event) => event.event_type)).toContain('FRAMEWORK_COLLABORATION_COMPLETED');
    if (process.env.H2A_WRITE_PHASE17_PROOF === '1') {
      const finalIntegrity = await fixture.ledger.verify();
      await writeFile(resolve('docs/plan2/evidence/phase17-mcp-cli-collaboration-proof.json'), `${JSON.stringify({
        schema_version: 1,
        generated_at: new Date().toISOString(),
        acceptance: 'official MCP framework agent and local CLI agent completed one signed dependency trace',
        trust_mode: 'connected-observed',
        trace_id: firstTask.trace_id,
        mandate_id: firstTask.mandate_id,
        steps: [
          { connector_kind: 'mcp', task_id: firstTask.task_id, delivery_id: first.delivery_id, dependency_task_ids: firstTask.dependency_task_ids, output_hash: hashCanonical(firstOutput), status: first.status },
          { connector_kind: 'custom-cli', task_id: secondTask.task_id, delivery_id: second.delivery_id, dependency_task_ids: secondTask.dependency_task_ids, output_hash: second.result_frame?.payload_hash, status: second.status }
        ],
        context_release: [
          { connector_kind: 'mcp', granted_field_names: ['risk_tier', 'supplier_name'] },
          { connector_kind: 'custom-cli', granted_field_names: ['mcp_assessment'] }
        ],
        evidence: { status: finalIntegrity.status, record_count: finalIntegrity.recordCount, head_hash: finalIntegrity.headHash },
        excluded: ['context values', 'task objective text', 'result bodies', 'credentials', 'private keys']
      }, null, 2)}\n`, 'utf8');
    }
  }, 15_000);
});

async function createFixture() {
  const dataPath = await mkdtemp(join(tmpdir(), 'h2a-phase17-'));
  const organization = keyPair();
  const ledger = new LocalAuthorityEventLedger(dataPath);
  const registry = new ConnectorRegistry(dataPath, ledger);
  const context: Record<string, unknown> = { supplier_name: 'Acme', risk_tier: 'high' };
  const authorization = {
    authorize: async (task: TaskEnvelope, request: { context_grant_id: string; requested_fields: string[] }) => ({
      authorized: task.context_grant_id === request.context_grant_id,
      reason_code: 'CONTEXT_GRANT_ACTIVE',
      granted_fields: Object.fromEntries(Object.entries(context).filter(([key]) => request.requested_fields.includes(key))),
      withheld_fields: request.requested_fields.filter((key) => !(key in context))
    })
  };
  const broker = new MessageBroker(dataPath, registry, ledger, authorization);
  return { dataPath, organization, ledger, registry, broker, context };
}

async function importConnector(fixture: Awaited<ReturnType<typeof createFixture>>, id: string, protocol: ConnectorManifest['protocol'], name: string) {
  const publisher = keyPair();
  const runtime = keyPair();
  const manifest = signManifest({
    schema_version: 2, connector_manifest_id: id, name, provider: `phase17-${protocol}`,
    adapter_version: '1.0.0', protocol, auth_method: 'none', trust_ceiling: 'connected-observed',
    capabilities: ['task.receive', 'context.request', 'result.return'], executable: process.execPath,
    h2a_extension_required: true, status: 'available'
  }, publisher.privateKeyPem);
  await fixture.registry.import({ manifest, publisher_public_key_pem: publisher.publicKeyPem, runtime_public_key_pem: runtime.publicKeyPem });
  return { manifest, runtime };
}

function unsignedTask(taskId: string, agentId: string, dependencies: string[], sequence: number): Omit<TaskEnvelope, 'canonical_hash' | 'organization_signature'> {
  const now = new Date();
  return {
    schema_version: 2, task_id: taskId, organization_id: 'org_hp_demo', trace_id: 'trace_phase17_collaboration',
    requestor_human_id: 'human_operator', assigned_agent_id: agentId, passport_id: `passport_${agentId}`,
    runtime_attestation_id: `attestation_${agentId}`, mandate_id: 'mandate_phase17_supplier_review',
    context_grant_id: 'grant_phase17_supplier_review', objective: 'Review only authorized supplier context.',
    dependency_task_ids: dependencies, output_contract: { type: 'object' }, sequence,
    idempotency_key: `idem_${taskId}`, issued_at: now.toISOString(), expires_at: new Date(now.getTime() + 60_000).toISOString()
  };
}

function keyPair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  };
}

function signManifest(unsigned: Omit<ConnectorManifest, 'canonical_hash' | 'publisher_signature'>, privateKeyPem: string): ConnectorManifest {
  return { ...unsigned, canonical_hash: hashCanonical(unsigned), publisher_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), privateKeyPem).toString('base64')}` };
}

function signTask(unsigned: Omit<TaskEnvelope, 'canonical_hash' | 'organization_signature'>, privateKeyPem: string): TaskEnvelope {
  return { ...unsigned, canonical_hash: hashCanonical(unsigned), organization_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), privateKeyPem).toString('base64')}` };
}
