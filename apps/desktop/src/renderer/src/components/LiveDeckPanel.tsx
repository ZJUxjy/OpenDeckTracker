import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useCardDef } from '../hooks/use-card-def';
import { expandDeckToCopies, type DeckCopy } from '@hdt/core';
import { clsx } from 'clsx';
import { CardImagePopover } from './CardImagePopover';

/**
 * Live "remaining cards in deck" panel — replaces the mock Decklist
 * during an active match. Driven by the `useDeckTrackerStore`
 * Zustand state populated via `deck-tracker:state` IPC pushes.
 *
 * UI states:
 *   - IDLE / no match               → "等待对局开始"
 *   - PRE_MATCH but no deck         → "正在识别卡组..."
 *   - IN_MATCH with originalDeck    → per-copy rows with draw animations
 *   - error                          → small error banner above list
 */
export function LiveDeckPanel() {
  const snapshot = useDeckTrackerStore((s) => s.snapshot);

  if (!snapshot || snapshot.phase === 'IDLE') {
    return <EmptyState message="等待对局开始..." />;
  }
  if (snapshot.phase === 'PRE_MATCH' && !snapshot.deck) {
    return <EmptyState message="正在加载对局信息..." />;
  }
  if (!snapshot.deck) {
    return <EmptyState message="未识别到当前卡组（可在弹窗中手动选择）" />;
  }

  return <DeckPanelInner snapshot={snapshot} />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="w-[280px] bg-[#12121A] border border-[#2A2A35] flex flex-col h-full shrink-0 shadow-xl rounded-lg overflow-hidden">
      <div className="bg-[#1C1C24] p-3 border-b border-[#2A2A35]">
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">
          实时记牌器
        </div>
        <div className="text-white font-bold text-sm opacity-70">未在对局中</div>
      </div>
      <div className="flex-1 flex items-center justify-center text-slate-500 text-sm px-4 text-center">
        {message}
      </div>
    </div>
  );
}

interface DeckPanelInnerProps {
  snapshot: NonNullable<ReturnType<typeof useDeckTrackerStore.getState>['snapshot']>;
}

/** Sort comparator: cost ↑, name ↑, cardId ↑. Missing cost displays as 0. */
function compareDeckCopies(
  a: DeckCopy,
  b: DeckCopy,
  defs: Map<string, { name: string; cost?: number }>,
): number {
  const defA = defs.get(a.cardId);
  const defB = defs.get(b.cardId);
  const costA = defA?.cost ?? 0;
  const costB = defB?.cost ?? 0;
  if (costA !== costB) return costA - costB;
  const nameA = defA?.name ?? a.cardId;
  const nameB = defB?.name ?? b.cardId;
  if (nameA < nameB) return -1;
  if (nameA > nameB) return 1;
  return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : a.ordinal - b.ordinal;
}

