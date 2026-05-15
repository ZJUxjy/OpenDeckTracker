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

  it('replaces Broxigar with its start-of-game deck inserts in the visible deck snapshot', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [
      deckWithCards(1, 'Broxigar Deck', [
        { cardId: 'TIME_020', count: 1 },
        { cardId: 'CS2_029', count: 1 },
      ]),
    ];
    state.deckState = {
      friendlyDeck: [
        { entityId: 100, cardId: 'CS2_029' },
        { entityId: 101, cardId: 'TIME_020t1' },
        { entityId: 102, cardId: 'TIME_020t2' },
        { entityId: 103, cardId: 'TIME_020t2' },
      ],
      opposingDeckCount: 0,
    };
    state.handState = { friendlyHand: [], opposingHandCount: 0 };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    const snapshotDeck = tracker.getSnapshot().deck;
    expect(snapshotDeck?.original).toEqual(
      expect.arrayContaining([
        { cardId: 'CS2_029', count: 1 },
        { cardId: 'TIME_020t1', count: 1 },
        { cardId: 'TIME_020t2', count: 1 },
      ]),
    );
    expect(snapshotDeck?.original.some((card) => card.cardId === 'TIME_020')).toBe(false);
    expect(snapshotDeck?.remaining).toEqual(
      expect.arrayContaining([
        { cardId: 'CS2_029', count: 1 },
        { cardId: 'TIME_020t1', count: 1 },
        { cardId: 'TIME_020t2', count: 1 },
      ]),
    );
    expect(snapshotDeck?.remaining.some((card) => card.cardId === 'TIME_020')).toBe(false);
    expect(snapshotDeck?.remaining.find((card) => card.cardId === 'TIME_020t2')?.count).toBe(1);
    expect(snapshotDeck?.extraRemaining).toEqual([]);
    tracker.stop();
  });

  it('does not keep a Broxigar deck insert in remaining when it is in the opening hand', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [
      deckWithCards(1, 'Broxigar Deck', [
        { cardId: 'TIME_020', count: 1 },
        { cardId: 'CS2_029', count: 1 },
      ]),
    ];
    state.deckState = {
      friendlyDeck: [
        { entityId: 100, cardId: 'CS2_029' },
        { entityId: 101, cardId: 'TIME_020t1' },
        // Mirror can briefly report the same physical card in deck while
        // hand state already shows it. The visible hand copy must win.
        { entityId: 102, cardId: '' },
      ],
      opposingDeckCount: 0,
    };
    state.handState = {
      friendlyHand: [{ entityId: 102, cardId: 'TIME_020t2', zonePosition: 1 }],
      opposingHandCount: 0,
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.friendlyHand).toEqual(['TIME_020t2']);
    expect(snapshot.friendlyHandExtras).toEqual([false]);
    expect(snapshot.deck?.remaining).toEqual(
      expect.arrayContaining([
        { cardId: 'CS2_029', count: 1 },
        { cardId: 'TIME_020t1', count: 1 },
      ]),
    );
    expect(snapshot.deck?.remaining.some((card) => card.cardId === 'TIME_020t2')).toBe(false);
    tracker.stop();
  });

  it('orders friendlyHand by zonePosition', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 0 };
    state.handState = {
      friendlyHand: [
        { entityId: 2, cardId: 'B', zonePosition: 2 },
        { entityId: 1, cardId: 'A', zonePosition: 1 },
        { entityId: 3, cardId: 'C', zonePosition: 3 },
      ],
      opposingHandCount: 0,
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().friendlyHand).toEqual(['A', 'B', 'C']);
    expect(tracker.getSnapshot().friendlyHandExtras).toEqual([false, false, true]);
    tracker.stop();
  });

  it('marks friendly hand cards outside the original deck as extra cards', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [deckWithCards(1, 'A', [{ cardId: 'A', count: 2 }])];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 0 };
    state.handState = {
      friendlyHand: [
        { entityId: 10, cardId: 'DISCOVERED', zonePosition: 1 },
        { entityId: 11, cardId: 'A', zonePosition: 2 },
      ],
      opposingHandCount: 0,
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().friendlyHand).toEqual(['DISCOVERED', 'A']);
    expect(tracker.getSnapshot().friendlyHandExtras).toEqual([true, false]);
    tracker.stop();
  });

  it('marks log-created same-card hand copies as extra cards', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [deckWithCards(1, 'A', [{ cardId: 'A', count: 2 }])];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 0 };
    state.handState = {
      friendlyHand: [{ entityId: 10, cardId: 'A', zonePosition: 1 }],
      opposingHandCount: 0,
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);
    tracker.applyLogDerivedEntityUpdates([
      {
        entityId: 10,
        cardId: 'A',
        zone: 'HAND',
        controllerId: 1,
        info: { created: true },
      },
    ]);
    await advanceTicks(1);

    expect(tracker.getSnapshot().friendlyHand).toEqual(['A']);
    expect(tracker.getSnapshot().friendlyHandExtras).toEqual([true]);
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

  it('exposes boardAttackToFace via buildSnapshot, blocked by an opposing taunt', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 0 };
    state.handState = { friendlyHand: [], opposingHandCount: 0 };
    state.boardState = {
      friendly: [
        { entityId: 11, cardId: 'CS2_231', zonePosition: 1, attack: 5, health: 5, damage: 0 },
        { entityId: 12, cardId: 'CS2_231', zonePosition: 2, attack: 2, health: 2, damage: 0 },
      ],
      opposing: [
        // 2-HP taunt — clearable with the 2-attack swing alone.
        { entityId: 21, cardId: 'CS2_231', zonePosition: 1, attack: 0, health: 2, damage: 0 },
      ],
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
      boardAttackContextProvider: () => ({
        tagsByEntityId: new Map([
          [11, { numTurnsInPlay: 1 }],
          [12, { numTurnsInPlay: 1 }],
          [21, { numTurnsInPlay: 1, taunt: true }],
        ]),
      }),
    });
    tracker.start();
    await advanceTicks(4);

    const snapshot = tracker.getSnapshot();
    // Raw board attack: 5 + 2 = 7.
    expect(snapshot.boardAttack).toEqual({ friendly: 7, opposing: 0 });
    // Optimal: spend the 2-attack swing on the 2-HP taunt, send the 5
    // to face → boardAttackToFace.friendly = 5.
    expect(snapshot.boardAttackToFace).toEqual({ friendly: 5, opposing: 0 });
    tracker.stop();
  });

  it('includes opposing hero vitals from the board-attack context provider', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 0 };
    state.handState = { friendlyHand: [], opposingHandCount: 0 };
    state.boardState = { friendly: [], opposing: [] };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
      boardAttackContextProvider: () => ({
        friendlyHero: { health: 26, armor: 1, effectiveHealth: 27 },
        opposingHero: { health: 18, armor: 4, effectiveHealth: 22 },
      }),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().friendlyHero).toEqual({
      health: 26,
      armor: 1,
      effectiveHealth: 27,
    });
    expect(tracker.getSnapshot().opposingHero).toEqual({
      health: 18,
      armor: 4,
      effectiveHealth: 22,
    });
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
    expect(tracker.getSnapshot().deck?.extraRemaining).toEqual([
      { cardId: 'ALBATROSS', count: 1 },
    ]);
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
    tracker.applyLogDerivedEntityUpdates([
      { entityId: 20, info: { originalController: 2, originalZone: 'DECK' } },
    ]);

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
    tracker.applyLogDerivedEntityUpdates([
      { entityId: 22, info: { originalController: 2, originalZone: 'DECK' } },
    ]);

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
    tracker.applyLogDerivedEntityUpdates([
      { entityId: 20, info: { originalController: 2, originalZone: 'DECK' } },
    ]);

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
    tracker.applyLogDerivedEntityUpdates([
      { entityId: 20, info: { originalController: 2, originalZone: 'DECK' } },
    ]);

    state.boardState = { friendly: [], opposing: [] };
    await advanceTicks(2);

    expect(tracker.getSnapshot().opponent.graveyard[0]?.cardId).toBe('CS2_029');
    tracker.stop();
  });

  it('keeps a local played card out of opponent history even if a later update has the opposing controller', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({ mirror });
    tracker.getGame().setPlayers({
      localControllerId: 2,
      localName: 'Local',
      opposingControllerId: 1,
      opposingName: 'Opponent',
    });

    tracker.applyLogDerivedEntityUpdates([
      { entityId: 28, cardId: 'MEND_300', zone: 'DECK', controllerId: 1 },
    ]);
    tracker.recordCardPlayed({
      entityId: 28,
      cardId: 'MEND_300',
      controllerId: 2,
      timestamp: 1,
    });
    tracker.applyLogDerivedEntityUpdates([
      { entityId: 28, cardId: 'MEND_300', zone: 'GRAVEYARD', controllerId: 1 },
    ]);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.opponent.revealed.map((record) => record.cardId)).not.toContain('MEND_300');
    expect(snapshot.friendlyGraveyard.map((record) => record.cardId)).toEqual(['MEND_300']);
  });

  it('keeps effect-replayed cards out of extra-display played-card pools', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({
      mirror,
      cardMetadataLookup: (cardId) => {
        if (cardId === 'ONE_COST_SPELL') return { type: 'SPELL', cost: 1 };
        return null;
      },
    });
    tracker.getGame().setPlayers({
      localControllerId: 1,
      localName: 'Local',
      opposingControllerId: 2,
      opposingName: 'Opponent',
    });

    tracker.recordCardPlayed({
      entityId: 31,
      cardId: 'ONE_COST_SPELL',
      controllerId: 1,
      timestamp: 1,
      isManualPlay: true,
    });
    tracker.recordCardPlayed({
      entityId: 32,
      cardId: 'ONE_COST_SPELL',
      controllerId: 1,
      timestamp: 2,
      isManualPlay: false,
    });

    const snapshot = tracker.getSnapshot().extraDisplay!;
    expect(snapshot.counters.friendlyCardsPlayedThisGame).toBe(1);
    expect(snapshot.pools.oneCostCardsPlayedThisGameDistinct).toEqual([
      { cardId: 'ONE_COST_SPELL', count: 1 },
    ]);
  });

  it('keeps SETASIDE effect pool candidates out of the friendly graveyard', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({ mirror });
    tracker.getGame().setPlayers({
      localControllerId: 1,
      localName: 'Local',
      opposingControllerId: 2,
      opposingName: 'Opponent',
    });

    tracker.applyLogDerivedEntityUpdates([
      {
        entityId: 78,
        cardId: 'NEW1_034',
        zone: 'SETASIDE',
        controllerId: 1,
        info: { created: true },
      },
      {
        entityId: 79,
        cardId: 'NEW1_033',
        zone: 'SETASIDE',
        controllerId: 1,
        info: { created: true },
      },
    ]);
    tracker.getGame().applyEntitySnapshot([]);
    tracker.applyLogDerivedEntityUpdates([]);

    expect(tracker.getSnapshot().friendlyGraveyard).toEqual([]);
  });

  it('keeps unchosen discover options out of graveyard records and death counters', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({
      mirror,
      cardMetadataLookup: (cardId) => {
        if (cardId === 'DISCOVER_OPTION_A') {
          return { type: 'MINION', cost: 1, races: ['BEAST'] };
        }
        if (cardId === 'DISCOVER_OPTION_B') {
          return { type: 'MINION', cost: 2, mechanics: ['DEATHRATTLE'] };
        }
        return null;
      },
    });
    tracker.getGame().setPlayers({
      localControllerId: 1,
      localName: 'Local',
      opposingControllerId: 2,
      opposingName: 'Opponent',
    });

    tracker.applyLogDerivedEntityUpdates([
      {
        entityId: 90,
        cardId: 'DISCOVER_OPTION_A',
        zone: 'SETASIDE',
        controllerId: 1,
        info: { created: true },
      },
      {
        entityId: 91,
        cardId: 'DISCOVER_OPTION_B',
        zone: 'SETASIDE',
        controllerId: 1,
        info: { created: true },
      },
    ]);
    tracker.applyLogDerivedEntityUpdates([
      { entityId: 90, zone: 'GRAVEYARD' },
      { entityId: 91, zone: 'GRAVEYARD' },
    ]);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.friendlyGraveyard).toEqual([]);
    expect(snapshot.extraDisplay?.counters.friendlyMinionDeathsThisGame).toBeUndefined();
    expect(snapshot.extraDisplay?.pools.friendlyDeadMinionsThisGameUnique).toEqual([]);
  });

  it('records a chosen generated card once it leaves the transient choice zone for play', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({
      mirror,
      cardMetadataLookup: (cardId) => {
        if (cardId === 'CHOSEN_DISCOVER_MINION') {
          return { type: 'MINION', cost: 3, races: ['BEAST'] };
        }
        return null;
      },
    });
    tracker.getGame().setPlayers({
      localControllerId: 1,
      localName: 'Local',
      opposingControllerId: 2,
      opposingName: 'Opponent',
    });

    tracker.applyLogDerivedEntityUpdates([
      {
        entityId: 92,
        cardId: 'CHOSEN_DISCOVER_MINION',
        zone: 'SETASIDE',
        controllerId: 1,
        info: { created: true },
      },
      { entityId: 92, zone: 'HAND' },
    ]);
    tracker.recordCardPlayed({
      entityId: 92,
      cardId: 'CHOSEN_DISCOVER_MINION',
      controllerId: 1,
      timestamp: 1,
    });
    tracker.applyLogDerivedEntityUpdates([
      { entityId: 92, zone: 'PLAY' },
      { entityId: 92, zone: 'GRAVEYARD' },
    ]);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.friendlyGraveyard.map((record) => record.cardId)).toEqual([
      'CHOSEN_DISCOVER_MINION',
    ]);
    expect(snapshot.extraDisplay?.counters.friendlyMinionDeathsThisGame).toBe(1);
  });

  it('drops graveyard entities when neither played nor original controller is known', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({
      mirror,
      cardMetadataLookup: (cardId) => {
        if (cardId === 'UNKNOWN_OWNER_MINION') {
          return { type: 'MINION', cost: 1 };
        }
        return null;
      },
    });
    tracker.getGame().setPlayers({
      localControllerId: 1,
      localName: 'Local',
      opposingControllerId: 2,
      opposingName: 'Opponent',
    });

    tracker.applyLogDerivedEntityUpdates([
      { entityId: 95, cardId: 'UNKNOWN_OWNER_MINION', zone: 'PLAY', controllerId: 1 },
      { entityId: 95, zone: 'GRAVEYARD', controllerId: 1 },
    ]);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.friendlyGraveyard).toEqual([]);
    expect(snapshot.opponent.revealed).toEqual([]);
    expect(snapshot.opponent.graveyard).toEqual([]);
    expect(snapshot.extraDisplay?.counters.friendlyMinionDeathsThisGame).toBeUndefined();
  });

  it('keeps hero power replacement entities out of graveyard and opponent history', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({ mirror });
    tracker.getGame().setPlayers({
      localControllerId: 1,
      localName: 'Local',
      opposingControllerId: 2,
      opposingName: 'Opponent',
    });

    tracker.applyLogDerivedEntityUpdates([
      { entityId: 87, cardId: 'EDR_850p', zone: 'GRAVEYARD', controllerId: 1 },
      { entityId: 88, cardId: 'EDR_850p', zone: 'PLAY', controllerId: 2 },
    ]);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.friendlyGraveyard).toEqual([]);
    expect(snapshot.opponent.revealed.map((record) => record.cardId)).not.toContain('EDR_850p');
    expect(snapshot.opponent.graveyard).toEqual([]);
  });

  it('keeps hero power enchantments out of graveyard and opponent history', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({
      mirror,
      cardMetadataLookup: (cardId) => {
        if (cardId === 'CS2_017o') return { type: 'ENCHANTMENT' };
        return null;
      },
    });
    tracker.getGame().setPlayers({
      localControllerId: 1,
      localName: 'Local',
      opposingControllerId: 2,
      opposingName: 'Opponent',
    });

    tracker.applyLogDerivedEntityUpdates([
      { entityId: 93, cardId: 'CS2_017o', zone: 'PLAY', controllerId: 1 },
      { entityId: 93, zone: 'GRAVEYARD' },
      { entityId: 94, cardId: 'CS2_017o', zone: 'PLAY', controllerId: 2 },
    ]);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.friendlyGraveyard).toEqual([]);
    expect(snapshot.opponent.revealed.map((record) => record.cardId)).not.toContain('CS2_017o');
    expect(snapshot.opponent.graveyard).toEqual([]);
  });

  it('records friendly script tag counters for reviewed dynamic counter cards', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({ mirror });
    tracker.getGame().setPlayers({
      localControllerId: 1,
      localName: 'Local',
      opposingControllerId: 2,
      opposingName: 'Opponent',
    });
    tracker.applyLogDerivedEntityUpdates([
      {
        entityId: 80,
        cardId: 'RLK_101',
        zone: 'HAND',
        controllerId: 1,
        info: { originalController: 1, originalZone: 'DECK' },
      },
    ]);
    tracker.recordExtraDisplayEntityTag({
      entityId: 80,
      tag: 'TAG_SCRIPT_DATA_NUM_1',
      value: 3,
    });

    expect(tracker.getSnapshot().extraDisplay?.counters['counter.RLK_101']).toBe(3);
    expect(tracker.getSnapshot().extraDisplay?.counters['cardState.RLK_101']).toBe(3);
  });

  it('builds extra-display deck pools from remaining deck metadata', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [
      deckWithCards(1, 'A', [
        { cardId: 'BEAST_CARD', count: 2 },
        { cardId: 'DRAGON_CARD', count: 1 },
        { cardId: 'HOLY_SPELL', count: 1 },
      ]),
    ];
    state.deckState = {
      friendlyDeck: [
        { entityId: 1, cardId: 'BEAST_CARD' },
        { entityId: 2, cardId: 'BEAST_CARD' },
        { entityId: 3, cardId: 'DRAGON_CARD' },
        { entityId: 4, cardId: 'HOLY_SPELL' },
      ],
      opposingDeckCount: 20,
    };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = { friendly: [], opposing: [] };
    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
      cardMetadataLookup: (cardId) => {
        if (cardId === 'BEAST_CARD') return { type: 'MINION', races: ['BEAST'], cost: 2 };
        if (cardId === 'DRAGON_CARD') return { type: 'MINION', races: ['DRAGON'], cost: 5 };
        if (cardId === 'HOLY_SPELL') return { type: 'SPELL', spellSchool: 'HOLY', cost: 3 };
        return null;
      },
    });
    tracker.start();
    await advanceTicks(4);

    const pools = tracker.getSnapshot().extraDisplay!.pools;
    expect(pools.beastsRemainingInDeck).toEqual([{ cardId: 'BEAST_CARD', count: 2 }]);
    expect(pools['deckPool.CORE_DMF_194']).toEqual([{ cardId: 'DRAGON_CARD', count: 1 }]);
    expect(pools.holySpellsRemainingInDeck).toEqual([{ cardId: 'HOLY_SPELL', count: 1 }]);
    tracker.stop();
  });

  it('keeps an opponent played card out of the friendly graveyard even if a later update has the local controller', () => {
    const { mirror } = makeMirror();
    const tracker = new DeckTracker({ mirror });
    tracker.getGame().setPlayers({
      localControllerId: 2,
      localName: 'Local',
      opposingControllerId: 1,
      opposingName: 'Opponent',
    });

    tracker.recordCardPlayed({
      entityId: 30,
      cardId: 'CS2_029',
      controllerId: 1,
      timestamp: 1,
    });
    tracker.applyLogDerivedEntityUpdates([
      { entityId: 30, cardId: 'CS2_029', zone: 'GRAVEYARD', controllerId: 2 },
    ]);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.friendlyGraveyard.map((record) => record.cardId)).not.toContain('CS2_029');
    expect(snapshot.opponent.graveyard.map((record) => record.cardId)).toEqual(['CS2_029']);
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

  it('opponent records have a created flag defaulting to false', async () => {
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
    tracker.applyLogDerivedEntityUpdates([
      { entityId: 20, info: { originalController: 2, originalZone: 'DECK' } },
    ]);

    const record = tracker.getSnapshot().opponent.revealed[0];
    expect(record).toBeDefined();
    expect(record!.created).toBe(false);
    tracker.stop();
  });

  it('propagates entity.info.created to OpponentCardRecord', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = {
      friendly: [],
      opposing: [
        { entityId: 30, cardId: 'CS2_029', zonePosition: 1, attack: 0, health: 0, damage: 0 },
      ],
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    tracker.recordCardPlayed({
      entityId: 30,
      cardId: 'CS2_029',
      controllerId: 2,
      timestamp: 1,
    });
    // Mark the entity created via the log-derived ingestion path.
    tracker.applyLogDerivedEntityUpdates([
      { entityId: 30, info: { created: true } },
    ]);

    const record = tracker.getSnapshot().opponent.revealed.find(
      (r) => r.entityId === 30,
    );
    expect(record?.created).toBe(true);
    tracker.stop();
  });

  it('resolves opponentClass via cardClassLookup', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = {
      friendly: [],
      opposing: [
        { entityId: 20, cardId: 'HERO_08', zonePosition: 0, attack: 0, health: 30, damage: 0 },
        { entityId: 21, cardId: 'CS2_029', zonePosition: 1, attack: 0, health: 0, damage: 0 },
      ],
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
      cardClassLookup: (cardId) => (cardId === 'HERO_08' ? 'MAGE' : null),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().opponentClass).toBe('MAGE');
    tracker.stop();
  });

  it('opponentClass is null when no cardClassLookup is provided', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = {
      friendly: [],
      opposing: [
        { entityId: 20, cardId: 'HERO_08', zonePosition: 0, attack: 0, health: 30, damage: 0 },
      ],
    };

    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
    });
    tracker.start();
    await advanceTicks(4);

    expect(tracker.getSnapshot().opponentClass).toBe(null);
    tracker.stop();
  });

  it('opponentClass is cached across mid-match entity gaps', async () => {
    const { mirror, state } = makeMirror();
    state.matchInfo = fakeMatch();
    state.decks = [fakeDeck(1, 'A')];
    state.deckState = { friendlyDeck: [], opposingDeckCount: 20 };
    state.handState = { friendlyHand: [], opposingHandCount: 5 };
    state.boardState = {
      friendly: [],
      opposing: [
        { entityId: 20, cardId: 'HERO_08', zonePosition: 0, attack: 0, health: 30, damage: 0 },
      ],
    };

    let lookupCalls = 0;
    const tracker = new DeckTracker({
      mirror,
      identifier: new CallbackDeckIdentifier(async () => 1),
      cardClassLookup: (cardId) => {
        lookupCalls++;
        return cardId === 'HERO_08' ? 'MAGE' : null;
      },
    });
    tracker.start();
    await advanceTicks(4);
    expect(tracker.getSnapshot().opponentClass).toBe('MAGE');
    const callsAfterFirstResolve = lookupCalls;

    // Hero entity disappears mid-turn (e.g., transition).
    state.boardState = { friendly: [], opposing: [] };
    await advanceTicks(2);

    // Cached value is still served; no new lookup needed.
    expect(tracker.getSnapshot().opponentClass).toBe('MAGE');
    expect(lookupCalls).toBe(callsAfterFirstResolve);
    tracker.stop();
  });
});
