import { app, BrowserWindow, protocol, screen } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMainWindow } from './window';
import { registerIpc } from './ipc';
import { startDeckTracker, onDeckTrackerPhase, onLiveMatchChange } from './deck-tracker';
import { startHearthWatcher } from './hearthwatcher-host';
import { OverlayManager } from './overlay-window';
import { createHearthstoneWindowTracker } from './hearthstone-window-tracker';
import { CardPreviewWindow } from './card-preview-window';
import { getHearthMirror } from './hearthmirror';
import { initAutoUpdate } from './auto-update';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'hdt-card-image',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Track the main window explicitly. `BrowserWindow.getAllWindows()[0]`
  // would happily return an overlay or the card-preview window — neither
  // is what the user expects when they double-click the desktop icon a
  // second time, and overlay windows have `skipTaskbar` so focusing one
  // is effectively a no-op.
  let mainWindowRef: BrowserWindow | null = null;
  app.on('second-instance', () => {
    const win =
      mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : null;
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  void app.whenReady().then(() => {
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    const rendererUrl = devUrl ?? join(__dirname, '../renderer/index.html');
    const preloadPath = join(__dirname, '../preload/index.js');
    let recomputeOverlayForeground = (): void => {};

    const playerOverlay = new OverlayManager({
      rendererUrl,
      preloadPath,
      routeHash: '/overlay',
      onFocusChange: () => recomputeOverlayForeground(),
    });
    const opponentOverlay = new OverlayManager({
      rendererUrl,
      preloadPath,
      routeHash: '/overlay-opponent',
      onFocusChange: () => recomputeOverlayForeground(),
    });

    // Each overlay is a small panel-sized window anchored to one edge of
    // the HS game window. Avoids the full-screen-transparent + CSS
    // pointer-events:none approach, which Windows+Electron treats as a
    // click-blocker at the OS hit-test layer.
    //
    // Layout (matches user request):
    //   • opponent panel anchored to the LEFT edge of HS
    //   • player panel anchored to the RIGHT edge of HS
    //   • panel height = 80% of HS height
    //   • 10% top padding, 10% bottom padding
    const PANEL_WIDTH = 320;
    const PANEL_HEIGHT_RATIO = 0.8;
    const PANEL_TOP_PAD_RATIO = 0.1;

    const tracker = createHearthstoneWindowTracker({
      getWindow: () => getHearthMirror().getHearthstoneWindow(),
    });
    let hearthstoneForeground = false;
    recomputeOverlayForeground = (): void => {
      const foreground =
        hearthstoneForeground ||
        playerOverlay.isWindowFocused() ||
        opponentOverlay.isWindowFocused();
      playerOverlay.setTargetForeground(foreground);
      opponentOverlay.setTargetForeground(foreground);
    };
    tracker.subscribe((event) => {
      if (event.kind === 'bounds') {
        // GetWindowRect returns PHYSICAL pixels; BrowserWindow.setBounds
        // expects DIPs. On HiDPI displays (e.g. 4K @ 200% scale, 1 DIP =
        // 2 physical pixels) we must convert or the panel renders at the
        // wrong size and position.
        const hs = event.bounds;
        const hsDip = screen.screenToDipRect(null, {
          x: hs.x, y: hs.y, width: hs.width, height: hs.height,
        });
        const h = Math.round(hsDip.height * PANEL_HEIGHT_RATIO);
        const y = hsDip.y + Math.round(hsDip.height * PANEL_TOP_PAD_RATIO);
        // opponent on LEFT
        opponentOverlay.setBounds({
          x: hsDip.x + 8,
          y,
          width: PANEL_WIDTH,
          height: h,
        });
        // player on RIGHT
        playerOverlay.setBounds({
          x: hsDip.x + hsDip.width - PANEL_WIDTH - 8,
          y,
          width: PANEL_WIDTH,
          height: h,
        });
      } else {
        if (event.kind === 'visibility') {
          playerOverlay.setVisibleOnScreen(event.visible);
          opponentOverlay.setVisibleOnScreen(event.visible);
        } else {
          hearthstoneForeground = event.foreground;
          recomputeOverlayForeground();
        }
      }
    });

    let playerOn = false;
    let opponentOn = false;
    const enablePlayerOverlay = (): void => {
      if (playerOn) return;
      playerOn = true;
      playerOverlay.enable();
      tracker.addClient();
    };
    const disablePlayerOverlay = (): void => {
      if (!playerOn) return;
      playerOn = false;
      playerOverlay.disable();
      tracker.removeClient();
    };
    const enableOpponentOverlay = (): void => {
      if (opponentOn) return;
      opponentOn = true;
      opponentOverlay.enable();
      tracker.addClient();
    };
    const disableOpponentOverlay = (): void => {
      if (!opponentOn) return;
      opponentOn = false;
      opponentOverlay.disable();
      tracker.removeClient();
    };

    const cardPreview = new CardPreviewWindow({ rendererUrl, preloadPath });

    registerIpc({
      enablePlayerOverlay,
      disablePlayerOverlay,
      enableOpponentOverlay,
      disableOpponentOverlay,
      cardPreview,
    });
    startDeckTracker();
    startHearthWatcher();

    // Gate overlay visibility on EITHER:
    //   1. `phase === 'IN_MATCH'` — HearthMirror has confirmed gameplay
    //      (deckState available); the canonical happy path, or
    //   2. `liveMatchActive` — hearthwatcher saw a `create-game` event
    //      in Power.log, which only fires for actual gameplay (NOT for
    //      the deck-picker / queue / lobby, even though those screens
    //      can populate `getMatchInfo` and trigger PRE_MATCH).
    //
    // Either signal alone is sufficient — Power.log covers the case
    // where HearthMirror's reflectors are briefly stuck on a
    // newly-launched game, and the IN_MATCH phase covers the case
    // where the tracker was started mid-match (no live `create-game`
    // event arrives, but HearthMirror still surfaces deckState).
    let phaseSignal: string = 'IDLE';
    let livePowerSignal = false;
    const recomputeOverlayGate = (): void => {
      const active = phaseSignal === 'IN_MATCH' || livePowerSignal;
      playerOverlay.setInActiveMatch(active);
      opponentOverlay.setInActiveMatch(active);
    };
    onDeckTrackerPhase((phase) => {
      phaseSignal = phase;
      recomputeOverlayGate();
    });
    onLiveMatchChange((active) => {
      livePowerSignal = active;
      recomputeOverlayGate();
    });

    const mainWindow = createMainWindow();
    mainWindowRef = mainWindow;
    mainWindow.on('closed', () => {
      if (mainWindowRef === mainWindow) mainWindowRef = null;
    });

    // Wire electron-updater. No-ops in dev / unpackaged builds; in
    // packaged signed builds, checks for updates on launch and again
    // every 6 hours.
    initAutoUpdate();

    // Closing the main window quits the whole app (including the
    // overlay BrowserWindows). Otherwise the overlays + tracker poll
    // keep running headless forever — there's no UI to re-enable
    // them since the main window with the Settings page is gone.
    mainWindow.on('closed', () => {
      app.quit();
    });

    app.on('before-quit', () => {
      tracker.stop();
      playerOverlay.dispose();
      opponentOverlay.dispose();
      cardPreview.dispose();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const recreated = createMainWindow();
        mainWindowRef = recreated;
        recreated.on('closed', () => {
          if (mainWindowRef === recreated) mainWindowRef = null;
        });
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
