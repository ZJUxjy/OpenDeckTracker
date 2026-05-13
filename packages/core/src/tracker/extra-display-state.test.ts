import { describe, expect, it } from 'vitest';
import { MatchExtraDisplayState, type ExtraDisplayCardLookup } from './extra-display-state';

const lookup: ExtraDisplayCardLookup = (cardId) => {
  if (cardId === 'FEL_SPELL') return { type: 'SPELL', spellSchool: 'FEL', cost: 2 };
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

  it('credits friendly minion deaths to entities currently in the local hand', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityEnteredHand({ entityId: 70, cardId: 'FEL_RAGE' });

    state.recordEntityEnteredGraveyard({
      entity: { entityId: 71, cardId: 'BEAST_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 72, cardId: 'DEMON_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });

    const snap = state.snapshot();
    expect(snap.infuseProgressByCardId.FEL_RAGE).toEqual({
      friendlyDeaths: 2,
      friendlyDemonDeaths: 1,
      friendlyBeastDeaths: 1,
      cumulativeAttack: 5,
    });
  });

  it('tracks race-scoped and attack-sum hand progress', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityEnteredHand({ entityId: 73, cardId: 'HAND_INFUSE' });
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 74, cardId: 'BEAST_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 75, cardId: 'TOTEM_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });

    expect(state.snapshot().infuseProgressByCardId.HAND_INFUSE).toEqual({
      friendlyDeaths: 2,
      friendlyDemonDeaths: 0,
      friendlyBeastDeaths: 1,
      friendlyTotemDeaths: 1,
      cumulativeAttack: 2,
    });
  });

  it('does not credit deaths to entities not currently in hand, and persists credits across bounce', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityEnteredHand({ entityId: 80, cardId: 'FEL_RAGE' });
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 81, cardId: 'DEMON_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });
    expect(state.snapshot().infuseProgressByCardId.FEL_RAGE?.friendlyDemonDeaths).toBe(1);

    state.recordEntityLeftHand(80);
    // Deaths while out of hand should NOT increment credits.
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 82, cardId: 'DEMON_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });
    expect(state.snapshot().infuseProgressByCardId.FEL_RAGE).toBeUndefined();

    // On re-entering hand, persisted credits are restored.
    state.recordEntityEnteredHand({ entityId: 80, cardId: 'FEL_RAGE' });
    expect(state.snapshot().infuseProgressByCardId.FEL_RAGE).toEqual({
      friendlyDeaths: 1,
      friendlyDemonDeaths: 1,
      cumulativeAttack: 3,
    });
  });

  it('syncs in-hand entities from reflected hand snapshots', () => {
    const state = new MatchExtraDisplayState();
    state.syncFriendlyHandEntities([{ entityId: 100, cardId: 'FEL_RAGE' }]);
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 101, cardId: 'DEMON_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });
    expect(state.snapshot().infuseProgressByCardId.FEL_RAGE?.friendlyDemonDeaths).toBe(1);

    state.syncFriendlyHandEntities([]);
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 102, cardId: 'DEMON_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });
    expect(state.snapshot().infuseProgressByCardId.FEL_RAGE).toBeUndefined();
  });

  it('aggregates infuse progress per cardId by the best in-hand instance', () => {
    const state = new MatchExtraDisplayState();
    state.recordEntityEnteredHand({ entityId: 90, cardId: 'FEL_RAGE' });
    state.recordEntityEnteredGraveyard({
      entity: { entityId: 91, cardId: 'DEMON_MINION' },
      isFriendly: true,
      cardLookup: lookup,
    });
    // Second copy enters hand later, so it starts at 0.
    state.recordEntityEnteredHand({ entityId: 92, cardId: 'FEL_RAGE' });

    const progress = state.snapshot().infuseProgressByCardId.FEL_RAGE;
    expect(progress?.friendlyDemonDeaths).toBe(1); // Best of (1, 0).
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
});
