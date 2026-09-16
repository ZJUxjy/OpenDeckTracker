import type { PowerEvent } from '@hdt/hearthwatcher';

export interface OpponentHandCard {
  entityId: number;
  position: number | null;
  cardId: string | null;
  acquiredTurn: number | null;
  keptFromMulligan: boolean | null;
  origin: 'drawn' | 'generated' | 'returned' | 'opening' | 'unknown';
  sourceCardId: string | null;
}

interface TrackedCard extends Omit<OpponentHandCard, 'sourceCardId'> {
  controller: number | null;
  zone: string;
  creator: number | null;
}

const ZONES: Record<number, string> = { 1: 'PLAY', 2: 'DECK', 3: 'HAND', 4: 'GRAVEYARD', 5: 'REMOVEDFROMGAME', 6: 'SETASIDE', 7: 'SECRET' };
const numeric = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};
const entityNumber = (ref: number | string): number | null => numeric(ref) ?? numeric(/\bid=(\d+)/i.exec(String(ref))?.[1]);

/** Public Power.log projection, deliberately independent of memory hand identities. */
export class OpponentHandTimeline {
  private cards = new Map<number, TrackedCard>();
  private turn: number | null = null;
  private opening = new Set<number>();
  private sawMulliganStart = false;
  private inMulligan = false;

  reset(): void {
    this.cards.clear(); this.opening.clear(); this.turn = null;
    this.sawMulliganStart = false; this.inMulligan = false;
  }

  handle(event: PowerEvent): void {
    if (event.type === 'create-game') { this.reset(); return; }
    if (event.type === 'tag-change') {
      if (event.entity === 'GameEntity' && event.tag === 'TURN') this.turn = numeric(event.value);
      if (event.entity === 'GameEntity' && event.tag === 'STEP') {
        if (event.value === 'BEGIN_MULLIGAN' && !this.sawMulliganStart) {
          this.sawMulliganStart = true; this.inMulligan = true;
          for (const card of this.cards.values()) if (card.zone === 'HAND') {
            this.opening.add(card.entityId); card.origin = 'opening'; card.acquiredTurn = 0;
          }
        } else if (String(event.value).startsWith('MAIN_') && this.inMulligan) {
          for (const card of this.cards.values()) if (card.zone === 'HAND') card.keptFromMulligan = this.opening.has(card.entityId);
          this.inMulligan = false;
        }
      }
      const id = entityNumber(event.entity);
      if (id !== null) this.update(id, { [event.tag]: event.value });
    } else if (event.type === 'full-entity') {
      this.update(event.entityId, event.tags, event.cardId, false);
    } else if (event.type === 'show-entity' || event.type === 'change-entity' || event.type === 'hide-entity') {
      const id = entityNumber(event.entity);
      if (id !== null) {
        if (event.type === 'change-entity') {
          const card = this.cards.get(id);
          if (card) card.cardId = null;
        }
        this.update(id, event.tags, event.type === 'hide-entity' ? undefined : event.cardId, event.type === 'show-entity');
      }
    }
  }

  private update(id: number, tags: Readonly<Record<string, unknown>>, cardId?: string, revealed = false): void {
    const card = this.cards.get(id) ?? {
      entityId: id, controller: null, zone: 'UNKNOWN', position: null, cardId: null,
      acquiredTurn: null, keptFromMulligan: null, origin: 'unknown', creator: null,
    };
    const beforeZone = card.zone;
    const beforeController = card.controller;
    card.controller = numeric(tags.CONTROLLER) ?? numeric(tags.PLAYER_ID) ?? card.controller;
    if (tags.ZONE !== undefined) card.zone = ZONES[Number(tags.ZONE)] ?? String(tags.ZONE).toUpperCase();
    card.position = numeric(tags.ZONE_POSITION) ?? card.position;
    card.creator = numeric(tags.CREATOR) ?? card.creator;
    const transferred = beforeController !== null && card.controller !== beforeController;
    if (card.zone === 'HAND' && (beforeZone !== 'HAND' || transferred)) {
      card.acquiredTurn = beforeZone === 'UNKNOWN' || transferred ? null : this.turn;
      card.origin = transferred ? 'unknown' : beforeZone === 'DECK' ? 'drawn'
        : beforeZone === 'PLAY' || beforeZone === 'GRAVEYARD' ? 'returned' : card.creator ? 'generated' : 'unknown';
      card.keptFromMulligan = this.sawMulliganStart && !this.inMulligan ? false : null;
    }
    if (card.zone === 'HAND' && card.creator && card.origin !== 'returned') card.origin = 'generated';
    if (card.zone !== 'HAND' && beforeZone === 'HAND') {
      this.opening.delete(id); card.keptFromMulligan = null; card.position = null;
    }
    // Drawing a previously shuffled public card must not reveal its new hidden identity.
    if (card.zone === 'DECK') card.cardId = null;
    if (cardId && (revealed || card.zone === 'PLAY' || card.zone === 'GRAVEYARD')) card.cardId = cardId;
    this.cards.set(id, card);
  }

  snapshot(controller: number): OpponentHandCard[] {
    return [...this.cards.values()].filter(card => card.zone === 'HAND' && card.controller === controller)
      .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.entityId - b.entityId)
      .map(card => ({
        entityId: card.entityId, position: card.position, cardId: card.cardId, acquiredTurn: card.acquiredTurn,
        keptFromMulligan: card.keptFromMulligan, origin: card.origin,
        sourceCardId: card.creator === null ? null : this.cards.get(card.creator)?.cardId ?? null,
      }));
  }
}
