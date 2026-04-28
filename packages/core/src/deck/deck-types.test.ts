import { describe, expect, it } from 'vitest';

import { createDeck, type Deck } from './deck-types';

describe('createDeck', () => {
  it('returns a minimal deck with stable id, empty cards, version 1, and current timestamps', () => {
    const before = Date.now();
    const deck = createDeck({ name: 'My Druid', class: 'DRUID', format: 'Standard' });
    const after = Date.now();

    expect(typeof deck.id).toBe('string');
    expect(deck.id.length).toBeGreaterThan(0);
    expect(deck.name).toBe('My Druid');
    expect(deck.class).toBe('DRUID');
    expect(deck.format).toBe('Standard');
    expect(deck.cards).toEqual([]);
    expect(deck.version).toBe(1);
    expect(deck.notes).toBe('');
    expect(deck.tags).toEqual([]);
    expect(deck.coverCardId).toBeUndefined();
    expect(deck.sortIndex).toBeUndefined();
    expect(deck.createdAt).toBeGreaterThanOrEqual(before);
    expect(deck.createdAt).toBeLessThanOrEqual(after);
    expect(deck.updatedAt).toBe(deck.createdAt);
  });

  it('survives structuredClone with deep equality', () => {
    const deck = createDeck({
      name: 'Cloned Mage',
      class: 'MAGE',
      format: 'Wild',
      id: 'd-fixed-1',
      now: 1_700_000_000_000,
      cards: [
        { cardId: 'EX1_561', count: 2 },
        { cardId: 'EX1_383', count: 1 },
      ],
      notes: 'A note',
      tags: ['tempo', 'casual'],
    });

    const cloned: Deck = structuredClone(deck);
    expect(cloned).toEqual(deck);
    expect(cloned).not.toBe(deck);
  });

  it('produces a unique id on consecutive calls when none is provided', () => {
    const a = createDeck({ name: 'A', class: 'DRUID', format: 'Standard' });
    const b = createDeck({ name: 'B', class: 'DRUID', format: 'Standard' });
    expect(a.id).not.toBe(b.id);
  });

  it('honors caller-provided id and now', () => {
    const deck = createDeck({
      name: 'Fixed',
      class: 'PALADIN',
      format: 'Standard',
      id: 'd-explicit-1',
      now: 1_650_000_000_000,
    });
    expect(deck.id).toBe('d-explicit-1');
    expect(deck.createdAt).toBe(1_650_000_000_000);
    expect(deck.updatedAt).toBe(1_650_000_000_000);
  });
});
