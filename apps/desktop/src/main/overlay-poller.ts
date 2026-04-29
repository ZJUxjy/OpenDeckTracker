export interface OverlayPollerOptions {
  isAlive: () => Promise<boolean>;
  onRunningChange: (running: boolean) => void;
  intervalMs?: number;
}

export interface OverlayPoller {
  addClient(): void;
  removeClient(): void;
  stop(): void;
}

const FALSE_STREAK_THRESHOLD = 3;

export function createOverlayPoller(options: OverlayPollerOptions): OverlayPoller {
  const intervalMs = options.intervalMs ?? 3000;

  let clientCount = 0;
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let falseStreak = 0;
  let lastReported = false;

  async function poll(): Promise<void> {
    let alive: boolean;
    try {
      alive = await options.isAlive();
    } catch {
      alive = false;
    }

    if (alive) {
      falseStreak = 0;
      if (!lastReported) {
        lastReported = true;
        options.onRunningChange(true);
      }
    } else {
      falseStreak++;
      if (falseStreak >= FALSE_STREAK_THRESHOLD && lastReported) {
        lastReported = false;
        options.onRunningChange(false);
      }
    }
  }

  function start(): void {
    if (pollHandle !== null) return;
    falseStreak = 0;
    void poll();
    pollHandle = setInterval(() => { void poll(); }, intervalMs);
  }

  function stop(): void {
    if (pollHandle !== null) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    // Reset transient state so a fresh start re-emits the running edge.
    falseStreak = 0;
    lastReported = false;
  }

  return {
    addClient(): void {
      clientCount++;
      if (clientCount === 1) start();
    },
    removeClient(): void {
      if (clientCount === 0) return;
      clientCount--;
      if (clientCount === 0) stop();
    },
    stop,
  };
}
