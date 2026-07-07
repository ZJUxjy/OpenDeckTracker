export interface ManaCombinationInput {
  available: number;
  costs: readonly number[];
}

export interface ManaCombinationResult {
  canPay: boolean;
  totalCost: number;
  remaining: number;
  shortfall: number;
}

export function checkManaCombination(input: ManaCombinationInput): ManaCombinationResult {
  const available = normalizeMana(input.available);
  const totalCost = input.costs.reduce((sum, cost) => sum + normalizeMana(cost), 0);

  return {
    canPay: totalCost <= available,
    totalCost,
    remaining: Math.max(0, available - totalCost),
    shortfall: Math.max(0, totalCost - available),
  };
}

function normalizeMana(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}
