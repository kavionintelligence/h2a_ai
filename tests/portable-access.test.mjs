import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { buildByoSync } from '../scripts/build-byosync.mjs';
import { root, h2a, waitFor, stopChild } from '../scripts/runtime.mjs';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

for (const publicOrigin of ['', 'https://byosync.test']) test(`portable access requires a valid token and protects its session (${publicOrigin || 'local HTTP'})`, { timeout: 60000 }, async t => {
  await buildByoSync({ frontend: false });
  const port = await freePort();
  const token = `portable-${randomUUID()}`;
  const data = join(root, '.test-artifacts', `portable-${randomUUID()}`);
  await mkdir(data, { recursive: true });
  const env = { ...process.env, PORT: String(port), BYOSYNC_HOST: '127.0.0.1', BYOSYNC_ALLOWED_HOSTS: '127.0.0.1,localhost', BYOSYNC_ACCESS_TOKEN: token, BYOSYNC_PUBLIC_ORIGIN: publicOrigin, BYOSYNC_DATA_DIR: data, CENSUS_API_URL: '', CENSUS_API_TOKEN: '' };
  let logs = '';
  const child = spawn(process.execPath, [join(h2a, '.governance-dist/server.mjs')], { cwd: h2a, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', value => logs += value); child.stderr.on('data', value => logs += value);
  t.after(() => stopChild(child));
  const base = `http://127.0.0.1:${port}`;
  try { await waitFor(`${base}/api/health`, child); } catch (error) { throw new Error(`${error.message}\n${logs}`); }
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  assert.equal((await fetch(`${base}/login?token=wrong`, { redirect: 'manual' })).status, 401);
  const login = await fetch(`${base}/login?token=${encodeURIComponent(token)}`, { redirect: 'manual' });
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('x-frame-options'),'DENY');
  assert.match(login.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(login.headers.get('referrer-policy'),'no-referrer');
  assert.equal(login.headers.get('set-cookie').includes('; Secure'),Boolean(publicOrigin));
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(sessionCookie?.startsWith('byosync_session='));
  const state = await fetch(`${base}/api/state`, { headers: { Cookie: sessionCookie } });
  assert.equal(state.status, 200);
  assert.equal(state.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await state.json()).integrity.status, 'verified');
});
