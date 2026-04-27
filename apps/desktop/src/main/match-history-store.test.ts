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
});
