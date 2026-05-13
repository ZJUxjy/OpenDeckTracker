import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import type { OpponentCardRecord } from '@hdt/core';
import type { CardDef, Rarity } from '@hdt/hearthdb';
import { clsx } from 'clsx';
import { useCardTileUrl } from '../hooks/use-card-image-url';
import { useCardPreview } from '../hooks/use-card-preview';
import { useLocale, useTranslation } from '../i18n';

const NAME_TEXT_SHADOW: CSSProperties = { textShadow: '0 1px 2px rgba(0,0,0,0.7)' };
const ART_MASK_STYLE: CSSProperties = {
  maskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
};

type GraveyardTypeFilter = 'ALL' | 'MINION' | 'SPELL' | 'WEAPON';

const TYPE_FILTERS: readonly GraveyardTypeFilter[] = ['ALL', 'MINION', 'SPELL', 'WEAPON'];

interface GraveyardPanelProps {
  records: readonly OpponentCardRecord[];
  emptyLabelKey: 'tracker.graveyardEmpty' | 'tracker.opponentGraveyardEmpty';
  testIdPrefix: 'friendly-graveyard' | 'opponent-graveyard';
}

interface FriendlyGraveyardPanelProps {
  records: readonly OpponentCardRecord[];
}

interface GroupedRow {
  cardId: string;
  count: number;
  order: number;
}

