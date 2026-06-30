export interface BoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayPanelBounds {
  opponent: BoundsRect;
  player: BoundsRect;
}

export interface OverlayStableStateMonitor {
  setVisibility(visible: boolean): void;
  setForeground(foreground: boolean): void;
  setPanelBounds(bounds: OverlayPanelBounds): void;
  reset(): void;
  dispose(): void;
}

export interface CreateOverlayStableStateMonitorOptions {
  applyVisibility: (visible: boolean) => void;
  applyForeground: (foreground: boolean) => void;
  applyBounds: (bounds: OverlayPanelBounds) => void;
  stabilityMs?: number;
}

const DEFAULT_STABILITY_MS = 1000;

interface StableChannel<T> {
  pending: T | undefined;
  applied: T | undefined;
  timer: ReturnType<typeof setTimeout> | null;
}

function boundsEqual(a: BoundsRect, b: BoundsRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function panelBoundsEqual(a: OverlayPanelBounds, b: OverlayPanelBounds): boolean {
  return boundsEqual(a.opponent, b.opponent) && boundsEqual(a.player, b.player);
}

function cloneBounds(bounds: BoundsRect): BoundsRect {
  return { ...bounds };
}

function clonePanelBounds(bounds: OverlayPanelBounds): OverlayPanelBounds {
  return {
    opponent: cloneBounds(bounds.opponent),
    player: cloneBounds(bounds.player),
  };
}

function clearChannel<T>(channel: StableChannel<T>): void {
  if (channel.timer !== null) {
    clearTimeout(channel.timer);
    channel.timer = null;
  }
  channel.pending = undefined;
}

function resetChannel<T>(channel: StableChannel<T>): void {
  clearChannel(channel);
  channel.applied = undefined;
}

function scheduleStableApply<T>(
  channel: StableChannel<T>,
  value: T,
  opts: {
    stabilityMs: number;
    equals: (a: T, b: T) => boolean;
    clone: (value: T) => T;
    apply: (value: T) => void;
  },
): void {
  const next = opts.clone(value);

  if (channel.applied !== undefined && opts.equals(channel.applied, next)) {
    clearChannel(channel);
    return;
  }

  if (channel.pending !== undefined && opts.equals(channel.pending, next)) {
    return;
  }

  clearChannel(channel);
  channel.pending = next;
  channel.timer = setTimeout(() => {
    channel.timer = null;
    if (channel.pending === undefined) return;
    const stable = opts.clone(channel.pending);
    channel.pending = undefined;
    if (channel.applied !== undefined && opts.equals(channel.applied, stable)) return;
    channel.applied = opts.clone(stable);
    opts.apply(stable);
  }, opts.stabilityMs);
  (channel.timer as { unref?: () => void }).unref?.();
}

export function createOverlayStableStateMonitor(
  opts: CreateOverlayStableStateMonitorOptions,
): OverlayStableStateMonitor {
  const stabilityMs = opts.stabilityMs ?? DEFAULT_STABILITY_MS;
  const visibility: StableChannel<boolean> = { pending: undefined, applied: undefined, timer: null };
  const foreground: StableChannel<boolean> = { pending: undefined, applied: undefined, timer: null };
  const panelBounds: StableChannel<OverlayPanelBounds> = {
    pending: undefined,
    applied: undefined,
    timer: null,
  };

  return {
    setVisibility(visible): void {
      scheduleStableApply(visibility, visible, {
        stabilityMs,
        equals: (a, b) => a === b,
        clone: (value) => value,
        apply: opts.applyVisibility,
      });
    },
    setForeground(isForeground): void {
      scheduleStableApply(foreground, isForeground, {
        stabilityMs,
        equals: (a, b) => a === b,
        clone: (value) => value,
        apply: opts.applyForeground,
      });
    },
    setPanelBounds(bounds): void {
      scheduleStableApply(panelBounds, bounds, {
        stabilityMs,
        equals: panelBoundsEqual,
        clone: clonePanelBounds,
        apply: opts.applyBounds,
      });
    },
    reset(): void {
      resetChannel(visibility);
      resetChannel(foreground);
      resetChannel(panelBounds);
    },
    dispose(): void {
      this.reset();
    },
  };
}
