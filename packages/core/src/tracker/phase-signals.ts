import type { PhaseSignals } from './phase-machine';

/** Log-derived phase signals, supplied by the host in mirror-absent mode. */
export interface LogPhaseSignals {
  /** A real match is in progress (Power.log STEP reached a real-match value). */
  matchActive: boolean;
  /** Gameplay/cards dealt (mulligan reached). */
  inPlay: boolean;
  /** Game has completed (STATE=COMPLETE / FINAL_GAMEOVER). */
  gameOver: boolean;
}

export interface MirrorPhaseSignals {
  hasMatchInfo: boolean;
  hasDeckState: boolean;
  isGameOver: boolean;
  isSpectating: boolean;
}

/**
 * Merge mirror + log signals into the phase machine's inputs.
 * Mirror wins; log only fills falsy mirror values. Keeps Windows
 * (mirror authoritative) unchanged while letting macOS drive phase from logs.
 */
export function resolvePhaseSignals(
  mirror: MirrorPhaseSignals,
  log: LogPhaseSignals,
): PhaseSignals {
  return {
    hasMatchInfo: mirror.hasMatchInfo || log.matchActive,
    hasDeckState: mirror.hasDeckState || log.inPlay,
    isGameOver: mirror.isGameOver || log.gameOver,
    isSpectating: mirror.isSpectating,
  };
}
