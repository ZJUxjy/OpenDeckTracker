import { app, ipcMain, shell } from 'electron';
import { getUpdateController } from './auto-update';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Result of a manual "Check for updates" request from the About panel.
 */
export type { AppUpdateStatus as UpdateCheckResult } from '../shared/app-update';

/**
 * Resolve a legal-doc file path. Bundled installers ship LICENSE
 * and THIRD_PARTY_NOTICES.txt under `process.resourcesPath` via the
 * `extraResources` block in electron-builder.yml; in dev they live at
 * the repo root, several levels up from the compiled main module.
 */
function resolveLegalDocPath(fileName: string): string | null {
  const candidates = [
    join(process.resourcesPath ?? '', fileName),
    join(app.getAppPath(), fileName),
    join(app.getAppPath(), '..', '..', '..', '..', fileName),
    join(__dirname, '..', '..', '..', '..', fileName),
  ];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

export function registerAboutIpc(): void {
  ipcMain.handle('about:check-for-updates', () => getUpdateController().check());

  ipcMain.handle('about:open-license', async (): Promise<boolean> => {
    const path = resolveLegalDocPath('LICENSE');
    if (!path) return false;
    const error = await shell.openPath(path);
    return error === '';
  });

  ipcMain.handle('about:open-third-party-notices', async (): Promise<boolean> => {
    const path = resolveLegalDocPath('THIRD_PARTY_NOTICES.txt');
    if (!path) return false;
    const error = await shell.openPath(path);
    return error === '';
  });
}
