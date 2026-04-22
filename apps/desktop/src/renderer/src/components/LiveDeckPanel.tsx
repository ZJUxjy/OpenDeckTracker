import { useMemo, useRef } from 'react';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useCardDef } from '../hooks/use-card-def';
import { clsx } from 'clsx';

/**
 * Live "remaining cards in deck" panel — replaces the mock Decklist
 * during an active match. Driven by the `useDeckTrackerStore`
 * Zustand state populated via `deck-tracker:state` IPC pushes.
 *
 * UI states:
 *   - IDLE / no match               → "等待对局开始"
 *   - PRE_MATCH but no deck         → "正在识别卡组..."
 *   - IN_MATCH with originalDeck    → 30-card list with remaining counts
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

function DeckPanelInner({ snapshot }: DeckPanelInnerProps) {
  const deck = snapshot.deck!;

  // Track previous remaining counts to highlight cards that just got drawn.
  const prevRemainingRef = useRef<Map<string, number>>(new Map());
  const justDrawn = useMemo(() => {
    const prev = prevRemainingRef.current;
    const drawn = new Set<string>();
    for (const entry of deck.remaining) {
      const before = prev.get(entry.cardId);
      if (before !== undefined && before > entry.count) {
        drawn.add(entry.cardId);
      }
    }
    const newPrev = new Map<string, number>();
    for (const entry of deck.remaining) {
      newPrev.set(entry.cardId, entry.count);
    }
    prevRemainingRef.current = newPrev;
    return drawn;
  }, [deck.remaining]);

  const remainingByCardId = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of deck.remaining) m.set(e.cardId, e.count);
    return m;
  }, [deck.remaining]);

  const totalOriginal = deck.original.reduce((s, c) => s + c.count, 0);
  const totalRemaining = deck.remaining.reduce((s, c) => s + c.count, 0);

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
        {deck.original.map((entry) => (
          <CardRow
            key={entry.cardId}
            cardId={entry.cardId}
            originalCount={entry.count}
            remainingCount={remainingByCardId.get(entry.cardId) ?? 0}
            justDrawn={justDrawn.has(entry.cardId)}
          />
        ))}
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
    </div>
  );
}

interface CardRowProps {
  cardId: string;
  originalCount: number;
  remainingCount: number;
  justDrawn: boolean;
}

function CardRow({ cardId, originalCount, remainingCount, justDrawn }: CardRowProps) {
  const def = useCardDef(cardId);
  const used = remainingCount === 0;
  const cost = def?.cost ?? 0;
  const name = def?.name ?? cardId;
  const rarity = (def?.rarity ?? '').toLowerCase();

  return (
    <div
      className={clsx(
        'flex items-center px-2 py-1.5 rounded text-sm border-b border-[#1C1C24] last:border-b-0 transition-colors',
        used ? 'opacity-40 grayscale' : '',
        justDrawn ? 'bg-orange-500/15 ring-1 ring-orange-500/40' : '',
      )}
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
      <div className="text-xs text-slate-400 ml-2 shrink-0">
        <span className="text-white font-bold">{remainingCount}</span>
        <span className="opacity-60"> / {originalCount}</span>
      </div>
    </div>
  );
}
