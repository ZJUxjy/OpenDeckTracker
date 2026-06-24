import type { CardPlayedEvent } from '../global-effects/types';

export interface ExtraDisplayCardMetadata {
  id?: string;
  name?: string;
  type?: string;
  spellSchool?: string;
  races?: readonly string[];
  mechanics?: readonly string[];
  referencedTags?: readonly string[];
  cost?: number;
  attack?: number;
  health?: number;
  text?: string;
}

export interface ExtraDisplayPoolEntry {
  cardId: string;
  count: number;
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
}

export type ExtraDisplayCardLookup = (cardId: string) => ExtraDisplayCardMetadata | null;

interface GraveyardEntity {
  entityId: number;
  cardId: string;
}

interface TaggedEntity {
  entityId: number;
  cardId: string;
}

const EMPTY_COUNTERS: Readonly<Record<string, number>> = Object.freeze({});
const RANGER_SYLVANAS_CARD_IDS = new Set(['TIME_609', 'TIME_609t1', 'TIME_609t2']);

/** Pool key for 时光领主埃博克 (TIME_714) hover preview. */
export const OPPONENT_MINIONS_PLAYED_LAST_TURN_STILL_IN_PLAY_POOL =
  'opponentMinionsPlayedLastTurnStillInPlay';

export function createEmptyExtraDisplaySnapshot(): ExtraDisplaySnapshot {
  return {
    counters: { ...EMPTY_COUNTERS },
    pools: {
      friendlyDeadDemonsThisGameUnique: [],
      friendlyDeadMinionsThisGameUnique: [],
    },
  };
}

export class MatchExtraDisplayState {
  private currentTurn: number | null = null;
  private readonly counters = new Map<string, number>();
  private readonly countedGraveyardEntities = new Set<number>();
  private readonly friendlyDeadDemons = new Map<string, number>();
  private readonly friendlyDeadMinions = new Map<string, number>();
  private readonly poolMaps = new Map<string, Map<string, number>>();
  private readonly friendlyDeadUndeadCosts = new Map<string, number>();
  private readonly oneCostCardsPlayedThisGame = new Map<string, number>();
  private readonly rangerSylvanasCardsPlayedThisGame = new Map<string, number>();
  private originalDeckCardIds: ReadonlySet<string> | null = null;
  private activeTurnControllerId: number | null = null;
  private readonly opponentMinionsPlayedCurrentOpponentTurn = new Map<number, string>();
  private opponentMinionsPlayedLastOpponentTurn = new Map<number, string>();

  reset(): void {
    this.currentTurn = null;
    this.counters.clear();
    this.countedGraveyardEntities.clear();
    this.friendlyDeadDemons.clear();
    this.friendlyDeadMinions.clear();
    this.poolMaps.clear();
    this.friendlyDeadUndeadCosts.clear();
    this.oneCostCardsPlayedThisGame.clear();
    this.rangerSylvanasCardsPlayedThisGame.clear();
    this.originalDeckCardIds = null;
    this.activeTurnControllerId = null;
    this.opponentMinionsPlayedCurrentOpponentTurn.clear();
    this.opponentMinionsPlayedLastOpponentTurn.clear();
  }

  setOriginalDeckCardIds(cardIds: Iterable<string>): void {
    this.originalDeckCardIds = new Set(cardIds);
  }

