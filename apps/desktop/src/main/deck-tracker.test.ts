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
    selectDeckById: vi.fn(async () => undefined),
    cancelDeckSelection: vi.fn(),
  };

  return {
    handlers,
    tracker,
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
  CardPlayedDetector: vi.fn().mockImplementation(() => ({
    handle: vi.fn(),
    reset: vi.fn(),
  })),
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
});
