export interface MatchStartSyncTriggerOptions {
  onPhase: (cb: (phase: string) => void) => () => void;
  syncFromLive: () => Promise<unknown>;
  now: () => number;
  /** Minimum interval between successive syncs (default 5000 ms). */
  minIntervalMs?: number;
}

/**
 * Fire `syncFromLive()` once on every `IDLE → PRE_MATCH` deck-tracker
 * phase transition, debounced by `minIntervalMs`. Phase oscillations
 * during match setup can fire `PRE_MATCH` multiple times in close
 * succession; the host's single-flight handles overlap but does not
 * throttle distinct sequential calls. Failures are swallowed so the
 * subscription survives transient HearthMirror errors.
 */
export function createMatchStartSyncTrigger(
  options: MatchStartSyncTriggerOptions,
): () => void {
  const { onPhase, syncFromLive, now, minIntervalMs = 5000 } = options;
  let previousPhase: string | null = null;
  let lastTriggeredAt = Number.NEGATIVE_INFINITY;

  const unsubscribe = onPhase((phase) => {
    const prev = previousPhase;
    previousPhase = phase;
    if (prev !== 'IDLE' || phase !== 'PRE_MATCH') return;
    const t = now();
    if (t - lastTriggeredAt < minIntervalMs) return;
    lastTriggeredAt = t;
    try {
      const result = syncFromLive();
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(() => undefined);
      }
    } catch {
      // swallow synchronous failures so the subscription survives
    }
  });

  return unsubscribe;
}
