import { describe, expect, it } from 'vitest';
import { MatchExtraDisplayState, type ExtraDisplayCardLookup } from './extra-display-state';

const lookup: ExtraDisplayCardLookup = (cardId) => {
  if (cardId === 'FEL_SPELL') return { type: 'SPELL', spellSchool: 'FEL', cost: 2 };
  if (cardId === 'TAME_PET') return { type: 'SPELL', cost: 1 };
  if (cardId === 'FIRE_SPELL') return { type: 'SPELL', spellSchool: 'FIRE', cost: 2 };
  if (cardId === 'HOLY_SPELL') return { type: 'SPELL', spellSchool: 'HOLY', cost: 2 };
  if (cardId === 'SHADOW_SPELL') return { type: 'SPELL', spellSchool: 'SHADOW', cost: 2 };
  if (cardId === 'DEMON_MINION') return { type: 'MINION', races: ['DEMON'], cost: 3, attack: 3, name: 'Demon Minion' };
  if (cardId === 'NAGA_DEMON') return { type: 'MINION', races: ['NAGA', 'DEMON'], cost: 4 };
  if (cardId === 'BEAST_MINION') return { type: 'MINION', races: ['BEAST'], cost: 3, attack: 2 };
  if (cardId === 'TOTEM_MINION') return { type: 'MINION', races: ['TOTEM'], cost: 1, attack: 0 };
  if (cardId === 'DRAGON_MINION') return { type: 'MINION', races: ['DRAGON'], cost: 8, attack: 8 };
  if (cardId === 'UNDEAD_DEATHRATTLE') return { type: 'MINION', races: ['UNDEAD'], mechanics: ['DEATHRATTLE'], cost: 6 };
  if (cardId === 'TAUNT_MINION') return { type: 'MINION', mechanics: ['TAUNT'], cost: 2 };
  if (cardId === 'IMP_MINION') return { type: 'MINION', races: ['DEMON'], cost: 1, name: 'Imp Minion' };
  if (cardId === 'FEL_RAGE') return { type: 'SPELL', spellSchool: 'FEL', cost: 5 };
  if (cardId === 'OVERLOAD_TWO') {
    return { type: 'SPELL', cost: 2, mechanics: ['OVERLOAD'], text: 'Overload: (2)' };
  }
  if (cardId === 'HERALD_BATTLECRY') {
    return {
      type: 'MINION',
      mechanics: ['HERALD', 'BATTLECRY'],
      text: '<b>Battlecry:</b> <b>Herald</b> {0}.',
    };
  }
  if (cardId === 'HERALD_DEATHRATTLE') {
    return {
      type: 'MINION',
      mechanics: ['HERALD', 'DEATHRATTLE'],
      text: '<b>Deathrattle:</b> <b>Herald</b> {0}.',
    };
  }
  if (cardId === 'HERALD_LOCATION') {
    return {
      type: 'LOCATION',
      mechanics: ['HERALD'],
      text: '<b>Herald</b> {0}. Draw a card.',
    };
  }
  if (cardId === 'OPP_MINION_A' || cardId === 'OPP_MINION_B') {
    return { type: 'MINION', cost: 3 };
  }
  return null;
};

const baseEvent = (cardId: string, entityId: number) => ({
  cardId,
  controllerId: 1,
  entityId,
  timestamp: 100,
});

