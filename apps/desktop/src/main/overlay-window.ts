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
    if (!this.win) this.createWindow();
    this.syncVisibility();
  }

  disable(): void {
    this.userEnabled = false;
    this.visibleOnScreen = false;
    this.syncVisibility();
  }

  setVisibleOnScreen(visible: boolean): void {
    this.visibleOnScreen = visible;
    this.syncVisibility();
  }

  setBounds(rect: BoundsRect): void {
    if (!this.win || this.win.isDestroyed()) {
      // Window not yet created — remember the bounds and apply on createWindow().
      this.pendingBounds = { ...rect };
      return;
    }
    if (this.lastAppliedBounds && boundsEqual(this.lastAppliedBounds, rect)) {
      return;
    }
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
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
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
    if (!this.win || this.win.isDestroyed()) return;
    const shouldShow = this.userEnabled && this.visibleOnScreen;
    if (shouldShow) {
      this.win.show();
    } else {
      this.win.hide();
    }
  }
}
