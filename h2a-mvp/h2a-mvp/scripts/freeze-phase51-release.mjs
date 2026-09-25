import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { Buffer } from 'node:buffer';

const root = process.cwd();
const output = join(root, 'docs/plan5/evidence/phase51/release-candidate.json');
const inputs = ['apps', 'packages', 'scripts', 'tests', 'docs/plan3/CONTROL_REGISTRY.json', 'docs/plan4', 'docs/plan5', 'package.json', 'pnpm-lock.yaml', 'electron.vite.config.ts', 'vite.web.config.ts', 'tsconfig.node.json', 'tsconfig.web.json'];
const excluded = new Set(['docs/plan5/evidence/phase51/release-candidate.json']);

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry ?? null)).join(',')}]`;
  return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}
const hash = (value) => `sha256:${createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalize(value)).digest('hex')}`;
async function files(path) {
  const stat = await import('node:fs/promises').then(({ stat: inspect }) => inspect(path));
  if (stat.isFile()) return [path];
  return (await Promise.all((await readdir(path, { withFileTypes: true })).map((entry) => files(join(path, entry.name))))).flat();
}
async function inventory() {
  const values = (await Promise.all(inputs.map((input) => files(resolve(root, input))))).flat();
  const unique = [...new Set(values.map((path) => relative(root, path).replaceAll('\\', '/')))]
    .filter((path) => !excluded.has(path) && !path.includes('/node_modules/') && !path.includes('/out/') && !/\/evidence\/.*\.(png|jpg|jpeg)$/iu.test(path)).sort();
  return Promise.all(unique.map(async (path) => ({ path, sha256: hash(await readFile(join(root, path))) })));
}
async function verifyManifest(value) {
  if (value.payload_hash !== hash(value.payload)) throw new Error('RELEASE_PAYLOAD_HASH_INVALID');
  const entries = await inventory();
  if (value.payload.files_hash !== hash(entries) || canonicalize(value.payload.files) !== canonicalize(entries)) throw new Error('RELEASE_FILE_INVENTORY_CHANGED');
  if (!verify(null, Buffer.from(canonicalize({ payload: value.payload, payload_hash: value.payload_hash })), value.signer.public_key_pem, Buffer.from(value.signature.slice(8), 'base64'))) throw new Error('RELEASE_SIGNATURE_INVALID');
  return { status: 'verified', files: entries.length, files_hash: value.payload.files_hash, payload_hash: value.payload_hash };
}
async function write() {
  const entries = await inventory();
  const artifact = async (path) => hash(await readFile(join(root, path)));
  const payload = {
    schema_version: 1, kind: 'h2a.phase51.release-candidate', created_at: new Date().toISOString(),
    trust_claim: 'local-non-commercial-connected-observed', files: entries, files_hash: hash(entries),
    frozen_artifacts: {
      control_registry: await artifact('docs/plan3/CONTROL_REGISTRY.json'),
      click_budget: await artifact('docs/plan5/evidence/phase51/click-budget.json'),
      operator_runbook: await artifact('docs/plan5/PHASE_51_OPERATOR_ACCEPTANCE.md'),
      hp_demonstration_runbook: await artifact('docs/plan5/HP_CTO_CISO_BUTTON_BY_BUTTON_DEMONSTRATION_RUNBOOK.md'),
      acceptance_checklist: await artifact('docs/plan4/PHASE_44_ACCEPTANCE_CHECKLIST.md'),
      package_verifier: await artifact('scripts/verify-final-acceptance-package.mjs')
    },
    operator_open: [
      'two physical employees must pass required-liveness verification',
      'camera denial, retry, mismatch, focus, and supported-camera checks',
      'provider login and consent for every live provider lane',
      'mutual friend-node confirmation on two independent roots',
      'independent approval and durable approval withdrawal',
      'clean 11/11 ceremony, six attacks, containment, restart, package export, independent verification, and tamper negative'
    ]
  };
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const payloadHash = hash(payload);
  const signed = { payload, payload_hash: payloadHash, signer: { algorithm: 'Ed25519', public_key_pem: publicKeyPem }, signature: `ed25519:${sign(null, Buffer.from(canonicalize({ payload, payload_hash: payloadHash })), privateKey).toString('base64')}` };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(signed, null, 2)}\n`, 'utf8');
  return verifyManifest(signed);
}
const result = process.argv.includes('--write') ? await write() : verifyManifest(JSON.parse(await readFile(output, 'utf8')));
process.stdout.write(`${JSON.stringify(await result)}\n`);
