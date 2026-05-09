import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  filterPopularDecks,
  sortPopularDecks,
  type Format,
  type HeroClass,
  type PopularDeckArchetype,
  type PopularDeckEnriched,
  type PopularDeckSort,
} from '@hdt/core';

import { useTranslation } from '../i18n';
import { ManaCurveChart } from './ManaCurveChart';

type SyncProgress = {
  phase: 'meta' | 'variants' | 'transform' | 'persist';
  completed: number;
  total: number;
  currentLabel?: string;
};

function progressPercent(p: SyncProgress | null): number {
  if (!p) return 0;
  // Phase weights: meta 5%, variants 60%, transform 15%, persist 20%
  const weights: Record<SyncProgress['phase'], [number, number]> = {
    meta: [0, 0.05],
    variants: [0.05, 0.65],
    transform: [0.65, 0.8],
    persist: [0.8, 1],
  };
  const [start, end] = weights[p.phase];
  const frac = p.total > 0 ? p.completed / p.total : 1;
  return Math.min(100, Math.round((start + (end - start) * frac) * 100));
}

function formatLastUpdated(fetchedAt: string | null, locale: string): string | null {
  if (!fetchedAt) return null;
  try {
    const d = new Date(fetchedAt);
    return d.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fetchedAt.slice(0, 10);
  }
}

function syncErrorKey(error: string): string {
  switch (error) {
    case 'network-failed':
      return 'decks.finder.syncErrorNetwork';
    case 'parse-failed':
      return 'decks.finder.syncErrorParse';
    case 'already-syncing':
      return 'decks.finder.syncErrorAlreadySyncing';
    case 'card-db-not-ready':
      return 'decks.finder.syncErrorCardDb';
    case 'persist-failed':
      return 'decks.finder.syncErrorPersist';
    case 'aborted':
      return 'decks.finder.syncErrorAborted';
    default:
      return 'decks.finder.syncErrorUnknown';
  }
}

const CLASSES: HeroClass[] = [
  'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR',
];

const CLASS_LABELS: Record<HeroClass, string> = {
  DEATHKNIGHT: 'Death Knight', DEMONHUNTER: 'Demon Hunter', DRUID: 'Druid',
  HUNTER: 'Hunter', MAGE: 'Mage', PALADIN: 'Paladin', PRIEST: 'Priest',
  ROGUE: 'Rogue', SHAMAN: 'Shaman', WARLOCK: 'Warlock', WARRIOR: 'Warrior',
  NEUTRAL: 'Neutral',
};

const ARCHETYPES: Array<PopularDeckArchetype | 'all'> = [
  'all', 'Aggro', 'Midrange', 'Control', 'Combo', 'Tempo', 'Ramp',
];

const FORMATS: Format[] = ['Standard', 'Wild', 'Classic', 'Twist'];
const SORTS: PopularDeckSort[] = ['popular', 'winrate', 'updated', 'cheapest'];

function ClassChip({ heroClass, label }: { heroClass: HeroClass; label: string }): ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-5 h-5 rounded-full bg-bg-3 flex items-center justify-center text-text text-[9px] font-bold border border-border-hi">
        {heroClass.slice(0, 2)}
      </div>
      <span>{label}</span>
    </div>
  );
}

function winrateColor(pct: number): string {
  if (pct >= 55) return 'text-green';
  if (pct >= 50) return 'text-accent';
  return 'text-amber';
}

