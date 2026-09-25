import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { Human } from './contracts';

export type Role = 'admin' | 'builder' | 'reviewer' | 'viewer';
export type Actor = Human & { role: Role; mode: 'local-operator' | 'named-user' };
export const localActor: Actor = { human_id: process.env.BYOSYNC_OPERATOR_ID ?? 'HUM-LOCAL-OPERATOR',
  name: process.env.BYOSYNC_OPERATOR_NAME ?? 'Local security operator', team: process.env.BYOSYNC_OPERATOR_TEAM ?? 'Security', role: 'admin', mode: 'local-operator' };
export const actorContext = new AsyncLocalStorage<Actor>();
export const currentActor = () => actorContext.getStore() ?? localActor;
const userSchema = z.object({ human_id: z.string().min(1).max(160), name: z.string().min(1).max(100), team: z.string().min(1).max(100),
  role: z.enum(['admin', 'builder', 'reviewer', 'viewer']), token_hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

export class ActorDirectory {
  private users: z.infer<typeof userSchema>[] = [];
  async initialize(path = process.env.BYOSYNC_USERS_FILE) {
    if (!path) return;
    this.users = z.array(userSchema).min(1).max(1000).parse(JSON.parse(await readFile(path, 'utf8')));
    if (!this.users.some(user => user.role === 'admin')) throw new Error('Named-user configuration requires an administrator.');
    if (new Set(this.users.map(user => user.human_id)).size !== this.users.length || new Set(this.users.map(user => user.token_hash)).size !== this.users.length) throw new Error('User IDs and credentials must be unique.');
  }
  get enabled() { return this.users.length > 0; }
  people(): Human[] { return this.enabled ? this.users.map(({ human_id, name, team }) => ({ human_id, name, team })) : [localActor]; }
  authenticate(token: string | undefined): Actor | null {
    if (!token || token.length < 24 || token.length > 256) return null;
    const digest = createHash('sha256').update(token).digest();
    const user = this.users.find(item => timingSafeEqual(Buffer.from(item.token_hash, 'hex'), digest));
    return user ? { human_id: user.human_id, name: user.name, team: user.team, role: user.role, mode: 'named-user' } : null;
  }
}
