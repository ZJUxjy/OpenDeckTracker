import { BrowserWindow, screen } from 'electron';

export interface OverlayManagerOptions {
  rendererUrl: string;
  preloadPath: string;
  routeHash?: string;
  onFocusChange?: () => void;
  placeWindowAboveHearthstone?: (nativeWindowHandle: Uint8Array) => boolean;
}

export interface BoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UserOffset {
  dx: number;
  dy: number;
}

function boundsEqual(a: BoundsRect, b: BoundsRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Keep the overlay's top-left within the display work-area so an
 * absurd user offset (e.g. dragged way off-screen, then HS shifts)
 * cannot end up in unrecoverable territory. Falls back to the input
 * unchanged if the screen module is unavailable (pre-app-ready or
 * mocked in tests that don't stub `screen`).
 */
function clampToWorkArea(rect: BoundsRect): BoundsRect {
  let workArea: BoundsRect | null = null;
  try {
    workArea = screen.getDisplayMatching(rect).workArea;
  } catch {
    workArea = null;
  }
  if (workArea === null) return rect;
  const minX = workArea.x;
  const minY = workArea.y;
  const maxX = workArea.x + workArea.width - rect.width;
  const maxY = workArea.y + workArea.height - rect.height;
  const clampedX = Math.max(minX, Math.min(rect.x, Math.max(minX, maxX)));
  const clampedY = Math.max(minY, Math.min(rect.y, Math.max(minY, maxY)));
  if (clampedX === rect.x && clampedY === rect.y) return rect;
  return { x: clampedX, y: clampedY, width: rect.width, height: rect.height };
}

export class OverlayManager {
  private win: BrowserWindow | null = null;
  private userEnabled = false;
  private visibleOnScreen = false;
  private targetForeground = false;
  private windowFocused = false;
  /**
   * Whether the player is currently in an active match (PRE_MATCH /
   * IN_MATCH). Driven by the deck-tracker phase. Combined with
   * userEnabled and visibleOnScreen to compute final visibility —
   * the overlay should NOT appear on the main menu, deck picker, or
   * collection screens.
   */
  private inActiveMatch = false;
  private pendingBounds: BoundsRect | null = null;
  private lastAppliedBounds: BoundsRect | null = null;
  /**
   * The most recent rect passed to the public `setBounds` API
   * (i.e. what the HearthstoneWindowTracker derived). Used as the
   * reference frame for computing `userOffset` after a user drag.
   */
  private lastTrackerBounds: BoundsRect | null = null;
  /**
   * Pixel offset the user has dragged the overlay away from the
   * tracker-derived position. Composed onto every subsequent
   * `setBounds` call so the overlay follows Hearthstone window
   * movement while preserving the user's preferred placement.
   * Lives only in memory — not persisted across app restarts.
   */
  private userOffset: UserOffset = { dx: 0, dy: 0 };
  /**
   * Set true around an internal `BrowserWindow.setBounds(...)` call
   * and cleared in the next microtask. Suppresses the `moved` event
   * that fires as a side-effect of our own bounds application, so we
   * only treat true user drags as offset updates.
   */
  private isApplyingTrackerBounds = false;
  private readonly opts: OverlayManagerOptions;
  private readonly routeHash: string;

  constructor(opts: OverlayManagerOptions) {
    this.opts = opts;
    this.routeHash = opts.routeHash ?? '/overlay';
  }

  enable(): void {
    this.userEnabled = true;
    console.log(`[overlay-mgr ${this.routeHash}] enable() userEnabled=true`);
    if (!this.win) this.createWindow();
    this.syncVisibility();
  }

  disable(): void {
    this.userEnabled = false;
    this.visibleOnScreen = false;
    console.log(`[overlay-mgr ${this.routeHash}] disable()`);
    this.syncVisibility();
  }

  setVisibleOnScreen(visible: boolean): void {
    this.visibleOnScreen = visible;
    console.log(`[overlay-mgr ${this.routeHash}] setVisibleOnScreen(${visible})`);
    this.syncVisibility();
  }

  setTargetForeground(foreground: boolean): void {
    if (this.targetForeground === foreground) return;
    this.targetForeground = foreground;
    console.log(`[overlay-mgr ${this.routeHash}] setTargetForeground(${foreground})`);
    this.syncVisibility();
  }

  isWindowFocused(): boolean {
    return this.windowFocused;
  }

  setInActiveMatch(active: boolean): void {
    if (this.inActiveMatch === active) return;
    this.inActiveMatch = active;
    console.log(`[overlay-mgr ${this.routeHash}] setInActiveMatch(${active})`);
    this.syncVisibility();
  }

  setBounds(rect: BoundsRect): void {
    this.lastTrackerBounds = { ...rect };
    if (!this.win || this.win.isDestroyed()) {
      // Window not yet created — remember the tracker bounds and
      // apply (composed) on createWindow().
      this.pendingBounds = { ...rect };
      console.log(`[overlay-mgr ${this.routeHash}] setBounds before window — buffered`);
      return;
    }
    this.applyComposedBounds(rect);
  }

  private applyComposedBounds(trackerRect: BoundsRect): void {
    if (!this.win || this.win.isDestroyed()) return;
    const composed: BoundsRect = {
      x: trackerRect.x + this.userOffset.dx,
      y: trackerRect.y + this.userOffset.dy,
      width: trackerRect.width,
      height: trackerRect.height,
    };
    const clamped = clampToWorkArea(composed);
    if (this.lastAppliedBounds && boundsEqual(this.lastAppliedBounds, clamped)) {
      return;
    }
    console.log(
      `[overlay-mgr ${this.routeHash}] setBounds → ${clamped.x},${clamped.y} ${clamped.width}×${clamped.height}` +
        (this.userOffset.dx !== 0 || this.userOffset.dy !== 0
          ? ` (tracker ${trackerRect.x},${trackerRect.y} + offset ${this.userOffset.dx},${this.userOffset.dy})`
          : ''),
    );
    this.isApplyingTrackerBounds = true;
    this.win.setBounds(clamped);
    queueMicrotask(() => {
      this.isApplyingTrackerBounds = false;
    });
    this.lastAppliedBounds = { ...clamped };
    this.syncZOrder();
  }

  dispose(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy();
    }
    this.win = null;
    this.windowFocused = false;
  }

  private createWindow(): void {
    this.win = new BrowserWindow({
      transparent: true,
      frame: false,
      resizable: true,
      movable: true,
      skipTaskbar: true,
      alwaysOnTop: false,
      // focusable=true so the user can click into the panel to interact
      // (drag, scroll, hover). With focusable=false, drag regions don't
      // respond on Windows.
      focusable: true,
      fullscreenable: false,
      hasShadow: false,
      show: false,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      webPreferences: {
        preload: this.opts.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    this.win.setAlwaysOnTop(false);

    this.win.on('moved', () => {
      if (this.isApplyingTrackerBounds) return;
      if (this.lastTrackerBounds === null) return;
      if (!this.win || this.win.isDestroyed()) return;
      const cur = this.win.getBounds();
      this.userOffset = {
        dx: cur.x - this.lastTrackerBounds.x,
        dy: cur.y - this.lastTrackerBounds.y,
      };
      this.lastAppliedBounds = { x: cur.x, y: cur.y, width: cur.width, height: cur.height };
      console.log(
        `[overlay-mgr ${this.routeHash}] user-moved → offset dx=${this.userOffset.dx} dy=${this.userOffset.dy}`,
      );
    });
    this.win.on('focus', () => {
      if (this.windowFocused) return;
      this.windowFocused = true;
      this.opts.onFocusChange?.();
    });
    this.win.on('blur', () => {
      if (!this.windowFocused) return;
      this.windowFocused = false;
      this.opts.onFocusChange?.();
    });

    if (this.pendingBounds) {
      this.applyComposedBounds(this.pendingBounds);
      this.pendingBounds = null;
    }

    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) {
      void this.win.loadURL(`${devUrl}#${this.routeHash}`);
    } else {
      void this.win.loadFile(this.opts.rendererUrl, { hash: this.routeHash });
    }
  }

  private syncVisibility(): void {
    if (!this.win || this.win.isDestroyed()) {
      console.log(`[overlay-mgr ${this.routeHash}] syncVisibility skipped (no window)`);
      return;
    }
    const shouldShow = this.userEnabled && this.visibleOnScreen && this.inActiveMatch;
    console.log(
      `[overlay-mgr ${this.routeHash}] syncVisibility: userEnabled=${this.userEnabled} visibleOnScreen=${this.visibleOnScreen} inActiveMatch=${this.inActiveMatch} targetForeground=${this.targetForeground} → ${shouldShow ? 'show' : 'hide'}`,
    );
    if (shouldShow) {
      this.win.showInactive();
      this.syncZOrder();
    } else {
      this.win.hide();
      this.win.setAlwaysOnTop(false);
    }
  }

  private syncZOrder(): void {
    if (!this.win || this.win.isDestroyed()) return;
    if (!this.userEnabled || !this.visibleOnScreen || !this.inActiveMatch) return;
    if (this.targetForeground) {
      this.win.setAlwaysOnTop(true, 'screen-saver');
      (this.win as { moveTop?: () => void }).moveTop?.();
    } else {
      this.win.setAlwaysOnTop(false);
      const placed =
        this.opts.placeWindowAboveHearthstone?.(this.win.getNativeWindowHandle()) ?? false;
      if (!placed) {
        console.log(`[overlay-mgr ${this.routeHash}] placeWindowAboveHearthstone skipped/failed`);
      }
    }
  }
}
