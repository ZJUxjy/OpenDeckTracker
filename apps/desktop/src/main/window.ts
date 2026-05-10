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
    // Fully-transparent backgroundColor so DWM can substitute the
    // backdrop material. On non-vibrancy systems (Linux / older
    // Windows) we use a neutral light gray that reads correctly in
    // light mode. Dark mode on those platforms is handled by the
    // renderer's .dark class painting opaque dark surfaces.
    // Dynamic theme-synced backgroundColor via nativeTheme is a
    // future enhancement tracked in the theme system roadmap.
    backgroundColor: isWin || isMac ? '#00000000' : '#F0F0F2',
    ...(isWin
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
  if (isWin) {
    try {
      win.setBackgroundMaterial?.('acrylic');
    } catch {
      // Older Windows 10 / unsupported — silent fallback.
    }

    // DWM Acrylic compositing breaks after the user resizes / maximizes
    // / restores the window on Win11 22H2+: the system stops painting
    // the backdrop and the renderer's translucent surfaces composite
    // over a solid OS chrome colour, looking entirely opaque, and DWM
    // does not auto-recover. Tracked upstream as electron/electron
    // #39959, #41824 (frameless maximize), #42393, #38743 (still open
    // as of Electron 33.x).
    //
    // Workaround: re-attach the backdrop by toggling `none → acrylic`.
    // The simple synchronous toggle isn't enough for the maximize case
    // (titleBarStyle 'hidden' makes DWM treat the window as frameless,
    // hitting #41824). DWM needs a real time gap to register the
    // maximize/unmaximize transition before the toggle, otherwise the
    // call is collapsed to a "current material unchanged" no-op. So:
    //   1. Wait 150ms after the event so DWM settles.
    //   2. setBackgroundMaterial('none').
    //   3. Wait another 50ms so DWM registers the off-state.
    //   4. setBackgroundMaterial('acrylic') — DWM re-attaches.
    // Resize fires per-pixel during edge drag, so we debounce.
    const SETTLE_MS = 150;
    const TOGGLE_GAP_MS = 50;
    let resizeTimer: NodeJS.Timeout | null = null;
    let settleTimer: NodeJS.Timeout | null = null;
    let toggleTimer: NodeJS.Timeout | null = null;
    const reapplyAcrylic = (): void => {
      if (settleTimer) clearTimeout(settleTimer);
      if (toggleTimer) clearTimeout(toggleTimer);
      settleTimer = setTimeout(() => {
        try { win.setBackgroundMaterial?.('none'); } catch { /* unsupported */ }
        toggleTimer = setTimeout(() => {
          try { win.setBackgroundMaterial?.('acrylic'); } catch { /* unsupported */ }
        }, TOGGLE_GAP_MS);
      }, SETTLE_MS);
    };
    const debouncedReapply = (): void => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(reapplyAcrylic, 80);
    };
    win.on('resize', debouncedReapply);
    win.on('maximize', reapplyAcrylic);
    win.on('unmaximize', reapplyAcrylic);
    win.on('restore', reapplyAcrylic);
    win.on('closed', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      if (settleTimer) clearTimeout(settleTimer);
      if (toggleTimer) clearTimeout(toggleTimer);
      resizeTimer = settleTimer = toggleTimer = null;
    });
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
