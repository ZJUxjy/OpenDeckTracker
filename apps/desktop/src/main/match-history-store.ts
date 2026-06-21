import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openWithIntegrityGuard } from './db/open-with-recovery';
import {
  classifyMatchMode,
  filterMatchesByTime,
  type MatchHistoryRecord,
  type MatchMode,
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
  mission_id: number | null;
  match_mode: MatchMode | null;
  player_class: string | null;
  saved_deck_id: string | null;
  saved_deck_version: number | null;
  source: MatchHistoryRecord['source'];
}

export function createMatchHistoryStore(dbPath: string): MatchHistoryStore {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openWithIntegrityGuard(dbPath);
  initializeSchema(db);

  const insertStmt = db.prepare(`
    INSERT INTO match_history (
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
      mission_id,
      match_mode,
      player_class,
      saved_deck_id,
      saved_deck_version,
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
      @missionId,
      @matchMode,
      @playerClass,
      @savedDeckId,
      @savedDeckVersion,
      @source
    )
  `);

  const selectByFingerprintStmt = db.prepare(
    'SELECT * FROM match_history WHERE fingerprint = ?',
  );

  const updateStmt = db.prepare(`
    UPDATE match_history SET
      result = @result,
      play_order = @playOrder,
      deck_id = @deckId,
      deck_name = @deckName,
      opponent_name = @opponentName,
      opponent_class = @opponentClass,
      player_class = @playerClass,
      saved_deck_id = @savedDeckId,
      saved_deck_version = @savedDeckVersion,
      mission_id = @missionId,
      match_mode = @matchMode
    WHERE fingerprint = @fingerprint
  `);

  return {
    record(match) {
      const matchMode = match.matchMode ?? classifyMatchMode(match);
      if (matchMode === null) return;
      const incoming = {
        fingerprint: match.fingerprint,
        startedAt: match.startedAt,
        endedAt: match.endedAt,
        durationSeconds: match.durationSeconds,
        result: match.result,
        playOrder: match.playOrder,
        deckId: match.deckId,
        deckName: match.deckName,
        opponentName: match.opponentName,
        opponentClass: match.opponentClass,
        gameType: match.gameType,
        formatType: match.formatType,
        missionId: match.missionId ?? null,
        matchMode,
        playerClass: match.playerClass ?? null,
        savedDeckId: match.savedDeckId ?? null,
        savedDeckVersion: match.savedDeckVersion ?? null,
        source: match.source,
      };

      const existing = selectByFingerprintStmt.get(match.fingerprint) as
        | MatchHistoryRow
        | undefined;
      if (existing === undefined) {
        insertStmt.run(incoming);
        return;
      }

      const merged = {
        fingerprint: incoming.fingerprint,
        result: pickResult(existing.result, incoming.result),
        playOrder: pickPlayOrder(existing.play_order, incoming.playOrder),
        deckId: pickNonNull(existing.deck_id, incoming.deckId),
        deckName: pickNonNull(existing.deck_name, incoming.deckName),
        opponentName: pickNonNull(existing.opponent_name, incoming.opponentName),
        opponentClass: pickNonNull(existing.opponent_class, incoming.opponentClass),
        playerClass: pickNonNull(existing.player_class, incoming.playerClass),
        savedDeckId: pickNonNull(existing.saved_deck_id, incoming.savedDeckId),
        savedDeckVersion: pickNonNull(existing.saved_deck_version, incoming.savedDeckVersion),
        missionId: pickNonNull(existing.mission_id, incoming.missionId),
        matchMode: existing.match_mode ?? incoming.matchMode,
      };
      updateStmt.run(merged);
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
      mission_id INTEGER,
      match_mode TEXT,
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
  if (!existingCols.includes('saved_deck_id')) {
    db.exec('ALTER TABLE match_history ADD COLUMN saved_deck_id TEXT');
  }
  if (!existingCols.includes('saved_deck_version')) {
    db.exec('ALTER TABLE match_history ADD COLUMN saved_deck_version INTEGER');
  }
  if (!existingCols.includes('mission_id')) {
    db.exec('ALTER TABLE match_history ADD COLUMN mission_id INTEGER');
  }
  if (!existingCols.includes('match_mode')) {
    db.exec('ALTER TABLE match_history ADD COLUMN match_mode TEXT');
  }
  db.exec(`
    UPDATE match_history
    SET match_mode = CASE
      WHEN mission_id IS NOT NULL AND mission_id > 0 THEN 'adventure'
      WHEN game_type = 3 THEN 'ranked'
      WHEN game_type = 4 THEN 'casual'
      ELSE match_mode
    END
    WHERE match_mode IS NULL
  `);
}

function readAll(db: Database.Database): MatchHistoryRecord[] {
  const rows = db.prepare('SELECT * FROM match_history ORDER BY ended_at DESC').all() as MatchHistoryRow[];
  return rows.flatMap((row) => {
    const record = rowToRecord(row);
    return record === null ? [] : [record];
  });
}

function rowToRecord(row: MatchHistoryRow): MatchHistoryRecord | null {
  const missionId = row.mission_id ?? undefined;
  const matchMode =
    row.match_mode ??
    classifyMatchMode({
      gameType: row.game_type,
      formatType: row.format_type,
      ...(missionId !== undefined ? { missionId } : {}),
    });
  if (matchMode === null) return null;
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
    ...(missionId !== undefined ? { missionId } : {}),
    matchMode,
    source: row.source,
  };
  if (row.player_class !== undefined) {
    record.playerClass = row.player_class;
  }
  if (row.saved_deck_id !== null && row.saved_deck_id !== undefined) {
    record.savedDeckId = row.saved_deck_id;
  }
  if (row.saved_deck_version !== null && row.saved_deck_version !== undefined) {
    record.savedDeckVersion = row.saved_deck_version;
  }
  return record;
}

function pickResult(
  existing: MatchHistoryRecord['result'],
  incoming: MatchHistoryRecord['result'],
): MatchHistoryRecord['result'] {
  if (existing !== 'unknown') return existing;
  return incoming;
}

function pickPlayOrder(
  existing: MatchHistoryRecord['playOrder'],
  incoming: MatchHistoryRecord['playOrder'],
): MatchHistoryRecord['playOrder'] {
  if (existing !== 'unknown') return existing;
  return incoming;
}

function pickNonNull<T>(existing: T | null | undefined, incoming: T | null | undefined): T | null {
  if (existing !== null && existing !== undefined) return existing;
  if (incoming !== null && incoming !== undefined) return incoming;
  return null;
}
