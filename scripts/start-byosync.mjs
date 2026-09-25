import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { hostname, networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { buildByoSync } from './build-byosync.mjs';
import { root, h2a, census, pythonRuntime, waitFor, stopChild } from './runtime.mjs';

if (process.argv.slice(2).length) throw new Error('ByoSync start does not accept synthetic-data options. Configure real Census sources instead.');
const dataDir = resolve(process.env.BYOSYNC_DATA_DIR || join(root, 'integration-data'));
const apiPort = Number(process.env.PORT || 8787);
const bridgePort = Number(process.env.CENSUS_BRIDGE_PORT || 8011);
const bindHost = process.env.BYOSYNC_HOST?.trim() || '127.0.0.1';
const lanAddresses = Object.values(networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address);
const namedUsers = Boolean(process.env.BYOSYNC_USERS_FILE?.trim());
const accessToken = namedUsers ? '' : process.env.BYOSYNC_ACCESS_TOKEN?.trim() || (bindHost === '127.0.0.1' || bindHost === 'localhost' ? '' : randomBytes(32).toString('base64url'));
const allowedHosts = new Set(['127.0.0.1', 'localhost', hostname().toLowerCase(), ...lanAddresses, ...(process.env.BYOSYNC_ALLOWED_HOSTS ?? '').split(',').map(value => value.trim()).filter(Boolean)]);
const ports = [apiPort, bridgePort];
if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535) || new Set(ports).size !== ports.length) throw new Error('Service ports must be distinct integers between 1 and 65535.');
const lockPath = join(dataDir, 'running.json');
await mkdir(dataDir, { recursive: true });
const oldLock = JSON.parse(await readFile(lockPath, 'utf8').catch(() => 'null'));
if (oldLock) {
  let running = false;
  try { process.kill(oldLock.pid, 0); running = true; } catch { /* stale lock */ }
  if (running) throw new Error(`Demo already running (PID ${oldLock.pid}). Stop it before starting another instance or resetting.`);
}
await writeFile(lockPath, JSON.stringify({ pid: process.pid, apiPort, bridgePort, product: 'ByoSync' }));
const children = [];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.stdin.pause();
  await Promise.all(children.map(stopChild));
  await unlink(lockPath).catch(() => {});
  process.exitCode = code;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
// Also supports graceful shutdown when launched through a pipe (e.g. a test runner).
process.stdin.on('data', input => { if (input.toString().trim().toLowerCase() === 'q') void stop(); });
try {
  const python = pythonRuntime();
  await buildByoSync();
  const bridgeToken = randomBytes(32).toString('hex');
  const env = { ...python.env, BYOSYNC_ROOT: root, BYOSYNC_COLLECTOR_PYTHON: python.command, GOVERNANCE_BRIDGE_TOKEN: bridgeToken, CENSUS_API_URL: `http://127.0.0.1:${bridgePort}`, CENSUS_API_TOKEN: bridgeToken, BYOSYNC_DATA_DIR: join(dataDir, 'byosync'), PORT: String(apiPort), BYOSYNC_HOST: bindHost, BYOSYNC_ALLOWED_HOSTS: [...allowedHosts].join(','), BYOSYNC_ACCESS_TOKEN: accessToken };
  const launch = (command, args, cwd) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: 'inherit' });
    children.push(child);
    child.once('error', error => { console.error(error.message); void stop(1); });
    child.once('exit', code => { if (!stopping) { console.error(`ByoSync service exited (${code}); stopping its peer.`); void stop(code || 1); } });
    return child;
  };
  const bridge = launch(python.command, ['scripts/governance_bridge.py', '--port', String(bridgePort), '--data-dir', join(dataDir, 'census')], census);
  await waitFor(`http://127.0.0.1:${bridgePort}/health`, bridge);
  const api = launch(process.execPath, [join(h2a, '.governance-dist/server.mjs')], h2a);
  const healthHost = bindHost === '0.0.0.0' ? '127.0.0.1' : bindHost;
  await waitFor(`http://${healthHost}:${apiPort}/api/health`, api);
  const addresses = bindHost === '0.0.0.0' ? lanAddresses : [bindHost];
  const urls = addresses.map(address => `http://${address}:${apiPort}${namedUsers ? '/login' : accessToken ? `/login?token=${encodeURIComponent(accessToken)}` : ''}`);
  console.log(`\nByoSync ready:\n${urls.map(url => `  ${url}`).join('\n')}\nAgent Census API: http://127.0.0.1:${bridgePort}\nPersistent data: ${dataDir}\nDiscovery scans this server's known AI-tool presence and configured Census sources; it does not scan remote browsers.\n${namedUsers ? 'Named-user sign-in enabled. Use TLS for access over a shared network.\n' : accessToken ? 'Shared-token access enabled with 12-hour browser sessions. Do not share the login URL beyond intended users.\n' : 'Local-operator mode: approvals are not independent named-human review.\n'}Press Ctrl+C (or q then Enter) to stop all owned services.\n`);
} catch (error) {
  console.error(error.message);
  await stop(1);
}
