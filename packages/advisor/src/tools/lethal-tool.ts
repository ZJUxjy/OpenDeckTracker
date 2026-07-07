import type { DeckTrackerSnapshot } from '@hdt/core';

type LethalSnapshot = Pick<DeckTrackerSnapshot, 'boardAttackToFace' | 'opposingHero'>;

export interface LethalPrecheckResult {
  hasLethal: boolean;
  damage: number;
  requiredHealth: number | null;
}

export interface LethalPrecheck {
  check(snapshot: DeckTrackerSnapshot): LethalPrecheckResult;
}

export function precheckLethal(snapshot: LethalSnapshot): LethalPrecheckResult {
  const damage = Math.max(0, snapshot.boardAttackToFace.friendly);
  const requiredHealth = snapshot.opposingHero?.effectiveHealth ?? null;

  return {
    hasLethal: requiredHealth !== null && damage >= requiredHealth,
    damage,
    requiredHealth,
  };
}

export const snapshotLethalPrecheck: LethalPrecheck = {
  check: precheckLethal,
};
