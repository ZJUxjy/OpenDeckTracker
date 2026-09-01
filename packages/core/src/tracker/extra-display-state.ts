import type { CardPlayedEvent } from '../global-effects/types';
import {
  BOUND_ARCHMAGE_CARD_ID,
  BOUND_ARCHMAGES_DIED_THIS_GAME_KEY,
  CARDS_DISCARDED_THIS_GAME_KEY,
  COLLAPSING_STAR_ACTIVE_KEY,
  COLLAPSING_STAR_DAMAGE_KEY,
  COLLAPSING_STAR_HERO_POWER_ID,
  FRIENDLY_CHARACTER_ATTACKS_THIS_GAME_KEY,
  FRIENDLY_HERO_ATTACKS_THIS_GAME_KEY,
  IMP_FORMANT_CARD_ID,
  IMP_FORMANTS_IN_OPPONENT_DECK_KEY,
  IMP_FORMANTS_SUMMONED_THIS_GAME_KEY,
  JAILBIRD_CARD_ID,
  JAILBIRD_PREPARE_DISCOUNT_KEY,
  KABAL_MASTERMIND_ACTIVE_KEY,
  KABAL_MASTERMIND_ENCHANTMENT_ID,
  MINIONS_REBORN_THIS_GAME_KEY,
  SLIME_EM_DESTROYED_FRIENDLY_KEY,
  SLIME_EM_TOKEN_CARD_ID,
  STEALTH_ATTACKED_WHILE_IN_HAND_KEY,
  TRICKS_OF_THE_TRADE_CARD_ID,
  entityScopedKey,
} from './extra-display-ids';
import { HERALD_COUNTER_KEY, heraldTriggerTiming } from './herald';
import { PREPARE_COUNTER_KEY, isPrepareRelatedCard } from './prepare';

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

export interface PreparedHandEntry {
  entityId: number;
  cardId: string;
  baseCost: number;
  effectiveCost: number;
  discount: number;
  preparedAtTurn: number;
}

export interface FollowedHandEntry {
  entityId: number;
  cardId: string;
  sourceCardId: string;
  enchantmentEntityId: number;
}

export interface DisguisedBoardEntry {
  entityId: number;
  cardId: string;
  side: 'friendly' | 'opponent';
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
  /** Hand entities that currently carry a Prepare discount. */
  preparedHand?: PreparedHandEntry[];
  /** Hand entities that currently carry a one-turn Follow enchantment. */
  followedHand?: FollowedHandEntry[];
  /** Disguised minions currently in PLAY, including the opposing side. */
  disguisedBoard?: DisguisedBoardEntry[];
}

