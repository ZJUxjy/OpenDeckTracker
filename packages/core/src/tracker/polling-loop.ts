/**
 * Adaptive `setTimeout`-recursion loop with `requestImmediate` for
 * catch-up polls. Used by `DeckTracker` to bound IPC load while
 * still reacting quickly to detected hand-size changes.
 *
 * Per design D6:
 *   - IDLE: 2000ms baseline
 *   - PRE_MATCH: 500ms
 *   - IN_MATCH: 500ms baseline, 100ms one-shot after a draw
 *
 * Errors thrown by the user-supplied callback are NOT propagated up
 * the loop (a single bad poll shouldn't stop the tracker); they're
 * routed to the optional `onError` handler.
 */
export class PollingLoop {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private intervalMs = 2000;
  private fn: (() => void | Promise<void>) | null = null;
  private onError: ((err: unknown) => void) | undefined;

  /**
   * Start the loop. The callback fires immediately (after a 0ms
   * `setTimeout` so it doesn't run synchronously inside `start`),
   * then repeatedly at the current interval.
   */
  start(intervalMs: number, fn: () => void | Promise<void>, onError?: (err: unknown) => void): void {
    if (this.running) return;
    this.running = true;
    this.intervalMs = intervalMs;
    this.fn = fn;
    this.onError = onError;
    this.timer = setTimeout(this.tick, 0);
  }

  /** Update the polling interval. Takes effect on the NEXT scheduled tick. */
  setInterval(intervalMs: number): void {
    this.intervalMs = intervalMs;
  }

  /** Schedule the next tick to fire as soon as possible (~0ms). */
  requestImmediate(): void {
    if (!this.running) return;
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(this.tick, 0);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.fn = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  private tick = async (): Promise<void> => {
    if (!this.running || this.fn === null) return;
    const fn = this.fn;
    try {
      await fn();
    } catch (err) {
      this.onError?.(err);
    }
    if (this.running) {
      this.timer = setTimeout(this.tick, this.intervalMs);
    }
  };
}
