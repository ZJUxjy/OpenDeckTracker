import type { HearthstoneWindow } from '@hdt/hearthmirror';

export interface BoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TrackerEvent =
  | { kind: 'bounds'; bounds: BoundsRect }
  | { kind: 'visibility'; visible: boolean };

export interface HearthstoneWindowTracker {
  addClient(): void;
  removeClient(): void;
  subscribe(cb: (event: TrackerEvent) => void): () => void;
  stop(): void;
}

export interface CreateOptions {
  getWindow: () => Promise<HearthstoneWindow | null>;
  intervalMs?: number;
  falseStreakThreshold?: number;
}

const DEFAULT_INTERVAL_MS = 200;
const DEFAULT_FALSE_STREAK = 5;

function boundsEqual(a: BoundsRect, b: BoundsRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function createHearthstoneWindowTracker(opts: CreateOptions): HearthstoneWindowTracker {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const falseStreakThreshold = opts.falseStreakThreshold ?? DEFAULT_FALSE_STREAK;

  let clientCount = 0;
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let falseStreak = 0;
  let lastBounds: BoundsRect | null = null;
  let lastVisible = false;
  const subscribers: Array<(e: TrackerEvent) => void> = [];

  function emit(event: TrackerEvent): void {
    for (const cb of subscribers) cb(event);
  }

  async function poll(): Promise<void> {
    let result: HearthstoneWindow | null;
    try {
      result = await opts.getWindow();
    } catch {
      result = null;
    }

    const isPresent = result !== null && result.visible && !result.minimized;

    if (isPresent && result !== null) {
      // Reset streak — any present reading clears the throttle.
      falseStreak = 0;
      const next: BoundsRect = {
        x: result.x, y: result.y, width: result.width, height: result.height,
      };
      // Bounds change: emit BEFORE visibility on the appearance edge so
      // subscribers can position before showing.
      const boundsChanged = !lastBounds || !boundsEqual(lastBounds, next);
      if (boundsChanged) {
        lastBounds = next;
        emit({ kind: 'bounds', bounds: next });
      }
      if (!lastVisible) {
        lastVisible = true;
        emit({ kind: 'visibility', visible: true });
      }
    } else {
      falseStreak++;
      if (falseStreak >= falseStreakThreshold && lastVisible) {
        lastVisible = false;
        emit({ kind: 'visibility', visible: false });
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
    falseStreak = 0;
    lastBounds = null;
    lastVisible = false;
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
    subscribe(cb): () => void {
      subscribers.push(cb);
      return (): void => {
        const idx = subscribers.indexOf(cb);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    },
    stop,
  };
}
