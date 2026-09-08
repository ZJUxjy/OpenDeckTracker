import { useState } from 'react';
import { useTranslation } from '../i18n';
import { useHearthMirrorStatus, refreshHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import { useHearthWatcherStore } from '../stores/hearthwatcher-store';

export function ConnectionDiagnostics() {
  const { t } = useTranslation();
  const { isAlive, battleTag, lastUpdatedAt } = useHearthMirrorStatus();
  const status = useHearthWatcherStore(s => s.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const api = window.hdt?.hearthwatcher;
  async function run(action: 'refresh' | 'open') {
    setBusy(true); setError(false);
    try {
      if (action === 'open') {
        if (!await api?.openLogDirectory()) setError(true);
      } else {
        const [, available] = await Promise.all([refreshHearthMirrorStatus(), api?.rediscover()]);
        if (!available) setError(true);
        const latest = await api?.getStatus();
        if (latest) useHearthWatcherStore.setState({ status: latest });
      }
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return (
    <section className="reference-panel reliability-panel" aria-labelledby="diagnostics-heading">
      <h3 id="diagnostics-heading">{t('reliability.diagnostics')}</h3>
      <dl className="reliability-details">
        <div><dt>{t('reliability.connection.game')}</dt><dd>{t(`reliability.connection.${isAlive ? 'connected' : 'offline'}`)}</dd></div>
        <div><dt>{t('reliability.connection.player')}</dt><dd>{battleTag?.fullBattleTag ?? t('reliability.connection.noPlayer')}</dd></div>
        <div><dt>{t('dashboard.watcher')}</dt><dd>{status ? t(`dashboard.watcherKind.${status.kind}`) : t('dashboard.watcherDisconnected')}</dd></div>
        <div><dt>{t('reliability.connection.checked')}</dt><dd>{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : '—'}</dd></div>
      </dl>
      {status?.message && <p>{status.message}</p>}
      {status?.path && <code className="reliability-path">{status.path}</code>}
      {status?.searchedPaths?.length ? <details><summary>{t('reliability.connection.searchedPaths')}</summary>
        {status.searchedPaths.map(item => <code className="reliability-path" key={item}>{item}</code>)}
      </details> : null}
      {error && <p role="alert">{t('reliability.connection.error')}</p>}
      <div className="reliability-actions">
        <button type="button" className="reference-action-button" disabled={busy || !api} onClick={() => void run('refresh')}>{t(busy ? 'reliability.connection.refreshing' : 'reliability.connection.refresh')}</button>
        <button type="button" className="reference-action-button" disabled={busy || !status?.path || !api} onClick={() => void run('open')}>{t('reliability.connection.open')}</button>
      </div>
    </section>
  );
}
