import { type CSSProperties } from 'react';
import type { ActiveEffect } from '@hdt/core';
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
 * Single row in the GlobalEffectsPanel for a generic effect: source-
 * card portrait sliver on the right, title + body on the left, with
 * optional pending and stack-count badges.
 *
 * Animal Companion pool effects (Tame Pet / Roam Free / Migrating
 * Elekk / Talya Earthstrider) are NOT routed through this component —
 * the parent panel collapses them into a single `AnimalCompanionPoolRow`
 * keyed on the current pool state.
 */
export function GlobalEffectRow({ effect }: GlobalEffectRowProps) {
  const { t } = useTranslation();
  const tileUrl = useCardTileUrl(effect.sourceCardId);
  const title = t(`globalEffects.${effect.id}.title`);
  const body = t(`globalEffects.${effect.id}.body`);

  return (
    <li
      data-testid="global-effect-row"
      className="relative overflow-hidden rounded-md border border-border bg-white/5 mb-2 last:mb-0"
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
          {effect.pending === true ? (
            <span
              data-testid="global-effect-pending"
              title={t('globalEffects.pendingTooltip')}
              className="shrink-0 inline-flex items-center justify-center h-5 px-1.5 rounded-full border border-amber/50 text-amber text-[10px] font-medium uppercase tracking-wider"
            >
              {t('globalEffects.pendingBadge')}
            </span>
          ) : null}
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
      </div>
    </li>
  );
}
