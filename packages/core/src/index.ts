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
export type {
  ExtraDisplayCardLookup,
  ExtraDisplayCardMetadata,
  ExtraDisplayPoolEntry,
  ExtraDisplaySnapshot,
} from './tracker/extra-display-state';
export { OPPONENT_MINIONS_PLAYED_LAST_TURN_STILL_IN_PLAY_POOL } from './tracker/extra-display-state';
export {
  HERALD_COUNTER_KEY,
  heraldBlockTypeForTiming,
  heraldTriggerTiming,
  isHeraldCaster,
  isHeraldPayoff,
  isHeraldRelatedCard,
} from './tracker/herald';
export type { HeraldCardMetadata, HeraldTriggerTiming } from './tracker/herald';
export type {
  KnownDeckPosition,
  DeckPositionPlacement,
  DeckPositionExtractor,
} from './tracker/deck-position/types';
export {
  COST_REDUCTION_BY_CARD_ID,
  formatCostReductionHoverLine,
  getCostReductionRule,
} from './tracker/cost-reduction-cards';
export type {
  CostReductionDriver,
  CostReductionRule,
  CostReductionScope,
} from './tracker/cost-reduction-cards';

// Opponent deck prediction.
export { predictOpponentDecks } from './tracker/opponent-deck-prediction';
export type {
  OpponentDeckPrediction,
  PredictionConfidence,
  PredictionInput,
} from './tracker/opponent-deck-prediction';

// Board-attack calculator.
export { computeBoardAttack, computeMaxFaceDamage } from './tracker/board-attack';
export type {
  BoardAttackTotals,
  ComputeBoardAttackOptions,
  HeroAttackState,
  HeroVitals,
  MinionTags,
  WeaponState,
} from './tracker/board-attack';

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
  classifyMatchMode,
  isConstructedMatch,
  isRecordableMatch,
  normalizeCompletedMatch,
} from './stats/match-history';
export type {
  CompletedMatchSummary,
  MatchClassification,
  MatchHistoryRecord,
  MatchHistorySource,
  MatchMode,
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
  type MatchModeFilter,
  filterMatchesByMode,
} from './stats/match-mode-filter';
export {
  computeDeckLadderWinrate,
  type DeckLadderWinrateQuery,
  type DeckLadderWinrateStats,
} from './stats/deck-ladder-winrate';
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
export {
  computeSavedDeckMatchups,
  type SavedDeckMatchupOptions,
  type SavedDeckMatchupStats,
} from './stats/saved-deck-matchups';

// Collection set-progress aggregation.
export { computeSetProgress } from './collection/set-progress';
export type { SetProgress } from './collection/set-progress';

// Rarity → max copies + dust value helpers.
export { dustValueForRarity, maxCopiesForRarity } from './collection/dust';

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
export { deriveGameProgressAnalysisEvents } from './recordings/game-progress-analysis';
export type {
  GameProgressAnalysisActor,
  GameProgressAnalysisEvent,
  GameProgressAnalysisEventKind,
} from './recordings/game-progress-analysis';
export { narrateGameProgressEvents } from './recordings/game-progress-narration';
export type {
  CardNameResolver,
  GameProgressNarrationFactValue,
  GameProgressNarrationFrame,
} from './recordings/game-progress-narration';

// Lower-level utilities (exposed for testing + advanced consumers).
export { PollingLoop } from './tracker/polling-loop';
export { nextPhase } from './tracker/phase-machine';
export type { PhaseSignals } from './tracker/phase-machine';
export { resolvePhaseSignals } from './tracker/phase-signals';
export type { LogPhaseSignals, MirrorPhaseSignals } from './tracker/phase-signals';
export { createLocalPlayerResolver } from './tracker/local-player-resolver';
export type { LocalPlayerResolver, ZoneEntityObservation } from './tracker/local-player-resolver';

// Global-effects domain.
export type {
  ActiveEffect,
  AnimalCompanionPoolParams,
  CardPlayedEvent,
  EffectDef,
  ExpireRule,
  ExtractCtx,
  GameMode as GlobalEffectsGameMode,
} from './global-effects';
export { EFFECT_CATALOG, GlobalEffectsRegistry, CardPlayedDetector } from './global-effects';
export type { GlobalEffectsRegistryArgs } from './global-effects';
