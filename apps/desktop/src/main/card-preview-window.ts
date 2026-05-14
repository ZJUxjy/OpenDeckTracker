import { BrowserWindow, screen } from 'electron';

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

export interface ExtraPreviewPayload {
  title: string;
  lines: readonly string[];
}

const PREVIEW_WIDTH = 280;
const PREVIEW_HEIGHT = 400;
const EXTRA_PREVIEW_WIDTH = 360;
const EXTRA_PREVIEW_HEIGHT = 220;
const POOL_PREVIEW_CARD_WIDTH = 230;
const POOL_PREVIEW_CARD_HEIGHT = 330;
const POOL_PREVIEW_PADDING_X = 24;
const POOL_PREVIEW_PADDING_Y = 24;
const POOL_PREVIEW_MAX_COLUMNS = 4;
const POOL_GAP = 14;
const EDGE_GAP = 8;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function computePreviewBounds(
  anchor: PreviewAnchor,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const display = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y });
  const workArea = display.workArea;
  const workRight = workArea.x + workArea.width;
  const workBottom = workArea.y + workArea.height;
  const anchorRight = anchor.x + anchor.width;
  const spaceLeft = anchor.x - workArea.x;
  const spaceRight = workRight - anchorRight;
  let side = anchor.side;

  if (side === 'right' && spaceRight < width + EDGE_GAP && spaceLeft > spaceRight) {
    side = 'left';
  } else if (side === 'left' && spaceLeft < width + EDGE_GAP && spaceRight > spaceLeft) {
    side = 'right';
  }

  const rawX = side === 'left' ? anchor.x - width - EDGE_GAP : anchorRight + EDGE_GAP;
  const maxX = Math.max(workArea.x, workRight - width);
  const rawY = anchor.y + Math.round(anchor.height / 2) - Math.round(height / 2);
  const maxY = Math.max(workArea.y, workBottom - height);

  return {
    x: clamp(rawX, workArea.x, maxX),
    y: clamp(rawY, workArea.y, maxY),
    width,
    height,
  };
}

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

    this.win.setBounds(computePreviewBounds(anchor, PREVIEW_WIDTH, PREVIEW_HEIGHT));

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

  showExtra(payload: ExtraPreviewPayload, anchor: PreviewAnchor): void {
    if (payload.lines.length === 0) {
      this.hide();
      return;
    }
    if (!this.win || this.win.isDestroyed()) this.createWindow();
    if (!this.win) return;

    this.win.setBounds(computePreviewBounds(anchor, EXTRA_PREVIEW_WIDTH, EXTRA_PREVIEW_HEIGHT));

    const key = `extra:${payload.title}:${payload.lines.join('\u001f')}`;
    if (key !== this.currentKey) {
      this.currentKey = key;
      this.win.webContents.send('card-preview:set-extra', payload);
    }
    this.win.setOpacity(1);
  }

  /**
   * Multi-card variant: shows N card images in a max-four-column grid.
   * Window grows by row and column so wide pools do not become a single
   * long strip.
   */
  showPool(cardIds: readonly string[], anchor: PreviewAnchor): void {
    if (cardIds.length === 0) {
      this.hide();
      return;
    }
    if (!this.win || this.win.isDestroyed()) this.createWindow();
    if (!this.win) return;

    const columns = Math.min(cardIds.length, POOL_PREVIEW_MAX_COLUMNS);
    const rows = Math.ceil(cardIds.length / POOL_PREVIEW_MAX_COLUMNS);
    const totalWidth =
      columns * POOL_PREVIEW_CARD_WIDTH +
      (columns - 1) * POOL_GAP +
      POOL_PREVIEW_PADDING_X * 2;
    const totalHeight =
      rows * POOL_PREVIEW_CARD_HEIGHT +
      (rows - 1) * POOL_GAP +
      POOL_PREVIEW_PADDING_Y * 2;
    this.win.setBounds(computePreviewBounds(anchor, totalWidth, totalHeight));

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
