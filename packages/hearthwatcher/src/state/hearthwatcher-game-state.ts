import type { EntityInfo, Zone } from '@hdt/core';
import type { PowerTagMap } from '../types/power-tags';

export interface HearthWatcherEntity {
  entityId: number;
  cardId: string;
  zone: Zone;
  controllerId: number;
  tags: PowerTagMap;
  info: EntityInfo;
}

export interface OriginalDeckCard {
  cardId: string;
  count: number;
}

export class HearthWatcherGameState {
  public readonly entities = new Map<number, HearthWatcherEntity>();
  public localControllerId: number | null;
  public opponentControllerId: number | null;
  private readonly originalDeckCounts = new Map<string, number>();
  private readonly assignedOriginalCounts = new Map<string, number>();
  private initialAssignmentComplete = false;

  constructor(options: {
    localControllerId?: number;
    opponentControllerId?: number;
    originalDeck?: readonly OriginalDeckCard[];
  } = {}) {
    this.localControllerId = options.localControllerId ?? null;
    this.opponentControllerId = options.opponentControllerId ?? null;
    if (options.originalDeck !== undefined) {
      this.setOriginalDeck(options.originalDeck);
    }
  }

  setOriginalDeck(cards: readonly OriginalDeckCard[]): void {
    this.originalDeckCounts.clear();
    this.assignedOriginalCounts.clear();
    for (const card of cards) {
      this.originalDeckCounts.set(card.cardId, (this.originalDeckCounts.get(card.cardId) ?? 0) + card.count);
    }
  }

  markInitialAssignmentComplete(): void {
    this.initialAssignmentComplete = true;
  }

  upsertEntity(args: {
    entityId: number;
    cardId?: string;
    zone?: Zone;
    controllerId?: number;
    tags?: PowerTagMap;
    info?: EntityInfo;
  }): HearthWatcherEntity {
    const existing = this.entities.get(args.entityId);
    if (existing) {
      if (args.cardId !== undefined && args.cardId !== '') {
        existing.cardId = args.cardId;
        existing.info.hidden = false;
      } else if (args.cardId === '' && existing.cardId === '') {
        existing.info.hidden = this.isHiddenEntity(existing);
      }
      if (args.zone !== undefined) existing.zone = args.zone;
      if (args.controllerId !== undefined) existing.controllerId = args.controllerId;
      if (args.tags !== undefined) existing.tags = { ...existing.tags, ...args.tags };
      if (args.info !== undefined) existing.info = { ...existing.info, ...args.info };
      this.classifyOrigin(existing);
      return existing;
    }

    const entity: HearthWatcherEntity = {
      entityId: args.entityId,
      cardId: args.cardId ?? '',
      zone: args.zone ?? 'INVALID',
      controllerId: args.controllerId ?? 0,
      tags: args.tags ?? {},
      info: args.info ?? {},
    };
    // Capture the *first observed* zone for every entity. Used by
    // `classifyOrigin` to flag opponent entities that appear directly
    // in PLAY / SETASIDE — those are effect-summoned (Phaelarc's
    // dragons, Flashback's replays, Infectious Breath's leeches),
    // never passed through the opponent's HAND/DECK. Cards manually
    // played from hand are first observed in HAND with cardId='' (we
    // can't see what the opponent is holding); by the time the
    // cardId is revealed on the HAND→PLAY transition the entity
    // already has `info.originalZone === 'HAND'`, so we can tell
    // them apart.
    //
    // For LOCAL entities `classifyOrigin` overwrites `originalZone`
    // when matching against the original-deck list — that's fine,
    // both routes land on the same value when the entity is from
    // the player's deck.
    if (entity.info.originalZone === undefined && entity.zone !== 'INVALID') {
      entity.info.originalZone = entity.zone;
    }
    entity.info.hidden = entity.info.hidden ?? this.isHiddenEntity(entity);
    this.entities.set(args.entityId, entity);
    this.classifyOrigin(entity);
    return entity;
  }

  private classifyOrigin(entity: HearthWatcherEntity): void {
    if (this.localControllerId === null) return;
    if (entity.cardId === '') return;
    if (entity.info.originalController !== undefined || entity.info.created === true) return;

    // LOCAL side: match the revealed cardId against the player's
    // original-deck counts. Anything beyond the deck-list count is
    // effect-generated (Discover, tokens, opponent-class steal, etc.).
    if (entity.controllerId === this.localControllerId) {
      const originalCount = this.originalDeckCounts.get(entity.cardId) ?? 0;
      const assignedCount = this.assignedOriginalCounts.get(entity.cardId) ?? 0;
      if (!this.initialAssignmentComplete && assignedCount < originalCount) {
        this.assignedOriginalCounts.set(entity.cardId, assignedCount + 1);
        entity.info.originalController = entity.controllerId;
        entity.info.originalZone = entity.zone;
        return;
      }
      entity.info.created = true;
      return;
    }

    // OPPONENT side: we don't know their deck list, so we lean on the
    // entity's *first observed* zone (captured in `upsertEntity`).
    // Manually-played cards spend time in HAND or DECK before reaching
    // PLAY — that's where we first see the entity, even though the
    // cardId is hidden. Effect-summoned cards appear directly in PLAY
    // / SETASIDE with the cardId already revealed.
    if (entity.info.originalZone === 'HAND' || entity.info.originalZone === 'DECK') {
      entity.info.originalController = entity.controllerId;
    } else {
      entity.info.created = true;
    }
  }

  private isHiddenEntity(entity: HearthWatcherEntity): boolean {
    if (entity.cardId !== '') return false;
    if (this.localControllerId === null) return false;
    if (entity.controllerId === this.localControllerId) return false;
    return entity.zone === 'HAND' || entity.zone === 'DECK';
  }
}
