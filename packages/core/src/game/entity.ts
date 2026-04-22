import type { EntityInfo, Zone } from './types';

/**
 * One in-match entity. ID-keyed and zone-tagged; shape is intentionally
 * minimal (just the fields memory-poll snapshots can fill).
 *
 * In M2 `info` is always all-undefined. M3 will populate it from
 * Power.log events (see design D7).
 */
export class Entity {
  public entityId: number;
  public cardId: string;
  public zone: Zone;
  public controllerId: number;
  public info: EntityInfo;

  constructor(args: {
    entityId: number;
    cardId: string;
    zone: Zone;
    controllerId: number;
    info?: EntityInfo;
  }) {
    this.entityId = args.entityId;
    this.cardId = args.cardId;
    this.zone = args.zone;
    this.controllerId = args.controllerId;
    this.info = args.info ?? {};
  }

  /** True when the entity is in DECK zone (still in the player's library). */
  get isInDeck(): boolean {
    return this.zone === 'DECK';
  }

  /** True when the entity is currently in HAND. */
  get isInHand(): boolean {
    return this.zone === 'HAND';
  }

  /** True when the entity is on the board (PLAY zone). */
  get isInPlay(): boolean {
    return this.zone === 'PLAY';
  }

  /** True when the entity has been used / destroyed (GRAVEYARD zone). */
  get isInGraveyard(): boolean {
    return this.zone === 'GRAVEYARD';
  }

  /** True when the entity is a hidden secret in the SECRET zone. */
  get isInSecret(): boolean {
    return this.zone === 'SECRET';
  }

  /**
   * True when the entity has a known cardId (i.e. is "revealed"). M2
   * uses this to filter "still face-down in deck" entities out of the
   * `seen` set used by the remaining-cards algorithm.
   */
  get isRevealed(): boolean {
    return this.cardId !== '';
  }
}
