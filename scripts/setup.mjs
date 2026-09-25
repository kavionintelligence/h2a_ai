import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { h2a, census, run, pythonCommand } from './runtime.mjs';
await import('./repair-archive-links.mjs');
let nodeReady = false;
try { nodeReady = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('vite'); await import('vitest/node'); await import('react'); await import('zod');"], { cwd: h2a, windowsHide: true, stdio: 'ignore' }).status === 0; } catch { /* install below */ }
if (!nodeReady) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this script with npm run setup.');
  await run(process.execPath, [npmCli, 'install', '--ignore-scripts', '--legacy-peer-deps'], { cwd: h2a });
}
try { console.log(`Python ready: ${pythonCommand()}`); }
catch {
  let systemPython;
  for (const command of [process.env.BYOSYNC_PYTHON, 'python3', 'python'].filter(Boolean)) {
    if (spawnSync(command, ['-c', 'import sys; assert sys.version_info >= (3,11)'], { windowsHide: true, stdio: 'ignore' }).status === 0) { systemPython = command; break; }
  }
  if (!systemPython) throw new Error('Install Python 3.11+ and rerun npm run setup, or set BYOSYNC_PYTHON.');
  await run(systemPython, ['-m', 'venv', '.venv-runtime'], { cwd: census });
  const python = join(census, '.venv-runtime', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  await run(python, ['-m', 'pip', 'install', '--require-hashes', '-r', 'requirements.lock'], { cwd: census });
  await run(python, ['-m', 'pip', 'install', '--no-deps', '-e', '.'], { cwd: census });
  await run(python, ['-m', 'pip', 'install', 'PyYAML==6.0.2'], { cwd: census });
  console.log('Python dependencies installed.');
}
console.log('Setup complete. Run npm run dev.');
