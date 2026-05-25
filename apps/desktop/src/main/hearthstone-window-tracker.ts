import type { HearthstoneWindow } from '@hdt/hearthmirror';

export interface BoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TrackerEvent =
  | { kind: 'bounds'; bounds: BoundsRect }
  | { kind: 'visibility'; visible: boolean }
  | { kind: 'foreground'; foreground: boolean };

export interface HearthstoneWindowTracker {
  addClient(): void;
  removeClient(): void;
  subscribe(cb: (event: TrackerEvent) => void): () => void;
  stop(): void;
}

export type WindowEventSubscription = (notifyWindowChanged: () => void) => (() => void) | null | undefined;

export interface CreateOptions {
  getWindow: () => Promise<HearthstoneWindow | null>;
  intervalMs?: number;
  watchdogIntervalMs?: number;
  falseStreakThreshold?: number;
  subscribeToWindowEvents?: WindowEventSubscription;
}

const DEFAULT_INTERVAL_MS = 200;
const DEFAULT_WATCHDOG_INTERVAL_MS = 1000;
const DEFAULT_FALSE_STREAK = 5;

function boundsEqual(a: BoundsRect, b: BoundsRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function createHearthstoneWindowTracker(opts: CreateOptions): HearthstoneWindowTracker {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const watchdogIntervalMs = opts.watchdogIntervalMs ?? DEFAULT_WATCHDOG_INTERVAL_MS;
  const falseStreakThreshold = opts.falseStreakThreshold ?? DEFAULT_FALSE_STREAK;

  let clientCount = 0;
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let unsubscribeWindowEvents: (() => void) | null = null;
  let falseStreak = 0;
  let lastBounds: BoundsRect | null = null;
  let lastVisible = false;
  let lastForeground = false;
  const subscribers: Array<(e: TrackerEvent) => void> = [];
  let polling = false;
  let pollAgain = false;

  function emit(event: TrackerEvent): void {
    for (const cb of subscribers) cb(event);
  }

  let pollCount = 0;
  function requestPoll(): void {
    if (polling) {
      pollAgain = true;
      return;
    }
    void poll();
  }

  async function poll(): Promise<void> {
    polling = true;
    pollCount++;
    try {
      let result: HearthstoneWindow | null;
      let threw = false;
      try {
        result = await opts.getWindow();
      } catch (e) {
        threw = true;
        result = null;
        if (pollCount <= 3 || pollCount % 25 === 0) {
          console.error('[overlay-tracker] getWindow threw:', (e as Error).message);
        }
      }

      if (pollCount === 1 || pollCount % 25 === 0) {
        console.log(
          `[overlay-tracker] poll #${pollCount}: result=${result === null ? 'null' : `{${result.x},${result.y} ${result.width}×${result.height} vis=${result.visible} min=${result.minimized} fg=${result.foreground}}`}${threw ? ' (threw)' : ''}`,
        );
      }

      const isPresent = result !== null && result.visible && !result.minimized;
      const isForeground = isPresent && result !== null && result.foreground;

      if (isPresent && result !== null) {
        // Reset streak — any present reading clears the throttle.
        falseStreak = 0;
        const next: BoundsRect = {
          x: result.x, y: result.y, width: result.width, height: result.height,
        };
        const boundsChanged = !lastBounds || !boundsEqual(lastBounds, next);
        if (boundsChanged) {
          lastBounds = next;
          console.log(`[overlay-tracker] emit bounds: ${next.x},${next.y} ${next.width}×${next.height}`);
          emit({ kind: 'bounds', bounds: next });
        }
        if (!lastVisible) {
          lastVisible = true;
          console.log('[overlay-tracker] emit visibility: true');
          emit({ kind: 'visibility', visible: true });
        }
        if (lastForeground !== isForeground) {
          lastForeground = isForeground;
          console.log(`[overlay-tracker] emit foreground: ${isForeground}`);
          emit({ kind: 'foreground', foreground: isForeground });
        }
      } else {
        if (lastForeground) {
          lastForeground = false;
          console.log('[overlay-tracker] emit foreground: false');
          emit({ kind: 'foreground', foreground: false });
        }
        falseStreak++;
        if (falseStreak >= falseStreakThreshold && lastVisible) {
          lastVisible = false;
          console.log(`[overlay-tracker] emit visibility: false (streak=${falseStreak})`);
          emit({ kind: 'visibility', visible: false });
        }
      }
    } finally {
      polling = false;
      if (pollAgain) {
        pollAgain = false;
        requestPoll();
      }
    }
  }

  function startWindowEvents(): boolean {
    if (!opts.subscribeToWindowEvents || unsubscribeWindowEvents !== null) return false;
    try {
      const unsubscribe = opts.subscribeToWindowEvents(requestPoll);
      if (typeof unsubscribe !== 'function') return false;
      unsubscribeWindowEvents = unsubscribe;
      console.log('[overlay-tracker] native window events subscribed');
      return true;
    } catch (e) {
      console.error('[overlay-tracker] native window event subscription failed:', (e as Error).message);
      unsubscribeWindowEvents = null;
      return false;
    }
  }

  function stopWindowEvents(): void {
    if (unsubscribeWindowEvents === null) return;
    const unsubscribe = unsubscribeWindowEvents;
    unsubscribeWindowEvents = null;
    try {
      unsubscribe();
    } catch (e) {
      console.error('[overlay-tracker] native window event unsubscribe failed:', (e as Error).message);
    }
  }

  function start(): void {
    if (pollHandle !== null) return;
    falseStreak = 0;
    const eventSourceActive = startWindowEvents();
    requestPoll();
    const activeIntervalMs = eventSourceActive ? watchdogIntervalMs : intervalMs;
    pollHandle = setInterval(requestPoll, activeIntervalMs);
  }

  function stop(): void {
    stopWindowEvents();
    if (pollHandle !== null) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    pollAgain = false;
    falseStreak = 0;
    lastBounds = null;
    lastVisible = false;
    lastForeground = false;
  }

  return {
    addClient(): void {
      clientCount++;
      console.log(`[overlay-tracker] addClient → count=${clientCount}`);
      if (clientCount === 1) {
        console.log('[overlay-tracker] start polling');
        start();
      }
    },
    removeClient(): void {
      if (clientCount === 0) return;
      clientCount--;
      console.log(`[overlay-tracker] removeClient → count=${clientCount}`);
      if (clientCount === 0) {
        console.log('[overlay-tracker] stop polling');
        stop();
      }
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
