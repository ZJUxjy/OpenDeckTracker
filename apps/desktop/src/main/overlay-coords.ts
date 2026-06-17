export interface BoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convert tracker-reported window bounds to Electron DIP.
 * - Windows: GetWindowRect returns physical pixels → convert via screenToDipRect.
 * - macOS: CGWindow bounds are already points (== DIP) → identity.
 */
export function toDipBounds(
  platform: NodeJS.Platform,
  bounds: BoundsRect,
  screenToDipRect: (rect: BoundsRect) => BoundsRect,
): BoundsRect {
  if (platform === 'darwin') {
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }
  return screenToDipRect(bounds);
}
