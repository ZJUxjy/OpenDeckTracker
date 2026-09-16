export interface DrawRiskInput {
  deckSize: number;
  handSize: number;
  handLimit: number | null;
  /** Damage on the most recent fatigue draw; null means not observed. */
  fatigueTaken: number | null;
  draws: number;
  fatigueImmune?: boolean;
}

export interface DrawRiskForecast {
  status: 'ready' | 'partial' | 'invalid';
  drawn: number | null;
  burned: number | null;
  fatigueDraws: number | null;
  fatigueDamage: number | null;
  nextFatigue: number | null;
}

/** Forecast uninterrupted ordinary draws; effects replacing draws require their own rules. */
export function forecastDrawRisk(input: DrawRiskInput): DrawRiskForecast {
  const values = [input.deckSize, input.handSize, input.draws, input.handLimit, input.fatigueTaken];
  if (values.some(value => value !== null && (!Number.isSafeInteger(value) || value < 0))) {
    return { status: 'invalid', drawn: null, burned: null, fatigueDraws: null, fatigueDamage: null, nextFatigue: null };
  }
  const cards = Math.min(input.deckSize, input.draws);
  const fatigueDraws = Math.max(0, input.draws - input.deckSize);
  const drawn = input.handLimit === null ? null : Math.min(cards, Math.max(0, input.handLimit - input.handSize));
  const nextFatigue = input.fatigueTaken === null ? null : input.fatigueTaken + 1;
  const fatigueDamage = fatigueDraws === 0 || input.fatigueImmune === true ? 0 : nextFatigue === null ? null
    : fatigueDraws * (2 * nextFatigue + fatigueDraws - 1) / 2;
  return {
    status: input.handLimit === null || input.fatigueTaken === null ? 'partial' : 'ready',
    drawn, burned: drawn === null ? null : cards - drawn, fatigueDraws, fatigueDamage, nextFatigue,
  };
}
