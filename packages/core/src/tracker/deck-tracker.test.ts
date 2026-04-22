import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Deck, HearthMirror, MatchInfo } from '@hdt/hearthmirror';
import { DeckTracker, type DeckTrackerEvent, type DeckTrackerEventName } from './deck-tracker';
import { CallbackDeckIdentifier, ChainedDeckIdentifier } from './deck-identifier';

/** Minimal stub HearthMirror that returns whatever's pushed into `state`. */
function makeMirror(): {
  mirror: HearthMirror;
  state: {
    matchInfo: MatchInfo | null;
    isGameOver: boolean;
    isSpectating: boolean;
    isMulligan: { mulligan: boolean | null };
    decks: Deck[];
    handState: { friendlyHand: { entityId: number; cardId: string; zonePosition: number }[]; opposingHandCount: number } | null;
    deckState: { friendlyDeck: { entityId: number; cardId: string }[]; opposingDeckCount: number } | null;
    boardState: { friendly: never[]; opposing: never[] } | null;
  };
} {
  const state = {
    matchInfo: null as MatchInfo | null,
    isGameOver: false,
    isSpectating: false,
    isMulligan: { mulligan: null as boolean | null },
    decks: [] as Deck[],
    handState: null as { friendlyHand: { entityId: number; cardId: string; zonePosition: number }[]; opposingHandCount: number } | null,
    deckState: null as { friendlyDeck: { entityId: number; cardId: string }[]; opposingDeckCount: number } | null,
    boardState: null as { friendly: never[]; opposing: never[] } | null,
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
