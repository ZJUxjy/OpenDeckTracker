import { useState, type ReactElement } from 'react';
import type { OpponentDeckPrediction, PredictionConfidence } from '@hdt/core';
import { useTranslation } from '../i18n';

interface OpponentDeckPredictionSectionProps {
  predictions: readonly OpponentDeckPrediction[];
  /** How many of the opponent's revealed cards have `created: true`. */
  excludedCount: number;
  /**
   * Total opponent revealed cards (created + non-created). Used to suppress
   * the section pre-game when both predictions and revealed are empty.
   */
  observedCount: number;
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
}: {
  prediction: OpponentDeckPrediction;
  isTop: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const scorePct = (prediction.score * 100).toFixed(1);
  return (
    <div
      data-testid={isTop ? 'opponent-prediction-top' : 'opponent-prediction-alt'}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-sm ${
        isTop ? 'bg-bg-3 border border-border-hi' : 'bg-bg-2/60 border border-transparent'
      }`}
    >
      <div className="w-6 h-6 rounded-full bg-bg-3 flex items-center justify-center text-text text-[9px] font-bold border border-border-hi shrink-0">
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

export function OpponentDeckPredictionSection({
  predictions,
  excludedCount,
  observedCount,
}: OpponentDeckPredictionSectionProps): ReactElement | null {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // Hide entirely pre-game (no revealed cards AND no predictions).
  if (predictions.length === 0 && observedCount === 0) return null;

  const top = predictions[0];
  const alternatives = predictions.slice(1);

  return (
    <section
      data-testid="opponent-deck-prediction-section"
      className="bg-bg-2/40 border border-border rounded-sm px-2 py-2 space-y-1.5"
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
          <PredictionRow prediction={top} isTop />
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
              <PredictionRow key={pred.deck.id} prediction={pred} isTop={false} />
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
    </section>
  );
}
