import { createCipheriv, createDecipheriv, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConnectorManifest, RecordGovernedMessageRequest, TaskEnvelope } from '@h2a/contracts';
import { ConnectorRegistry } from '@h2a/connectors';
import { canonicalize, EvidenceAuditService, hashCanonical, LocalAuthorityEventLedger } from '@h2a/evidence';
import { compactTaskAuthority, LocalProcessTransport, MessageBroker } from '@h2a/messaging';
import { ContextBrokerService } from '@h2a/resources';
import { LocalWorkplaceRepository } from '@h2a/storage';

const roots: string[] = [];
const transports: LocalProcessTransport[] = [];
afterEach(async () => { await Promise.all(transports.splice(0).map((item) => item.close())); await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('Phase 19 Context Broker and governed messaging', () => {
  it('releases only recipient- and purpose-bound transformed fields and records replay once', async () => {
    const fixture = await setup();
    const { task, grantId } = await prepareContext(fixture);
    const request = { context_grant_id: grantId, requested_fields: ['supplier_name', 'contact_email', 'payroll_sentinel'], purpose: 'review supplier risk' };
    const first = await fixture.context.authorize(task, request);
    expect(first).toEqual({ authorized: true, reason_code: 'CONTEXT_GRANT_ACTIVE', granted_fields: { supplier_name: 'Acme', contact_email: '[MASKED:string]' }, withheld_fields: ['payroll_sentinel'] });
    const replay = await fixture.context.authorize(task, request);
    expect(replay).toEqual(first);
    expect((await fixture.context.getState()).disclosures).toHaveLength(1);
    expect((await fixture.context.getState()).grants[0].use_count).toBe(1);

    await expect(fixture.context.authorize({ ...task, assigned_agent_id: 'agent_intruder' }, request)).resolves.toMatchObject({ authorized: false, reason_code: 'CONTEXT_GRANT_RECIPIENT_MISMATCH', granted_fields: {} });
    await expect(fixture.context.authorize(task, { ...request, purpose: 'unrelated analytics' })).resolves.toMatchObject({ authorized: false, reason_code: 'CONTEXT_GRANT_PURPOSE_MISMATCH', granted_fields: {} });
    expect(compactTaskAuthority(task)).toMatchObject({ requestor_human_id: 'human_operator', passport_id: 'passport_external', mandate_id: 'mandate_supplier_review', context_grant_id: grantId, authority_hash: expect.stringMatching(/^sha256:/) });
    await fixture.context.updateGrant({ actor: actor(), context_grant_id: grantId, action: 'revoke' });
    await expect(fixture.context.authorize(task, request)).resolves.toMatchObject({ authorized: false, reason_code: 'CONTEXT_GRANT_REVOKED', granted_fields: {} });
  });

  it('keeps hidden values out of process environment, output, public state, logs, and evidence export', async () => {
    const fixture = await setup();
    const { task } = await prepareContext(fixture);
    const sender = await importConnector(fixture, 'connector_sender', 'Sender Agent');
    await fixture.registry.import(sender.importRequest);
    await fixture.broker.initialize();
    const queued = await fixture.broker.enqueue(task, sender.manifest.connector_manifest_id, fixture.organization.publicKeyPem);
    const keyPath = join(fixture.root, 'runtime-private.pem');
    await writeFile(keyPath, sender.runtime.privateKeyPem, { encoding: 'utf8', mode: 0o600 });
    const transport = new LocalProcessTransport({ command: process.execPath, args: ['--experimental-strip-types', resolve('packages/sdk-typescript/src/sampleExternalAgent.ts')], connectorManifestId: sender.manifest.connector_manifest_id, connectorPrivateKeyPath: keyPath, cwd: resolve('.'), timeoutMs: 10_000, env: { H2A_REQUESTED_FIELDS: 'supplier_name,contact_email,payroll_sentinel' } });
    transports.push(transport);
    const completed = await fixture.broker.deliver(queued.delivery_id, transport);
    expect(completed.status).toBe('acknowledged');
    expect(completed.result_frame?.payload).toMatchObject({ output: { authorized_context: { supplier_name: 'Acme', contact_email: '[MASKED:string]' } } });
    expect(JSON.stringify(completed)).not.toContain(fixture.hidden);

    const workplace = new LocalWorkplaceRepository(fixture.root);
    await Promise.all([workplace.replaceAgents([]), workplace.replaceAssignments([]), workplace.replaceRecentEvents([])]);
    const audit = new EvidenceAuditService(fixture.root, fixture.ledger, workplace);
    await audit.initialize();
    const receipt = await audit.exportBundle({ search: '', eventTypes: [], actorTypes: [], decisions: [], reasonCodes: [], integrityOnly: false, limit: 250 });
    const exportText = await readFile(join(fixture.root, receipt.relativePath), 'utf8');
    expect(exportText).not.toContain(fixture.hidden);
    const publicState = JSON.stringify(await fixture.context.getState());
    expect(publicState).not.toContain(fixture.hidden);
    expect((await fixture.ledger.list()).every((event) => !JSON.stringify(event).includes(fixture.hidden))).toBe(true);
    expect(await containsLiteral(fixture.root, fixture.hidden)).toBe(false);
  }, 20_000);

  it('persists signed authority-bound agent messages and rejects forgery and sequence replay', async () => {
    const fixture = await setup();
    const { task, grantId } = await prepareContext(fixture);
    const sender = await importConnector(fixture, 'connector_sender', 'Sender Agent');
    const recipient = await importConnector(fixture, 'connector_recipient', 'Recipient Agent');
    await fixture.registry.import(sender.importRequest);
    await fixture.registry.import(recipient.importRequest);
    await fixture.broker.initialize();
    await fixture.broker.enqueue(task, sender.manifest.connector_manifest_id, fixture.organization.publicKeyPem);
    const unsigned = { message_id: 'message_phase19_001', organization_id: 'org_hp_demo', task_id: task.task_id, trace_id: task.trace_id, sender_connector_manifest_id: sender.manifest.connector_manifest_id, recipient_connector_manifest_id: recipient.manifest.connector_manifest_id, sender_passport_id: task.passport_id, recipient_passport_id: 'passport_recipient', mandate_id: task.mandate_id, context_grant_id: grantId, speech_act: 'handoff' as const, content_ref: 'artifact_result_summary', content_hash: digest('d'), sequence: 1, deduplication_id: 'dedupe_phase19_001', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() };
    const message = signMessage(unsigned, sender.runtime.privateKeyPem);
    await expect(fixture.broker.recordGovernedMessage(message)).resolves.toMatchObject({ status: 'delivered', content_ref: 'artifact_result_summary' });
    await expect(fixture.broker.recordGovernedMessage(message)).resolves.toMatchObject({ message_id: 'message_phase19_001' });
    expect(await fixture.broker.getGovernedMessages()).toHaveLength(1);
    await expect(fixture.broker.recordGovernedMessage({ ...message, deduplication_id: 'forged', content_ref: 'tampered' })).rejects.toThrow('signature');
    const replay = signMessage({ ...unsigned, message_id: 'message_phase19_002', deduplication_id: 'dedupe_phase19_002' }, sender.runtime.privateKeyPem);
    await expect(fixture.broker.recordGovernedMessage(replay)).rejects.toThrow('sequence');
  });

  it('expires grants against the trusted clock and denies later disclosure', async () => {
    let now = new Date('2026-08-21T12:00:00.000Z');
    const fixture = await setup(() => now);
    const { task, grantId } = await prepareContext(fixture, '2026-08-21T12:01:00.000Z');
    now = new Date('2026-08-21T12:01:01.000Z');
    await expect(fixture.context.authorize(task, { context_grant_id: grantId, requested_fields: ['supplier_name'], purpose: 'review supplier risk' })).resolves.toMatchObject({ authorized: false, reason_code: 'CONTEXT_GRANT_EXPIRED', granted_fields: {} });
    expect((await fixture.context.getState()).grants[0].status).toBe('expired');
    expect((await fixture.ledger.list()).some((event) => event.event_type === 'CONTEXT_GRANT_EXPIRED')).toBe(true);
  });
});

async function setup(clock: () => Date = () => new Date()) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase19-'));
  roots.push(root);
  const organization = keyPair();
  const ledger = new LocalAuthorityEventLedger(root);
  const protector = aesProtector();
  const authority = { authorizeProtectedOperation: async () => ({ humanId: 'human_operator', humanProofId: 'proof_operator' }), signOrganizationRecord: async (value: unknown) => ({ canonicalHash: hashCanonical(value), signature: `ed25519:${sign(null, Buffer.from(canonicalize(value)), organization.privateKeyPem).toString('base64')}` }) };
  const context = new ContextBrokerService(root, ledger, authority, { assertRecipient: async (input) => { if (input.agentId !== 'agent_external' || input.passportId !== 'passport_external') throw new Error('Invalid recipient.'); } }, protector, clock);
  await context.initialize();
  const registry = new ConnectorRegistry(root, ledger);
  const broker = new MessageBroker(root, registry, ledger, context);
  return { root, organization, ledger, context, registry, broker, hidden: 'PAYROLL-HIDDEN-927441' };
}

async function prepareContext(fixture: Awaited<ReturnType<typeof setup>>, expiresAt = new Date(Date.now() + 60_000).toISOString()) {
  let state = await fixture.context.createArtifact({ actor: actor(), organization_id: 'org_hp_demo', name: 'Supplier assessment source', source_resource: 'supplier-records', fields: [
    { field: 'supplier_name', classification: 'internal', value: 'Acme' },
    { field: 'contact_email', classification: 'confidential', value: 'security@example.test' },
    { field: 'payroll_sentinel', classification: 'restricted', value: fixture.hidden }
  ] });
  const artifactId = state.artifacts[0].artifact_id;
  state = await fixture.context.issueGrant({ actor: actor(), organization_id: 'org_hp_demo', task_id: 'task_supplier_review', mandate_id: 'mandate_supplier_review', recipient_agent_id: 'agent_external', recipient_passport_id: 'passport_external', purpose: 'review supplier risk', field_rules: [
    { artifact_id: artifactId, field: 'supplier_name', maximum_classification: 'internal', transformation: 'value' },
    { artifact_id: artifactId, field: 'contact_email', maximum_classification: 'confidential', transformation: 'mask' }
  ], token_budget: 100, maximum_uses: 10, expires_at: expiresAt });
  const grantId = state.grants[0].grant.context_grant_id;
  return { grantId, task: signTask(unsignedTask(grantId), fixture.organization.privateKeyPem) };
}

async function importConnector(fixture: Awaited<ReturnType<typeof setup>>, id: string, name: string) {
  const publisher = keyPair(); const runtime = keyPair();
  const unsigned: Omit<ConnectorManifest, 'canonical_hash' | 'publisher_signature'> = { schema_version: 2, connector_manifest_id: id, name, provider: id, adapter_version: '1.0.0', protocol: 'local-cli', auth_method: 'none', trust_ceiling: 'connected-observed', capabilities: ['task.receive', 'context.request', 'result.return'], executable: process.execPath, h2a_extension_required: true, status: 'available' };
  const manifest = { ...unsigned, canonical_hash: hashCanonical(unsigned), publisher_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), publisher.privateKeyPem).toString('base64')}` };
  return { manifest, runtime, importRequest: { manifest, publisher_public_key_pem: publisher.publicKeyPem, runtime_public_key_pem: runtime.publicKeyPem } };
}

function unsignedTask(grantId: string): Omit<TaskEnvelope, 'canonical_hash' | 'organization_signature'> { const now = new Date(); return { schema_version: 2, task_id: 'task_supplier_review', organization_id: 'org_hp_demo', trace_id: 'trace_phase19', requestor_human_id: 'human_operator', assigned_agent_id: 'agent_external', passport_id: 'passport_external', runtime_attestation_id: 'attestation_external', mandate_id: 'mandate_supplier_review', context_grant_id: grantId, objective: 'review supplier risk', dependency_task_ids: [], output_contract: { type: 'object' }, sequence: 1, idempotency_key: 'idem_phase19', issued_at: now.toISOString(), expires_at: new Date(now.getTime() + 60_000).toISOString() }; }
function signTask(unsigned: Omit<TaskEnvelope, 'canonical_hash' | 'organization_signature'>, key: string): TaskEnvelope { return { ...unsigned, canonical_hash: hashCanonical(unsigned), organization_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), key).toString('base64')}` }; }
function signMessage(unsigned: Omit<RecordGovernedMessageRequest, 'sender_signature'>, key: string): RecordGovernedMessageRequest { return { ...unsigned, sender_signature: `ed25519:${sign(null, Buffer.from(canonicalize(unsigned)), key).toString('base64')}` }; }
function actor() { return { membership_id: 'membership_operator', human_proof_id: 'proof_operator', authority_credential_id: 'credential_operator' }; }
function keyPair() { const pair = generateKeyPairSync('ed25519'); return { publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }; }
function digest(value: string): string { return `sha256:${value.repeat(64).slice(0, 64)}`; }
function aesProtector() { const key = randomBytes(32); return { seal: async (value: string) => { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64'); }, open: async (value: string) => { const bytes = Buffer.from(value, 'base64'); const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'); } }; }
async function containsLiteral(root: string, literal: string): Promise<boolean> { for (const entry of await readdir(root, { withFileTypes: true })) { const path = join(root, entry.name); if (entry.isDirectory()) { if (await containsLiteral(path, literal)) return true; } else if ((await readFile(path)).includes(Buffer.from(literal))) return true; } return false; }
