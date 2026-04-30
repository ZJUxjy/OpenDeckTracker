import { useMemo, useRef, useState, useCallback, useEffect, type CSSProperties } from 'react';

const DRAG_HEADER_STYLE = { WebkitAppRegion: 'drag' } as CSSProperties;
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useCardDef } from '../hooks/use-card-def';
import { expandDeckToCopies, type DeckCopy } from '@hdt/core';
import { clsx } from 'clsx';
import { CardImagePopover } from './CardImagePopover';
import { CardPips } from './CardPips';
import { useLocale, useTranslation } from '../i18n';

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
export function LiveDeckPanel({ compact = false }: { compact?: boolean } = {}) {
  const { t } = useTranslation();
  const snapshot = useDeckTrackerStore((s) => s.snapshot);

  if (!snapshot || snapshot.phase === 'IDLE') {
    return <EmptyState message={t('deckTracker.waitingForMatch')} />;
  }
  if (snapshot.phase === 'PRE_MATCH' && !snapshot.deck) {
    return <EmptyState message={t('deckTracker.loadingMatch')} />;
  }
  if (!snapshot.deck) {
    return <EmptyState message={t('deckTracker.deckNotDetected')} />;
  }

  return <DeckPanelInner snapshot={snapshot} compact={compact} />;
}

function EmptyState({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <aside className="w-full bg-bg-2 border border-border flex flex-col h-full shrink-0 shadow-xl rounded-lg overflow-hidden">
      <div className="bg-bg-2 p-3 border-b border-border cursor-move" style={DRAG_HEADER_STYLE}>
        <div className="text-xs text-text-dim font-semibold uppercase tracking-wider mb-1">
          {t('deckTracker.deck')}
        </div>
        <div className="text-text font-bold text-sm">{t('deckTracker.remainingCards')}</div>
      </div>
      <div className="flex-1 flex items-center justify-center text-text-mute text-sm px-4 text-center">
        {message}
      </div>
    </aside>
  );
}

interface DeckPanelInnerProps {
  snapshot: NonNullable<ReturnType<typeof useDeckTrackerStore.getState>['snapshot']>;
  compact: boolean;
}

/** Compare two cardIds by (cost ↑, name ↑, cardId ↑). Returns 0 on full tie. */
function compareByCardDef(
  aCardId: string,
  bCardId: string,
  defs: Map<string, { name: string; cost?: number }>,
): number {
  const defA = defs.get(aCardId);
  const defB = defs.get(bCardId);
  const costA = defA?.cost ?? 0;
  const costB = defB?.cost ?? 0;
  if (costA !== costB) return costA - costB;
  const nameA = defA?.name ?? aCardId;
  const nameB = defB?.name ?? bCardId;
  if (nameA < nameB) return -1;
  if (nameA > nameB) return 1;
  return aCardId < bCardId ? -1 : aCardId > bCardId ? 1 : 0;
}

/** Sort comparator: cost ↑, name ↑, cardId ↑, ordinal ↑ (stable per-copy ordering). */
function compareDeckCopies(
  a: DeckCopy,
  b: DeckCopy,
  defs: Map<string, { name: string; cost?: number }>,
): number {
  const cmp = compareByCardDef(a.cardId, b.cardId, defs);
  return cmp !== 0 ? cmp : a.ordinal - b.ordinal;
}

