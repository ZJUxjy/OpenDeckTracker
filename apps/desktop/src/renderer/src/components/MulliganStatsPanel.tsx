import { useEffect, useState } from 'react';
import type { DeckSummary, MulliganRow, MulliganStats, PlayOrder } from '@hdt/core';
import { useLocale, useTranslation } from '../i18n';
import { useCardDef } from '../hooks/use-card-def';

const CLASSES = ['DeathKnight', 'DemonHunter', 'Druid', 'Hunter', 'Mage', 'Paladin', 'Priest', 'Rogue', 'Shaman', 'Warlock', 'Warrior'];

export function MulliganStatsPanel() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [deckId, setDeckId] = useState('');
  const [opponentClass, setOpponentClass] = useState('');
  const [playOrder, setPlayOrder] = useState('');
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [stats, setStats] = useState<MulliganStats | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!expanded) return;
    let alive = true;
    setLoading(true); setError(false);
    void Promise.resolve().then(() => Promise.all([
      window.hdt?.recordings?.mulliganStats({ ...(deckId ? { savedDeckId: deckId } : {}),
        ...(opponentClass ? { opponentClass } : {}), ...(playOrder ? { playOrder: playOrder as PlayOrder } : {}) }),
      window.hdt?.decks?.list(),
    ])).then(([result, availableDecks]) => {
      if (!alive) return;
      if (!result) throw new Error('Mulligan statistics unavailable');
      setStats(result); setDecks(availableDecks ?? []);
    }).catch(() => { if (alive) setError(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [expanded, deckId, opponentClass, playOrder, refresh]);
  return <details className="rounded border border-border p-4 text-sm text-text" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="font-semibold text-accent cursor-pointer">{t('analysis.mulliganTitle')}</summary>
    <div className="space-y-3 pt-3">
      <p className="text-xs text-text-mute">{t('analysis.mulliganHint')}</p>
      <div className="flex flex-wrap gap-3 text-xs">
        <label>{t('analysis.mulliganDeck')}
          <select aria-label={t('analysis.mulliganDeck')} value={deckId} onChange={event => setDeckId(event.target.value)} className="block bg-overlay-input border border-border rounded p-1">
            <option value="">{t('analysis.allDecks')}</option>{decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
          </select>
        </label>
        <label>{t('analysis.mulliganOpponent')}
          <select aria-label={t('analysis.mulliganOpponent')} value={opponentClass} onChange={event => setOpponentClass(event.target.value)} className="block bg-overlay-input border border-border rounded p-1">
            <option value="">{t('analysis.allClasses')}</option>{CLASSES.map(name => <option key={name} value={name.toUpperCase()}>{t(`decks.finder.class${name}`)}</option>)}
          </select>
        </label>
        <label>{t('analysis.mulliganOrder')}
          <select aria-label={t('analysis.mulliganOrder')} value={playOrder} onChange={event => setPlayOrder(event.target.value)} className="block bg-overlay-input border border-border rounded p-1">
            <option value="">{t('analysis.bothOrders')}</option><option value="first">{t('analysis.first')}</option><option value="coin">{t('analysis.coin')}</option>
          </select>
        </label>
      </div>
      <button type="button" className="text-accent underline" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{t('analysis.refresh')}</button>
      {loading && <p role="status">{t('analysis.loading')}</p>}
      {error && <p role="alert" className="text-red">{t('analysis.loadFailed')}</p>}
      {!loading && !error && stats && <>
        <p className="text-xs text-text-mute">{t('analysis.mulliganSamples', { n: stats.sampleSize, excluded: stats.excludedMissingData, unmatched: stats.unmatchedRecordings })}</p>
        {stats.sampleSize < 30 && <p className="text-xs text-text-mute">{t('analysis.smallSample')}</p>}
        <div className="overflow-x-auto"><table className="w-full text-xs text-left">
          <thead><tr><th>{t('analysis.mulliganCard')}</th><th>{t('analysis.offered')}</th><th>{t('analysis.keptResults')}</th><th>{t('analysis.replacedResults')}</th></tr></thead>
          <tbody>{stats.rows.map(row => <MulliganCardRow key={row.cardId} row={row} />)}</tbody>
        </table></div>
      </>}
    </div>
  </details>;
}

function MulliganCardRow({ row }: { row: MulliganRow }) {
  const card = useCardDef(row.cardId);
  const { t } = useTranslation();
  const locale = useLocale();
  const outcome = (value: MulliganRow['kept']) => {
    const known = value.wins + value.losses;
    const rate = known ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value.wins / known) : '—';
    return t('analysis.mulliganOutcome', { rate, copies: value.copies, wins: value.wins, losses: value.losses, unknown: value.unknown });
  };
  return <tr className="border-t border-border"><th className="py-2 pr-2">{card?.name ?? row.cardId}</th><td>{row.offered}</td><td className="pr-2">{outcome(row.kept)}</td><td>{outcome(row.replaced)}</td></tr>;
}
