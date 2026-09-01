import { describe, expect, it } from 'vitest';
import { IMP_FORMANT_CARD_ID } from './extra-display-ids';
import { scanLiveExtraDisplay } from './extra-display-live-scan';

describe('scanLiveExtraDisplay', () => {
  it('counts Imp-formants in the opponent deck and Bloodsport minions in hand', () => {
    const scan = scanLiveExtraDisplay({
      localControllerId: 1,
      cardLookup: (cardId) =>
        cardId === 'CAP_004' ? { mechanics: ['DISGUISED'] } : { mechanics: [] },
      entities: [
        { entityId: 10, cardId: IMP_FORMANT_CARD_ID, zone: 'DECK', controllerId: 2 },
        { entityId: 11, cardId: IMP_FORMANT_CARD_ID, zone: 'DECK', controllerId: 2 },
        { entityId: 12, cardId: IMP_FORMANT_CARD_ID, zone: 'DECK', controllerId: 1 },
        { entityId: 20, cardId: 'TIME_850t', zone: 'HAND', controllerId: 1 },
        { entityId: 21, cardId: 'TIME_850t1', zone: 'HAND', controllerId: 1 },
        { entityId: 30, cardId: 'CAP_004', zone: 'PLAY', controllerId: 2 },
        { entityId: 31, cardId: 'CAP_004', zone: 'PLAY', controllerId: 1 },
      ],
    });

    expect(scan.counters.impFormantsInOpponentDeck).toBe(2);
    expect(scan.pools.impFormantsInOpponentDeck).toEqual([
      { cardId: IMP_FORMANT_CARD_ID, count: 2 },
    ]);
    expect(scan.counters.bloodsportMinionsInHand).toBe(2);
    expect(scan.pools.bloodsportMinionsInHand).toEqual([
      { cardId: 'TIME_850t', count: 1 },
      { cardId: 'TIME_850t1', count: 1 },
    ]);
    expect(scan.disguisedBoard).toEqual([
      { entityId: 30, cardId: 'CAP_004', side: 'opponent' },
      { entityId: 31, cardId: 'CAP_004', side: 'friendly' },
    ]);
  });
});
