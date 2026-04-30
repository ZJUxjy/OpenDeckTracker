import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { OpponentCardRecord } from '@hdt/core';
import type { CardDef } from '@hdt/hearthdb';
import { clsx } from 'clsx';
import { CardImagePopover } from './CardImagePopover';
import { useLocale, useTranslation } from '../i18n';

interface OpponentCardsPanelProps {
  revealed: OpponentCardRecord[];
  graveyard: OpponentCardRecord[];
}

interface CardDisplayDef {
  name: string;
  cost?: number;
  rarity?: string;
}

interface GroupedOpponentCard {
  cardId: string;
  count: number;
  order: number;
}

export function OpponentCardsPanel({ revealed, graveyard }: OpponentCardsPanelProps) {
  const { t } = useTranslation();
  const cardIds = useMemo(
    () => [...new Set([...revealed, ...graveyard].map((record) => record.cardId))],
    [revealed, graveyard],
  );
  const defs = useOpponentCardDefs(cardIds);
  const revealedGroups = useMemo(() => groupRecords(revealed), [revealed]);
  const graveyardGroups = useMemo(() => groupRecords(graveyard), [graveyard]);
  const isEmpty = revealedGroups.length === 0 && graveyardGroups.length === 0;
  const [popover, setPopover] = useState<{
    cardId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRowMouseEnter = useCallback((cardId: string, el: HTMLDivElement) => {
    hoverTimerRef.current = setTimeout(() => {
      setPopover({ cardId, anchorRect: el.getBoundingClientRect() });
    }, 300);
  }, []);

  const handleRowMouseLeave = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPopover(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  return (
    <aside className="w-full bg-bg-2 border border-border flex flex-col h-full shrink-0 shadow-xl rounded-lg overflow-hidden">
      <div
        className="bg-bg-2 p-3 border-b border-border cursor-move"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      >
        <div className="text-xs text-text-dim font-semibold uppercase tracking-wider mb-1">
          {t('opponent.title')}
        </div>
        <div className="text-text font-bold text-sm">{t('opponent.revealed')}</div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {isEmpty ? (
          <div className="h-full flex items-center justify-center text-text-mute text-sm px-4 text-center">
            {t('opponent.empty')}
          </div>
        ) : (
          <div className="space-y-3">
            <OpponentCardSection
              title={t('opponent.played')}
              cards={revealedGroups}
              defs={defs}
              onMouseEnter={handleRowMouseEnter}
              onMouseLeave={handleRowMouseLeave}
            />
            <OpponentCardSection
              title={t('opponent.graveyard')}
              cards={graveyardGroups}
              defs={defs}
              onMouseEnter={handleRowMouseEnter}
              onMouseLeave={handleRowMouseLeave}
            />
          </div>
        )}
      </div>
      {popover && (
        <CardImagePopover
          cardId={popover.cardId}
          anchorRect={popover.anchorRect}
          onClose={handleRowMouseLeave}
          placement="right"
        />
      )}
    </aside>
  );
}

function OpponentCardSection({
  title,
  cards,
  defs,
  onMouseEnter,
  onMouseLeave,
}: {
  title: string;
  cards: GroupedOpponentCard[];
  defs: Map<string, CardDisplayDef>;
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}) {
  if (cards.length === 0) return null;

  return (
    <section>
      <h3 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-mute">
        {title}
      </h3>
      <div className="space-y-1">
        {cards.map((card) => {
          const def = defs.get(card.cardId);
          const rarity = (def?.rarity ?? '').toLowerCase();
          return (
            <OpponentCardRow
              key={card.cardId}
              card={card}
              def={def}
              rarity={rarity}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
            />
          );
        })}
      </div>
    </section>
  );
}

function OpponentCardRow({
  card,
  def,
  rarity,
  onMouseEnter,
  onMouseLeave,
}: {
  card: GroupedOpponentCard;
  def: CardDisplayDef | undefined;
  rarity: string;
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      data-testid="opponent-card-row"
      className="flex items-center px-2 py-1.5 rounded text-sm border-b border-border last:border-b-0 transition-colors hover:bg-bg-2"
      onMouseEnter={() => ref.current && onMouseEnter(card.cardId, ref.current)}
      onMouseLeave={onMouseLeave}
    >
      <div className="w-7 h-7 rounded bg-red/15 flex items-center justify-center text-red font-bold text-xs shrink-0">
        {def?.cost ?? 0}
      </div>
      <div className="flex-1 min-w-0 px-2">
        <div
          className={clsx(
            'truncate font-medium',
            rarity === 'legendary' ? 'text-accent' : '',
            rarity === 'epic' ? 'text-purple-300' : '',
            rarity === 'rare' ? 'text-blue-300' : '',
            rarity === 'common' || rarity === 'free' || rarity === '' ? 'text-text' : '',
          )}
          title={card.cardId}
        >
          {def?.name ?? card.cardId}
        </div>
      </div>
      {card.count > 1 && (
        <div className="text-xs text-text font-bold shrink-0">x{card.count}</div>
      )}
    </div>
  );
}

function groupRecords(records: OpponentCardRecord[]): GroupedOpponentCard[] {
  const groups = new Map<string, GroupedOpponentCard>();
  for (const record of records) {
    const existing = groups.get(record.cardId);
    if (existing) {
      existing.count += 1;
      existing.order = Math.min(existing.order, record.order);
    } else {
      groups.set(record.cardId, {
        cardId: record.cardId,
        count: 1,
        order: record.order,
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.order - b.order || a.cardId.localeCompare(b.cardId));
}

function toCardDisplayDef(def: CardDef): CardDisplayDef {
  return {
    name: def.name,
    ...(def.cost !== undefined ? { cost: def.cost } : {}),
    ...(def.rarity !== undefined ? { rarity: def.rarity } : {}),
  };
}

function useOpponentCardDefs(cardIds: string[]): Map<string, CardDisplayDef> {
  const locale = useLocale();
  const [defs, setDefs] = useState<Map<string, CardDisplayDef>>(() => new Map());

  useEffect(() => {
    let alive = true;
    const ids = [...cardIds].sort((a, b) => a.localeCompare(b));
    const api = window.hdt?.cards;

    if (!api || ids.length === 0) {
      setDefs(new Map(ids.map((id) => [id, { name: id }])));
      return () => {
        alive = false;
      };
    }

    void Promise.all(ids.map(async (id) => [id, await api.findById(id, locale)] as const)).then(
      (rows) => {
        if (!alive) return;
        const next = new Map<string, CardDisplayDef>();
        for (const [id, def] of rows) {
          next.set(id, def ? toCardDisplayDef(def) : { name: id });
        }
        setDefs(next);
      },
    );

    return () => {
      alive = false;
    };
  }, [cardIds, locale]);

  return defs;
}
