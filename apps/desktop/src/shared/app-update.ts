export const APP_UPDATE_STATUS_CHANNEL = 'app-update:status-changed';

export type AppUpdateStatus = {
  state:
    | 'idle'
    | 'unsupported'
    | 'checking'
    | 'up-to-date'
    | 'update-available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error';
  version?: string;
  releaseNotes?: string;
  percent?: number;
  message?: string;
  retry?: 'check' | 'download' | 'install';
};
