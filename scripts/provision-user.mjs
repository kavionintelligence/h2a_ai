import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [file, human_id, name, role = 'builder', team = 'Product'] = process.argv.slice(2);
if (!file || !human_id || !name || !['admin', 'builder', 'reviewer', 'viewer'].includes(role)) throw new Error('Usage: node scripts/provision-user.mjs <users.json> <human-id> "Full name" <admin|builder|reviewer|viewer> [team]');
const target = resolve(file);
const users = JSON.parse(await readFile(target, 'utf8').catch(error => { if (error.code === 'ENOENT') return '[]'; throw error; }));
if (users.some(user => user.human_id === human_id)) throw new Error('User already exists; refusing to replace credentials.');
const token = randomBytes(32).toString('base64url');
users.push({ human_id, name, team, role, token_hash: createHash('sha256').update(token).digest('hex') });
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(users, null, 2) + '\n', { mode: 0o600 });
console.log(`Created ${human_id} (${role}). Set BYOSYNC_USERS_FILE to ${target} and restart.\nOne-time display of sign-in credential: ${token}\nStore this credential securely. The server stores only its hash. Use HTTPS when sharing the server.`);
