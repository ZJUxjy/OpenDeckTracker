import { describe, expect, test } from 'vitest';

import type { LethalPrecheck } from './lethal-tool';
import { precheckLethal, snapshotLethalPrecheck } from './lethal-tool';

describe('lethal precheck', () => {
  test('reports lethal when friendly face damage reaches opposing effective health', () => {
    const result = precheckLethal({
      boardAttackToFace: { friendly: 12, opposing: 0 },
      opposingHero: { health: 10, armor: 2, effectiveHealth: 12 },
    });

    expect(result).toEqual({
      hasLethal: true,
      damage: 12,
      requiredHealth: 12,
    });
  });

  test('reports no lethal when available face damage is short', () => {
    const result = precheckLethal({
      boardAttackToFace: { friendly: 7, opposing: 0 },
      opposingHero: { health: 10, armor: 1, effectiveHealth: 11 },
    });

    expect(result).toEqual({
      hasLethal: false,
      damage: 7,
      requiredHealth: 11,
    });
  });

  test('does not claim lethal without opposing hero vitals', () => {
    const result = precheckLethal({
      boardAttackToFace: { friendly: 30, opposing: 0 },
      opposingHero: null,
    });

    expect(result).toEqual({
      hasLethal: false,
      damage: 30,
      requiredHealth: null,
    });
  });

  test('exports a precheck implementation for service injection', () => {
    const precheck: LethalPrecheck = snapshotLethalPrecheck;

    expect(precheck.check).toBe(precheckLethal);
  });
});
