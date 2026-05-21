import { describe, expect, it } from 'vitest';
import { formatCostReductionHoverLine, getCostReductionRule } from './cost-reduction-cards';

describe('cost-reduction-cards', () => {
  it('formats game-scoped discount from counters', () => {
    const rule = getCostReductionRule('CATA_529');
    expect(rule).not.toBeNull();
    const line = formatCostReductionHoverLine(6, rule!, { felSpellsCastThisGame: 3 });
    expect(line).toBe('本局邪能法术：3；费用减少 3，当前费用 3');
  });

  it('formats turn-scoped discount', () => {
    const rule = getCostReductionRule('FIR_919');
    expect(rule).not.toBeNull();
    const line = formatCostReductionHoverLine(4, rule!, { cardsPlayedThisTurn: 2 });
    expect(line).toBe('本回合已使用牌：2；费用减少 2，当前费用 2');
  });

  it('formats Gronn Giant from last played card cost', () => {
    const rule = getCostReductionRule('CATA_616');
    expect(rule).not.toBeNull();
    const line = formatCostReductionHoverLine(9, rule!, { lastPlayedCardCost: 4 });
    expect(line).toBe('上一张已使用牌费用：4；费用减少 4，当前费用 5');
  });
});
