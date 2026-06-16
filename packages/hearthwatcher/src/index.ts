export { createHearthWatcher, HearthWatcher } from './log-watcher';
export type { EventPhase, HearthWatcherOptions } from './log-watcher';
export { LogFileWatcher } from './log-file-watcher';
export type { LogFileReadMode, LogFileWatcherOptions } from './log-file-watcher';
export { discoverPowerLog, standardPowerLogPaths } from './log-paths';
export type { LogDiscoveryOptions, LogDiscoveryResult } from './log-paths';
export {
  CLIENT_CONFIG_CONTENTS,
  ensureClientConfig,
  ensureLogConfig,
  logConfigPath,
  REQUIRED_LOG_CONFIG,
} from './log-config';
export type {
  ClientConfigOptions,
  ClientConfigResult,
  LogConfigOptions,
  LogConfigResult,
} from './log-config';
export { findCurrentMatchStartOffset } from './log/match-boundary';
export { parseLogLine } from './log-line';
export type { LogLine } from './log-line';
export {
  parsePowerLine,
  parseEntityRef,
  PowerLineStreamingParser,
} from './parsers/power-parser';
export { parseLoadingScreenLine } from './parsers/loading-screen-parser';
export {
  HearthWatcherGameState,
  type HearthWatcherEntity,
  type OriginalDeckCard,
} from './state/hearthwatcher-game-state';
export { reducePowerEvent } from './state/power-event-reducer';
export { countOriginalDeck, isOriginalEntity } from './state/origin-classifier';
export {
  createParserDiagnostics,
  recordMalformedRecord,
  type HearthWatcherDiagnostic,
  type HearthWatcherStatusKind,
  type ParserDiagnostics,
} from './types/diagnostics';
export type {
  BlockEndEvent,
  BlockStartEvent,
  ChangeEntityEvent,
  CreateGameEvent,
  FullEntityEvent,
  HideEntityEvent,
  PowerEntityRef,
  PowerEvent,
  ShowEntityEvent,
  ShuffleDeckEvent,
  TagChangeEvent,
} from './types/power-events';
export {
  normalizePowerTagName,
  parsePowerTagValue,
  zoneFromTagValue,
  type PowerTagMap,
  type PowerTagValue,
} from './types/power-tags';
export type {
  LoadingScreenEvent,
  LoadingScreenEventType,
} from './types/loading-screen-events';
