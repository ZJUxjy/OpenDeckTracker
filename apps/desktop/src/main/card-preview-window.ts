import { BrowserWindow } from 'electron';

/**
 * Single floating tooltip window that shows a card image when the user
 * hovers a row in either overlay panel. Sized like CardImagePopover
 * (256×386 DIPs) and positioned next to the hovered row in screen
 * coordinates — outside the panel's own narrow window so it doesn't
 * overlap the deck list.
 */
export interface CardPreviewWindowOptions {
  rendererUrl: string;
  preloadPath: string;
}

export interface PreviewAnchor {
  /** Screen-coordinate top-left of the row anchor that triggered the hover. */
  x: number;
  y: number;
  /** Row width in DIPs. Used to place the preview AFTER the row when side='right'. */
  width: number;
  height: number;
  /** Which side of the row the preview should appear on. */
  side: 'left' | 'right';
}

const PREVIEW_WIDTH = 280;
const PREVIEW_HEIGHT = 400;
const POOL_GAP = 8;

export class CardPreviewWindow {
  private win: BrowserWindow | null = null;
  private currentKey: string | null = null;
  private readonly opts: CardPreviewWindowOptions;

  constructor(opts: CardPreviewWindowOptions) {
    this.opts = opts;
  }

  show(cardId: string, anchor: PreviewAnchor): void {
    if (!this.win || this.win.isDestroyed()) this.createWindow();
    if (!this.win) return;

    // Position: place to the requested side of the anchor row, vertically
    // centered on the row. For side='right' we anchor off the row's right
    // edge so the preview sits *next* to the panel rather than over it.
    const x = anchor.side === 'left'
      ? Math.max(0, anchor.x - PREVIEW_WIDTH - 8)
      : anchor.x + anchor.width + 8;
    const y = Math.max(0, anchor.y + Math.round(anchor.height / 2) - Math.round(PREVIEW_HEIGHT / 2));
    this.win.setBounds({ x, y, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT });

    const key = `single:${cardId}`;
    if (key !== this.currentKey) {
      this.currentKey = key;
      this.win.webContents.send('card-preview:set-card', cardId);
    }
    // Use opacity for show/hide instead of BrowserWindow.show()/hide() —
    // Windows' "animate windows" accessibility setting adds a fade-in
    // every time `.show()` is called, which feels sluggish on rapid
    // hover-out-and-back. Opacity changes are instant.
    this.win.setOpacity(1);
  }

  /**
   * Multi-card variant: shows N card images side-by-side. Used by the
   * Animal Companion pool row to surface the 3-beast pool. Window
   * width grows to fit N cards plus inter-card gaps.
   */
  showPool(cardIds: readonly string[], anchor: PreviewAnchor): void {
    if (cardIds.length === 0) {
      this.hide();
      return;
    }
    if (!this.win || this.win.isDestroyed()) this.createWindow();
    if (!this.win) return;

    const totalWidth = cardIds.length * PREVIEW_WIDTH + (cardIds.length - 1) * POOL_GAP;
    const x = anchor.side === 'left'
      ? Math.max(0, anchor.x - totalWidth - 8)
      : anchor.x + anchor.width + 8;
    const y = Math.max(0, anchor.y + Math.round(anchor.height / 2) - Math.round(PREVIEW_HEIGHT / 2));
    this.win.setBounds({ x, y, width: totalWidth, height: PREVIEW_HEIGHT });

    const key = `pool:${cardIds.join(',')}`;
    if (key !== this.currentKey) {
      this.currentKey = key;
      this.win.webContents.send('card-preview:set-pool', cardIds);
    }
    this.win.setOpacity(1);
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.setOpacity(0);
    }
  }

  dispose(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy();
    }
    this.win = null;
    this.currentKey = null;
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
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
      webPreferences: {
        preload: this.opts.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setIgnoreMouseEvents(true);
    // Show the window immediately at opacity 0 so the OS does its
    // (only) fade-in once at creation rather than on every hover.
    // After this initial reveal, show()/hide() toggle opacity only.
    this.win.setOpacity(0);
    this.win.show();

    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) {
      void this.win.loadURL(`${devUrl}#/card-preview`);
    } else {
      void this.win.loadFile(this.opts.rendererUrl, { hash: '/card-preview' });
    }
  }
}
