import type { MatchPhase } from '@hdt/core';

export const DEFAULT_OVERLAY_INACTIVE_DEBOUNCE_MS = 1500;

export interface OverlayActiveMatchGate {
  setPhase(phase: MatchPhase | string): void;
  setLiveMatchActive(active: boolean): void;
  dispose(): void;
}

export interface OverlayActiveMatchGateOptions {
  setActive: (active: boolean) => void;
  inactiveDebounceMs?: number;
}

export function createOverlayActiveMatchGate(opts: OverlayActiveMatchGateOptions): OverlayActiveMatchGate {
  const inactiveDebounceMs = opts.inactiveDebounceMs ?? DEFAULT_OVERLAY_INACTIVE_DEBOUNCE_MS;
  let phaseSignal: MatchPhase | string = 'IDLE';
  let livePowerSignal = false;
  let emittedActive = false;
  let inactiveTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const desiredActive = (): boolean => phaseSignal === 'IN_MATCH' || livePowerSignal;

  const clearInactiveTimer = (): void => {
    if (inactiveTimer === null) return;
    clearTimeout(inactiveTimer);
    inactiveTimer = null;
  };

  const emitActive = (active: boolean): void => {
    if (disposed || emittedActive === active) return;
    emittedActive = active;
    opts.setActive(active);
  };

  const recompute = (): void => {
    if (disposed) return;
    if (desiredActive()) {
      clearInactiveTimer();
      emitActive(true);
      return;
    }

    if (!emittedActive || inactiveTimer !== null) return;
    inactiveTimer = setTimeout(() => {
      inactiveTimer = null;
      if (!desiredActive()) emitActive(false);
    }, inactiveDebounceMs);
    (inactiveTimer as { unref?: () => void }).unref?.();
  };

  return {
    setPhase(phase): void {
      phaseSignal = phase;
      recompute();
    },
    setLiveMatchActive(active): void {
      livePowerSignal = active;
      recompute();
    },
    dispose(): void {
      disposed = true;
      clearInactiveTimer();
    },
  };
}
