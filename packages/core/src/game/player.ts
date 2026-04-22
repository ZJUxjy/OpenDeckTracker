import { Entity } from './entity';
import type { DeckSnapshot } from './deck-snapshot';

/**
 * Per-player canonical state. Zone projections (`hand`, `board`, etc.)
 * are derived from the parent `Game.entities` map filtered by
 * controllerId + zone — this keeps a single source of truth for entity
 * state.
 */
export class Player {
  public readonly controllerId: number;
  public readonly isLocal: boolean;
  public name: string;
  /** Set on PRE_MATCH→IN_MATCH transition for `localPlayer` only. */
  public originalDeck: DeckSnapshot | null;

  /** Bound parent Game's entities map; reassigned by `Game._linkPlayer`. */
  private _entities: ReadonlyMap<number, Entity>;

  constructor(args: { controllerId: number; isLocal: boolean; name?: string }) {
    this.controllerId = args.controllerId;
    this.isLocal = args.isLocal;
    this.name = args.name ?? '';
    this.originalDeck = null;
    this._entities = new Map();
  }

  /** @internal — called by `Game` to wire the entities map after construction. */
  _bindEntities(entities: ReadonlyMap<number, Entity>): void {
    this._entities = entities;
  }

  /** All entities controlled by this player (in any zone). */
  get entities(): Entity[] {
    return Array.from(this._entities.values()).filter((e) => e.controllerId === this.controllerId);
  }

  get hand(): Entity[] {
    return this.entities.filter((e) => e.isInHand);
  }

  get board(): Entity[] {
    return this.entities.filter((e) => e.isInPlay);
  }

  get deck(): Entity[] {
    return this.entities.filter((e) => e.isInDeck);
  }

  get graveyard(): Entity[] {
    return this.entities.filter((e) => e.isInGraveyard);
  }

  get secret(): Entity[] {
    return this.entities.filter((e) => e.isInSecret);
  }

  /** Hand size (counts face-down opposing-hand entities too if they exist). */
  get handCount(): number {
    return this.hand.length;
  }

  /** Remaining cards in the deck zone (face-down or face-up). */
  get deckCount(): number {
    return this.deck.length;
  }
}
