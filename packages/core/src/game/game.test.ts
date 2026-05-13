import { describe, expect, it } from 'vitest';
import { Entity } from './entity';
import { DeckSnapshot } from './deck-snapshot';
import { Game } from './game';
import { Player } from './player';
import { zoneFromNumber } from './types';

describe('Entity', () => {
  it('defaults info to all-undefined in M2', () => {
    const e = new Entity({ entityId: 1, cardId: 'CS2_022', zone: 'HAND', controllerId: 1 });
    expect(e.info.created).toBeUndefined();
    expect(e.info.stolen).toBeUndefined();
    expect(e.info.hidden).toBeUndefined();
    expect(e.info.mulliganed).toBeUndefined();
  });

  it('zone projections are correct', () => {
    const inDeck = new Entity({ entityId: 1, cardId: '', zone: 'DECK', controllerId: 1 });
    const inHand = new Entity({ entityId: 2, cardId: 'X', zone: 'HAND', controllerId: 1 });
    const inPlay = new Entity({ entityId: 3, cardId: 'Y', zone: 'PLAY', controllerId: 1 });
    expect(inDeck.isInDeck).toBe(true);
    expect(inHand.isInHand).toBe(true);
    expect(inPlay.isInPlay).toBe(true);
    expect(inDeck.isRevealed).toBe(false);
    expect(inHand.isRevealed).toBe(true);
  });
});

describe('zoneFromNumber', () => {
  it('maps 1 → PLAY, 2 → DECK, 3 → HAND, 7 → SECRET', () => {
    expect(zoneFromNumber(1)).toBe('PLAY');
    expect(zoneFromNumber(2)).toBe('DECK');
    expect(zoneFromNumber(3)).toBe('HAND');
    expect(zoneFromNumber(7)).toBe('SECRET');
  });
  it('falls back to INVALID for unknown', () => {
    expect(zoneFromNumber(0)).toBe('INVALID');
    expect(zoneFromNumber(999)).toBe('INVALID');
  });
});

describe('DeckSnapshot', () => {
  it('builds from { cardId, count } cards and sums total', () => {
    const s = DeckSnapshot.fromDeckCards([
      { cardId: 'A', count: 2 },
      { cardId: 'B', count: 1 },
    ]);
    expect(s.total()).toBe(3);
    expect(s.countOf('A')).toBe(2);
    expect(s.countOf('Z')).toBe(0);
  });

  it('builds from cardIds (one entry per copy)', () => {
    const s = DeckSnapshot.fromCardIds(['A', 'A', 'B', '']);
    expect(s.total()).toBe(3);
    expect(s.countOf('A')).toBe(2);
    expect(s.countOf('B')).toBe(1);
  });

  it('skips empty cardIds in source data', () => {
    const s = DeckSnapshot.fromDeckCards([{ cardId: '', count: 5 }, { cardId: 'A', count: 1 }]);
    expect(s.total()).toBe(1);
  });

  it('subtract clamps negative to 0 and removes zero-count cards', () => {
    const a = DeckSnapshot.fromDeckCards([{ cardId: 'X', count: 2 }, { cardId: 'Y', count: 1 }]);
    const b = a.subtract([{ cardId: 'X' }, { cardId: 'X' }, { cardId: 'X' }]);
    expect(b.countOf('X')).toBe(0);
    expect(b.countOf('Y')).toBe(1);
    expect(b.entries().map((e) => e.cardId)).toEqual(['Y']);
  });

  it('extras finds cards not in original or exceeding count', () => {
    const original = DeckSnapshot.fromDeckCards([{ cardId: 'A', count: 1 }]);
    const seen = DeckSnapshot.fromCardIds(['A', 'B', 'B', 'C']);
    const extras = original.extras(seen);
    expect(extras).toEqual([
      { cardId: 'B', count: 2 },
      { cardId: 'C', count: 1 },
    ]);
  });

  it('isEmpty / entries are stable', () => {
    expect(new DeckSnapshot([]).isEmpty()).toBe(true);
    const s = DeckSnapshot.fromDeckCards([{ cardId: 'B', count: 1 }, { cardId: 'A', count: 2 }]);
    expect(s.entries().map((e) => e.cardId)).toEqual(['A', 'B']);
  });
});

describe('Player', () => {
  it('zone projections filter on controllerId', () => {
    const game = new Game();
    game.setPlayers({ localControllerId: 1, opposingControllerId: 2 });
    game.entities.set(10, new Entity({ entityId: 10, cardId: 'X', zone: 'HAND', controllerId: 1 }));
    game.entities.set(11, new Entity({ entityId: 11, cardId: 'Y', zone: 'PLAY', controllerId: 1 }));
    game.entities.set(12, new Entity({ entityId: 12, cardId: 'Z', zone: 'HAND', controllerId: 2 }));
    expect(game.localPlayer.hand).toHaveLength(1);
    expect(game.localPlayer.board).toHaveLength(1);
    expect(game.opposingPlayer.hand).toHaveLength(1);
    expect(game.opposingPlayer.board).toHaveLength(0);
  });

  it('originalDeck is null on construction', () => {
    const p = new Player({ controllerId: 1, isLocal: true });
    expect(p.originalDeck).toBeNull();
  });
});