export interface EntityZoneChangeArgs {
  entityId: number;
  cardId: string;
  previousZone: string | null | undefined;
  zone: string;
  controllerId: number;
  localControllerId: number;
  cardLookup: ExtraDisplayCardLookup | null;
  discarded?: boolean;
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
export const OPPONENT_MINIONS_PLAYED_LAST_TURN_STILL_IN_PLAY_POOL = 'opponentMinionsPlayedLastTurnStillInPlay';

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
  private readonly preparedHandEntities = new Map<number, PreparedHandEntry>();
  private readonly followedHandEntities = new Map<number, FollowedHandEntry>();
  private readonly opponentDeckImpFormants = new Set<number>();
  private readonly summonedImpFormantEntities = new Set<number>();
  private readonly pendingRebornByCardId = new Map<string, number>();
  private readonly handEntities = new Map<number, string>();
  private readonly jailbirdDiscounts = new Map<number, number>();
  private readonly stealthAttackedHandEntities = new Set<number>();
  private slimeEmPendingBoard: string[] | null = null;

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
    this.preparedHandEntities.clear();
    this.followedHandEntities.clear();
    this.opponentDeckImpFormants.clear();
    this.summonedImpFormantEntities.clear();
    this.pendingRebornByCardId.clear();
    this.handEntities.clear();
    this.jailbirdDiscounts.clear();
    this.stealthAttackedHandEntities.clear();
    this.slimeEmPendingBoard = null;
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
      this.pendingRebornByCardId.clear();
    } else {
      this.setCounter('friendlySpellCastLastTurn', 0);
      this.setCounter('elementalPlayedLastTurn', 0);
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

    if (heraldTriggerTiming(metadata) === 'play') {
      this.increment(HERALD_COUNTER_KEY, 1);
    }

    this.preparedHandEntities.delete(args.event.entityId);

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

  recordHeraldTriggered(args: {
    cardId: string;
    blockType: string;
    isFriendly: boolean;
    cardLookup: ExtraDisplayCardLookup | null;
  }): void {
    if (!args.isFriendly) return;
    const metadata = args.cardLookup?.(args.cardId) ?? { id: args.cardId };
    const timing = heraldTriggerTiming(metadata);
    const blockType = args.blockType.toUpperCase();
    if (timing === 'trigger' && blockType === 'TRIGGER') {
      this.increment(HERALD_COUNTER_KEY, 1);
    }
    if (timing === 'power' && blockType === 'POWER') {
      this.increment(HERALD_COUNTER_KEY, 1);
    }
  }

  recordPrepareAction(args: {
    entityId: number;
    cardId: string;
    isFriendly: boolean;
    baseCost: number;
    effectiveCost: number;
    discount: number;
    cardLookup: ExtraDisplayCardLookup | null;
  }): void {
    if (!args.isFriendly) return;
    const metadata = args.cardLookup?.(args.cardId) ?? { id: args.cardId };
    if (!isPrepareRelatedCard(metadata)) return;
    if (args.discount <= 0) return;

    this.increment(PREPARE_COUNTER_KEY, 1);
    this.preparedHandEntities.set(args.entityId, {
      entityId: args.entityId,
      cardId: args.cardId,
      baseCost: args.baseCost,
      effectiveCost: args.effectiveCost,
      discount: args.discount,
      preparedAtTurn: this.currentTurn ?? 0,
    });
    this.applyJailbirdPrepareDiscount(args.discount);
  }

  syncPreparedHandEntities(hand: readonly { entityId: number; cardId: string }[]): void {
    const handIds = new Set(hand.map((entry) => entry.entityId));
    for (const entityId of [...this.preparedHandEntities.keys()]) {
      if (!handIds.has(entityId)) {
        this.preparedHandEntities.delete(entityId);
      }
    }
  }

  syncHandEntities(hand: readonly { entityId: number; cardId: string }[]): void {
    this.handEntities.clear();
    for (const entry of hand) {
      this.handEntities.set(entry.entityId, entry.cardId);
    }
    this.refreshHandScopedAggregates();
  }

  syncFollowedHandEntities(hand: readonly { entityId: number; cardId: string }[]): void {
    const handIds = new Set(hand.map((entry) => entry.entityId));
    for (const [enchantmentEntityId, entry] of [...this.followedHandEntities.entries()]) {
      if (!handIds.has(entry.entityId)) {
        this.followedHandEntities.delete(enchantmentEntityId);
      }
    }
  }

  recordFollowAttach(args: {
    enchantmentEntityId: number;
    targetEntityId: number;
    targetCardId: string;
    sourceCardId: string;
  }): void {
    if (args.sourceCardId === '' || args.targetEntityId <= 0) return;
    this.followedHandEntities.set(args.enchantmentEntityId, {
      entityId: args.targetEntityId,
      cardId: args.targetCardId,
      sourceCardId: args.sourceCardId,
      enchantmentEntityId: args.enchantmentEntityId,
    });
  }

  recordFollowDetach(args: { enchantmentEntityId: number }): void {
    this.followedHandEntities.delete(args.enchantmentEntityId);
  }

  recordFriendlyStealthMinionAttacked(): void {
    for (const [entityId, cardId] of this.handEntities) {
      if (cardId !== TRICKS_OF_THE_TRADE_CARD_ID) continue;
      this.stealthAttackedHandEntities.add(entityId);
      this.setCounter(entityScopedKey(STEALTH_ATTACKED_WHILE_IN_HAND_KEY, entityId), 1);
    }
    this.refreshHandScopedAggregates();
  }

  recordFriendlyCharacterAttack(args: { hero: boolean }): void {
    this.increment(FRIENDLY_CHARACTER_ATTACKS_THIS_GAME_KEY, 1);
    if (args.hero) this.increment(FRIENDLY_HERO_ATTACKS_THIS_GAME_KEY, 1);
  }

  recordSlimeEmBoardSnapshot(cardIds: readonly string[]): void {
    this.slimeEmPendingBoard = [...cardIds];
  }

  recordEntityZoneChange(args: EntityZoneChangeArgs): void {
    if (args.cardId === '') return;
    const previous = normalizeZoneName(args.previousZone);
    const zone = normalizeZoneName(args.zone);
    const isFriendly = args.controllerId === args.localControllerId;
    const metadata = args.cardLookup?.(args.cardId) ?? { id: args.cardId };

    this.trackImpFormantZone(args, previous, zone, isFriendly);
    this.trackKabalMastermind(args.cardId, zone, isFriendly);
    this.trackReborn(args, previous, zone, isFriendly, metadata);
    this.trackSlimeEmToken(args, zone, isFriendly);

    if (args.discarded === true && isFriendly && previous === 'HAND' && zone === 'GRAVEYARD') {
      this.increment(CARDS_DISCARDED_THIS_GAME_KEY, 1);
    }
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
    if (args.entity.cardId === BOUND_ARCHMAGE_CARD_ID) {
      this.increment(BOUND_ARCHMAGES_DIED_THIS_GAME_KEY, 1);
    }
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
    if (args.entity.cardId === COLLAPSING_STAR_HERO_POWER_ID) {
      this.setCounter(COLLAPSING_STAR_DAMAGE_KEY, args.value);
      this.setCounter(COLLAPSING_STAR_ACTIVE_KEY, 1);
    }
  }

  snapshot(): ExtraDisplaySnapshot {
    this.writeImpFormantDeckSnapshot();
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
    const preparedHand = [...this.preparedHandEntities.values()].sort(
      (a, b) => a.entityId - b.entityId,
    );
    const followedHand = [...this.followedHandEntities.values()].sort(
      (a, b) => a.entityId - b.entityId || a.enchantmentEntityId - b.enchantmentEntityId,
    );
    return {
      counters: Object.fromEntries([...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b))),
      pools,
      ...(preparedHand.length > 0 ? { preparedHand } : {}),
      ...(followedHand.length > 0 ? { followedHand } : {}),
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

  private trackImpFormantZone(
    args: EntityZoneChangeArgs,
    previous: string,
    zone: string,
    isFriendly: boolean,
  ): void {
    if (args.cardId !== IMP_FORMANT_CARD_ID) return;
    if (zone === 'DECK' && !isFriendly) {
      this.opponentDeckImpFormants.add(args.entityId);
    } else if (previous === 'DECK' || zone !== 'DECK') {
      this.opponentDeckImpFormants.delete(args.entityId);
    }
    if (zone === 'PLAY' && isFriendly && !this.summonedImpFormantEntities.has(args.entityId)) {
      this.summonedImpFormantEntities.add(args.entityId);
      this.increment(IMP_FORMANTS_SUMMONED_THIS_GAME_KEY, 1);
    }
  }

  private trackKabalMastermind(cardId: string, zone: string, isFriendly: boolean): void {
    if (cardId !== KABAL_MASTERMIND_ENCHANTMENT_ID || !isFriendly) return;
    this.setCounter(KABAL_MASTERMIND_ACTIVE_KEY, zone === 'PLAY' ? 1 : 0);
  }

  private trackReborn(
    args: EntityZoneChangeArgs,
    previous: string,
    zone: string,
    isFriendly: boolean,
    metadata: ExtraDisplayCardMetadata,
  ): void {
    if (!isFriendly) return;
    if (previous === 'PLAY' && zone === 'GRAVEYARD' && hasMechanic(metadata, 'REBORN')) {
      this.pendingRebornByCardId.set(
        args.cardId,
        (this.pendingRebornByCardId.get(args.cardId) ?? 0) + 1,
      );
      return;
    }
    if (zone !== 'PLAY' || previous === 'HAND' || previous === 'DECK' || previous === 'PLAY') return;
    const pending = this.pendingRebornByCardId.get(args.cardId) ?? 0;
    if (pending <= 0) return;
    this.pendingRebornByCardId.set(args.cardId, pending - 1);
    this.incrementPool(MINIONS_REBORN_THIS_GAME_KEY, args.cardId);
  }

  private trackSlimeEmToken(args: EntityZoneChangeArgs, zone: string, isFriendly: boolean): void {
    if (!isFriendly || zone !== 'HAND' || args.cardId !== SLIME_EM_TOKEN_CARD_ID) return;
    if (this.slimeEmPendingBoard === null) return;
    this.replacePool(
      entityScopedKey(SLIME_EM_DESTROYED_FRIENDLY_KEY, args.entityId),
      this.slimeEmPendingBoard,
    );
    this.replacePool(SLIME_EM_DESTROYED_FRIENDLY_KEY, this.slimeEmPendingBoard);
  }

  private applyJailbirdPrepareDiscount(discount: number): void {
    for (const [entityId, cardId] of this.handEntities) {
      if (cardId !== JAILBIRD_CARD_ID) continue;
      const next = (this.jailbirdDiscounts.get(entityId) ?? 0) + discount;
      this.jailbirdDiscounts.set(entityId, next);
      this.setCounter(entityScopedKey(JAILBIRD_PREPARE_DISCOUNT_KEY, entityId), next);
    }
    this.refreshHandScopedAggregates();
  }

  private refreshHandScopedAggregates(): void {
    let stealthFlag = 0;
    let jailbirdDiscount = 0;
    for (const [entityId, cardId] of this.handEntities) {
      if (cardId === TRICKS_OF_THE_TRADE_CARD_ID && this.stealthAttackedHandEntities.has(entityId)) {
        stealthFlag = 1;
      }
      if (cardId === JAILBIRD_CARD_ID) {
        jailbirdDiscount = Math.max(jailbirdDiscount, this.jailbirdDiscounts.get(entityId) ?? 0);
      }
    }
    this.setCounter(STEALTH_ATTACKED_WHILE_IN_HAND_KEY, stealthFlag);
    this.setCounter(JAILBIRD_PREPARE_DISCOUNT_KEY, jailbirdDiscount);
  }

  private writeImpFormantDeckSnapshot(): void {
    const count = this.opponentDeckImpFormants.size;
    if (count === 0 && !this.counters.has(IMP_FORMANTS_IN_OPPONENT_DECK_KEY)) {
      this.clearPool(IMP_FORMANTS_IN_OPPONENT_DECK_KEY);
      return;
    }
    this.setCounter(IMP_FORMANTS_IN_OPPONENT_DECK_KEY, count);
    if (count === 0) {
      this.clearPool(IMP_FORMANTS_IN_OPPONENT_DECK_KEY);
      return;
    }
    this.replacePool(
      IMP_FORMANTS_IN_OPPONENT_DECK_KEY,
      Array.from({ length: count }, () => IMP_FORMANT_CARD_ID),
    );
  }

  private replacePool(key: string, cardIds: readonly string[]): void {
    const map = new Map<string, number>();
    for (const cardId of cardIds) {
      incrementMap(map, cardId);
    }
    this.poolMaps.set(key, map);
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

function normalizeZoneName(value: string | null | undefined): string {
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
