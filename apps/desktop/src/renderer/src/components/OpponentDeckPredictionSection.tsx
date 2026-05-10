import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type {
  OpponentCardRecord,
  OpponentDeckPrediction,
  PopularDeckCardEntry,
  PredictionConfidence,
} from '@hdt/core';
import type { Rarity } from '@hdt/hearthdb';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n';
import { useCardDef } from '../hooks/use-card-def';
import { useCardTileUrl } from '../hooks/use-card-image-url';
import { useCardPreview } from '../hooks/use-card-preview';

// Same masking the LiveDeckPanel uses to bleed the right-aligned tile
// art into the row background. Kept inline so the popup feels visually
// identical to the in-overlay deck rows.
const ART_MASK_STYLE: CSSProperties = {
  maskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
};
const NAME_TEXT_SHADOW: CSSProperties = { textShadow: '0 1px 2px rgba(0,0,0,0.7)' };

function getRarityCostBg(rarity: Rarity | undefined): string {
  if (rarity === 'LEGENDARY') return 'bg-rarity-legendary text-bg';
  if (rarity === 'EPIC') return 'bg-rarity-epic text-bg';
  if (rarity === 'RARE') return 'bg-rarity-rare text-bg';
  return 'bg-white/10 text-text border border-border-hi';
}

interface OpponentDeckPredictionSectionProps {
  predictions: readonly OpponentDeckPrediction[];
  /** How many of the opponent's revealed cards have `created: true`. */
  excludedCount: number;
  /**
   * Total opponent revealed cards (created + non-created). Used to suppress
   * the section pre-game when both predictions and revealed are empty.
   */
  observedCount: number;
  /**
   * Opponent's revealed cards (post-mulligan plays). Passed in so the
   * popup can mark each card in the deck as "played" / "not played" by
   * matching cardId against the records. Created (Discover/Generate)
   * records are ignored so a discovered Fireball doesn't tick off
   * Fireball in every Mage deck's popup.
   */
  revealed: readonly OpponentCardRecord[];
}

const CONFIDENCE_TONE: Record<PredictionConfidence, string> = {
  low: 'bg-amber/15 text-amber border-amber/30',
  medium: 'bg-accent-dim text-accent border-accent/40',
  high: 'bg-green/15 text-green border-green/40',
};

function ConfidenceBadge({ confidence }: { confidence: PredictionConfidence }): ReactElement {
  const { t } = useTranslation();
  const label =
    confidence === 'low'
      ? t('decks.opponentPrediction.confidenceLow')
      : confidence === 'medium'
        ? t('decks.opponentPrediction.confidenceMedium')
        : t('decks.opponentPrediction.confidenceHigh');
  return (
    <span
      data-testid="opponent-prediction-confidence"
      data-confidence={confidence}
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wider border ${CONFIDENCE_TONE[confidence]}`}
    >
      {label}
    </span>
  );
}

function PredictionRow({
  prediction,
  isTop,
  isActive,
  onActivate,
}: {
  prediction: OpponentDeckPrediction;
  isTop: boolean;
  isActive: boolean;
  onActivate: (deckId: string, anchor: { x: number; y: number }) => void;
}): ReactElement {
  const { t } = useTranslation();
  const scorePct = (prediction.score * 100).toFixed(1);
  const handleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    onActivate(prediction.deck.id, { x: e.clientX, y: e.clientY });
  };
  return (
    <div
      data-testid={isTop ? 'opponent-prediction-top' : 'opponent-prediction-alt'}
      data-deck-id={prediction.deck.id}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          onActivate(prediction.deck.id, { x: rect.right, y: rect.top });
        }
      }}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer transition-colors hover:bg-accent-dim/30 hover:border-accent/50 ${
        isActive
          ? 'bg-accent-dim/40 border border-accent'
          : isTop
            ? 'bg-white/10 border border-border-hi'
            : 'bg-white/8 border border-transparent'
      }`}
    >
      <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-text text-[9px] font-bold border border-border-hi shrink-0">
        {prediction.deck.class.slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-text font-semibold truncate" title={prediction.deck.name}>
          {prediction.deck.name}
        </div>
        <div className="font-mono text-[9px] text-text-mute tracking-[0.06em] uppercase">
          {prediction.deck.archetype} · {prediction.deck.winratePercent}% wr
        </div>
      </div>
      <div className="text-right font-mono text-[10px] tracking-tight">
        <div className="text-accent font-bold">
          {t('decks.opponentPrediction.matchScore', { score: scorePct })}
        </div>
        {isTop && <ConfidenceBadge confidence={prediction.confidence} />}
      </div>
    </div>
  );
}

