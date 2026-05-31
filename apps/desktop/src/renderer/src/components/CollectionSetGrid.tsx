import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CircleDollarSign,
  Grid2X2,
  Package,
  Search,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { SET_LABELS } from '@hdt/hearthdb';
import type { SetProgress } from '@hdt/core';

import { useTranslation } from '../i18n';
import { SetTile } from './SetTile';
import marchOfTheLichKingBg from '../assets/collection/march-of-the-lich-king-bg.png';

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
const TAB_ICONS = {
  cards: Sparkles,
  cardBacks: Grid2X2,
  heroes: UserRound,
  coins: CircleDollarSign,
  packs: Package,
} satisfies Record<TabId, typeof Sparkles>;

// Per-set accent override map. Currently empty — every set falls
// through to var(--class-neutral). Kept as a map so older Wild sets
// without an official logo can opt back into a class-themed band if
// the uniform-neutral look ever feels too samey.
const SET_ACCENT: Record<string, string> = {};
const SET_BACKGROUND_IMAGES: Record<string, string> = {
  SET_1869: marchOfTheLichKingBg,
};

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
    <div className="reference-collection-grid-shell">
      {/* Tab bar (Cards / Card Backs / Heroes / Lucky Coins / Card Packs) */}
      <div className="reference-category-tabs" role="tablist" aria-label="Collection categories">
        {TAB_ORDER.map((tab) => {
          const isActive = tab === activeTab;
          const isCards = tab === 'cards';
          const Icon = TAB_ICONS[tab];
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
              className={isActive ? 'is-active' : ''}
            >
              <Icon size={17} aria-hidden="true" />
              {t(`collection.tabs.${tab}`)}
              {!isCards && (
                <span className="reference-coming-soon">
                  {t('collection.tabs.comingSoon')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter row: search + standard/wild segment */}
      <div className="reference-filter-row">
        <label className="reference-search-box">
          <Search size={18} aria-hidden="true" />
          <input
            data-testid="tile-search"
            aria-label={t('collection.filter.search')}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('collection.filter.search')}
          />
        </label>
        <div className="reference-segment">
          {(['standard', 'wild'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setActiveFormat(fmt)}
              className={activeFormat === fmt ? 'is-active' : ''}
            >
              {t(`collection.progress.tab${fmt === 'standard' ? 'Standard' : 'Wild'}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Mirror / cached banner */}
      {!progress.mirrorAlive && (
        <div
          className="reference-warning-banner"
          data-testid="collection-banner"
          data-banner-source={progress.source ?? 'empty'}
        >
          <AlertTriangle size={20} />
          <p>
            {progress.source === 'cache' && progress.lastUpdatedAt
              ? t('collection.progress.cachedBanner', {
                  date: new Date(progress.lastUpdatedAt).toLocaleString(locale),
                })
              : t('collection.progress.mirrorBanner')}
          </p>
        </div>
      )}

      {/* Overall Progress */}
      <div className="reference-panel reference-overall-progress">
        <ProgressRing percent={percentage} label={t('collection.reference.completion')} />
        <div className="reference-overall-copy">
          <div>
            <h2>{t('collection.overallProgress')}</h2>
            <p>
              {t('collection.reference.collectedLine', {
                owned: totalOwned,
                total: totalMax,
              })}
            </p>
          </div>
          <div className="reference-overall-count">
            <b>{totalOwned}</b>
            <span> / {totalMax}</span>
          </div>
          <div className="reference-progress-bar">
            <span style={{ width: `${percentage}%` }} />
          </div>
          <p className="reference-progress-caption">
            {t('collection.percentComplete', { percent: percentage })}
          </p>
        </div>
      </div>

      {/* Section heading + tile grid */}
      <h2 className="reference-section-title">{t('collection.expansions')}</h2>
      <div
        data-testid="set-grid"
        className="reference-expansion-grid grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
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
              {...(SET_BACKGROUND_IMAGES[row.setCode] !== undefined
                ? { backgroundImageUrl: SET_BACKGROUND_IMAGES[row.setCode] }
                : {})}
              onClick={onOpenSet}
            />
          );
        })}
      </div>
    </div>
  );
}

function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  return (
    <div className="reference-progress-ring" aria-label={`${percent}%`}>
      <svg viewBox="0 0 116 116" aria-hidden="true">
        <circle cx="58" cy="58" r={radius} className="reference-progress-ring-track" />
        <circle
          cx="58"
          cy="58"
          r={radius}
          className="reference-progress-ring-value"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div>
        <b>{percent}%</b>
        <span>{label}</span>
      </div>
    </div>
  );
}
