import type { CardPlayedEvent } from '../global-effects/types';

export interface ExtraDisplayCardMetadata {
  id?: string;
  name?: string;
  type?: string;
  spellSchool?: string;
  races?: readonly string[];
  mechanics?: readonly string[];
  cost?: number;
  attack?: number;
  health?: number;
  text?: string;
}

export interface ExtraDisplayPoolEntry {
  cardId: string;
  count: number;
}

/**
 * Per-card-id Infuse progress, aggregated across all friendly hand
 * instances of that card. Each entry stores how many friendly minion
 * (and demon) deaths have been credited to the *best* in-hand instance
 * of that cardId. If two copies are in hand and one has 2 credits while
 * the other has 0, the entry reports 2 — the player only needs to know
 * "can I infuse if I play this card".
 */
export interface ExtraDisplayInfuseProgress {
  friendlyDeaths: number;
  friendlyDemonDeaths: number;
  friendlyBeastDeaths?: number;
  friendlyTotemDeaths?: number;
  cumulativeAttack?: number;
  spellsCast?: number;
}

export interface ExtraDisplaySnapshot {
  /** Stable scalar states keyed by the review vocabulary names where possible. */
  counters: Record<string, number>;
  /** Card pools that need names/details in the renderer. */
  pools: {
    friendlyDeadDemonsThisGameUnique: ExtraDisplayPoolEntry[];
    friendlyDeadMinionsThisGameUnique: ExtraDisplayPoolEntry[];
    [key: string]: ExtraDisplayPoolEntry[];
  };
  /** Best Infuse progress for each cardId currently in the local hand. */
  infuseProgressByCardId: Record<string, ExtraDisplayInfuseProgress>;
}

export type ExtraDisplayCardLookup = (cardId: string) => ExtraDisplayCardMetadata | null;

interface GraveyardEntity {
  entityId: number;
  cardId: string;
}

const EMPTY_COUNTERS: Readonly<Record<string, number>> = Object.freeze({});

export function createEmptyExtraDisplaySnapshot(): ExtraDisplaySnapshot {
  return {
    counters: { ...EMPTY_COUNTERS },
    pools: {
      friendlyDeadDemonsThisGameUnique: [],
      friendlyDeadMinionsThisGameUnique: [],
    },
    infuseProgressByCardId: {},
  };
}

interface HandEntityTracking {
  cardId: string;
  credits: ExtraDisplayInfuseProgress;
}

export class MatchExtraDisplayState {
  private currentTurn: number | null = null;
  private readonly counters = new Map<string, number>();
  private readonly countedGraveyardEntities = new Set<number>();
  private readonly friendlyDeadDemons = new Map<string, number>();
  private readonly friendlyDeadMinions = new Map<string, number>();
  private readonly poolMaps = new Map<string, Map<string, number>>();
  private readonly friendlyDeadUndeadCosts = new Map<string, number>();
  /** Friendly entities currently held in the local hand, with accumulated Infuse credits. */
  private readonly handEntities = new Map<number, HandEntityTracking>();
  /** Persisted credits for friendly entities that have left and may return to hand. */
  private readonly persistedHandCredits = new Map<number, ExtraDisplayInfuseProgress>();

  reset(): void {
    this.currentTurn = null;
    this.counters.clear();
    this.countedGraveyardEntities.clear();
    this.friendlyDeadDemons.clear();
    this.friendlyDeadMinions.clear();
    this.poolMaps.clear();
    this.friendlyDeadUndeadCosts.clear();
    this.handEntities.clear();
    this.persistedHandCredits.clear();
  }

