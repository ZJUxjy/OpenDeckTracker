import { CardDb, type CardDef } from '@hdt/hearthdb';
import { describe, expect, test } from 'vitest';

import { lookupCard } from './card-lookup-tool';

const cards: CardDef[] = [
  {
    id: 'CS2_029',
    dbfId: 2,
    name: 'Fireball',
    cost: 4,
    text: 'Deal $6 damage.',
    cardClass: 'MAGE',
    rarity: 'FREE',
    set: 'CORE',
    type: 'SPELL',
    collectible: true,
  },
  {
    id: 'EX1_008',
    dbfId: 1,
    name: 'Argent Squire',
    cost: 1,
    attack: 1,
    health: 1,
    cardClass: 'NEUTRAL',
    rarity: 'COMMON',
    set: 'EXPERT1',
    type: 'MINION',
    mechanics: ['DIVINE_SHIELD'],
    collectible: true,
  },
];

describe('card lookup tool', () => {
  const cardDb = new CardDb(cards);

  test('looks up full card text by card id', () => {
    expect(lookupCard({ cardDb, cardId: 'CS2_029' })).toMatchObject({
      id: 'CS2_029',
      name: 'Fireball',
      text: 'Deal $6 damage.',
    });
  });

  test('looks up a card by case-insensitive name query', () => {
    expect(lookupCard({ cardDb, name: 'fireBALL' })?.id).toBe('CS2_029');
  });

  test('returns null when neither id nor name can be resolved', () => {
    expect(lookupCard({ cardDb, cardId: 'MISSING_CARD', name: 'not a card' })).toBeNull();
  });
});
