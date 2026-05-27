import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PopularDeck } from '@hdt/core';
import { loadCache, saveCache, SYNCED_FILENAME, SYNCED_TMP_FILENAME } from './storage';

const VALID_DECK: PopularDeck = {
  id: 'tempo-rogue-1',
  name: 'Tempo Rogue',
  class: 'ROGUE',
  format: 'Standard',
  archetype: 'Tempo',
  deckstring: 'AAEC...',
  winratePercent: 50.2,
  gamesCount: 100,
  author: 'hsguru',
  updatedAt: '2026-05-09',
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pds-storage-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('loadCache', () => {
  it('returns null when the file is absent', async () => {
    expect(await loadCache(dir)).toBeNull();
  });

  it('returns null when the JSON is corrupt', async () => {
    writeFileSync(join(dir, SYNCED_FILENAME), 'not json {{{');
    expect(await loadCache(dir)).toBeNull();
  });

  it('returns null when the schemaVersion is unsupported', async () => {
    writeFileSync(
      join(dir, SYNCED_FILENAME),
      JSON.stringify({ schemaVersion: 3, fetchedAt: '2026-05-09T00:00:00Z', decks: [VALID_DECK] }),
    );
    expect(await loadCache(dir)).toBeNull();
  });

  it('returns null when any deck fails the shape check', async () => {
    writeFileSync(
      join(dir, SYNCED_FILENAME),
      JSON.stringify({
        schemaVersion: 1,
        fetchedAt: '2026-05-09T00:00:00Z',
        decks: [VALID_DECK, { ...VALID_DECK, gamesCount: 'lots' }],
      }),
    );
    expect(await loadCache(dir)).toBeNull();
  });

  it('returns null when decks array is empty', async () => {
    writeFileSync(
      join(dir, SYNCED_FILENAME),
      JSON.stringify({ schemaVersion: 1, fetchedAt: '2026-05-09T00:00:00Z', decks: [] }),
    );
    expect(await loadCache(dir)).toBeNull();
  });

  it('reads back a snapshot saved via saveCache', async () => {
    const snapshot = {
      schemaVersion: 1 as const,
      fetchedAt: '2026-05-09T12:00:00Z',
      decks: [VALID_DECK],
    };
    await saveCache(dir, snapshot);
    const loaded = await loadCache(dir);
    expect(loaded).toEqual(snapshot);
  });

  it('loads legacy schema v1 snapshots without class matchups', async () => {
    const snapshot = {
      schemaVersion: 1,
      fetchedAt: '2026-05-09T00:00:00Z',
      decks: [VALID_DECK],
    };
    writeFileSync(join(dir, SYNCED_FILENAME), JSON.stringify(snapshot));
    expect(await loadCache(dir)).toEqual(snapshot);
  });

  it('reads back schema v2 snapshots with class matchups', async () => {
    const deckWithMatchups: PopularDeck = {
      ...VALID_DECK,
      classMatchups: [
        { opponentClass: 'MAGE', winratePercent: 60, gamesCount: 10, popularityPercent: 20 },
      ],
    };
    const snapshot = {
      schemaVersion: 2 as const,
      fetchedAt: '2026-05-09T12:00:00Z',
      decks: [deckWithMatchups],
    };
    await saveCache(dir, snapshot);
    expect(await loadCache(dir)).toEqual(snapshot);
  });

  it('returns null when classMatchups have invalid shape', async () => {
    writeFileSync(
      join(dir, SYNCED_FILENAME),
      JSON.stringify({
        schemaVersion: 2,
        fetchedAt: '2026-05-09T00:00:00Z',
        decks: [
          {
            ...VALID_DECK,
            classMatchups: [{ opponentClass: 'MAGE', winratePercent: 'great' }],
          },
        ],
      }),
    );
    expect(await loadCache(dir)).toBeNull();
  });
});

describe('saveCache', () => {
  it('writes synced.json atomically (tmp removed after rename)', async () => {
    await saveCache(dir, {
      schemaVersion: 2,
      fetchedAt: '2026-05-09T00:00:00Z',
      decks: [VALID_DECK],
    });
    expect(existsSync(join(dir, SYNCED_FILENAME))).toBe(true);
    expect(existsSync(join(dir, SYNCED_TMP_FILENAME))).toBe(false);
  });

  it('creates the directory if missing', async () => {
    const nested = join(dir, 'nested', 'subdir');
    await saveCache(nested, {
      schemaVersion: 2,
      fetchedAt: '2026-05-09T00:00:00Z',
      decks: [VALID_DECK],
    });
    expect(existsSync(join(nested, SYNCED_FILENAME))).toBe(true);
  });

  it('orphaned tmp from prior crash does not corrupt subsequent loads', async () => {
    // Simulate "process died after writing tmp but before rename": a
    // bogus tmp exists alongside the real synced.json. loadCache should
    // ignore the tmp file entirely.
    const goodSnapshot = {
      schemaVersion: 1 as const,
      fetchedAt: '2026-05-09T00:00:00Z',
      decks: [VALID_DECK],
    };
    await saveCache(dir, goodSnapshot);
    writeFileSync(join(dir, SYNCED_TMP_FILENAME), 'corrupt tmp data');
    const loaded = await loadCache(dir);
    expect(loaded).toEqual(goodSnapshot);
    // Sanity: original file is intact on disk
    const onDisk = JSON.parse(readFileSync(join(dir, SYNCED_FILENAME), 'utf-8'));
    expect(onDisk).toEqual(goodSnapshot);
  });
});