function formatGames(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

interface DeckFinderTabProps {
  onImported?: (deckId: string) => void;
}

export function DeckFinderTab({ onImported }: DeckFinderTabProps): ReactElement {
  const { t, locale } = useTranslation();
  const [decks, setDecks] = useState<readonly PopularDeckEnriched[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  // Filter state
  const [includesCard, setIncludesCard] = useState('');
  const [excludesCard, setExcludesCard] = useState('');
  const [classFilter, setClassFilter] = useState<HeroClass | 'all'>('all');
  const [archetypeFilter, setArchetypeFilter] = useState<PopularDeckArchetype | 'all'>('all');
  const [formatFilter, setFormatFilter] = useState<Format>('Standard');
  const [maxDust, setMaxDust] = useState(20000);
  const [sort, setSort] = useState<PopularDeckSort>('popular');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetchList = useCallback(async () => {
    const result = await window.hdt.popularDecks.list();
    setDecks(result.decks);
    setFetchedAt(result.fetchedAt);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.hdt.popularDecks.list().then((result) => {
      if (!cancelled) {
        setDecks(result.decks);
        setFetchedAt(result.fetchedAt);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Initial sync status (handles the case where a sync was already
  // in flight when this tab mounted, e.g. user navigated away and back).
  useEffect(() => {
    void window.hdt.popularDecks.syncStatus?.().then((s) => {
      setSyncing(s.inFlight);
    });
  }, []);

  // Subscribe to progress events while mounted.
  useEffect(() => {
    const off = window.hdt.popularDecks.onSyncProgress?.((p) => {
      setProgress(p);
    });
    return () => {
      off?.();
    };
  }, []);

  const onSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setProgress(null);
    setSyncMessage(null);
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
    try {
      const result = await window.hdt.popularDecks.syncStart();
      if (result.ok) {
        setSyncMessage({
          kind: 'success',
          text: t('decks.finder.syncSuccess', { count: String(result.count) }),
        });
        await refetchList();
      } else {
        setSyncMessage({ kind: 'error', text: t(syncErrorKey(result.error)) });
      }
    } catch (e) {
      console.error('[deck-finder sync]', e);
      setSyncMessage({ kind: 'error', text: t('decks.finder.syncErrorUnknown') });
    } finally {
      setSyncing(false);
      setProgress(null);
      messageTimerRef.current = setTimeout(() => setSyncMessage(null), 5000);
    }
  }, [syncing, refetchList, t]);

  const cardNamesByDeckId = useMemo(() => {
    const map: Record<string, readonly string[]> = {};
    for (const d of decks) map[d.id] = d.cardNames;
    return map;
  }, [decks]);

  const filtered = useMemo(() => {
    const criteria: Parameters<typeof filterPopularDecks>[1] = {
      classFilter,
      archetypeFilter,
      formatFilter,
      maxDust,
      cardNamesByDeckId,
    };
    if (includesCard) criteria.includesCardName = includesCard;
    if (excludesCard) criteria.excludesCardName = excludesCard;
    return filterPopularDecks(decks, criteria);
  }, [decks, classFilter, archetypeFilter, formatFilter, maxDust, includesCard, excludesCard, cardNamesByDeckId]);

  const sorted = useMemo(() => sortPopularDecks(filtered, sort), [filtered, sort]);

  // Default selection: first row when nothing selected or current selection filtered out
  useEffect(() => {
    if (sorted.length === 0) return;
    if (!selectedId || !sorted.some((d) => d.id === selectedId)) {
      setSelectedId(sorted[0]!.id);
    }
  }, [sorted, selectedId]);

  const selected = sorted.find((d) => d.id === selectedId) ?? null;
  const cardDbReady = decks.length > 0 && decks.some((d) => d.cardNames.length > 0);

  const onImport = async (): Promise<void> => {
    if (!selected) return;
    try {
      const created = await window.hdt.decks.importDeckstring(selected.deckstring);
      onImported?.(created.id);
    } catch (e) {
      console.error('[deck-finder import]', e);
    }
  };

  const onCopy = async (): Promise<void> => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.deckstring);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('[deck-finder copy]', e);
    }
  };

  return (
    <div className="flex-1 h-full overflow-hidden bg-bg flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-baseline gap-4">
        <div>
          <div className="text-[11px] text-text-mute font-mono tracking-[0.14em]">
            {t('decks.finder.eyebrow')}
          </div>
          <div className="text-[22px] font-semibold mt-1 tracking-tight text-text">
            {t('decks.finder.title')}
          </div>
        </div>
        <div className="flex-1" />
        <div className="font-mono text-[11px] text-text-dim">
          <span className="text-text font-semibold">{sorted.length}</span> of{' '}
          <span className="text-text-mute">{decks.length}</span> {t('decks.finder.countSuffix')}{' '}
          <span className="text-text">{decks.length}</span>
        </div>
      </div>

      {/* Sync row */}
      <div
        data-testid="deck-finder-sync-row"
        className="px-6 py-2 border-b border-border flex items-center gap-3 font-mono text-[10px] text-text-dim tracking-[0.06em]"
      >
        <button
          type="button"
          onClick={() => { void onSync(); }}
          disabled={syncing}
          data-testid="deck-finder-sync-button"
          className="px-3 py-1.5 rounded-sm bg-bg-2 border border-border text-text hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer tracking-[0.12em] font-bold"
        >
          {syncing
            ? t('decks.finder.syncing', { phase: progress?.phase ?? 'meta' })
            : t('decks.finder.syncButton')}
        </button>
        {syncing && (
          <div
            data-testid="deck-finder-sync-progress"
            className="flex-1 h-1.5 bg-bg-2 border border-border rounded-sm overflow-hidden max-w-[260px]"
          >
            <div
              className="h-full bg-accent transition-[width] duration-150"
              style={{ width: `${progressPercent(progress)}%` }}
            />
          </div>
        )}
        <div className="flex-1" />
        <span data-testid="deck-finder-last-updated" className="text-text-mute">
          {fetchedAt
            ? t('decks.finder.lastUpdated', { date: formatLastUpdated(fetchedAt, locale) ?? fetchedAt })
            : t('decks.finder.lastUpdatedNever')}
        </span>
        {syncMessage && (
          <span
            data-testid="deck-finder-sync-message"
            className={`font-sans text-xs ${syncMessage.kind === 'success' ? 'text-green' : 'text-red'}`}
          >
            {syncMessage.text}
          </span>
        )}
      </div>

      {/* Filter row 1: includes/excludes + format pills */}
      <div className="px-6 py-2.5 border-b border-border grid grid-cols-[1fr_1fr_auto] gap-2.5 items-center">
        <div className="relative">
          <input
            value={includesCard}
            onChange={(e) => setIncludesCard(e.target.value)}
            placeholder={cardDbReady ? t('decks.finder.includesCardPlaceholder') : t('decks.finder.indexingCards')}
            disabled={!cardDbReady}
            className="w-full pl-7 pr-3 py-1.5 bg-bg-2 border border-border rounded-sm text-text text-sm font-sans focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <span className="absolute left-2 top-1.5 text-green font-mono text-sm font-bold">+</span>
        </div>
        <div className="relative">
          <input
            value={excludesCard}
            onChange={(e) => setExcludesCard(e.target.value)}
            placeholder={cardDbReady ? t('decks.finder.excludesCardPlaceholder') : t('decks.finder.indexingCards')}
            disabled={!cardDbReady}
            className="w-full pl-7 pr-3 py-1.5 bg-bg-2 border border-border rounded-sm text-text text-sm font-sans focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <span className="absolute left-2 top-1.5 text-red font-mono text-sm font-bold">−</span>
        </div>
        <div className="flex gap-1.5 font-mono text-[10px]">
          {FORMATS.map((f) => (
            <button
              key={f}
              onClick={() => setFormatFilter(f)}
              className={`px-3 py-1.5 rounded-sm tracking-[0.14em] font-bold cursor-pointer ${
                formatFilter === f
                  ? 'bg-accent-dim text-accent border border-accent'
                  : 'bg-transparent text-text-dim border border-border'
              }`}
            >
              {t(`decks.finder.format${f}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Filter row 2: class chips */}
      <div className="px-6 py-2.5 border-b border-border flex gap-1.5 items-center flex-wrap">
        <button
          onClick={() => setClassFilter('all')}
          className={`px-3 py-1 rounded-full font-mono text-[11px] tracking-[0.08em] font-semibold cursor-pointer ${
            classFilter === 'all'
              ? 'bg-accent-dim text-accent border border-accent'
              : 'text-text-dim border border-border'
          }`}
        >
          {t('decks.finder.classAll')}
        </button>
        {CLASSES.map((c) => {
          const active = classFilter === c;
          return (
            <button
              key={c}
              onClick={() => setClassFilter(c)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] cursor-pointer ${
                active
                  ? 'bg-accent-dim text-accent border border-accent'
                  : 'text-text-dim border border-border'
              }`}
            >
              <ClassChip heroClass={c} label={CLASS_LABELS[c]} />
            </button>
          );
        })}
        <div className="flex-1 min-w-[12px]" />
        <div className="flex gap-1.5 font-mono text-[10px] items-center">
          <span className="text-text-mute tracking-[0.1em]">{t('decks.finder.archLabel')}</span>
          {ARCHETYPES.map((a) => (
            <button
              key={a}
              onClick={() => setArchetypeFilter(a)}
              className={`px-2 py-1 rounded-sm tracking-[0.1em] font-semibold uppercase cursor-pointer ${
                archetypeFilter === a
                  ? 'bg-accent-dim text-accent border border-accent'
                  : 'text-text-dim border border-border'
              }`}
            >
              {t(`decks.finder.arch${a === 'all' ? 'All' : a}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Filter row 3: max dust + sort */}
      <div className="px-6 py-2.5 border-b border-border flex gap-4 items-center font-mono text-[10px] text-text-dim tracking-[0.06em]">
        <div className="flex items-center gap-2">
          <span className="text-text-mute tracking-[0.12em]">{t('decks.finder.maxDustLabel')}</span>
          <input
            type="range"
            min={1000}
            max={20000}
            step={500}
            value={maxDust}
            onChange={(e) => setMaxDust(Number(e.target.value))}
            className="w-[120px] accent-accent"
          />
          <span className="text-text font-semibold min-w-[60px]">◆ {maxDust.toLocaleString()}</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <span className="text-text-mute tracking-[0.12em]">{t('decks.finder.sortLabel')}</span>
          {SORTS.map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-2 py-0.5 rounded-sm tracking-[0.1em] font-semibold uppercase cursor-pointer ${
                sort === s ? 'bg-accent-dim text-accent border border-accent' : 'text-text-dim border border-transparent'
              }`}
            >
              {t(`decks.finder.sort${s.charAt(0).toUpperCase() + s.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 grid grid-cols-[1.4fr_1fr] overflow-hidden">
        {/* List */}
        <div className="overflow-auto border-r border-border">
          {loaded && sorted.length === 0 && (
            <div className="p-10 text-center text-text-mute font-mono text-sm">
              {t('decks.finder.emptyList')}
            </div>
          )}
          {sorted.map((d) => {
            const active = selected?.id === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className={`w-full text-left border-l-2 border-b border-border px-4 py-3 grid grid-cols-[30px_1fr_auto] gap-3 items-center cursor-pointer transition-colors ${
                  active ? 'border-l-accent bg-accent-dim/30' : 'border-l-transparent hover:bg-bg-2'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-bg-3 flex items-center justify-center text-text text-[10px] font-bold border border-border-hi">
                  {d.class.slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-tight text-text">{d.name}</div>
                  <div className="text-[10px] text-text-mute font-mono tracking-[0.08em] mt-0.5 flex gap-2">
                    <span className="text-text-dim uppercase">{d.archetype}</span>
                    <span>·</span>
                    <span>{t('decks.finder.byAuthor')} {d.author}</span>
                    <span>·</span>
                    <span>{t('decks.finder.updatedPrefix')} {d.updatedAt}</span>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className={`text-base font-semibold ${winrateColor(d.winratePercent)}`}>
                    {d.winratePercent}%
                  </div>
                  <div className="text-[9px] text-text-mute tracking-[0.08em]">{formatGames(d.gamesCount)} games</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        {selected && (
          <div className="overflow-auto p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-bg-3 flex items-center justify-center text-text text-xs font-bold border border-border-hi">
                {selected.class.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-semibold tracking-tight text-text">{selected.name}</div>
                <div className="text-[10px] text-text-mute font-mono tracking-[0.1em] mt-0.5 uppercase">
                  {CLASS_LABELS[selected.class]} · {selected.archetype} · {t('decks.finder.byAuthor')} {selected.author}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-px bg-border rounded-sm overflow-hidden border border-border">
              <div className="bg-bg-2 px-3 py-2.5">
                <div className="text-[9px] text-text-mute font-mono tracking-[0.14em]">{t('decks.finder.kpiWinrate')}</div>
                <div className={`text-base font-semibold font-mono mt-0.5 ${winrateColor(selected.winratePercent)}`}>
                  {selected.winratePercent}%
                </div>
              </div>
              <div className="bg-bg-2 px-3 py-2.5">
                <div className="text-[9px] text-text-mute font-mono tracking-[0.14em]">{t('decks.finder.kpiGames')}</div>
                <div className="text-base font-semibold font-mono mt-0.5 text-text">{formatGames(selected.gamesCount)}</div>
              </div>
              <div className="bg-bg-2 px-3 py-2.5">
                <div className="text-[9px] text-text-mute font-mono tracking-[0.14em]">{t('decks.finder.kpiDust')}</div>
                <div className="text-base font-semibold font-mono mt-0.5 text-amber">◆ {selected.dustCost.toLocaleString()}</div>
              </div>
            </div>

            <div>
              <div className="text-[9px] text-text-mute font-mono tracking-[0.14em] mb-1.5">
                {t('decks.finder.manaCurveLabel')}
              </div>
              <ManaCurveChart
                buckets={selected.manaCurve}
                width={300}
                height={48}
                ariaLabel={t('decks.finder.manaCurveAriaLabel')}
              />
            </div>

            <div>
              <div className="text-[9px] text-text-mute font-mono tracking-[0.14em] mb-2">
                {t('decks.finder.keyCardsLabel')}
              </div>
              <div className="flex flex-col gap-0.5">
                {selected.keyCards.map((kc, i) => (
                  <div
                    key={`${kc.name}-${i}`}
                    className="flex items-center gap-2 px-2 py-1 bg-bg-2 rounded-sm text-xs border border-transparent hover:border-border-hi"
                  >
                    <div className="w-5 h-5 rounded-full bg-bg-3 flex items-center justify-center text-[9px] font-bold text-text border border-border-hi font-mono">
                      {kc.cost}
                    </div>
                    <span className="flex-1 text-text">{kc.name}</span>
                    <span className="font-mono text-[11px] text-accent font-semibold">×{kc.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-auto pt-2">
              <button
                onClick={() => { void onImport(); }}
                className="flex-1 px-3.5 py-2.5 rounded-sm bg-accent text-bg border-0 font-mono text-[11px] tracking-[0.14em] font-bold cursor-pointer"
              >
                {t('decks.finder.importButton')}
              </button>
              <button
                onClick={() => { void onCopy(); }}
                className="px-3.5 py-2.5 rounded-sm bg-transparent text-text-dim border border-border font-mono text-[11px] tracking-[0.14em] font-semibold cursor-pointer"
              >
                {copied ? t('decks.finder.copyConfirm') : t('decks.finder.copyButton')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
