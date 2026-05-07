/**
 * End-to-end smoke against real Hearthstone Power.log lines captured
 * from a real game where Tame Pet was cast. Lives in `apps/desktop`
 * (not `@hdt/core`) because it exercises `parsePowerLine` from
 * `@hdt/hearthwatcher` together with the `@hdt/core` detector.
 *
 * Catches the parser → detector contract drift that left the original
 * detector silently dropping every play because Power.log encodes the
 * controller as `player=N` inside the entity bracket (PLAYER_ID), not
 * as `tag=CONTROLLER`.
 */
import { describe, expect, it, vi } from 'vitest';
import { CardPlayedDetector } from '@hdt/core';
import { parsePowerLine } from '@hdt/hearthwatcher';

const TAME_PET_CAST_LINES = [
  'D 18:13:34.0866681 GameState.DebugPrintPower() -     SHOW_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=28 zone=DECK zonePos=0 cardId= player=1] CardID=MEND_300',
  'D 18:14:00.0214235 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=驯服宠物 id=28 zone=HAND zonePos=1 cardId=MEND_300 player=1] EffectCardId= EffectIndex=0 Target=0 SubOption=-1',
  'D 18:14:00.0214235 GameState.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=驯服宠物 id=28 zone=HAND zonePos=1 cardId=MEND_300 player=1] tag=ZONE value=PLAY',
];

describe('CardPlayedDetector against real HS Power.log', () => {
  it('emits exactly one cardPlayed for a real Tame Pet cast', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    for (const raw of TAME_PET_CAST_LINES) {
      const ev = parsePowerLine(raw);
      if (ev) det.handle(ev);
    }
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toMatchObject({
      cardId: 'MEND_300',
      controllerId: 1,
    });
  });
});