function groupRecords(records: readonly OpponentCardRecord[]): GroupedRow[] {
  const groups = new Map<string, GroupedRow>();
  for (const r of records) {
    const existing = groups.get(r.cardId);
    if (existing) {
      existing.count += 1;
      existing.order = Math.min(existing.order, r.order);
    } else {
      groups.set(r.cardId, { cardId: r.cardId, count: 1, order: r.order });
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.order - b.order);
}

function GraveyardPanel({
  records,
  emptyLabelKey,
  testIdPrefix,
}: GraveyardPanelProps): ReactElement {
  const { t } = useTranslation();
  const { onRowEnter, onRowLeave } = useCardPreview();
  const handleEnter = useCallback(
    (cardId: string, el: HTMLDivElement) => onRowEnter(cardId, el),
    [onRowEnter],
  );
  const groups = useMemo(() => groupRecords(records), [records]);
  const cardIds = useMemo(() => groups.map((g) => g.cardId), [groups]);
  const defs = useGraveyardCardDefs(cardIds);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<GraveyardTypeFilter>('ALL');
  const filteredGroups = useMemo(
    () =>
      groups.filter((g) => {
        const def = defs.get(g.cardId);
        return matchesTypeFilter(def, typeFilter) && matchesSearch(def, g.cardId, search);
      }),
    [defs, groups, search, typeFilter],
  );

  if (groups.length === 0) {
    return (
      <div
        data-testid={`${testIdPrefix}-empty`}
        className="h-full flex items-center justify-center text-text-mute text-sm px-4 text-center"
      >
        {t(emptyLabelKey)}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div
        className="shrink-0 p-2 border-b border-border bg-overlay-surface"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <div className="flex items-center gap-2">
          <input
            data-testid={`${testIdPrefix}-search`}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tracker.graveyardSearchPlaceholder')}
            aria-label={t('tracker.graveyardSearchLabel')}
            className="min-w-0 flex-1 h-8 rounded-md bg-overlay-elevated border border-border px-2 text-xs text-text placeholder:text-text-tertiary outline-none focus:border-accent"
          />
          <select
            data-testid={`${testIdPrefix}-type-filter`}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as GraveyardTypeFilter)}
            aria-label={t('tracker.graveyardTypeFilterLabel')}
            className="h-8 w-24 rounded-md bg-overlay-elevated border border-border px-2 text-xs text-text outline-none focus:border-accent"
          >
            {TYPE_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {t(`tracker.graveyardType.${filter}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        data-overlay-list-area
        className="flex-1 min-h-0 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
      >
        {filteredGroups.length === 0 ? (
          <div
            data-testid={`${testIdPrefix}-no-results`}
            className="h-full flex items-center justify-center text-text-mute text-sm px-4 text-center"
          >
            {t('tracker.graveyardNoResults')}
          </div>
        ) : (
          <div
            data-testid={`${testIdPrefix}-list`}
            className="space-y-1"
          >
            {filteredGroups.map((g) => (
              <GraveyardRow
                key={g.cardId}
                row={g}
                def={defs.get(g.cardId)}
                testIdPrefix={testIdPrefix}
                onMouseEnter={handleEnter}
                onMouseLeave={onRowLeave}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Local-side graveyard tab content. Shows cards the LOCAL player has
 * used / lost this match.
 */
export function FriendlyGraveyardPanel({ records }: FriendlyGraveyardPanelProps): ReactElement {
  return (
    <GraveyardPanel
      records={records}
      emptyLabelKey="tracker.graveyardEmpty"
      testIdPrefix="friendly-graveyard"
    />
  );
}

export function OpponentGraveyardPanel({ records }: FriendlyGraveyardPanelProps): ReactElement {
  return (
    <GraveyardPanel
      records={records}
      emptyLabelKey="tracker.opponentGraveyardEmpty"
      testIdPrefix="opponent-graveyard"
    />
  );
}

function GraveyardRow({
  row,
  def,
  testIdPrefix,
  onMouseEnter,
  onMouseLeave,
}: {
  row: GroupedRow;
  def: CardDef | null | undefined;
  testIdPrefix: 'friendly-graveyard' | 'opponent-graveyard';
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}): ReactElement {
  const name = def?.name ?? row.cardId;
  const cost = def?.cost ?? 0;
  const rarity = def?.rarity as Rarity | undefined;
  const tileUrl = useCardTileUrl(row.cardId);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      data-testid={`${testIdPrefix}-row`}
      data-card-id={row.cardId}
      className="relative overflow-hidden rounded text-sm border-b border-border last:border-b-0 transition-colors hover:bg-overlay-elevated hover:shadow-[inset_3px_0_0_var(--accent)]"
      onMouseEnter={() => ref.current && onMouseEnter(row.cardId, ref.current)}
      onMouseLeave={onMouseLeave}
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
      <div className="relative z-10 flex items-center px-2 py-1.5 w-full">
        <div className="w-7 h-7 rounded bg-overlay-elevated flex items-center justify-center text-text font-bold text-xs shrink-0 border border-border-hi">
          {cost}
        </div>
        <div className="flex-1 min-w-0 px-2">
          <div
            className={clsx(
              'truncate font-medium',
              rarity === 'LEGENDARY' ? 'text-rarity-legendary' : '',
              rarity === 'EPIC' ? 'text-rarity-epic' : '',
              rarity === 'RARE' ? 'text-rarity-rare' : '',
              !rarity || rarity === 'COMMON' || rarity === 'FREE' ? 'text-text' : '',
            )}
            style={NAME_TEXT_SHADOW}
            title={row.cardId}
          >
            {name}
          </div>
        </div>
        {row.count > 1 && (
          <div className="text-xs text-text font-bold shrink-0 font-mono">×{row.count}</div>
        )}
      </div>
    </div>
  );
}

function useGraveyardCardDefs(cardIds: readonly string[]): Map<string, CardDef | null> {
  const locale = useLocale();
  const idsKey = useMemo(() => cardIds.join('|'), [cardIds]);
  const [defs, setDefs] = useState<Map<string, CardDef | null>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    const ids = [...cardIds];

    if (ids.length === 0) {
      setDefs(new Map());
      return () => {
        cancelled = true;
      };
    }

    const api = window.hdt?.cards;
    if (!api) {
      setDefs(new Map(ids.map((id) => [id, null] as const)));
      return () => {
        cancelled = true;
      };
    }

    void Promise.all(
      ids.map(async (id) => {
        try {
          return [id, await api.findById(id, locale)] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    ).then((rows) => {
      if (!cancelled) setDefs(new Map(rows));
    });

    return () => {
      cancelled = true;
    };
  }, [cardIds, idsKey, locale]);

  return defs;
}

function matchesTypeFilter(
  def: CardDef | null | undefined,
  typeFilter: GraveyardTypeFilter,
): boolean {
  if (typeFilter === 'ALL') return true;
  if (def === undefined) return true;
  return def?.type === typeFilter;
}

function matchesSearch(
  def: CardDef | null | undefined,
  cardId: string,
  search: string,
): boolean {
  const q = normalizeSearchText(search);
  if (q === '') return true;
  if (def === undefined) return normalizeSearchText(cardId).includes(q);
  if (!def) return normalizeSearchText(cardId).includes(q);

  const haystack = normalizeSearchText([def.name, def.text ?? '', cardId].join(' '));
  if (haystack.includes(q)) return true;

  const legendaryQuery = q.includes('传说') || q.includes('legendary');
  return legendaryQuery && def.rarity === 'LEGENDARY' && def.type === 'MINION';
}

function normalizeSearchText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}
