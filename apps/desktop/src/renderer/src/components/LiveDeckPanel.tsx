import { useMemo, useRef, useState, useCallback, useEffect, type CSSProperties } from 'react';

const DRAG_HEADER_STYLE = { WebkitAppRegion: 'drag' } as CSSProperties;
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useCardDef } from '../hooks/use-card-def';
import { useCardTileUrl } from '../hooks/use-card-image-url';
import { useHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import { expandDeckToCopies, type DeckCopy } from '@hdt/core';
import { clsx } from 'clsx';
import { useCardPreview } from '../hooks/use-card-preview';
import { getRarityCostBg } from '../lib/rarity';
import type { Rarity } from '@hdt/hearthdb';
import { useLocale, useTranslation } from '../i18n';

const NAME_TEXT_SHADOW: CSSProperties = { textShadow: '0 1px 2px rgba(0,0,0,0.7)' };

// Mask the tile's left edge into transparency so it blends smoothly with
// the row's background — no hard gradient seam visible against bright art.
// The white bleed border that HSJSON ships on /v1/orig/ tiles is trimmed
// at cache time (see trimWhiteBorders in main/card-image-cache.ts), so
// no scale-transform crop is needed here.
const ART_MASK_STYLE: CSSProperties = {
  maskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
};

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
  const { t } = useTranslation();
  const snapshot = useDeckTrackerStore((s) => s.snapshot);
  const { isAlive } = useHearthMirrorStatus();

  // Distinguish "Hearthstone not running" (user has to launch the game)
  // from "match not started" (game is connected, waiting for queue) so
  // first-time users aren't left staring at an opaque "waiting" string
  // when there's no game running at all.
  if (!isAlive && (!snapshot || snapshot.phase === 'IDLE')) {
    return (
      <EmptyState
        message={t('deckTracker.hearthstoneNotRunning')}
        hint={t('deckTracker.hearthstoneNotRunningHint')}
      />
    );
  }

  if (!snapshot || snapshot.phase === 'IDLE') {
    return <EmptyState message={t('deckTracker.waitingForMatch')} />;
  }
  if (snapshot.phase === 'PRE_MATCH' && !snapshot.deck) {
    return <EmptyState message={t('deckTracker.loadingMatch')} />;
  }
  if (!snapshot.deck) {
    return <EmptyState message={t('deckTracker.deckNotDetected')} />;
  }

  return <DeckPanelInner snapshot={snapshot} />;
}

function EmptyState({ message, hint }: { message: string; hint?: string }) {
  const { t } = useTranslation();
  return (
    <aside className="w-full bg-bg-2 border border-border flex flex-col h-full shrink-0 shadow-xl rounded-lg overflow-hidden">
      <div className="bg-bg-2 p-3 border-b border-border cursor-move" style={DRAG_HEADER_STYLE}>
        <div className="text-xs text-text-dim font-semibold uppercase tracking-wider mb-1">
          {t('deckTracker.deck')}
        </div>
        <div className="text-text font-bold text-sm">{t('deckTracker.remainingCards')}</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-1">
        <div className="text-text-dim text-sm">{message}</div>
        {hint ? <div className="text-text-mute text-xs leading-relaxed">{hint}</div> : null}
      </div>
    </aside>
  );
}

