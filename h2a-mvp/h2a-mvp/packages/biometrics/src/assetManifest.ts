import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';

const manifestSchema = z.object({
  manifestVersion: z.literal(1),
  usePolicy: z.literal('local-non-commercial-demonstration-only'),
  assets: z.array(z.object({
    id: z.string().min(1),
    path: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/)
  }).strict()).min(1)
}).strict();

export async function verifyBiometricAssetManifest(projectRoot = process.cwd()): Promise<void> {
  const normalizedRoot = resolve(projectRoot);
  const manifestPath = resolve(normalizedRoot, 'public', 'biometric', 'MODEL_MANIFEST.json');
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  for (const asset of manifest.assets) {
    const assetPath = resolve(normalizedRoot, asset.path);
    const pathFromRoot = relative(normalizedRoot, assetPath);
    if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) throw new Error(`Biometric asset escapes the project root: ${asset.id}`);
    const actual = createHash('sha256').update(await readFile(assetPath)).digest('hex');
    if (actual !== asset.sha256) throw new Error(`Biometric asset integrity failed: ${asset.id}`);
  }
}
