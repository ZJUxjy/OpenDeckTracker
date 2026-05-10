import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import {
  filterPopularDecks,
  sortPopularDecks,
  type Format,
  type HeroClass,
  type PopularDeckEnriched,
  type PopularDeckKeyCard,
  type PopularDeckSort,
} from '@hdt/core';
import type { Rarity } from '@hdt/hearthdb';
import { clsx } from 'clsx';

import { useTranslation } from '../i18n';
import { useCardDef } from '../hooks/use-card-def';
import { useCardTileUrl } from '../hooks/use-card-image-url';
import { useCardPreview } from '../hooks/use-card-preview';
import { ManaCurveChart } from './ManaCurveChart';

const ART_MASK_STYLE: CSSProperties = {
  maskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
};
const NAME_TEXT_SHADOW: CSSProperties = { textShadow: '0 1px 2px rgba(0,0,0,0.7)' };

function getRarityCostBg(rarity: Rarity | undefined): string {
  if (rarity === 'LEGENDARY') return 'bg-rarity-legendary text-bg';
  if (rarity === 'EPIC') return 'bg-rarity-epic text-bg';
  if (rarity === 'RARE') return 'bg-rarity-rare text-bg';
  return 'bg-overlay-elevated text-text border border-border-hi';
}

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

const CLASS_LABEL_KEYS: Record<HeroClass, string> = {
  DEATHKNIGHT: 'decks.finder.classDeathKnight',
  DEMONHUNTER: 'decks.finder.classDemonHunter',
  DRUID: 'decks.finder.classDruid',
  HUNTER: 'decks.finder.classHunter',
  MAGE: 'decks.finder.classMage',
  PALADIN: 'decks.finder.classPaladin',
  PRIEST: 'decks.finder.classPriest',
  ROGUE: 'decks.finder.classRogue',
  SHAMAN: 'decks.finder.classShaman',
  WARLOCK: 'decks.finder.classWarlock',
  WARRIOR: 'decks.finder.classWarrior',
  NEUTRAL: 'decks.finder.classNeutral',
};

const FORMATS: Format[] = ['Standard', 'Wild'];
const SORTS: PopularDeckSort[] = ['popular', 'winrate', 'updated', 'cheapest'];
const MAX_DUST_LIMIT = 20000;
const MAX_DUST_UNLIMITED = MAX_DUST_LIMIT + 500;

function ClassChip({ heroClass, label }: { heroClass: HeroClass; label: string }): ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-5 h-5 rounded-full bg-overlay-elevated flex items-center justify-center text-text text-[9px] font-bold border border-border-hi">
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
  /**
   * Kept for prop-shape compatibility with existing callers; the import
   * button has been removed in favour of the copy-deckstring flow, so
   * this callback is currently never fired.
   */
  onImported?: (deckId: string) => void;
}

