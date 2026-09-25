import { createHash, randomUUID } from 'node:crypto';
import { createSocket, type Socket } from 'node:dgram';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import {
  signedNodePresenceSchema,
  federationNodeIdentitySchema,
  type FederationNodeIdentity,
  type SignedNodePresence
} from '@h2a/contracts';
import { verifyFederationPairingRecord } from './federationService';

const transportRecordSchema = z.object({
  schema_version: z.literal(1),
  message_id: z.string().min(1).max(240),
  type: z.enum(['pairing-request', 'pairing-registration', 'pairing-confirmation', 'pairing-acceptance', 'pairing-cancelled']),
  sender_node: federationNodeIdentitySchema,
  recipient_node_id: z.string().min(1).max(240),
  pairing_id: z.string().min(1).max(240),
  payload: z.unknown(),
  issued_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  canonical_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  node_signature: z.string().regex(/^ed25519:[A-Za-z0-9+/=]+$/u)
}).strict();

export type PairingTransportRecord = z.infer<typeof transportRecordSchema>;
export type PairingTransportUnsigned = Omit<PairingTransportRecord, 'canonical_hash' | 'node_signature'>;

export interface NodeDiscoveryPort {
  readonly mode: 'same-host' | 'secure-lan';
  publishPresence(presence: SignedNodePresence): Promise<void>;
  listPresences(): Promise<SignedNodePresence[]>;
  send(record: PairingTransportRecord): Promise<void>;
  receive(nodeId: string): Promise<PairingTransportRecord[]>;
  close(): Promise<void>;
}

export class SameHostNodeDiscoveryPort implements NodeDiscoveryPort {
  public readonly mode = 'same-host' as const;

  public constructor(private readonly root = process.env.H2A_DISCOVERY_PATH ?? join(tmpdir(), 'h2a-node-discovery-v1')) {}

  public async publishPresence(presence: SignedNodePresence): Promise<void> {
    validatePresence(presence);
    await atomicWrite(join(this.root, 'presence', `${safeName(presence.node.node_id)}.json`), presence);
  }

  public async listPresences(): Promise<SignedNodePresence[]> {
    return this.readDirectory(join(this.root, 'presence'), signedNodePresenceSchema, (item) => item.expires_at, validatePresence);
  }

  public async send(record: PairingTransportRecord): Promise<void> {
    validateTransportRecord(record);
    await atomicWrite(join(this.root, 'mailbox', safeName(record.recipient_node_id), `${safeName(record.message_id)}.json`), record);
  }

  public async receive(nodeId: string): Promise<PairingTransportRecord[]> {
    return this.readDirectory(join(this.root, 'mailbox', safeName(nodeId)), transportRecordSchema, (item) => item.expires_at, validateTransportRecord);
  }

  public async close(): Promise<void> {}

  private async readDirectory<T>(directory: string, schema: z.ZodType<T>, expiry: (value: T) => string, validate: (value: T) => void): Promise<T[]> {
    await mkdir(directory, { recursive: true });
    const names = await readdir(directory);
    const values: T[] = [];
    for (const name of names.filter((item) => item.endsWith('.json'))) {
      const file = join(directory, name);
      try {
        const value = schema.parse(JSON.parse(await readFile(file, 'utf8')) as unknown);
        if (new Date(expiry(value)).getTime() <= Date.now()) { await rm(file, { force: true }); continue; }
        validate(value);
        values.push(value);
      } catch { await rm(file, { force: true }); }
    }
    return values;
  }
}

export class SecureLanNodeDiscoveryPort implements NodeDiscoveryPort {
  public readonly mode = 'secure-lan' as const;
  private readonly seenPresence = new Map<string, SignedNodePresence>();
  private readonly inbox = new Map<string, PairingTransportRecord>();
  private socket: Socket | undefined;

  public constructor(
    private readonly multicastAddress = '239.255.42.48',
    private readonly port = 42448,
    private readonly enabled = process.env.H2A_SECURE_LAN_DISCOVERY === '1'
  ) {}

  public async publishPresence(presence: SignedNodePresence): Promise<void> {
    if (!this.enabled) throw new Error('SECURE_LAN_DISCOVERY_DISABLED');
    if (presence.node.endpoint_policy !== 'https-required') throw new Error('SECURE_LAN_DISCOVERY_REQUIRES_PINNED_HTTPS');
    await this.broadcast({ kind: 'presence', value: presence });
  }

  public async listPresences(): Promise<SignedNodePresence[]> {
    if (!this.enabled) return [];
    await this.ensureSocket();
    this.prune();
    return [...this.seenPresence.values()];
  }