function DeckPanelInner({ snapshot, compact }: DeckPanelInnerProps) {
  const { t } = useTranslation();
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

  // Compact variant: original copy count per cardId and sorted remaining entries.
  const originalCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of deck.original) m.set(e.cardId, e.count);
    return m;
  }, [deck.original]);

  const compactEntries = useMemo(() => {
    if (!compact) return [];
    // Include entries from original that are no longer in remaining (count=0)
    const remainingMap = new Map<string, number>();
    for (const e of deck.remaining) remainingMap.set(e.cardId, e.count);
    const allCardIds = new Set<string>();
    for (const e of deck.original) allCardIds.add(e.cardId);
    for (const e of deck.remaining) allCardIds.add(e.cardId);
    const entries = [...allCardIds].map((cardId) => ({
      cardId,
      count: remainingMap.get(cardId) ?? 0,
    }));
    entries.sort((a, b) => compareByCardDef(a.cardId, b.cardId, cardDefs));
    return entries;
  }, [compact, deck.original, deck.remaining, cardDefs]);

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
    <aside className="w-full bg-bg-2 border border-border flex flex-col h-full shrink-0 shadow-xl rounded-lg overflow-hidden">
      <div className="bg-bg-2 p-3 border-b border-border cursor-move" style={DRAG_HEADER_STYLE}>
        <div className="text-xs text-text-dim font-semibold uppercase tracking-wider mb-1">
          {t('deckTracker.deck')}
        </div>
        <div className="text-text font-bold text-sm flex justify-between items-center gap-3">
          <span className="truncate" title={deck.name || t('deckTracker.unnamedDeck')}>
            {deck.name || t('deckTracker.unnamedDeck')}
          </span>
          <span className="text-accent text-xs shrink-0 font-mono tabular-nums">
            {totalRemaining} / {totalOriginal}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <section>
          <h3 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-mute">
            {t('deckTracker.remaining')}
          </h3>
          <div className="space-y-1">
            {compact
              ? compactEntries.map((entry) => (
                  <CompactCardRow
                    key={entry.cardId}
                    cardId={entry.cardId}
                    remaining={entry.count}
                    max={Math.max(originalCountMap.get(entry.cardId) ?? 0, entry.count)}
                    onMouseEnter={handleRowMouseEnter}
                    onMouseLeave={handleRowMouseLeave}
                  />
                ))
              : copies.map((copy) => (
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
            {!compact &&
              [...exitingCopyKeys]
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
          </div>
        </section>
        {deck.extras.length > 0 && (
          <div className="mt-3 px-2 py-1 text-xs text-text-dim border-t border-border pt-2">
            {t('deckTracker.extraCards', {
              count: deck.extras.reduce((s, c) => s + c.count, 0),
            })}
          </div>
        )}
      </div>

      <div className="bg-bg-2 p-3 border-t border-border flex justify-between items-center text-xs text-text-dim">
        <div>
          {t('deckTracker.handAndOpponent', {
            hand: snapshot.friendlyHand.length,
            opponent: snapshot.opposingHandCount,
          })}
        </div>
        <div className="text-accent/80 font-medium">
          {snapshot.error ? t('deckTracker.error') : t('deckTracker.live')}
        </div>
      </div>

      {popover && (
        <CardImagePopover
          cardId={popover.cardId}
          anchorRect={popover.anchorRect}
          onClose={handleRowMouseLeave}
        />
      )}
    </aside>
  );
}

/**
 * Hook to collect card definitions for all cardIds. Returns a Map
 * keyed by cardId with name/cost for sorting.
 */
function useCardDefs(cardIds: string[]): Map<string, { name: string; cost?: number }> {
  const locale = useLocale();
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

    void Promise.all(ids.map(async (id) => [id, await api.findById(id, locale)] as const)).then(
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
  }, [cardIds, locale]);

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
        'flex items-center px-2 py-1.5 rounded text-sm border-b border-border last:border-b-0 transition-colors hover:bg-bg-2',
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
            rarity === 'legendary' ? 'text-accent' : '',
            rarity === 'epic' ? 'text-purple-300' : '',
            rarity === 'rare' ? 'text-blue-300' : '',
            rarity === 'common' || rarity === 'free' || rarity === '' ? 'text-text' : '',
          )}
          title={cardId}
        >
          {name}
        </div>
      </div>
    </div>
  );
}

interface CompactCardRowProps {
  cardId: string;
  remaining: number;
  max: number;
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}

function CompactCardRow({
  cardId,
  remaining,
  max,
  onMouseEnter,
  onMouseLeave,
}: CompactCardRowProps) {
  const def = useCardDef(cardId);
  const cost = def?.cost ?? 0;
  const name = def?.name ?? cardId;
  const ref = useRef<HTMLDivElement>(null);
  const spent = remaining === 0;

  return (
    <div
      ref={ref}
      data-testid="card-compact-row"
      className={clsx(
        'flex items-center px-2 py-1.5 rounded text-sm border-b border-border last:border-b-0 transition-colors hover:bg-bg-2',
        spent ? 'opacity-40' : '',
      )}
      onMouseEnter={() => ref.current && onMouseEnter(cardId, ref.current)}
      onMouseLeave={onMouseLeave}
    >
      <div className="w-7 h-7 rounded bg-blue-700/40 flex items-center justify-center text-blue-100 font-bold text-xs shrink-0">
        {cost}
      </div>
      <div className="flex-1 min-w-0 px-2">
        <div className="truncate font-medium text-text" title={cardId}>
          {name}
        </div>
      </div>
      <CardPips remaining={remaining} max={max} />
    </div>
  );
}
