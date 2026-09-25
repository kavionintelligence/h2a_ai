import { readFile, rename, mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { root } from './demo-runtime.mjs';
// Only the dedicated default demo directory may be reset. Archive, never delete.
const target = resolve(root, 'integration-data');
if (!target.startsWith(root + sep) || target !== join(root, 'integration-data')) throw new Error('Unsafe reset target.');
const lock = JSON.parse(await readFile(join(target, 'running.json'), 'utf8').catch(() => 'null'));
if (lock) {
  let running = false;
  try { process.kill(lock.pid, 0); running = true; } catch { /* stale */ }
  if (running) throw new Error('Stop the demo with Ctrl+C before resetting.');
}
const archiveRoot = join(root, 'demo-archives');
await mkdir(archiveRoot, { recursive: true });
const destination = join(archiveRoot, new Date().toISOString().replace(/[:.]/g, '-'));
try { await rename(target, destination); console.log(`Previous demo preserved in ${destination}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log('Reset complete. Run npm run dev; Discovery starts empty and scans configured Census sources only.');
