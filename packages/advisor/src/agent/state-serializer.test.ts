import type { CardDef } from '@hdt/hearthdb';
import { describe, expect, test } from 'vitest';

import { serializeAdvisorState } from './state-serializer';
import type { AdvisorSerializableSnapshot } from './state-serializer';

const cards: Record<string, CardDef> = {
  CS2_029: {
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
  EX1_008: {
    id: 'EX1_008',
    dbfId: 1,
    name: 'Argent Squire',
    cost: 1,
    attack: 1,
    health: 1,
    text: 'Divine Shield.',
    cardClass: 'NEUTRAL',
    rarity: 'COMMON',
    set: 'EXPERT1',
    type: 'MINION',
    mechanics: ['DIVINE_SHIELD'],
    collectible: true,
  },
  EX1_133: {
    id: 'EX1_133',
    dbfId: 9,
    name: "Perdition's Blade",
    cost: 3,
    attack: 2,
    health: 2,
    text: 'Battlecry: Deal 1 damage.',
    cardClass: 'ROGUE',
    rarity: 'RARE',
    set: 'EXPERT1',
    type: 'WEAPON',
    collectible: true,
  },
  HERO_08bp: {
    id: 'HERO_08bp',
    dbfId: 725,
    name: 'Armor Up!',
    cost: 2,
    text: 'Gain 2 Armor.',
    cardClass: 'WARRIOR',
    set: 'CORE',
    type: 'HERO_POWER',
    collectible: false,
  },
  TAUNT: {
    id: 'TAUNT',
    dbfId: 99,
    name: 'Shield Guard',
    cost: 3,
    attack: 2,
    health: 3,
    text: 'Taunt.',
    cardClass: 'NEUTRAL',
    rarity: 'COMMON',
    set: 'TEST',
    type: 'MINION',
    mechanics: ['TAUNT'],
    collectible: true,
  },
  SOURCE: {
    id: 'SOURCE',
    dbfId: 100,
    name: 'Scout',
    cost: 2,
    cardClass: 'NEUTRAL',
    set: 'TEST',
    type: 'MINION',
    collectible: true,
  },
};

const cardLookup = (cardId: string): CardDef | null => cards[cardId] ?? null;

describe('advisor state serializer', () => {
  test('serializes a compact markdown state with card metadata', () => {
    const snapshot: AdvisorSerializableSnapshot = {
      phase: 'IN_MATCH',
      turn: 6,
      isMulligan: false,
      friendlyMana: { available: 4, total: 5 },
      friendlyHand: ['CS2_029', 'EX1_008'],
      opposingHandCount: 4,
      opponentRevealed: [{ cardId: 'EX1_008', created: true }],
      opponentGraveyard: [{ cardId: 'TAUNT', created: false }],
      friendlyGraveyard: [{ cardId: 'CS2_029', created: false }],
      boardAttackToFace: { friendly: 5, opposing: 0 },
      friendlyHero: { health: 20, armor: 3, effectiveHealth: 23 },
      opposingHero: { health: 12, armor: 0, effectiveHealth: 12 },
      friendlyHeroPower: { cardId: 'HERO_08bp' },
      opposingHeroPower: null,
      friendlyWeapon: { cardId: 'EX1_133', atk: 2, durability: 2 },
      opposingWeapon: null,
      boardMinions: {
        friendly: [
          {
            entityId: 101,
            cardId: 'EX1_008',
            atk: 1,
            health: 1,
            maxHealth: 1,
            taunt: false,
            divineShield: true,
            poisonous: false,
            frozen: false,
            asleep: false,
            windfury: false,
            silenced: false,
          },
        ],
        opposing: [
          {
            entityId: 201,
            cardId: 'TAUNT',
            atk: 2,
            health: 3,
            maxHealth: 3,
            taunt: true,
            divineShield: false,
            poisonous: false,
            frozen: false,
            asleep: false,
            windfury: false,
            silenced: false,
          },
        ],
      },
      deck: {
        remaining: [
          { cardId: 'CS2_029', count: 1 },
          { cardId: 'EX1_008', count: 2 },
        ],
        knownPositions: [
          {
            cardId: 'CS2_029',
            controllerId: 1,
            placement: 'bottom',
            insertedAt: 0,
            sourceCardId: 'SOURCE',
          },
        ],
      },
    };

    expect(serializeAdvisorState({ snapshot, cardLookup })).toMatchInlineSnapshot(`
      "# Hearthstone State
      - Phase: IN_MATCH
      - Turn: 6
      - Mulligan: no
      - Mana: 4/5
      - Friendly face damage this turn: 5

      ## Heroes
      - Friendly: 20 health, 3 armor, 23 effective
      - Opposing: 12 health, 0 armor, 12 effective
      - Friendly hero power: Armor Up! [HERO_08bp] (HERO_POWER) - Gain 2 Armor.
      - Friendly weapon: Perdition's Blade [EX1_133] 2 attack / 2 durability

      ## Hand
      - Fireball [CS2_029] cost 4 SPELL - Deal $6 damage.
      - Argent Squire [EX1_008] cost 1 MINION 1/1 - Divine Shield.

      ## Board
      Friendly:
      - Argent Squire [EX1_008] 1/1, atk 1; divineShield
      Opposing:
      - Shield Guard [TAUNT] 3/3, atk 2; taunt

      ## Opponent
      - Hand size: 4
      Revealed:
      - Argent Squire [EX1_008] (generated)
      Graveyard:
      - Shield Guard [TAUNT]

      ## Friendly Graveyard
      - Fireball [CS2_029]

      ## Deck
      - Remaining cards: 3
      - Fireball [CS2_029] x1
      - Argent Squire [EX1_008] x2
      - Known bottom: Fireball [CS2_029] from Scout [SOURCE]"
    `);
  });
});
