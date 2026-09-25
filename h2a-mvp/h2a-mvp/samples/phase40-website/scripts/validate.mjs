/* global URL, console, process */
import { readFile } from 'node:fs/promises';

const mode = process.argv[2];
const [html, css] = await Promise.all([
  readFile(new URL('../src/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
]);

const failures = [];
if (!html.includes('<main>')) failures.push('main landmark missing');
if (!html.includes('name="viewport"')) failures.push('responsive viewport missing');
if (!html.match(/<h1>[^<]+<\/h1>/u)) failures.push('literal h1 missing');
if (!css.includes(':root')) failures.push('root design tokens missing');
if (/api[_-]?key|password|private[_-]?key/iu.test(`${html}\n${css}`)) failures.push('secret-like material present');
if (!['lint', 'typecheck', 'test', 'build'].includes(mode)) failures.push('unknown validation mode');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`${mode}: website validation passed`);
