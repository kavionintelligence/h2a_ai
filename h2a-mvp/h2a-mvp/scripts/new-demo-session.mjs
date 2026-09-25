import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requestedRoot = readArgument('--root');
const sessionId = readArgument('--session') ?? timestampId();
const sessionsRoot = join(projectRoot, 'data', 'demo-sessions');
const targetRoot = requestedRoot
  ? resolve(isAbsolute(requestedRoot) ? requestedRoot : join(projectRoot, requestedRoot))
  : join(sessionsRoot, `executive-${sessionId}`);

await mkdir(dirname(targetRoot), { recursive: true });
await mkdir(targetRoot, { recursive: false });
const updatedAt = new Date().toISOString();

await Promise.all([
  writeEnvelope('workplace/fleet.json', 'h2a.workplace.fleet', []),
  writeEnvelope('workplace/assignments.json', 'h2a.workplace.assignments', []),
  writeEnvelope('evidence/recent-events.json', 'h2a.evidence.recent-events', []),
  writeEnvelope('settings/feature-config.json', 'h2a.settings.feature-config', {
    storageMode: 'local-file',
    agentMode: 'scripted-workplace',
    humanProofMode: 'local-face-bch',
    resourceMode: 'sandbox'
  }),
  writeFile(join(targetRoot, 'SESSION.json'), `${JSON.stringify({
    sessionId,
    createdAt: updatedAt,
    purpose: 'H2A HP CTO/CISO executive demonstration',
    evidencePolicy: 'isolated-session-no-overwrite',
    dataPath: targetRoot
  }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
]);

const escaped = targetRoot.replaceAll("'", "''");
process.stdout.write(`${JSON.stringify({
  sessionId,
  dataPath: targetRoot,
  relativeDataPath: relative(projectRoot, targetRoot),
  nextCommand: `$env:H2A_DATA_PATH='${escaped}'; pnpm dev`
}, null, 2)}\n`);

async function writeEnvelope(relativePath, kind, data) {
  const target = join(targetRoot, relativePath);
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, `${JSON.stringify({ schemaVersion: 1, kind, updatedAt, data }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function timestampId() {
  return new Date().toISOString().replaceAll(/[-:.TZ]/gu, '').slice(0, 14);
}
