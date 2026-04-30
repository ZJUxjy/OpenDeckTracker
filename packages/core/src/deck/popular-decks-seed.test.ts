import { describe, expect, it } from 'vitest';
import { decodeDeck, DeckFormat } from '@hdt/hearthdb';
import { POPULAR_DECKS_SEED } from './popular-decks-seed';

describe('POPULAR_DECKS_SEED', () => {
  it('contains 12-20 entries', () => {
    expect(POPULAR_DECKS_SEED.length).toBeGreaterThanOrEqual(12);
    expect(POPULAR_DECKS_SEED.length).toBeLessThanOrEqual(20);
  });

  it('every deckstring decodes cleanly', () => {
    for (const entry of POPULAR_DECKS_SEED) {
      expect(() => decodeDeck(entry.deckstring), `entry ${entry.id}`).not.toThrow();
    }
  });

  it('decoded format matches declared format', () => {
    const expectFmt: Record<string, number> = {
      Standard: DeckFormat.Standard,
      Wild: DeckFormat.Wild,
      Classic: DeckFormat.Classic,
      Twist: DeckFormat.Twist,
    };
    for (const entry of POPULAR_DECKS_SEED) {
      const decoded = decodeDeck(entry.deckstring);
      expect(decoded.format, `entry ${entry.id}`).toBe(expectFmt[entry.format]);
    }
  });

  it('every entry has a unique id', () => {
    const ids = POPULAR_DECKS_SEED.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('winratePercent is in [0, 100]', () => {
    for (const e of POPULAR_DECKS_SEED) {
      expect(e.winratePercent).toBeGreaterThanOrEqual(0);
      expect(e.winratePercent).toBeLessThanOrEqual(100);
    }
  });

  it('gamesCount is a non-negative integer', () => {
    for (const e of POPULAR_DECKS_SEED) {
      expect(Number.isInteger(e.gamesCount)).toBe(true);
      expect(e.gamesCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('represents at least 6 distinct classes and 3 distinct archetypes', () => {
    const classes = new Set(POPULAR_DECKS_SEED.map((d) => d.class));
    const archetypes = new Set(POPULAR_DECKS_SEED.map((d) => d.archetype));
    expect(classes.size).toBeGreaterThanOrEqual(6);
    expect(archetypes.size).toBeGreaterThanOrEqual(3);
  });
});
