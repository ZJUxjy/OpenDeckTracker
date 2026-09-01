import { describe, expect, it } from 'vitest';
import {
  COLLAPSING_STAR_DAMAGE_KEY,
  COLLAPSING_STAR_HERO_POWER_ID,
  IMP_FORMANT_CARD_ID,
  IMP_FORMANTS_IN_OPPONENT_DECK_KEY,
  IMP_FORMANTS_SUMMONED_THIS_GAME_KEY,
  JAILBIRD_CARD_ID,
  KABAL_MASTERMIND_ACTIVE_KEY,
  KABAL_MASTERMIND_ENCHANTMENT_ID,
  MINIONS_REBORN_THIS_GAME_KEY,
  SLIME_EM_DESTROYED_FRIENDLY_KEY,
  SLIME_EM_TOKEN_CARD_ID,
  STEALTH_ATTACKED_WHILE_IN_HAND_KEY,
  TRICKS_OF_THE_TRADE_CARD_ID,
} from './extra-display-ids';
import { MatchExtraDisplayState, type ExtraDisplayCardLookup } from './extra-display-state';

const lookup: ExtraDisplayCardLookup = (cardId) => {
  if (cardId === IMP_FORMANT_CARD_ID) {
    return { type: 'MINION', races: ['DEMON'], name: 'Imp-formant', cost: 3 };
  }
  if (cardId === 'REBORN_MINION') {
    return { type: 'MINION', mechanics: ['REBORN'], cost: 3 };
  }
  if (cardId === 'SILENCED_REBORN') {
    return { type: 'MINION', mechanics: ['REBORN'], cost: 2 };
  }
  if (cardId === TRICKS_OF_THE_TRADE_CARD_ID) return { type: 'SPELL', cost: 1 };
  if (cardId === JAILBIRD_CARD_ID) return { type: 'MINION', mechanics: ['TAUNT'], cost: 4 };
  if (cardId === 'STEALTH_MINION') return { type: 'MINION', mechanics: ['STEALTH'], cost: 2 };
  if (cardId === 'HAND_SPELL') return { type: 'SPELL', cost: 2 };
  return { type: 'MINION', cost: 1 };
};

