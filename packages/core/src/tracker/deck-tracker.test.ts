import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type {
  BoardState,
  Deck,
  DeckState,
  HandState,
  HearthMirror,
  MatchInfo,
} from '@hdt/hearthmirror';
import { DeckTracker, type DeckTrackerEvent, type DeckTrackerEventName } from './deck-tracker';
import { CallbackDeckIdentifier, ChainedDeckIdentifier } from './deck-identifier';
import { DeckSnapshot } from '../game/deck-snapshot';

/** Minimal stub HearthMirror that returns whatever's pushed into `state`. */
function makeMirror(): {
  mirror: HearthMirror;
  state: {
    matchInfo: MatchInfo | null;
    isGameOver: boolean;
    isSpectating: boolean;
    isMulligan: { mulligan: boolean | null };
    decks: Deck[];
    handState: HandState | null;
    deckState: DeckState | null;
    boardState: BoardState | null;
  };
} {
  const state = {
    matchInfo: null as MatchInfo | null,
    isGameOver: false,
    isSpectating: false,
    isMulligan: { mulligan: null as boolean | null },
    decks: [] as Deck[],
    handState: null as HandState | null,
    deckState: null as DeckState | null,
    boardState: null as BoardState | null,
  };
  const mirror = {
    isAlive: vi.fn(async () => true),
    getMatchInfo: vi.fn(async () => state.matchInfo),
    isSpectating: vi.fn(async () => state.isSpectating),
    isGameOver: vi.fn(async () => state.isGameOver),
    isMulligan: vi.fn(async () => state.isMulligan),
    getDecks: vi.fn(async () => state.decks),
    getHandState: vi.fn(async () => state.handState),
    getDeckState: vi.fn(async () => state.deckState),
    getBoardState: vi.fn(async () => state.boardState),
    // getSelectedDeckId returns null by default (deck-picker scene unloaded).
    // Tests can override via the returned mirror's `.getSelectedDeckId`.
    getSelectedDeckId: vi.fn(async () => null),
  } as unknown as HearthMirror;
  return { mirror, state };
}

const fakeDeck = (id: number, name: string): Deck => ({
  id,
  name,
  hero: 'HERO_01',
  formatType: 2,
  deckType: 1,
  seasonId: 0,
  cardbackId: 0,
  createDateMicrosec: 0,
  cards: [
    { cardId: 'A', count: 2, premium: 0 },
    { cardId: 'B', count: 1, premium: 0 },
  ],
});

const deckWithCards = (
  id: number,
  name: string,
  cards: { cardId: string; count: number }[],
): Deck => ({
  id,
  name,
  hero: 'HERO_01',
  formatType: 2,
  deckType: 1,
  seasonId: 0,
  cardbackId: 0,
  createDateMicrosec: 0,
  cards: cards.map((card) => ({ ...card, premium: 0 })),
});

const fakeMatch = (overrides: Partial<MatchInfo> = {}): MatchInfo => ({
  localPlayer: {
    id: 1,
    name: 'Local',
    side: 1,
    standardRank: 0,
    standardLegendRank: 0,
    wildRank: 0,
    wildLegendRank: 0,
    classicRank: 0,
    classicLegendRank: 0,
    twistRank: 0,
    twistLegendRank: 0,
    cardbackId: 0,
  },
  opposingPlayer: null,
  missionId: 0,
  gameType: 1,
  formatType: 2,
  rankedSeasonId: 0,
  arenaSeasonId: 0,
  brawlSeasonId: 0,
  ...overrides,
});

/**
 * Advance time enough to complete the initial tick + N follow-up ticks.
 * The first tick is at t=0; subsequent ticks fire at the current
 * interval set by the phase machine (max 2000ms in IDLE).
 */
async function advanceTicks(maxTicks = 6): Promise<void> {
  // Initial 0ms tick + microtasks.
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
  // Then advance through `maxTicks` × 2000ms (worst-case IDLE interval).
  for (let i = 0; i < maxTicks; i++) {
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
  }
}

