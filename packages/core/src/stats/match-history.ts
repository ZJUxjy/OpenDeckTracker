export type MatchResult = 'win' | 'loss' | 'unknown';
export type PlayOrder = 'first' | 'coin' | 'unknown';
export type StatsTimeFilter = 'today' | 'week' | 'season' | 'all-time';
export type MatchHistorySource = 'deck-tracker';

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
  opponentName: string | null;
  opponentClass: string | null;
  source: MatchHistorySource;
}

export interface NormalizedCompletedMatch extends CompletedMatchSummary {
  durationSeconds: number;
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

export function normalizeCompletedMatch(match: CompletedMatchSummary): NormalizedCompletedMatch {
  const durationSeconds = Math.max(0, Math.floor((match.endedAt - match.startedAt) / 1000));
  const normalized = { ...match, durationSeconds };
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
