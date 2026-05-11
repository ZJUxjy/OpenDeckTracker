import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
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

  it('persists normal and premium copies of the same dbfId', () => {
    const store = createCollectionSnapshotStore(join(dir, 'collection.sqlite'));
    try {
      store.save(
        [
          { dbfId: 1, count: 2, premium: 0 },
          { dbfId: 1, count: 1, premium: 1 },
        ],
        3,
      );
      const snapshot = store.get();
      expect(snapshot?.cards).toEqual([
        { dbfId: 1, count: 2, premium: 0 },
        { dbfId: 1, count: 1, premium: 1 },
      ]);
    } finally {
      store.close();
    }
  });

  it('aggregates duplicate rows for the same dbfId and premium', () => {
    const store = createCollectionSnapshotStore(join(dir, 'collection.sqlite'));
    try {
      const saved = store.save(
        [
          { dbfId: 1, count: 1, premium: 0 },
          { dbfId: 1, count: 2, premium: 0 },
        ],
        4,
      );
      expect(saved.cards).toEqual([{ dbfId: 1, count: 3, premium: 0 }]);
      expect(store.get()?.cards).toEqual([{ dbfId: 1, count: 3, premium: 0 }]);
    } finally {
      store.close();
    }
  });

  it('migrates the legacy dbfId-only primary key schema', () => {
    const dbPath = join(dir, 'legacy.sqlite');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE collection_cards (
        dbf_id INTEGER NOT NULL PRIMARY KEY,
        count INTEGER NOT NULL,
        premium INTEGER NOT NULL
      );
      CREATE TABLE collection_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO collection_cards(dbf_id, count, premium) VALUES (1, 2, 0);
      INSERT INTO collection_meta(key, value) VALUES ('lastUpdatedAt', '5');
    `);
    db.close();

    const store = createCollectionSnapshotStore(dbPath);
    try {
      store.save(
        [
          { dbfId: 1, count: 2, premium: 0 },
          { dbfId: 1, count: 1, premium: 1 },
        ],
        6,
      );
      expect(store.get()?.cards).toEqual([
        { dbfId: 1, count: 2, premium: 0 },
        { dbfId: 1, count: 1, premium: 1 },
      ]);
    } finally {
      store.close();
    }
  });

  it('cleans a leftover migration temp table before opening', () => {
    const dbPath = join(dir, 'leftover-temp.sqlite');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE collection_cards (
        dbf_id INTEGER NOT NULL PRIMARY KEY,
        count INTEGER NOT NULL,
        premium INTEGER NOT NULL
      );
      CREATE TABLE collection_cards_new (
        dbf_id INTEGER NOT NULL,
        count INTEGER NOT NULL,
        premium INTEGER NOT NULL,
        PRIMARY KEY (dbf_id, premium)
      );
      CREATE TABLE collection_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO collection_cards(dbf_id, count, premium) VALUES (1, 2, 0);
      INSERT INTO collection_cards_new(dbf_id, count, premium) VALUES (9, 1, 0);
      INSERT INTO collection_meta(key, value) VALUES ('lastUpdatedAt', '5');
    `);
    db.close();

    const store = createCollectionSnapshotStore(dbPath);
    try {
      expect(store.get()?.cards).toEqual([{ dbfId: 1, count: 2, premium: 0 }]);
      store.save([{ dbfId: 1, count: 1, premium: 1 }], 7);
      expect(store.get()?.cards).toEqual([{ dbfId: 1, count: 1, premium: 1 }]);
    } finally {
      store.close();
    }
  });

  it('save() preserves lastUpdatedAt when card hash is unchanged', () => {
    const store = createCollectionSnapshotStore(join(dir, 'collection.sqlite'));
    try {
      const T1 = 10_000;
      const T2 = T1 + 60_000;
      store.save(
        [
          { dbfId: 1, count: 2, premium: 0 },
          { dbfId: 2, count: 1, premium: 1 },
        ],
        T1,
      );
      const second = store.save(
        [
          { dbfId: 2, count: 1, premium: 1 },
          { dbfId: 1, count: 2, premium: 0 },
        ],
        T2,
      );
      expect(second.lastUpdatedAt).toBe(T1);
      expect(store.get()?.lastUpdatedAt).toBe(T1);
    } finally {
      store.close();
    }
  });

  it('save() updates lastUpdatedAt when card count changes', () => {
    const store = createCollectionSnapshotStore(join(dir, 'collection.sqlite'));
    try {
      const T1 = 10_000;
      const T2 = T1 + 60_000;
      store.save([{ dbfId: 1, count: 2, premium: 0 }], T1);
      const second = store.save([{ dbfId: 1, count: 3, premium: 0 }], T2);
      expect(second.lastUpdatedAt).toBe(T2);
      expect(store.get()?.cards.find((c) => c.dbfId === 1)?.count).toBe(3);
    } finally {
      store.close();
    }
  });

  it('save() updates lastUpdatedAt when a new card is added', () => {
    const store = createCollectionSnapshotStore(join(dir, 'collection.sqlite'));
    try {
      const T1 = 10_000;
      const T2 = T1 + 60_000;
      store.save([{ dbfId: 1, count: 2, premium: 0 }], T1);
      const second = store.save(
        [
          { dbfId: 1, count: 2, premium: 0 },
          { dbfId: 2, count: 1, premium: 1 },
        ],
        T2,
      );
      expect(second.lastUpdatedAt).toBe(T2);
    } finally {
      store.close();
    }
  });

  it('returns null gracefully when the underlying db is corrupt', async () => {
    const dbPath = join(dir, 'corrupt.sqlite');
    await writeFile(dbPath, 'not a real sqlite db');
    expect(() => createCollectionSnapshotStore(dbPath)).toThrow();
  });
});
