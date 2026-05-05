import { app, BrowserWindow, nativeImage } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the app icon at runtime. Packaged builds ship build/icon.png
 * via electron-builder's `buildResources` directory; in dev we resolve
 * relative to the source tree.
 */
function resolveIconPath(): string | undefined {
  const candidates = [
    join(process.resourcesPath ?? '', 'build', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(__dirname, '..', '..', 'build', 'icon.png'),
  ];
  return candidates.find((p) => p && existsSync(p));
}

export function createMainWindow(): BrowserWindow {
  const iconPath = resolveIconPath();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'OpenDeckTracker',
    backgroundColor: '#0E0E14',
    autoHideMenuBar: true,
    ...(iconPath ? { icon: nativeImage.createFromPath(iconPath) } : {}),
    webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}
