import type { MatchPhase } from '../game/types';

/**
 * Per-poll phase decision. Pure function — given the current phase and
 * the relevant signals from the latest snapshot, returns the next
 * phase. Per design D4 the rules are:
 *
 *   IDLE         → PRE_MATCH        when getMatchInfo non-null
 *   PRE_MATCH    → IN_MATCH         when getDeckState non-null (cards dealt)
 *   IN_MATCH    → POST_MATCH        when matchInfo null, or when deck state
 *                                      disappears (game ended + scene cleanup)
 *   POST_MATCH  → IDLE              always (one-shot transition)
 *
 * Spectator mode (`isSpectating === true`) forces the phase back to
 * IDLE — M2 doesn't track spectated games (per design non-goals).
 */
export interface PhaseSignals {
  hasMatchInfo: boolean;
  hasDeckState: boolean;
  isGameOver: boolean;
  isSpectating: boolean;
}

export function nextPhase(current: MatchPhase, signals: PhaseSignals): MatchPhase {
  if (signals.isSpectating) {
    return 'IDLE';
  }
  switch (current) {
    case 'IDLE':
      return signals.hasMatchInfo ? 'PRE_MATCH' : 'IDLE';
    case 'PRE_MATCH':
      if (!signals.hasMatchInfo) return 'IDLE';
      return signals.hasDeckState ? 'IN_MATCH' : 'PRE_MATCH';
    case 'IN_MATCH':
      if (!signals.hasMatchInfo) return 'POST_MATCH';
      // When deck state disappears during IN_MATCH, the match has
	      // ended. We do NOT gate on isGameOver here because GameState
	      // singleton may already be torn down by the time deck state
	      // clears — causing isGameOver to falsely return false.
	      if (!signals.hasDeckState) return 'POST_MATCH';
      return 'IN_MATCH';
    case 'POST_MATCH':
      // One-shot — once consumers have seen POST_MATCH, the next tick
      // should always return IDLE so the cycle can begin again.
      return 'IDLE';
  }
}
