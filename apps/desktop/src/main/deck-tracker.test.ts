import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckTrackerEvent, DeckTrackerEventName, NormalizedCompletedMatch } from '@hdt/core';

type HeraldTriggerEvent = { entityId: number; blockType: 'TRIGGER' | 'POWER' };

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
  let heraldTriggerEmit: ((event: HeraldTriggerEvent) => void) | null = null;
  const tracker = {
    on: vi.fn((event: string, handler: (event: unknown) => void) => {
      handlers.set(event, handler);
      return () => undefined;
    }),
    start: vi.fn(),
    stop: vi.fn(),
    getSnapshot: vi.fn(() => null),
    applyLogDerivedEntityUpdates: vi.fn(),
    resetGlobalEffects: vi.fn(),
    recordHeraldTriggered: vi.fn(),
    selectDeckById: vi.fn(async () => undefined),
    cancelDeckSelection: vi.fn(),
  };
  const cardPlayedDetector = {
    handle: vi.fn(),
    reset: vi.fn(),
  };
  const heraldTriggerDetector = {
    handle: vi.fn(),
    reset: vi.fn(),
  };

  const deckStore = {
    getActiveDeckId: vi.fn(() => null as string | null),
    getById: vi.fn(() => null),
  };

  return {
    handlers,
    tracker,
    cardPlayedDetector,
    heraldTriggerDetector,
    setHeraldTriggerEmit: (emit: (event: HeraldTriggerEvent) => void) => {
      heraldTriggerEmit = emit;
    },
    getHeraldTriggerEmit: () => heraldTriggerEmit,
    deckStore,
    DeckTracker: vi.fn(() => tracker),
    getHearthMirror: vi.fn(() => ({ })),
    recordCompletedMatch: vi.fn(),
    liveMatchIdentity: {
      current: vi.fn((): { fingerprint: string; startedAt: number } | null => null),
    },
    ipcMain: { handle: vi.fn() },
    app: { on: vi.fn() },
    send: vi.fn(),
  };
});

vi.mock('@hdt/core', () => ({
  DeckTracker: mocks.DeckTracker,
  CardPlayedDetector: vi.fn().mockImplementation(() => mocks.cardPlayedDetector),
  HeraldTriggerDetector: vi.fn().mockImplementation((args: {
    emit: (event: HeraldTriggerEvent) => void;
  }) => {
    mocks.setHeraldTriggerEmit(args.emit);
    return mocks.heraldTriggerDetector;
  }),
  zoneFromNumber: (value: number) =>
    ({ 0: 'INVALID', 1: 'PLAY', 2: 'DECK', 3: 'HAND', 4: 'GRAVEYARD', 5: 'REMOVEDFROMGAME', 6: 'SETASIDE', 7: 'SECRET' })[value] ?? 'INVALID',
  createLocalPlayerResolver: () => ({
    observe: vi.fn(),
    reset: vi.fn(),
    localControllerId: null,
  }),
}));

vi.mock('./hearthmirror', () => ({
  getHearthMirror: mocks.getHearthMirror,
}));

vi.mock('./stats-host', () => ({
  recordCompletedMatch: mocks.recordCompletedMatch,
}));

vi.mock('./match-identity', () => ({
  liveMatchIdentity: mocks.liveMatchIdentity,
}));

vi.mock('electron', () => ({
  app: mocks.app,
  ipcMain: mocks.ipcMain,
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: { send: mocks.send },
      },
    ],
  },
}));

const completedMatch: NormalizedCompletedMatch = {
  fingerprint: 'match-a',
  startedAt: 1_000,
  endedAt: 2_000,
  durationSeconds: 1,
  result: 'unknown',
  playOrder: 'unknown',
  deckId: 42,
  deckName: 'Recorded Real Deck',
  opponentName: 'Opponent',
  opponentClass: null,
  gameType: 3,
  formatType: 2,
  source: 'deck-tracker',
};

