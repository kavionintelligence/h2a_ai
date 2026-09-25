// Import website identity assets once. The offline application never contacts vendors.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const directory = resolve(import.meta.dirname, '../h2a-mvp/h2a-mvp/public/product-marks');
const sources = [
  ['github.ico', 'https://github.com/favicon.ico', 'GitHub'],
  ['figma.ico', 'https://static.figma.com/app/icon/1/favicon.ico', 'Figma'],
  ['salesforce.ico', 'https://www.salesforce.com/favicon.ico', 'Salesforce'],
  ['microsoft.ico', 'https://www.microsoft.com/favicon.ico', 'Microsoft platform'],
  ['google.ico', 'https://www.google.com/favicon.ico', 'Google platform'],
];
await mkdir(directory, { recursive: true });
const records = [];
for (const [file, url, label] of sources) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok || !/image|octet-stream/.test(response.headers.get('content-type') || '')) throw new Error(`Unexpected asset response: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 250000 || bytes.length < 20) throw new Error('Invalid asset size');
    await writeFile(join(directory, file), bytes);
    records.push({ file, source: url, label, sha256: createHash('sha256').update(bytes).digest('hex') });
    console.log(`Bundled ${label} mark`);
  } catch (error) { console.warn(`${label}: unavailable; labelled fallback remains. ${error.message}`); }
}
await writeFile(join(directory, 'tool-sources.json'), JSON.stringify(records, null, 2) + '\n');
