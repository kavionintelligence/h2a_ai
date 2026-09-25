import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const nodeA = resolvePath(readArgument('--node-a') ?? process.env.H2A_DATA_PATH);
const nodeB = resolvePath(readArgument('--node-b'));
if (!nodeA || !nodeB) throw new Error('Provide --node-a and --node-b data roots.');
if (nodeA === nodeB) throw new Error('Node A and Node B must use different data roots.');
await Promise.all([assertDirectory(nodeA, 'Node A'), assertDirectory(nodeB, 'Node B')]);
await stat(join(projectRoot, 'out', 'main', 'index.js')).catch(() => { throw new Error('Production output is missing. Run pnpm build first.'); });

const electron = join(projectRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
await stat(electron).catch(() => { throw new Error(`Electron executable is missing: ${electron}`); });
const children = [launch(nodeA, 'A'), launch(nodeB, 'B')];
process.stdout.write(`Phase 29 nodes launched.\nNode A: ${nodeA}\nNode B: ${nodeB}\nClose both H2A windows to end the command.\n`);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const child of children) child.kill(); });
await Promise.all(children.map((child) => new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', resolveExit); })));

function launch(dataPath, label) { return spawn(electron, [projectRoot], { cwd: projectRoot, env: { ...process.env, H2A_DATA_PATH: dataPath, H2A_NODE_LABEL: label }, stdio: 'inherit', windowsHide: false }); }
function readArgument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function resolvePath(value) { if (!value) return undefined; return resolve(isAbsolute(value) ? value : join(projectRoot, value)); }
async function assertDirectory(path, label) { const value = await stat(path).catch(() => undefined); if (!value?.isDirectory()) throw new Error(`${label} data root does not exist: ${path}`); }
