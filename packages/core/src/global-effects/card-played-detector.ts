import type { PowerEvent } from '@hdt/hearthwatcher';
import type { CardPlayedEvent } from './types';

interface KnownEntity {
  cardId: string;
  controllerId: number;
}

/**
 * Stateful detector that turns the raw HearthWatcher PowerEvent stream
 * into `CardPlayedEvent` calls. We watch FULL_ENTITY / SHOW_ENTITY to
 * keep a tiny `entityId → { cardId, controllerId }` table, and emit a
 * `cardPlayed` whenever we see a TAG_CHANGE moving an entity's ZONE
 * to PLAY (or HAND→PLAY equivalents).
 *
 * Intentionally minimal: no graveyard tracking, no block-aware
 * filtering — the global-effects registry is idempotent on
 * re-triggers, so an extra fire here costs nothing. Living in core
 * keeps it Vitest-friendly and lets the renderer get the same view
 * via the snapshot.
 */
export class CardPlayedDetector {
  private readonly entities = new Map<number, KnownEntity>();
  private readonly emit: (event: CardPlayedEvent) => void;
  private readonly clock: () => number;

  constructor(args: {
    emit: (event: CardPlayedEvent) => void;
    clock?: () => number;
  }) {
    this.emit = args.emit;
    this.clock = args.clock ?? (() => Date.now());
  }

  reset(): void {
    this.entities.clear();
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
      if (known && event.cardId !== '') {
        known.cardId = event.cardId;
      }
      return;
    }
    if (event.type === 'tag-change') {
      const id = entityIdOf(event.entity);
      if (id === null) return;
      if (event.tag === 'CONTROLLER') {
        const known = this.entities.get(id);
        const ctrl = numberOf(event.value);
        if (known && ctrl !== null) known.controllerId = ctrl;
        return;
      }
      if (event.tag !== 'ZONE') return;
      const value = String(event.value);
      if (value !== 'PLAY' && value !== '1') return;
      const known = this.entities.get(id);
      if (!known || known.cardId === '' || known.controllerId === 0) return;
      this.emit({
        cardId: known.cardId,
        controllerId: known.controllerId,
        timestamp: this.clock(),
      });
    }
  }

  private recordEntity(
    entityId: number,
    cardId: string,
    tags: Record<string, unknown>,
  ): void {
    const ctrlRaw = tags['CONTROLLER'];
    const controllerId = numberOf(ctrlRaw) ?? 0;
    const existing = this.entities.get(entityId);
    if (existing) {
      if (cardId !== '') existing.cardId = cardId;
      if (controllerId !== 0) existing.controllerId = controllerId;
      return;
    }
    this.entities.set(entityId, { cardId, controllerId });
  }
}

function entityIdOf(ref: number | string | null | undefined): number | null {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') {
    const match = /id=(\d+)/i.exec(ref);
    if (match) return Number(match[1]);
  }
  return null;
}

function numberOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