describe('MatchExtraDisplayState', () => {
  it('counts local Fel spells as a game-wide counter', () => {
    const state = new MatchExtraDisplayState();
    state.recordCardPlayed({
      event: baseEvent('FEL_SPELL', 10),
      localControllerId: 1,
      cardLookup: lookup,
    });

    expect(state.snapshot().counters.felSpellsCastThisGame).toBe(1);
    expect(state.snapshot().counters.spellsCastThisGame).toBe(1);
  });

  it('records friendly script-value tags as card counter and state entries', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityTagValue({
      entity: { entityId: 12, cardId: 'RLK_101' },
      isFriendly: true,
      tag: 'TAG_SCRIPT_DATA_NUM_1',
      value: 2,
    });

    const counters = state.snapshot().counters;
    expect(counters['counter.RLK_101']).toBe(2);
    expect(counters['cardState.RLK_101']).toBe(2);
  });

  it('uses metadata carried on the played-card event when CardDb lookup is unavailable', () => {
    const state = new MatchExtraDisplayState();
    state.recordCardPlayed({
      event: {
        ...baseEvent('UNKNOWN_FEL_SPELL', 11),
        cardType: 'SPELL',
        spellSchool: 'FEL',
      },
      localControllerId: 1,
      cardLookup: null,
    });

    expect(state.snapshot().counters.felSpellsCastThisGame).toBe(1);
    expect(state.snapshot().counters.spellsCastThisGame).toBe(1);
  });

  it('records local one-cost cards played this game for replay-pool previews', () => {
    const state = new MatchExtraDisplayState();
    state.recordCardPlayed({
      event: baseEvent('TAME_PET', 12),
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordCardPlayed({
      event: baseEvent('TAME_PET', 13),
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordCardPlayed({
      event: baseEvent('FEL_SPELL', 14),
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordCardPlayed({
      event: { ...baseEvent('TAME_PET', 15), controllerId: 2 },
      localControllerId: 1,
      cardLookup: lookup,
    });

    expect(state.snapshot().pools.oneCostCardsPlayedThisGameDistinct).toEqual([
      { cardId: 'TAME_PET', count: 2 },
    ]);
  });

  it('records local Ranger Sylvanas-family cards played this game for hover previews', () => {
    const state = new MatchExtraDisplayState();
    state.recordCardPlayed({
      event: baseEvent('TIME_609t1', 16),
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordCardPlayed({
      event: baseEvent('TIME_609', 17),
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordCardPlayed({
      event: { ...baseEvent('TIME_609t2', 18), controllerId: 2 },
      localControllerId: 1,
      cardLookup: lookup,
    });

    expect(state.snapshot().pools.rangerSylvanasCardsPlayedThisGame).toEqual([
      { cardId: 'TIME_609t1', count: 1 },
      { cardId: 'TIME_609', count: 1 },
    ]);
  });

  it('tracks friendly minion deaths this turn and resets them on turn changes', () => {
    const state = new MatchExtraDisplayState();
    state.recordTurnChange(3);
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 20, cardId: 'BEAST_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });

    expect(state.snapshot().counters.friendlyMinionsDiedThisTurn).toBe(1);
    expect(state.snapshot().counters.friendlyMinionDeathsThisGame).toBe(1);

    state.recordTurnChange(4);
    expect(state.snapshot().counters.friendlyMinionsDiedThisTurn).toBe(0);
    expect(state.snapshot().counters.friendlyMinionDeathsThisGame).toBe(1);
  });

  it('dedupes graveyard entry events and builds the friendly dead demon pool', () => {
    const state = new MatchExtraDisplayState();
    const entity = { entityId: 30, cardId: 'DEMON_MINION' };

    state.recordEntityEnteredGraveyard({ entity, isFriendly: true, cardLookup: lookup });
    state.recordEntityEnteredGraveyard({ entity, isFriendly: true, cardLookup: lookup });

    const snapshot = state.snapshot();
    expect(snapshot.counters.friendlyMinionDeathsThisGame).toBe(1);
    expect(snapshot.pools.friendlyDeadDemonsThisGameUnique).toEqual([
      { cardId: 'DEMON_MINION', count: 1 },
    ]);
  });

  it('weights the dead demon pool by instance when two different entities share a cardId', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 30, cardId: 'DEMON_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 31, cardId: 'DEMON_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });

    const snapshot = state.snapshot();
    expect(snapshot.pools.friendlyDeadDemonsThisGameUnique).toEqual([
      { cardId: 'DEMON_MINION', count: 2 },
    ]);
    expect(snapshot.counters.friendlyDemonDeathsThisGame).toBe(2);
  });

  it('counts multi-race demons (Demon+Naga) as a demon for the friendly demon pool', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 40, cardId: 'NAGA_DEMON' },
      isFriendly: true,
      cardLookup: lookup,
    });
    expect(state.snapshot().pools.friendlyDeadDemonsThisGameUnique).toEqual([
      { cardId: 'NAGA_DEMON', count: 1 },
    ]);
  });

  it('builds race, deathrattle, taunt, cost and turn graveyard pools', () => {
    const state = new MatchExtraDisplayState();
    state.recordTurnChange(1);
    for (const [idx, cardId] of ['DRAGON_MINION', 'UNDEAD_DEATHRATTLE', 'TAUNT_MINION', 'IMP_MINION'].entries()) {
      state.recordEntityEnteredGraveyard({
        entity: { entityId: 200 + idx, cardId },
        isFriendly: true,
        cardLookup: lookup,
      });
    }

    const snap = state.snapshot();
    expect(snap.pools.friendlyDeadDragonsThisGameUnique).toEqual([{ cardId: 'DRAGON_MINION', count: 1 }]);
    expect(snap.pools.friendlyDeadUndeadHighestCostPoolThisGame).toEqual([{ cardId: 'UNDEAD_DEATHRATTLE', count: 1 }]);
    expect(snap.pools.friendlyDeadDeathrattleMinionsThisGameUnique).toEqual([{ cardId: 'UNDEAD_DEATHRATTLE', count: 1 }]);
    expect(snap.pools.friendlyDeadTauntMinionsThisGameUnique).toEqual([{ cardId: 'TAUNT_MINION', count: 1 }]);
    expect(snap.pools.friendlyDeadMinionsCost1).toEqual([{ cardId: 'IMP_MINION', count: 1 }]);
    expect(snap.pools.friendlyGraveyardThisTurn).toHaveLength(4);

    state.recordTurnChange(2);
    expect(state.snapshot().pools.friendlyGraveyardThisTurn ?? []).toEqual([]);
  });

  it('does not place opposing-side deaths into the friendly pool', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 50, cardId: 'DEMON_MINION' },
      isFriendly: false,
      cardLookup: lookup,
    });

    const snapshot = state.snapshot();
    expect(snapshot.counters.friendlyMinionDeathsThisGame ?? 0).toBe(0);
    expect(snapshot.pools.friendlyDeadDemonsThisGameUnique).toEqual([]);
    expect(snapshot.counters.minionDeathsThisGameBothPlayers).toBe(1);
  });

  it('resets fire/holy/shadow per-turn spell counters on turn change', () => {
    const state = new MatchExtraDisplayState();
    state.recordTurnChange(1);
    state.recordCardPlayed({ event: baseEvent('FIRE_SPELL', 60), localControllerId: 1, cardLookup: lookup });
    state.recordCardPlayed({ event: baseEvent('HOLY_SPELL', 61), localControllerId: 1, cardLookup: lookup });
    state.recordCardPlayed({ event: baseEvent('SHADOW_SPELL', 62), localControllerId: 1, cardLookup: lookup });
    state.recordCardPlayed({ event: baseEvent('FEL_SPELL', 63), localControllerId: 1, cardLookup: lookup });

    let snap = state.snapshot();
    expect(snap.counters.fireSpellsCastThisTurnByYou).toBe(1);
    expect(snap.counters.holySpellsCastThisTurn).toBe(1);
    expect(snap.counters.shadowSpellsCastThisTurn).toBe(1);
    expect(snap.counters.friendlySpellsCastThisTurn).toBe(4);
    expect(snap.counters.felSpellsCastThisGame).toBe(1);

    state.recordTurnChange(2);
    snap = state.snapshot();
    expect(snap.counters.fireSpellsCastThisTurnByYou).toBe(0);
    expect(snap.counters.holySpellsCastThisTurn).toBe(0);
    expect(snap.counters.shadowSpellsCastThisTurn).toBe(0);
    expect(snap.counters.friendlySpellsCastThisTurn).toBe(0);
    // Game-wide counter must not reset.
    expect(snap.counters.felSpellsCastThisGame).toBe(1);
  });

  it('ignores opponent-played spells', () => {
    const state = new MatchExtraDisplayState();
    state.recordCardPlayed({
      event: { ...baseEvent('FEL_SPELL', 100), controllerId: 2 },
      localControllerId: 1,
      cardLookup: lookup,
    });
    expect(state.snapshot().counters.felSpellsCastThisGame ?? 0).toBe(0);
  });

  it('counts play-timed Herald cards when the local player plays them', () => {
    const state = new MatchExtraDisplayState();

    state.recordCardPlayed({
      event: baseEvent('HERALD_BATTLECRY', 500),
      localControllerId: 1,
      cardLookup: lookup,
    });

    expect(state.snapshot().counters.heraldCountThisGame).toBe(1);
  });

  it('does not count deathrattle or location Herald cards on ordinary play', () => {
    const state = new MatchExtraDisplayState();

    state.recordCardPlayed({
      event: baseEvent('HERALD_DEATHRATTLE', 501),
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordCardPlayed({
      event: baseEvent('HERALD_LOCATION', 502),
      localControllerId: 1,
      cardLookup: lookup,
    });

    expect(state.snapshot().counters.heraldCountThisGame ?? 0).toBe(0);
  });

  it('counts non-play Herald triggers when their block timing matches', () => {
    const state = new MatchExtraDisplayState();

    state.recordHeraldTriggered({
      cardId: 'HERALD_DEATHRATTLE',
      blockType: 'TRIGGER',
      isFriendly: true,
      cardLookup: lookup,
    });
    state.recordHeraldTriggered({
      cardId: 'HERALD_LOCATION',
      blockType: 'POWER',
      isFriendly: true,
      cardLookup: lookup,
    });

    expect(state.snapshot().counters.heraldCountThisGame).toBe(2);
  });

  it('ignores opponent Herald triggers for the local extra-display counter', () => {
    const state = new MatchExtraDisplayState();

    state.recordHeraldTriggered({
      cardId: 'HERALD_DEATHRATTLE',
      blockType: 'TRIGGER',
      isFriendly: false,
      cardLookup: lookup,
    });

    expect(state.snapshot().counters.heraldCountThisGame ?? 0).toBe(0);
  });

  it('tracks opponent minions played last turn that remain on board for Ebonok', () => {
    const state = new MatchExtraDisplayState();
    state.recordOpponentCardPlayed({
      event: { ...baseEvent('OPP_MINION_A', 50), controllerId: 2 },
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordOpponentCardPlayed({
      event: { ...baseEvent('OPP_MINION_B', 51), controllerId: 2 },
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordCardPlayed({
      event: baseEvent('FEL_SPELL', 52),
      localControllerId: 1,
      cardLookup: lookup,
    });

    expect(
      state.opponentMinionsPlayedLastTurnStillInPlay(new Set([50])).map((e) => e.cardId),
    ).toEqual(['OPP_MINION_A']);
    expect(
      state.opponentMinionsPlayedLastTurnStillInPlay(new Set([50, 51])).map((e) => e.cardId),
    ).toEqual(['OPP_MINION_A', 'OPP_MINION_B']);
  });

  it('counts totems summoned, overload crystals, and cards played outside the initial deck', () => {
    const state = new MatchExtraDisplayState();
    state.setOriginalDeckCardIds(['DECK_ONLY']);

    state.recordCardPlayed({
      event: baseEvent('TOTEM_MINION', 40),
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordCardPlayed({
      event: baseEvent('OVERLOAD_TWO', 41),
      localControllerId: 1,
      cardLookup: lookup,
    });
    state.recordCardPlayed({
      event: baseEvent('FEL_SPELL', 42),
      localControllerId: 1,
      cardLookup: lookup,
    });

    const snap = state.snapshot();
    expect(snap.counters.friendlyTotemsSummonedThisGame).toBe(1);
    expect(snap.counters.totalOverloadedCrystalsThisGame).toBe(2);
    expect(snap.counters.cardsPlayedNotFromInitialDeckThisGame).toBe(3);
  });
});
