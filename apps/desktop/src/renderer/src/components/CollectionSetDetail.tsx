import { useEffect, useMemo, useState } from 'react';
import { SET_LABELS } from '@hdt/hearthdb';
import type { CardClass, CardDef, CardType, Rarity } from '@hdt/hearthdb';
import type { SetProgress } from '@hdt/core';

import { useTranslation } from '../i18n';
import { CollectionCardCell } from './CollectionCardCell';

interface CollectionSetDetailProps {
  setCode: string;
  row: SetProgress;
  ownedByDbfId: Map<number, number>;
  onBack: () => void;
}

type RarityFilter = 'ALL' | Rarity;
type ClassFilter = 'ALL' | CardClass;
type TypeFilter = 'ALL' | 'MINION' | 'SPELL' | 'WEAPON' | 'LOCATION';
type ManaFilter = 'all' | 1 | 2 | 3 | 4 | 5 | 6 | '7plus';

const CLASS_OPTIONS: CardClass[] = [
  'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR', 'NEUTRAL',
];

const MANA_OPTIONS: ManaFilter[] = ['all', 1, 2, 3, 4, 5, 6, '7plus'];

function isMiniSet(label: string): boolean {
  return /mini[- ]set|迷你/i.test(label);
}

function matchesMana(card: CardDef, mana: ManaFilter): boolean {
  if (mana === 'all') return true;
  const cost = card.cost ?? 0;
  if (mana === '7plus') return cost >= 7;
  return cost === mana;
}

function matchesType(card: CardDef, type: TypeFilter): boolean {
  if (type === 'ALL') return true;
  return card.type === type;
}

