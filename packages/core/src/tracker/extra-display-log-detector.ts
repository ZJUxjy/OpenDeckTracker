import type { PowerEvent } from '@hdt/hearthwatcher';
import { isFollowEnchantment } from './follow';

/**
 * Facts that cannot be reconstructed from Game.entities alone.
 * Zone movement, graveyard, and tag counters stay on MatchExtraDisplayState.
 */
export type ExtraDisplayLogFact =
  | {
      type: 'follow-attach';
      enchantmentEntityId: number;
      enchantmentCardId: string;
      targetEntityId: number;
      targetCardId: string;
    }
  | { type: 'follow-detach'; enchantmentEntityId: number }
  | {
      type: 'attack';
      attackerEntityId: number;
      attackerCardId: string;
      attackerControllerId: number;
    }
  | {
      type: 'discard';
      entityId: number;
      cardId: string;
      controllerId: number;
    };

interface KnownEntity {
  cardId: string;
  controllerId: number;
  zone: string | null;
  cardType: number | null;
}

/**
 * Watches Power.log for Follow attachments, attacks, and discards.
 *
 * Played spells also leave HAND for GRAVEYARD; those are suppressed while
 * the entity is the current PLAY-block source.
 */
export class ExtraDisplayLogDetector {
  private readonly entities = new Map<number, KnownEntity>();
  private readonly blockStack: Array<{ type: string; entityId: number | null }> = [];
  private readonly emit: (fact: ExtraDisplayLogFact) => void;

  constructor(args: { emit: (fact: ExtraDisplayLogFact) => void }) {
    this.emit = args.emit;
  }

  reset(): void {
    this.entities.clear();
    this.blockStack.length = 0;
  }

  handle(event: PowerEvent): void {
    if (event.type === 'block-start') {
      this.handleBlockStart(event.blockType, event.entity);
      return;
    }
    if (event.type === 'block-end') {
      this.blockStack.pop();
      return;
    }
    if (event.type === 'full-entity') {
      this.recordEntity(event.entityId, event.cardId, event.tags, event.content);
      this.maybeEmitFollowAttach(event.entityId, event.cardId, event.tags);
      return;
    }
    if (event.type === 'show-entity' || event.type === 'change-entity') {
      const id = entityIdOf(event.entity);
      if (id === null) return;
      this.recordEntity(id, event.cardId, event.tags, event.content);
      this.maybeEmitFollowAttach(id, event.cardId, event.tags);
      return;
    }
    if (event.type !== 'tag-change') return;

    const id = entityIdOf(event.entity);
    if (id === null) return;
    this.maybeBackfillFromRef(id, event.entity);
    this.maybeBackfillFromRef(id, event.content, { overwriteController: event.tag === 'ZONE' });

    if (event.tag === 'CONTROLLER') {
      const known = this.entities.get(id);
      const controllerId = numberOf(event.value);
      if (known && controllerId !== null) known.controllerId = controllerId;
      return;
    }

    if (event.tag === 'ATTACHED') {
      const known = this.entities.get(id);
      if (!known || !isFollowEnchantment(known.cardId)) return;
      const targetEntityId = numberOf(event.value);
      if (targetEntityId === null) return;
      this.emitFollowAttach(id, known.cardId, targetEntityId);
      return;
    }

    if (event.tag !== 'ZONE') return;
    const known = this.entities.get(id);
    if (!known) return;
    const previousZone = known.zone;
    const zone = normalizeZone(event.value);
    known.zone = zone;

    if (isFollowEnchantment(known.cardId) && !isZone(zone, 'PLAY')) {
      this.emit({ type: 'follow-detach', enchantmentEntityId: id });
    }

    if (isZone(previousZone, 'HAND') && isZone(zone, 'GRAVEYARD') && !this.isCurrentPlayBlock(id)) {
      this.emit({
        type: 'discard',
        entityId: id,
        cardId: known.cardId,
        controllerId: known.controllerId,
      });
    }
  }

  private handleBlockStart(blockType: string, entity: number | string | null): void {
    const normalized = blockType.toUpperCase();
    const id = entityIdOf(entity);
    this.blockStack.push({ type: normalized, entityId: id });
    if (normalized !== 'ATTACK' || id === null) return;
    this.maybeBackfillFromRef(id, entity);
    const known = this.entities.get(id);
    this.emit({
      type: 'attack',
      attackerEntityId: id,
      attackerCardId: known?.cardId ?? cardIdFromRef(entity),
      attackerControllerId: known?.controllerId ?? controllerIdFromRef(entity),
    });
  }

