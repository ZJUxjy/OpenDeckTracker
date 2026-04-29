import { BrowserWindow, screen } from 'electron';

export interface OverlayManagerOptions {
  rendererUrl: string;
  preloadPath: string;
  routeHash?: string;
}

export class OverlayManager {
  private win: BrowserWindow | null = null;
  private userEnabled = false;
  private gameRunning = false;
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
    this.gameRunning = false;
    this.syncVisibility();
  }

  setRunning(running: boolean): void {
    this.gameRunning = running;
    this.syncVisibility();
  }

  dispose(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy();
    }
    this.win = null;
  }

  private createWindow(): void {
    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.workArea;

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
      x,
      y,
      width,
      height,
      webPreferences: {
        preload: this.opts.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    this.win.setAlwaysOnTop(true, 'screen-saver');

    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) {
      void this.win.loadURL(`${devUrl}#${this.routeHash}`);
    } else {
      void this.win.loadFile(this.opts.rendererUrl, { hash: this.routeHash });
    }
  }

  private syncVisibility(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const shouldShow = this.userEnabled && this.gameRunning;
    if (shouldShow) {
      this.win.show();
    } else {
      this.win.hide();
    }
  }
}
