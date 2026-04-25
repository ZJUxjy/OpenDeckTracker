// @hdt/core — deck-tracker domain layer.

// Game / Player / Entity state machine.
export { Game } from './game/game';
export { Player } from './game/player';
export { Entity } from './game/entity';
export { DeckSnapshot } from './game/deck-snapshot';
export type { GameInit } from './game/game';
export type { EntityInfo, MatchPhase, Zone } from './game/types';
export { ZONE_BY_VALUE, zoneFromNumber } from './game/types';

// Algorithm.
export {
  computeRemaining,
  gatherSeenEntities,
} from './tracker/remaining-algorithm';

// Deck copy expansion.
export { expandDeckToCopies } from './tracker/expand-copies';
export type { DeckCopy } from './tracker/expand-copies';

// Tracker orchestrator.
export { DeckTracker } from './tracker/deck-tracker';
export type {
  DeckTrackerSnapshot,
  DeckTrackerEvent,
  DeckTrackerEventName,
  OpponentCardRecord,
} from './tracker/deck-tracker';

// Deck identifiers.
export {
  ChainedDeckIdentifier,
  CallbackDeckIdentifier,
  InGameDeckIdentifier,
} from './tracker/deck-identifier';
export type { IDeckIdentifier, IdentifiedDeck } from './tracker/deck-identifier';

// Lower-level utilities (exposed for testing + advanced consumers).
export { PollingLoop } from './tracker/polling-loop';
export { nextPhase } from './tracker/phase-machine';
export type { PhaseSignals } from './tracker/phase-machine';
