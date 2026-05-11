import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CollectionCard } from '@hdt/hearthmirror';

export interface CollectionSnapshot {
  cards: CollectionCard[];
  lastUpdatedAt: number;
}

export interface CollectionSnapshotStore {
  get(): CollectionSnapshot | null;
  save(cards: readonly CollectionCard[], now?: number): CollectionSnapshot;
  close(): void;
}

interface MetaRow {
  key: string;
  value: string;
}

interface CardRow {
  dbf_id: number;
  count: number;
  premium: number;
}

export function createCollectionSnapshotStore(dbPath: string): CollectionSnapshotStore {
  mkdirSync(dirname(dbPath), { recursive: true });
  let db: Database.Database;
  const opened = new Database(dbPath);
  try {
    initializeSchema(opened);
    db = opened;
  } catch (err) {
    try {
      opened.close();
    } catch {
      // already broken; release the handle so callers can retry
    }
    throw err;
  }

  const selectMeta = db.prepare('SELECT key, value FROM collection_meta WHERE key = ?');
  const selectCards = db.prepare('SELECT dbf_id, count, premium FROM collection_cards');
  const upsertMeta = db.prepare(
    'INSERT INTO collection_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  const deleteCards = db.prepare('DELETE FROM collection_cards');
  const insertCard = db.prepare(
    'INSERT INTO collection_cards(dbf_id, count, premium) VALUES (?, ?, ?)',
  );

  const replaceCards = db.transaction(
    (rows: readonly CollectionCard[], lastUpdatedAt: number, cardsHash: string): void => {
      deleteCards.run();
      for (const c of rows) {
        insertCard.run(c.dbfId, c.count, c.premium);
      }
      upsertMeta.run('lastUpdatedAt', String(lastUpdatedAt));
      upsertMeta.run('cardsHash', cardsHash);
    },
  );

  function computeCardsHash(rows: readonly CollectionCard[]): string {
    const sorted = rows
      .slice()
      .sort((a, b) => (a.dbfId !== b.dbfId ? a.dbfId - b.dbfId : a.premium - b.premium));
    return sorted.map((c) => `${c.dbfId}:${c.premium}:${c.count}`).join('|');
  }

  return {
    get(): CollectionSnapshot | null {
      try {
        const meta = selectMeta.get('lastUpdatedAt') as MetaRow | undefined;
        if (meta === undefined) return null;
        const lastUpdatedAt = Number(meta.value);
        if (!Number.isFinite(lastUpdatedAt)) return null;
        const rows = selectCards.all() as CardRow[];
        return {
          lastUpdatedAt,
          cards: rows.map((r) => ({ dbfId: r.dbf_id, count: r.count, premium: r.premium })),
        };
      } catch (err) {
        console.error('[collection-snapshot-store] get failed', err);
        return null;
      }
    },

    save(cards, now): CollectionSnapshot {
      const incomingHash = computeCardsHash(cards);
      const storedHashRow = selectMeta.get('cardsHash') as MetaRow | undefined;
      const storedLastUpdatedAtRow = selectMeta.get('lastUpdatedAt') as MetaRow | undefined;
      const storedLastUpdatedAt = storedLastUpdatedAtRow
        ? Number(storedLastUpdatedAtRow.value)
        : NaN;
      if (
        storedHashRow !== undefined &&
        storedHashRow.value === incomingHash &&
        Number.isFinite(storedLastUpdatedAt)
      ) {
        // No content change — preserve the original "last updated"
        // timestamp so the user-visible value tracks real changes
        // instead of every successful live read.
        return {
          cards: cards.map((c) => ({ ...c })),
          lastUpdatedAt: storedLastUpdatedAt,
        };
      }
      const lastUpdatedAt = now ?? Date.now();
      replaceCards(cards, lastUpdatedAt, incomingHash);
      return {
        cards: cards.map((c) => ({ ...c })),
        lastUpdatedAt,
      };
    },

    close(): void {
      db.close();
    },
  };
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_cards (
      dbf_id INTEGER NOT NULL PRIMARY KEY,
      count INTEGER NOT NULL,
      premium INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collection_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
