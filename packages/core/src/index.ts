// @hdt/core — deck-tracker domain layer.

// Deck domain (CRUD types, validity, diff, import/export).
export * from './deck';

// Game / Player / Entity state machine.
export { Game } from './game/game';
export { Player } from './game/player';
export { Entity } from './game/entity';
export { DeckSnapshot } from './game/deck-snapshot';
export type { GameInit, LogDerivedEntityUpdate } from './game/game';
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

// Stats and match history.
export {
  buildMatchFingerprint,
  isConstructedMatch,
  normalizeCompletedMatch,
} from './stats/match-history';
export type {
  CompletedMatchSummary,
  MatchClassification,
  MatchHistoryRecord,
  MatchHistorySource,
  MatchResult,
  NormalizedCompletedMatch,
  PlayOrder,
  StatsTimeFilter,
} from './stats/match-history';
export {
  aggregateStats,
  filterMatchesByTime,
} from './stats/stats-aggregation';
export type {
  BestDeckStats,
  ClassWinrate,
  RecentMatchView,
  StatsQueryOptions,
  StatsSummary,
} from './stats/stats-aggregation';
export {
  type FormatFilter,
  filterMatchesByFormat,
} from './stats/format-filter';
export {
  computeMatchupMatrix,
  type MatchupCell,
  type MatchupMatrix,
} from './stats/matchup-matrix';
export {
  computeWinrateTimeSeries,
  type TimeSeriesGranularity,
  type WinrateTimeSeriesPoint,
} from './stats/winrate-time-series';
export {
  computePlayOrderSplit,
  type PlayOrderBucket,
  type PlayOrderSplit,
} from './stats/play-order-split';

// Collection set-progress aggregation.
export { computeSetProgress } from './collection/set-progress';
export type { SetProgress } from './collection/set-progress';

// Match recordings.
export {
  buildMatchRecordingSummary,
  createEmptyMatchRecording,
} from './recordings/match-recording';
export type {
  BaseTimelineEvent,
  DrawTimelineEvent,
  MatchRecording,
  MatchRecordingDetail,
  MatchRecordingInitialState,
  MatchRecordingMetadata,
  MatchRecordingStatus,
  MatchRecordingSummary,
  MatchTimelineEvent,
  OpponentRevealTimelineEvent,
  PlayCardTimelineEvent,
  RawEventRef,
  RecordedCardRef,
  RecordedDeckCard,
  RecordedEntityState,
  ShuffleDeckTimelineEvent,
  SimpleTimelineEvent,
  TurnStartTimelineEvent,
} from './recordings/match-recording';
export {
  deriveTimelineEvents,
  sanitizeEntityForRecording,
} from './recordings/timeline-deriver';
export type {
  RecordingEntityLike,
  RecordingEntityRef,
  RecordingEventLike,
} from './recordings/timeline-deriver';

// Lower-level utilities (exposed for testing + advanced consumers).
export { PollingLoop } from './tracker/polling-loop';
export { nextPhase } from './tracker/phase-machine';
export type { PhaseSignals } from './tracker/phase-machine';

// Global-effects domain.
export type {
  ActiveEffect,
  CardPlayedEvent,
  EffectDef,
  ExpireRule,
  ExtractCtx,
  GameMode as GlobalEffectsGameMode,
} from './global-effects';
export { EFFECT_CATALOG } from './global-effects';
