import Database from 'better-sqlite3';
import { mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  type Deck,
  type DeckCard,
  type DeckDetail,
  type DeckSource,
  type DeckSummary,
  type DeckVersion,
  type Format,
  type HeroClass,
  type CreateDeckInput,
  type UpdateDeckPatch,
  canonicalCardListHash,
  areCardListsEqual,
} from '@hdt/core';

export type { Deck, DeckCard, DeckDetail, DeckSummary, DeckVersion } from '@hdt/core';

export class NonCollectibleSnapshotError extends Error {
  override name = 'NonCollectibleSnapshotError' as const;
  constructor(public readonly cardIds: string[]) {
    super(
      `NonCollectibleSnapshotError: live deck contains non-collectible cards: ${cardIds.join(', ')}`,
    );
  }
}

export interface LiveDeckSnapshotInput {
  name: string;
  class: HeroClass;
  format: Format;
  cards: DeckCard[];
  /**
   * Hearthstone numeric deck id from `hearthmirror.getDecks()`. When
   * provided, `saveFromLive` will treat the resulting record as
   * `source: 'hearthstone-live'` and the deck-sync-service can later
   * upsert against it without creating duplicates.
   */
  liveDeckId?: number | null;
}

export interface SaveFromLiveCardInfo {
  collectible: boolean;
  /**
   * Some valid constructed deck components are not individually collectible
   * in CardDb. Fabled bundle cards are the current example: Hearthstone's
   * live deck list includes them as real deck slots even though collection
   * ownership is attached to the parent Fabled card.
   */
  validInLiveDeck?: boolean;
}

export interface SaveFromLiveCardLookup {
  (cardId: string): SaveFromLiveCardInfo | null;
}

export interface DeckStore {
  list(): DeckSummary[];
  getById(id: string): DeckDetail | null;
  create(input: CreateDeckInput): DeckDetail;
  update(id: string, patch: UpdateDeckPatch): DeckDetail;
  duplicate(id: string): DeckDetail;
  delete(id: string): void;
  setSortIndex(id: string, sortIndex: number): void;
  saveFromLive(live: LiveDeckSnapshotInput, lookup: SaveFromLiveCardLookup): DeckDetail;
  /**
   * Look up a live-synced deck by its Hearthstone deck id. Used by the
   * deck-sync-service to decide upsert vs insert. Returns `null` if no
   * matching `source: 'hearthstone-live'` record exists.
   */
  findByLiveDeckId(liveDeckId: number): DeckDetail | null;
  listVersions(id: string): DeckVersion[];
  schemaVersion(): number;
  getActiveDeckId(): string | null;
  setActiveDeckId(id: string | null): void;
  close(): void;
}

interface DeckRow {
  id: string;
  name: string;
  class: HeroClass;
  format: Format;
  version: number;
  notes: string;
  tags_json: string;
  cover_card_id: string | null;
  sort_index: number | null;
  created_at: number;
  updated_at: number;
  source: DeckSource | null;
  live_deck_id: number | null;
}

interface DeckCardRow {
  card_id: string;
  count: number;
}

interface DeckVersionRow {
  deck_id: string;
  version: number;
  card_list_hash: string;
  created_at: number;
}

interface DeckVersionCardRow {
  deck_id: string;
  version: number;
  card_id: string;
  count: number;
}

const SCHEMA_VERSION = 1;