export function CollectionSetDetail({ setCode, row, ownedByDbfId, onBack }: CollectionSetDetailProps) {
  const { t, locale } = useTranslation();
  const entry = SET_LABELS[setCode];
  const localizedName = entry?.[locale] ?? entry?.['en-US'] ?? t('collection.progress.unknownSet', { code: setCode });
  const englishName = entry?.['en-US'] ?? setCode;
  const mini = isMiniSet(localizedName);
  const complete = row.totalCopies > 0 && row.ownedCopies === row.totalCopies;
  const uniqueComplete = row.totalCards > 0 && row.ownedUniqueCards === row.totalCards;

  const [cards, setCards] = useState<CardDef[]>([]);
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('ALL');
  const [classFilter, setClassFilter] = useState<ClassFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [manaFilter, setManaFilter] = useState<ManaFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setRarityFilter('ALL');
    setClassFilter('ALL');
    setTypeFilter('ALL');
    setManaFilter('all');
    setSearch('');
    setCards([]);
    if (typeof window === 'undefined' || !window.hdt?.cards?.search) return;
    void window.hdt.cards
      .search({ set: setCode, collectible: true }, locale)
      .then((res) => {
        if (cancelled) return;
        setCards(res);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [setCode, locale]);

  const visibleCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((card) => {
      if (rarityFilter !== 'ALL' && card.rarity !== rarityFilter) return false;
      if (classFilter !== 'ALL' && card.cardClass !== classFilter) return false;
      if (!matchesType(card, typeFilter)) return false;
      if (!matchesMana(card, manaFilter)) return false;
      if (q !== '' && !card.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cards, rarityFilter, classFilter, typeFilter, manaFilter, search]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            data-testid="detail-back"
            className="w-10 h-10 rounded-md tahoe-card flex items-center justify-center text-text hover:text-accent"
            aria-label="Back"
          >
            <span className="text-base font-semibold">←</span>
          </button>
          <div
            className="rounded-md flex items-center justify-center"
            style={{ width: 52, height: 52, backgroundColor: 'var(--class-neutral)' }}
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text leading-tight">{localizedName}</h1>
              {mini && (
                <span
                  data-testid="detail-mini-badge"
                  className="rounded px-1.5 py-0.5 bg-overlay-surface text-text-secondary text-[10px] font-bold tracking-wider"
                >
                  {t('collection.tile.miniSet')}
                </span>
              )}
            </div>
            <p data-testid="detail-subtitle" className="text-sm text-text-secondary">
              {t('collection.detail.subtitle', { english: englishName, total: row.totalCards })}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-baseline gap-1.5">
            <span
              data-testid="detail-unique-value"
              className={`text-2xl font-bold font-mono tabular-nums ${uniqueComplete ? 'text-green' : 'text-accent'}`}
            >
              {row.ownedUniqueCards}
            </span>
            <span data-testid="detail-unique-total" className="text-sm text-text-tertiary font-medium font-mono tabular-nums">
              {t('collection.detail.uniqueProgress', { total: row.totalCards })}
            </span>
          </div>
          {complete && (
            <span
              data-testid="detail-complete-pill"
              className="rounded-full bg-green text-white text-[11px] font-semibold px-2.5 py-0.5"
            >
              {t('collection.detail.complete')}
            </span>
          )}
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          data-testid="detail-filter-rarity"
          value={rarityFilter}
          onChange={(e) => setRarityFilter(e.target.value as RarityFilter)}
          className="h-9 px-3 rounded-md bg-card border border-border-hairline text-sm text-text font-medium"
        >
          <option value="ALL">{t('collection.detail.filter.rarity.any')}</option>
          <option value="COMMON">{t('collection.detail.filter.rarity.common')}</option>
          <option value="RARE">{t('collection.detail.filter.rarity.rare')}</option>
          <option value="EPIC">{t('collection.detail.filter.rarity.epic')}</option>
          <option value="LEGENDARY">{t('collection.detail.filter.rarity.legendary')}</option>
        </select>
        <select
          data-testid="detail-filter-class"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value as ClassFilter)}
          className="h-9 px-3 rounded-md bg-card border border-border-hairline text-sm text-text font-medium"
        >
          <option value="ALL">{t('collection.detail.filter.class.all')}</option>
          {CLASS_OPTIONS.map((c) => (
            <option key={c} value={c}>{t(`collection.detail.filter.class.${c}`)}</option>
          ))}
        </select>
        <select
          data-testid="detail-filter-type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="h-9 px-3 rounded-md bg-card border border-border-hairline text-sm text-text font-medium"
        >
          <option value="ALL">{t('collection.detail.filter.type.all')}</option>
          <option value="MINION">{t('collection.detail.filter.type.minion')}</option>
          <option value="SPELL">{t('collection.detail.filter.type.spell')}</option>
          <option value="WEAPON">{t('collection.detail.filter.type.weapon')}</option>
          <option value="LOCATION">{t('collection.detail.filter.type.location')}</option>
        </select>
        <div className="flex items-center gap-1 bg-card rounded-md border border-border-hairline p-1">
          {MANA_OPTIONS.map((m) => {
            const id = m === 'all' ? 'all' : m === '7plus' ? '7plus' : String(m);
            const isActive = manaFilter === m;
            const label = m === 'all'
              ? t('collection.detail.filter.mana.all')
              : m === '7plus'
                ? t('collection.detail.filter.mana.sevenPlus')
                : String(m);
            return (
              <button
                key={id}
                type="button"
                data-testid={`detail-mana-pill-${id}`}
                aria-pressed={isActive}
                onClick={() => setManaFilter(m)}
                className={
                  'h-7 min-w-[28px] px-2 rounded text-xs font-semibold transition-colors ' +
                  (isActive
                    ? 'bg-accent text-text-on-accent'
                    : 'text-text-secondary hover:text-text')
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <input
          data-testid="detail-filter-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('collection.detail.filter.search')}
          className="ml-auto h-9 w-56 px-3 rounded-md bg-card border border-border-hairline text-sm text-text placeholder:text-text-tertiary"
        />
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {visibleCards.map((card) => (
          <CollectionCardCell
            key={card.id}
            card={card}
            ownedCount={ownedByDbfId.get(card.dbfId) ?? 0}
          />
        ))}
      </div>
    </div>
  );
}
