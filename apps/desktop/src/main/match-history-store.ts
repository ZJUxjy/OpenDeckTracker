import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  filterMatchesByTime,
  isConstructedMatch,
  type MatchHistoryRecord,
  type NormalizedCompletedMatch,
  type StatsTimeFilter,
} from '@hdt/core';

export interface MatchHistoryQuery {
  filter: StatsTimeFilter;
  limit?: number;
  now?: Date;
}

export interface MatchHistoryStore {
  record(match: NormalizedCompletedMatch): void;
  listRecent(query: MatchHistoryQuery): MatchHistoryRecord[];
  getAllForFilter(query: Pick<MatchHistoryQuery, 'filter' | 'now'>): MatchHistoryRecord[];
  close(): void;
}

interface MatchHistoryRow {
  id: number;
  fingerprint: string;
  started_at: number;
  ended_at: number;
  duration_seconds: number;
  result: MatchHistoryRecord['result'];
  play_order: MatchHistoryRecord['playOrder'];
  deck_id: number | null;
  deck_name: string | null;
  opponent_name: string | null;
  opponent_class: string | null;
  game_type: number;
  format_type: number;
  player_class: string | null;
  source: MatchHistoryRecord['source'];
}

export function createMatchHistoryStore(dbPath: string): MatchHistoryStore {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  initializeSchema(db);

  return {
    record(match) {
      if (!isConstructedMatch(match)) return;
      db.prepare(`
        INSERT OR IGNORE INTO match_history (
          fingerprint,
          started_at,
          ended_at,
          duration_seconds,
          result,
          play_order,
          deck_id,
          deck_name,
          opponent_name,
          opponent_class,
          game_type,
          format_type,
          player_class,
          source
        ) VALUES (
          @fingerprint,
          @startedAt,
          @endedAt,
          @durationSeconds,
          @result,
          @playOrder,
          @deckId,
          @deckName,
          @opponentName,
          @opponentClass,
          @gameType,
          @formatType,
          @playerClass,
          @source
        )
      `).run({ ...match, playerClass: match.playerClass ?? null });
    },

    listRecent(query) {
      return filterMatchesByTime(readAll(db), query)
        .sort((a, b) => b.endedAt - a.endedAt)
        .slice(0, query.limit ?? 5);
    },

    getAllForFilter(query) {
      return filterMatchesByTime(readAll(db), query);
    },

    close() {
      db.close();
    },
  };
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS match_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      result TEXT NOT NULL,
      play_order TEXT NOT NULL,
      deck_id INTEGER,
      deck_name TEXT,
      opponent_name TEXT,
      opponent_class TEXT,
      game_type INTEGER NOT NULL,
      format_type INTEGER NOT NULL,
      source TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_match_history_ended_at
      ON match_history (ended_at DESC);
  `);

  // Idempotent additive migrations. SQLite's `ALTER TABLE ... ADD COLUMN`
  // doesn't support `IF NOT EXISTS`; we guard via `pragma table_info`.
  const existingCols = (db.pragma('table_info(match_history)') as { name: string }[]).map(
    (c) => c.name,
  );
  if (!existingCols.includes('player_class')) {
    db.exec('ALTER TABLE match_history ADD COLUMN player_class TEXT');
  }
}

function readAll(db: Database.Database): MatchHistoryRecord[] {
  const rows = db.prepare('SELECT * FROM match_history ORDER BY ended_at DESC').all() as MatchHistoryRow[];
  return rows.map(rowToRecord);
}

function rowToRecord(row: MatchHistoryRow): MatchHistoryRecord {
  const record: MatchHistoryRecord = {
    id: row.id,
    fingerprint: row.fingerprint,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    result: row.result,
    playOrder: row.play_order,
    deckId: row.deck_id,
    deckName: row.deck_name,
    opponentName: row.opponent_name,
    opponentClass: row.opponent_class,
    gameType: row.game_type,
    formatType: row.format_type,
    source: row.source,
  };
  if (row.player_class !== undefined) {
    record.playerClass = row.player_class;
  }
  return record;
}