describe('deck-tracker main host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.liveMatchIdentity.current.mockReturnValue(null);
    vi.resetModules();
  });

  it('records completed matches before broadcasting match-ended', async () => {
    const { startDeckTracker } = await import('./deck-tracker');
    startDeckTracker(mocks.deckStore as never);

    const event: DeckTrackerEvent = {
      type: 'match-ended',
      snapshot: { phase: 'POST_MATCH' } as DeckTrackerEvent['snapshot'],
      completedMatch,
    };
    mocks.handlers.get('match-ended' satisfies DeckTrackerEventName)?.(event);

    expect(mocks.recordCompletedMatch).toHaveBeenCalledWith(completedMatch);
    expect(mocks.send).toHaveBeenCalledWith(
      'deck-tracker:event',
      expect.objectContaining({ type: 'match-ended', completedMatch }),
    );
  });

  it('records match-ended with live fingerprint override', async () => {
    mocks.liveMatchIdentity.current.mockReturnValue({
      fingerprint: 'match-v2-1000-1',
      startedAt: 1_000,
    });
    const { startDeckTracker } = await import('./deck-tracker');
    startDeckTracker(mocks.deckStore as never);

    const event: DeckTrackerEvent = {
      type: 'match-ended',
      snapshot: { phase: 'POST_MATCH' } as DeckTrackerEvent['snapshot'],
      completedMatch: {
        ...completedMatch,
        fingerprint: 'legacy-fingerprint',
      },
    };
    mocks.handlers.get('match-ended' satisfies DeckTrackerEventName)?.(event);

    expect(mocks.recordCompletedMatch).toHaveBeenCalledWith({
      ...completedMatch,
      fingerprint: 'match-v2-1000-1',
    });
  });

  it('registers deck tracker IPC handlers', async () => {
    const { registerDeckTrackerIpc } = await import('./deck-tracker');
    registerDeckTrackerIpc();

    expect(mocks.ipcMain.handle).toHaveBeenCalledWith(
      'deck-tracker:get-snapshot',
      expect.any(Function),
    );
    expect(mocks.ipcMain.handle).toHaveBeenCalledWith(
      'deck-tracker:select-deck',
      expect.any(Function),
    );
  });

  it('forwards Power.log entity updates into the core tracker state', async () => {
    const { forwardPowerEventToDeckTracker, startDeckTracker } = await import('./deck-tracker');
    startDeckTracker(mocks.deckStore as never);

    forwardPowerEventToDeckTracker(
      {
        type: 'full-entity',
        entityId: 42,
        cardId: 'MEND_300',
        tags: { ZONE: 'HAND', PLAYER_ID: 2 },
        raw: '',
        content: '',
      },
      'replay',
    );

    expect(mocks.tracker.applyLogDerivedEntityUpdates).toHaveBeenCalledWith([
      { entityId: 42, cardId: 'MEND_300', zone: 'HAND', controllerId: 2 },
    ]);
  });

  it('forwards Herald trigger detector events to the tracker', async () => {
    const { forwardPowerEventToDeckTracker, startDeckTracker } = await import('./deck-tracker');
    startDeckTracker(mocks.deckStore as never);

    const event = {
      type: 'block-start',
      blockType: 'TRIGGER',
      entity: '[entityName=Herald Minion id=22 zone=PLAY cardId=CATA_158 player=1]',
      effectCardId: '',
      raw: '',
      content: '',
    };
    forwardPowerEventToDeckTracker(event as never, 'replay');

    expect(mocks.heraldTriggerDetector.handle).toHaveBeenCalledWith(event);

    mocks.getHeraldTriggerEmit()?.({ entityId: 22, blockType: 'TRIGGER' });

    expect(mocks.tracker.recordHeraldTriggered).toHaveBeenCalledWith({
      entityId: 22,
      blockType: 'TRIGGER',
    });
  });

  it('resets the Herald trigger detector on create-game', async () => {
    const { forwardPowerEventToDeckTracker, startDeckTracker } = await import('./deck-tracker');
    startDeckTracker(mocks.deckStore as never);

    forwardPowerEventToDeckTracker({ type: 'create-game', raw: '', content: '' } as never, 'replay');

    expect(mocks.heraldTriggerDetector.reset).toHaveBeenCalled();
  });

  it('backfills card id and controller from TAG_CHANGE entity refs', async () => {
    const { forwardPowerEventToDeckTracker, startDeckTracker } = await import('./deck-tracker');
    startDeckTracker(mocks.deckStore as never);

    forwardPowerEventToDeckTracker(
      {
        type: 'tag-change',
        entity: 42,
        tag: 'ZONE',
        value: 'GRAVEYARD',
        raw: '',
        content:
          'TAG_CHANGE Entity=[entityName=驯服宠物 id=42 zone=PLAY zonePos=0 cardId=MEND_300 player=1] tag=ZONE value=GRAVEYARD',
      },
      'replay',
    );

    expect(mocks.tracker.applyLogDerivedEntityUpdates).toHaveBeenCalledWith([
      { entityId: 42, cardId: 'MEND_300', zone: 'GRAVEYARD', controllerId: 1 },
    ]);
  });

  it('exposes opposing hero effective health through the board attack context', async () => {
    const { forwardPowerEventToDeckTracker, startDeckTracker } = await import('./deck-tracker');
    startDeckTracker(mocks.deckStore as never);

    forwardPowerEventToDeckTracker(
      {
        type: 'full-entity',
        entityId: 7,
        cardId: 'HERO_08',
        tags: {
          CARDTYPE: 3,
          CONTROLLER: 2,
          ZONE: 'PLAY',
          HEALTH: 30,
          DAMAGE: 8,
          ARMOR: 5,
        },
        raw: '',
        content: '',
      },
      'replay',
    );

    const trackerCalls = mocks.DeckTracker.mock.calls as unknown as Array<[
      {
        boardAttackContextProvider: (
          boardState: null,
          matchInfo: { localPlayer: { id: number } } | null,
          localControllerId: number,
        ) => {
          friendlyHero?: { health: number; armor: number; effectiveHealth: number } | null;
          opposingHero?: { health: number; armor: number; effectiveHealth: number } | null;
        };
      },
    ]>;
    const trackerArgs = trackerCalls[0]![0];

    const context = trackerArgs.boardAttackContextProvider(null, null, 1);
    expect(context.opposingHero).toEqual({
      health: 22,
      armor: 5,
      effectiveHealth: 27,
    });
    expect(context.friendlyHero).toBeNull();
  });

  it('exposes hero attack availability through the board attack context', async () => {
    const { forwardPowerEventToDeckTracker, startDeckTracker } = await import('./deck-tracker');
    startDeckTracker(mocks.deckStore as never);

    forwardPowerEventToDeckTracker(
      {
        type: 'full-entity',
        entityId: 7,
        cardId: 'HERO_08',
        tags: {
          CARDTYPE: 3,
          CONTROLLER: 1,
          ZONE: 'PLAY',
          ATK: 5,
          NUM_ATTACKS_THIS_TURN: 1,
        },
        raw: '',
        content: '',
      },
      'replay',
    );

    const trackerCalls = mocks.DeckTracker.mock.calls as unknown as Array<[
      {
        boardAttackContextProvider: (
          boardState: null,
          matchInfo: { localPlayer: { id: number } } | null,
          localControllerId: number,
        ) => {
          heroAttacks?: Array<{
            controllerId: number;
            attack: number;
            numAttacksThisTurn?: number;
          }>;
        };
      },
    ]>;
    const trackerArgs = trackerCalls[0]![0];

    expect(
      trackerArgs.boardAttackContextProvider(null, null, 1).heroAttacks,
    ).toEqual([
      expect.objectContaining({
        controllerId: 1,
        attack: 5,
        numAttacksThisTurn: 1,
      }),
    ]);
  });

  it('uses tracker-supplied localControllerId regardless of matchInfo', async () => {
    // Mid-restart scenario: matchInfo.localPlayer.id is still 0 but the
    // tracker's resolved local controller is 2 (the user is player 2).
    // The board-attack context must trust the tracker, not matchInfo.
    const { forwardPowerEventToDeckTracker, startDeckTracker } = await import('./deck-tracker');
    startDeckTracker(mocks.deckStore as never);

    forwardPowerEventToDeckTracker(
      {
        type: 'full-entity',
        entityId: 7,
        cardId: 'HERO_08',
        tags: { CARDTYPE: 3, CONTROLLER: 2, ZONE: 'PLAY', ATK: 4 },
        raw: '',
        content: '',
      },
      'replay',
    );
    forwardPowerEventToDeckTracker(
      {
        type: 'full-entity',
        entityId: 8,
        cardId: 'HERO_05',
        tags: { CARDTYPE: 3, CONTROLLER: 1, ZONE: 'PLAY', ATK: 3 },
        raw: '',
        content: '',
      },
      'replay',
    );

    const trackerCalls = mocks.DeckTracker.mock.calls as unknown as Array<[
      {
        boardAttackContextProvider: (
          boardState: null,
          matchInfo: { localPlayer: { id: number } } | null,
          localControllerId: number,
        ) => { localControllerId?: number };
      },
    ]>;
    const trackerArgs = trackerCalls[0]![0];

    // matchInfo.localPlayer.id=0 (or null) — provider must ignore it.
    const ctx = trackerArgs.boardAttackContextProvider(null, { localPlayer: { id: 0 } }, 2);
    expect(ctx.localControllerId).toBe(2);
  });
});
