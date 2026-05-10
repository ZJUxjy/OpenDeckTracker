import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCollectionSnapshotStore } from './collection-snapshot-store';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hdt-collection-snapshot-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('collection-snapshot-store', () => {
  it('persists cards and lastUpdatedAt across reopen', () => {
    const dbPath = join(dir, 'collection.sqlite');
    const first = createCollectionSnapshotStore(dbPath);
    first.save(
      [
        { dbfId: 1, count: 2, premium: 0 },
        { dbfId: 2, count: 1, premium: 1 },
      ],
      5_000,
    );
    first.close();

    const second = createCollectionSnapshotStore(dbPath);
    const snapshot = second.get();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.lastUpdatedAt).toBe(5_000);
    expect(snapshot!.cards).toHaveLength(2);
    expect(snapshot!.cards.find((c) => c.dbfId === 1)?.count).toBe(2);
    expect(snapshot!.cards.find((c) => c.dbfId === 2)?.premium).toBe(1);
    second.close();
  });

  it('returns null before any save', () => {
    const store = createCollectionSnapshotStore(join(dir, 'collection.sqlite'));
    expect(store.get()).toBeNull();
    store.close();
  });

  it('replaces previous cards on each save', () => {
    const store = createCollectionSnapshotStore(join(dir, 'collection.sqlite'));
    store.save([{ dbfId: 1, count: 1, premium: 0 }], 1);
    store.save([{ dbfId: 9, count: 5, premium: 0 }], 2);
    const snapshot = store.get();
    expect(snapshot!.cards).toHaveLength(1);
    expect(snapshot!.cards[0]?.dbfId).toBe(9);
    expect(snapshot!.lastUpdatedAt).toBe(2);
    store.close();
  });

  it('returns null gracefully when the underlying db is corrupt', async () => {
    const dbPath = join(dir, 'corrupt.sqlite');
    await writeFile(dbPath, 'not a real sqlite db');
    expect(() => createCollectionSnapshotStore(dbPath)).toThrow();
  });
});
