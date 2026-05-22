import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { SET_LABELS } from '@hdt/hearthdb';
import type { SetProgress } from '@hdt/core';

import { useTranslation } from '../i18n';
import { SetTile } from './SetTile';

interface ProgressResponse {
  standard: SetProgress[];
  wild: SetProgress[];
  mirrorAlive: boolean;
  source?: 'live' | 'cache' | 'empty';
  lastUpdatedAt?: number | null;
}

interface CollectionSetGridProps {
  progress: ProgressResponse;
  coverCardIds?: Map<string, string>;
  onOpenSet: (setCode: string) => void;
}

type TabId = 'cards' | 'cardBacks' | 'heroes' | 'coins' | 'packs';

const TAB_ORDER: TabId[] = ['cards', 'cardBacks', 'heroes', 'coins', 'packs'];

// Per-set accent override map. Currently empty — every set falls
// through to var(--class-neutral). Kept as a map so older Wild sets
// without an official logo can opt back into a class-themed band if
// the uniform-neutral look ever feels too samey.
const SET_ACCENT: Record<string, string> = {};

function accentFor(setCode: string): string {
  return SET_ACCENT[setCode] ?? 'var(--class-neutral)';
}

function isMiniSet(label: string): boolean {
  return /mini[- ]set|迷你/i.test(label);
}

export function CollectionSetGrid({ progress, coverCardIds, onOpenSet }: CollectionSetGridProps) {
  const { t, locale } = useTranslation();
  // `activeFormat` is the single source of truth for "Standard vs Wild".
  // We previously also had a separate `modeFilter` with an "all" option
  // driven by a dropdown in the filter row, but it duplicated the
  // standard/wild segment toggle on the right. Removed in favour of one
  // selector — the segment toggle.
  const [activeFormat, setActiveFormat] = useState<'standard' | 'wild'>('standard');
  const [activeTab, setActiveTab] = useState<TabId>('cards');
  const [search, setSearch] = useState('');

  const overallRows = activeFormat === 'standard' ? progress.standard : progress.wild;
  const totalOwned = overallRows.reduce((s, r) => s + r.ownedCopies, 0);
  const totalMax = overallRows.reduce((s, r) => s + r.totalCopies, 0);
  const percentage = totalMax > 0 ? Math.round((totalOwned / totalMax) * 100) : 0;

  function labelFor(setCode: string): string {
    const entry = SET_LABELS[setCode];
    if (!entry) return t('collection.progress.unknownSet', { code: setCode });
    return entry[locale] ?? entry['en-US'];
  }

  const filteredRows = useMemo(() => {
    const baseRows: SetProgress[] =
      activeFormat === 'standard' ? progress.standard : progress.wild;
    if (search.trim() === '') return baseRows;
    const q = search.trim().toLowerCase();
    return baseRows.filter((r) => labelFor(r.setCode).toLowerCase().includes(q));
  }, [progress, activeFormat, search, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      {/* Tab bar (Cards / Card Backs / Heroes / Lucky Coins / Card Packs) */}
      <div className="flex items-center gap-1" role="tablist" aria-label="Collection categories">
        {TAB_ORDER.map((tab) => {
          const isActive = tab === activeTab;
          const isCards = tab === 'cards';
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              data-testid={`category-tab-${tab}`}
              aria-selected={isActive}
              aria-disabled={!isCards}
              disabled={!isCards}
              onClick={() => { if (isCards) setActiveTab(tab); }}
              className={
                'flex items-center gap-2 px-3.5 py-2 rounded-md text-sm transition-colors ' +
                (isActive
                  ? 'bg-overlay-surface text-text font-semibold border border-border-hairline'
                  : 'text-text-secondary font-medium hover:text-text disabled:cursor-not-allowed disabled:opacity-70')
              }
            >
              {t(`collection.tabs.${tab}`)}
              {!isCards && (
                <span className="rounded-full bg-overlay-surface text-text-tertiary text-[9px] font-medium px-1.5 py-0.5">
                  {t('collection.tabs.comingSoon')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter row: search + standard/wild segment */}
      <div className="flex items-center gap-3">
        <input
          data-testid="tile-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('collection.filter.search')}
          className="h-9 flex-1 max-w-xs px-3 rounded-md bg-card border border-border-hairline text-sm text-text placeholder:text-text-tertiary"
        />
        <div className="ml-auto flex bg-overlay-surface dark:bg-black/20 rounded-md p-1 border border-border-hairline">
          {(['standard', 'wild'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setActiveFormat(fmt)}
              className={
                'px-4 py-1.5 rounded text-sm font-semibold transition-all ' +
                (activeFormat === fmt
                  ? 'bg-accent text-text-on-accent shadow-[0_1px_3px_rgba(0,0,0,0.18)]'
                  : 'text-text-secondary hover:text-text')
              }
            >
              {t(`collection.progress.tab${fmt === 'standard' ? 'Standard' : 'Wild'}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Mirror / cached banner */}
      {!progress.mirrorAlive && (
        <div
          className="tahoe-card p-4 flex items-center space-x-3"
          data-testid="collection-banner"
          data-banner-source={progress.source ?? 'empty'}
        >
          <AlertTriangle size={20} className="text-accent shrink-0" />
          <p className="text-text-secondary text-sm">
            {progress.source === 'cache' && progress.lastUpdatedAt
              ? t('collection.progress.cachedBanner', {
                  date: new Date(progress.lastUpdatedAt).toLocaleString(locale),
                })
              : t('collection.progress.mirrorBanner')}
          </p>
        </div>
      )}

      {/* Overall Progress */}
      <div className="tahoe-card p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-text">{t('collection.overallProgress')}</h2>
          <div className="text-right">
            <span className="text-accent font-bold text-2xl font-mono tabular-nums">{totalOwned}</span>
            <span className="text-text-tertiary font-medium font-mono tabular-nums"> / {totalMax}</span>
          </div>
        </div>
        <div className="w-full bg-black/8 dark:bg-white/8 rounded-full h-3 mb-2 overflow-hidden">
          <div
            className="bg-accent h-3 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="text-text-secondary text-sm font-medium">
          {t('collection.percentComplete', { percent: percentage })}
        </p>
      </div>

      {/* Section heading + tile grid */}
      <h2 className="text-xl font-bold text-text mt-2">{t('collection.expansions')}</h2>
      <div
        data-testid="set-grid"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      >
        {filteredRows.map((row) => {
          const label = labelFor(row.setCode);
          return (
            <SetTile
              key={`${row.format}-${row.setCode}`}
              row={row}
              label={label}
              mini={isMiniSet(label)}
              accent={accentFor(row.setCode)}
              {...(coverCardIds?.get(row.setCode) !== undefined
                ? { coverCardId: coverCardIds.get(row.setCode)! }
                : {})}
              onClick={onOpenSet}
            />
          );
        })}
      </div>
    </div>
  );
}
