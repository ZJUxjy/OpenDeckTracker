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
 * CURRENT state (latest pool replacement wins, Talya stacks via
 * triggerCount) — what the user actually wants to know.
 */
export function partitionAnimalCompanionEffects(
  effects: readonly ActiveEffect[],
): {
  summary: AnimalCompanionSummary | null;
  others: ActiveEffect[];
} {
  const acEffects: ActiveEffect[] = [];
  const others: ActiveEffect[] = [];
  for (const e of effects) {
    if (ANIMAL_COMPANION_IDS.has(e.id)) acEffects.push(e);
    else others.push(e);
  }
  if (acEffects.length === 0) return { summary: null, others };

  // Pool replacement: latest by triggeredAt wins (HS rule — only the
  // most recent pool is active; earlier replacements are overridden).
  let latestReplacement: ActiveEffect | null = null;
  for (const e of acEffects) {
    if (!(e.id in POOL_REPLACEMENT_OFFSETS)) continue;
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
            costOffset: POOL_REPLACEMENT_OFFSETS[latestReplacement.id] ?? 0,
            pool:
              ((latestReplacement.params as AnimalCompanionPoolParams | undefined)?.pool) ??
              [],
          }
        : null,
    extraSummons,
    triggeredAt: earliest,
  };

  return { summary, others };
}

export const ANIMAL_COMPANION_EFFECT_IDS_FOR_TEST = ANIMAL_COMPANION_IDS;
