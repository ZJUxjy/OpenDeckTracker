import type { MatchRecording } from '../recordings/match-recording';
import type { MatchHistoryRecord, PlayOrder } from './match-history';

export interface MulliganFilter {
  savedDeckId?: string;
  opponentClass?: string;
  playOrder?: PlayOrder;
}
interface Outcomes { copies: number; wins: number; losses: number; unknown: number }
export interface MulliganRow { cardId: string; offered: number; kept: Outcomes; replaced: Outcomes }
export interface MulliganStats {
  rows: MulliganRow[];
  sampleSize: number;
  excludedMissingData: number;
  unmatchedRecordings: number;
}
const outcomes = (): Outcomes => ({ copies: 0, wins: 0, losses: 0, unknown: 0 });

export function computeMulliganStats(recordings: readonly MatchRecording[], matches: readonly MatchHistoryRecord[], filter: MulliganFilter = {}): MulliganStats {
  const byFingerprint = new Map(matches.map(match => [match.fingerprint, match]));
  const rows = new Map<string, MulliganRow>();
  let sampleSize = 0;
  let excludedMissingData = 0;
  let unmatchedRecordings = 0;
  const counted = new Set<string>();
  for (const recording of recordings) {
    if (recording.status !== 'completed') continue;
    const match = byFingerprint.get(recording.metadata.matchFingerprint ?? '');
    if (!match) { unmatchedRecordings++; continue; }
    if (filter.savedDeckId && match.savedDeckId !== filter.savedDeckId) continue;
    if (filter.opponentClass && match.opponentClass?.toUpperCase() !== filter.opponentClass.toUpperCase()) continue;
    if (filter.playOrder && match.playOrder !== filter.playOrder) continue;
    const starting = recording.initialState?.startingHand;
    const final = recording.initialState?.postMulliganHand;
    if (!recording.initialState?.mulliganCapture?.startingComplete || !recording.initialState.mulliganCapture.postComplete
      || !starting?.length || !final?.length || !recording.timeline.some(event => event.kind === 'starting-hand')
      || !recording.timeline.some(event => event.kind === 'post-mulligan-hand')
      || starting.some(card => !card.cardId) || final.some(card => !card.cardId)) { excludedMissingData++; continue; }
    if (counted.has(match.fingerprint)) continue;
    counted.add(match.fingerprint);
    sampleSize++;
    const keptEntities = new Set(final.map(card => card.entityId));
    for (const card of starting) {
      const row = rows.get(card.cardId) ?? { cardId: card.cardId, offered: 0, kept: outcomes(), replaced: outcomes() };
      row.offered++;
      const outcome = keptEntities.has(card.entityId) ? row.kept : row.replaced;
      outcome.copies++;
      if (match.result === 'win') outcome.wins++;
      else if (match.result === 'loss') outcome.losses++;
      else outcome.unknown++;
      rows.set(card.cardId, row);
    }
  }
  return { rows: [...rows.values()].sort((a, b) => b.offered - a.offered || a.cardId.localeCompare(b.cardId)), sampleSize, excludedMissingData, unmatchedRecordings };
}
