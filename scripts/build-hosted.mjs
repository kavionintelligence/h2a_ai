// Dedicated static simulator build. Never imports runtime.mjs (which loads .env),
// starts local services, or copies runtime data into the publish directory.
import { copyFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const sourceRoot = join(projectRoot, 'h2a-mvp', 'h2a-mvp');
const output = join(projectRoot, 'hosted-dist');
if (relative(projectRoot, output) !== 'hosted-dist') throw new Error('Hosted output must be the dedicated hosted-dist directory.');
const existingOutput = await lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
if (existingOutput?.isSymbolicLink() || existingOutput && !existingOutput.isDirectory()) throw new Error('Refusing to replace a non-directory or linked hosted-dist target.');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || major === 22 && minor < 12) throw new Error('Use Node.js 22.12 or newer for the hosted build.');
const { build } = await import(pathToFileURL(join(sourceRoot, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);
await build({
  configFile: join(sourceRoot, 'vite.web.config.ts'),
  // Do not import machine-local .env values or unrelated VITE_* secrets.
  envDir: false,
  envPrefix: 'BYOSYNC_HOSTED_PUBLIC_',
  define: { 'import.meta.env.VITE_BYOSYNC_HOSTED_SIMULATOR': JSON.stringify('true') },
  publicDir: false,
  build: { outDir: output, emptyOutDir: true, sourcemap: false },
});

// Explicit static-asset allowlist: never bulk-publish the application's public/
// folder, which also contains biometric runtime assets for local deployments.
const productMarks = ['antigravity.png', 'claude.png', 'gemini.png', 'openai.svg', 'github.ico', 'figma.ico', 'salesforce.ico', 'microsoft.ico', 'google.ico', 'sources.json', 'tool-sources.json'];
const markSource = join(sourceRoot, 'public', 'product-marks');
const markOutput = join(output, 'product-marks');
await mkdir(markOutput, { recursive: true });
for (const filename of productMarks) {
  const source = join(markSource, filename);
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected a regular reviewed product asset: ${filename}`);
  await copyFile(source, join(markOutput, filename));
}
// User-provided brand images are copied byte-for-byte; no resizing, tracing,
// recoloring, or generated replacements are applied by the hosted build.
const brandMarks = ['byosync.png', 'h2a.png'];
const brandSource = join(sourceRoot, 'public', 'brand-marks');
const brandOutput = join(output, 'brand-marks');
await mkdir(brandOutput, { recursive: true });
for (const filename of brandMarks) {
  const source = join(brandSource, filename);
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected a regular reviewed brand asset: ${filename}`);
  await copyFile(source, join(brandOutput, filename));
}
const manifest = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
await writeFile(join(output, 'hosting-mode.json'), JSON.stringify({ product: 'ByoSync', version: manifest.version, mode: 'hosted-simulator', data: 'synthetic-browser-local', localWorkspaceAvailable: false, backendDeployed: false }, null, 2) + '\n');
console.log('Hosted simulator built in hosted-dist. No backend, local workspace data or biometric assets are included.');
