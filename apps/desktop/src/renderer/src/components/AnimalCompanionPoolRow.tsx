import { type CSSProperties } from 'react';
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
 * Aggregated "Animal Companion pool" row. Replaces the per-source-card
 * rendering for Tame Pet / Roam Free / Migrating Elekk / Talya
 * Earthstrider — what the user actually wants to know is the CURRENT
 * pool, not which cards modified it.
 *
 * Default: a single concise row with the pool's mana cost and any
 * extra-summon stacking. Hovering reveals the 3-beast pool detail.
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

  return (
    <li
      data-testid="animal-companion-pool-row"
      data-tracker-side={side}
      className="relative overflow-visible rounded-md border border-border bg-bg-2 mb-2 last:mb-0 group"
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
              className="shrink-0 text-text-mute text-[10px] uppercase tracking-wider"
            >
              {t('globalEffects.animalCompanionPool.hoverHint')}
            </span>
          ) : null}
        </div>
        <p className="text-text-dim text-xs mt-1 leading-relaxed pr-12">
          {body}
        </p>
      </div>

      {hasPool ? (
        <div
          data-testid="animal-companion-pool-detail"
          className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity absolute left-0 right-0 top-full mt-1 z-30 rounded-md border border-border bg-bg-2 shadow-xl p-2"
        >
          <div className="grid grid-cols-3 gap-2">
            {pool.map((cardId, i) => (
              <BeastDetail key={`${cardId}-${i}`} cardId={cardId} />
            ))}
          </div>
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
