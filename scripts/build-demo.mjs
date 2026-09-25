import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { h2a, run, requireDependencies } from './demo-runtime.mjs';

export async function buildDemo({ frontend = true } = {}) {
  requireDependencies();
  const require = createRequire(realpathSync(join(h2a, 'node_modules', 'vite', 'package.json')));
  const { build } = require('esbuild');
  await build({ entryPoints: [join(h2a, 'apps/governance/server.ts')], outfile: join(h2a, '.governance-dist/server.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', tsconfig: join(h2a, 'tsconfig.node.json'), logLevel: 'warning' });
  if (frontend) await run(process.execPath, [join(h2a, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.web.config.ts'], { cwd: h2a });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildDemo();
