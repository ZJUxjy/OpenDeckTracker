import type { ActiveEffect } from '@hdt/core';
import { GlobalEffectRow } from './GlobalEffectRow';
import { useTranslation } from '../i18n';

interface GlobalEffectsPanelProps {
  side: 'player' | 'opponent';
  effects: readonly ActiveEffect[];
}

/**
 * One side's active global-effects list. Empty-state copy when no
 * effects are live; otherwise a vertical list of GlobalEffectRow
 * sorted by triggeredAt ascending (oldest first — first-played
 * effects sit at the top, matching the order they affect the match).
 */
export function GlobalEffectsPanel({ side, effects }: GlobalEffectsPanelProps) {
  const { t } = useTranslation();

  const emptyBodyKey =
    side === 'opponent' ? 'globalEffects.emptyBodyOpponent' : 'globalEffects.emptyBodyPlayer';

  if (effects.length === 0) {
    return (
      <div
        data-tracker-side={side}
        className="w-full h-full flex flex-col items-center justify-center text-center px-6"
      >
        <div className="text-text-dim text-sm font-medium">
          {t('globalEffects.emptyTitle')}
        </div>
        <p className="text-text-mute text-xs mt-2 leading-relaxed max-w-xs">
          {t(emptyBodyKey)}
        </p>
      </div>
    );
  }

  // The registry already returns entries sorted by triggeredAt
  // ascending; no need to re-sort here.
  return (
    <ul
      data-tracker-side={side}
      className="w-full h-full overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent list-none"
    >
      {effects.map((effect) => (
        <GlobalEffectRow key={`${effect.id}-${effect.triggeredAt}`} effect={effect} />
      ))}
    </ul>
  );
}
