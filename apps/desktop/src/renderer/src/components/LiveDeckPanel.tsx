import { useMemo, useRef, useState, useCallback, useEffect, type CSSProperties } from 'react';

const DRAG_HEADER_STYLE = { WebkitAppRegion: 'drag' } as CSSProperties;
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useCardDef } from '../hooks/use-card-def';
import { useCardTileUrl } from '../hooks/use-card-image-url';
import { useHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import { expandDeckToCopies, type DeckCopy, type DeckTrackerSnapshot } from '@hdt/core';
import { clsx } from 'clsx';
import { useCardPreview } from '../hooks/use-card-preview';
import { getRarityCostBg } from '../lib/rarity';
import type { CardDef, Rarity } from '@hdt/hearthdb';
import { useLocale, useTranslation } from '../i18n';
import {
  getExtraDisplayCandidate,
  getOnBoardTriggerCandidates,
  type ExtraDisplayCandidate,
} from '../lib/extra-display-candidates';

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
            <div className="tavern-empty-row rounded border border-border bg-overlay-elevated backdrop-blur-xl px-2 py-2 text-center text-xs text-text-dim">
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
                  extraDisplay={snapshot.extraDisplay}
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

interface CardCopyRowProps {
  copyKey: string;
  cardId: string;
  exiting: boolean;
  testId?: string;
  extraDisplay?: DeckTrackerSnapshot['extraDisplay'];
  onAnimationEnd: (copyKey: string) => void;
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}

function CardCopyRow({
  copyKey,
  cardId,
  exiting,
  testId = 'card-copy-row',
  extraDisplay,
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
  const rowExtra = buildRowExtraDisplay(cardId, def, extraDisplay);
  const rowTitle = rowExtra.titleLines.length > 0
    ? [name, ...rowExtra.titleLines].join('\n')
    : cardId;

  return (
    <div
      ref={ref}
      data-testid={testId}
      data-extra-display={rowExtra.badges.length > 0 || rowExtra.highlight ? 'active' : 'none'}
      data-row-state={exiting ? 'exiting' : 'ready'}
      className={clsx(
        'tavern-card-row relative overflow-hidden rounded text-sm border-b border-border last:border-b-0 transition-colors hover:bg-overlay-elevated hover:shadow-[inset_3px_0_0_var(--accent)]',
        exiting ? 'animate-deck-exit' : '',
        rowExtra.highlight ? 'ring-1 ring-accent/70 bg-accent-dim/20 shadow-[inset_3px_0_0_var(--accent)]' : '',
      )}
      title={rowTitle}
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
          {rowExtra.summary ? (
            <div className="mt-0.5 truncate text-[10px] leading-none text-accent/90">
              {rowExtra.summary}
            </div>
          ) : null}
        </div>
        {rowExtra.badges.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1">
            {rowExtra.badges.map((badge) => (
              <span
                key={badge.label}
                data-testid="card-extra-display-badge"
                className={clsx(
                  'rounded border px-1.5 py-0.5 text-[10px] font-bold leading-none shadow-sm',
                  badge.tone === 'highlight'
                    ? 'border-accent/60 bg-accent/25 text-accent'
                    : badge.tone === 'warning'
                      ? 'border-red/60 bg-red/25 text-red'
                      : 'border-green/40 bg-green/20 text-green',
                )}
                title={badge.title}
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface RowExtraBadge {
  label: string;
  title: string;
  tone?: 'normal' | 'highlight' | 'warning';
}

interface RowExtraDisplay {
  badges: RowExtraBadge[];
  titleLines: string[];
  summary: string | null;
  highlight: boolean;
}

function buildRowExtraDisplay(
  cardId: string,
  def: CardDef | null | undefined,
  extraDisplay: DeckTrackerSnapshot['extraDisplay'] | undefined,
): RowExtraDisplay {
  const candidate = getExtraDisplayCandidate(cardId);
  const counters = extraDisplay?.counters ?? {};
  const badges: RowExtraBadge[] = [];
  const titleLines: string[] = [];
  let summary: string | null = null;
  let highlight = false;

  // 1. On-board trigger highlight — data-driven from candidate JSON.
  const triggerHit = matchOnBoardTrigger(def, extraDisplay?.friendlyBoard ?? []);
  if (triggerHit) {
    const triggerText = `将触发：${triggerHit.triggerNames.join('、')}`;
    badges.push({ label: triggerHit.label, title: triggerText, tone: 'highlight' });
    titleLines.push(triggerText);
    summary = triggerText;
    highlight = true;
  }

  // 2. State-driven row for this card's own candidate spec.
  const stateNeeded = candidate?.extraDisplay?.stateNeeded ?? [];
  const template = candidate?.extraDisplay?.suggestedDisplayTextZhCN;
  if (candidate && stateNeeded.length > 0) {
    const bindings = computeBindings(cardId, candidate, def, extraDisplay);
    const expanded = template ? expandTemplate(template, bindings) : null;
    for (const badge of buildBadgesFor(candidate, bindings, extraDisplay)) {
      badges.push(badge);
    }
    if (expanded) {
      titleLines.push(expanded);
      summary = summary ?? expanded;
    }
  }

  return { badges, titleLines, summary, highlight };
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
  const bindings: Bindings = { ...counters };

  // Pool views.
  const demonPool = extraDisplay?.pools.friendlyDeadDemonsThisGameUnique ?? [];
  bindings.demonNames = demonPool.map((p) => prettyCardName(p.cardId)).join('、');
  bindings.demonCount = demonPool.length;
  bindings.demonInstances = demonPool.reduce((s, p) => s + p.count, 0);

  // Cost-progress (Fel spell cost).
  if (candidate.extraDisplay?.stateNeeded?.includes('felSpellsCastThisGame')) {
    const cast = bindings.felSpellsCastThisGame as number | undefined ?? 0;
    const baseCost = def?.cost ?? candidate.cost ?? 0;
    bindings.discount = Math.min(baseCost, cast);
    bindings.currentCost = Math.max(0, baseCost - cast);
  }

  // Soul-feast: predicted draws equal friendlyMinionsDiedThisTurn.
  if (cardId === 'CORE_BT_427') {
    bindings.drawCount = bindings.friendlyMinionsDiedThisTurn ?? 0;
  }

  // Infuse progress from per-cardId snapshot.
  const infuseConfig = candidate.extraDisplay?.infuseConfig;
  if (infuseConfig) {
    const entry = extraDisplay?.infuseProgressByCardId?.[cardId];
    const progress = entry
      ? infuseConfig.scope === 'demon'
        ? entry.friendlyDemonDeaths
        : entry.friendlyDeaths
      : 0;
    bindings.progress = progress;
    bindings.required = infuseConfig.required;
    bindings.infusedText = progress >= infuseConfig.required ? '已注能' : '未注能';
    bindings.summonCount = progress >= infuseConfig.required ? 3 : 1;
  }

  return bindings;
}

function buildBadgesFor(
  candidate: ExtraDisplayCandidate,
  bindings: Bindings,
  _extraDisplay: DeckTrackerSnapshot['extraDisplay'] | undefined,
): RowExtraBadge[] {
  const stateNeeded = candidate.extraDisplay?.stateNeeded ?? [];
  const emptyWarning = candidate.extraDisplay?.emptyWarning === true;
  const out: RowExtraBadge[] = [];

  if (stateNeeded.includes('felSpellsCastThisGame')) {
    const currentCost = bindings.currentCost as number;
    out.push({ label: `${currentCost}费`, title: `当前邪能费用 ${currentCost}` });
  }
  if (stateNeeded.includes('friendlyDeadDemonsThisGameUnique')) {
    const count = bindings.demonCount as number;
    const tone: RowExtraBadge['tone'] = emptyWarning && count === 0 ? 'warning' : 'normal';
    out.push({ label: `恶魔 ${count}`, title: `本局死亡友方恶魔：${count} 种`, tone });
  }
  if (stateNeeded.includes('friendlyMinionsDiedThisTurn')) {
    const died = bindings.friendlyMinionsDiedThisTurn as number;
    out.push({ label: `死 ${died}`, title: `本回合友方随从死亡：${died}` });
  }
  if (stateNeeded.includes('fireSpellsCastThisTurnByYou')) {
    const cast = bindings.fireSpellsCastThisTurnByYou as number;
    out.push({ label: `火 ${cast}`, title: `本回合已施放火焰法术：${cast}` });
  }
  if (stateNeeded.includes('holySpellsCastThisTurn')) {
    const cast = bindings.holySpellsCastThisTurn as number;
    out.push({ label: `神 ${cast}`, title: `本回合已施放神圣法术：${cast}` });
  }
  if (candidate.extraDisplay?.infuseConfig) {
    const progress = bindings.progress as number;
    const required = bindings.required as number;
    const tone: RowExtraBadge['tone'] = progress >= required ? 'highlight' : 'normal';
    out.push({ label: `注能 ${progress}/${required}`, title: `注能进度 ${progress}/${required}`, tone });
  }
  return out;
}

function expandTemplate(template: string, bindings: Bindings): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = bindings[key];
    if (value === undefined || value === null) return `{${key}}`;
    return String(value);
  });
}

interface OnBoardTriggerHit {
  label: string;
  triggerNames: string[];
}

function spellSchoolLabel(spellSchool: string): string {
  switch (spellSchool) {
    case 'FEL':
      return '邪能';
    case 'FIRE':
      return '火焰';
    case 'FROST':
      return '冰霜';
    case 'HOLY':
      return '神圣';
    case 'NATURE':
      return '自然';
    case 'SHADOW':
      return '暗影';
    case 'ARCANE':
      return '奥术';
    default:
      return spellSchool;
  }
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
  let label: string | null = null;
  for (const cand of candidates) {
    if (!boardCardIds.has(cand.cardCode)) continue;
    const th = cand.extraDisplay?.triggerHighlight;
    if (!th) continue;
    if (th.matchSpellSchool && (def.type !== 'SPELL' || def.spellSchool !== th.matchSpellSchool)) continue;
    if (th.matchRace && !(def.races ?? []).some((r) => r === th.matchRace)) continue;
    matched.push(cand.cardNameZhCN);
    if (label === null && th.matchSpellSchool) {
      label = spellSchoolLabel(th.matchSpellSchool);
    }
  }
  if (matched.length === 0) return null;
  return { label: label ?? '触发', triggerNames: matched };
}

function prettyCardName(cardId: string): string {
  return getExtraDisplayCandidate(cardId)?.cardNameZhCN ?? cardId;
}
