import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildDemo } from './build-demo.mjs';
import { root, h2a, census, pythonRuntime, waitFor, stopChild } from './demo-runtime.mjs';

// Real-only startup remains the default; the presenter explicitly opts into local demo agents.
const demoAgents = process.argv.includes('--demo-agents');
if (process.argv.slice(2).some(argument => argument !== '--demo-agents')) throw new Error('Supported option: --demo-agents');
// Never silently load an old validation database or the previous synthetic demo-data.
const dataDir = resolve(process.env.DEMO_DATA_DIR || join(root, 'integration-data'));
const apiPort = Number(process.env.PORT || 8787);
const bridgePort = Number(process.env.CENSUS_BRIDGE_PORT || 8011);
const fleetPort = Number(process.env.DEMO_AGENT_PORT || 8020);
const ports = demoAgents ? [apiPort, bridgePort, fleetPort] : [apiPort, bridgePort];
if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535) || new Set(ports).size !== ports.length) throw new Error('Service ports must be distinct integers between 1 and 65535.');
const lockPath = join(dataDir, 'running.json');
await mkdir(dataDir, { recursive: true });
const oldLock = JSON.parse(await readFile(lockPath, 'utf8').catch(() => 'null'));
if (oldLock) {
  let running = false;
  try { process.kill(oldLock.pid, 0); running = true; } catch { /* stale lock */ }
  if (running) throw new Error(`Demo already running (PID ${oldLock.pid}). Stop it before starting another instance or resetting.`);
}
await writeFile(lockPath, JSON.stringify({ pid: process.pid, apiPort, bridgePort, demoAgents, ...(demoAgents ? { fleetPort } : {}) }));
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
  await buildDemo();
  const token = randomBytes(32).toString('hex');
  const env = { ...python.env, GOVERNANCE_BRIDGE_TOKEN: token, CENSUS_API_URL: `http://127.0.0.1:${bridgePort}`, CENSUS_API_TOKEN: token, GOVERNANCE_DATA_DIR: join(dataDir, 'h2a'), DEMO_DATA_DIR: join(dataDir, 'h2a'), PORT: String(apiPort) };
  const launch = (command, args, cwd) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: 'inherit' });
    children.push(child);
    child.once('error', error => { console.error(error.message); void stop(1); });
    child.once('exit', code => { if (!stopping) { console.error(`Demo service exited (${code}); stopping its peer.`); void stop(code || 1); } });
    return child;
  };
  const fleetOrigin = `http://127.0.0.1:${fleetPort}`;
  const bridge = launch(python.command, ['scripts/governance_bridge.py', '--port', String(bridgePort), '--data-dir', join(dataDir, 'census'), ...(demoAgents ? ['--demo-fleet-url', fleetOrigin] : [])], census);
  await waitFor(`http://127.0.0.1:${bridgePort}/health`, bridge);
  if (demoAgents) {
    const fleet = launch(python.command, ['scripts/demo_agent_fleet.py', '--port', String(fleetPort), '--census-url', `http://127.0.0.1:${bridgePort}`], census);
    await waitFor(`${fleetOrigin}/health`, fleet);
  }
  const api = launch(process.execPath, [join(h2a, '.governance-dist/server.mjs')], h2a);
  await waitFor(`http://127.0.0.1:${apiPort}/api/state`, api);
  console.log(`\nH2A governance ready: http://127.0.0.1:${apiPort}\nAgent Census API: http://127.0.0.1:${bridgePort}\n${demoAgents ? `Four local demo agents: ${fleetOrigin}/agents (simulated runtime; no cloud calls)\n` : ''}Persistent data: ${dataDir}\nDiscovery starts empty. Click SCAN, inspect an agent, then Register in H2A.\nPress Ctrl+C (or q then Enter) to stop all owned services.\n`);
} catch (error) {
  console.error(error.message);
  await stop(1);
}
