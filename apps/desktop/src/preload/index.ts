import { contextBridge, ipcRenderer } from 'electron';

const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  },
};

contextBridge.exposeInMainWorld('hdt', api);

export type HdtApi = typeof api;