  private maybeEmitFollowAttach(
    enchantmentEntityId: number,
    cardId: string,
    tags: Readonly<Record<string, unknown>>,
  ): void {
    const enchantmentCardId = cardId || this.entities.get(enchantmentEntityId)?.cardId || '';
    if (!isFollowEnchantment(enchantmentCardId)) return;
    const targetEntityId = numberOf(tags['ATTACHED']);
    if (targetEntityId === null) return;
    this.emitFollowAttach(enchantmentEntityId, enchantmentCardId, targetEntityId);
  }

  private emitFollowAttach(
    enchantmentEntityId: number,
    enchantmentCardId: string,
    targetEntityId: number,
  ): void {
    const target = this.entities.get(targetEntityId);
    this.emit({
      type: 'follow-attach',
      enchantmentEntityId,
      enchantmentCardId,
      targetEntityId,
      targetCardId: target?.cardId ?? '',
    });
  }

  private recordEntity(
    entityId: number,
    cardId: string,
    tags: Readonly<Record<string, unknown>>,
    content?: string,
  ): void {
    const controllerId = numberOf(tags['CONTROLLER'] ?? tags['PLAYER_ID']) ?? controllerIdFromRef(content);
    const zone = readZone(tags['ZONE']);
    const cardType = numberOf(tags['CARDTYPE']);
    const existing = this.entities.get(entityId);
    if (existing) {
      if (cardId !== '') existing.cardId = cardId;
      if (controllerId !== 0) existing.controllerId = controllerId;
      if (zone !== null) existing.zone = zone;
      if (cardType !== null) existing.cardType = cardType;
      return;
    }
    this.entities.set(entityId, {
      cardId,
      controllerId,
      zone,
      cardType,
    });
  }

  private maybeBackfillFromRef(
    entityId: number,
    ref: number | string | null | undefined,
    options: { overwriteController?: boolean } = {},
  ): void {
    if (typeof ref !== 'string') return;
    let known = this.entities.get(entityId);
    if (!known) {
      known = { cardId: '', controllerId: 0, zone: zoneFromRef(ref), cardType: null };
      this.entities.set(entityId, known);
    }
    const cardId = /cardId=([A-Z0-9_]+)/i.exec(ref)?.[1];
    if (cardId && known.cardId === '') known.cardId = cardId;
    const player = numberOf(/player=(\d+)/i.exec(ref)?.[1]);
    if (player !== null && (options.overwriteController || known.controllerId === 0)) {
      known.controllerId = player;
    }
    const zone = zoneFromRef(ref);
    if (zone !== null && known.zone === null) known.zone = zone;
  }

  private isCurrentPlayBlock(entityId: number): boolean {
    return this.blockStack.some((block) => block.type === 'PLAY' && block.entityId === entityId);
  }
}

function entityIdOf(ref: number | string | null | undefined): number | null {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') {
    const match = /\bid=(\d+)/i.exec(ref);
    if (match) return Number(match[1]);
  }
  return null;
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readZone(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return normalizeZone(value);
}

function normalizeZone(value: unknown): string {
  if (typeof value === 'number') {
    const zones: Record<number, string> = {
      1: 'PLAY',
      2: 'DECK',
      3: 'HAND',
      4: 'GRAVEYARD',
    };
    return zones[value] ?? String(value);
  }
  return String(value).toUpperCase();
}

function isZone(value: string | null, expected: string): boolean {
  if (value === null) return false;
  return value.toUpperCase() === expected;
}

function cardIdFromRef(ref: number | string | null | undefined): string {
  if (typeof ref !== 'string') return '';
  return /cardId=([A-Z0-9_]+)/i.exec(ref)?.[1] ?? '';
}

function controllerIdFromRef(ref: number | string | null | undefined): number {
  if (typeof ref !== 'string') return 0;
  return numberOf(/player=(\d+)/i.exec(ref)?.[1]) ?? 0;
}

function zoneFromRef(ref: string): string | null {
  const match = /zone=([A-Z]+)/i.exec(ref);
  return match ? match[1].toUpperCase() : null;
}
