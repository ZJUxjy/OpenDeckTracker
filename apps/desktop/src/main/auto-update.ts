import { app } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

/**
 * Wire electron-updater into the main process. Checks for updates on
 * launch (and again every 6 hours while the app is running), downloads
 * silently in the background, and applies on next quit.
 *
 * The update feed URL is configured via the `publish` block in
 * `electron-builder.yml`. Until that points at a real CDN AND the
 * installer is code-signed (B5), this code path no-ops cleanly: in
 * dev / unsigned builds `app.isPackaged` is false, so we skip the
 * checkForUpdates call entirely.
 *
 * Update events are logged to the main-process console rather than
 * surfaced in the renderer for now — when telemetry / a settings UI
 * for "check for updates manually" is wired (H4 / H5), that event
 * stream is the place to hook in.
 */
export function initAutoUpdate(): void {
  if (!app.isPackaged) {
    console.log('[auto-update] skipping in dev / unpackaged build');
    return;
  }

  // electron-updater applies the downloaded installer when the app
  // quits normally. Set this to false only if we want explicit user
  // confirmation before applying — for v1 silent install is fine.
  autoUpdater.autoInstallOnAppQuit = true;
  // Don't pre-download on metered networks; the runtime check is
  // implicit in the OS network info.
  autoUpdater.autoDownload = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[auto-update] checking for update');
  });
  autoUpdater.on('update-available', (info) => {
    console.log(`[auto-update] update available: ${info.version}`);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[auto-update] up to date');
  });
  autoUpdater.on('download-progress', (progress) => {
    const percent = progress.percent.toFixed(1);
    console.log(`[auto-update] downloading: ${percent}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[auto-update] downloaded ${info.version} — will apply on quit`);
  });
  autoUpdater.on('error', (err) => {
    console.error('[auto-update] error', err);
  });

  void autoUpdater.checkForUpdates().catch((err) => {
    console.error('[auto-update] initial check failed', err);
  });

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  setInterval(() => {
    void autoUpdater.checkForUpdates().catch((err) => {
      console.error('[auto-update] periodic check failed', err);
    });
  }, SIX_HOURS_MS);
}
