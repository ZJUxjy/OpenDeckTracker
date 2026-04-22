// Shared domain enums + interfaces for the Game state machine.
//
// Mirrors the relevant subset of `HearthDb.Enums.*` (the canonical
// Hearthstone enum source) — we don't import HearthDb directly here
// because pulling its full enum table into @hdt/core would force a
// dep on @hdt/hearthdb. Anything we add here is the strict minimum
// for M2 deck-tracker logic.

/** Match lifecycle phases tracked by `Game.phase`. */
export type MatchPhase = 'IDLE' | 'PRE_MATCH' | 'IN_MATCH' | 'POST_MATCH';

/**
 * Entity zones — mirrors `HearthDb.Enums.Zone` numerically; we use a
 * string union here because TypeScript discriminated unions are
 * friendlier to consume than i32 enum values, and the IPC layer
 * already converts.
 *
 * INVALID covers entities with `m_realTimeZone == 0` (game-internal
 * objects like the Game/Player entities themselves that don't sit in
 * a player-facing zone).
 */
export type Zone =
  | 'INVALID'
  | 'PLAY'
  | 'DECK'
  | 'HAND'
  | 'GRAVEYARD'
  | 'REMOVEDFROMGAME'
  | 'SETASIDE'
  | 'SECRET';

/** Numeric Zone values matching `tags::zone` constants in the Rust layer. */
export const ZONE_BY_VALUE: Readonly<Record<number, Zone>> = {
  0: 'INVALID',
  1: 'PLAY',
  2: 'DECK',
  3: 'HAND',
  4: 'GRAVEYARD',
  5: 'REMOVEDFROMGAME',
  6: 'SETASIDE',
  7: 'SECRET',
};

export function zoneFromNumber(value: number): Zone {
  return ZONE_BY_VALUE[value] ?? 'INVALID';
}

/**
 * Optional per-entity flags. M2 leaves all of these `undefined`
 * (memory-only data source can't fill them); M3 (log stream)
 * populates them from Power.log events.
 *
 * Consumers MUST treat `undefined` as "unknown, conservative default" —
 * e.g. `info.created !== true` means "treat as not created" (same as
 * `info.created === false` would).
 */
export interface EntityInfo {
  /** True if the entity was generated mid-game (Discover, Burgle, etc.). */
  created?: boolean;
  /** True if the entity was originally controlled by the OTHER player. */
  stolen?: boolean;
  /** True if the entity is intentionally hidden from the local player. */
  hidden?: boolean;
  /** True if the entity was a starting-hand card later mulligan-replaced. */
  mulliganed?: boolean;
  /** Player id that originally controlled the entity at game start. */
  originalController?: number;
  /** Zone the entity was originally placed in at game start. */
  originalZone?: Zone;
}
