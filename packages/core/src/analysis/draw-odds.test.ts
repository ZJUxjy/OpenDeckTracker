import { describe, expect, it } from 'vitest';
import { calculateDrawOdds } from './draw-odds';

const remaining = [{ cardId: 'A', count: 2 }, { cardId: 'B', count: 1 }, { cardId: 'C', count: 7 }];
const base = { remaining, targets: ['A', 'B'], draws: 2 } as const;

describe('calculateDrawOdds', () => {
  it('distinguishes alternative answers from all components', () => {
    expect(calculateDrawOdds({ ...base, mode: 'any' }).probability).toBeCloseTo(24 / 45);
    expect(calculateDrawOdds({ ...base, mode: 'all' }).probability).toBeCloseTo(2 / 45);
  });
  it('respects known copies outside the draw horizon', () => {
    expect(calculateDrawOdds({ ...base, targets: ['B'], knownPositions: [
      { cardId: 'B', placement: 'bottom', insertedAt: 1 },
    ] }).probability).toBe(0);
    expect(calculateDrawOdds({ ...base, targets: ['B'], knownPositions: [
      { cardId: 'B', placement: 'top', insertedAt: 1 },
    ] }).probability).toBe(1);
  });
  it('subtracts all known copies before random sampling and includes reached bottom copies', () => {
    const positions = [{ cardId: 'A', placement: 'top' as const, insertedAt: 1 },
      { cardId: 'B', placement: 'bottom' as const, insertedAt: 2 }];
    expect(calculateDrawOdds({ ...base, knownPositions: positions }).probability).toBe(1);
    expect(calculateDrawOdds({ ...base, knownPositions: positions, mode: 'all' }).probability).toBe(0);
    expect(calculateDrawOdds({ ...base, knownPositions: positions, mode: 'all', draws: 10 }).probability).toBe(1);
    expect(calculateDrawOdds({ ...base, targets: ['A'], draws: 1,
      knownPositions: [{ cardId: 'B', placement: 'bottom', insertedAt: 1 }] }).probability).toBeCloseTo(2 / 9);
  });
  it('accounts for components already in hand only when requested', () => {
    expect(calculateDrawOdds({ ...base, mode: 'all', held: ['B'] }).probability).toBeCloseTo(17 / 45);
    expect(calculateDrawOdds({ ...base, draws: 0, mode: 'all', held: ['A', 'B'] }).probability).toBe(1);
  });
  it('handles empty selections, absent targets, duplicate IDs and excess draws', () => {
    expect(calculateDrawOdds({ ...base, targets: [] }).status).toBe('no-targets');
    expect(calculateDrawOdds({ ...base, targets: ['absent'], mode: 'all' }).probability).toBe(0);
    expect(calculateDrawOdds({ ...base, targets: ['A', 'A'], draws: 30 }).probability).toBe(1);
    expect(calculateDrawOdds({ ...base, remaining: [], draws: 1 }).probability).toBe(0);
  });
  it('declines inconsistent state instead of inventing exact odds', () => {
    expect(calculateDrawOdds({ ...base, observedDeckSize: 9 }).status).toBe('inconsistent');
    expect(calculateDrawOdds({ ...base, draws: NaN }).status).toBe('inconsistent');
    expect(calculateDrawOdds({ ...base, remaining: [{ cardId: 'A', count: -1 }] }).probability).toBeNull();
    expect(calculateDrawOdds({ ...base, knownPositions: [
      { cardId: 'missing', placement: 'top', insertedAt: 1 },
    ] }).probability).toBeNull();
  });
  it('matches exhaustive unordered two-card draws for any and all modes', () => {
    const cards = ['A', 'A', 'B', 'C', 'C'];
    for (const mode of ['any', 'all'] as const) {
      let successes = 0;
      let total = 0;
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
        const drawn = [cards[i], cards[j]];
        if (mode === 'all' ? ['A', 'B'].every(id => drawn.includes(id)) : drawn.some(id => id === 'A' || id === 'B')) successes++;
        total++;
      }
      expect(calculateDrawOdds({ remaining: [{ cardId: 'A', count: 2 }, { cardId: 'B', count: 1 },
        { cardId: 'C', count: 2 }], targets: ['A', 'B'], mode, draws: 2 }).probability).toBeCloseTo(successes / total);
    }
  });
});