interface DeckPanelInnerProps {
  snapshot: NonNullable<ReturnType<typeof useDeckTrackerStore.getState>['snapshot']>;
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

function DeckPanelInner({ snapshot }: DeckPanelInnerProps) {
  const { t } = useTranslation();
  const deck = snapshot.deck!;
  const friendlyBoardAttack = snapshot.boardAttack?.friendly ?? 0;
  const opposingEffectiveHealth = snapshot.opposingHero?.effectiveHealth ?? null;

  const remainingByCardId = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of deck.remaining) m.set(e.cardId, e.count);
    return m;
  }, [deck.remaining]);

  // Build card defs map for sorting and friendly-hand display.
  const friendlyHandCardIds = useMemo(
    () => snapshot.friendlyHand.filter((cardId) => cardId !== ''),
    [snapshot.friendlyHand],
  );
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

  // Hover handlers for the floating card-preview tooltip window.
  const { onRowEnter, onRowLeave } = useCardPreview();
  const handleRowMouseEnter = useCallback(
    (cardId: string, el: HTMLDivElement) => onRowEnter(cardId, el),
    [onRowEnter],
  );
  const handleRowMouseLeave = useCallback(() => onRowLeave(), [onRowLeave]);
  const handleHandAnimationEnd = useCallback(() => {}, []);

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
        <BoardAttackSummary
          attack={friendlyBoardAttack}
          opposingEffectiveHealth={opposingEffectiveHealth}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <section data-testid="remaining-cards-section">
          <h3 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-mute">
            {t('deckTracker.remaining')}
          </h3>
          <div className="space-y-1">
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
          </div>
        </section>
        {deck.extras.length > 0 && (
          <div className="mt-3 px-2 py-1 text-xs text-text-dim border-t border-border pt-2">
            {t('deckTracker.extraCards', {
              count: deck.extras.reduce((s, c) => s + c.count, 0),
            })}
          </div>
        )}
        <section data-testid="friendly-hand-section" className="mt-3 border-t border-border pt-2">
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-mute">
              {t('deckTracker.currentHand')}
            </h3>
            <span className="font-mono text-[11px] tabular-nums text-text-dim">
              {friendlyHandCardIds.length}
            </span>
          </div>
          {friendlyHandCardIds.length === 0 ? (
            <div className="rounded border border-border bg-bg px-2 py-2 text-center text-xs text-text-dim">
              {t('deckTracker.emptyHand')}
            </div>
          ) : (
            <div className="space-y-1">
              {friendlyHandCardIds.map((cardId, index) => (
                <CardCopyRow
                  key={`${cardId}-${index}`}
                  copyKey={`hand-${index}-${cardId}`}
                  cardId={cardId}
                  exiting={false}
                  testId="friendly-hand-row"
                  onAnimationEnd={handleHandAnimationEnd}
                  onMouseEnter={handleRowMouseEnter}
                  onMouseLeave={handleRowMouseLeave}
                />
              ))}
            </div>
          )}
        </section>
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

    </aside>
  );
}

function BoardAttackSummary({
  attack,
  opposingEffectiveHealth,
}: {
  attack: number;
  opposingEffectiveHealth: number | null;
}) {
  const { t } = useTranslation();
  const hasTarget = opposingEffectiveHealth !== null;
  const isLethal = hasTarget && attack >= opposingEffectiveHealth;
  const isShort = hasTarget && attack < opposingEffectiveHealth;
  const toneClass = isLethal
    ? 'border-red/40 bg-red/15 text-red shadow-sm'
    : isShort
      ? 'border-green/40 bg-green/15 text-green shadow-sm'
      : 'border-accent/30 bg-accent-dim/20 text-accent';

  return (
    <div
      data-testid="friendly-board-attack-card"
      className={clsx('mt-3 rounded border px-3 py-2', toneClass)}
      title={t('boardAttack.hint')}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wider">
          {t('boardAttack.friendly')}
        </span>
        {hasTarget ? (
          <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">
            {t('boardAttack.target', { value: opposingEffectiveHealth })}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <span
          data-testid="friendly-board-attack-value"
          className="font-mono text-3xl font-black leading-none tabular-nums"
        >
          {attack}
        </span>
        {hasTarget ? (
          <span className="pb-0.5 font-mono text-sm font-bold tabular-nums opacity-90">
            / {opposingEffectiveHealth}
          </span>
        ) : null}
      </div>
    </div>
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
  testId?: string;
  onAnimationEnd: (copyKey: string) => void;
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}

function CardCopyRow({
  copyKey,
  cardId,
  exiting,
  testId = 'card-copy-row',
  onAnimationEnd,
  onMouseEnter,
  onMouseLeave,
}: CardCopyRowProps) {
  const def = useCardDef(cardId);
  const cost = def?.cost ?? 0;
  const name = def?.name ?? cardId;
  const rarity = def?.rarity as Rarity | undefined;
  const tileUrl = useCardTileUrl(cardId);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      data-testid={testId}
      className={clsx(
        'relative overflow-hidden rounded text-sm border-b border-border last:border-b-0 transition-colors hover:bg-bg-3 hover:shadow-[inset_3px_0_0_var(--accent)]',
        exiting ? 'animate-deck-exit' : '',
      )}
      onAnimationEnd={() => onAnimationEnd(copyKey)}
      onMouseEnter={() => ref.current && onMouseEnter(cardId, ref.current)}
      onMouseLeave={onMouseLeave}
    >
      <img
        src={tileUrl}
        data-testid="card-row-art"
        alt=""
        aria-hidden
        style={ART_MASK_STYLE}
        className="absolute right-0 top-0 h-full w-3/5 object-cover object-right pointer-events-none select-none z-0"
      />
      <div className="relative z-10 flex items-center px-2 py-1.5 w-full">
        <div
          className={clsx(
            'w-7 h-7 rounded flex items-center justify-center font-bold text-xs shrink-0',
            getRarityCostBg(rarity),
          )}
        >
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
            title={cardId}
          >
            {name}
          </div>
        </div>
      </div>
    </div>
  );
}