  recordTurnChange(turn: number): void {
    if (!Number.isFinite(turn)) return;
    if (this.currentTurn === turn) return;
    if (this.currentTurn !== null) {
      this.setCounter(
        'friendlySpellCastLastTurn',
        (this.counters.get('friendlySpellsCastThisTurn') ?? 0) > 0 ? 1 : 0,
      );
      this.setCounter(
        'elementalPlayedLastTurn',
        (this.counters.get('elementalsPlayedThisTurn') ?? 0) > 0 ? 1 : 0,
      );
      this.setCounter('friendlyMinionsDiedThisTurn', 0);
      this.setCounter('friendlyDeathsThisTurn', 0);
      this.setCounter('minionDeathsThisTurnBothPlayers', 0);
      this.setCounter('friendlyCardsPlayedThisTurn', 0);
      this.setCounter('cardsPlayedThisTurn', 0);
      this.setCounter('otherCardsPlayedThisTurn', 0);
      this.setCounter('friendlySpellsCastThisTurn', 0);
      this.setCounter('elementalsPlayedThisTurn', 0);
      this.setCounter('heroPowerUsedThisTurn', 0);
      this.setCounter('fireSpellsCastThisTurnByYou', 0);
      this.setCounter('holySpellsCastThisTurn', 0);
      this.setCounter('shadowSpellsCastThisTurn', 0);
      this.clearPool('friendlyGraveyardThisTurn');
      this.clearPool('friendlyMinionsDiedThisTurnWithDeathrattles');
      this.clearPool('fireSpellsCastThisTurnByYou');
      this.clearPool('holySpellsCastThisTurn');
      this.clearPool('shadowSpellsCastThisTurn');
    }
    this.currentTurn = turn;
    this.setCounter('currentTurn', turn);
  }

  recordCardPlayed(args: {
    event: CardPlayedEvent;
    localControllerId: number;
    cardLookup: ExtraDisplayCardLookup | null;
  }): void {
    if (args.event.controllerId !== args.localControllerId) return;

    const metadata = metadataForPlayedEvent(args.event, args.cardLookup);
    this.increment('friendlyCardsPlayedThisTurn', 1);
    this.increment('friendlyCardsPlayedThisGame', 1);
    this.increment('cardsPlayedThisTurn', 1);
    this.setCounter('otherCardsPlayedThisTurn', this.counters.get('cardsPlayedThisTurn') ?? 0);
    if (typeof metadata.cost === 'number') this.setCounter('lastPlayedCardCost', metadata.cost);

    if (metadata.type === 'HERO_POWER') {
      this.increment('heroPowerUsesThisGame', 1);
      this.setCounter('heroPowerUsedThisTurn', 1);
    }

    if (metadata.type === 'MINION') {
      this.increment('friendlyMinionCardsPlayedThisGame', 1);
      if (hasRace(metadata, 'ELEMENTAL')) this.increment('elementalsPlayedThisTurn', 1);
    }

    if (doesImbueHeroPower(metadata)) {
      this.increment('heroPowerInfuseCountThisGame', 1);
    }

    if (metadata.type !== 'SPELL') return;
    this.increment('spellsCastThisGame', 1);
    this.increment('friendlySpellsCastThisTurn', 1);
    for (const tracking of this.handEntities.values()) {
      tracking.credits.spellsCast = (tracking.credits.spellsCast ?? 0) + 1;
    }

    const school = normalizeToken(metadata.spellSchool);
    if (school === 'FEL') this.increment('felSpellsCastThisGame', 1);
    if (school === 'FIRE') {
      this.increment('fireSpellsCastThisTurnByYou', 1);
      this.incrementPool('fireSpellsCastThisTurnByYou', args.event.cardId);
    }
    if (school === 'HOLY') {
      this.increment('holySpellsCastThisTurn', 1);
      this.incrementPool('holySpellsCastThisTurn', args.event.cardId);
    }
    if (school === 'SHADOW') {
      this.increment('shadowSpellsCastThisTurn', 1);
      this.incrementPool('shadowSpellsCastThisTurn', args.event.cardId);
    }
  }

