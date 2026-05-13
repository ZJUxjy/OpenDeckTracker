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
import { parsePowerLine, type PowerEvent } from '@hdt/hearthwatcher';

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

  it('Tame Pet uses the play-block controller so local player 2 effects stay friendly', () => {
    const tracker = new DeckTracker({ mirror: stubMirror() });
    tracker.getGame().setPlayers({
      localControllerId: 2,
      localName: 'Local',
      opposingControllerId: 1,
      opposingName: 'Opponent',
    });
    const detector = new CardPlayedDetector({
      emit: (e) => tracker.recordCardPlayed(e),
      clock: () => 1234,
    });

    const lines = [
      'D 18:13:34.0866681 GameState.DebugPrintPower() -     SHOW_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=28 zone=DECK zonePos=0 cardId= player=1] CardID=MEND_300',
      'D 18:14:00.0214235 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=驯服宠物 id=28 zone=HAND zonePos=1 cardId=MEND_300 player=2] EffectCardId= EffectIndex=0 Target=0 SubOption=-1',
      'D 18:14:00.0214235 GameState.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=驯服宠物 id=28 zone=HAND zonePos=1 cardId=MEND_300 player=2] tag=ZONE value=PLAY',
    ];
    for (const line of lines) {
      const event = parsePowerLine(line);
      if (event !== null) detector.handle(event);
    }

    const snap = tracker.getSnapshot();
    expect(snap.friendlyEffects.map((effect) => effect.id)).toEqual(['tame-pet']);
    expect(snap.opposingEffects).toEqual([]);
  });
});
