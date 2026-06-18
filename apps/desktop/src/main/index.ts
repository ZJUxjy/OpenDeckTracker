// Shorten the HearthMirror Rust runtime's reinit back-off (default 2000ms)
// to 500ms so the global Hearthstone-process monitor can drive sub-second
// reconnects when the game appears AFTER the tracker. Must be set before
// the first napi call into @hdt/hearthmirror-native because the back-off
// is memoised via OnceLock on first read.
if (process.env['HDT_HEARTHMIRROR_REINIT_BACKOFF_MS'] === undefined) {
  process.env['HDT_HEARTHMIRROR_REINIT_BACKOFF_MS'] = '500';
}

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
import { hearthstoneProcessMonitor } from './hearthstone-process-monitor';
import { computeOverlayPanelBounds } from './overlay-layout';
import { toDipBounds } from './overlay-coords';

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
      placeWindowAboveHearthstone: (handle) =>
        getHearthMirror().placeWindowAboveHearthstone(handle),
    });
    const opponentOverlay = new OverlayManager({
      rendererUrl,
      preloadPath,
      routeHash: '/overlay-opponent',
      onFocusChange: () => recomputeOverlayForeground(),
      placeWindowAboveHearthstone: (handle) =>
        getHearthMirror().placeWindowAboveHearthstone(handle),
    });

    // Each overlay is a small panel-sized window anchored to one edge of
    // the HS game window. Avoids the full-screen-transparent + CSS
    // pointer-events:none approach, which Windows+Electron treats as a
    // click-blocker at the OS hit-test layer.
    //
    // Layout (matches user request):
    //   • opponent panel anchored to the LEFT edge of HS
    //   • player panel anchored to the RIGHT edge of HS
    //   • panel height = 80% of HS height, capped at 80% of 1080p
    //   • 10% top padding

    const tracker = createHearthstoneWindowTracker({
      getWindow: () => getHearthMirror().getHearthstoneWindow(),
      subscribeToWindowEvents: (notifyWindowChanged) =>
        getHearthMirror().subscribeToHearthstoneWindowEvents(notifyWindowChanged),
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
        // Windows: GetWindowRect returns PHYSICAL pixels; convert to DIP.
        // macOS: CGWindow bounds are already points (== DIP); identity.
        const hs = event.bounds;
        const hsDip = toDipBounds(process.platform, hs, (r) =>
          screen.screenToDipRect(null, { x: r.x, y: r.y, width: r.width, height: r.height }),
        );
        const bounds = computeOverlayPanelBounds(hsDip);
        opponentOverlay.setBounds(bounds.opponent);
        playerOverlay.setBounds(bounds.player);
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

    const deckStore = registerIpc({
      enablePlayerOverlay,
      disablePlayerOverlay,
      enableOpponentOverlay,
      disableOpponentOverlay,
      cardPreview,
    });
    startDeckTracker(deckStore);
    startHearthWatcher();
    // Global edge-signal for "Hearthstone appeared / disappeared".
    // Subscribers (HearthMirror via deck-tracker, HearthWatcher) wire
    // their own `appeared` handlers to force an immediate retry instead
    // of sitting on their own polling cadences. Order matters: must be
    // started AFTER the consumers so their subscribers exist by the
    // time the first edge fires.
    hearthstoneProcessMonitor.start();

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
      hearthstoneProcessMonitor.stop();
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