  public async send(record: PairingTransportRecord): Promise<void> {
    if (!this.enabled) throw new Error('SECURE_LAN_DISCOVERY_DISABLED');
    validateTransportRecord(record);
    if (record.sender_node.endpoint_policy !== 'https-required') throw new Error('SECURE_LAN_DISCOVERY_REQUIRES_PINNED_HTTPS');
    await this.broadcast({ kind: 'pairing', value: record });
  }

  public async receive(nodeId: string): Promise<PairingTransportRecord[]> {
    if (!this.enabled) return [];
    await this.ensureSocket();
    this.prune();
    return [...this.inbox.values()].filter((item) => item.recipient_node_id === nodeId);
  }

  public async close(): Promise<void> {
    this.socket?.close();
    this.socket = undefined;
  }

  private async broadcast(value: unknown): Promise<void> {
    await this.ensureSocket();
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length > 60_000) throw new Error('DISCOVERY_MESSAGE_TOO_LARGE');
    await new Promise<void>((resolve, reject) => this.socket!.send(bytes, this.port, this.multicastAddress, (error) => error ? reject(error) : resolve()));
  }

  private async ensureSocket(): Promise<void> {
    if (this.socket) return;
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('message', (bytes) => {
      try {
        const message = z.object({ kind: z.enum(['presence', 'pairing']), value: z.unknown() }).parse(JSON.parse(bytes.toString('utf8')) as unknown);
        if (message.kind === 'presence') {
          const presence = signedNodePresenceSchema.parse(message.value);
          validatePresence(presence);
          this.seenPresence.set(presence.discovery_id, presence);
        } else {
          const record = transportRecordSchema.parse(message.value);
          validateTransportRecord(record);
          this.inbox.set(record.message_id, record);
        }
      } catch { /* Invalid or unsigned LAN advertisements are ignored. */ }
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.bind(this.port, '0.0.0.0', () => {
        try { socket.addMembership(this.multicastAddress); socket.setMulticastTTL(1); socket.off('error', reject); resolve(); }
        catch (error) { reject(error); }
      });
    });
    this.socket = socket;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, value] of this.seenPresence) if (new Date(value.expires_at).getTime() <= now) this.seenPresence.delete(key);
    for (const [key, value] of this.inbox) if (new Date(value.expires_at).getTime() <= now) this.inbox.delete(key);
  }
}

export function unsignedPresence(value: SignedNodePresence): Omit<SignedNodePresence, 'canonical_hash' | 'node_signature'> {
  const unsigned: Partial<SignedNodePresence> = { ...value };
  delete unsigned.canonical_hash;
  delete unsigned.node_signature;
  return unsigned as Omit<SignedNodePresence, 'canonical_hash' | 'node_signature'>;
}

export function unsignedTransportRecord(value: PairingTransportRecord): PairingTransportUnsigned {
  const unsigned: Partial<PairingTransportRecord> = { ...value };
  delete unsigned.canonical_hash;
  delete unsigned.node_signature;
  return unsigned as PairingTransportUnsigned;
}

export function validatePresence(value: SignedNodePresence): void {
  const presence = signedNodePresenceSchema.parse(value);
  const node = unsignedNodeIdentity(presence.node);
  verifyFederationPairingRecord(node, presence.node.canonical_hash, presence.node.node_signature, presence.node.public_key_pem);
  verifyFederationPairingRecord(unsignedPresence(presence), presence.canonical_hash, presence.node_signature, presence.node.public_key_pem);
  if (presence.node.key_fingerprint !== `sha256:${createHash('sha256').update(presence.node.public_key_pem, 'utf8').digest('hex')}`) throw new Error('DISCOVERY_NODE_FINGERPRINT_INVALID');
}

export function validateTransportRecord(value: PairingTransportRecord): void {
  const record = transportRecordSchema.parse(value);
  verifyFederationPairingRecord(unsignedTransportRecord(record), record.canonical_hash, record.node_signature, record.sender_node.public_key_pem);
}

export function newTransportMessageId(): string { return `fpmsg_${randomUUID()}`; }

function unsignedNodeIdentity(value: FederationNodeIdentity): Omit<FederationNodeIdentity, 'canonical_hash' | 'node_signature'> {
  const unsigned: Partial<FederationNodeIdentity> = { ...value };
  delete unsigned.canonical_hash;
  delete unsigned.node_signature;
  return unsigned as Omit<FederationNodeIdentity, 'canonical_hash' | 'node_signature'>;
}

function safeName(value: string): string { return value.replace(/[^A-Za-z0-9_.-]/gu, '_').slice(0, 240); }

async function atomicWrite(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', flag: 'wx' });
  await rm(file, { force: true });
  await rename(temporary, file);
}
