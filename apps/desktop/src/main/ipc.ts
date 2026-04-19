import { app, ipcMain } from 'electron';

export function registerIpc(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion());
}
