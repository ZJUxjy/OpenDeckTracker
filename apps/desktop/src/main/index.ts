import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window';
import { registerIpc } from './ipc';

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

  void app.whenReady().then(async () => {
    registerIpc();
    createMainWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });

    // === SPIKE TRIGGER (remove on teardown of add-hearthmirror-bridge-mono-spike) ===
    try {
      const { spikeLocateMono } = await import('@hdt/hearthmirror-mono-spike');
      try {
        const result = await spikeLocateMono();
        console.log('[spike:mono] OK:', JSON.stringify(result, null, 2));
      } catch (err) {
        console.log('[spike:mono] FAIL:', (err as Error).message);
      }
    } catch (loadErr) {
      console.log('[spike:mono] MODULE LOAD FAIL:', (loadErr as Error).message);
    }
    // === END SPIKE ===
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
