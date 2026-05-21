/**
 * Cards whose mana cost drops by 1 per qualifying event (classic "Giant" style).
 * Used for hover extra-display: show discount and effective cost.
 */
export type CostReductionScope = 'game' | 'turn';

export type CostReductionDriver = 'counter' | 'lastPlayedCardCost';

export interface CostReductionRule {
  /** Counter key in `ExtraDisplaySnapshot.counters` (ignored when driver is lastPlayedCardCost). */
  counterKey?: string;
  scope: CostReductionScope;
  driver?: CostReductionDriver;
  /** Shown in hover detail, e.g. "邪能法术". */
  eventLabelZh?: string;
}

/** All Standard-history giant-style cost reducers we track in the deck tracker. */
export const COST_REDUCTION_BY_CARD_ID: Readonly<Record<string, CostReductionRule>> = {
  CATA_529: {
    counterKey: 'felSpellsCastThisGame',
    scope: 'game',
    eventLabelZh: '邪能法术',
  },
  CORE_DMF_060: {
    counterKey: 'spellsCastThisGame',
    scope: 'game',
    eventLabelZh: '法术',
  },
  CORE_OG_028: {
    counterKey: 'friendlyTotemsSummonedThisGame',
    scope: 'game',
    eventLabelZh: '图腾',
  },
  CORE_REV_838: {
    counterKey: 'friendlyTotemsSummonedThisGame',
    scope: 'game',
    eventLabelZh: '图腾',
  },
  CORE_ICC_090: {
    counterKey: 'totalOverloadedCrystalsThisGame',
    scope: 'game',
    eventLabelZh: '过载水晶',
  },
  END_030: {
    counterKey: 'totalOverloadedCrystalsThisGame',
    scope: 'game',
    eventLabelZh: '过载水晶',
  },
  EDR_477: {
    counterKey: 'heroPowerUsesThisGame',
    scope: 'game',
    eventLabelZh: '英雄技能',
  },
  CATA_568: {
    counterKey: 'friendlyCharacterAttacksThisGame',
    scope: 'game',
    eventLabelZh: '友方攻击',
  },
  DINO_409: {
    counterKey: 'cardsPlayedNotFromInitialDeckThisGame',
    scope: 'game',
    eventLabelZh: '套牌外卡牌',
  },
  CORE_MAW_020: {
    counterKey: 'cardsPlayedThisTurn',
    scope: 'turn',
    eventLabelZh: '本回合已使用牌',
  },
  FIR_919: {
    counterKey: 'cardsPlayedThisTurn',
    scope: 'turn',
    eventLabelZh: '本回合已使用牌',
  },
  END_004: {
    counterKey: 'minionDeathsThisTurnBothPlayers',
    scope: 'turn',
    eventLabelZh: '本回合随从死亡',
  },
  CATA_616: {
    driver: 'lastPlayedCardCost',
    scope: 'game',
    eventLabelZh: '上一张已使用牌费用',
  },
};

export function getCostReductionRule(cardId: string): CostReductionRule | null {
  return COST_REDUCTION_BY_CARD_ID[cardId] ?? null;
}

export function formatCostReductionHoverLine(
  baseCost: number,
  rule: CostReductionRule,
  counters: Readonly<Record<string, number>>,
): string {
  const safeBase = Math.max(0, baseCost);
  let discount = 0;
  let count = 0;

  if (rule.driver === 'lastPlayedCardCost') {
    count = counters.lastPlayedCardCost ?? 0;
    discount = Math.min(safeBase, count);
  } else {
    count = counters[rule.counterKey ?? ''] ?? 0;
    discount = Math.min(safeBase, count);
  }

  const currentCost = Math.max(0, safeBase - discount);
  const label = rule.eventLabelZh ?? '进度';
  if (rule.driver === 'lastPlayedCardCost') {
    return `${label}：${count}；费用减少 ${discount}，当前费用 ${currentCost}`;
  }
  if (rule.scope === 'turn') {
    return `${label}：${count}；费用减少 ${discount}，当前费用 ${currentCost}`;
  }
  return `本局${label}：${count}；费用减少 ${discount}，当前费用 ${currentCost}`;
}
