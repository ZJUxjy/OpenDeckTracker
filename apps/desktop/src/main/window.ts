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
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  // Tahoe-grade Liquid Glass on the actual OS window:
  //   • Windows 11 22H2+ → backgroundMaterial: 'mica' (real desktop
  //     wallpaper colour bleeds through wherever the renderer paints
  //     transparent / rgba bg). On older Windows 10 / Linux the
  //     option is silently ignored.
  //   • macOS → vibrancy: 'sidebar' + visualEffectState: 'active'
  //     +  titleBarStyle: 'hiddenInset' so the title bar feels
  //     native & glass.
  //
  // For Mica to actually be visible:
  //   1. backgroundColor MUST NOT be solid — set to transparent
  //      so the system backdrop isn't painted over.
  //   2. The renderer body MUST be transparent or low-rgba (handled
  //      in theme.css; index.html no longer carries a solid bg).
  //   3. titleBarOverlay must opt the title bar into following the
  //      Mica colour, otherwise the Win11 system title bar paints
  //      its default opaque background and reads as a black bar.
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'OpenDeckTracker',
    // Fully-transparent backgroundColor so DWM can substitute Mica
    // / vibrancy. On non-vibrancy systems Electron falls back to the
    // window's chrome default (usually OS theme colour).
    backgroundColor: isWin || isMac ? '#00000000' : '#0E0E14',
    ...(isWin
      ? {
          backgroundMaterial: 'mica' as const,
          // NOTE: We deliberately keep `frame: true` (default) so the
          // OS draws the title bar. With Mica enabled, Win11 DWM
          // composites the title bar onto the Mica backdrop — we
          // don't need titleBarOverlay (which only works with
          // frameless / titleBarStyle: 'hidden'). The title bar
          // tinting follows the OS theme automatically.
        }
      : {}),
    ...(isMac
      ? {
          vibrancy: 'sidebar' as const,
          visualEffectState: 'active' as const,
          titleBarStyle: 'hiddenInset' as const,
        }
      : {}),
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

  // Belt-and-suspenders Mica enable. Some Electron + Win11 22H2
  // builds need an explicit post-creation call before DWM picks up
  // the material — the constructor option alone has been observed
  // to silently fail on certain SKUs. setBackgroundMaterial is a
  // no-op on platforms that don't support it.
  if (isWin) {
    try {
      win.setBackgroundMaterial?.('mica');
    } catch {
      // Older Windows 10 / unsupported — silent fallback.
    }
  }

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
