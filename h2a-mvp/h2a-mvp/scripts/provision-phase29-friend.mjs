import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = resolvePath(readArgument('--source') ?? process.env.H2A_DATA_PATH);
const target = resolvePath(readArgument('--target') ?? join('data', 'demo-sessions', `phase29-friend-${timestampId()}`));
if (!source) throw new Error('Provide --source or set H2A_DATA_PATH to the completed Node A ceremony root.');
if (await exists(target)) throw new Error(`Target already exists and was not modified: ${target}`);
if (!(await exists(join(source, 'SESSION.json')))) throw new Error(`Source is not an H2A demo session: ${source}`);

await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true, errorOnExist: true, force: false });
await Promise.all([
  rm(join(target, 'federation'), { recursive: true, force: true }),
  rm(join(target, '.electron-user-data'), { recursive: true, force: true })
]);
const sourceSession = JSON.parse(await readFile(join(source, 'SESSION.json'), 'utf8'));
await writeFile(join(target, 'SESSION.json'), `${JSON.stringify({
  ...sourceSession,
  sessionId: `phase29-friend-${timestampId()}`,
  purpose: 'H2A Phase 29 same-organization friend-node federation demonstration',
  parentSessionId: sourceSession.sessionId,
  provisionedAt: new Date().toISOString(),
  dataPath: target,
  federationIdentityPolicy: 'fresh-node-key-required'
}, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

process.stdout.write(`${JSON.stringify({
  nodeA: source,
  nodeB: target,
  relativeNodeB: relative(projectRoot, target),
  nextCommand: `pnpm demo:phase29:start -- --node-a "${source}" --node-b "${target}"`,
  requirement: 'Configure Node B in the UI to generate its independent federation identity and key.'
}, null, 2)}\n`);

function readArgument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function resolvePath(value) { if (!value) return undefined; return resolve(isAbsolute(value) ? value : join(projectRoot, value)); }
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
function timestampId() { return new Date().toISOString().replaceAll(/[-:.TZ]/gu, '').slice(0, 14); }
