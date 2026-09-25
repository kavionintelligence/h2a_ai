import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConnectorManifest, TaskEnvelope } from '@h2a/contracts';
import { ConnectorRegistry } from '@h2a/connectors';
import { canonicalize, hashCanonical, LocalAuthorityEventLedger } from '@h2a/evidence';
import { LocalProcessTransport, MessageBroker, type ConnectorTransport } from '@h2a/messaging';

const transports: LocalProcessTransport[] = [];
afterEach(async () => { await Promise.all(transports.splice(0).map((transport) => transport.close())); });

describe('Phase 15 connector protocol', () => {
  it('imports only a correctly signed Connector Manifest', async () => {
    const fixture = await createFixture();
    await expect(fixture.registry.import({ ...fixture.importRequest, manifest: { ...fixture.manifest, name: 'Tampered Connector' } })).rejects.toThrow('canonical hash');
    await expect(fixture.registry.import(fixture.importRequest)).resolves.toMatchObject({ health: 'healthy' });
  });

  it('delivers to a separate process and survives retry without duplicate execution', async () => {
    const fixture = await createFixture();
    await fixture.registry.import(fixture.importRequest);
    const broker = fixture.broker;
    await broker.initialize();
    const queued = await broker.enqueue(fixture.task, fixture.manifest.connector_manifest_id, fixture.organization.publicKeyPem);

    const privateKeyPath = join(fixture.dataPath, 'connector-private.pem');
    await writeFile(privateKeyPath, fixture.runtime.privateKeyPem, { encoding: 'utf8', mode: 0o600 });
    const transport = new LocalProcessTransport({
      command: process.execPath,
      args: ['--experimental-strip-types', resolve('packages/sdk-typescript/src/sampleExternalAgent.ts')],
      connectorManifestId: fixture.manifest.connector_manifest_id,
      connectorPrivateKeyPath: privateKeyPath,
      cwd: resolve('.'),
      timeoutMs: 10_000
    });
    transports.push(transport);
    let loseFirstAcknowledgement = true;
    const unreliable: ConnectorTransport = {
      deliver: async (...args) => {
        const result = await transport.deliver(...args);
        if (loseFirstAcknowledgement) { loseFirstAcknowledgement = false; throw new Error('Simulated acknowledgement loss.'); }
        return result;
      }
    };

    await expect(broker.deliver(queued.delivery_id, unreliable)).resolves.toMatchObject({ status: 'retrying', attempts: 1 });
    const completed = await broker.deliver(queued.delivery_id, unreliable);
    expect(completed).toMatchObject({ status: 'acknowledged', attempts: 2 });
    expect(completed.result_frame?.payload).toMatchObject({
      status: 'succeeded',
      output: { execution_count: 1, authorized_context: { supplier_name: 'Acme', risk_tier: 'high' } }
    });

    const restarted = new MessageBroker(fixture.dataPath, fixture.registry, fixture.ledger, fixture.authorization);
    await expect(restarted.getState()).resolves.toMatchObject({ deliveries: [expect.objectContaining({ status: 'acknowledged', attempts: 2 })] });
    expect((await fixture.ledger.list()).map((event) => event.event_type)).toEqual(expect.arrayContaining([
      'CONNECTOR_MANIFEST_IMPORTED', 'CONNECTOR_DELIVERY_QUEUED',
      'CONNECTOR_DELIVERY_RETRY_SCHEDULED', 'CONNECTOR_DELIVERY_ACKNOWLEDGED'
    ]));
  });

  it('dead-letters bounded failures and supports cancellation before acknowledgement', async () => {
    const fixture = await createFixture();
    await fixture.registry.import(fixture.importRequest);
    const first = await fixture.broker.enqueue(fixture.task, fixture.manifest.connector_manifest_id, fixture.organization.publicKeyPem, 2);
    const failing: ConnectorTransport = { deliver: async () => { throw new Error('Process unavailable.'); } };
    expect((await fixture.broker.deliver(first.delivery_id, failing)).status).toBe('retrying');
    expect((await fixture.broker.deliver(first.delivery_id, failing)).status).toBe('dead-letter');

    const secondTask = signTask({ ...unsignedTask(), task_id: 'task_cancel', idempotency_key: 'idem_cancel', sequence: 2 }, fixture.organization.privateKeyPem);
    const second = await fixture.broker.enqueue(secondTask, fixture.manifest.connector_manifest_id, fixture.organization.publicKeyPem);
    await expect(fixture.broker.cancel(second.delivery_id, 'Operator withdrew task.')).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('ships a syntactically valid zero-dependency Python SDK', () => {
    const result = spawnSync('python', ['-m', 'py_compile', 'packages/sdk-python/h2a_sdk/__init__.py'], { cwd: resolve('.'), encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });
});

async function createFixture() {
  const dataPath = await mkdtemp(join(tmpdir(), 'h2a-phase15-'));
  const publisher = keyPair();
  const runtime = keyPair();
  const organization = keyPair();
  const manifest = signManifest(unsignedManifest(), publisher.privateKeyPem);
  const ledger = new LocalAuthorityEventLedger(dataPath);
  const registry = new ConnectorRegistry(dataPath, ledger);
  const authorization = {
    authorize: async (task: TaskEnvelope, request: { context_grant_id: string; requested_fields: string[]; purpose: string }) => ({
      authorized: task.context_grant_id === request.context_grant_id,
      reason_code: 'CONTEXT_GRANT_ACTIVE',
      granted_fields: Object.fromEntries(Object.entries({ supplier_name: 'Acme', risk_tier: 'high' }).filter(([key]) => request.requested_fields.includes(key))),
      withheld_fields: []
    })
  };
  const broker = new MessageBroker(dataPath, registry, ledger, authorization);
  return {
    dataPath, publisher, runtime, organization, manifest, ledger, registry, authorization, broker,
    importRequest: { manifest, publisher_public_key_pem: publisher.publicKeyPem, runtime_public_key_pem: runtime.publicKeyPem },
    task: signTask(unsignedTask(), organization.privateKeyPem)
  };
}

function keyPair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  };
}

function unsignedManifest(): Omit<ConnectorManifest, 'canonical_hash' | 'publisher_signature'> {
  return {
    schema_version: 2, connector_manifest_id: 'connector_sample_external', name: 'Sample External Agent',
    provider: 'sample-process', adapter_version: '1.0.0', protocol: 'local-cli', auth_method: 'none',
    trust_ceiling: 'connected-observed', capabilities: ['task.receive', 'context.request', 'result.return'],
    executable: process.execPath, h2a_extension_required: true, status: 'available'
  };
}

function signManifest(unsigned: Omit<ConnectorManifest, 'canonical_hash' | 'publisher_signature'>, privateKeyPem: string): ConnectorManifest {
  return { ...unsigned, canonical_hash: hashCanonical(unsigned), publisher_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), privateKeyPem).toString('base64')}` };
}

function unsignedTask(): Omit<TaskEnvelope, 'canonical_hash' | 'organization_signature'> {
  const now = new Date();
  return {
    schema_version: 2, task_id: 'task_supplier_review', organization_id: 'org_hp_demo', trace_id: 'trace_supplier_review',
    requestor_human_id: 'human_operator', assigned_agent_id: 'agent_external', passport_id: 'passport_external',
    runtime_attestation_id: 'attestation_external', mandate_id: 'mandate_supplier_review', context_grant_id: 'grant_supplier_review',
    objective: 'Review the authorized supplier risk context and return a typed result.', dependency_task_ids: [],
    output_contract: { type: 'object', required: ['execution_count'] }, sequence: 1, idempotency_key: 'idem_supplier_review',
    issued_at: now.toISOString(), expires_at: new Date(now.getTime() + 60_000).toISOString()
  };
}

function signTask(unsigned: Omit<TaskEnvelope, 'canonical_hash' | 'organization_signature'>, privateKeyPem: string): TaskEnvelope {
  return { ...unsigned, canonical_hash: hashCanonical(unsigned), organization_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), privateKeyPem).toString('base64')}` };
}