describe('Game.transitionTo', () => {
  it('starts at IDLE', () => {
    expect(new Game().phase).toBe('IDLE');
  });
  it('sets startedAt when entering PRE_MATCH', () => {
    const g = new Game();
    g.transitionTo('PRE_MATCH', 1000);
    expect(g.startedAt).toBe(1000);
  });
  it('sets endedAt when entering POST_MATCH', () => {
    const g = new Game();
    g.transitionTo('PRE_MATCH', 1000);
    g.transitionTo('IN_MATCH', 1500);
    g.transitionTo('POST_MATCH', 2000);
    expect(g.startedAt).toBe(1000);
    expect(g.endedAt).toBe(2000);
  });
  it('is a no-op when already in target phase', () => {
    const g = new Game();
    g.transitionTo('PRE_MATCH', 1000);
    g.transitionTo('PRE_MATCH', 9999);
    expect(g.startedAt).toBe(1000); // not overwritten
  });
});

describe('Game.applyEntitySnapshot', () => {
  it('inserts new entities + updates existing ones', () => {
    const g = new Game();
    g.applyEntitySnapshot([
      { entityId: 1, cardId: 'A', zone: 'DECK', controllerId: 1 },
      { entityId: 2, cardId: 'B', zone: 'HAND', controllerId: 1 },
    ]);
    expect(g.entities.size).toBe(2);
    g.applyEntitySnapshot([
      { entityId: 1, cardId: 'A', zone: 'HAND', controllerId: 1 },
      { entityId: 2, cardId: 'B', zone: 'HAND', controllerId: 1 },
    ]);
    expect(g.entities.get(1)?.zone).toBe('HAND');
  });

  it('removes unrevealed deck entities not in the new snapshot', () => {
    const g = new Game();
    g.applyEntitySnapshot([{ entityId: 1, cardId: '', zone: 'DECK', controllerId: 1 }]);
    g.applyEntitySnapshot([{ entityId: 2, cardId: 'B', zone: 'HAND', controllerId: 1 }]);
    expect(g.entities.has(1)).toBe(false);
    expect(g.entities.has(2)).toBe(true);
  });

  it('moves revealed non-deck entities missing from a snapshot to graveyard', () => {
    const g = new Game();
    g.applyEntitySnapshot([
      { entityId: 1, cardId: 'A', zone: 'PLAY', controllerId: 1 },
      { entityId: 2, cardId: 'B', zone: 'HAND', controllerId: 1 },
    ]);
    g.applyEntitySnapshot([]);

    expect(g.entities.get(1)?.zone).toBe('GRAVEYARD');
    expect(g.entities.get(2)?.zone).toBe('GRAVEYARD');
    expect(g.localPlayer.graveyard.map((entity) => entity.cardId)).toEqual(['A', 'B']);
  });

  it('does not promote missing SETASIDE effect candidates to graveyard', () => {
    const g = new Game();
    g.applyLogDerivedEntityUpdate({
      entityId: 78,
      cardId: 'NEW1_034',
      zone: 'SETASIDE',
      controllerId: 1,
      info: { created: true },
    });
    g.applyEntitySnapshot([]);

    expect(g.entities.has(78)).toBe(false);
    expect(g.localPlayer.graveyard).toEqual([]);
  });

  it('does NOT downgrade a revealed cardId back to empty', () => {
    const g = new Game();
    g.applyEntitySnapshot([{ entityId: 1, cardId: 'A', zone: 'HAND', controllerId: 1 }]);
    g.applyEntitySnapshot([{ entityId: 1, cardId: '', zone: 'HAND', controllerId: 1 }]);
    expect(g.entities.get(1)?.cardId).toBe('A');
  });
});

describe('Game.reset', () => {
  it('clears entities + phase + players + match metadata', () => {
    const g = new Game({ gameType: 1, formatType: 2, missionId: 270 });
    g.transitionTo('IN_MATCH', 1000);
    g.entities.set(1, new Entity({ entityId: 1, cardId: 'X', zone: 'HAND', controllerId: 1 }));
    g.localPlayer.name = 'Bob';
    g.reset();
    expect(g.phase).toBe('IDLE');
    expect(g.entities.size).toBe(0);
    expect(g.localPlayer.name).toBe('');
    expect(g.gameType).toBe(0);
    expect(g.startedAt).toBeNull();
  });
});