  clearOriginalDeckCardIds(): void {
    this.originalDeckCardIds = null;
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

    if (
      this.activeTurnControllerId !== null &&
      this.activeTurnControllerId !== args.localControllerId
    ) {
      this.commitOpponentTurnMinionPlays();
    }
    this.activeTurnControllerId = args.localControllerId;

    const metadata = metadataForPlayedEvent(args.event, args.cardLookup);
    this.increment('friendlyCardsPlayedThisTurn', 1);
    this.increment('friendlyCardsPlayedThisGame', 1);
    this.increment('cardsPlayedThisTurn', 1);
    this.setCounter('otherCardsPlayedThisTurn', this.counters.get('cardsPlayedThisTurn') ?? 0);
    if (typeof metadata.cost === 'number') this.setCounter('lastPlayedCardCost', metadata.cost);
    if (metadata.cost === 1 && metadata.type !== 'HERO_POWER') {
      incrementMap(this.oneCostCardsPlayedThisGame, args.event.cardId);
    }
    if (RANGER_SYLVANAS_CARD_IDS.has(args.event.cardId)) {
      incrementMap(this.rangerSylvanasCardsPlayedThisGame, args.event.cardId);
    }

    if (metadata.type === 'HERO_POWER') {
      this.increment('heroPowerUsesThisGame', 1);
      this.setCounter('heroPowerUsedThisTurn', 1);
    }

    if (!this.isCardFromInitialDeck(args.event.cardId)) {
      this.increment('cardsPlayedNotFromInitialDeckThisGame', 1);
    }

    if (metadata.type === 'MINION') {
      this.increment('friendlyMinionCardsPlayedThisGame', 1);
      if (hasRace(metadata, 'ELEMENTAL')) this.increment('elementalsPlayedThisTurn', 1);
      if (hasRace(metadata, 'TOTEM')) this.increment('friendlyTotemsSummonedThisGame', 1);
    }

    if (doesImbueHeroPower(metadata)) {
      this.increment('heroPowerImbueCountThisGame', 1);
    }

    const overloadAmount = overloadAmountFromMetadata(metadata);
    if (overloadAmount > 0) {
      this.increment('totalOverloadedCrystalsThisGame', overloadAmount);
    }

    if (metadata.type !== 'SPELL') return;
    this.increment('spellsCastThisGame', 1);
    this.increment('friendlySpellsCastThisTurn', 1);

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

  recordOpponentCardPlayed(args: {
    event: CardPlayedEvent;
    localControllerId: number;
    cardLookup: ExtraDisplayCardLookup | null;
  }): void {
    if (args.event.controllerId === args.localControllerId) return;

    if (this.activeTurnControllerId === args.localControllerId) {
      this.opponentMinionsPlayedCurrentOpponentTurn.clear();
    }
    this.activeTurnControllerId = args.event.controllerId;

    const metadata = metadataForPlayedEvent(args.event, args.cardLookup);
    if (metadata.type !== 'MINION') return;
    this.opponentMinionsPlayedCurrentOpponentTurn.set(args.event.entityId, args.event.cardId);
  }

  opponentMinionsPlayedLastTurnStillInPlay(
    opponentBoardEntityIds: ReadonlySet<number>,
  ): ExtraDisplayPoolEntry[] {
    return [...this.opponentMinionsPlayedLastOpponentTurn.entries()]
      .filter(([entityId]) => opponentBoardEntityIds.has(entityId))
      .sort(([a], [b]) => a - b)
      .map(([_, cardId]) => ({ cardId, count: 1 }));
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
  }

  recordEntityTagValue(args: {
    entity: TaggedEntity;
    isFriendly: boolean;
    tag: string;
    value: number;
  }): void {
    if (!args.isFriendly) return;
    if (args.entity.cardId === '') return;
    if (!isScriptValueTag(args.tag)) return;
    this.setCounter(`counter.${args.entity.cardId}`, args.value);
    this.setCounter(`cardState.${args.entity.cardId}`, args.value);
  }

  snapshot(): ExtraDisplaySnapshot {
    const pools: ExtraDisplaySnapshot['pools'] = {
      friendlyDeadDemonsThisGameUnique: entriesFromCountMap(this.friendlyDeadDemons),
      friendlyDeadMinionsThisGameUnique: entriesFromCountMap(this.friendlyDeadMinions),
    };
    for (const [key, map] of this.poolMaps) {
      pools[key] = entriesFromCountMap(map);
    }
    pools.oneCostCardsPlayedThisGameDistinct = entriesFromInsertionOrderedMap(this.oneCostCardsPlayedThisGame);
    pools.rangerSylvanasCardsPlayedThisGame = entriesFromInsertionOrderedMap(this.rangerSylvanasCardsPlayedThisGame);
    pools.friendlyDeadUndeadHighestCostPoolThisGame = this.highestCostUndeadPool();
    pools['graveyardPool.EDR_891'] = pools.friendlyDeadDeathrattleMinionsCostLte4Unique ?? [];
    pools['graveyardPool.EDR_892'] = pools.friendlyDeadDeathrattleMinionsCostGte5Unique ?? [];
    pools['graveyardPool.CORE_ICC_835'] = pools.friendlyDeadTauntMinionsThisGameUnique ?? [];
    pools['graveyardPool.CORE_DAL_721'] = pools.friendlyDeadUndeadThisGameUnique ?? [];
    pools['graveyardPool.EDR_238'] = pools.distinctFriendlyDeadMinionsCostGte8 ?? [];
    return {
      counters: Object.fromEntries([...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b))),
      pools,
    };
  }

  private commitOpponentTurnMinionPlays(): void {
    this.opponentMinionsPlayedLastOpponentTurn = new Map(
      this.opponentMinionsPlayedCurrentOpponentTurn,
    );
    this.opponentMinionsPlayedCurrentOpponentTurn.clear();
  }

  private isCardFromInitialDeck(cardId: string): boolean {
    if (this.originalDeckCardIds === null || this.originalDeckCardIds.size === 0) {
      return true;
    }
    return this.originalDeckCardIds.has(cardId);
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

function isScriptValueTag(tag: string): boolean {
  const normalized = normalizeToken(tag);
  return normalized === 'TAG_SCRIPT_DATA_NUM_1' ||
    normalized === 'TAG_SCRIPT_DATA_NUM_2' ||
    normalized === 'SCRIPT_DATA_NUM_1' ||
    normalized === 'SCRIPT_DATA_NUM_2';
}

function overloadAmountFromMetadata(metadata: ExtraDisplayCardMetadata): number {
  if (!hasMechanic(metadata, 'OVERLOAD')) return 0;
  const text = metadata.text ?? '';
  const match =
    /过载：?\s*[（(]?(\d+)|Overload:\s*\(?(\d+)/i.exec(text);
  if (match) {
    const amount = Number(match[1] ?? match[2]);
    return Number.isFinite(amount) && amount > 0 ? amount : 1;
  }
  return 1;
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

function entriesFromInsertionOrderedMap(map: Map<string, number>): ExtraDisplayPoolEntry[] {
  return [...map.entries()].map(([cardId, count]) => ({ cardId, count }));
}
