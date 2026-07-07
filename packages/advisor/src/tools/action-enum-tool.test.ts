import { describe, expect, test } from 'vitest';

import { enumerateActions } from './action-enum-tool';
import type { ActionCardLookup, ActionEnumerationSnapshot } from './action-enum-tool';

const lookup: ActionCardLookup = (cardId) => {
  const cards: Record<string, ReturnType<ActionCardLookup>> = {
    CHEAP_MINION: { id: 'CHEAP_MINION', cost: 2, type: 'MINION' },
    TARGET_SPELL: { id: 'TARGET_SPELL', cost: 3, type: 'SPELL' },
    EXPENSIVE_SPELL: { id: 'EXPENSIVE_SPELL', cost: 6, type: 'SPELL' },
  };
  return cards[cardId] ?? null;
};

function snapshot(overrides: Partial<ActionEnumerationSnapshot>): ActionEnumerationSnapshot {
  return {
    friendlyHand: [],
    friendlyMana: { available: 0, total: 0 },
    boardMinions: { friendly: [], opposing: [] },
    friendlyHeroPower: null,
    ...overrides,
  };
}

describe('action enumeration', () => {
  test('enumerates playable hand cards within current mana', () => {
    const actions = enumerateActions({
      snapshot: snapshot({
        friendlyHand: ['CHEAP_MINION', 'TARGET_SPELL', 'EXPENSIVE_SPELL', 'UNKNOWN_CARD'],
        friendlyMana: { available: 3, total: 3 },
      }),
      cardLookup: lookup,
    });

    expect(actions).toEqual([
      {
        kind: 'play',
        cardId: 'CHEAP_MINION',
        cost: 2,
        targetRequired: false,
        note: 'Playable for 2 mana.',
      },
      {
        kind: 'play',
        cardId: 'TARGET_SPELL',
        cost: 3,
        targetRequired: true,
        note: 'Playable for 3 mana; target may be required.',
      },
      { kind: 'hold', targetRequired: false, note: 'Hold resources for later.' },
      { kind: 'endTurn', targetRequired: false, note: 'End the turn.' },
    ]);
  });

  test('restricts attacks to opposing taunts when taunts are present', () => {
    const actions = enumerateActions({
      snapshot: snapshot({
        boardMinions: {
          friendly: [
            {
              entityId: 101,
              cardId: 'ACTIVE_MINION',
              atk: 4,
              health: 4,
              maxHealth: 4,
              taunt: false,
              divineShield: false,
              poisonous: false,
              frozen: false,
              asleep: false,
              windfury: false,
              silenced: false,
            },
            {
              entityId: 102,
              cardId: 'SLEEPING_MINION',
              atk: 5,
              health: 5,
              maxHealth: 5,
              taunt: false,
              divineShield: false,
              poisonous: false,
              frozen: false,
              asleep: true,
              windfury: false,
              silenced: false,
            },
          ],
          opposing: [
            {
              entityId: 201,
              cardId: 'TAUNT_MINION',
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
            {
              entityId: 202,
              cardId: 'NON_TAUNT_MINION',
              atk: 2,
              health: 2,
              maxHealth: 2,
              taunt: false,
              divineShield: false,
              poisonous: false,
              frozen: false,
              asleep: false,
              windfury: false,
              silenced: false,
            },
          ],
        },
      }),
      cardLookup: lookup,
    });

    expect(actions).toContainEqual({
      kind: 'trade',
      cardId: 'ACTIVE_MINION',
      sourceEntityId: 101,
      targetEntityId: 201,
      targetCardId: 'TAUNT_MINION',
      targetType: 'opposingMinion',
      targetRequired: false,
      note: 'Attack opposing taunt minion.',
    });
    expect(actions).not.toContainEqual(
      expect.objectContaining({ kind: 'attack', targetType: 'opposingHero' }),
    );
    expect(actions).not.toContainEqual(
      expect.objectContaining({ sourceEntityId: 102 }),
    );
  });

  test('enumerates face and minion attacks when no taunt blocks face', () => {
    const actions = enumerateActions({
      snapshot: snapshot({
        boardMinions: {
          friendly: [
            {
              entityId: 101,
              cardId: 'ACTIVE_MINION',
              atk: 4,
              health: 4,
              maxHealth: 4,
              taunt: false,
              divineShield: false,
              poisonous: false,
              frozen: false,
              asleep: false,
              windfury: false,
              silenced: false,
            },
          ],
          opposing: [
            {
              entityId: 202,
              cardId: 'NON_TAUNT_MINION',
              atk: 2,
              health: 2,
              maxHealth: 2,
              taunt: false,
              divineShield: false,
              poisonous: false,
              frozen: false,
              asleep: false,
              windfury: false,
              silenced: false,
            },
          ],
        },
      }),
      cardLookup: lookup,
    });

    expect(actions).toContainEqual({
      kind: 'attack',
      cardId: 'ACTIVE_MINION',
      sourceEntityId: 101,
      targetType: 'opposingHero',
      targetRequired: false,
      note: 'Attack the opposing hero.',
    });
    expect(actions).toContainEqual({
      kind: 'trade',
      cardId: 'ACTIVE_MINION',
      sourceEntityId: 101,
      targetEntityId: 202,
      targetCardId: 'NON_TAUNT_MINION',
      targetType: 'opposingMinion',
      targetRequired: false,
      note: 'Attack opposing minion.',
    });
  });

  test('enumerates hero power when enough mana is available', () => {
    const actions = enumerateActions({
      snapshot: snapshot({
        friendlyMana: { available: 2, total: 2 },
        friendlyHeroPower: { cardId: 'HERO_08bp' },
      }),
      cardLookup: lookup,
    });

    expect(actions).toContainEqual({
      kind: 'heroPower',
      cardId: 'HERO_08bp',
      cost: 2,
      targetRequired: true,
      note: 'Hero power is available for 2 mana; target may be required.',
    });
  });
});
