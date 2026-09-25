import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorFrame } from '@h2a/contracts';
import { LocalProcessTransport } from '../packages/messaging/src/localProcessTransport';
import { DirectProcessTransport } from '../packages/messaging/src/directProcessTransport';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

const frame: ConnectorFrame = {
  protocol_version: '1.0', frame_id: 'frame_test', kind: 'task', connector_manifest_id: 'manifest_test',
  task_id: 'task_test', trace_id: 'trace_test', sequence: 1, idempotency_key: 'idempotency_test',
  created_at: '2026-09-24T00:00:00Z', expires_at: '2026-09-25T00:00:00Z', payload: {},
  payload_hash: `sha256:${'0'.repeat(64)}`, sender_signature: 'ed25519:dGVzdA=='
};
const completed = { type: 'completed', result: { ...frame, kind: 'result' },
  acknowledgement: { ...frame, kind: 'acknowledgement' } };

class Peer extends EventEmitter {
  public readonly stdout = new PassThrough();
  public readonly stderr = new PassThrough();
  public readonly writes: string[] = [];
  public readonly stdin: Writable;
  public killed = false;
  public exitCode: number | null = null;
  public signalCode: string | null = null;
  public onWrite: (payload: string, done: (error?: Error | null) => void) => void;
  public constructor() {
    super();
    this.onWrite = (_payload, done) => { done(); queueMicrotask(() => this.respond(completed)); };
    this.stdin = new Writable({ highWaterMark: 1, write: (chunk, _encoding, done) => {
      this.writes.push(String(chunk)); this.onWrite(String(chunk), done);
    } });
  }
  public respond(value: unknown): void { this.stdout.write(`${JSON.stringify(value)}\n`); }
  public kill(): boolean {
    this.killed = true;
    queueMicrotask(() => { this.emit('exit', null, 'SIGTERM'); this.emit('close'); });
    return true;
  }
  public exit(code = 0): void { this.exitCode = code; this.emit('exit', code, null); this.emit('close'); }
}

type Transport = LocalProcessTransport | DirectProcessTransport;
const transports: Transport[] = [];
const peers: Peer[] = [];
let createPeer: () => Peer;
beforeEach(() => {
  createPeer = () => new Peer();
  spawnMock.mockReset().mockImplementation(() => {
    const peer = createPeer(); peers.push(peer);
    queueMicrotask(() => peer.emit('spawn'));
    return peer;
  });
});
afterEach(async () => {
  await Promise.all(transports.splice(0).map((transport) => transport.close()));
  peers.splice(0);
});

function transport(kind: 'local' | 'direct', timeoutMs = 300): Transport {
  const options = { command: 'explicit-test-peer', args: [], cwd: process.cwd(),
    connectorManifestId: 'manifest_test', timeoutMs };
  const value = kind === 'local'
    ? new LocalProcessTransport({ ...options, connectorPrivateKeyPath: 'test-key.pem' })
    : new DirectProcessTransport({ ...options, runtimePrivateKeyPem: 'test-private-key' });
  transports.push(value);
  return value;
}
function deliver(value: Transport) { return value.deliver(frame, 'test-public-key', async () => frame); }

describe.each(['local', 'direct'] as const)('%s process transport lifecycle', (kind) => {
  it.each(['EPIPE', 'EAGAIN'])('rejects asynchronous %s once without replay, then starts a new peer', async (code) => {
    createPeer = () => {
      const peer = new Peer();
      peer.onWrite = (_payload, done) => {
        done(); queueMicrotask(() => peer.stdin.emit('error', Object.assign(new Error(code), { code })));
      };
      return peer;
    };
    const value = transport(kind);
    await expect(deliver(value)).rejects.toThrow(code);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(peers[0]!.writes).toHaveLength(1);
    expect(peers[0]!.killed).toBe(true);
    // A late stream error stays handled after the failed generation is discarded.
    expect(() => peers[0]!.stdin.emit('error', Object.assign(new Error('late EPIPE'), { code: 'EPIPE' }))).not.toThrow();
    createPeer = () => new Peer();
    await expect(deliver(value)).resolves.toMatchObject({ result: { kind: 'result' } });
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(peers[1]!.writes).toHaveLength(1);
  });

  it('handles a startup error before any write and permits a later explicit delivery', async () => {
    spawnMock.mockImplementationOnce(() => {
      const peer = new Peer(); peers.push(peer);
      queueMicrotask(() => peer.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
      return peer;
    });
    const value = transport(kind);
    await expect(deliver(value)).rejects.toThrow('ENOENT');
    expect(peers[0]!.writes).toEqual([]);
    await expect(deliver(value)).resolves.toMatchObject({ result: { kind: 'result' } });
  });

  it('rejects a zero-code exit without a response instead of waiting for timeout', async () => {
    createPeer = () => {
      const peer = new Peer();
      peer.onWrite = (_payload, done) => { done(); queueMicrotask(() => peer.exit(0)); };
      return peer;
    };
    await expect(deliver(transport(kind))).rejects.toThrow('exited (0)');
    expect(peers[0]!.writes).toHaveLength(1);
  });

  it('does not write to already destroyed stdin', async () => {
    createPeer = () => { const peer = new Peer(); peer.stdin.destroy(); return peer; };
    await expect(deliver(transport(kind))).rejects.toThrow(/stdin/);
    expect(peers[0]!.writes).toEqual([]);
  });

  it('respects backpressure without replaying a write', async () => {
    createPeer = () => {
      const peer = new Peer();
      peer.onWrite = (_payload, done) => { setTimeout(() => { done(); peer.respond(completed); }, 15); };
      return peer;
    };
    await expect(deliver(transport(kind))).resolves.toMatchObject({ acknowledgement: { kind: 'acknowledgement' } });
    expect(peers[0]!.writes).toHaveLength(1);
  });

  it('cleans timed-out waiters and starts a fresh peer for the next request', async () => {
    createPeer = () => { const peer = new Peer(); peer.onWrite = (_payload, done) => done(); return peer; };
    const value = transport(kind, 40);
    await expect(deliver(value)).rejects.toThrow('response timed out');
    expect(peers[0]!.killed).toBe(true);
    createPeer = () => new Peer();
    await expect(deliver(value)).resolves.toMatchObject({ result: { kind: 'result' } });
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending response on close and refuses concurrent mixed deliveries', async () => {
    createPeer = () => { const peer = new Peer(); peer.onWrite = (_payload, done) => done(); return peer; };
    const value = transport(kind);
    const pending = deliver(value);
    const rejected = expect(pending).rejects.toThrow('transport closed');
    await vi.waitFor(() => expect(peers[0]?.writes).toHaveLength(1));
    await expect(deliver(value)).rejects.toThrow('active delivery');
    await value.close();
    await rejected;
    expect(peers[0]!.writes).toHaveLength(1);
  });
});

it('does not send a context response after local peer stdin closes during authorization', async () => {
  createPeer = () => {
    const peer = new Peer();
    peer.onWrite = (_payload, done) => { done(); queueMicrotask(() => peer.respond({ type: 'context-request', frame })); };
    return peer;
  };
  const value = transport('local');
  const authorize = vi.fn(async () => { peers[0]!.stdin.destroy(); return frame; });
  await expect(value.deliver(frame, 'test-public-key', authorize)).rejects.toThrow(/stdin/);
  expect(authorize).toHaveBeenCalledOnce();
  expect(peers[0]!.writes).toHaveLength(1);
});
