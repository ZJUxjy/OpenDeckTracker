import { useMemo, useRef, useState, useCallback, useEffect, type CSSProperties } from 'react';

const DRAG_HEADER_STYLE = { WebkitAppRegion: 'drag' } as CSSProperties;
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useCardDef } from '../hooks/use-card-def';
import { useCardTileUrl } from '../hooks/use-card-image-url';
import { useHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import { expandDeckToCopies, type DeckCopy, type DeckTrackerSnapshot } from '@hdt/core';
import { clsx } from 'clsx';
import { Gift } from 'lucide-react';
import { useCardPreview, type RowPreviewRequest } from '../hooks/use-card-preview';
import { getRarityCostBg } from '../lib/rarity';
import type { CardDef, Rarity } from '@hdt/hearthdb';
import { useLocale, useTranslation } from '../i18n';
import {
  getExtraDisplayCandidate,
  getOnBoardTriggerCandidates,
  type ExtraDisplayCandidate,
} from '../lib/extra-display-candidates';
import { getStaticHoverPoolCardIds } from '../lib/card-preview-specials';
import { partitionAnimalCompanionEffects } from '../lib/animal-companion-effects';

const NAME_TEXT_SHADOW: CSSProperties = { textShadow: '0 1px 2px rgba(0,0,0,0.7)' };
const DEFAULT_ANIMAL_COMPANION_POOL_CARD_IDS = ['NEW1_032', 'NEW1_033', 'NEW1_034'];
const ANIMAL_COMPANION_POOL_PREVIEW_CARD_IDS = new Set([
  'NEW1_031',
  'CORE_NEW1_031',
  'VAN_NEW1_031',
  'OG_211',
  'CORE_OG_211',
  'MEND_300',
  'MEND_301',
  'MEND_303',
  'MEND_304',
  'MEND_307',
  'EDR_853',
]);
const RANGER_SYLVANAS_CARD_IDS = new Set(['TIME_609', 'TIME_609t1', 'TIME_609t2']);
const STRANGE_DOG_TRAINER_CARD_ID = 'EDR_226';

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
    <aside className="tavern-overlay-panel-inner w-full bg-overlay-surface border border-border flex flex-col h-full shrink-0 shadow-xl rounded-lg overflow-hidden">
      <div className="tavern-overlay-header bg-overlay-surface p-3 border-b border-border cursor-move" style={DRAG_HEADER_STYLE}>
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
  const friendlyFaceDamage = snapshot.boardAttackToFace?.friendly ?? friendlyBoardAttack;
  const opposingEffectiveHealth = snapshot.opposingHero?.effectiveHealth ?? null;

  const remainingByCardId = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of deck.remaining) m.set(e.cardId, e.count);
    return m;
  }, [deck.remaining]);
  const extraRemainingByCardId = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of deck.extraRemaining ?? []) m.set(e.cardId, e.count);
    return m;
  }, [deck.extraRemaining]);

  // Build card defs map for sorting and friendly-hand display.
  const friendlyHandRows = useMemo(
    () =>
      snapshot.friendlyHand
        .map((cardId, index) => ({
          cardId,
          isExtraCard: snapshot.friendlyHandExtras?.[index] ?? false,
        }))
        .filter((row) => row.cardId !== ''),
    [snapshot.friendlyHand, snapshot.friendlyHandExtras],
  );
  const cardIds = useMemo(
    () => [...new Set([...deck.original, ...deck.remaining].map((e) => e.cardId))],
    [deck.original, deck.remaining],
  );
  const cardDefs = useCardDefs(cardIds);
  const animalCompanionPoolCardIds = useMemo(
    () => resolveCurrentAnimalCompanionPool(snapshot.friendlyEffects),
    [snapshot.friendlyEffects],
  );

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
  const [hoveredRelatedSourceCardId, setHoveredRelatedSourceCardId] = useState<string | null>(null);
  const handleRowMouseEnter = useCallback(
    (cardId: string, request: RowPreviewRequest, el: HTMLDivElement) => {
      setHoveredRelatedSourceCardId(cardId);
      onRowEnter(request, el);
    },
    [onRowEnter],
  );
  const handleRowMouseLeave = useCallback(() => {
    setHoveredRelatedSourceCardId(null);
    onRowLeave();
  }, [onRowLeave]);
  const handleHandAnimationEnd = useCallback(() => {}, []);

  return (
    <aside className="tavern-overlay-panel-inner w-full bg-overlay-surface border border-border flex flex-col h-full shrink-0 shadow-xl rounded-lg overflow-hidden">
      <div className="tavern-overlay-header bg-overlay-surface p-3 border-b border-border cursor-move" style={DRAG_HEADER_STYLE}>
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
          faceDamage={friendlyFaceDamage}
          opposingEffectiveHealth={opposingEffectiveHealth}
        />
      </div>

      <div
        data-overlay-list-area
        className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
      >
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
                extraDisplay={snapshot.extraDisplay}
                animalCompanionPoolCardIds={animalCompanionPoolCardIds}
                hoveredRelatedSourceCardId={hoveredRelatedSourceCardId}
                isExtraCard={isExtraRemainingCopy(copy, remainingByCardId, extraRemainingByCardId)}
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
                    extraDisplay={snapshot.extraDisplay}
                    animalCompanionPoolCardIds={animalCompanionPoolCardIds}
                    hoveredRelatedSourceCardId={hoveredRelatedSourceCardId}
                    isExtraCard={isExtraRemainingCopy(
                      { cardId, ordinal: Number(copyKey.split('#')[1] ?? 0) },
                      remainingByCardId,
                      extraRemainingByCardId,
                    )}
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
              {friendlyHandRows.length}
            </span>
          </div>
          {friendlyHandRows.length === 0 ? (
            <div className="tavern-empty-row rounded border border-border bg-overlay-elevated backdrop-blur-xl px-2 py-2 text-center text-xs text-text-dim">
              {t('deckTracker.emptyHand')}
            </div>
          ) : (
            <div className="space-y-1">
              {friendlyHandRows.map((row, index) => (
                <CardCopyRow
                  key={`${row.cardId}-${index}`}
                  copyKey={`hand-${index}-${row.cardId}`}
                  cardId={row.cardId}
                  exiting={false}
                  testId="friendly-hand-row"
                  onAnimationEnd={handleHandAnimationEnd}
                  onMouseEnter={handleRowMouseEnter}
                  onMouseLeave={handleRowMouseLeave}
                  extraDisplay={snapshot.extraDisplay}
                  animalCompanionPoolCardIds={animalCompanionPoolCardIds}
                  hoveredRelatedSourceCardId={hoveredRelatedSourceCardId}
                  isExtraCard={row.isExtraCard}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="tavern-overlay-footer bg-overlay-surface p-3 border-t border-border flex justify-between items-center text-xs text-text-dim">
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
  faceDamage,
  opposingEffectiveHealth,
}: {
  attack: number;
  faceDamage: number;
  opposingEffectiveHealth: number | null;
}) {
  const { t } = useTranslation();
  const hasTarget = opposingEffectiveHealth !== null;
  // Lethal vs. short coloring is driven by the face-damage number — that
  // is the value that actually compares against the opposing hero's HP.
  const isLethal = hasTarget && faceDamage >= opposingEffectiveHealth;
  const isShort = hasTarget && faceDamage < opposingEffectiveHealth;
  const toneClass = isLethal
    ? 'border-red/40 bg-red/15 text-red shadow-sm'
    : isShort
      ? 'border-green/40 bg-green/15 text-green shadow-sm'
      : 'border-accent/30 bg-accent-dim/20 text-accent';

  return (
    <div
      data-testid="friendly-board-attack-card"
      data-tone={isLethal ? 'danger' : isShort ? 'success' : 'neutral'}
      className={clsx('tavern-board-card mt-3 rounded border px-3 py-2', toneClass)}
      title={t('boardAttack.hint')}
    >
      <div className="text-[11px] font-bold uppercase tracking-wider">
        {t('boardAttack.friendly')}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <span
          data-testid="friendly-board-attack-value"
          className="font-mono text-3xl font-black leading-none tabular-nums"
        >
          {attack}
        </span>
        <FaceDamageChip
          faceDamage={faceDamage}
          rawAttack={attack}
          target={opposingEffectiveHealth}
          dataTestId="friendly-face-damage-value"
        />
      </div>
    </div>
  );
}

/**
 * Compact "to face" chip rendered to the right of the big raw-attack
 * number. The raw board attack stays the visual hero of the card; this
 * chip carries the after-taunt face-damage value plus the opposing
 * hero's effective HP. Pairing the `/ HP` slash with face damage (not
 * with raw attack) eliminates the misread that "raw / HP" implied a
 * fraction relationship.
 */
function FaceDamageChip({
  faceDamage,
  rawAttack,
  target,
  dataTestId,
}: {
  faceDamage: number;
  rawAttack: number;
  target: number | null;
  dataTestId: string;
}) {
  const { t } = useTranslation();
  // When face equals raw, taunts/shields aren't filtering anything — the
  // chip is informational rather than corrective, so we soften it.
  const isInformational = faceDamage === rawAttack;
  return (
    <span
      className={clsx(
        'tavern-face-chip inline-flex items-baseline gap-1.5 rounded-md border border-current/30 bg-current/10 px-2 py-1',
        isInformational ? 'opacity-75' : 'opacity-100',
      )}
      title={t('boardAttack.faceHint')}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
        {t('boardAttack.face')}
      </span>
      <span
        data-testid={dataTestId}
        className="font-mono text-base font-black leading-none tabular-nums"
      >
        {faceDamage}
      </span>
      {target !== null ? (
        <span className="font-mono text-[11px] font-bold tabular-nums opacity-70">
          / {target}
        </span>
      ) : null}
    </span>
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

function resolveCurrentAnimalCompanionPool(
  effects: DeckTrackerSnapshot['friendlyEffects'],
): string[] {
  const summary = partitionAnimalCompanionEffects(effects).summary;
  const replacementPool = summary?.poolReplacement?.pool ?? [];
  return replacementPool.length > 0
    ? [...replacementPool]
    : [...DEFAULT_ANIMAL_COMPANION_POOL_CARD_IDS];
}

function isExtraRemainingCopy(
  copy: Pick<DeckCopy, 'cardId' | 'ordinal'>,
  remainingByCardId: ReadonlyMap<string, number>,
  extraRemainingByCardId: ReadonlyMap<string, number>,
): boolean {
  const extraCount = extraRemainingByCardId.get(copy.cardId) ?? 0;
  if (extraCount <= 0) return false;
  const totalCount = remainingByCardId.get(copy.cardId) ?? 0;
  return copy.ordinal >= Math.max(0, totalCount - extraCount);
}

interface CardCopyRowProps {
  copyKey: string;
  cardId: string;
  exiting: boolean;
  testId?: string;
  isExtraCard?: boolean;
  extraDisplay?: DeckTrackerSnapshot['extraDisplay'];
  animalCompanionPoolCardIds: readonly string[];
  hoveredRelatedSourceCardId?: string | null;
  onAnimationEnd: (copyKey: string) => void;
  onMouseEnter: (cardId: string, request: RowPreviewRequest, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}

function CardCopyRow({
  copyKey,
  cardId,
  exiting,
  testId = 'card-copy-row',
  isExtraCard = false,
  extraDisplay,
  animalCompanionPoolCardIds,
  hoveredRelatedSourceCardId,
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
  const rowExtra = buildRowExtraDisplay(cardId, def, extraDisplay, animalCompanionPoolCardIds);
  const hoverRelatedHighlight = matchesHoverRelatedHighlight(def, hoveredRelatedSourceCardId);
  const isExtraDisplayActive =
    rowExtra.poolCardIds.length > 0 ||
    rowExtra.extraLines.length > 0 ||
    rowExtra.highlight ||
    hoverRelatedHighlight;
  const previewRequest: RowPreviewRequest =
    rowExtra.poolCardIds.length > 0 || rowExtra.extraLines.length > 0
    ? {
        cardId,
        poolCardIds: rowExtra.poolCardIds,
        extra: { title: name, lines: rowExtra.extraLines },
      }
    : cardId;

  return (
    <div
      ref={ref}
      data-testid={testId}
      data-extra-display={isExtraDisplayActive ? 'active' : 'none'}
      data-extra-preview={rowExtra.poolCardIds.length > 0 ? 'pool' : rowExtra.extraLines.length > 0 ? 'extra' : 'card'}
      data-row-state={exiting ? 'exiting' : 'ready'}
      className={clsx(
        'tavern-card-row relative overflow-hidden rounded text-sm border-b border-border last:border-b-0 transition-colors hover:bg-overlay-elevated hover:shadow-[inset_3px_0_0_var(--accent)]',
        exiting ? 'animate-deck-exit' : '',
        rowExtra.highlight || hoverRelatedHighlight ? 'ring-1 ring-accent/70 bg-accent-dim/20 shadow-[inset_3px_0_0_var(--accent)]' : '',
      )}
      title={name}
      onAnimationEnd={() => onAnimationEnd(copyKey)}
      onMouseEnter={() => ref.current && onMouseEnter(cardId, previewRequest, ref.current)}
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
            'tavern-mana-gem w-7 h-7 rounded flex items-center justify-center font-bold text-xs shrink-0',
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
          >
            {name}
          </div>
        </div>
        {isExtraCard ? (
          <div
            data-testid="card-extra-origin-icon"
            className="relative z-20 ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-amber-300/80 bg-black/60 text-amber-300 shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
            title="套牌外卡牌"
            aria-label="套牌外卡牌"
          >
            <Gift className="h-3.5 w-3.5" strokeWidth={2.4} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface RowExtraDisplay {
  poolCardIds: string[];
  extraLines: string[];
  highlight: boolean;
}

function buildRowExtraDisplay(
  cardId: string,
  def: CardDef | null | undefined,
  extraDisplay: DeckTrackerSnapshot['extraDisplay'] | undefined,
  animalCompanionPoolCardIds: readonly string[],
): RowExtraDisplay {
  const isAnimalCompanionPoolPreview = isAnimalCompanionPoolPreviewCard(cardId);
  const isRangerSylvanasPreview = isRangerSylvanasCard(cardId);
  const candidate =
    isAnimalCompanionPoolPreview || isRangerSylvanasPreview
      ? null
      : getExtraDisplayCandidate(cardId);
  const hasTrackedState = candidate ? hasTrackedExtraDisplayState(candidate, extraDisplay) : false;
  const dynamicPoolCardIds = isAnimalCompanionPoolPreview
    ? [...animalCompanionPoolCardIds]
    : isRangerSylvanasPreview
      ? resolveRangerSylvanasPlayedPool(extraDisplay)
      : candidate && hasTrackedState
        ? resolvePreviewPoolCardIds(candidate, extraDisplay)
        : [];
  const extraLines: string[] = [];
  const triggerHit = matchOnBoardTrigger(def, extraDisplay?.friendlyBoard ?? []);
  if (triggerHit) {
    extraLines.push(`将触发：${triggerHit.triggerNames.join('、')}`);
  }
  const stateNeeded = candidate?.extraDisplay?.stateNeeded ?? [];
  const template = candidate?.extraDisplay?.suggestedDisplayTextZhCN;
  if (candidate && hasTrackedState && stateNeeded.length > 0 && template) {
    const bindings = computeBindings(cardId, candidate, def, extraDisplay);
    extraLines.push(expandTemplate(template, bindings));
  }

  // On-board trigger highlight remains visual, but detailed enhanced data
  // belongs in the hover preview rather than inline row text.
  const staticPoolCardIds =
    dynamicPoolCardIds.length === 0 && extraLines.length === 0 && !isRangerSylvanasPreview
      ? getStaticHoverPoolCardIds(cardId)
      : [];
  return {
    poolCardIds: dynamicPoolCardIds.length > 0 ? dynamicPoolCardIds : staticPoolCardIds,
    extraLines,
    highlight: triggerHit !== null,
  };
}

interface Bindings {
  [key: string]: string | number;
}

function computeBindings(
  cardId: string,
  candidate: ExtraDisplayCandidate,
  def: CardDef | null | undefined,
  extraDisplay: DeckTrackerSnapshot['extraDisplay'] | undefined,
): Bindings {
  const counters = extraDisplay?.counters ?? {};
  const pools = (extraDisplay?.pools ?? {}) as NonNullable<DeckTrackerSnapshot['extraDisplay']>['pools'];
  const stateNeeded = candidate.extraDisplay?.stateNeeded ?? [];
  const bindings: Bindings = { ...counters };

  const primaryPool = allowsPoolPreview(candidate.extraDisplay?.displayType)
    ? resolvePrimaryPool(candidate, extraDisplay)
    : [];
  const primaryPoolCount = countPoolCards(primaryPool);
  if (primaryPool.length > 0) {
    bindings.cardNames = formatPoolNames(primaryPool);
    bindings.count = primaryPoolCount;
    bindings.distinctCount = primaryPool.length;
  }

  const demonPool = extraDisplay?.pools.friendlyDeadDemonsThisGameUnique ?? [];
  bindings.demonNames = formatPoolNames(demonPool);
  bindings.demonCount = demonPool.length;
  bindings.demonInstances = demonPool.reduce((s, p) => s + p.count, 0);

  bindings.natureSpellCount = countPoolCards(pools.natureSpellsInHand ?? []) + countPoolCards(pools.natureSpellsInDeck ?? []);
  bindings.holyCount = countPoolCards(pools.holySpellsRemainingInDeck ?? []);
  bindings.shadowCount = countPoolCards(pools.shadowSpellsRemainingInDeck ?? []);
  bindings.holyYesNo = Number(counters.holySpellsCastThisTurn ?? 0) > 0 ? '是' : '否';
  bindings.shadowYesNo = Number(counters.shadowSpellsCastThisTurn ?? 0) > 0 ? '是' : '否';
  bindings.cost1Names = formatPoolNames(pools.friendlyDeadMinionsCost1 ?? []);
  bindings.cost2Names = formatPoolNames(pools.friendlyDeadMinionsCost2 ?? []);
  bindings.cost3Names = formatPoolNames(pools.friendlyDeadMinionsCost3 ?? []);
  bindings.impCount = countPoolCards(pools.friendlyDeadImpsThisGameUnique ?? []);

  const count = resolvePrimaryCount(candidate, bindings, primaryPool);
  bindings.count = bindings.count ?? count;
  bindings.value = bindings.value ?? count;
  bindings.currentText = bindings.currentText ?? countStatusText(count);
  bindings.yesNo = count > 0 ? '是' : '否';
  bindings.activeText = count > 0 ? '已生效' : '未生效';
  bindings.readyText = count > 0 ? '已就绪' : '未就绪';
  bindings.remaining = Math.max(0, resolveRequiredNumber(candidate) - count);
  bindings.lastCost = counters.lastPlayedCardCost ?? 0;

  const costDriver = resolveCostDriver(candidate, bindings);
  const baseCost = def?.cost ?? candidate.cost ?? 0;
  bindings.discount = Math.min(baseCost, costDriver);
  bindings.currentCost = Math.max(0, baseCost - costDriver);

  if (cardId === 'CORE_BT_427') {
    bindings.drawCount = bindings.friendlyMinionsDiedThisTurn ?? 0;
  }
  if (cardId === 'CORE_REV_750') {
    const stat = Math.max(1, Number(bindings.otherCardsPlayedThisTurn ?? 0));
    bindings.attack = stat;
    bindings.health = stat;
  }
  if (cardId === 'CORE_REV_940') {
    bindings.attack = Math.min(10, Number(bindings.otherCardsPlayedThisTurn ?? 0));
    bindings.health = 3;
  }
  if (cardId === 'CORE_REV_514') {
    const skeletons = Number(bindings.friendlyUnstableSkeletonDeathsThisGame ?? 0);
    const boardSpace = Number(bindings.friendlyBoardSpace ?? 7);
    bindings.count = skeletons;
    bindings.summonCount = Math.min(skeletons, boardSpace);
    bindings.overflow = Math.max(0, skeletons - boardSpace);
  }
  if (cardId === 'EDR_941') {
    bindings.damage = Number(bindings.friendlyMinionDeathsThisGame ?? 0);
  }
  if (cardId === 'EDR_430') {
    const deaths = Number(bindings.friendlyMinionDeathsThisGame ?? 0);
    bindings.readyText = deaths >= 20 ? '已就绪' : `还差 ${20 - deaths}`;
  }
  if (cardId === 'CORE_REV_372') {
    bindings.summonCount = Number(bindings.minionDeathsThisTurnBothPlayers ?? 0) > 0 ? 2 : 1;
  }
  if (cardId === 'CATA_EVENT_002') {
    bindings.readyText = Number(bindings.fireSpellsCastThisTurnByYou ?? 0) > 0 ? '可消灭' : '未触发';
  }
  if (cardId === 'CATA_584') {
    bindings.damage = Number(bindings.fireSpellsCastThisTurnByYou ?? 0) > 0 ? 6 : 3;
  }

  return bindings;
}

function expandTemplate(template: string, bindings: Bindings): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = bindings[key];
    if (value === undefined || value === null) return fallbackBindingText(key);
    return String(value);
  });
}

function hasTrackedExtraDisplayState(
  candidate: ExtraDisplayCandidate,
  extraDisplay: DeckTrackerSnapshot['extraDisplay'] | undefined,
): boolean {
  const counters = extraDisplay?.counters ?? {};
  for (const key of candidate.extraDisplay?.stateNeeded ?? []) {
    if (key === 'currentCost') continue;
    if (Object.prototype.hasOwnProperty.call(counters, key)) return true;
    if (poolForStateKey(key, extraDisplay).length > 0) return true;
  }
  return false;
}

function resolvePreviewPoolCardIds(
  candidate: ExtraDisplayCandidate,
  extraDisplay: DeckTrackerSnapshot['extraDisplay'] | undefined,
): string[] {
  const displayType = candidate.extraDisplay?.displayType;
  if (!allowsPoolPreview(displayType)) return [];
  if (prefersTextPreview(displayType)) return [];

  const primaryPool = resolvePrimaryPool(candidate, extraDisplay);
  if (primaryPool.length === 0) return [];
  return shouldExpandPoolByCount(candidate)
    ? expandPoolByCount(primaryPool)
    : primaryPool.map((entry) => entry.cardId);
}

function resolvePrimaryPool(
  candidate: ExtraDisplayCandidate,
  extraDisplay: DeckTrackerSnapshot['extraDisplay'] | undefined,
): { cardId: string; count: number }[] {
  let sawExplicitPoolState = false;
  for (const key of candidate.extraDisplay?.stateNeeded ?? []) {
    const pool = poolForStateKey(key, extraDisplay);
    if (pool.length > 0) return pool;
    if (isPoolStateKey(key)) sawExplicitPoolState = true;
  }
  if (sawExplicitPoolState) return [];
  const fallbackKey = primaryPoolKeyForDisplayType(candidate.extraDisplay?.displayType);
  return fallbackKey ? poolForStateKey(fallbackKey, extraDisplay) : [];
}

function poolForStateKey(
  key: string,
  extraDisplay: DeckTrackerSnapshot['extraDisplay'] | undefined,
): { cardId: string; count: number }[] {
  const pools = extraDisplay?.pools;
  if (!pools) return [];
  if (key === 'friendlyMinionsDiedThisTurn') return pools.friendlyGraveyardThisTurn ?? [];
  return pools[key] ?? [];
}

function allowsPoolPreview(displayType: string | undefined): boolean {
  return displayType?.includes('pool') === true;
}

function prefersTextPreview(displayType: string | undefined): boolean {
  return displayType === 'deck_school_pool' ||
    displayType === 'graveyard_pool_by_cost' ||
    displayType === 'graveyard_pool_and_upgrade_progress';
}

function shouldExpandPoolByCount(candidate: ExtraDisplayCandidate): boolean {
  const displayType = candidate.extraDisplay?.displayType;
  return displayType === 'replay_pool' ||
    (candidate.extraDisplay?.stateNeeded ?? []).some((key) => key.includes('Weighted'));
}

function expandPoolByCount(pool: readonly { cardId: string; count: number }[]): string[] {
  return pool.flatMap((entry) => Array.from({ length: Math.max(1, entry.count) }, () => entry.cardId));
}

function isAnimalCompanionPoolPreviewCard(cardId: string): boolean {
  return ANIMAL_COMPANION_POOL_PREVIEW_CARD_IDS.has(cardId);
}

function isRangerSylvanasCard(cardId: string): boolean {
  return RANGER_SYLVANAS_CARD_IDS.has(cardId);
}

function resolveRangerSylvanasPlayedPool(
  extraDisplay: DeckTrackerSnapshot['extraDisplay'] | undefined,
): string[] {
  return expandPoolByCount(extraDisplay?.pools.rangerSylvanasCardsPlayedThisGame ?? []);
}

function primaryPoolKeyForDisplayType(displayType: string | undefined): string | null {
  if (displayType === 'graveyard_pool') return 'friendlyDeadMinionPoolThisGameUnique';
  if (displayType === 'deck_pool') return 'deckMinionsRemaining';
  return null;
}

function isPoolStateKey(key: string): boolean {
  if (key.includes('WhileThisEntityInHand')) return false;
  return key.includes('Pool') ||
    key.includes('pool') ||
    key.includes('Remaining') ||
    key.includes('InDeck') ||
    key.includes('InHand') ||
    key.includes('Graveyard') ||
    key.includes('Dead');
}

function countPoolCards(pool: readonly { count: number }[]): number {
  return pool.reduce((sum, entry) => sum + entry.count, 0);
}

function formatPoolNames(pool: readonly { cardId: string; count: number }[]): string {
  if (pool.length === 0) return '无';
  return pool
    .slice(0, 8)
    .map((p) => `${prettyCardName(p.cardId)}${p.count > 1 ? ` x${p.count}` : ''}`)
    .join('、');
}

function resolvePrimaryCount(
  candidate: ExtraDisplayCandidate,
  bindings: Bindings,
  primaryPool: readonly { count: number }[],
): number {
  const poolCount = countPoolCards(primaryPool);
  if (poolCount > 0) return poolCount;
  for (const key of candidate.extraDisplay?.stateNeeded ?? []) {
    const value = bindings[key];
    if (typeof value === 'number') return value;
    if (key.startsWith('counter.')) return 0;
    if (key.startsWith('cardState.')) return 0;
  }
  return 0;
}

function resolveRequiredNumber(candidate: ExtraDisplayCandidate): number {
  const text = candidate.extraDisplay?.suggestedDisplayTextZhCN ?? '';
  const match = /\/(\d+)/.exec(text);
  if (match) return Number(match[1]);
  return 0;
}

function countStatusText(count: number): string {
  return count > 0 ? `已记录 ${count}` : '暂无记录';
}

function resolveCostDriver(candidate: ExtraDisplayCandidate, bindings: Bindings): number {
  for (const key of candidate.extraDisplay?.stateNeeded ?? []) {
    if (key === 'currentCost') continue;
    const value = bindings[key];
    if (typeof value === 'number') return value;
  }
  return 0;
}

function fallbackBindingText(key: string): string {
  if (/Names|Card|card|Texts|Mappings|Spells/.test(key)) return '无';
  if (/Text|State|active|ready|effect|value|location/i.test(key)) return '未知';
  return '0';
}

interface OnBoardTriggerHit {
  triggerNames: string[];
}

function matchOnBoardTrigger(
  def: CardDef | null | undefined,
  friendlyBoard: readonly { cardId: string }[],
): OnBoardTriggerHit | null {
  if (!def || friendlyBoard.length === 0) return null;
  const candidates = getOnBoardTriggerCandidates();
  if (candidates.length === 0) return null;

  const boardCardIds = new Set(friendlyBoard.map((r) => r.cardId));
  const matched: string[] = [];
  for (const cand of candidates) {
    if (!boardCardIds.has(cand.cardCode)) continue;
    const th = cand.extraDisplay?.triggerHighlight;
    if (!th) continue;
    if (th.matchSpellSchool && (def.type !== 'SPELL' || def.spellSchool !== th.matchSpellSchool)) continue;
    if (th.matchRace && !(def.races ?? []).some((r) => r === th.matchRace)) continue;
    matched.push(cand.cardNameZhCN);
  }
  if (matched.length === 0) return null;
  return { triggerNames: matched };
}

function matchesHoverRelatedHighlight(
  def: CardDef | null | undefined,
  hoveredSourceCardId: string | null | undefined,
): boolean {
  if (!def || !hoveredSourceCardId) return false;
  if (hoveredSourceCardId === STRANGE_DOG_TRAINER_CARD_ID) {
    return (def.races ?? []).some((race) => race === 'BEAST');
  }
  const th = getExtraDisplayCandidate(hoveredSourceCardId)?.extraDisplay?.triggerHighlight;
  if (!th) return false;
  if (th.matchSpellSchool && (def.type !== 'SPELL' || def.spellSchool !== th.matchSpellSchool)) return false;
  if (th.matchRace && !(def.races ?? []).some((race) => race === th.matchRace)) return false;
  return true;
}

function prettyCardName(cardId: string): string {
  return getExtraDisplayCandidate(cardId)?.cardNameZhCN ?? cardId;
}
