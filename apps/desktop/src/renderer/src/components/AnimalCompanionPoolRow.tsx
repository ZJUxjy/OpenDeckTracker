import { useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { useCardDef } from '../hooks/use-card-def';
import { useCardTileUrl } from '../hooks/use-card-image-url';
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
 * Three independent triggers can expand the detail panel; the union
 * wins. This belt-and-suspenders setup is intentional — earlier
 * iterations had hover not fire reliably (Tailwind v4 arbitrary-value
 * compilation, transparent BrowserWindow event quirks), so the row
 * also responds to click and pointer events:
 *
 *   - onPointerEnter/Leave → modern unified pointer events (preferred)
 *   - onMouseEnter/Leave   → legacy fallback
 *   - onClick              → latching toggle, works even if neither
 *                            hover/pointer event reaches the React tree
 *
 * Visual feedback at every state:
 *   - default     : `cursor-help`, hint text muted
 *   - hovered     : accent border, hint+chevron tint accent, chevron
 *                   rotates 180°
 *   - expanded    : detail panel mounted with 3 beast tiles + names
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
  const [pinned, setPinned] = useState(false);

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
  const expanded = hasPool && (hovered || pinned);

  const handleEnter = (): void => setHovered(true);
  const handleLeave = (): void => setHovered(false);
  const handleClick = (): void => {
    if (!hasPool) return;
    setPinned((p) => !p);
  };

  return (
    <li
      data-testid="animal-companion-pool-row"
      data-tracker-side={side}
      data-hovered={hovered ? 'true' : 'false'}
      data-pinned={pinned ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={handleClick}
      style={
        expanded
          ? { boxShadow: '0 0 0 2px var(--accent)' }
          : undefined
      }
      className={clsx(
        'relative rounded-md border-2 bg-bg-2 mb-2 last:mb-0 transition-colors',
        hasPool ? 'cursor-pointer' : '',
        expanded
          ? 'border-accent'
          : hasPool
            ? 'border-border hover:border-accent'
            : 'border-border',
      )}
    >
      <div className="relative">
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
                  'shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider transition-colors pointer-events-none',
                  expanded ? 'text-accent' : 'text-text-mute',
                )}
              >
                {pinned
                  ? t('globalEffects.animalCompanionPool.pinnedHint')
                  : t('globalEffects.animalCompanionPool.hoverHint')}
                <ChevronDown
                  size={12}
                  className={clsx(
                    'transition-transform duration-200',
                    expanded ? 'rotate-180' : '',
                  )}
                />
              </span>
            ) : null}
          </div>
          <p className="text-text-dim text-xs mt-1 leading-relaxed pr-12 pointer-events-none">
            {body}
          </p>
        </div>
      </div>

      {expanded ? (
        <div
          data-testid="animal-companion-pool-detail"
          className="px-3 pb-2 pt-2 border-t border-border/50 grid grid-cols-3 gap-2 pointer-events-none"
        >
          {pool.map((cardId, i) => (
            <BeastDetail key={`${cardId}-${i}`} cardId={cardId} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function BeastDetail({ cardId }: { cardId: string }) {
  const tileUrl = useCardTileUrl(cardId);
  const def = useCardDef(cardId);
  const name = def?.name ?? cardId;
  return (
    <div className="flex flex-col items-stretch gap-1">
      <div className="relative h-12 rounded overflow-hidden border border-border bg-bg-3">
        <img
          src={tileUrl}
          data-testid="card-row-art"
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
        />
      </div>
      <div className="text-text text-[11px] text-center truncate" title={name}>
        {name}
      </div>
    </div>
  );
}
