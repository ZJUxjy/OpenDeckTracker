import type { EventPhase, PowerEvent } from '@hdt/hearthwatcher';
import type { LogPhaseSignals } from '@hdt/core';
import { isRealMatchStepValue } from './match-step-values';

export type LogMatchState = LogPhaseSignals;

export function initialLogMatchState(): LogMatchState {
  return { matchActive: false, inPlay: false, gameOver: false };
}

function isGameComplete(event: PowerEvent): boolean {
  return (
    event.type === 'tag-change' &&
    event.entity === 'GameEntity' &&
    ((event.tag === 'STATE' && event.value === 'COMPLETE') ||
      (event.tag === 'STEP' && event.value === 'FINAL_GAMEOVER'))
  );
}

/**
 * Pure reducer for the Power.log-derived match phase signals (mirror-absent
 * mode). `create-game` resets; a real-match STEP marks the match active +
 * in-play; game-complete ends it. Replay events never flip the gate (mirrors
 * the existing overlay STEP-gate discipline).
 */
export function reduceLogMatchState(
  state: LogMatchState,
  event: PowerEvent,
  eventPhase: EventPhase,
): LogMatchState {
  if (event.type === 'create-game') {
    return initialLogMatchState();
  }
  if (eventPhase === 'live' && isGameComplete(event)) {
    return { matchActive: false, inPlay: false, gameOver: true };
  }
  if (
    eventPhase === 'live' &&
    event.type === 'tag-change' &&
    event.entity === 'GameEntity' &&
    event.tag === 'STEP' &&
    isRealMatchStepValue(event.value)
  ) {
    return { matchActive: true, inPlay: true, gameOver: false };
  }
  return state;
}
