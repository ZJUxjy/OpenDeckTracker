import { type CSSProperties } from 'react';
import type { ActiveEffect, AnimalCompanionPoolParams } from '@hdt/core';
import { useCardTileUrl } from '../hooks/use-card-image-url';
import { useTranslation } from '../i18n';

const ART_MASK_STYLE: CSSProperties = {
  maskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
};

interface GlobalEffectRowProps {
  effect: ActiveEffect;
}

/**
 * Single row in the GlobalEffectsPanel. Source-card portrait sliver
 * on the right (same masked treatment as the deck-list rows), title
 * and short body description on the left, optional params region for
 * effects that carry data (e.g. Tame Pet's 3 random beasts).
 */
export function GlobalEffectRow({ effect }: GlobalEffectRowProps) {
  const { t } = useTranslation();
  const tileUrl = useCardTileUrl(effect.sourceCardId);
  const title = t(`globalEffects.${effect.id}.title`);
  const body = t(`globalEffects.${effect.id}.body`);

  return (
    <li
      data-testid="global-effect-row"
      className="relative overflow-hidden rounded-md border border-border bg-bg-2 mb-2 last:mb-0"
    >
      <img
        src={tileUrl}
        data-testid="global-effect-art"
        alt=""
        aria-hidden
        style={ART_MASK_STYLE}
        className="absolute right-0 top-0 h-full w-2/5 object-cover object-right pointer-events-none select-none z-0"
      />
      <div className="relative z-10 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-text font-semibold text-sm flex-1 min-w-0 truncate">
            {title}
          </div>
          {effect.triggerCount > 1 ? (
            <span
              data-testid="global-effect-stack-count"
              className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-accent text-bg text-[11px] font-bold tabular-nums"
            >
              ×{effect.triggerCount}
            </span>
          ) : null}
        </div>
        <p className="text-text-dim text-xs mt-1 leading-relaxed pr-12">
          {body}
        </p>
        {hasAnimalCompanionPool(effect) ? (
          <AnimalCompanionPool pool={effect.params.pool} />
        ) : null}
      </div>
    </li>
  );
}

interface AnimalCompanionPoolProps {
  pool: string[];
}

function AnimalCompanionPool({ pool }: AnimalCompanionPoolProps) {
  return (
    <div
      data-testid="global-effect-params"
      className="mt-2 grid grid-cols-3 gap-1.5"
    >
      {pool.map((cardId, i) => (
        <BeastTile key={`${cardId}-${i}`} cardId={cardId} />
      ))}
    </div>
  );
}

function BeastTile({ cardId }: { cardId: string }) {
  const tileUrl = useCardTileUrl(cardId);
  return (
    <div className="relative h-10 rounded overflow-hidden border border-border bg-bg-3">
      <img
        src={tileUrl}
        data-testid="card-row-art"
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
      />
    </div>
  );
}

interface AnimalCompanionEffect extends ActiveEffect<AnimalCompanionPoolParams> {
  id: 'tame-pet' | 'roam-free';
  params: AnimalCompanionPoolParams;
}

function hasAnimalCompanionPool(effect: ActiveEffect): effect is AnimalCompanionEffect {
  if (effect.id !== 'tame-pet' && effect.id !== 'roam-free') return false;
  const params = effect.params as { pool?: unknown } | undefined;
  return Array.isArray(params?.pool) && (params!.pool as unknown[]).length > 0;
}
