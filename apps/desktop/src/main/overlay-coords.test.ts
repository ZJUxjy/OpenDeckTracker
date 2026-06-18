import { describe, expect, it, vi } from 'vitest';
import { toDipBounds } from './overlay-coords';

describe('toDipBounds', () => {
  const px = { x: 100, y: 200, width: 1600, height: 900 };

  it('returns bounds unchanged on darwin (already DIP)', () => {
    const screenToDipRect = vi.fn();
    expect(toDipBounds('darwin', px, screenToDipRect)).toEqual(px);
    expect(screenToDipRect).not.toHaveBeenCalled();
  });

  it('converts via screenToDipRect on win32 (physical px → DIP)', () => {
    const dip = { x: 50, y: 100, width: 800, height: 450 };
    const screenToDipRect = vi.fn(() => dip);
    expect(toDipBounds('win32', px, screenToDipRect)).toEqual(dip);
    expect(screenToDipRect).toHaveBeenCalledWith(px);
  });
});
