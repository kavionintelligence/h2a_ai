import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AtomicFileStore, VersionedJsonRepository } from '@h2a/storage';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('atomic local storage concurrency', () => {
  it('serializes first creation when separate service instances share one repository path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2a-storage-concurrency-'));
    roots.push(root);
    const repositories = Array.from({ length: 12 }, () => new VersionedJsonRepository(
      new AtomicFileStore(root),
      'connectors/registry.json',
      'h2a.connectors.registry',
      z.array(z.string()),
      { initialData: [] }
    ));

    await expect(Promise.all(repositories.map((repository) => repository.read()))).resolves.toEqual(
      Array.from({ length: repositories.length }, () => [])
    );
    await expect(repositories[0].read()).resolves.toEqual([]);
  });
});
