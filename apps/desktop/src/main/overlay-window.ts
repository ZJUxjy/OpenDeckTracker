import { BrowserWindow } from 'electron';

export interface OverlayManagerOptions {
  rendererUrl: string;
  preloadPath: string;
  routeHash?: string;
}

export interface BoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boundsEqual(a: BoundsRect, b: BoundsRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export class OverlayManager {
  private win: BrowserWindow | null = null;
  private userEnabled = false;
  private visibleOnScreen = false;
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

  setInActiveMatch(active: boolean): void {
    if (this.inActiveMatch === active) return;
    this.inActiveMatch = active;
    console.log(`[overlay-mgr ${this.routeHash}] setInActiveMatch(${active})`);
    this.syncVisibility();
  }

  setBounds(rect: BoundsRect): void {
    if (!this.win || this.win.isDestroyed()) {
      // Window not yet created — remember the bounds and apply on createWindow().
      this.pendingBounds = { ...rect };
      console.log(`[overlay-mgr ${this.routeHash}] setBounds before window — buffered`);
      return;
    }
    if (this.lastAppliedBounds && boundsEqual(this.lastAppliedBounds, rect)) {
      return;
    }
    console.log(`[overlay-mgr ${this.routeHash}] setBounds → ${rect.x},${rect.y} ${rect.width}×${rect.height}`);
    this.win.setBounds(rect);
    this.lastAppliedBounds = { ...rect };
  }

  dispose(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy();
    }
    this.win = null;
  }

  private createWindow(): void {
    this.win = new BrowserWindow({
      transparent: true,
      frame: false,
      resizable: true,
      movable: true,
      skipTaskbar: true,
      alwaysOnTop: true,
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

    this.win.setAlwaysOnTop(true, 'screen-saver');

    if (this.pendingBounds) {
      this.win.setBounds(this.pendingBounds);
      this.lastAppliedBounds = this.pendingBounds;
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
      `[overlay-mgr ${this.routeHash}] syncVisibility: userEnabled=${this.userEnabled} visibleOnScreen=${this.visibleOnScreen} inActiveMatch=${this.inActiveMatch} → ${shouldShow ? 'show' : 'hide'}`,
    );
    if (shouldShow) {
      this.win.show();
    } else {
      this.win.hide();
    }
  }
}
