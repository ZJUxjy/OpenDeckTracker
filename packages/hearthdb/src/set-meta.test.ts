import { describe, it, expect } from 'vitest';
import { STANDARD_SET_CODES, SET_LABELS } from './set-meta';

describe('STANDARD_SET_CODES', () => {
  it('is non-empty', () => {
    expect(STANDARD_SET_CODES.length).toBeGreaterThan(0);
  });

  it('every entry matches /^[A-Z0-9_]+$/', () => {
    for (const code of STANDARD_SET_CODES) {
      expect(code).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it('contains no duplicates', () => {
    const unique = new Set(STANDARD_SET_CODES);
    expect(unique.size).toBe(STANDARD_SET_CODES.length);
  });
});

describe('SET_LABELS', () => {
  it('every Standard code has both locale labels', () => {
    for (const code of STANDARD_SET_CODES) {
      const label = SET_LABELS[code];
      expect(label).toBeDefined();
      expect(typeof label!['en-US']).toBe('string');
      expect(label!['en-US'].length).toBeGreaterThan(0);
      expect(typeof label!['zh-CN']).toBe('string');
      expect(label!['zh-CN'].length).toBeGreaterThan(0);
    }
  });
});
