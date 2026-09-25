import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const renderer = join(process.cwd(), 'out', 'renderer');
const files = await recursiveFiles(renderer);
const text = (await Promise.all(files.filter((file) => /\.(?:html|js|css)$/u.test(file)).map((file) => readFile(file, 'utf8')))).join('\n');
const forbidden = ['proof_preview_admin', 'trace_supplier_review', 'PREVIEWPUBLICKEYMATERIAL', 'ed25519:preview', 'mock_'];
const found = forbidden.filter((marker) => text.includes(marker));
if (found.length) throw new Error(`Production renderer contains preview/mock markers: ${found.join(', ')}`);
process.stdout.write(`H2A_PHASE23_PRODUCTION_SURFACE_OK ${files.length} renderer files scanned\n`);

async function recursiveFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? recursiveFiles(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
}
