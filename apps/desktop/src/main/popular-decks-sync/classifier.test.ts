import { describe, expect, it } from 'vitest';
import { classifyArchetypeLabel } from './classifier';

describe('classifyArchetypeLabel', () => {
  it.each([
    ['Aggro Hunter', 'Aggro'],
    ['Control Warrior', 'Control'],
    ['Tempo Mage', 'Tempo'],
    ['Combo Druid', 'Combo'],
    ['Ramp Druid', 'Ramp'],
  ])('maps %s → %s', (label, expected) => {
    expect(classifyArchetypeLabel(label)).toBe(expected);
  });

  it('falls back to Midrange for unknown labels', () => {
    expect(classifyArchetypeLabel('Big Priest')).toBe('Midrange');
    expect(classifyArchetypeLabel('Whatever Foo')).toBe('Midrange');
    expect(classifyArchetypeLabel('')).toBe('Midrange');
  });

  it('is case-insensitive', () => {
    expect(classifyArchetypeLabel('TEMPO ROGUE')).toBe('Tempo');
    expect(classifyArchetypeLabel('combo druid')).toBe('Combo');
  });

  it('prioritizes Combo over other matches when both keywords appear', () => {
    expect(classifyArchetypeLabel('Combo Tempo Hybrid')).toBe('Combo');
    expect(classifyArchetypeLabel('Aggro Combo')).toBe('Combo');
  });
});
