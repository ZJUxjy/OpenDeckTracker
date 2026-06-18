/**
 * STEP tag values that indicate a real, playable match is in progress.
 *
 * Extracted into a leaf module so both `deck-tracker.ts` and
 * `log-match-state.ts` can import it without creating a circular
 * dependency between those two files.
 *
 * The deck-picker preview animation fires CREATE_GAME but does NOT
 * advance STEP through mulligan / main-phase values, so these are
 * safe to gate on. FINAL_GAMEOVER is excluded since it marks the
 * post-match cleanup — the gate is cleared by phase→IDLE anyway.
 */
export function isRealMatchStepValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  switch (value.toUpperCase()) {
    case 'BEGIN_FIRST':
    case 'BEGIN_SHUFFLE':
    case 'BEGIN_DRAW':
    case 'BEGIN_MULLIGAN':
    case 'MAIN_BEGIN':
    case 'MAIN_READY':
    case 'MAIN_START_TRIGGERS':
    case 'MAIN_START':
    case 'MAIN_ACTION':
    case 'MAIN_COMBAT':
    case 'MAIN_END':
    case 'MAIN_NEXT':
    case 'MAIN_CLEANUP':
    case 'MAIN_PRE_ACTION':
    case 'MAIN_POST_ACTION':
      return true;
    default:
      return false;
  }
}
