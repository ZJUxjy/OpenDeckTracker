import { describe, expect, it } from 'vitest';
import { CardDb, type CardDef } from '@hdt/hearthdb';
import { makeCollectibleLookup } from './deck-card-lookup';

let nextDbfId = 1;

function card(overrides: Partial<CardDef> & Pick<CardDef, 'id'>): CardDef {
  return {
    id: overrides.id,
    dbfId: overrides.dbfId ?? nextDbfId++,
    name: overrides.name ?? overrides.id,
    cardClass: overrides.cardClass ?? 'HUNTER',
    rarity: overrides.rarity ?? 'COMMON',
    set: overrides.set ?? 'SET_1957',
    type: overrides.type ?? 'MINION',
    collectible: overrides.collectible ?? false,
    ...(overrides.text !== undefined ? { text: overrides.text } : {}),
  };
}

describe('deck-card-lookup', () => {
  it('marks Fabled bundle cards as valid live-deck-only cards', () => {
    const db = new CardDb([
      card({
        id: 'TIME_609',
        dbfId: 119707,
        name: 'Ranger General Sylvanas',
        rarity: 'LEGENDARY',
        collectible: true,
        text: '<b>Fabled</b>. Battlecry: Deal 2 damage to all enemies.',
      }),
      card({
        id: 'TIME_609t1',
        dbfId: 119705,
        name: 'Ranger Captain Alleria',
        rarity: 'LEGENDARY',
        collectible: false,
      }),
    ]);

    expect(makeCollectibleLookup(db)('TIME_609t1')).toEqual({
      collectible: false,
      validInLiveDeck: true,
    });
  });

  it('does not allow ordinary non-collectible tokens', () => {
    const db = new CardDb([
      card({
        id: 'TIME_020t2',
        dbfId: 120083,
        name: 'First Portal to Argus',
        cardClass: 'DEMONHUNTER',
        type: 'SPELL',
        collectible: false,
      }),
      card({
        id: 'TIME_020t2t',
        dbfId: 120142,
        name: "Fleeing Ur'zul",
        cardClass: 'DEMONHUNTER',
        collectible: false,
      }),
    ]);

    expect(makeCollectibleLookup(db)('TIME_020t2t')).toEqual({
      collectible: false,
      validInLiveDeck: false,
    });
  });
});
