import { useState } from 'react';
import { useTranslation } from '../i18n';
import { useAppUpdate } from '../hooks/use-app-update';

export function AppUpdatePanel({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { status, busy, act } = useAppUpdate();
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | undefined>();
  const ready =
    status.state === 'downloaded' || (status.state === 'error' && status.retry === 'install');
  const download =
    status.state === 'update-available' ||
    (status.state === 'error' && status.retry === 'download');
  const working = busy || ['checking', 'downloading', 'installing'].includes(status.state);

  if (
    compact &&
    (!['update-available', 'downloading', 'downloaded', 'installing', 'error'].includes(
      status.state,
    ) ||
      (status.state === 'error' && status.retry === 'check') ||
      (status.state === 'update-available' && dismissedVersion === status.version))
  )
    return null;

  const messageKey = {
    idle: 'updateHint',
    unsupported: 'updateUnsupported',
    checking: 'checking',
    'up-to-date': 'upToDate',
    'update-available': 'updateAvailable',
    downloading: 'updateDownloading',
    downloaded: 'updateDownloaded',
    installing: 'updateInstalling',
    error: 'updateError',
  }[status.state];
  const actionKey = working
    ? status.state === 'downloading'
      ? 'updateDownloadingButton'
      : status.state === 'installing'
        ? 'updateInstalling'
        : 'checking'
    : ready
      ? 'updateRestart'
      : download
        ? 'updateNow'
        : status.state === 'unsupported'
          ? 'updateOpenReleases'
          : status.state === 'error'
            ? 'updateRetry'
            : 'checkForUpdates';

  function handleAction() {
    if (ready) setConfirmRestart(true);
    else
      void act(download ? 'download' : status.state === 'unsupported' ? 'openReleases' : 'check');
  }

  return (
    <section
      className={
        compact
          ? 'relative z-40 shrink-0 border-b border-white/10 bg-surface px-5 py-3'
          : 'reference-panel p-4'
      }
      aria-label={t('settings.about.checkForUpdates')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {!compact && <p className="font-semibold">{t('settings.about.checkForUpdates')}</p>}
          <p role="status" className="text-sm text-text-dim break-words">
            {t(`settings.about.${messageKey}`, {
              version: status.version ?? '',
              percent: Math.round(status.percent ?? 0),
              message: status.message ?? '',
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleAction}
            disabled={working}
            className="reference-action-button disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {t(`settings.about.${actionKey}`)}
          </button>
          {compact && status.state === 'update-available' && (
            <button
              type="button"
              className="reference-ghost-button"
              onClick={() => setDismissedVersion(status.version)}
            >
              {t('settings.about.updateLater')}
            </button>
          )}
        </div>
      </div>
      {status.state === 'downloading' && (
        <progress
          className="mt-3 w-full"
          max={100}
          value={status.percent ?? 0}
          aria-label={t('settings.about.updateDownloadingButton')}
        />
      )}
      {!compact && status.releaseNotes && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer">{t('settings.about.updateReleaseNotes')}</summary>
          <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-text-dim">
            {status.releaseNotes}
          </p>
        </details>
      )}
      {confirmRestart && ready && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="text-sm">{t('settings.about.updateRestartConfirm')}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={working}
              className="reference-action-button"
              onClick={() => {
                setConfirmRestart(false);
                void act('install');
              }}
            >
              {t('settings.about.updateConfirm')}
            </button>
            <button
              type="button"
              className="reference-ghost-button"
              onClick={() => setConfirmRestart(false)}
            >
              {t('settings.about.updateLater')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
