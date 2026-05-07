import type { ActiveEffect, AnimalCompanionPoolParams } from '@hdt/core';
import type { AnimalCompanionSummary } from '../components/AnimalCompanionPoolRow';

/**
 * EffectDef ids that REPLACE the Animal Companion pool. Each carries a
 * `params.pool` of 3 beast cardIds plus an implicit cost offset.
 */
const POOL_REPLACEMENT_OFFSETS: Record<string, number> = {
  'tame-pet': 1,
  'migrating-elekk': 1,
  'roam-free': 2,
};

/** EffectDef ids that ADD extra Animal Companion summons (Talya). */
const EXTRA_SUMMON_IDS = new Set<string>(['talya-earthstrider']);

const ANIMAL_COMPANION_IDS = new Set<string>([
  ...Object.keys(POOL_REPLACEMENT_OFFSETS),
  ...EXTRA_SUMMON_IDS,
]);

/**
 * Split active effects into the Animal Companion summary plus
 * everything else. The summary collapses Tame Pet / Roam Free /
 * Migrating Elekk / Talya Earthstrider into a single row keyed on the
 * CURRENT state — latest replacement's pool wins, but the cost
 * offset is the SUM of ALL active replacements (HS rule: each
 * "Beasts that cost (X) more" stacks on top of the previous pool's
 * cost, so chained casts compound). Talya's `triggerCount` sums into
 * the extra-summon total.
 */
export function partitionAnimalCompanionEffects(
  effects: readonly ActiveEffect[],
): {
  summary: AnimalCompanionSummary | null;
  others: ActiveEffect[];
  /**
   * Effective row count for tab-badge display: 1 if the AC cluster
   * collapses to a summary, plus the others. Lets renderers show a
   * count that matches the visual row count rather than the raw
   * `effects.length` (which over-counts collapsed AC siblings).
   */
  effectiveRowCount: number;
} {
  const acEffects: ActiveEffect[] = [];
  const others: ActiveEffect[] = [];
  for (const e of effects) {
    if (ANIMAL_COMPANION_IDS.has(e.id)) acEffects.push(e);
    else others.push(e);
  }
  if (acEffects.length === 0) {
    return { summary: null, others, effectiveRowCount: others.length };
  }

  // Pool replacement: latest by triggeredAt wins for the actual pool
  // (only the most recent pool is in effect). Cost offset is the SUM
  // of all replacements' offsets — chained casts stack, so Tame Pet
  // (+1) followed by Migrating Elekk (+1) means current beasts cost
  // 3+1+1 = 5 mana.
  let latestReplacement: ActiveEffect | null = null;
  let totalCostOffset = 0;
  for (const e of acEffects) {
    if (!(e.id in POOL_REPLACEMENT_OFFSETS)) continue;
    const offset = POOL_REPLACEMENT_OFFSETS[e.id] ?? 0;
    // Each TRIGGER of the same card stacks too (a 2nd Tame Pet adds
    // another +1). The registry stores triggerCount for repeated
    // casts of the same card.
    totalCostOffset += offset * e.triggerCount;
    if (latestReplacement === null || e.triggeredAt > latestReplacement.triggeredAt) {
      latestReplacement = e;
    }
  }

  // Extra summons: sum of triggerCounts across all Talya plays.
  let extraSummons = 0;
  for (const e of acEffects) {
    if (EXTRA_SUMMON_IDS.has(e.id)) extraSummons += e.triggerCount;
  }

  const earliest = acEffects.reduce(
    (min, e) => (e.triggeredAt < min ? e.triggeredAt : min),
    Number.POSITIVE_INFINITY,
  );

  const summary: AnimalCompanionSummary = {
    poolReplacement:
      latestReplacement !== null
        ? {
            sourceCardId: latestReplacement.sourceCardId,
            costOffset: totalCostOffset,
            pool:
              ((latestReplacement.params as AnimalCompanionPoolParams | undefined)?.pool) ??
              [],
          }
        : null,
    extraSummons,
    triggeredAt: earliest,
  };

  return {
    summary,
    others,
    effectiveRowCount: 1 + others.length,
  };
}

export const ANIMAL_COMPANION_EFFECT_IDS_FOR_TEST = ANIMAL_COMPANION_IDS;
