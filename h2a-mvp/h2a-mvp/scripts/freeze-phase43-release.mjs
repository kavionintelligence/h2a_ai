import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { Buffer } from 'node:buffer';

const root = process.cwd();
const output = join(root, 'docs/plan4/evidence/phase43/release-candidate.json');
const inputs = ['apps', 'packages', 'scripts', 'tests', 'docs/plan3/CONTROL_REGISTRY.json', 'docs/plan4', 'package.json', 'pnpm-lock.yaml', 'electron.vite.config.ts', 'vite.web.config.ts', 'tsconfig.node.json', 'tsconfig.web.json'];
const excluded = new Set(['docs/plan4/evidence/phase43/release-candidate.json']);

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry ?? null)).join(',')}]`;
  return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

const hash = (value) => `sha256:${createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalize(value)).digest('hex')}`;

async function files(path) {
  const stat = await import('node:fs/promises').then(({ stat: inspect }) => inspect(path));
  if (stat.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => files(join(path, entry.name))))).flat();
}

async function inventory() {
  const values = (await Promise.all(inputs.map((input) => files(resolve(root, input))))).flat();
  const unique = [...new Set(values.map((path) => relative(root, path).replaceAll('\\', '/')))].filter((path) => !excluded.has(path) && !path.startsWith('docs/plan4/evidence/') && !path.includes('/node_modules/') && !path.includes('/out/')).sort();
  return Promise.all(unique.map(async (path) => ({ path, sha256: hash(await readFile(join(root, path))) })));
}

async function write() {
  const entries = await inventory();
  const payload = { schema_version: 1, kind: 'h2a.phase43.release-candidate', created_at: new Date().toISOString(), trust_claim: 'release-integrity-snapshot-only', files: entries, files_hash: hash(entries), frozen_artifacts: { control_registry: hash(await readFile(join(root, 'docs/plan3/CONTROL_REGISTRY.json'))), asset_manifest: hash(await readFile(join(root, 'docs/plan4/assets/phase36-asset-manifest.json'))), runbook: hash(await readFile(join(root, 'docs/plan4/GUIDED_OPERATOR_RUNBOOK.md'))), acceptance_checklist: hash(await readFile(join(root, 'docs/plan4/PHASE_44_ACCEPTANCE_CHECKLIST.md'))) }, operator_open: ['Plan 5 Phase 46-50 guided operator checks carried to Phase 51', 'Phase 47 physical camera denial, mismatch, focus, and supported-camera checks', 'two required-liveness human verifications', 'durable approval withdrawal', 'clean 11/11 final ceremony and package export'] };
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const signed = { payload, payload_hash: hash(payload), signer: { algorithm: 'Ed25519', public_key_pem: publicKeyPem }, signature: `ed25519:${sign(null, Buffer.from(canonicalize({ payload, payload_hash: hash(payload) })), privateKey).toString('base64')}` };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(signed, null, 2)}\n`, 'utf8');
  return verifyManifest(signed);
}

async function verifyManifest(value) {
  if (value.payload_hash !== hash(value.payload)) throw new Error('RELEASE_PAYLOAD_HASH_INVALID');
  const entries = await inventory();
  if (value.payload.files_hash !== hash(entries) || canonicalize(value.payload.files) !== canonicalize(entries)) throw new Error('RELEASE_FILE_INVENTORY_CHANGED');
  if (!verify(null, Buffer.from(canonicalize({ payload: value.payload, payload_hash: value.payload_hash })), value.signer.public_key_pem, Buffer.from(value.signature.slice(8), 'base64'))) throw new Error('RELEASE_SIGNATURE_INVALID');
  return { status: 'verified', files: entries.length, files_hash: value.payload.files_hash, payload_hash: value.payload_hash };
}

const result = process.argv.includes('--write') ? await write() : verifyManifest(JSON.parse(await readFile(output, 'utf8')));
process.stdout.write(`${JSON.stringify(await result)}\n`);
