// Reproducible web dependencies only. Deliberately does not run setup.mjs,
// install Python, initialize local data, or run native package lifecycle scripts.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencyRoot = join(projectRoot, 'h2a-mvp', 'h2a-mvp');
const manifest = JSON.parse(await readFile(join(dependencyRoot, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(dependencyRoot, 'package-lock.json'), 'utf8'));
const lockedManifest = lock.packages?.[''];
if (lock.lockfileVersion !== 3 || !lockedManifest) throw new Error('The hosted build requires the committed npm v3 lockfile.');
for (const group of ['dependencies', 'devDependencies']) {
  const current = manifest[group] || {};
  const locked = lockedManifest[group] || {};
  if (Object.keys(current).length !== Object.keys(locked).length || Object.entries(current).some(([name, version]) => locked[name] !== version)) {
    throw new Error(`Nested package.json ${group} differ from package-lock.json. Update and review the lockfile before hosting.`);
  }
}
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this command as npm run install:hosted so the npm CLI path is explicit.');
console.log('Installing locked web-build dependencies; native lifecycle scripts and browser downloads are disabled.');
const child = spawn(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--legacy-peer-deps', '--include=dev', '--no-audit', '--no-fund'], {
  cwd: dependencyRoot,
  env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
  windowsHide: true,
  stdio: 'inherit',
});
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
