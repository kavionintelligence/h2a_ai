import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const h2a = join(root, 'h2a-mvp', 'h2a-mvp');
export const census = join(root, 'agent-discovery-platform');
export function pythonCommand() {
  const candidates = [process.env.DEMO_PYTHON,
    join(census, '.venv-runtime', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    join(census, '.venv-governance', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    join(census, '.venv-validation', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    join(census, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    'python3', 'python'];
  for (const candidate of candidates.filter(Boolean)) {
    const result = spawnSync(candidate, ['-c', 'import fastapi, sqlalchemy, uvicorn, agent_census'], { cwd: census, windowsHide: true, stdio: 'ignore' });
    if (result.status === 0) return candidate;
  }
  throw new Error('Python dependencies are unavailable. Run npm run setup (or set DEMO_PYTHON to the configured interpreter).');
}
export function pythonRuntime() {
  const python = pythonCommand();
  const probe = spawnSync(python, ['-c', 'import json,sys; print(json.dumps({"command":sys._base_executable,"paths":sys.path}))'], { cwd: census, windowsHide: true, encoding: 'utf8' });
  if (probe.status !== 0) throw new Error('Could not resolve Python runtime.');
  const info = JSON.parse(probe.stdout);
  return { command: info.command, env: { ...process.env, PYTHONPATH: [join(census, 'src'), ...info.paths.filter(Boolean)].join(process.platform === 'win32' ? ';' : ':') } };
}
export function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}`)));
  });
}
export async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const ended = new Promise(resolveStop => child.once('exit', resolveStop));
  // Services are direct child processes (pythonRuntime bypasses the venv launcher).
  child.kill('SIGTERM');
  let timer;
  await Promise.race([ended, new Promise(resolveStop => { timer = setTimeout(resolveStop, 5000); })]);
  clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) throw new Error(`Owned service ${child.pid} did not stop.`);
}
export async function waitFor(url, child, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`Service exited before ready: ${url}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return; } catch { /* startup */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 200));
  }
  throw new Error(`Service did not become ready: ${url}`);
}
export function requireDependencies() {
  if (!existsSync(join(h2a, 'node_modules', 'vite', 'package.json'))) throw new Error('Node dependencies unavailable. Run npm run setup.');
}
