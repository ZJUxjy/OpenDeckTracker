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

/** Opaque fallback matching the reference (Arcane) shell — used in dev when
 *  Acrylic + fully-transparent backgroundColor reads as a black hole before
 *  the renderer paints, or when DWM material init fails on some Windows SKUs. */
const DEV_WIN_BACKGROUND = '#05090a';

export function createMainWindow(): BrowserWindow {
  const iconPath = resolveIconPath();
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isDevRenderer = Boolean(process.env['ELECTRON_RENDERER_URL']);
  const useWinAcrylic = isWin && !isDevRenderer;

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
    // Hide until the first frame is ready — avoids a blank transparent
    // window flashing black on Windows while Vite/Electron loads the page.
    show: false,
    // Fully-transparent backgroundColor so DWM can substitute the
    // backdrop material. On non-vibrancy systems (Linux / older
    // Windows) we use a neutral light gray that reads correctly in
    // light mode. Dark mode on those platforms is handled by the
    // renderer's .dark class painting opaque dark surfaces.
    // Dev (`ELECTRON_RENDERER_URL`) uses an opaque dark fallback on
    // Windows so a failed/slow Acrylic init never reads as a black screen.
    // Dynamic theme-synced backgroundColor via nativeTheme is a
    // future enhancement tracked in the theme system roadmap.
    backgroundColor: useWinAcrylic || isMac ? '#00000000' : isWin ? DEV_WIN_BACKGROUND : '#F0F0F2',
    ...(useWinAcrylic
      ? {
          // Acrylic — not Mica — for the Tahoe-style iridescent
          // Liquid Glass look. Mica only tints the desktop wallpaper
          // (gray, desaturated) and ignores windows behind. Acrylic
          // shows actual windows behind, blurred + saturated, which
          // is what reads as "Liquid Glass" against any backdrop.
          backgroundMaterial: 'acrylic' as const,
          // titleBarStyle 'hidden' + titleBarOverlay turns the title
          // bar into client area covered by Acrylic, while keeping the
          // native min/max/close window controls. Without this the
          // OS draws an opaque title bar on top of Acrylic, leaving a
          // solid bar that breaks the glass continuity.
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            // Transparent background so Acrylic shows through the
            // title-bar region. symbolColor is a mid-light gray that
            // reads well on both light and dark Acrylic — exact
            // theme-sync (light symbols on dark, dark on light) is
            // a follow-up via win.setTitleBarOverlay() + nativeTheme.
            color: '#00000000',
            symbolColor: '#C8C8CD',
            height: 32,
          },
        }
      : isWin
        ? {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: {
              color: DEV_WIN_BACKGROUND,
              symbolColor: '#C8C8CD',
              height: 32,
            },
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

  // Belt-and-suspenders Acrylic enable. Some Electron + Win11 22H2
  // builds need an explicit post-creation call before DWM picks up
  // the material — the constructor option alone has been observed
  // to silently fail on certain SKUs. setBackgroundMaterial is a
  // no-op on platforms that don't support it.
  if (useWinAcrylic) {
    try {
      win.setBackgroundMaterial?.('acrylic');
    } catch {
      // Older Windows 10 / unsupported — silent fallback.
    }

    // Do not toggle `none → acrylic` on maximize/restore. That was a
    // workaround for Electron 33-era backgroundMaterial bugs, but with
    // Electron 37 the upstream fix is present and the toggle itself
    // causes a visible flash because the transparent window briefly has
    // no DWM backdrop behind it.
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    win.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error('[main-window] did-fail-load', { code, description, url });
    });
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const tag = level >= 2 ? 'error' : level === 1 ? 'warn' : 'log';
      console[tag === 'log' ? 'log' : tag](`[renderer] ${message}`, { line, sourceId });
    });
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'detach' });
    });
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}
