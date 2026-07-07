import { describe, expect, test } from 'vitest';

import { checkManaCombination } from './mana-math-tool';

describe('mana math tool', () => {
  test('confirms an exact-cost card combination can be paid', () => {
    expect(checkManaCombination({ available: 7, costs: [2, 3, 2] })).toEqual({
      canPay: true,
      totalCost: 7,
      remaining: 0,
      shortfall: 0,
    });
  });

  test('reports the shortfall for an unaffordable card combination', () => {
    expect(checkManaCombination({ available: 6, costs: [4, 3] })).toEqual({
      canPay: false,
      totalCost: 7,
      remaining: 0,
      shortfall: 1,
    });
  });

  test('treats negative costs and mana as zero', () => {
    expect(checkManaCombination({ available: -1, costs: [1, -2] })).toEqual({
      canPay: false,
      totalCost: 1,
      remaining: 0,
      shortfall: 1,
    });
  });
});
