import { describe, it, expect } from 'vitest';
import { readVarint, writeVarint } from './varint';

describe('varint', () => {
  const cases = [
    0, 1, 127, 128, 16383, 16384, 2097151, 2097152, 268435455, 268435456, 4294967295,
  ];

  for (const v of cases) {
    it(`round-trips ${v}`, () => {
      const buf: number[] = [];
      writeVarint(buf, v);
      const [out, len] = readVarint(Buffer.from(buf), 0);
      expect(out).toBe(v);
      expect(len).toBe(buf.length);
    });
  }

  it('throws on negative', () => {
    expect(() => writeVarint([], -1)).toThrow(/unsigned/i);
  });

  it('throws on non-integer', () => {
    expect(() => writeVarint([], 1.5)).toThrow();
  });

  it('throws on truncated buffer', () => {
    expect(() => readVarint(Buffer.from([0x80]), 0)).toThrow(/unexpected end/i);
  });

  it('reads multiple varints in sequence', () => {
    const buf: number[] = [];
    writeVarint(buf, 100);
    writeVarint(buf, 200);
    writeVarint(buf, 300);
    const b = Buffer.from(buf);
    const [a, la] = readVarint(b, 0);
    const [c, lc] = readVarint(b, la);
    const [d] = readVarint(b, la + lc);
    expect([a, c, d]).toEqual([100, 200, 300]);
  });
});
