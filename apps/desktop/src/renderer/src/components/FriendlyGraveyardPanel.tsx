import { useCallback, useMemo, useRef, type CSSProperties, type ReactElement } from 'react';
import type { OpponentCardRecord } from '@hdt/core';
import type { Rarity } from '@hdt/hearthdb';
import { clsx } from 'clsx';
import { useCardDef } from '../hooks/use-card-def';
import { useCardTileUrl } from '../hooks/use-card-image-url';
import { useCardPreview } from '../hooks/use-card-preview';
import { useTranslation } from '../i18n';

const NAME_TEXT_SHADOW: CSSProperties = { textShadow: '0 1px 2px rgba(0,0,0,0.7)' };
const ART_MASK_STYLE: CSSProperties = {
  maskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
};

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

/**
 * Local-side graveyard tab content. Shows cards the LOCAL player has
 * used / lost this match — strictly local, never reflects opposing
 * data (the snapshot's `friendlyGraveyard` is built from
 * `localPlayer.entities` only, so this UI inherits that guarantee).
 */
export function FriendlyGraveyardPanel({ records }: FriendlyGraveyardPanelProps): ReactElement {
  const { t } = useTranslation();
  const { onRowEnter, onRowLeave } = useCardPreview();
  const handleEnter = useCallback(
    (cardId: string, el: HTMLDivElement) => onRowEnter(cardId, el),
    [onRowEnter],
  );
  const groups = useMemo(() => groupRecords(records), [records]);

  if (groups.length === 0) {
    return (
      <div
        data-testid="friendly-graveyard-empty"
        className="h-full flex items-center justify-center text-text-mute text-sm px-4 text-center"
      >
        {t('tracker.graveyardEmpty')}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
      <div
        data-testid="friendly-graveyard-list"
        className="space-y-1"
      >
        {groups.map((g) => (
          <FriendlyGraveyardRow
            key={g.cardId}
            row={g}
            onMouseEnter={handleEnter}
            onMouseLeave={onRowLeave}
          />
        ))}
      </div>
    </div>
  );
}

function FriendlyGraveyardRow({
  row,
  onMouseEnter,
  onMouseLeave,
}: {
  row: GroupedRow;
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}): ReactElement {
  const def = useCardDef(row.cardId);
  const name = def?.name ?? row.cardId;
  const cost = def?.cost ?? 0;
  const rarity = def?.rarity as Rarity | undefined;
  const tileUrl = useCardTileUrl(row.cardId);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      data-testid="friendly-graveyard-row"
      data-card-id={row.cardId}
      className="relative overflow-hidden rounded text-sm border-b border-border last:border-b-0 transition-colors hover:bg-bg-3 hover:shadow-[inset_3px_0_0_var(--accent)]"
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
        <div className="w-7 h-7 rounded bg-bg-3 flex items-center justify-center text-text font-bold text-xs shrink-0 border border-border-hi">
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