  recordEntityEnteredGraveyard(args: {
    entity: GraveyardEntity;
    isFriendly: boolean;
    cardLookup: ExtraDisplayCardLookup | null;
  }): void {
    const metadata = args.cardLookup?.(args.entity.cardId) ?? null;
    if (metadata?.type !== 'MINION') return;
    if (this.countedGraveyardEntities.has(args.entity.entityId)) return;
    this.countedGraveyardEntities.add(args.entity.entityId);

    this.increment('minionDeathsThisTurnBothPlayers', 1);
    this.increment('minionDeathsThisGameBothPlayers', 1);
    if (hasMechanic(metadata, 'DEATHRATTLE')) {
      this.incrementPool('graveyardDeathrattleMinionsBothPlayers', args.entity.cardId);
    }

    if (!args.isFriendly) return;
    this.increment('friendlyMinionsDiedThisTurn', 1);
    this.increment('friendlyDeathsThisTurn', 1);
    this.increment('friendlyMinionDeathsThisGame', 1);
    this.increment('friendlyDeathsThisGame', 1);
    incrementMap(this.friendlyDeadMinions, args.entity.cardId);
    this.incrementPool('friendlyDeadMinionPoolThisGameUnique', args.entity.cardId);
    this.incrementPool('friendlyDeadMinionsThisGameUnique', args.entity.cardId);
    this.incrementPool('friendlyGraveyardThisTurn', args.entity.cardId);

    const cost = metadata.cost ?? 0;
    if (cost === 1) this.incrementPool('friendlyDeadMinionsCost1', args.entity.cardId);
    if (cost === 2) this.incrementPool('friendlyDeadMinionsCost2', args.entity.cardId);
    if (cost === 3) this.incrementPool('friendlyDeadMinionsCost3', args.entity.cardId);
    if (cost >= 8) this.incrementPool('distinctFriendlyDeadMinionsCostGte8', args.entity.cardId);

    if (hasMechanic(metadata, 'DEATHRATTLE')) {
      this.incrementPool('friendlyDeadDeathrattleMinionsThisGameUnique', args.entity.cardId);
      this.incrementPool('friendlyGraveyardDeathrattleMinionsThisGame', args.entity.cardId);
      this.incrementPool('friendlyMinionsDiedThisTurnWithDeathrattles', args.entity.cardId);
      if (cost <= 4) this.incrementPool('friendlyDeadDeathrattleMinionsCostLte4Unique', args.entity.cardId);
      if (cost >= 5) this.incrementPool('friendlyDeadDeathrattleMinionsCostGte5Unique', args.entity.cardId);
    }
    if (hasMechanic(metadata, 'TAUNT')) {
      this.incrementPool('friendlyDeadTauntMinionsThisGameUnique', args.entity.cardId);
    }

    const isDemon = hasRace(metadata, 'DEMON');
    const isBeast = hasRace(metadata, 'BEAST');
    const isTotem = hasRace(metadata, 'TOTEM');
    const isDragon = hasRace(metadata, 'DRAGON');
    const isUndead = hasRace(metadata, 'UNDEAD');
    if (isDemon) {
      incrementMap(this.friendlyDeadDemons, args.entity.cardId);
      this.incrementPool('friendlyDeadDemonsThisGameUnique', args.entity.cardId);
      this.increment('friendlyDemonDeathsThisGame', 1);
    }
    if (isBeast) this.incrementPool('friendlyDeadBeastsThisGameWeighted', args.entity.cardId);
    if (isDragon) this.incrementPool('friendlyDeadDragonsThisGameUnique', args.entity.cardId);
    if (isUndead) {
      this.incrementPool('friendlyDeadUndeadThisGameUnique', args.entity.cardId);
      this.friendlyDeadUndeadCosts.set(
        args.entity.cardId,
        Math.max(this.friendlyDeadUndeadCosts.get(args.entity.cardId) ?? 0, cost),
      );
    }
    if (isImp(metadata)) this.incrementPool('friendlyDeadImpsThisGameUnique', args.entity.cardId);
    if (isUnstableSkeleton(args.entity.cardId)) this.increment('friendlyUnstableSkeletonDeathsThisGame', 1);
    if (isTreant(metadata)) this.increment('friendlyTreantDeathsThisGame', 1);
    if (args.entity.cardId === 'EDR_465') this.increment('ysendraDeathsThisGame', 1);

    for (const tracking of this.handEntities.values()) {
      tracking.credits.friendlyDeaths += 1;
      if (isDemon) tracking.credits.friendlyDemonDeaths += 1;
      if (isBeast) tracking.credits.friendlyBeastDeaths = (tracking.credits.friendlyBeastDeaths ?? 0) + 1;
      if (isTotem) tracking.credits.friendlyTotemDeaths = (tracking.credits.friendlyTotemDeaths ?? 0) + 1;
      if (metadata.attack !== undefined && metadata.attack !== 0) {
        tracking.credits.cumulativeAttack = (tracking.credits.cumulativeAttack ?? 0) + metadata.attack;
      }
    }
  }

