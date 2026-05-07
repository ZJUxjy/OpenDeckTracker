import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckTrackerEvent, DeckTrackerEventName, NormalizedCompletedMatch } from '@hdt/core';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
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
    selectDeckById: vi.fn(async () => undefined),
    cancelDeckSelection: vi.fn(),
  };
  const cardPlayedDetector = {
    handle: vi.fn(),
    reset: vi.fn(),
  };

  return {
    handlers,
    tracker,
    cardPlayedDetector,
    DeckTracker: vi.fn(() => tracker),
    getHearthMirror: vi.fn(() => ({ })),
    recordCompletedMatch: vi.fn(),
    ipcMain: { handle: vi.fn() },
    app: { on: vi.fn() },
    send: vi.fn(),
  };
});

vi.mock('@hdt/core', () => ({
  DeckTracker: mocks.DeckTracker,
  CardPlayedDetector: vi.fn().mockImplementation(() => mocks.cardPlayedDetector),
  zoneFromNumber: (value: number) =>
    ({ 0: 'INVALID', 1: 'PLAY', 2: 'DECK', 3: 'HAND', 4: 'GRAVEYARD', 5: 'REMOVEDFROMGAME', 6: 'SETASIDE', 7: 'SECRET' })[value] ?? 'INVALID',
}));

vi.mock('./hearthmirror', () => ({
  getHearthMirror: mocks.getHearthMirror,
}));

vi.mock('./stats-host', () => ({
  recordCompletedMatch: mocks.recordCompletedMatch,
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
    vi.resetModules();
  });

  it('records completed matches before broadcasting match-ended', async () => {
    const { startDeckTracker } = await import('./deck-tracker');
    startDeckTracker();

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
    startDeckTracker();

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

  it('backfills card id and controller from TAG_CHANGE entity refs', async () => {
    const { forwardPowerEventToDeckTracker, startDeckTracker } = await import('./deck-tracker');
    startDeckTracker();

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
});
