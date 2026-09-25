import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item ?? null)).join(',')}]`;
  return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

const hash = (value) => `sha256:${createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')}`;

export function verifyFinalAcceptancePackage(value) {
  if (value?.schema_version !== 3 || value?.kind !== 'h2a.final-acceptance.package') throw new Error('PACKAGE_SCHEMA_INVALID');
  const { package_hash, signer, signature, ...content } = value;
  if (hash(content) !== package_hash) throw new Error('PACKAGE_HASH_INVALID');
  const fingerprint = `sha256:${createHash('sha256').update(createPublicKey(signer.public_key_pem).export({ type: 'spki', format: 'der' })).digest('hex')}`;
  if (fingerprint !== signer.key_fingerprint) throw new Error('PACKAGE_SIGNER_FINGERPRINT_INVALID');
  if (!signature?.startsWith('ed25519:') || !verify(null, Buffer.from(canonicalize({ ...content, package_hash })), signer.public_key_pem, Buffer.from(signature.slice(8), 'base64'))) throw new Error('PACKAGE_SIGNATURE_INVALID');
  const state = content.state;
  if (state?.status !== 'passed' || state?.completion?.passed !== 11 || state?.completion?.total !== 11 || state?.gates?.some((gate) => gate.status !== 'passed')) throw new Error('PACKAGE_ACCEPTANCE_INCOMPLETE');
  if (state?.attacks?.length !== 6 || state.attacks.some((attack) => attack.status !== 'blocked')) throw new Error('PACKAGE_ADVERSARIAL_MATRIX_INCOMPLETE');
  if (state?.evidence_integrity !== 'verified' || !state?.phase44_readiness?.package_eligible || !state.phase44_readiness.clean_session || !state.phase44_readiness.required_liveness_mode || state.phase44_readiness.liveness_verified_human_ids.length < 2 || !state.phase44_readiness.approval_withdrawal_evidence_ref || !state.phase44_readiness.project_integration_evidence_ref) throw new Error('PACKAGE_PHASE44_READINESS_INCOMPLETE');
  if (!content.source?.ledger_head_hash || content.source.ledger_record_count < 1) throw new Error('PACKAGE_LEDGER_SOURCE_INVALID');
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ['recovery_secret', 'sealed_payload', 'biometric_token', 'private_key']) if (serialized.includes(`"${forbidden}"`)) throw new Error(`PACKAGE_PRIVACY_VIOLATION:${forbidden}`);
  return { status: 'verified', package_hash, signer_fingerprint: fingerprint, gates: 11, attacks: 6 };
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node scripts/verify-final-acceptance-package.mjs <package.json>');
  const result = verifyFinalAcceptancePackage(JSON.parse(await readFile(resolve(input), 'utf8')));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
