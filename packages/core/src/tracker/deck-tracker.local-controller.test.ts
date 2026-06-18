import { describe, expect, it } from 'vitest';
import { DeckTracker } from './deck-tracker';
import type { HearthMirror } from '@hdt/hearthmirror';

function stubMirror(): HearthMirror {
  const noopAsync = async (): Promise<null> => null;
  return {
    getMatchInfo: noopAsync,
    isSpectating: async () => false,
    isGameOver: async () => false,
    getDeckState: noopAsync,
    getHandState: noopAsync,
    getBoardState: noopAsync,
    isMulligan: async () => ({ mulligan: null }),
    getSelectedDeckId: noopAsync,
    getDecks: noopAsync,
    getBattleTag: noopAsync,
    getMedalInfo: noopAsync,
    isAlive: async () => true,
    getAccountId: noopAsync,
    getGameType: noopAsync,
    getHearthstoneWindow: noopAsync,
  } as unknown as HearthMirror;
}

function makeTracker(): DeckTracker {
  return new DeckTracker({ mirror: stubMirror() });
}

describe('applyLocalControllerId (mirror-absent identity)', () => {
  it('sets local + opposing controllerIds from a log-resolved id', () => {
    const tracker = makeTracker();
    tracker.applyLocalControllerId(2);
    const g = tracker.getGame();
    expect(g.localPlayer.controllerId).toBe(2);
    expect(g.opposingPlayer.controllerId).toBe(1);
  });

  it('is idempotent — preserves the Player object when unchanged', () => {
    const tracker = makeTracker();
    tracker.applyLocalControllerId(1);
    const before = tracker.getGame().localPlayer;
    tracker.applyLocalControllerId(1);
    expect(tracker.getGame().localPlayer).toBe(before);
  });
});
