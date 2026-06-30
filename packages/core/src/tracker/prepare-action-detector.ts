import type { PowerEvent } from '@hdt/hearthwatcher';

const REFIRE_SUPPRESS_MS = 3000;

export interface PrepareActionEvent {
  entityId: number;
  controllerId: number;
  cardId: string;
  baseCost: number;
  effectiveCost: number;
  discount: number;
}

interface KnownEntity {
  cardId: string;
  controllerId: number;
  zone: string | null;
  cost: number | null;
}

interface PendingPrepare {
  costBefore: number | null;
  costAfter: number | null;
}

/**
 * Detects the Prepare deck interaction: HAND → DECK, COST decreases, DECK → HAND.
 * Emits once per completed Prepare sequence for a hand entity.
 */
export class PrepareActionDetector {
  private readonly entities = new Map<number, KnownEntity>();
  private readonly pending = new Map<number, PendingPrepare>();
  private readonly lastFiredAt = new Map<number, number>();
  private readonly emit: (event: PrepareActionEvent) => void;
  private readonly clock: () => number;

  constructor(args: {
    emit: (event: PrepareActionEvent) => void;
    clock?: () => number;
  }) {
    this.emit = args.emit;
    this.clock = args.clock ?? (() => Date.now());
  }

  reset(): void {
    this.entities.clear();
    this.pending.clear();
    this.lastFiredAt.clear();
  }

  handle(event: PowerEvent): void {
    if (event.type === 'full-entity') {
      this.recordEntity(event.entityId, event.cardId, event.tags);
      return;
    }
    if (event.type === 'show-entity') {
      const id = entityIdOf(event.entity);
      if (id === null) return;
      this.recordEntity(id, event.cardId, event.tags);
      return;
    }
    if (event.type === 'change-entity') {
      const id = entityIdOf(event.entity);
      if (id === null) return;
      const known = this.entities.get(id);
      if (known && event.cardId !== '') known.cardId = event.cardId;
      return;
    }
    if (event.type !== 'tag-change') return;

    const id = entityIdOf(event.entity);
    if (id === null) return;
    this.maybeBackfillFromRef(id, event.entity);
    this.maybeBackfillFromRef(id, event.content, { overwriteController: event.tag === 'ZONE' });

    if (event.tag === 'CONTROLLER') {
      const known = this.entities.get(id);
      const ctrl = numberOf(event.value);
      if (known && ctrl !== null) known.controllerId = ctrl;
      return;
    }

    if (event.tag === 'COST') {
      const cost = numberOf(event.value);
      if (cost === null) return;
      const known = this.entities.get(id);
      if (!known) return;
      const pending = this.pending.get(id);
      if (pending && pending.costBefore !== null && cost < pending.costBefore) {
        pending.costAfter = cost;
      }
      known.cost = cost;
      return;
    }

    if (event.tag !== 'ZONE') return;
    const zone = normalizeZone(event.value);
    const known = this.entities.get(id);
    if (!known) return;
    const previousZone = known.zone;
    known.zone = zone;

    if (isZone(previousZone, 'HAND') && isZone(zone, 'DECK')) {
      this.pending.set(id, {
        costBefore: known.cost,
        costAfter: null,
      });
      return;
    }

    if (!isZone(previousZone, 'DECK') || !isZone(zone, 'HAND')) return;
    const pending = this.pending.get(id);
    this.pending.delete(id);
    if (!pending || pending.costBefore === null || pending.costAfter === null) return;
    const discount = pending.costBefore - pending.costAfter;
    if (discount <= 0) return;
    if (this.recentlyFired(id)) return;

    this.lastFiredAt.set(id, this.clock());
    this.emit({
      entityId: id,
      controllerId: known.controllerId,
      cardId: known.cardId,
      baseCost: pending.costBefore,
      effectiveCost: pending.costAfter,
      discount,
    });
  }

  private recordEntity(
    entityId: number,
    cardId: string,
    tags: Readonly<Record<string, unknown>>,
  ): void {
    const controllerId = numberOf(tags['CONTROLLER'] ?? tags['PLAYER_ID']) ?? 0;
    const zone = readZone(tags['ZONE']);
    const cost = numberOf(tags['COST']);
    const existing = this.entities.get(entityId);
    if (existing) {
      if (cardId !== '') existing.cardId = cardId;
      if (controllerId !== 0) existing.controllerId = controllerId;
      if (zone !== null) existing.zone = zone;
      if (cost !== null) existing.cost = cost;
      return;
    }
    this.entities.set(entityId, {
      cardId,
      controllerId,
      zone,
      cost,
    });
  }

  private maybeBackfillFromRef(
    entityId: number,
    ref: number | string | null | undefined,
    options: { overwriteController?: boolean } = {},
  ): void {
    if (typeof ref !== 'string') return;
    const known = this.entities.get(entityId);
    if (!known) return;
    const cardId = /cardId=([A-Z0-9_]+)/i.exec(ref)?.[1];
    if (cardId && known.cardId === '') known.cardId = cardId;
    const player = numberOf(/player=(\d+)/i.exec(ref)?.[1]);
    if (player !== null && (options.overwriteController || known.controllerId === 0)) {
      known.controllerId = player;
    }
  }

  private recentlyFired(entityId: number): boolean {
    const last = this.lastFiredAt.get(entityId);
    return last !== undefined && this.clock() - last < REFIRE_SUPPRESS_MS;
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
