import { describe, expect, it } from 'vitest';
import { forecastDrawRisk } from './draw-risk';

describe('forecastDrawRisk', () => {
  it('separates cards entering hand, burns and increasing fatigue', () => {
    const result = forecastDrawRisk({ deckSize: 2, handSize: 9, handLimit: 10, fatigueTaken: 2, draws: 4 });
    expect(result).toMatchObject({ drawn: 1, burned: 1, fatigueDraws: 2, fatigueDamage: 7, nextFatigue: 3 });
  });
  it('preserves unknown fatigue independently of known overdraw', () => {
    expect(forecastDrawRisk({ deckSize: 1, handSize: 10, handLimit: 10, fatigueTaken: null, draws: 3 }))
      .toMatchObject({ burned: 1, fatigueDamage: null, nextFatigue: null });
  });
  it('handles zero draws, an empty deck, and increased hand limit', () => {
    expect(forecastDrawRisk({ deckSize: 0, handSize: 0, handLimit: 10, fatigueTaken: 0, draws: 3 }).fatigueDamage).toBe(6);
    expect(forecastDrawRisk({ deckSize: 8, handSize: 10, handLimit: 12, fatigueTaken: 0, draws: 3 }).burned).toBe(1);
    expect(forecastDrawRisk({ deckSize: 0, handSize: 0, handLimit: 10, fatigueTaken: null, draws: 0 }).fatigueDamage).toBe(0);
  });
  it('does not assume hand capacity or normalize invalid counts to safe-looking results', () => {
    expect(forecastDrawRisk({ deckSize: 3, handSize: 9, handLimit: null, fatigueTaken: 0, draws: 2 }).burned).toBeNull();
    expect(forecastDrawRisk({ deckSize: -1, handSize: 0, handLimit: 10, fatigueTaken: 0, draws: 1 }).status).toBe('invalid');
  });
});
