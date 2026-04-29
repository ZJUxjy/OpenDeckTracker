import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeCompletedMatch, type NormalizedCompletedMatch } from '@hdt/core';
import { createMatchHistoryStore } from './match-history-store';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hdt-match-history-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const makeCompletedMatch = (
  overrides: Partial<NormalizedCompletedMatch> = {},
): NormalizedCompletedMatch =>
  normalizeCompletedMatch({
    fingerprint: 'match-a',
    startedAt: Date.parse('2026-04-27T10:00:00Z'),
    endedAt: Date.parse('2026-04-27T10:10:00Z'),
    result: 'win',
    playOrder: 'first',
    deckId: 42,
    deckName: 'Recorded Real Deck',
    opponentName: 'Opponent',
    opponentClass: 'Mage',
    gameType: 3,
    formatType: 2,
    source: 'deck-tracker',
    ...overrides,
  });

describe('match-history-store', () => {
  it('persists and reloads completed matches', () => {
    const dbPath = join(dir, 'stats.sqlite');
    const first = createMatchHistoryStore(dbPath);
    first.record(makeCompletedMatch({ fingerprint: 'a' }));
    first.close();

    const second = createMatchHistoryStore(dbPath);
    expect(second.listRecent({ filter: 'all-time', limit: 5 })).toHaveLength(1);
    expect(second.listRecent({ filter: 'all-time', limit: 5 })[0]).toMatchObject({
      fingerprint: 'a',
      deckName: 'Recorded Real Deck',
    });
    second.close();
  });

  it('deduplicates by fingerprint', () => {
    const store = createMatchHistoryStore(join(dir, 'stats.sqlite'));
    store.record(makeCompletedMatch({ fingerprint: 'same' }));
    store.record(makeCompletedMatch({ fingerprint: 'same' }));

    expect(store.listRecent({ filter: 'all-time', limit: 10 })).toHaveLength(1);
    store.close();
  });

  it('filters unsupported modes before storing', () => {
    const store = createMatchHistoryStore(join(dir, 'stats.sqlite'));
    store.record(makeCompletedMatch({ fingerprint: 'arena', gameType: 5 }));

    expect(store.listRecent({ filter: 'all-time', limit: 10 })).toEqual([]);
    store.close();
  });

  it('persists player_class on new records', () => {
    const store = createMatchHistoryStore(join(dir, 'stats.sqlite'));
    store.record(makeCompletedMatch({ fingerprint: 'p1', playerClass: 'DRUID' }));
    const records = store.listRecent({ filter: 'all-time', limit: 10 });
    expect(records).toHaveLength(1);
    expect(records[0]?.playerClass).toBe('DRUID');
    store.close();
  });

  it('records null player_class when not provided', () => {
    const store = createMatchHistoryStore(join(dir, 'stats.sqlite'));
    store.record(makeCompletedMatch({ fingerprint: 'p2' }));
    const records = store.listRecent({ filter: 'all-time', limit: 10 });
    expect(records[0]?.playerClass).toBe(null);
    store.close();
  });

  it('migrates existing pre-migration databases by adding player_class column', async () => {
    // Build a pre-migration DB by hand (no player_class column).
    const Database = (await import('better-sqlite3')).default;
    const dbPath = join(dir, 'stats.sqlite');
    const raw = new Database(dbPath);
    raw.exec(`
      CREATE TABLE match_history (
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
    `);
    raw.prepare(`
      INSERT INTO match_history (
        fingerprint, started_at, ended_at, duration_seconds, result, play_order,
        deck_id, deck_name, opponent_name, opponent_class, game_type, format_type, source
      ) VALUES ('legacy-row', 0, 0, 0, 'win', 'first', null, 'Legacy Deck', null, null, 3, 2, 'deck-tracker')
    `).run();
    raw.close();

    // Open via createMatchHistoryStore (triggers migration).
    const store = createMatchHistoryStore(dbPath);
    const records = store.listRecent({ filter: 'all-time', limit: 10 });
    expect(records).toHaveLength(1);
    expect(records[0]?.fingerprint).toBe('legacy-row');
    expect(records[0]?.playerClass).toBe(null);

    // New record after migration carries playerClass.
    store.record(makeCompletedMatch({ fingerprint: 'post-migration', playerClass: 'MAGE' }));
    const all = store.listRecent({ filter: 'all-time', limit: 10 });
    const fresh = all.find((r) => r.fingerprint === 'post-migration');
    expect(fresh?.playerClass).toBe('MAGE');
    store.close();
  });
});
