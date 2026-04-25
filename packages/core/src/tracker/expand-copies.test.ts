import { describe, it, expect } from 'vitest';
import { expandDeckToCopies } from './expand-copies';

describe('expandDeckToCopies', () => {
  it('expands aggregated card count into physical copies', () => {
    const result = expandDeckToCopies([{ cardId: 'Fireball', count: 2 }]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      copyKey: 'Fireball#0',
      cardId: 'Fireball',
      ordinal: 0,
    });
    expect(result[1]).toEqual({
      copyKey: 'Fireball#1',
      cardId: 'Fireball',
      ordinal: 1,
    });
  });

  it('produces stable deterministic keys across calls', () => {
    const a = expandDeckToCopies([{ cardId: 'EX1_277', count: 3 }]);
    const b = expandDeckToCopies([{ cardId: 'EX1_277', count: 3 }]);
    expect(a).toEqual(b);
    expect(a.map((c) => c.copyKey)).toEqual([
      'EX1_277#0',
      'EX1_277#1',
      'EX1_277#2',
    ]);
  });

  it('ignores entries with count 0', () => {
    const result = expandDeckToCopies([{ cardId: 'EX1_277', count: 0 }]);
    expect(result).toEqual([]);
  });

  it('ignores entries with negative count', () => {
    const result = expandDeckToCopies([{ cardId: 'EX1_277', count: -1 }]);
    expect(result).toEqual([]);
  });

  it('handles multiple cards with mixed counts', () => {
    const result = expandDeckToCopies([
      { cardId: 'Fireball', count: 2 },
      { cardId: 'Frostbolt', count: 1 },
      { cardId: 'Invalid', count: 0 },
    ]);
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.copyKey)).toEqual([
      'Fireball#0',
      'Fireball#1',
      'Frostbolt#0',
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(expandDeckToCopies([])).toEqual([]);
  });

  it('handles count of 1 correctly', () => {
    const result = expandDeckToCopies([{ cardId: 'CS2_106', count: 1 }]);
    expect(result).toHaveLength(1);
    expect(result[0]!.copyKey).toBe('CS2_106#0');
    expect(result[0]!.ordinal).toBe(0);
  });
});
