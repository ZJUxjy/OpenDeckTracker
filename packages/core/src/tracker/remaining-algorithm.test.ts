import { describe, expect, it } from 'vitest';
import { DeckSnapshot } from '../game/deck-snapshot';
import { Entity } from '../game/entity';
import { computeRemaining, gatherSeenEntities } from './remaining-algorithm';
import { Player } from '../game/player';

const e = (entityId: number, cardId: string, zone: 'HAND' | 'PLAY' | 'GRAVEYARD' | 'DECK' | 'SECRET', controllerId = 1): Entity =>
  new Entity({ entityId, cardId, zone, controllerId });

describe('computeRemaining', () => {
  it('empty seen → remaining equals original, no extras', () => {
    const original = DeckSnapshot.fromDeckCards([
      { cardId: 'A', count: 2 },
      { cardId: 'B', count: 2 },
      { cardId: 'C', count: 1 },
    ]);
    const result = computeRemaining({
      originalDeck: original,
      seenEntities: [],
      deckEntities: [],
      localControllerId: 1,
    });
    expect(result.remaining.total()).toBe(5);
    expect(result.extras).toEqual([]);
  });

  it('mid-match seen → remaining shrinks by exact multiset', () => {
    const original = DeckSnapshot.fromDeckCards([
      { cardId: 'A', count: 2 },
      { cardId: 'B', count: 2 },
    ]);
    const result = computeRemaining({
      originalDeck: original,
      seenEntities: [e(1, 'A', 'HAND'), e(2, 'B', 'PLAY')],
      deckEntities: [],
      localControllerId: 1,
    });
    expect(result.remaining.countOf('A')).toBe(1);
    expect(result.remaining.countOf('B')).toBe(1);
    expect(result.remaining.total()).toBe(2);
    expect(result.extras).toEqual([]);
  });

  it('stolen card (cardId not in original) surfaces as extra, no remaining mutation', () => {
    const original = DeckSnapshot.fromDeckCards([{ cardId: 'A', count: 1 }]);
    const result = computeRemaining({
      originalDeck: original,
      seenEntities: [e(1, 'STOLEN', 'PLAY')],
      deckEntities: [],
      localControllerId: 1,
    });
    expect(result.remaining.countOf('A')).toBe(1);
    expect(result.remaining.countOf('STOLEN')).toBe(0);
    expect(result.extras).toEqual([{ cardId: 'STOLEN', count: 1 }]);
  });

  it('face-down entities (empty cardId) are ignored', () => {
    const original = DeckSnapshot.fromDeckCards([{ cardId: 'A', count: 2 }]);
    const result = computeRemaining({
      originalDeck: original,
      seenEntities: [e(1, '', 'DECK'), e(2, 'A', 'HAND')],
      deckEntities: [],
      localControllerId: 1,
    });
    expect(result.remaining.countOf('A')).toBe(1);
  });

  it('opposing-controller entities are ignored', () => {
    const original = DeckSnapshot.fromDeckCards([{ cardId: 'A', count: 2 }]);
    const result = computeRemaining({
      originalDeck: original,
      seenEntities: [e(1, 'A', 'HAND', 2 /* opponent */), e(2, 'A', 'HAND', 1)],
      deckEntities: [],
      localControllerId: 1,
    });
    expect(result.remaining.countOf('A')).toBe(1);
  });

  it('entities flagged info.created=true are ignored (M3-ready)', () => {
    const original = DeckSnapshot.fromDeckCards([{ cardId: 'A', count: 2 }]);
    const created = new Entity({ entityId: 1, cardId: 'A', zone: 'HAND', controllerId: 1, info: { created: true } });
    const result = computeRemaining({
      originalDeck: original,
      seenEntities: [created],
      deckEntities: [],
      localControllerId: 1,
    });
    // Created card should not subtract from remaining; instead show
    // up... wait, no — extras computes from seen which already excluded
    // the created card. So neither remaining shrinks nor extras grows.
    expect(result.remaining.countOf('A')).toBe(2);
    expect(result.extras).toEqual([]);
  });

  it('multiple copies tracked independently', () => {
    const original = DeckSnapshot.fromDeckCards([{ cardId: 'A', count: 2 }, { cardId: 'B', count: 1 }]);
    const result = computeRemaining({
      originalDeck: original,
      seenEntities: [e(1, 'A', 'HAND'), e(2, 'A', 'PLAY'), e(3, 'B', 'GRAVEYARD')],
      deckEntities: [],
      localControllerId: 1,
    });
    expect(result.remaining.total()).toBe(0);
  });

  it('includes known shuffled cards that are currently in deck', () => {
    const original = DeckSnapshot.fromDeckCards([{ cardId: 'Fireball', count: 2 }]);
    const result = computeRemaining({
      originalDeck: original,
      seenEntities: [],
      deckEntities: [e(10, 'Albatross', 'DECK')],
      localControllerId: 1,
    });
    expect(result.remaining.countOf('Fireball')).toBe(2);
    expect(result.remaining.countOf('Albatross')).toBe(1);
    expect(result.remaining.total()).toBe(3);
    expect(result.extras).toEqual([]);
  });

  it('only adds same-card shuffled overflow', () => {
    const original = DeckSnapshot.fromDeckCards([{ cardId: 'Fireball', count: 2 }]);
    const result = computeRemaining({
      originalDeck: original,
      seenEntities: [e(1, 'Fireball', 'HAND')],
      deckEntities: [
        e(10, 'Fireball', 'DECK'),
        e(11, 'Fireball', 'DECK'),
      ],
      localControllerId: 1,
    });
    expect(result.remaining.countOf('Fireball')).toBe(2);
  });

  it('does not double-count known original deck entities', () => {
    const original = DeckSnapshot.fromDeckCards([{ cardId: 'Fireball', count: 2 }]);
    const result = computeRemaining({
      originalDeck: original,
      seenEntities: [],
      deckEntities: [e(10, 'Fireball', 'DECK')],
      localControllerId: 1,
    });
    expect(result.remaining.countOf('Fireball')).toBe(2);
    expect(result.remaining.total()).toBe(2);
  });

  it('ignores face-down deck entities for displayed card rows', () => {
    const original = DeckSnapshot.fromDeckCards([{ cardId: 'Fireball', count: 2 }]);
    const result = computeRemaining({
      originalDeck: original,
      seenEntities: [],
      deckEntities: [e(10, '', 'DECK')],
      localControllerId: 1,
    });
    expect(result.remaining.entries()).toEqual([{ cardId: 'Fireball', count: 2 }]);
  });
});

describe('gatherSeenEntities', () => {
  it('combines hand + board + graveyard + secret zones', () => {
    const game = {
      hand: [e(1, 'H', 'HAND')],
      board: [e(2, 'B', 'PLAY')],
      graveyard: [e(3, 'G', 'GRAVEYARD')],
      secret: [e(4, 'S', 'SECRET')],
    } satisfies Pick<Player, 'hand' | 'board' | 'graveyard' | 'secret'>;
    const seen = gatherSeenEntities(game);
    expect(seen.map((x) => x.cardId)).toEqual(['H', 'B', 'G', 'S']);
  });
});