function DeckPanelInner({ snapshot }: DeckPanelInnerProps) {
  const deck = snapshot.deck!;

  const remainingByCardId = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of deck.remaining) m.set(e.cardId, e.count);
    return m;
  }, [deck.remaining]);

  // Build card defs map for sorting
  const cardIds = useMemo(
    () => [...new Set([...deck.original, ...deck.remaining].map((e) => e.cardId))],
    [deck.original, deck.remaining],
  );
  const cardDefs = useCardDefs(cardIds);

  const totalOriginal = deck.original.reduce((s, c) => s + c.count, 0);
  const totalRemaining = deck.remaining.reduce((s, c) => s + c.count, 0);

  // Expand current remaining deck to physical copies so shuffled-in cards
  // absent from the original deck can render as real rows.
  const remainingCount = remainingByCardId;
  const copies = useMemo(() => {
    const visible = expandDeckToCopies(deck.remaining);
    // Sort using card definitions
    visible.sort((a, b) => compareDeckCopies(a, b, cardDefs));
    return visible;
  }, [deck.remaining, cardDefs]);

  // Track exiting copy keys for draw animation.
  // IMPORTANT: compare against previous map keys so cards that drop to 0
  // (and disappear from `remaining`) still get an exit animation.
  const prevRemainingRef = useRef<Map<string, number>>(new Map());
  const [exitingCopyKeys, setExitingCopyKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    const prev = prevRemainingRef.current;
    // First render for this panel state: seed baseline and skip animation.
    if (prev.size === 0) {
      prevRemainingRef.current = new Map(remainingCount);
      return;
    }

    setExitingCopyKeys((current) => {
      const next = new Set(current);
      for (const [cardId, prevCount] of prev.entries()) {
        const nowCount = remainingCount.get(cardId) ?? 0;
        if (prevCount > nowCount) {
          const delta = prevCount - nowCount;
          for (let i = 0; i < delta; i++) {
            const ordinal = prevCount - 1 - i;
            next.add(`${cardId}#${ordinal}`);
          }
        }
      }
      return next;
    });

    prevRemainingRef.current = new Map(remainingCount);
  }, [remainingCount]);

  const handleAnimationEnd = useCallback((copyKey: string) => {
    setExitingCopyKeys((prev) => {
      const next = new Set(prev);
      next.delete(copyKey);
      return next;
    });
  }, []);

  // Hover state for card image popover
  const [popover, setPopover] = useState<{
    cardId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRowMouseEnter = useCallback(
    (cardId: string, el: HTMLDivElement) => {
      hoverTimerRef.current = setTimeout(() => {
        setPopover({ cardId, anchorRect: el.getBoundingClientRect() });
      }, 300);
    },
    [],
  );
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
    <div className="w-[280px] bg-[#12121A] border border-[#2A2A35] flex flex-col h-full shrink-0 shadow-xl rounded-lg overflow-hidden">
      <div className="bg-[#1C1C24] p-3 border-b border-[#2A2A35]">
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">
          实时记牌器
        </div>
        <div className="text-white font-bold flex justify-between items-center">
          <span className="truncate max-w-[180px]" title={deck.name || '未命名卡组'}>
            {deck.name || '未命名卡组'}
          </span>
          <span className="text-orange-400 text-sm">
            {totalRemaining} / {totalOriginal}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-[#2A2A35] scrollbar-track-transparent">
        {copies.map((copy) => (
          <CardCopyRow
            key={copy.copyKey}
            copyKey={copy.copyKey}
            cardId={copy.cardId}
            exiting={exitingCopyKeys.has(copy.copyKey)}
            onAnimationEnd={handleAnimationEnd}
            onMouseEnter={handleRowMouseEnter}
            onMouseLeave={handleRowMouseLeave}
          />
        ))}
        {/* Render exiting rows (with animation class, invisible to copies list) */}
        {[...exitingCopyKeys]
          .filter((key) => !copies.some((c) => c.copyKey === key))
          .map((copyKey) => {
            const cardId = copyKey.split('#')[0]!;
            return (
              <CardCopyRow
                key={copyKey}
                copyKey={copyKey}
                cardId={cardId}
                exiting={true}
                onAnimationEnd={handleAnimationEnd}
                onMouseEnter={handleRowMouseEnter}
                onMouseLeave={handleRowMouseLeave}
              />
            );
          })}
        {deck.extras.length > 0 && (
          <div className="mt-3 px-2 py-1 text-xs text-blue-300/80 border-t border-[#2A2A35] pt-2">
            +{deck.extras.reduce((s, c) => s + c.count, 0)} 张额外卡牌（生成/偷取）
          </div>
        )}
      </div>

      <div className="bg-[#1C1C24] p-3 border-t border-[#2A2A35] flex justify-between items-center text-xs text-slate-400">
        <div>
          手牌 {snapshot.friendlyHand.length} · 对手 {snapshot.opposingHandCount}
        </div>
        <div className="text-orange-500/80 font-medium">
          {snapshot.error ? '错误' : 'LIVE'}
        </div>
      </div>

      {popover && (
        <CardImagePopover
          cardId={popover.cardId}
          anchorRect={popover.anchorRect}
          onClose={handleRowMouseLeave}
        />
      )}
    </div>
  );
}

/**
 * Hook to collect card definitions for all cardIds. Returns a Map
 * keyed by cardId with name/cost for sorting.
 */
function useCardDefs(cardIds: string[]): Map<string, { name: string; cost?: number }> {
  const [defs, setDefs] = useState<Map<string, { name: string; cost?: number }>>(
    () => new Map(),
  );

  useEffect(() => {
    let alive = true;
    const ids = [...cardIds].sort((a, b) => a.localeCompare(b));
    const api = window.hdt?.cards;

    if (!api || ids.length === 0) {
      const fallback = new Map<string, { name: string; cost?: number }>();
      for (const id of ids) {
        fallback.set(id, { name: id });
      }
      setDefs(fallback);
      return () => {
        alive = false;
      };
    }

    void Promise.all(ids.map(async (id) => [id, await api.findById(id)] as const)).then(
      (rows) => {
        if (!alive) return;
        const next = new Map<string, { name: string; cost?: number }>();
        for (const [id, def] of rows) {
          if (def) {
            if (def.cost !== undefined) {
              next.set(id, { name: def.name, cost: def.cost });
            } else {
              next.set(id, { name: def.name });
            }
          } else {
            next.set(id, { name: id });
          }
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

interface CardCopyRowProps {
  copyKey: string;
  cardId: string;
  exiting: boolean;
  onAnimationEnd: (copyKey: string) => void;
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}

function CardCopyRow({
  copyKey,
  cardId,
  exiting,
  onAnimationEnd,
  onMouseEnter,
  onMouseLeave,
}: CardCopyRowProps) {
  const def = useCardDef(cardId);
  const cost = def?.cost ?? 0;
  const name = def?.name ?? cardId;
  const rarity = (def?.rarity ?? '').toLowerCase();
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      data-testid="card-copy-row"
      className={clsx(
        'flex items-center px-2 py-1.5 rounded text-sm border-b border-[#1C1C24] last:border-b-0 transition-colors',
        exiting ? 'animate-deck-exit' : '',
      )}
      style={exiting ? undefined : undefined}
      onAnimationEnd={() => onAnimationEnd(copyKey)}
      onMouseEnter={() => ref.current && onMouseEnter(cardId, ref.current)}
      onMouseLeave={onMouseLeave}
    >
      <div className="w-7 h-7 rounded bg-blue-700/40 flex items-center justify-center text-blue-100 font-bold text-xs shrink-0">
        {cost}
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
          title={cardId}
        >
          {name}
        </div>
      </div>
    </div>
  );
}
