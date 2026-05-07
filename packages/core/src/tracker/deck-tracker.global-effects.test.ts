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

describe('DeckTrackerSnapshot global-effects fields', () => {
  it('IDLE snapshot has both effects arrays as empty', () => {
    const tracker = new DeckTracker({ mirror: stubMirror() });
    const snap = tracker.getSnapshot();
    expect(snap.friendlyEffects).toEqual([]);
    expect(snap.opposingEffects).toEqual([]);
  });

  it('recordCardPlayed against the local controller propagates to friendlyEffects', () => {
    const tracker = new DeckTracker({ mirror: stubMirror() });
    tracker.recordCardPlayed({
      cardId: 'CATA_216',
      controllerId: tracker.getGame().localPlayer.controllerId,
      entityId: 1,
      timestamp: 5000,
    });
    const snap = tracker.getSnapshot();
    expect(snap.friendlyEffects).toHaveLength(1);
    expect(snap.friendlyEffects[0]?.id).toBe('cleansing-cleric');
    expect(snap.opposingEffects).toEqual([]);
  });

  it('reset (via PRE_MATCH→IDLE simulation) drains the snapshot', () => {
    const tracker = new DeckTracker({ mirror: stubMirror() });
    tracker.recordCardPlayed({
      cardId: 'CATA_216',
      controllerId: 1,
      entityId: 1,
      timestamp: 1000,
    });
    expect(tracker.getSnapshot().friendlyEffects).toHaveLength(1);

    tracker.resetGlobalEffects();
    expect(tracker.getSnapshot().friendlyEffects).toEqual([]);
    expect(tracker.getSnapshot().opposingEffects).toEqual([]);
  });
});
