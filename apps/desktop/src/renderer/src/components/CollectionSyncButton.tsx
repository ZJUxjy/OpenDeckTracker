import { AlertTriangle, Check, Loader2, RefreshCw } from 'lucide-react';

import { useTranslation } from '../i18n';

export type SyncButtonState = 'idle' | 'syncing' | 'success' | 'error';

interface CollectionSyncButtonProps {
  state: SyncButtonState;
  onClick: () => void;
}

export function CollectionSyncButton({ state, onClick }: CollectionSyncButtonProps) {
  const { t } = useTranslation();

  const labelKey = `collection.sync.button.${state}` as const;
  const ariaKey =
    state === 'syncing'
      ? 'collection.sync.button.ariaLabel.syncing'
      : 'collection.sync.button.ariaLabel.idle';

  const tone =
    state === 'success'
      ? 'text-green'
      : state === 'error'
        ? 'text-amber'
        : 'text-text';

  const Icon =
    state === 'syncing'
      ? Loader2
      : state === 'success'
        ? Check
        : state === 'error'
          ? AlertTriangle
          : RefreshCw;

  return (
    <button
      type="button"
      data-testid="collection-sync-button"
      data-state={state}
      onClick={onClick}
      disabled={state === 'syncing'}
      aria-label={t(ariaKey)}
      className={
        'tahoe-card px-3 py-2 flex items-center gap-2 text-sm font-semibold transition-colors ' +
        'hover:text-accent disabled:cursor-not-allowed disabled:opacity-70 ' +
        tone
      }
    >
      <Icon
        size={16}
        className={state === 'syncing' ? 'animate-spin' : ''}
        aria-hidden
      />
      <span>{t(labelKey)}</span>
    </button>
  );
}
