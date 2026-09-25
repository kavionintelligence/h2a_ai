// Explicit, reproducible asset import. No application runtime requests vendor sites.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const target = resolve(import.meta.dirname, '../h2a-mvp/h2a-mvp/public/product-marks');
await mkdir(target, { recursive: true });
const sources = [
  ['claude.png', 'https://assets.claude.com/95a868946ac8a31e5ff832e2899f294aa368b836.png?w=128&h=128', 'https://claude.com'],
  ['gemini.png', 'https://www.gstatic.com/lamda/images/gemini_sparkle_4g_512_lt_f94943af3be039176192d.png', 'https://gemini.google.com'],
  ['antigravity.png', 'https://antigravity.google/assets/image/antigravity-logo.png', 'https://antigravity.google'],
];
const records = [];
for (const [file, url, page] of sources) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Invalid image response for ${file}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 1000000) throw new Error(`Image exceeds limit: ${file}`);
  await writeFile(join(target, file), bytes);
  records.push({ file, source: url, referenced_by: page, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const extension = process.argv[2];
if (extension) {
  const manifest = JSON.parse(await readFile(join(extension, 'package.json'), 'utf8'));
  if (manifest.publisher !== 'openai' || manifest.name !== 'chatgpt') throw new Error('Expected official installed OpenAI Codex extension.');
  const bytes = await readFile(join(extension, 'resources/blossom-black.svg'));
  await writeFile(join(target, 'openai.svg'), bytes);
  records.push({ file: 'openai.svg', source: `Official OpenAI Codex extension ${manifest.version}, resources/blossom-black.svg`, referenced_by: 'https://marketplace.visualstudio.com/items?itemName=OpenAI.chatgpt', sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(join(target, 'sources.json'), JSON.stringify(records, null, 2) + '\n');
console.log(`Imported ${records.length} original product marks. Trademarks remain their owners' property.`);
