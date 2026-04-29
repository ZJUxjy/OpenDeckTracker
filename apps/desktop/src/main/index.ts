import { app, BrowserWindow, protocol } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMainWindow } from './window';
import { registerIpc } from './ipc';
import { startDeckTracker } from './deck-tracker';
import { startHearthWatcher } from './hearthwatcher-host';
import { OverlayManager } from './overlay-window';
import { createOverlayPoller } from './overlay-poller';
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

    const overlayPoller = createOverlayPoller({
      isAlive: () => getHearthMirror().isAlive(),
      onRunningChange: (running) => {
        playerOverlay.setRunning(running);
        opponentOverlay.setRunning(running);
      },
    });

    let playerOn = false;
    let opponentOn = false;
    const enablePlayerOverlay = (): void => {
      if (playerOn) return;
      playerOn = true;
      playerOverlay.enable();
      overlayPoller.addClient();
    };
    const disablePlayerOverlay = (): void => {
      if (!playerOn) return;
      playerOn = false;
      playerOverlay.disable();
      overlayPoller.removeClient();
    };
    const enableOpponentOverlay = (): void => {
      if (opponentOn) return;
      opponentOn = true;
      opponentOverlay.enable();
      overlayPoller.addClient();
    };
    const disableOpponentOverlay = (): void => {
      if (!opponentOn) return;
      opponentOn = false;
      opponentOverlay.disable();
      overlayPoller.removeClient();
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
      overlayPoller.stop();
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
