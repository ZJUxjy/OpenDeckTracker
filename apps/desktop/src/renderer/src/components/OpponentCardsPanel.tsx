import { useEffect, useMemo, useState } from 'react';
import type { OpponentCardRecord } from '@hdt/core';
import type { CardDef } from '@hdt/hearthdb';
import { clsx } from 'clsx';

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
  const cardIds = useMemo(
    () => [...new Set([...revealed, ...graveyard].map((record) => record.cardId))],
    [revealed, graveyard],
  );
  const defs = useOpponentCardDefs(cardIds);
  const revealedGroups = useMemo(() => groupRecords(revealed), [revealed]);
  const graveyardGroups = useMemo(() => groupRecords(graveyard), [graveyard]);
  const isEmpty = revealedGroups.length === 0 && graveyardGroups.length === 0;

  return (
    <aside className="w-[260px] bg-[#12121A] border border-[#2A2A35] flex flex-col h-full shrink-0 shadow-xl rounded-lg overflow-hidden">
      <div className="bg-[#1C1C24] p-3 border-b border-[#2A2A35]">
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">
          Opponent
        </div>
        <div className="text-white font-bold text-sm">Revealed Cards</div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-[#2A2A35] scrollbar-track-transparent">
        {isEmpty ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm px-4 text-center">
            No opponent cards revealed
          </div>
        ) : (
          <div className="space-y-3">
            <OpponentCardSection title="Played" cards={revealedGroups} defs={defs} />
            <OpponentCardSection title="Graveyard" cards={graveyardGroups} defs={defs} />
          </div>
        )}
      </div>
    </aside>
  );
}

function OpponentCardSection({
  title,
  cards,
  defs,
}: {
  title: string;
  cards: GroupedOpponentCard[];
  defs: Map<string, CardDisplayDef>;
}) {
  if (cards.length === 0) return null;

  return (
    <section>
      <h3 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      <div className="space-y-1">
        {cards.map((card) => {
          const def = defs.get(card.cardId);
          const rarity = (def?.rarity ?? '').toLowerCase();
          return (
            <div
              key={card.cardId}
              className="flex items-center px-2 py-1.5 rounded text-sm border-b border-[#1C1C24] last:border-b-0"
            >
              <div className="w-7 h-7 rounded bg-red-900/40 flex items-center justify-center text-red-100 font-bold text-xs shrink-0">
                {def?.cost ?? 0}
              </div>
              <div className="flex-1 min-w-0 px-2">
                <div
                  className={clsx(
                    'truncate font-medium',
                    rarity === 'legendary' ? 'text-orange-300' : '',
                    rarity === 'epic' ? 'text-purple-300' : '',
                    rarity === 'rare' ? 'text-blue-300' : '',
                    rarity === 'common' || rarity === 'free' || rarity === '' ? 'text-slate-200' : '',
                  )}
                  title={card.cardId}
                >
                  {def?.name ?? card.cardId}
                </div>
              </div>
              {card.count > 1 && (
                <div className="text-xs text-slate-300 font-bold shrink-0">x{card.count}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
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

    void Promise.all(ids.map(async (id) => [id, await api.findById(id)] as const)).then(
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
  }, [cardIds]);

  return defs;
}