export function DeckFinderTab(_props: DeckFinderTabProps = {}): ReactElement {
  const { t, locale } = useTranslation();
  const [decks, setDecks] = useState<readonly PopularDeckEnriched[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  // Filter state
  const [includesCard, setIncludesCard] = useState('');
  const [excludesCard, setExcludesCard] = useState('');
  const [classFilter, setClassFilter] = useState<HeroClass | 'all'>('all');
  const [formatFilter, setFormatFilter] = useState<Format>('Standard');
  const [maxDust, setMaxDust] = useState<number>(MAX_DUST_LIMIT);
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
    const effectiveMaxDust = maxDust >= MAX_DUST_UNLIMITED ? undefined : maxDust;
    const criteria: Parameters<typeof filterPopularDecks>[1] = {
      classFilter,
      formatFilter,
      ...(effectiveMaxDust === undefined ? {} : { maxDust: effectiveMaxDust }),
      cardNamesByDeckId,
    };
    if (includesCard) criteria.includesCardName = includesCard;
    if (excludesCard) criteria.excludesCardName = excludesCard;
    return filterPopularDecks(decks, criteria);
  }, [decks, classFilter, formatFilter, maxDust, includesCard, excludesCard, cardNamesByDeckId]);

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
    <div className="flex-1 h-full overflow-hidden flex flex-col">
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
          className="px-3 py-1.5 rounded-sm bg-overlay-surface border border-border text-text hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer tracking-[0.12em] font-bold"
        >
          {syncing
            ? t('decks.finder.syncing', { phase: progress?.phase ?? 'meta' })
            : t('decks.finder.syncButton')}
        </button>
        {syncing && (
          <div
            data-testid="deck-finder-sync-progress"
            className="flex-1 h-1.5 bg-overlay-surface border border-border rounded-sm overflow-hidden max-w-[260px]"
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
            className="w-full pl-7 pr-3 py-1.5 bg-overlay-surface border border-border rounded-sm text-text text-sm font-sans focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <span className="absolute left-2 top-1.5 text-green font-mono text-sm font-bold">+</span>
        </div>
        <div className="relative">
          <input
            value={excludesCard}
            onChange={(e) => setExcludesCard(e.target.value)}
            placeholder={cardDbReady ? t('decks.finder.excludesCardPlaceholder') : t('decks.finder.indexingCards')}
            disabled={!cardDbReady}
            className="w-full pl-7 pr-3 py-1.5 bg-overlay-surface border border-border rounded-sm text-text text-sm font-sans focus:border-accent focus:outline-none disabled:opacity-50"
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
              <ClassChip heroClass={c} label={t(CLASS_LABEL_KEYS[c])} />
            </button>
          );
        })}
        <div className="flex-1 min-w-[12px]" />
      </div>

      {/* Filter row 3: max dust + sort */}
      <div className="px-6 py-2.5 border-b border-border flex gap-4 items-center font-mono text-[10px] text-text-dim tracking-[0.06em]">
        <div className="flex items-center gap-2">
          <span className="text-text-mute tracking-[0.12em]">{t('decks.finder.maxDustLabel')}</span>
          <input
            type="range"
            min={1000}
            max={MAX_DUST_UNLIMITED}
            step={500}
            value={maxDust}
            onChange={(e) => setMaxDust(Number(e.target.value))}
            className="w-[120px] accent-accent"
            aria-label={t('decks.finder.maxDustLabel')}
          />
          <span className="text-text font-semibold min-w-[60px]">
            ◆ {maxDust >= MAX_DUST_UNLIMITED ? '∞' : maxDust.toLocaleString()}
          </span>
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
                  active ? 'border-l-accent bg-accent-dim/30' : 'border-l-transparent hover:bg-overlay-surface'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-overlay-elevated flex items-center justify-center text-text text-[10px] font-bold border border-border-hi">
                  {d.class.slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-tight text-text">{d.name}</div>
                  <div
                    data-testid="deck-finder-list-row-meta"
                    className="text-[10px] text-text-mute font-mono tracking-[0.08em] mt-0.5 flex gap-2"
                  >
                    <span className="text-text-dim uppercase">{d.archetype}</span>
                    <span>·</span>
                    <span>◆ {d.dustCost.toLocaleString()}</span>
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
              <div className="w-9 h-9 rounded-full bg-overlay-elevated flex items-center justify-center text-text text-xs font-bold border border-border-hi">
                {selected.class.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-semibold tracking-tight text-text">{selected.name}</div>
                <div className="text-[10px] text-text-mute font-mono tracking-[0.1em] mt-0.5 uppercase">
                  {t(CLASS_LABEL_KEYS[selected.class])} · {selected.archetype} · {t('decks.finder.byAuthor')} {selected.author}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-px bg-border rounded-sm overflow-hidden border border-border">
              <div className="bg-overlay-surface px-3 py-2.5">
                <div className="text-[9px] text-text-mute font-mono tracking-[0.14em]">{t('decks.finder.kpiWinrate')}</div>
                <div className={`text-base font-semibold font-mono mt-0.5 ${winrateColor(selected.winratePercent)}`}>
                  {selected.winratePercent}%
                </div>
              </div>
              <div className="bg-overlay-surface px-3 py-2.5">
                <div className="text-[9px] text-text-mute font-mono tracking-[0.14em]">{t('decks.finder.kpiGames')}</div>
                <div className="text-base font-semibold font-mono mt-0.5 text-text">{formatGames(selected.gamesCount)}</div>
              </div>
              <div className="bg-overlay-surface px-3 py-2.5">
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
                height={62}
                ariaLabel={t('decks.finder.manaCurveAriaLabel')}
                showAxisLabels
              />
            </div>

            <div>
              <div className="text-[9px] text-text-mute font-mono tracking-[0.14em] mb-2">
                {t('decks.finder.keyCardsLabel')}
              </div>
              <KeyCardsList keyCards={selected.keyCards} />
            </div>

            <div className="flex gap-2 mt-auto pt-2">
              <button
                onClick={() => { void onCopy(); }}
                className="flex-1 px-3.5 py-2.5 rounded-sm bg-accent text-bg border-0 font-mono text-[11px] tracking-[0.14em] font-bold cursor-pointer"
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

/**
 * Renders the deck's top-N cards with locale-correct names (resolved at
 * render time against the active locale's CardDb), tile art, and the
 * existing card-preview hover. Mirrors LiveDeckPanel's row treatment so
 * the Deck Finder feels consistent with the in-game tracker.
 */
function KeyCardsList({ keyCards }: { keyCards: readonly PopularDeckKeyCard[] }): ReactElement {
  const { onRowEnter, onRowLeave } = useCardPreview();
  const handleEnter = useCallback(
    (cardId: string, el: HTMLDivElement) => onRowEnter(cardId, el),
    [onRowEnter],
  );
  return (
    <div className="flex flex-col gap-0.5">
      {keyCards.map((kc, i) => (
        <KeyCardRow
          key={`${kc.cardId}-${i}`}
          cardId={kc.cardId}
          fallbackName={kc.name}
          fallbackCost={kc.cost}
          count={kc.count}
          onMouseEnter={handleEnter}
          onMouseLeave={onRowLeave}
        />
      ))}
    </div>
  );
}

function KeyCardRow({
  cardId,
  fallbackName,
  fallbackCost,
  count,
  onMouseEnter,
  onMouseLeave,
}: {
  cardId: string;
  fallbackName: string;
  fallbackCost: number;
  count: number;
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}): ReactElement {
  const def = useCardDef(cardId);
  const name = def?.name ?? fallbackName;
  const cost = def?.cost ?? fallbackCost;
  const rarity = def?.rarity as Rarity | undefined;
  const tileUrl = useCardTileUrl(cardId);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      data-testid="deck-finder-key-card-row"
      onMouseEnter={() => ref.current && onMouseEnter(cardId, ref.current)}
      onMouseLeave={onMouseLeave}
      className="relative overflow-hidden rounded-sm bg-overlay-surface text-xs border border-transparent hover:border-border-hi"
    >
      {tileUrl ? (
        <img
          src={tileUrl}
          alt=""
          aria-hidden
          style={ART_MASK_STYLE}
          className="absolute right-0 top-0 h-full w-3/5 object-cover object-right pointer-events-none select-none z-0"
        />
      ) : null}
      <div className="relative z-10 flex items-center gap-2 px-2 py-1 w-full">
        <div
          className={clsx(
            'w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold font-mono shrink-0',
            getRarityCostBg(rarity),
          )}
        >
          {cost}
        </div>
        <span
          className={clsx(
            'flex-1 min-w-0 truncate font-medium',
            rarity === 'LEGENDARY' ? 'text-rarity-legendary' : '',
            rarity === 'EPIC' ? 'text-rarity-epic' : '',
            rarity === 'RARE' ? 'text-rarity-rare' : '',
            !rarity || rarity === 'COMMON' || rarity === 'FREE' ? 'text-text' : '',
          )}
          style={NAME_TEXT_SHADOW}
          title={cardId}
        >
          {name}
        </span>
        <span
          data-testid="deck-finder-key-card-count"
          className="min-w-6 h-5 px-1 rounded bg-overlay-elevated border border-border-hi flex items-center justify-center font-mono text-[10px] text-text font-bold shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.28)]"
        >
          ×{count}
        </span>
      </div>
    </div>
  );
}