describe('MatchExtraDisplayState 36.4 history', () => {
  it('counts Imp-formants sitting in the opponent deck', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityZoneChange({
      entityId: 201,
      cardId: IMP_FORMANT_CARD_ID,
      previousZone: null,
      zone: 'DECK',
      controllerId: 2,
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordEntityZoneChange({
      entityId: 202,
      cardId: IMP_FORMANT_CARD_ID,
      previousZone: null,
      zone: 'DECK',
      controllerId: 2,
      localControllerId: 1,
      cardLookup: lookup,
    });

    const snapshot = state.snapshot();
    expect(snapshot.counters[IMP_FORMANTS_IN_OPPONENT_DECK_KEY]).toBe(2);
    expect(snapshot.pools[IMP_FORMANTS_IN_OPPONENT_DECK_KEY]).toEqual([
      { cardId: IMP_FORMANT_CARD_ID, count: 2 },
    ]);
  });

  it('treats an Imp-formant entering the local PLAY zone as summoned for the player', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityZoneChange({
      entityId: 203,
      cardId: IMP_FORMANT_CARD_ID,
      previousZone: 'DECK',
      zone: 'HAND',
      controllerId: 2,
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordEntityZoneChange({
      entityId: 203,
      cardId: IMP_FORMANT_CARD_ID,
      previousZone: 'HAND',
      zone: 'PLAY',
      controllerId: 1,
      localControllerId: 1,
      cardLookup: lookup,
    });

    const snapshot = state.snapshot();
    expect(snapshot.counters[IMP_FORMANTS_IN_OPPONENT_DECK_KEY] ?? 0).toBe(0);
    expect(snapshot.counters[IMP_FORMANTS_SUMMONED_THIS_GAME_KEY]).toBe(1);
  });

  it('marks Kabal Mastermind as active when its rest-of-game enchantment enters play', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityZoneChange({
      entityId: 300,
      cardId: KABAL_MASTERMIND_ENCHANTMENT_ID,
      previousZone: null,
      zone: 'PLAY',
      controllerId: 1,
      localControllerId: 1,
      cardLookup: lookup,
    });
    expect(state.snapshot().counters[KABAL_MASTERMIND_ACTIVE_KEY]).toBe(1);
  });

  it('counts friendly discards from HAND to GRAVEYARD', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityZoneChange({
      entityId: 40,
      cardId: 'HAND_SPELL',
      previousZone: 'HAND',
      zone: 'GRAVEYARD',
      controllerId: 1,
      localControllerId: 1,
      cardLookup: lookup,
      discarded: true,
    });
    expect(state.snapshot().counters.cardsDiscardedThisGame).toBe(1);
  });

  it('records a Reborn trigger only after the copy enters play', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityZoneChange({
      entityId: 70,
      cardId: 'REBORN_MINION',
      previousZone: 'PLAY',
      zone: 'GRAVEYARD',
      controllerId: 1,
      localControllerId: 1,
      cardLookup: lookup,
    });
    expect(state.snapshot().pools[MINIONS_REBORN_THIS_GAME_KEY] ?? []).toEqual([]);

    state.recordEntityZoneChange({
      entityId: 71,
      cardId: 'REBORN_MINION',
      previousZone: null,
      zone: 'PLAY',
      controllerId: 1,
      localControllerId: 1,
      cardLookup: lookup,
    });
    expect(state.snapshot().pools[MINIONS_REBORN_THIS_GAME_KEY]).toEqual([
      { cardId: 'REBORN_MINION', count: 1 },
    ]);
  });

  it('does not count a Reborn death whose copy never returns', () => {
    const state = new MatchExtraDisplayState();
    state.recordTurnChange(1);
    state.recordEntityZoneChange({
      entityId: 72,
      cardId: 'SILENCED_REBORN',
      previousZone: 'PLAY',
      zone: 'GRAVEYARD',
      controllerId: 1,
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordTurnChange(2);
    expect(state.snapshot().pools[MINIONS_REBORN_THIS_GAME_KEY] ?? []).toEqual([]);
  });

  it('attaches Follow enchantments to the targeted hand entity', () => {
    const state = new MatchExtraDisplayState();
    state.recordFollowAttach({
      enchantmentEntityId: 500,
      targetEntityId: 80,
      targetCardId: 'PIRATE_CARD',
      sourceCardId: 'CAP_101',
    });
    expect(state.snapshot().followedHand).toEqual([
      {
        entityId: 80,
        cardId: 'PIRATE_CARD',
        sourceCardId: 'CAP_101',
        enchantmentEntityId: 500,
      },
    ]);
    state.syncFollowedHandEntities([]);
    expect(state.snapshot().followedHand).toBeUndefined();
  });

  it('flags Tricks of the Trade copies held during a stealth attack', () => {
    const state = new MatchExtraDisplayState();
    state.syncHandEntities([{ entityId: 90, cardId: TRICKS_OF_THE_TRADE_CARD_ID }]);
    state.recordFriendlyStealthMinionAttacked();
    expect(state.snapshot().counters[`${STEALTH_ATTACKED_WHILE_IN_HAND_KEY}.90`]).toBe(1);
    state.syncHandEntities([]);
    expect(state.snapshot().counters[`${STEALTH_ATTACKED_WHILE_IN_HAND_KEY}.90`]).toBe(1);
  });

  it('stores a Slime em destroyed-friendly snapshot on the generated token', () => {
    const state = new MatchExtraDisplayState();
    state.recordSlimeEmBoardSnapshot(['A', 'B', 'A']);
    state.recordEntityZoneChange({
      entityId: 805,
      cardId: SLIME_EM_TOKEN_CARD_ID,
      previousZone: null,
      zone: 'HAND',
      controllerId: 1,
      localControllerId: 1,
      cardLookup: lookup,
    });
    expect(state.snapshot().pools[`${SLIME_EM_DESTROYED_FRIENDLY_KEY}.805`]).toEqual([
      { cardId: 'A', count: 2 },
      { cardId: 'B', count: 1 },
    ]);
  });

  it('aliases collapsing-star hero-power script values', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityTagValue({
      entity: { entityId: 9, cardId: COLLAPSING_STAR_HERO_POWER_ID },
      isFriendly: true,
      tag: 'TAG_SCRIPT_DATA_NUM_1',
      value: 4,
    });
    expect(state.snapshot().counters[COLLAPSING_STAR_DAMAGE_KEY]).toBe(4);
    expect(state.snapshot().counters.collapsingStarHeroPowerActive).toBe(1);
  });

  it('applies Prepare discounts to Jailbird copies currently in hand', () => {
    const state = new MatchExtraDisplayState();
    state.syncHandEntities([{ entityId: 453, cardId: JAILBIRD_CARD_ID }]);
    state.recordPrepareAction({
      entityId: 12,
      cardId: 'JAIL_407',
      isFriendly: true,
      baseCost: 6,
      effectiveCost: 3,
      discount: 3,
      cardLookup: (cardId) =>
        cardId === 'JAIL_407' ? { mechanics: ['PREPARE'] } : { mechanics: [] },
    });
    expect(state.snapshot().counters['jailbirdPrepareDiscountForEntity.453']).toBe(3);
  });

  it('initializes last-turn booleans on the first turn change', () => {
    const state = new MatchExtraDisplayState();
    state.recordTurnChange(1);
    expect(state.snapshot().counters.friendlySpellCastLastTurn).toBe(0);
    expect(state.snapshot().counters.elementalPlayedLastTurn).toBe(0);
  });

  it('counts friendly hero attacks', () => {
    const state = new MatchExtraDisplayState();
    state.recordFriendlyCharacterAttack({ hero: true });
    state.recordFriendlyCharacterAttack({ hero: false });
    expect(state.snapshot().counters.friendlyCharacterAttacksThisGame).toBe(2);
  });
});
