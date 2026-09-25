// ZIP archives sometimes materialize pnpm symlinks as tiny relative-path files.
// Preserve every original placeholder before restoring a local junction/symlink.
import { readdir, readFile, stat, rename, symlink } from 'node:fs/promises';
import { resolve, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(workspace, 'h2a-mvp', 'h2a-mvp', 'node_modules');
let repaired = 0;
async function repairDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name.startsWith('@') && entry.isDirectory()) await repairDirectory(path);
    if (!entry.isFile() || entry.name.endsWith('.archive-link')) continue;
    const info = await stat(path);
    if (info.size > 400 || info.size < 3) continue;
    const target = (await readFile(path, 'utf8')).trim();
    if (!/^(\.\.\/|\.pnpm\/)[^\r\n]+\/$/.test(target)) continue;
    const absolute = resolve(directory, target);
    if (!absolute.startsWith(modules + sep) || !(await stat(absolute).catch(() => null))?.isDirectory()) continue;
    await rename(path, path + '.archive-link');
    await symlink(absolute, path, process.platform === 'win32' ? 'junction' : 'dir');
    repaired++;
  }
}
try {
  await repairDirectory(modules);
  const store = join(modules, '.pnpm');
  for (const entry of await readdir(store, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = entry.name === 'node_modules' ? join(store, entry.name) : join(store, entry.name, 'node_modules');
    if ((await stat(directory).catch(() => null))?.isDirectory()) await repairDirectory(directory);
  }
  console.log(`Restored ${repaired} archived dependency links (original placeholders preserved).`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.log('No archived dependency tree found; use the normal installation command.');
}
