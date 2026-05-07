import type { ActiveEffect } from '@hdt/core';
import { GlobalEffectRow } from './GlobalEffectRow';
import { AnimalCompanionPoolRow } from './AnimalCompanionPoolRow';
import { partitionAnimalCompanionEffects } from '../lib/animal-companion-effects';
import { useTranslation } from '../i18n';

interface GlobalEffectsPanelProps {
  side: 'player' | 'opponent';
  effects: readonly ActiveEffect[];
}

/**
 * One side's active global-effects list. Empty-state copy when no
 * effects are live; otherwise a vertical list. The Animal Companion
 * cluster (Tame Pet / Roam Free / Migrating Elekk / Talya
 * Earthstrider) is collapsed into a single semantic "pool" row — the
 * user cares about the CURRENT pool, not which cards modified it.
 */
export function GlobalEffectsPanel({ side, effects }: GlobalEffectsPanelProps) {
  const { t } = useTranslation();

  const emptyBodyKey =
    side === 'opponent' ? 'globalEffects.emptyBodyOpponent' : 'globalEffects.emptyBodyPlayer';

  if (effects.length === 0) {
    return (
      <div
        data-tracker-side={side}
        className="w-full h-full flex flex-col items-center justify-center text-center px-6 bg-bg-2 border border-border rounded-lg shadow-xl"
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

  const { summary, others } = partitionAnimalCompanionEffects(effects);

  // Sort merged list by the synthetic / per-effect triggeredAt so the
  // earliest-played effect appears first regardless of which cluster
  // it belongs to. The registry already returns the per-effect array
  // sorted ascending; we just need to splice the synthesized AC row in
  // at the right spot.
  type Row =
    | { kind: 'ac'; triggeredAt: number }
    | { kind: 'effect'; effect: ActiveEffect; triggeredAt: number };
  const rows: Row[] = [];
  if (summary !== null) rows.push({ kind: 'ac', triggeredAt: summary.triggeredAt });
  for (const e of others) rows.push({ kind: 'effect', effect: e, triggeredAt: e.triggeredAt });
  rows.sort((a, b) => a.triggeredAt - b.triggeredAt);

  return (
    <ul
      data-tracker-side={side}
      className="w-full h-full overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent list-none bg-bg-2 border border-border rounded-lg shadow-xl"
    >
      {rows.map((row, idx) =>
        row.kind === 'ac' ? (
          <AnimalCompanionPoolRow
            key={`ac-summary-${idx}`}
            summary={summary!}
            side={side}
          />
        ) : (
          <GlobalEffectRow
            key={`${row.effect.id}-${row.effect.triggeredAt}`}
            effect={row.effect}
          />
        ),
      )}
    </ul>
  );
}
