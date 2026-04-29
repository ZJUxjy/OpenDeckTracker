import { BrowserWindow, screen } from 'electron';

export interface OverlayManagerOptions {
  rendererUrl: string;
  preloadPath: string;
  isAlive: () => Promise<boolean>;
}

export class OverlayManager {
  private win: BrowserWindow | null = null;
  private userEnabled = false;
  private gameRunning = false;
  private falseStreak = 0;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private readonly opts: OverlayManagerOptions;

  constructor(opts: OverlayManagerOptions) {
    this.opts = opts;
  }

  enable(): void {
    this.userEnabled = true;
    if (!this.win) this.createWindow();
    this.syncVisibility();
    this.startPolling();
  }

  disable(): void {
    this.userEnabled = false;
    this.gameRunning = false;
    this.falseStreak = 0;
    this.syncVisibility();
    this.stopPolling();
  }

  setRunning(running: boolean): void {
    this.gameRunning = running;
    this.falseStreak = 0;
    this.syncVisibility();
  }

  dispose(): void {
    this.stopPolling();
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
      void this.win.loadURL(`${devUrl}#/overlay`);
    } else {
      void this.win.loadFile(this.opts.rendererUrl, { hash: '/overlay' });
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

  private startPolling(): void {
    if (this.pollHandle !== null) return;
    this.falseStreak = 0;
    void this.poll();
    this.pollHandle = setInterval(() => {
      void this.poll();
    }, 3000);
  }

  private stopPolling(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  private async poll(): Promise<void> {
    let alive: boolean;
    try {
      alive = await this.opts.isAlive();
    } catch {
      alive = false;
    }

    if (alive) {
      this.falseStreak = 0;
      if (!this.gameRunning) {
        this.gameRunning = true;
        this.syncVisibility();
      }
    } else {
      this.falseStreak++;
      if (this.falseStreak >= 3 && this.gameRunning) {
        this.gameRunning = false;
        this.syncVisibility();
      }
    }
  }
}
