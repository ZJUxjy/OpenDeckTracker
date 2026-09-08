import { useEffect, useState } from 'react';
import type { CardDataStatus } from '../../../main/card-data-store';
import { useTranslation } from '../i18n';

export function CardDataPanel() {
  const { t } = useTranslation();
  const api = window.hdt?.cardData;
  const [status, setStatus] = useState<CardDataStatus | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    void api?.getStatus().then(value => { if (alive) setStatus(value); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [api]);
  useEffect(() => {
    if (!api || !status?.busy) return;
    let alive = true;
    const timer = setInterval(() => {
      void api.getStatus().then(value => { if (alive) setStatus(value); })
        .catch(() => { if (alive) setError(true); });
    }, 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [api, status?.busy]);

  async function run(next: 'check' | 'install' | 'rollback') {
    if (!api || action) return;
    setError(false); setAction(next);
    try { setStatus(await api[next]()); }
    catch { setError(true); }
    finally { setAction(null); }
  }
  const selected = status?.pending ?? status?.active;
  const updateAvailable = status?.latest && status.latest.commit !== selected?.commit;
  const disabled = !!action || status?.busy || !api;
  return (
    <section className="reference-panel reliability-panel" aria-labelledby="card-data-heading">
      <h3 id="card-data-heading">{t('reliability.cards.title')}</h3>
      <p>{t('reliability.cards.description')}</p>
      <dl className="reliability-details">
        <div><dt>{t('reliability.cards.active')}</dt><dd>{status?.active?.version ?? status?.active?.build ?? t('reliability.cards.unknown')}</dd></div>
        {status?.active && <div><dt>{t('reliability.cards.counts')}</dt><dd>{status.active.totalCards.toLocaleString()}</dd></div>}
        {status?.active?.generatedAt && <div><dt>{t('reliability.cards.updatedAt')}</dt><dd>{new Date(status.active.generatedAt).toLocaleString()}</dd></div>}
        {status?.pending && <div><dt>{t('reliability.cards.pending')}</dt><dd>{status.pending.version ?? status.pending.build}</dd></div>}
      </dl>
      <div role="status" aria-live="polite">
        {status?.pending && <p>{t('reliability.cards.restartNote')}</p>}
        {status?.latest && <p>{updateAvailable ? t('reliability.cards.available', { version: status.latest.version }) : t('reliability.cards.upToDate')}</p>}
        {action && <p>{t(`reliability.cards.${action}Busy`)}</p>}
      </div>
      {!api && <p>{t('reliability.cards.desktopOnly')}</p>}
      {error && <p role="alert">{t('reliability.cards.error')}</p>}
      <div className="reliability-actions">
        <button type="button" className="reference-action-button" disabled={disabled} onClick={() => void run('check')}>{t('reliability.cards.check')}</button>
        <button type="button" className="reference-action-button" disabled={disabled || !updateAvailable} onClick={() => void run('install')}>{t('reliability.cards.install')}</button>
        <button type="button" className="reference-action-button" disabled={disabled || !status?.canRollback} onClick={() => void run('rollback')}>{t('reliability.cards.rollback')}</button>
      </div>
    </section>
  );
}
