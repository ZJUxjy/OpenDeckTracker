import type { CardPlayedEvent } from '../global-effects/types';

export interface ExtraDisplayCardMetadata {
  type?: string;
  spellSchool?: string;
  races?: readonly string[];
  mechanics?: readonly string[];
  cost?: number;
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
}

export interface ExtraDisplaySnapshot {
  /** Stable scalar states keyed by the review vocabulary names where possible. */
  counters: Record<string, number>;
  /** Card pools that need names/details in the renderer. */
  pools: {
    friendlyDeadDemonsThisGameUnique: ExtraDisplayPoolEntry[];
    friendlyDeadMinionsThisGameUnique: ExtraDisplayPoolEntry[];
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
    this.handEntities.clear();
    this.persistedHandCredits.clear();
  }

  recordTurnChange(turn: number): void {
    if (!Number.isFinite(turn)) return;
    if (this.currentTurn === turn) return;
    if (this.currentTurn !== null) {
      this.setCounter('friendlyMinionsDiedThisTurn', 0);
      this.setCounter('friendlyDeathsThisTurn', 0);
      this.setCounter('minionDeathsThisTurnBothPlayers', 0);
      this.setCounter('friendlyCardsPlayedThisTurn', 0);
      this.setCounter('friendlySpellsCastThisTurn', 0);
      this.setCounter('fireSpellsCastThisTurnByYou', 0);
      this.setCounter('holySpellsCastThisTurn', 0);
      this.setCounter('shadowSpellsCastThisTurn', 0);
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

    if (metadata.type !== 'SPELL') return;
    this.increment('spellsCastThisGame', 1);
    this.increment('friendlySpellsCastThisTurn', 1);

    const school = normalizeToken(metadata.spellSchool);
    if (school === 'FEL') this.increment('felSpellsCastThisGame', 1);
    if (school === 'FIRE') this.increment('fireSpellsCastThisTurnByYou', 1);
    if (school === 'HOLY') this.increment('holySpellsCastThisTurn', 1);
    if (school === 'SHADOW') this.increment('shadowSpellsCastThisTurn', 1);
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

    if (!args.isFriendly) return;
    this.increment('friendlyMinionsDiedThisTurn', 1);
    this.increment('friendlyDeathsThisTurn', 1);
    this.increment('friendlyMinionDeathsThisGame', 1);
    this.increment('friendlyDeathsThisGame', 1);
    incrementMap(this.friendlyDeadMinions, args.entity.cardId);
    const isDemon = hasRace(metadata, 'DEMON');
    if (isDemon) {
      incrementMap(this.friendlyDeadDemons, args.entity.cardId);
      this.increment('friendlyDemonDeathsThisGame', 1);
    }
    for (const tracking of this.handEntities.values()) {
      tracking.credits.friendlyDeaths += 1;
      if (isDemon) tracking.credits.friendlyDemonDeaths += 1;
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
    if (tracking.credits.friendlyDeaths > 0 || tracking.credits.friendlyDemonDeaths > 0) {
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
    }
    return {
      counters: Object.fromEntries([...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b))),
      pools: {
        friendlyDeadDemonsThisGameUnique: entriesFromCountMap(this.friendlyDeadDemons),
        friendlyDeadMinionsThisGameUnique: entriesFromCountMap(this.friendlyDeadMinions),
      },
      infuseProgressByCardId,
    };
  }

  private increment(key: string, amount: number): void {
    this.setCounter(key, (this.counters.get(key) ?? 0) + amount);
  }

  private setCounter(key: string, value: number): void {
    this.counters.set(key, value);
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
