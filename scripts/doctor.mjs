import { existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, h2a, census, pythonRuntime } from './runtime.mjs';

const checks = [];
const add = (id, status, detail) => checks.push({ id, status, detail });
const [major, minor] = process.versions.node.split('.').map(Number);
add('node', major > 22 || (major === 22 && minor >= 12) ? 'pass' : 'fail', `Node ${process.versions.node}; required >=22.12`);
add('node-dependencies', existsSync(join(h2a, 'node_modules', 'vite', 'package.json')) ? 'pass' : 'fail', existsSync(join(h2a, 'node_modules', 'vite', 'package.json')) ? 'Installed' : 'Run npm run setup');
add('census-source', existsSync(join(census, 'src', 'agent_census')) ? 'pass' : 'fail', census);
try { const python = pythonRuntime(); add('python-census-runtime', 'pass', python.command); }
catch (error) { add('python-census-runtime', 'fail', error.message); }

const bindHost = process.env.BYOSYNC_HOST?.trim() || '127.0.0.1';
const token = process.env.BYOSYNC_ACCESS_TOKEN?.trim() || '';
const namedUsers = process.env.BYOSYNC_USERS_FILE?.trim();
add('network-auth', (bindHost === '127.0.0.1' || bindHost === 'localhost' || token || (namedUsers && existsSync(namedUsers))) ? 'pass' : 'fail', namedUsers ? 'Named-user file configured; validity is checked at startup. Use TLS for shared networks.' : token ? `Token configured for ${bindHost}` : bindHost === '127.0.0.1' || bindHost === 'localhost' ? 'Loopback-only' : 'Configure BYOSYNC_USERS_FILE or BYOSYNC_ACCESS_TOKEN for non-loopback');

const dataDirectory = resolve(process.env.BYOSYNC_DATA_DIR || join(root, 'integration-data'));
try {
  await mkdir(dataDirectory, { recursive: true });
  const probe = join(dataDirectory, `.doctor-${randomUUID()}.tmp`);
  await writeFile(probe, 'byosync');
  await unlink(probe);
  add('data-directory', 'pass', dataDirectory);
} catch (error) { add('data-directory', 'fail', error.message); }

const result = { status: checks.some(check => check.status === 'fail') ? 'fail' : 'pass', checks };
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`ByoSync preflight: ${result.status.toUpperCase()}`);
  for (const check of checks) console.log(`${check.status === 'pass' ? '[OK]' : '[FAIL]'} ${check.id}: ${check.detail}`);
}
if (result.status === 'fail') process.exitCode = 1;
