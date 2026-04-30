import { app, BrowserWindow, protocol, screen } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMainWindow } from './window';
import { registerIpc } from './ipc';
import { startDeckTracker } from './deck-tracker';
import { startHearthWatcher } from './hearthwatcher-host';
import { OverlayManager } from './overlay-window';
import { createHearthstoneWindowTracker } from './hearthstone-window-tracker';
import { getHearthMirror } from './hearthmirror';

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
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows();
    const win = wins[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    const rendererUrl = devUrl ?? join(__dirname, '../renderer/index.html');
    const preloadPath = join(__dirname, '../preload/index.js');

    const playerOverlay = new OverlayManager({
      rendererUrl,
      preloadPath,
      routeHash: '/overlay',
    });
    const opponentOverlay = new OverlayManager({
      rendererUrl,
      preloadPath,
      routeHash: '/overlay-opponent',
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
        playerOverlay.setVisibleOnScreen(event.visible);
        opponentOverlay.setVisibleOnScreen(event.visible);
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

    registerIpc({
      enablePlayerOverlay,
      disablePlayerOverlay,
      enableOpponentOverlay,
      disableOpponentOverlay,
    });
    startDeckTracker();
    startHearthWatcher();
    createMainWindow();

    app.on('before-quit', () => {
      tracker.stop();
      playerOverlay.dispose();
      opponentOverlay.dispose();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
