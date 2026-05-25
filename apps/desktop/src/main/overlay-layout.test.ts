import { describe, expect, it } from 'vitest';
import { computeOverlayPanelBounds } from './overlay-layout';

describe('computeOverlayPanelBounds', () => {
  it('uses 80% of the Hearthstone window height up to the 1080p cap', () => {
    expect(
      computeOverlayPanelBounds({
        x: 100,
        y: 50,
        width: 1920,
        height: 1080,
      }),
    ).toEqual({
      opponent: { x: 108, y: 158, width: 320, height: 864 },
      player: { x: 1692, y: 158, width: 320, height: 864 },
    });
  });

  it('caps the overlay height at 80% of a 1080p Hearthstone window', () => {
    expect(
      computeOverlayPanelBounds({
        x: 0,
        y: 0,
        width: 2560,
        height: 1440,
      }),
    ).toEqual({
      opponent: { x: 8, y: 144, width: 320, height: 864 },
      player: { x: 2232, y: 144, width: 320, height: 864 },
    });
  });

  it('keeps smaller Hearthstone windows proportional', () => {
    expect(
      computeOverlayPanelBounds({
        x: 10,
        y: 20,
        width: 1280,
        height: 720,
      }),
    ).toEqual({
      opponent: { x: 18, y: 92, width: 320, height: 576 },
      player: { x: 962, y: 92, width: 320, height: 576 },
    });
  });
});
