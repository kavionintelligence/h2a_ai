// Reproducible, explicit source vendoring. Never run upstream installers.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { root } from './runtime.mjs';

const sources = [
  ['claw-orchestrator-main', 'src/kernel/exec.ts', 'claw-orchestrator/exec.ts'],
  ['claw-orchestrator-main', 'LICENSE', 'claw-orchestrator/LICENSE'],
  ['shadow-ai-guard-main', 'registry/registry.yaml', 'shadow-ai-guard/registry.yaml'],
  ['shadow-ai-guard-main', 'LICENSE', 'shadow-ai-guard/LICENSE'],
  ['shadow-ai-guard-main', 'NOTICE', 'shadow-ai-guard/NOTICE'],
  ['Claw-Hunter-main', 'claw-hunter.ps1', 'claw-hunter/claw-hunter.ps1'],
  ['Claw-Hunter-main', 'claw-hunter.sh', 'claw-hunter/claw-hunter.sh'],
  ['Claw-Hunter-main', 'LICENSE', 'claw-hunter/LICENSE'],
];
const manifest = [];
for (const [repo, source, destination] of sources) {
  const input = resolve(root, '..', repo, repo, source);
  const target = join(root, 'vendor', destination);
  await mkdir(dirname(target), { recursive: true });
  const sha256 = createHash('sha256').update(await readFile(input)).digest('hex');
  const existing = await readFile(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  const locallyAdapted = existing && createHash('sha256').update(existing).digest('hex') !== sha256;
  if (!locallyAdapted) await copyFile(input, target);
  manifest.push({ repo, source, destination, sha256, local_sha256: createHash('sha256').update(await readFile(target)).digest('hex'), locally_adapted: Boolean(locallyAdapted) });
}
await writeFile(join(root, 'vendor', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Vendored ${manifest.length} explicitly selected source/license files; no source repository was changed.`);
