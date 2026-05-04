import { describe, it, expect } from 'vitest';
import { getRarityToken, getRarityCostBg } from '../src/lib/rarity';

describe('getRarityToken', () => {
  it('maps each known rarity', () => {
    expect(getRarityToken('FREE')).toBe('--rarity-free');
    expect(getRarityToken('COMMON')).toBe('--rarity-common');
    expect(getRarityToken('RARE')).toBe('--rarity-rare');
    expect(getRarityToken('EPIC')).toBe('--rarity-epic');
    expect(getRarityToken('LEGENDARY')).toBe('--rarity-legendary');
  });

  it('falls back to common for undefined', () => {
    expect(getRarityToken(undefined)).toBe('--rarity-common');
  });
});

describe('getRarityCostBg', () => {
  it('returns bg-rarity-<r> with a token-only text class', () => {
    const cls = getRarityCostBg('LEGENDARY');
    expect(cls).toContain('bg-rarity-legendary');
    expect(cls).toMatch(/text-(bg|text|rarity-)/);
  });

  it('uses light text on the dark FREE tint', () => {
    expect(getRarityCostBg('FREE')).toContain('text-text');
  });

  it('uses dark text on bright tints', () => {
    expect(getRarityCostBg('LEGENDARY')).toContain('text-bg');
    expect(getRarityCostBg('EPIC')).toContain('text-bg');
    expect(getRarityCostBg('RARE')).toContain('text-bg');
    expect(getRarityCostBg('COMMON')).toContain('text-bg');
  });

  it('falls back to common when undefined', () => {
    expect(getRarityCostBg(undefined)).toContain('bg-rarity-common');
  });
});