  /** Track a friendly entity entering the local hand zone. */
  recordEntityEnteredHand(args: { entityId: number; cardId: string }): void {
    if (this.handEntities.has(args.entityId)) {
      const existing = this.handEntities.get(args.entityId)!;
      existing.cardId = args.cardId;
      return;
    }
    const persisted = this.persistedHandCredits.get(args.entityId);
    this.handEntities.set(args.entityId, {
      cardId: args.cardId,
      credits: persisted
        ? { ...persisted }
        : { friendlyDeaths: 0, friendlyDemonDeaths: 0 },
    });
  }

  syncFriendlyHandEntities(cards: readonly { entityId: number; cardId: string }[]): void {
    const liveEntityIds = new Set<number>();
    for (const card of cards) {
      if (card.cardId === '') continue;
      liveEntityIds.add(card.entityId);
      this.recordEntityEnteredHand(card);
    }
    for (const entityId of this.handEntities.keys()) {
      if (!liveEntityIds.has(entityId)) {
        this.recordEntityLeftHand(entityId);
      }
    }
  }

  /** Track a friendly entity leaving the local hand zone (played, discarded, bounced). */
  recordEntityLeftHand(entityId: number): void {
    const tracking = this.handEntities.get(entityId);
    if (!tracking) return;
    this.handEntities.delete(entityId);
    if (hasAnyCredit(tracking.credits)) {
      this.persistedHandCredits.set(entityId, { ...tracking.credits });
    }
  }

  snapshot(): ExtraDisplaySnapshot {
    const infuseProgressByCardId: Record<string, ExtraDisplayInfuseProgress> = {};
    for (const tracking of this.handEntities.values()) {
      const existing = infuseProgressByCardId[tracking.cardId];
      if (!existing) {
        infuseProgressByCardId[tracking.cardId] = { ...tracking.credits };
        continue;
      }
      if (tracking.credits.friendlyDeaths > existing.friendlyDeaths) {
        existing.friendlyDeaths = tracking.credits.friendlyDeaths;
      }
      if (tracking.credits.friendlyDemonDeaths > existing.friendlyDemonDeaths) {
        existing.friendlyDemonDeaths = tracking.credits.friendlyDemonDeaths;
      }
      mergeOptionalMax(existing, tracking.credits, 'friendlyBeastDeaths');
      mergeOptionalMax(existing, tracking.credits, 'friendlyTotemDeaths');
      mergeOptionalMax(existing, tracking.credits, 'cumulativeAttack');
      mergeOptionalMax(existing, tracking.credits, 'spellsCast');
    }
    const pools: ExtraDisplaySnapshot['pools'] = {
      friendlyDeadDemonsThisGameUnique: entriesFromCountMap(this.friendlyDeadDemons),
      friendlyDeadMinionsThisGameUnique: entriesFromCountMap(this.friendlyDeadMinions),
    };
    for (const [key, map] of this.poolMaps) {
      pools[key] = entriesFromCountMap(map);
    }
    pools.friendlyDeadUndeadHighestCostPoolThisGame = this.highestCostUndeadPool();
    pools['graveyardPool.EDR_891'] = pools.friendlyDeadDeathrattleMinionsCostLte4Unique ?? [];
    pools['graveyardPool.EDR_892'] = pools.friendlyDeadDeathrattleMinionsCostGte5Unique ?? [];
    pools['graveyardPool.CORE_ICC_835'] = pools.friendlyDeadTauntMinionsThisGameUnique ?? [];
    pools['graveyardPool.CORE_DAL_721'] = pools.friendlyDeadUndeadThisGameUnique ?? [];
    pools['graveyardPool.EDR_238'] = pools.distinctFriendlyDeadMinionsCostGte8 ?? [];
    return {
      counters: Object.fromEntries([...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b))),
      pools,
      infuseProgressByCardId,
    };
  }

  private increment(key: string, amount: number): void {
    this.setCounter(key, (this.counters.get(key) ?? 0) + amount);
  }

  private setCounter(key: string, value: number): void {
    this.counters.set(key, value);
  }

  private incrementPool(key: string, cardId: string): void {
    let map = this.poolMaps.get(key);
    if (!map) {
      map = new Map<string, number>();
      this.poolMaps.set(key, map);
    }
    incrementMap(map, cardId);
  }

  private clearPool(key: string): void {
    this.poolMaps.delete(key);
  }

  private highestCostUndeadPool(): ExtraDisplayPoolEntry[] {
    const undead = this.poolMaps.get('friendlyDeadUndeadThisGameUnique');
    if (!undead || undead.size === 0) return [];
    let maxCost = -1;
    for (const cardId of undead.keys()) {
      maxCost = Math.max(maxCost, this.friendlyDeadUndeadCosts.get(cardId) ?? 0);
    }
    return [...undead.entries()]
      .filter(([cardId]) => (this.friendlyDeadUndeadCosts.get(cardId) ?? 0) === maxCost)
      .map(([cardId, count]) => ({ cardId, count }))
      .sort((a, b) => b.count - a.count || a.cardId.localeCompare(b.cardId));
  }
}