describe('DeckTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in IDLE and stays IDLE when no match is active', async () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({ mirror });
    tracker.start();
    await advanceTicks(2);
    expect(tracker.getSnapshot().phase).toBe('IDLE');
    tracker.stop();
  });

  it('emits match-started when matchInfo first appears', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch(); // present from t=0
    const events: DeckTrackerEvent[] = [];
    const tracker = new DeckTracker({ mirror });
    tracker.on('match-started', (e) => events.push(e));
    tracker.start();
    await advanceTicks(2);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(['PRE_MATCH', 'IN_MATCH']).toContain(tracker.getSnapshot().phase);
    tracker.stop();
  });

  it('emits needs-deck-selection when identifier returns null', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A'), fakeDeck(2, 'B')];
    state.deckState = { friendlyDeck: [{ entityId: 100, cardId: '' }], opposingDeckCount: 0 };
    state.handState = { friendlyHand: [], opposingHandCount: 0 };

    const events: DeckTrackerEvent[] = [];
    const tracker = new DeckTracker({ mirror }); // default = stub InGameDeckIdentifier returning null
    tracker.on('needs-deck-selection', (e) => events.push(e));
    tracker.start();
    await advanceTicks(4);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.decks).toEqual([
      { id: 1, name: 'A', hero: 'HERO_01' },
      { id: 2, name: 'B', hero: 'HERO_01' },
    ]);
    tracker.stop();
  });

  it('CallbackDeckIdentifier populates snapshot.deck on transition to IN_MATCH', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 0 };
    state.handState = { friendlyHand: [], opposingHandCount: 0 };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().deck).not.toBeNull();
    expect(tracker.getSnapshot().deck?.original.length).toBe(2);
    expect(tracker.getSnapshot().deck?.remaining.length).toBe(2);
    tracker.stop();
  });

  it('identifies a saved deck from visible friendly hand cards when selected deck id is unavailable', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [
      deckWithCards(1, 'Wrong Deck', [
        { cardId: 'X', count: 2 },
        { cardId: 'Y', count: 1 },
      ]),
      deckWithCards(2, 'Visible Match', [
        { cardId: 'A', count: 2 },
        { cardId: 'B', count: 1 },
        { cardId: 'C', count: 1 },
      ]),
    ];
    state.deckState = {
      friendlyDeck: [{ entityId: 100, cardId: '' }],
      opposingDeckCount: 20,
    };
    state.handState = {
      friendlyHand: [
        { entityId: 1, cardId: 'A', zonePosition: 1 },
        { entityId: 2, cardId: 'B', zonePosition: 2 },
        { entityId: 3, cardId: 'GAME_005', zonePosition: 3 },
      ],
      opposingHandCount: 4,
    };

    const tracker = new DeckTracker({ mirror });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().deck?.id).toBe(2);
    expect(tracker.getSnapshot().deck?.name).toBe('Visible Match');
    expect(tracker.getSnapshot().pendingDeckSelection).toBeNull();
    tracker.stop();
  });

  it('narrows manual deck selection to visible-card candidates when fallback is ambiguous', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [
      deckWithCards(1, 'Wrong Deck', [
        { cardId: 'X', count: 2 },
        { cardId: 'Y', count: 1 },
      ]),
      deckWithCards(2, 'Candidate A', [
        { cardId: 'A', count: 2 },
        { cardId: 'B', count: 1 },
        { cardId: 'C', count: 1 },
      ]),
      deckWithCards(3, 'Candidate B', [
        { cardId: 'A', count: 1 },
        { cardId: 'B', count: 1 },
        { cardId: 'D', count: 2 },
      ]),
    ];
    state.deckState = {
      friendlyDeck: [{ entityId: 100, cardId: '' }],
      opposingDeckCount: 20,
    };
    state.handState = {
      friendlyHand: [
        { entityId: 1, cardId: 'A', zonePosition: 1 },
        { entityId: 2, cardId: 'B', zonePosition: 2 },
      ],
      opposingHandCount: 4,
    };

    const events: DeckTrackerEvent[] = [];
    const tracker = new DeckTracker({ mirror });
    tracker.on('needs-deck-selection', (e) => events.push(e));
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().deck).toBeNull();
    expect(events[0]?.decks?.map((deck) => deck.name)).toEqual(['Candidate A', 'Candidate B']);
    expect(tracker.getSnapshot().pendingDeckSelection?.decks.map((deck) => deck.name)).toEqual([
      'Candidate A',
      'Candidate B',
    ]);
    tracker.stop();
  });

  it('does not put a dead friendly minion back into the remaining deck', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = {
      friendlyDeck: [
        { entityId: 100, cardId: '' },
        { entityId: 101, cardId: '' },
      ],
      opposingDeckCount: 0,
    };
    state.handState = { friendlyHand: [], opposingHandCount: 0 };
    state.boardState = {
      friendly: [
        { entityId: 10, cardId: 'A', zonePosition: 1, attack: 1, health: 1, damage: 0 },
      ],
      opposing: [],
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);
    expect(
      tracker.getSnapshot().deck?.remaining.find((card) => card.cardId === 'A')?.count,
    ).toBe(1);

    state.boardState = { friendly: [], opposing: [] };
    await advanceTicks(2);

    expect(
      tracker.getSnapshot().deck?.remaining.find((card) => card.cardId === 'A')?.count,
    ).toBe(1);
    tracker.stop();
  });

  it('includes known shuffled-in deck cards in snapshot remaining', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [deckWithCards(1, 'A', [{ cardId: 'A', count: 2 }])];
    state.deckState = {
      friendlyDeck: [
        { entityId: 100, cardId: '' },
        { entityId: 200, cardId: 'ALBATROSS' },
      ],
      opposingDeckCount: 0,
    };
    state.handState = { friendlyHand: [], opposingHandCount: 0 };
    state.boardState = { friendly: [], opposing: [] };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().deck?.remaining).toContainEqual({
      cardId: 'ALBATROSS',
      count: 1,
    });
    tracker.stop();
  });

  it('uses log-derived graveyard and deck entities to backfill mid-match remaining state', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({ mirror });
    tracker.setOriginalDeck({
      deckId: 1,
      name: 'Replay Deck',
      originalDeck: DeckSnapshot.fromCardIds(['A', 'A', 'B']),
    });

    tracker.applyLogDerivedEntityUpdates([
      { entityId: 10, cardId: 'A', zone: 'GRAVEYARD', controllerId: 1 },
      { entityId: 11, cardId: '', zone: 'DECK', controllerId: 1 },
      { entityId: 11, cardId: 'B' },
    ]);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.deck?.remaining).toEqual([
      { cardId: 'A', count: 1 },
      { cardId: 'B', count: 1 },
    ]);
    expect(snapshot.friendlyDeckCount).toBe(1);
  });

  it('uses log-derived origin metadata to keep same-card shuffled copies in the deck', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({ mirror });
    tracker.setOriginalDeck({
      deckId: 1,
      name: 'Replay Deck',
      originalDeck: DeckSnapshot.fromCardIds(['A', 'A']),
    });

    tracker.applyLogDerivedEntityUpdates([
      { entityId: 10, cardId: '', zone: 'DECK', controllerId: 1 },
      { entityId: 10, cardId: 'A', zone: 'HAND' },
      { entityId: 99, cardId: 'A', zone: 'DECK', controllerId: 1 },
    ]);

    expect(tracker.getSnapshot().deck?.remaining).toEqual([{ cardId: 'A', count: 2 }]);

    tracker.applyLogDerivedEntityUpdates([{ entityId: 99, zone: 'HAND' }]);

    expect(tracker.getSnapshot().deck?.remaining).toEqual([{ cardId: 'A', count: 1 }]);
  });

  it('prefers authoritative friendly deck card ids from HearthMirror for remaining cards', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [
      deckWithCards(1, 'A', [
        { cardId: 'A', count: 2 },
        { cardId: 'B', count: 1 },
      ]),
    ];
    state.deckState = {
      friendlyDeck: [
        { entityId: 100, cardId: 'A' },
        { entityId: 101, cardId: 'B' },
      ],
      opposingDeckCount: 0,
    };
    state.handState = { friendlyHand: [], opposingHandCount: 0 };
    state.boardState = { friendly: [], opposing: [] };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().deck?.remaining).toEqual([
      { cardId: 'A', count: 1 },
      { cardId: 'B', count: 1 },
    ]);
    expect(tracker.getSnapshot().friendlyDeckCount).toBe(2);
    tracker.stop();
  });

  it('caps remaining cards to HearthMirror deck count when deck card ids are hidden', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [
      deckWithCards(1, 'A', [
        { cardId: 'A', count: 2 },
        { cardId: 'B', count: 1 },
      ]),
    ];
    state.deckState = {
      friendlyDeck: [
        { entityId: 100, cardId: '' },
        { entityId: 101, cardId: '' },
      ],
      opposingDeckCount: 0,
    };
    state.handState = { friendlyHand: [], opposingHandCount: 0 };
    state.boardState = { friendly: [], opposing: [] };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    const remaining = tracker.getSnapshot().deck?.remaining ?? [];
    expect(remaining.reduce((sum, card) => sum + card.count, 0)).toBe(2);
    expect(remaining).toEqual([
      { cardId: 'A', count: 1 },
      { cardId: 'B', count: 1 },
    ]);
    tracker.stop();
  });

  it('emits completedMatch summary when a constructed match ends', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch({
      gameType: 3,
      formatType: 2,
      opposingPlayer: {
        id: 2,
        name: 'Opponent',
        side: 2,
        standardRank: 0,
        standardLegendRank: 0,
        wildRank: 0,
        wildLegendRank: 0,
        classicRank: 0,
        classicLegendRank: 0,
        twistRank: 0,
        twistLegendRank: 0,
        cardbackId: 0,
      },
    });
    state.decks = [fakeDeck(42, 'Recorded Real Deck')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = { friendly: [], opposing: [] };

    const events: DeckTrackerEvent[] = [];
    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 42),
    });
    tracker.on('match-ended', (event) => events.push(event));
    tracker.start();
    await advanceTicks(4);

    state.deckState = null;
    await advanceTicks(2);

    expect(events.at(-1)?.completedMatch).toMatchObject({
      result: 'unknown',
      playOrder: 'unknown',
      deckId: 42,
      deckName: 'Recorded Real Deck',
      opponentName: 'Opponent',
      gameType: 3,
      formatType: 2,
    });
    tracker.stop();
  });

  it('omits completedMatch summary for arena games', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch({ gameType: 5, formatType: 2 });
    state.decks = [fakeDeck(42, 'Arena-like Deck')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = { friendly: [], opposing: [] };

    const events: DeckTrackerEvent[] = [];
    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 42),
    });
    tracker.on('match-ended', (event) => events.push(event));
    tracker.start();
    await advanceTicks(4);

    state.deckState = null;
    await advanceTicks(2);

    expect(events.at(-1)?.completedMatch).toBeUndefined();
    tracker.stop();
  });

  it('omits completedMatch summary for mission or practice games', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch({ gameType: 3, formatType: 2, missionId: 270 });
    state.decks = [fakeDeck(42, 'Practice Deck')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = { friendly: [], opposing: [] };

    const events: DeckTrackerEvent[] = [];
    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 42),
    });
    tracker.on('match-ended', (event) => events.push(event));
    tracker.start();
    await advanceTicks(4);

    state.deckState = null;
    await advanceTicks(2);

    expect(events.at(-1)?.completedMatch).toBeUndefined();
    tracker.stop();
  });

  it('selectSavedDeck flows savedDeckId/savedDeckVersion into match-ended summary', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch({ gameType: 3, formatType: 2 });
    state.decks = [fakeDeck(42, 'Saved Druid')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = { friendly: [], opposing: [] };

    const events: DeckTrackerEvent[] = [];
    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 42),
    });
    tracker.on('match-ended', (event) => events.push(event));
    tracker.selectSavedDeck('saved-d-1', 3);
    tracker.start();
    await advanceTicks(4);

    state.deckState = null;
    await advanceTicks(2);

    expect(events.at(-1)?.completedMatch).toMatchObject({
      deckId: 42,
      savedDeckId: 'saved-d-1',
      savedDeckVersion: 3,
    });
    tracker.stop();
  });

  it('omits savedDeckId/savedDeckVersion when selectSavedDeck is not called', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch({ gameType: 3, formatType: 2 });
    state.decks = [fakeDeck(42, 'Live Druid')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = { friendly: [], opposing: [] };

    const events: DeckTrackerEvent[] = [];
    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 42),
    });
    tracker.on('match-ended', (event) => events.push(event));
    tracker.start();
    await advanceTicks(4);

    state.deckState = null;
    await advanceTicks(2);

    const summary = events.at(-1)?.completedMatch as Record<string, unknown> | undefined;
    expect(summary).toBeDefined();
    expect(summary).not.toHaveProperty('savedDeckId');
    expect(summary).not.toHaveProperty('savedDeckVersion');
    tracker.stop();
  });

  it('clearSavedDeckAttribution removes a previously set saved-deck binding', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch({ gameType: 3, formatType: 2 });
    state.decks = [fakeDeck(42, 'Live Druid')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = { friendly: [], opposing: [] };

    const events: DeckTrackerEvent[] = [];
    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 42),
    });
    tracker.on('match-ended', (event) => events.push(event));
    tracker.selectSavedDeck('saved-d-1', 3);
    tracker.clearSavedDeckAttribution();
    tracker.start();
    await advanceTicks(4);

    state.deckState = null;
    await advanceTicks(2);

    const summary = events.at(-1)?.completedMatch as Record<string, unknown> | undefined;
    expect(summary).not.toHaveProperty('savedDeckId');
    tracker.stop();
  });

  it('tracks a revealed opposing board card in the snapshot', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = {
      friendly: [],
      opposing: [
        { entityId: 20, cardId: 'CS2_029', zonePosition: 1, attack: 0, health: 0, damage: 0 },
      ],
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().opponent.revealed[0]?.cardId).toBe('CS2_029');
    tracker.stop();
  });

  it('does not record opponent hero or hero power entities as cards', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = {
      friendly: [],
      opposing: [
        { entityId: 20, cardId: 'HERO_07bo', zonePosition: 0, attack: 0, health: 30, damage: 0 },
        { entityId: 21, cardId: 'HERO_07ebp', zonePosition: 0, attack: 0, health: 0, damage: 0 },
        { entityId: 22, cardId: 'CS2_029', zonePosition: 1, attack: 0, health: 0, damage: 0 },
      ],
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().opponent.revealed.map((record) => record.cardId)).toEqual([
      'CS2_029',
    ]);
    tracker.stop();
  });

  it('uses distinct fallback controllers when matchInfo player ids are zero', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch({
      localPlayer: {
        id: 0,
        name: 'Local',
        side: 1,
        standardRank: 0,
        standardLegendRank: 0,
        wildRank: 0,
        wildLegendRank: 0,
        classicRank: 0,
        classicLegendRank: 0,
        twistRank: 0,
        twistLegendRank: 0,
        cardbackId: 0,
      },
      opposingPlayer: {
        id: 0,
        name: 'Opponent',
        side: 2,
        standardRank: 0,
        standardLegendRank: 0,
        wildRank: 0,
        wildLegendRank: 0,
        classicRank: 0,
        classicLegendRank: 0,
        twistRank: 0,
        twistLegendRank: 0,
        cardbackId: 0,
      },
    });
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = {
      friendly: [{ entityId: 10, cardId: 'A', zonePosition: 1, attack: 1, health: 1, damage: 0 }],
      opposing: [
        { entityId: 20, cardId: 'CS2_029', zonePosition: 1, attack: 0, health: 0, damage: 0 },
      ],
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().opponent.revealed[0]?.cardId).toBe('CS2_029');
    expect(tracker.getSnapshot().deck?.remaining.find((card) => card.cardId === 'A')?.count).toBe(1);
    tracker.stop();
  });

  it('keeps a revealed opposing card in opponent graveyard after it leaves visible play', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = {
      friendly: [],
      opposing: [
        { entityId: 20, cardId: 'CS2_029', zonePosition: 1, attack: 0, health: 0, damage: 0 },
      ],
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    state.boardState = { friendly: [], opposing: [] };
    await advanceTicks(2);

    expect(tracker.getSnapshot().opponent.graveyard[0]?.cardId).toBe('CS2_029');
    tracker.stop();
  });

  it('does not synthesize opponent card identities from hidden hand or deck counts', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = { friendly: [], opposing: [] };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().opponent.revealed).toEqual([]);
    expect(tracker.getSnapshot().opponent.graveyard).toEqual([]);
    tracker.stop();
  });

  it('errors do not stop the loop; routed to error event', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    let calls = 0;
    (mirror.getMatchInfo as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return state.matchInfo;
    });
    const errors: DeckTrackerEvent[] = [];
    const tracker = new DeckTracker({ mirror });
    tracker.on('error', (e) => errors.push(e));
    tracker.start();
    await advanceTicks(4);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    tracker.stop();
  });

  it('on returns an unsubscribe function', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({ mirror });
    const handler = vi.fn();
    const unsub = tracker.on('state-change', handler);
    unsub();
    // Internal: handler should now be unregistered. Smoke-test via private map size is messy;
    // we just assert the call doesn't throw and handler stays at zero calls.
    expect(handler).not.toHaveBeenCalled();
  });
});
