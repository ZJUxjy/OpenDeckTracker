import { useRef, useState, type CSSProperties } from 'react';
import { clsx } from 'clsx';
import { useCardTileUrl } from '../hooks/use-card-image-url';
import { useCardPreview } from '../hooks/use-card-preview';
import { useTranslation } from '../i18n';

const ART_MASK_STYLE: CSSProperties = {
  maskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
};

/**
 * The base Animal Companion summons (Misha/Leokk/Huffer) all cost 3
 * mana. Pool-replacement cards offset that base; the renderer surfaces
 * the absolute cost so the user doesn't have to do mental math.
 */
const ANIMAL_COMPANION_BASE_COST = 3;

export interface AnimalCompanionSummary {
  /**
   * Latest pool-replacement source effect. `null` when only Talya
   * Earthstrider (or another non-pool-replacement AC effect) is live.
   */
  poolReplacement: {
    sourceCardId: string;
    costOffset: number;
    pool: string[];
  } | null;
  /** Sum of `triggerCount` from any extra-summon effects (Talya). */
  extraSummons: number;
  /** Earliest triggeredAt of any aggregated AC effect — used for sort. */
  triggeredAt: number;
}

/**
 * Aggregated "Animal Companion pool" row.
 *
 * Hover triggers the floating multi-card preview window (see
 * `useCardPreview.onPoolEnter`) — same UX as deck-row hover but with
 * 3 cards side-by-side at full size. Mouse leave dismisses.
 *
 * Visual feedback at every state:
 *   - default     : `cursor-help`, hint text muted
 *   - hovered     : accent border + ring, hint tints accent
 */
export function AnimalCompanionPoolRow({
  summary,
  side,
}: {
  summary: AnimalCompanionSummary;
  side: 'player' | 'opponent';
}) {
  const { t } = useTranslation();
  const { poolReplacement, extraSummons } = summary;
  const [hovered, setHovered] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const { onPoolEnter, onRowLeave } = useCardPreview();

  const cost =
    poolReplacement !== null
      ? ANIMAL_COMPANION_BASE_COST + poolReplacement.costOffset
      : null;

  const body = (() => {
    if (cost !== null && extraSummons > 0) {
      return t('globalEffects.animalCompanionPool.bodyCostAndExtra', {
        cost,
        extra: extraSummons,
      });
    }
    if (cost !== null) {
      return t('globalEffects.animalCompanionPool.bodyCost', { cost });
    }
    if (extraSummons > 0) {
      return t('globalEffects.animalCompanionPool.bodyExtraOnly', {
        extra: extraSummons,
      });
    }
    return t('globalEffects.animalCompanionPool.bodyUnknown');
  })();

  const sourceArtCardId = poolReplacement?.sourceCardId ?? null;
  const tileUrl = useCardTileUrl(sourceArtCardId ?? '');
  const pool = poolReplacement?.pool ?? [];
  const hasPool = pool.length > 0;

  const handleEnter = (): void => {
    setHovered(true);
    if (hasPool && rowRef.current) {
      onPoolEnter(pool, rowRef.current);
    }
  };
  const handleLeave = (): void => {
    setHovered(false);
    onRowLeave();
  };

  return (
    <li
      ref={rowRef}
      data-testid="animal-companion-pool-row"
      data-tracker-side={side}
      data-hovered={hovered ? 'true' : 'false'}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        pointerEvents: 'auto',
        ...(hovered && hasPool ? { boxShadow: '0 0 0 2px var(--accent)' } : {}),
      }}
      className={clsx(
        'relative rounded-md border-2 bg-overlay-surface mb-2 last:mb-0 transition-colors',
        hasPool ? 'cursor-help' : '',
        hovered && hasPool
          ? 'border-accent'
          : hasPool
            ? 'border-border hover:border-accent'
            : 'border-border',
      )}
    >
      {sourceArtCardId !== null ? (
        <img
          src={tileUrl}
          data-testid="global-effect-art"
          alt=""
          aria-hidden
          style={ART_MASK_STYLE}
          className="absolute right-0 top-0 h-full w-2/5 object-cover object-right pointer-events-none select-none z-0 rounded-md"
        />
      ) : null}
      <div className="relative z-10 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-text font-semibold text-sm flex-1 min-w-0 truncate">
            {t('globalEffects.animalCompanionPool.title')}
          </div>
          {hasPool ? (
            <span
              data-testid="animal-companion-pool-hint"
              className={clsx(
                'shrink-0 text-[10px] uppercase tracking-wider transition-colors pointer-events-none',
                hovered ? 'text-accent' : 'text-text-mute',
              )}
            >
              {t('globalEffects.animalCompanionPool.hoverHint')}
            </span>
          ) : null}
        </div>
        <p className="text-text-dim text-xs mt-1 leading-relaxed pr-12 pointer-events-none">
          {body}
        </p>
      </div>
    </li>
  );
}