export function createDeckStore(dbPath: string): DeckStore {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openWithIntegrityGuard(dbPath);
  initializeSchema(db);

  function summaryFromRow(row: DeckRow, cardCount: number): DeckSummary {
    const summary: DeckSummary = {
      id: row.id,
      name: row.name,
      class: row.class,
      format: row.format,
      version: row.version,
      cardCount,
      updatedAt: row.updated_at,
    };
    if (row.cover_card_id !== null) summary.coverCardId = row.cover_card_id;
    if (row.sort_index !== null) summary.sortIndex = row.sort_index;
    if (row.source !== null) summary.source = row.source;
    if (row.live_deck_id !== null) summary.liveDeckId = row.live_deck_id;
    return summary;
  }

  function detailFromRow(row: DeckRow, cards: DeckCard[]): DeckDetail {
    const detail: DeckDetail = {
      id: row.id,
      name: row.name,
      class: row.class,
      format: row.format,
      version: row.version,
      cards,
      notes: row.notes,
      tags: JSON.parse(row.tags_json) as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (row.cover_card_id !== null) detail.coverCardId = row.cover_card_id;
    if (row.sort_index !== null) detail.sortIndex = row.sort_index;
    if (row.source !== null) detail.source = row.source;
    if (row.live_deck_id !== null) detail.liveDeckId = row.live_deck_id;
    return detail;
  }

  function loadCards(id: string): DeckCard[] {
    const rows = db
      .prepare<[string]>(`SELECT card_id, count FROM deck_cards WHERE deck_id = ? ORDER BY card_id`)
      .all(id) as DeckCardRow[];
    return rows.map((r) => ({ cardId: r.card_id, count: r.count }));
  }

  function deckFromId(id: string): DeckDetail | null {
    const row = db
      .prepare<[string]>(`SELECT * FROM decks WHERE id = ?`)
      .get(id) as DeckRow | undefined;
    if (!row) return null;
    return detailFromRow(row, loadCards(id));
  }

  function findByLiveDeckIdInternal(liveDeckId: number): DeckDetail | null {
    const row = db
      .prepare<[number]>(
        `SELECT * FROM decks WHERE source = 'hearthstone-live' AND live_deck_id = ? LIMIT 1`,
      )
      .get(liveDeckId) as DeckRow | undefined;
    if (!row) return null;
    return detailFromRow(row, loadCards(row.id));
  }

  function findLiveSyncedDecksByFingerprint(
    classCode: HeroClass,
    format: Format,
    cardListHash: string,
  ): DeckDetail[] {
    const rows = db
      .prepare<[HeroClass, Format]>(
        `SELECT * FROM decks WHERE source = 'hearthstone-live' AND class = ? AND format = ?`,
      )
      .all(classCode, format) as DeckRow[];
    const matches: DeckDetail[] = [];
    for (const row of rows) {
      const cards = loadCards(row.id);
      if (canonicalCardListHash(cards) === cardListHash) {
        matches.push(detailFromRow(row, cards));
      }
    }
    return matches;
  }

  function updateLiveSyncedDeck(existing: DeckDetail, live: LiveDeckSnapshotInput): DeckDetail {
    const now = Date.now();
    let version = existing.version;
    if (!areCardListsEqual(existing.cards, live.cards)) {
      version = existing.version + 1;
      writeVersionRow(existing.id, version, live.cards, now);
    }
    writeDeckCards(existing.id, live.cards);
    db.prepare(
      `UPDATE decks SET name = @name, class = @class, format = @format, version = @version, updated_at = @now WHERE id = @id`,
    ).run({
      id: existing.id,
      name: live.name,
      class: live.class,
      format: live.format,
      version,
      now,
    });
    return deckFromId(existing.id)!;
  }

  function writeDeckCards(deckId: string, cards: DeckCard[]): void {
    db.prepare<[string]>(`DELETE FROM deck_cards WHERE deck_id = ?`).run(deckId);
    const insert = db.prepare<[string, string, number]>(
      `INSERT INTO deck_cards (deck_id, card_id, count) VALUES (?, ?, ?)`,
    );
    for (const c of cards) insert.run(deckId, c.cardId, c.count);
  }

  function writeVersionRow(deckId: string, version: number, cards: DeckCard[], now: number): void {
    const hash = canonicalCardListHash(cards);
    db.prepare<[string, number, string, number]>(
      `INSERT INTO deck_versions (deck_id, version, card_list_hash, created_at) VALUES (?, ?, ?, ?)`,
    ).run(deckId, version, hash, now);
    const insertCard = db.prepare<[string, number, string, number]>(
      `INSERT INTO deck_version_cards (deck_id, version, card_id, count) VALUES (?, ?, ?, ?)`,
    );
    for (const c of cards) insertCard.run(deckId, version, c.cardId, c.count);
  }

  function insertDeck(
    input: CreateDeckInput,
    override: {
      id?: string;
      now?: number;
      source?: DeckSource;
      liveDeckId?: number | null;
    } = {},
  ): DeckDetail {
    const now = override.now ?? Date.now();
    const id = override.id ?? randomUUID();
    const cards = (input.cards ?? []).map((c) => ({ ...c }));
    const tagsJson = JSON.stringify(input.tags ?? []);
    db.prepare(
      `INSERT INTO decks (id, name, class, format, version, notes, tags_json, cover_card_id, sort_index, created_at, updated_at, source, live_deck_id)
       VALUES (@id, @name, @class, @format, 1, @notes, @tags, @cover, NULL, @now, @now, @source, @liveDeckId)`,
    ).run({
      id,
      name: input.name,
      class: input.class,
      format: input.format,
      notes: input.notes ?? '',
      tags: tagsJson,
      cover: input.coverCardId ?? null,
      source: override.source ?? null,
      liveDeckId: override.liveDeckId ?? null,
      now,
    });
    writeDeckCards(id, cards);
    writeVersionRow(id, 1, cards, now);
    return deckFromId(id)!;
  }

  function getActiveDeckId(): string | null {
    const row = db.prepare<[string]>(`SELECT value FROM app_meta WHERE key = ?`).get('activeDeckId') as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  }

  function setActiveDeckId(id: string | null): void {
    if (id === null) {
      db.prepare<[string]>(`DELETE FROM app_meta WHERE key = ?`).run('activeDeckId');
      return;
    }
    db.prepare<[string, string]>(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run('activeDeckId', id);
  }

  return {
    list(): DeckSummary[] {
      const rows = db.prepare(`SELECT * FROM decks`).all() as DeckRow[];
      const counts = db
        .prepare(`SELECT deck_id, COALESCE(SUM(count), 0) AS total FROM deck_cards GROUP BY deck_id`)
        .all() as { deck_id: string; total: number }[];
      const countMap = new Map(counts.map((c) => [c.deck_id, c.total]));
      return rows
        .map((r) => summaryFromRow(r, countMap.get(r.id) ?? 0))
        .sort((a, b) => {
          const ai = a.sortIndex ?? Number.MAX_SAFE_INTEGER;
          const bi = b.sortIndex ?? Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
          if (a.class !== b.class) return a.class < b.class ? -1 : 1;
          return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        });
    },

    getById(id) {
      return deckFromId(id);
    },

    create(input) {
      const tx = db.transaction((args: CreateDeckInput) => insertDeck(args));
      return tx(input);
    },

    update(id, patch) {
      const tx = db.transaction((args: { id: string; patch: UpdateDeckPatch }) => {
        const current = deckFromId(args.id);
        if (!current) {
          throw new Error(`update: deck not found: ${args.id}`);
        }
        const now = Date.now();
        let version = current.version;
        let cards = current.cards;
        if (args.patch.cards !== undefined) {
          if (!areCardListsEqual(current.cards, args.patch.cards)) {
            version = current.version + 1;
            writeVersionRow(args.id, version, args.patch.cards, now);
          }
          cards = args.patch.cards.map((c) => ({ ...c }));
          writeDeckCards(args.id, cards);
        }
        const setClauses: string[] = ['updated_at = @now', 'version = @version'];
        const bind: Record<string, unknown> = { id: args.id, now, version };
        if (args.patch.name !== undefined) {
          setClauses.push('name = @name');
          bind.name = args.patch.name;
        }
        if (args.patch.class !== undefined) {
          setClauses.push('class = @class');
          bind.class = args.patch.class;
        }
        if (args.patch.format !== undefined) {
          setClauses.push('format = @format');
          bind.format = args.patch.format;
        }
        if (args.patch.notes !== undefined) {
          setClauses.push('notes = @notes');
          bind.notes = args.patch.notes;
        }
        if (args.patch.tags !== undefined) {
          setClauses.push('tags_json = @tags');
          bind.tags = JSON.stringify(args.patch.tags);
        }
        if (args.patch.coverCardId !== undefined) {
          setClauses.push('cover_card_id = @cover');
          bind.cover = args.patch.coverCardId;
        }
        if (args.patch.sortIndex !== undefined) {
          setClauses.push('sort_index = @sortIndex');
          bind.sortIndex = args.patch.sortIndex;
        }
        db.prepare(`UPDATE decks SET ${setClauses.join(', ')} WHERE id = @id`).run(bind);
      });
      tx({ id, patch });
      return deckFromId(id)!;
    },

    duplicate(id) {
      const source = deckFromId(id);
      if (!source) {
        throw new Error(`duplicate: deck not found: ${id}`);
      }
      const tx = db.transaction(() =>
        insertDeck({
          name: `${source.name} (copy)`,
          class: source.class,
          format: source.format,
          cards: source.cards,
          notes: source.notes,
          tags: source.tags,
          ...(source.coverCardId !== undefined ? { coverCardId: source.coverCardId } : {}),
        }),
      );
      return tx();
    },

    delete(id) {
      const tx = db.transaction((deckId: string) => {
        db.prepare(`DELETE FROM deck_version_cards WHERE deck_id = ?`).run(deckId);
        db.prepare(`DELETE FROM deck_versions WHERE deck_id = ?`).run(deckId);
        db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).run(deckId);
        db.prepare(`DELETE FROM decks WHERE id = ?`).run(deckId);
      });
      tx(id);
    },

    setSortIndex(id, sortIndex) {
      db.prepare(`UPDATE decks SET sort_index = ?, updated_at = ? WHERE id = ?`).run(
        sortIndex,
        Date.now(),
        id,
      );
    },

    saveFromLive(live, lookup) {
      const offenders: string[] = [];
      for (const c of live.cards) {
        const info = lookup(c.cardId);
        if (!info || (!info.collectible && info.validInLiveDeck !== true)) {
          offenders.push(c.cardId);
        }
      }
      if (offenders.length > 0) throw new NonCollectibleSnapshotError(offenders);
      const hasLiveId = live.liveDeckId !== undefined && live.liveDeckId !== null;
      const tx = db.transaction(() => {
        if (hasLiveId) {
          const liveDeckId = live.liveDeckId as number;
          const existing = findByLiveDeckIdInternal(liveDeckId);
          if (existing !== null) {
            return updateLiveSyncedDeck(existing, live);
          }
          // Hearthstone may assign a new deck id for the same content
          // (rename, clone, delete + re-import). Fall back to a
          // (class, format, card-list hash) lookup against existing
          // live-synced rows so the local row adopts the new live id
          // instead of duplicating. Only act on an unambiguous single
          // match — multiple matches fall through to insert.
          const fingerprint = canonicalCardListHash(live.cards);
          const matches = findLiveSyncedDecksByFingerprint(
            live.class,
            live.format,
            fingerprint,
          );
          if (matches.length === 1) {
            const target = matches[0]!;
            db.prepare<[number, string]>(
              `UPDATE decks SET live_deck_id = ? WHERE id = ?`,
            ).run(liveDeckId, target.id);
            const reloaded = deckFromId(target.id)!;
            return updateLiveSyncedDeck(reloaded, live);
          }
        }
        return insertDeck(
          {
            name: live.name,
            class: live.class,
            format: live.format,
            cards: live.cards,
          },
          hasLiveId
            ? {
                source: 'hearthstone-live',
                liveDeckId: live.liveDeckId as number,
              }
            : {},
        );
      });
      return tx();
    },

    findByLiveDeckId(liveDeckId) {
      return findByLiveDeckIdInternal(liveDeckId);
    },

    listVersions(id) {
      const rows = db
        .prepare<[string]>(
          `SELECT deck_id, version, card_list_hash, created_at FROM deck_versions WHERE deck_id = ? ORDER BY version`,
        )
        .all(id) as DeckVersionRow[];
      return rows.map((r) => {
        const cards = db
          .prepare<[string, number]>(
            `SELECT card_id, count FROM deck_version_cards WHERE deck_id = ? AND version = ? ORDER BY card_id`,
          )
          .all(r.deck_id, r.version) as DeckVersionCardRow[];
        return {
          deckId: r.deck_id,
          version: r.version,
          cards: cards.map((c) => ({ cardId: c.card_id, count: c.count })),
          cardListHash: r.card_list_hash,
          createdAt: r.created_at,
        };
      });
    },

    schemaVersion() {
      const row = db.prepare(`SELECT version FROM schema_version LIMIT 1`).get() as
        | { version: number }
        | undefined;
      return row?.version ?? 0;
    },

    getActiveDeckId,
    setActiveDeckId,

    close() {
      db.close();
    },
  };
}

function openWithIntegrityGuard(dbPath: string): Database.Database {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath);
    const row = db.pragma('integrity_check', { simple: true }) as string;
    if (row !== 'ok') {
      db.close();
      db = null;
      moveCorruptAside(dbPath);
      db = new Database(dbPath);
    }
  } catch {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      db = null;
    }
    moveCorruptAside(dbPath);
    db = new Database(dbPath);
  }
  db.pragma('journal_mode = WAL');
  return db;
}

