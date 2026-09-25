import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultFeatureConfig, finalAcceptancePackageSchema, type FinalAcceptanceState } from '@h2a/contracts';
import { canonicalize, FinalAcceptanceService, hashCanonical, LocalAuthorityEventLedger, type FinalAcceptancePorts } from '@h2a/evidence';

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('Phase 43 final integration', () => {
  it('creates a unique clean Phase 44 root with required liveness and no success evidence', async () => {
    const { root, service } = await serviceFixture();
    const first = await service.preparePhase44Session();
    const second = await service.preparePhase44Session();
    expect(first.session_id).not.toBe(second.session_id);
    expect(first.data_path.startsWith(root)).toBe(true);
    const config = JSON.parse(await readFile(join(first.data_path, 'settings/feature-config.json'), 'utf8'));
    const session = JSON.parse(await readFile(join(first.data_path, 'SESSION.json'), 'utf8'));
    expect(config.data).toEqual({ ...defaultFeatureConfig, livenessMode: 'required' });
    expect(session).toMatchObject({ session_id: first.session_id, preview_data: false, prepopulated_success: false });
    await expect(Promise.all([
      readFile(join(first.data_path, 'workplace', 'fleet.json'), 'utf8'),
      readFile(join(first.data_path, 'workplace', 'assignments.json'), 'utf8'),
      readFile(join(first.data_path, 'evidence', 'recent-events.json'), 'utf8')
    ])).resolves.toSatisfy((records: string[]) => records.every((record) => JSON.parse(record).data.length === 0));
    await expect(readFile(join(first.data_path, 'evidence', 'authority-events.jsonl'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('independently verifies a signed eligible package and rejects tampering', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2a-phase43-verifier-')); roots.push(root);
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const state = eligibleState();
    const content = { schema_version: 3 as const, kind: 'h2a.final-acceptance.package' as const, export_id: 'phase44_export_test', created_at: '2026-08-31T10:00:00.000Z', privacy_profile: 'acceptance-minimized-v3' as const, source: { ledger_head_hash: `sha256:${'1'.repeat(64)}`, ledger_record_count: 100 }, state };
    const packageHash = hashCanonical(content);
    const signed = { ...content, package_hash: packageHash };
    const keyFingerprint = `sha256:${createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex')}`;
    const value = finalAcceptancePackageSchema.parse({ ...signed, signer: { algorithm: 'Ed25519', public_key_pem: publicKeyPem, key_fingerprint: keyFingerprint }, signature: `ed25519:${sign(null, Buffer.from(canonicalize(signed)), privateKey).toString('base64')}` });
    const path = join(root, 'acceptance.json');
    await writeFile(path, JSON.stringify(value), 'utf8');
    const verified = await exec(process.execPath, ['scripts/verify-final-acceptance-package.mjs', path], { cwd: process.cwd() });
    expect(verified.stdout).toContain('"status":"verified"');
    await writeFile(path, JSON.stringify({ ...value, state: { ...value.state, blockers: ['tampered'] } }), 'utf8');
    await expect(exec(process.execPath, ['scripts/verify-final-acceptance-package.mjs', path], { cwd: process.cwd() })).rejects.toMatchObject({ stderr: expect.stringContaining('PACKAGE_HASH_INVALID') });
  });

  it('generates the signed package through the production service only when eligible', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const signer = {
      getOrganizationPublicKey: async () => publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      signOrganizationRecord: async (value: unknown) => ({ canonicalHash: hashCanonical(value), signature: `ed25519:${sign(null, Buffer.from(canonicalize(value)), privateKey).toString('base64')}` })
    };
    const { root, ledger, service } = await serviceFixture(signer);
    await ledger.append({ trace_id: 'phase22_final_trace', actor: { type: 'system', id: 'phase43-test' }, subject: { type: 'outcome', id: 'source' }, event_type: 'WORKFLOW_COMPLETED', payload: { test_fixture: true } });
    vi.spyOn(service, 'getState').mockResolvedValue(eligibleState());
    const receipt = await service.exportPackage();
    expect(receipt).toMatchObject({ status: 'passed', passed_gates: 11, verifier_status: 'verified' });
    const path = join(root, receipt.relative_path);
    const verified = await exec(process.execPath, ['scripts/verify-final-acceptance-package.mjs', path], { cwd: process.cwd() });
    expect(verified.stdout).toContain(receipt.package_hash);
    const verification = await service.verifyExportedPackage({ relative_path: receipt.relative_path, operation_key: 'phase51-verification' });
    expect(verification).toMatchObject({ status: 'verified', tamper_test: 'rejected', tamper_reason: 'FINAL_ACCEPTANCE_PACKAGE_HASH_INVALID' });
    expect(await service.verifyExportedPackage({ relative_path: receipt.relative_path, operation_key: 'phase51-verification' })).toEqual(verification);
    expect((await ledger.list()).some((event) => event.event_type === 'FINAL_ACCEPTANCE_PACKAGE_EXPORTED')).toBe(true);
    expect((await ledger.list()).filter((event) => event.event_type === 'FINAL_ACCEPTANCE_PACKAGE_VERIFIED')).toHaveLength(1);
    expect((await ledger.list()).filter((event) => event.event_type === 'FINAL_ACCEPTANCE_PACKAGE_TAMPER_REJECTED')).toHaveLength(1);
  });
});

async function serviceFixture(signer?: FinalAcceptancePorts['signer']) {
  const root = await mkdtemp(join(tmpdir(), 'h2a-phase43-session-')); roots.push(root);
  const ledger = new LocalAuthorityEventLedger(root);
  const empty = {
    humans: { identities: [], enrollments: [], active_proofs: [], selected_human_id: null, last_result: null }, organization: { organizations: [], memberships: [], roles: [], credentials: [], assurance: [], decisions: [] },
    agents: { passports: [], passportsV2: [], bindings: [], providers: [], credentials: [], humanProofRequired: true, attestations: [], runtimeSessions: [] }, approvals: { policies: [], requests: [], request_contexts: [], decisions: [], mandate_extensions: [], resumes: [] },
    context: { artifacts: [], grants: [], disclosures: [], messages: [] }, connectors: { declarations: [], protocol: { connectors: [], deliveries: [], dead_letter_count: 0 }, collaboration_runs: [] }, live: { providers: [], runs: [], output: [] },
    enterprise: { schema_version: 2, generated_at: new Date().toISOString(), posture: {}, nodes: [], edges: [], traces: [], seams: [], claims: [] }
  };
  const ports = Object.fromEntries(Object.entries(empty).map(([key, value]) => [key, { getState: async () => value }])) as unknown as FinalAcceptancePorts;
  ports.signer = signer;
  return { root, ledger, service: new FinalAcceptanceService(root, ledger, ports, () => new Date('2026-08-31T10:00:00.000Z')) };
}

function eligibleState(): FinalAcceptanceState {
  const ids = ['two-human-ceremony', 'organization-authority', 'workload-identity', 'shared-provider-task', 'external-framework', 'context-minimization', 'authority-escalation', 'runtime-containment', 'adversarial-controls', 'restart-recovery', 'evidence-reconstruction'] as const;
  return {
    schema_version: 2, generated_at: '2026-08-31T10:00:00.000Z', manifest: { schema_version: 2, manifest_id: 'phase44-manifest', session_id: 'phase44-2026-08-31T10-00-00-000Z-00000000-0000-4000-8000-000000000000', trace_prefix: 'phase22_', required_providers: ['claude-code', 'openai-codex', 'gemini-antigravity'], accepted_frameworks: ['mcp'], minimum_humans: 2, biometric_record_range: [20, 70], trust_ceiling: 'connected-observed', created_at: '2026-08-31T10:00:00.000Z' },
    status: 'passed', shared_trace_id: 'phase22_final_trace', completion: { passed: 11, total: 11 }, gates: ids.map((gate_id) => ({ gate_id, title: gate_id, status: 'passed', summary: 'Persisted acceptance evidence passed.', evidence_refs: [`evt_${gate_id}`] })), attacks: ['replay', 'forged-approval', 'over-broad-delegation', 'context-leakage', 'tamper', 'provider-failure'].map((attack_id) => ({ attack_id, status: 'blocked', reason_codes: ['CONTROL_BLOCKED'], evidence_refs: [`evt_${attack_id}`] })) as FinalAcceptanceState['attacks'], evidence_integrity: 'verified', phase44_readiness: { clean_session: true, required_liveness_mode: true, liveness_verified_human_ids: ['human_one', 'human_two'], approval_withdrawal_evidence_ref: 'evt_withdrawal', project_integration_evidence_ref: 'evt_integration', package_eligible: true }, blockers: []
  };
}
