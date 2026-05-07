/**
 * Integration smoke for the watcher → tracker registry forwarding.
 *
 * We can't easily boot the full Electron deck-tracker host inside
 * vitest (it owns IPC + BrowserWindow plumbing), so this test exercises
 * the same wiring building blocks the host uses: `CardPlayedDetector`
 * → `DeckTracker.recordCardPlayed` → snapshot.
 */
import { describe, expect, it } from 'vitest';
import { CardPlayedDetector, DeckTracker } from '@hdt/core';
import type { HearthMirror } from '@hdt/hearthmirror';
import type { PowerEvent } from '@hdt/hearthwatcher';

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

const empty = { raw: '', content: '' } as const;

describe('main host watcher → tracker forwarding', () => {
  it('Cleansing Cleric play surfaces in the next snapshot', () => {
    const tracker = new DeckTracker({ mirror: stubMirror() });
    const detector = new CardPlayedDetector({
      emit: (e) => tracker.recordCardPlayed(e),
      clock: () => 1234,
    });

    const events: PowerEvent[] = [
      {
        type: 'full-entity',
        entityId: 64,
        cardId: 'CATA_216',
        tags: { CONTROLLER: 1, ZONE: 'HAND' },
        ...empty,
      },
      {
        type: 'tag-change',
        entity: 64,
        tag: 'ZONE',
        value: 'PLAY',
        ...empty,
      },
    ];
    for (const ev of events) detector.handle(ev);

    const snap = tracker.getSnapshot();
    expect(snap.friendlyEffects).toHaveLength(1);
    expect(snap.friendlyEffects[0]?.id).toBe('cleansing-cleric');
  });
});
