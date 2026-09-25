import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { h2a, root, pythonRuntime, run } from './demo-runtime.mjs';

const artifactDir = join(root, '.test-artifacts');
const selectedTests = process.argv.slice(2);
const reportName = selectedTests.length ? 'h2a-pipe-regressions.json' : 'h2a-full-suite.json';
await mkdir(artifactDir, { recursive: true });
const python = pythonRuntime();
// Archived native tests call `python`; make the detected interpreter available
// without changing the user's machine-wide PATH or skipping dependency checks.
const env = { ...python.env };
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
env[pathKey] = `${dirname(python.command)}${process.platform === 'win32' ? ';' : ':'}${env[pathKey] || ''}`;
await run(process.execPath, ['node_modules/electron-vite/bin/electron-vite.js', 'build'], { cwd: h2a, env });
await run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...selectedTests, '--maxWorkers=1', '--reporter=default', '--reporter=json', `--outputFile.json=${join(artifactDir, reportName)}`], { cwd: h2a, env });
