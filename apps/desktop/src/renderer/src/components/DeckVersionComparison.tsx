import { useEffect, useRef, useState } from 'react';
import { compareDeckVersions, type DeckVersion, type MatchHistoryRecord } from '@hdt/core';
import { useLocale, useTranslation } from '../i18n';
import { useCardDef } from '../hooks/use-card-def';

export function DeckVersionComparison({ deckId, beforeLoad }: { deckId: string; beforeLoad?: () => Promise<void> }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [data, setData] = useState<{ versions: DeckVersion[]; matches: MatchHistoryRecord[] } | null>(null);
  const [before, setBefore] = useState(0);
  const [after, setAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, [deckId]);
  const load = async () => {
    const token = ++request.current;
    setLoading(true); setError(false);
    try {
      await beforeLoad?.();
      const [versions, matches] = await Promise.all([window.hdt.decks.listVersions(deckId), window.hdt.stats.deckVersionMatches(deckId)]);
      if (token !== request.current) return;
      setData({ versions, matches });
      setBefore(versions.at(-2)?.version ?? versions[0]?.version ?? 0);
      setAfter(versions.at(-1)?.version ?? 0);
    } catch { if (token === request.current) setError(true); }
    finally { if (token === request.current) setLoading(false); }
  };
  const a = data?.versions.find(version => version.version === before);
  const b = data?.versions.find(version => version.version === after);
  const comparison = a && b && data ? compareDeckVersions(a, b, data.matches) : null;
  const formatRate = (rate: number | null) => rate === null ? '—' : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(rate);
  const classLabel = (name: string) => {
    const normalized = name.toUpperCase();
    if (normalized === 'UNKNOWN') return t('analysis.unknown');
    const suffix = normalized === 'DEATHKNIGHT' ? 'DeathKnight' : normalized === 'DEMONHUNTER' ? 'DemonHunter'
      : normalized.charAt(0) + normalized.slice(1).toLowerCase();
    return t(`decks.finder.class${suffix}`);
  };
  return <details className="col-span-2 rounded border border-border p-3 text-sm text-text" onToggle={event => {
    if (event.currentTarget.open && data === null && !loading) void load();
  }}>
    <summary className="cursor-pointer text-accent font-semibold">{t('analysis.versions')}</summary>
    <div className="space-y-3 pt-3">
      <p className="text-xs text-text-mute">{t('analysis.versionHint')}</p>
      <button type="button" disabled={loading} onClick={() => void load()} className="text-accent underline disabled:opacity-40">{t('analysis.refreshVersions')}</button>
      {loading && <p role="status">{t('analysis.loading')}</p>}
      {error && <p role="alert" className="text-red">{t('analysis.loadFailed')}</p>}
      {data && data.versions.length < 2 && <p>{t('analysis.singleVersion')}</p>}
      {data && data.versions.length > 0 && <div className="flex flex-wrap gap-3">
        {(['before', 'after'] as const).map(side => <label key={side}>
          {t(`analysis.version${side === 'before' ? 'Before' : 'After'}`)}
          <select className="ml-2 bg-overlay-input border border-border rounded" aria-label={t(`analysis.version${side === 'before' ? 'Before' : 'After'}`)}
            value={side === 'before' ? before : after} onChange={event => (side === 'before' ? setBefore : setAfter)(Number(event.target.value))}>
            {data.versions.map(version => <option key={version.version} value={version.version}>v{version.version} · {new Date(version.createdAt).toLocaleDateString(locale)}</option>)}
          </select>
        </label>)}
      </div>}
      {comparison && <>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead><tr><th>{t('analysis.metric')}</th><th>v{before}</th><th>v{after}</th></tr></thead>
            <tbody>
              <tr><th>{t('analysis.games')}</th><td>{comparison.before.games}</td><td>{comparison.after.games}</td></tr>
              <tr><th>{t('analysis.winRate')}</th><td>{formatRate(comparison.before.winRate)}</td><td>{formatRate(comparison.after.winRate)}</td></tr>
              <tr><th>{t('analysis.unknownResults')}</th><td>{comparison.before.unknown}</td><td>{comparison.after.unknown}</td></tr>
              <tr><th>{t('analysis.averageTurns')}</th><td>{comparison.before.averageTurns?.toFixed(1) ?? '—'} ({comparison.before.turnSamples})</td><td>{comparison.after.averageTurns?.toFixed(1) ?? '—'} ({comparison.after.turnSamples})</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-text-mute">{t('analysis.unattributed', { n: comparison.unattributedGames })}</p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <section><h3 className="font-semibold">{t('analysis.removed')}</h3><ul>{comparison.removed.map(card => <DiffCard key={card.cardId} {...card} />)}</ul></section>
          <section><h3 className="font-semibold">{t('analysis.added')}</h3><ul>{comparison.added.map(card => <DiffCard key={card.cardId} {...card} />)}</ul></section>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {([comparison.before, comparison.after]).map((stats, index) => <section key={index}>
            <h3 className="font-semibold">{t('analysis.matchupDistribution')} · v{index === 0 ? before : after}</h3>
            <ul>{stats.matchups.map(matchup => <li key={matchup.opponentClass}>{classLabel(matchup.opponentClass)}: {matchup.count}</li>)}</ul>
          </section>)}
        </div>
      </>}
    </div>
  </details>;
}

function DiffCard({ cardId, count }: { cardId: string; count: number }) {
  const card = useCardDef(cardId);
  return <li>{card?.name ?? cardId} ×{count}</li>;
}