function metadataForPlayedEvent(
  event: CardPlayedEvent,
  cardLookup: ExtraDisplayCardLookup | null,
): ExtraDisplayCardMetadata {
  const fromLookup = cardLookup?.(event.cardId) ?? null;
  return {
    ...fromLookup,
    ...(event.cardType !== undefined ? { type: event.cardType } : {}),
    ...(event.spellSchool !== undefined ? { spellSchool: event.spellSchool } : {}),
    ...(event.races !== undefined ? { races: event.races } : {}),
  };
}

function mergeOptionalMax(
  target: ExtraDisplayInfuseProgress,
  source: ExtraDisplayInfuseProgress,
  key: 'friendlyBeastDeaths' | 'friendlyTotemDeaths' | 'cumulativeAttack' | 'spellsCast',
): void {
  const value = source[key];
  if (value === undefined) return;
  target[key] = Math.max(target[key] ?? 0, value);
}

function hasAnyCredit(credits: ExtraDisplayInfuseProgress): boolean {
  return credits.friendlyDeaths > 0 ||
    credits.friendlyDemonDeaths > 0 ||
    (credits.friendlyBeastDeaths ?? 0) > 0 ||
    (credits.friendlyTotemDeaths ?? 0) > 0 ||
    (credits.cumulativeAttack ?? 0) > 0 ||
    (credits.spellsCast ?? 0) > 0;
}

function hasRace(metadata: ExtraDisplayCardMetadata, race: string): boolean {
  const expected = normalizeToken(race);
  return (metadata.races ?? []).some((r) => normalizeToken(r) === expected || normalizeToken(r) === 'ALL');
}

function hasMechanic(metadata: ExtraDisplayCardMetadata, mechanic: string): boolean {
  const expected = normalizeToken(mechanic);
  return (metadata.mechanics ?? []).some((m) => normalizeToken(m) === expected);
}

function doesImbueHeroPower(metadata: ExtraDisplayCardMetadata): boolean {
  const text = metadata.text ?? '';
  return /灌注你的英雄技能|Imbue your Hero Power/i.test(text);
}

function isImp(metadata: ExtraDisplayCardMetadata): boolean {
  if (!hasRace(metadata, 'DEMON')) return false;
  return /小鬼|Imp/i.test(metadata.name ?? '');
}

function isTreant(metadata: ExtraDisplayCardMetadata): boolean {
  return /树人|Treant/i.test(metadata.name ?? '');
}

function isUnstableSkeleton(cardId: string): boolean {
  return cardId === 'REV_845' || cardId === 'CORE_REV_845';
}

function normalizeToken(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function incrementMap(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function entriesFromCountMap(map: Map<string, number>): ExtraDisplayPoolEntry[] {
  return [...map.entries()]
    .map(([cardId, count]) => ({ cardId, count }))
    .sort((a, b) => b.count - a.count || a.cardId.localeCompare(b.cardId));
}
