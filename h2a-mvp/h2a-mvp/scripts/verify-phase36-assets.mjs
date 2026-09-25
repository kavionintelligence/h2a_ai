import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const manifestPath = join(projectRoot, 'docs', 'plan4', 'assets', 'phase36-asset-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const restrictedHashes = new Set(manifest.restricted_reference.hashes);
const scannedFiles = [];
const violations = [];

for (const asset of manifest.assets) {
  const path = join(projectRoot, asset.source_path);
  const hash = await hashFile(path);
  if (hash !== asset.sha256) violations.push(`Manifest hash mismatch: ${asset.source_path}`);
}

for (const rootName of ['apps', 'packages', 'resources', 'public']) {
  const root = join(projectRoot, rootName);
  if (!await exists(root)) continue;
  for (const path of await walk(root)) {
    const hash = await hashFile(path);
    const projectPath = relative(projectRoot, path).replaceAll('\\', '/');
    scannedFiles.push({ path: projectPath, sha256: hash });
    if (restrictedHashes.has(hash)) violations.push(`Restricted Munder asset hash found: ${projectPath}`);
  }
}

const officeSource = await Promise.all((await walk(join(projectRoot, 'apps', 'desktop', 'renderer', 'src', 'office'))).map((path) => readFile(path, 'utf8')));
if (officeSource.some((source) => /munder-difflin|renderer\/src\/assets|Adam_walk|office-tileset|room-builder/iu.test(source))) {
  violations.push('Office source imports or names a prohibited Munder asset.');
}

const result = {
  kind: 'h2a.plan4.phase36-asset-verification',
  generated_at: new Date().toISOString(),
  manifest: relative(projectRoot, manifestPath).replaceAll('\\', '/'),
  declared_assets: manifest.assets.length,
  restricted_hashes: restrictedHashes.size,
  scanned_files: scannedFiles.length,
  violations
};

if (process.argv.includes('--write-evidence')) {
  const evidenceDirectory = join(projectRoot, 'docs', 'plan4', 'evidence', 'phase36');
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(join(evidenceDirectory, 'asset-verification.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

if (violations.length > 0) {
  process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`H2A_PHASE36_ASSETS_VERIFIED ${manifest.assets.length} original assets ${restrictedHashes.size} restricted hashes ${scannedFiles.length} files scanned\n`);
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function walk(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function hashFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
