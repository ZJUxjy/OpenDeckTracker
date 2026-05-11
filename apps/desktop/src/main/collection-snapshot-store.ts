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
  const selectMetaPair = db.prepare(
    "SELECT key, value FROM collection_meta WHERE key IN ('cardsHash', 'lastUpdatedAt')",
  );
  const selectCards = db.prepare(
    'SELECT dbf_id, count, premium FROM collection_cards ORDER BY dbf_id, premium',
  );
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

  function normalizeCards(rows: readonly CollectionCard[]): CollectionCard[] {
    const byVariant = new Map<string, CollectionCard>();
    for (const card of rows) {
      const key = `${card.dbfId}:${card.premium}`;
      const existing = byVariant.get(key);
      if (existing === undefined) {
        byVariant.set(key, { dbfId: card.dbfId, count: card.count, premium: card.premium });
      } else {
        existing.count += card.count;
      }
    }
    return Array.from(byVariant.values()).sort((a, b) =>
      a.dbfId !== b.dbfId ? a.dbfId - b.dbfId : a.premium - b.premium,
    );
  }

  function hashNormalizedCards(rows: readonly CollectionCard[]): string {
    return rows.map((c) => `${c.dbfId}:${c.premium}:${c.count}`).join('|');
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
      const normalizedCards = normalizeCards(cards);
      const incomingHash = hashNormalizedCards(normalizedCards);
      const metaRows = selectMetaPair.all() as MetaRow[];
      let storedHash: string | undefined;
      let storedLastUpdatedAt = NaN;
      for (const row of metaRows) {
        if (row.key === 'cardsHash') storedHash = row.value;
        else if (row.key === 'lastUpdatedAt') storedLastUpdatedAt = Number(row.value);
      }
      if (
        storedHash !== undefined &&
        storedHash === incomingHash &&
        Number.isFinite(storedLastUpdatedAt)
      ) {
        // No content change — preserve the original "last updated"
        // timestamp so the user-visible value tracks real changes
        // instead of every successful live read.
        return {
          cards: normalizedCards.map((c) => ({ ...c })),
          lastUpdatedAt: storedLastUpdatedAt,
        };
      }
      const lastUpdatedAt = now ?? Date.now();
      replaceCards(normalizedCards, lastUpdatedAt, incomingHash);
      return {
        cards: normalizedCards.map((c) => ({ ...c })),
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
      dbf_id INTEGER NOT NULL,
      count INTEGER NOT NULL,
      premium INTEGER NOT NULL,
      PRIMARY KEY (dbf_id, premium)
    );
    CREATE TABLE IF NOT EXISTS collection_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  migrateCollectionCardsPrimaryKey(db);
}

function migrateCollectionCardsPrimaryKey(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS collection_cards_new');
  const columns = db.pragma('table_info(collection_cards)') as Array<{
    name: string;
    pk: number;
  }>;
  const dbfPk = columns.find((c) => c.name === 'dbf_id')?.pk ?? 0;
  const premiumPk = columns.find((c) => c.name === 'premium')?.pk ?? 0;
  if (dbfPk === 1 && premiumPk === 2) return;

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE collection_cards_new (
        dbf_id INTEGER NOT NULL,
        count INTEGER NOT NULL,
        premium INTEGER NOT NULL,
        PRIMARY KEY (dbf_id, premium)
      );
      INSERT OR REPLACE INTO collection_cards_new(dbf_id, count, premium)
        SELECT dbf_id, SUM(count), premium
        FROM collection_cards
        GROUP BY dbf_id, premium;
      DROP TABLE collection_cards;
      ALTER TABLE collection_cards_new RENAME TO collection_cards;
    `);
  });
  migrate();
}
