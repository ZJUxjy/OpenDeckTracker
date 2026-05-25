export type MatchResult = 'win' | 'loss' | 'unknown';
export type PlayOrder = 'first' | 'coin' | 'unknown';
export type StatsTimeFilter = 'today' | 'week' | 'season' | 'all-time';
export type MatchHistorySource = 'deck-tracker';
export type MatchMode = 'ranked' | 'casual' | 'adventure';

export interface MatchClassification {
  gameType: number;
  formatType: number;
  missionId?: number;
}

export interface CompletedMatchSummary extends MatchClassification {
  fingerprint: string;
  startedAt: number;
  endedAt: number;
  result: MatchResult;
  playOrder: PlayOrder;
  deckId: number | null;
  deckName: string | null;
  /**
   * App-managed saved-deck reference, populated when the user picked a
   * saved deck via `DeckSelectDialog` before the match. Absent when the
   * user picked a live deck or no deck attribution was set. Stable across
   * deck edits — `savedDeckVersion` pins the card list at the time of the
   * match.
   */
  savedDeckId?: string;
  savedDeckVersion?: number;
  opponentName: string | null;
  opponentClass: string | null;
  /**
   * Player's hero class for this match (e.g. `'DRUID'`, `'MAGE'`). Sourced
   * from the live deck-tracker snapshot's `deck.class` at match end.
   * `null` when no deck was identified. Used by the matchup-matrix
   * aggregation in `add-stats-analytics-deepening`.
   */
  playerClass?: string | null;
  source: MatchHistorySource;
}

export interface NormalizedCompletedMatch extends CompletedMatchSummary {
  durationSeconds: number;
  matchMode?: MatchMode;
}

export interface MatchHistoryRecord extends NormalizedCompletedMatch {
  id: number;
}

const CONSTRUCTED_GAME_TYPES = new Set([3, 4]);
const CONSTRUCTED_FORMAT_TYPES = new Set([1, 2, 3, 4]);

export function isConstructedMatch(match: MatchClassification): boolean {
  if (match.missionId !== undefined && match.missionId > 0) return false;
  return CONSTRUCTED_GAME_TYPES.has(match.gameType) && CONSTRUCTED_FORMAT_TYPES.has(match.formatType);
}

export function classifyMatchMode(match: MatchClassification): MatchMode | null {
  if (match.missionId !== undefined && match.missionId > 0) return 'adventure';
  if (!CONSTRUCTED_FORMAT_TYPES.has(match.formatType)) return null;
  if (match.gameType === 3) return 'ranked';
  if (match.gameType === 4) return 'casual';
  return null;
}

export function isRecordableMatch(match: MatchClassification): boolean {
  return classifyMatchMode(match) !== null;
}

export function normalizeCompletedMatch(match: CompletedMatchSummary): NormalizedCompletedMatch {
  const durationSeconds = Math.max(0, Math.floor((match.endedAt - match.startedAt) / 1000));
  const matchMode = classifyMatchMode(match);
  const normalized = {
    ...match,
    durationSeconds,
    ...(matchMode !== null ? { matchMode } : {}),
  };
  const fingerprint = match.fingerprint.trim() === '' ? buildMatchFingerprint(normalized) : match.fingerprint;
  return { ...normalized, fingerprint };
}

export function buildMatchFingerprint(match: CompletedMatchSummary): string {
  return [
    'v1',
    match.startedAt,
    match.endedAt,
    match.gameType,
    match.formatType,
    match.missionId ?? '',
    match.deckId ?? '',
    match.deckName ?? '',
    match.opponentName ?? '',
    match.opponentClass ?? '',
    match.result,
    match.playOrder,
  ].join('|');
}
