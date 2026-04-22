import type { MatchPhase } from '../game/types';

/**
 * Per-poll phase decision. Pure function — given the current phase and
 * the relevant signals from the latest snapshot, returns the next
 * phase. Per design D4 the rules are:
 *
 *   IDLE         → PRE_MATCH        when getMatchInfo non-null
 *   PRE_MATCH    → IN_MATCH         when getDeckState non-null (cards dealt)
 *   IN_MATCH    → POST_MATCH        when isGameOver true OR matchInfo null
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
      if (signals.isGameOver) return 'POST_MATCH';
      return signals.hasDeckState ? 'IN_MATCH' : 'PRE_MATCH';
    case 'IN_MATCH':
      if (signals.isGameOver) return 'POST_MATCH';
      if (!signals.hasMatchInfo) return 'POST_MATCH';
      return 'IN_MATCH';
    case 'POST_MATCH':
      // One-shot — once consumers have seen POST_MATCH, the next tick
      // should always return IDLE so the cycle can begin again.
      return 'IDLE';
  }
}