interface DeckPopupProps {
  prediction: OpponentDeckPrediction;
  anchor: { x: number; y: number };
  playedCounts: ReadonlyMap<string, number>;
  onClose: () => void;
}

const POPUP_WIDTH = 260;
const POPUP_GAP = 8;
const POPUP_MARGIN = 12;

interface ExpandedDeckRow {
  cardId: string;
  cost: number;
  fallbackName: string;
  played: boolean;
}

function expandDeckCardList(
  list: readonly PopularDeckCardEntry[],
  playedCounts: ReadonlyMap<string, number>,
): ExpandedDeckRow[] {
  const out: ExpandedDeckRow[] = [];
  for (const entry of list) {
    const playedForCard = playedCounts.get(entry.cardId) ?? 0;
    for (let i = 0; i < entry.count; i++) {
      out.push({
        cardId: entry.cardId,
        cost: entry.cost,
        fallbackName: entry.name,
        // First copies are marked played (faded) up to the played count.
        played: i < playedForCard,
      });
    }
  }
  return out;
}

function DeckPopup({ prediction, anchor, playedCounts, onClose }: DeckPopupProps): ReactElement {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const { onRowEnter, onRowLeave } = useCardPreview();
  const handleRowEnter = useCallback(
    (cardId: string, el: HTMLDivElement) => onRowEnter(cardId, el),
    [onRowEnter],
  );

  const expanded = useMemo(
    () => expandDeckCardList(prediction.deck.deckCardList, playedCounts),
    [prediction.deck.deckCardList, playedCounts],
  );

  // Outside-click + Escape to close. Skip when the mousedown originated
  // on any prediction row — the row's own onClick is the source of
  // truth there (it toggles activeDeck, which handles open / re-anchor /
  // close). Otherwise we'd race the row click and end up with a
  // close-then-reopen sequence.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      const target = e.target as Element | null;
      const popup = popupRef.current;
      if (!popup || !target) return;
      if (popup.contains(target)) return;
      if (target.closest && target.closest('[data-deck-id]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Place the popup to the right of the cursor; flip to the left when
  // it would overflow the viewport. Clamp top/bottom to keep it on screen.
  const left = useMemo(() => {
    const ideal = anchor.x + POPUP_GAP;
    const flipped = anchor.x - POPUP_GAP - POPUP_WIDTH;
    if (ideal + POPUP_WIDTH + POPUP_MARGIN > window.innerWidth) {
      return Math.max(POPUP_MARGIN, flipped);
    }
    return ideal;
  }, [anchor.x]);

  return createPortal(
    <div
      ref={popupRef}
      data-testid="opponent-prediction-popup"
      role="dialog"
      aria-label={prediction.deck.name}
      style={{
        position: 'fixed',
        left,
        top: Math.max(POPUP_MARGIN, Math.min(anchor.y, window.innerHeight - POPUP_MARGIN - 32)),
        width: POPUP_WIDTH,
        maxHeight: `calc(100vh - ${POPUP_MARGIN * 2}px)`,
        zIndex: 50,
      }}
      className="bg-white/5 border border-border-hi rounded-md shadow-2xl overflow-hidden flex flex-col"
    >
      <header className="px-3 py-2 border-b border-border bg-white/10">
        <div className="text-xs font-bold text-text truncate" title={prediction.deck.name}>
          {prediction.deck.name}
        </div>
        <div className="font-mono text-[9px] text-text-mute tracking-[0.06em] uppercase mt-0.5">
          {prediction.deck.class} · {prediction.deck.archetype} · {prediction.deck.winratePercent}% wr
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {expanded.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-text-mute font-mono">…</div>
        ) : (
          expanded.map((row, idx) => (
            <DeckPopupRow
              key={`${row.cardId}-${idx}`}
              row={row}
              onMouseEnter={handleRowEnter}
              onMouseLeave={onRowLeave}
            />
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}

function DeckPopupRow({
  row,
  onMouseEnter,
  onMouseLeave,
}: {
  row: ExpandedDeckRow;
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}): ReactElement {
  // Renderer-side resolution against the active locale's CardDb so a
  // user with zh-CN gets Chinese names; falls back to the IPC-baked
  // (default-locale) name while the lookup is in flight.
  const def = useCardDef(row.cardId);
  const name = def?.name ?? row.fallbackName;
  const cost = def?.cost ?? row.cost;
  const rarity = def?.rarity as Rarity | undefined;
  const tileUrl = useCardTileUrl(row.cardId);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      data-testid="opponent-prediction-popup-row"
      data-card-id={row.cardId}
      data-played={row.played ? 'true' : 'false'}
      onMouseEnter={() => ref.current && onMouseEnter(row.cardId, ref.current)}
      onMouseLeave={onMouseLeave}
      className={clsx(
        'relative overflow-hidden text-sm border-b border-border last:border-b-0 transition-colors hover:bg-white/10 hover:shadow-[inset_3px_0_0_var(--accent)]',
        row.played ? 'opacity-40 grayscale' : '',
      )}
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
      <div className="relative z-10 flex items-center px-2 py-1 w-full">
        <div
          className={clsx(
            'w-6 h-6 rounded flex items-center justify-center font-bold text-xs shrink-0 font-mono',
            getRarityCostBg(rarity),
          )}
        >
          {cost}
        </div>
        <div className="flex-1 min-w-0 px-2">
          <div
            className={clsx(
              'truncate font-medium text-xs',
              rarity === 'LEGENDARY' ? 'text-rarity-legendary' : '',
              rarity === 'EPIC' ? 'text-rarity-epic' : '',
              rarity === 'RARE' ? 'text-rarity-rare' : '',
              !rarity || rarity === 'COMMON' || rarity === 'FREE' ? 'text-text' : '',
              row.played ? 'line-through' : '',
            )}
            style={NAME_TEXT_SHADOW}
            title={row.cardId}
          >
            {name}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OpponentDeckPredictionSection({
  predictions,
  excludedCount,
  observedCount,
  revealed,
}: OpponentDeckPredictionSectionProps): ReactElement | null {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [activeDeck, setActiveDeck] = useState<{ id: string; anchor: { x: number; y: number } } | null>(
    null,
  );

  // Map of cardId → count of non-created opponent plays. Used by the
  // popup to color "played" cards. We exclude `created: true` so a
  // discovered Fireball doesn't tick off Fireball in every Mage deck.
  const playedCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of revealed) {
      if (r.created) continue;
      m.set(r.cardId, (m.get(r.cardId) ?? 0) + 1);
    }
    return m;
  }, [revealed]);

  const handleActivate = useCallback(
    (deckId: string, anchor: { x: number; y: number }) => {
      setActiveDeck((prev) => (prev?.id === deckId ? null : { id: deckId, anchor }));
    },
    [],
  );
  const handleClose = useCallback(() => setActiveDeck(null), []);

  // If the active deck disappears from the predictions list (e.g.,
  // opponent played another card and the ranking shifted past it),
  // close the popup gracefully.
  useEffect(() => {
    if (activeDeck && !predictions.some((p) => p.deck.id === activeDeck.id)) {
      setActiveDeck(null);
    }
  }, [predictions, activeDeck]);

  // Hide entirely pre-game (no revealed cards AND no predictions).
  if (predictions.length === 0 && observedCount === 0) return null;

  const top = predictions[0];
  const alternatives = predictions.slice(1);
  const activePrediction = activeDeck
    ? predictions.find((p) => p.deck.id === activeDeck.id) ?? null
    : null;

  return (
    <section
      data-testid="opponent-deck-prediction-section"
      className="bg-white/5 border border-border rounded-sm px-2 py-2 space-y-1.5"
    >
      <header className="flex items-baseline justify-between gap-2 px-1">
        <span className="text-[10px] text-text-mute font-mono tracking-[0.14em] uppercase">
          {t('decks.opponentPrediction.sectionTitle')}
        </span>
        {excludedCount > 0 && (
          <span
            data-testid="opponent-prediction-excluded"
            className="text-[10px] text-text-dim font-mono"
          >
            {t('decks.opponentPrediction.excludedCards', { count: String(excludedCount) })}
          </span>
        )}
      </header>

      {top ? (
        <>
          <PredictionRow
            prediction={top}
            isTop
            isActive={activeDeck?.id === top.deck.id}
            onActivate={handleActivate}
          />
          {alternatives.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              data-testid="opponent-prediction-toggle"
              className="w-full text-left text-[10px] font-mono tracking-[0.1em] uppercase text-text-mute hover:text-accent px-1 cursor-pointer"
            >
              {expanded
                ? t('decks.opponentPrediction.collapse')
                : t('decks.opponentPrediction.expand')}
            </button>
          )}
          {expanded &&
            alternatives.map((pred) => (
              <PredictionRow
                key={pred.deck.id}
                prediction={pred}
                isTop={false}
                isActive={activeDeck?.id === pred.deck.id}
                onActivate={handleActivate}
              />
            ))}
        </>
      ) : (
        <div
          data-testid="opponent-prediction-no-match"
          className="text-xs text-text-mute font-sans px-1"
        >
          {t('decks.opponentPrediction.noMatch')}
        </div>
      )}

      {activePrediction && activeDeck && (
        <DeckPopup
          prediction={activePrediction}
          anchor={activeDeck.anchor}
          playedCounts={playedCounts}
          onClose={handleClose}
        />
      )}
    </section>
  );
}