function moveCorruptAside(dbPath: string): void {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    renameSync(dbPath, `${dbPath.replace(/\.db$/, '')}.corrupt-${ts}.db`);
  } catch {
    // already gone or unreadable; allow fresh open
  }
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      class TEXT NOT NULL,
      format TEXT NOT NULL,
      version INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      cover_card_id TEXT,
      sort_index INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deck_cards (
      deck_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (deck_id, card_id),
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS deck_versions (
      deck_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      card_list_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (deck_id, version),
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS deck_version_cards (
      deck_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      card_id TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (deck_id, version, card_id),
      FOREIGN KEY (deck_id, version) REFERENCES deck_versions(deck_id, version) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const existing = db.prepare(`SELECT version FROM schema_version LIMIT 1`).get() as
    | { version: number }
    | undefined;
  if (!existing) {
    db.prepare(`INSERT INTO schema_version (version) VALUES (?)`).run(SCHEMA_VERSION);
  }

  const existingDeckCols = (db.pragma('table_info(decks)') as { name: string }[]).map(
    (c) => c.name,
  );
  if (!existingDeckCols.includes('source')) {
    db.exec(`ALTER TABLE decks ADD COLUMN source TEXT`);
  }
  if (!existingDeckCols.includes('live_deck_id')) {
    db.exec(`ALTER TABLE decks ADD COLUMN live_deck_id INTEGER`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_decks_live_deck_id ON decks(source, live_deck_id) WHERE source = 'hearthstone-live'`,
    );
  }
}
