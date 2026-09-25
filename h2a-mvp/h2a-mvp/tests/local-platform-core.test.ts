import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  demoWorkplaceSnapshot,
  type H2AFeatureConfig
} from '@h2a/contracts';
import {
  LocalAuthorityEventLedger,
  canonicalize,
  hashCanonical
} from '@h2a/evidence';
import {
  AtomicFileStore,
  LocalDataError,
  LocalFeatureConfigRepository,
  LocalWorkplaceRepository
} from '@h2a/storage';

const temporaryDirectories: string[] = [];
const fixedClock = () => new Date('2026-08-20T10:00:00.000Z');

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  );
});

describe('atomic local storage contract', () => {
  it('writes, reads, backs up, and contains paths within the data root', async () => {
    const root = await createTempDirectory();
    const store = new AtomicFileStore(root);

    expect(await store.read('settings/value.txt')).toBeUndefined();
    await store.write('settings/value.txt', 'v1');
    await store.write('settings/value.txt', 'v2');

    expect(await store.read('settings/value.txt')).toBe('v2');
    expect(await readFile(join(root, 'settings', 'value.txt.bak'), 'utf8')).toBe('v1');
    expect((await readdir(join(root, 'settings'))).some((name) => name.endsWith('.tmp'))).toBe(false);
    expect(() => store.resolvePath('../outside.json')).toThrow(LocalDataError);
  });

  it('migrates validated legacy arrays to versioned envelopes', async () => {
    const root = await createTempDirectory();
    await writeLegacyWorkplace(root);
    const repository = new LocalWorkplaceRepository(root, fixedClock);

    const snapshot = await repository.getSnapshot();
    expect(snapshot.agents).toEqual(demoWorkplaceSnapshot.agents);

    const migrated = JSON.parse(await readFile(join(root, 'workplace', 'fleet.json'), 'utf8')) as {
      schemaVersion: number;
      kind: string;
      data: unknown[];
    };
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.kind).toBe('h2a.workplace.fleet');
    expect(migrated.data).toHaveLength(4);
  });

  it('fails closed when a local record violates its schema', async () => {
    const root = await createTempDirectory();
    await writeLegacyWorkplace(root);
    await writeFile(join(root, 'workplace', 'fleet.json'), '[{"id":"incomplete"}]', 'utf8');

    await expect(new LocalWorkplaceRepository(root).getSnapshot()).rejects.toThrow(LocalDataError);
  });

  it('persists validated feature modes in a versioned file', async () => {
    const root = await createTempDirectory();
    const repository = new LocalFeatureConfigRepository(root, fixedClock);
    const defaults = await repository.get();
    expect(defaults.agentMode).toBe('scripted-workplace');

    const updated: H2AFeatureConfig = { ...defaults, humanProofMode: 'biometric-token' };
    expect(await repository.set(updated)).toEqual(updated);
    expect(await repository.get()).toEqual(updated);
  });
});

describe('hash-linked authority ledger', () => {
  it('canonicalizes equivalent objects identically', () => {
    const first = { z: 1, nested: { beta: true, alpha: ['x', 2] } };
    const second = { nested: { alpha: ['x', 2], beta: true }, z: 1 };
    expect(canonicalize(first)).toBe(canonicalize(second));
    expect(hashCanonical(first)).toBe(hashCanonical(second));
  });

  it('appends linked records and verifies the complete chain', async () => {
    const root = await createTempDirectory();
    const ledger = new LocalAuthorityEventLedger(root, 'traces/tr_test.jsonl', fixedClock);
    const first = await ledger.append({
      trace_id: 'tr_test',
      actor: { type: 'system', id: 'h2a-core' },
      event_type: 'MANDATE_CREATED',
      payload: { mandate_id: 'mnd_001', limit: 5000 }
    });
    const second = await ledger.append({
      trace_id: 'tr_test',
      actor: { type: 'agent', id: 'agt_001' },
      mandate_id: 'mnd_001',
      parent_event_id: first.event_id,
      event_type: 'ACTION_REQUESTED',
      payload: { action: 'sandbox.payment.execute' }
    });

    expect(second.previous_hash).toBe(first.event_hash);
    await expect(ledger.verify()).resolves.toMatchObject({
      status: 'verified',
      recordCount: 2,
      headHash: second.event_hash
    });
  });

  it('detects modified evidence and refuses to extend the damaged chain', async () => {
    const root = await createTempDirectory();
    const ledger = new LocalAuthorityEventLedger(root, 'traces/tr_tamper.jsonl', fixedClock);
    await ledger.append({
      trace_id: 'tr_tamper',
      actor: { type: 'agent', id: 'agt_finance' },
      event_type: 'ACTION_EXECUTED',
      payload: { amount: 9182 }
    });

    const path = join(root, 'traces', 'tr_tamper.jsonl');
    const original = await readFile(path, 'utf8');
    await writeFile(path, original.replace('9182', '9183'), 'utf8');

    await expect(ledger.verify()).resolves.toMatchObject({ status: 'failed' });
    await expect(ledger.append({
      trace_id: 'tr_tamper',
      actor: { type: 'system', id: 'h2a-core' },
      event_type: 'WORKFLOW_COMPLETED',
      payload: {}
    })).rejects.toThrow('Refusing to append');
  });
});

async function createTempDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'h2a-core-'));
  temporaryDirectories.push(path);
  return path;
}

async function writeLegacyWorkplace(root: string): Promise<void> {
  await Promise.all([
    mkdir(join(root, 'workplace'), { recursive: true }),
    mkdir(join(root, 'evidence'), { recursive: true })
  ]);
  await Promise.all([
    writeFile(join(root, 'workplace', 'fleet.json'), JSON.stringify(demoWorkplaceSnapshot.agents), 'utf8'),
    writeFile(
      join(root, 'workplace', 'assignments.json'),
      JSON.stringify(demoWorkplaceSnapshot.assignments),
      'utf8'
    ),
    writeFile(
      join(root, 'evidence', 'recent-events.json'),
      JSON.stringify(demoWorkplaceSnapshot.events),
      'utf8'
    )
  ]);
}
