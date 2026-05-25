import type { Rectangle } from 'electron';

const PANEL_WIDTH = 320;
const PANEL_HEIGHT_RATIO = 0.8;
const PANEL_TOP_PAD_RATIO = 0.1;
const PANEL_EDGE_GAP = 8;
const OVERLAY_HEIGHT_CAP_BASE = 1080;
const MAX_PANEL_HEIGHT = Math.round(OVERLAY_HEIGHT_CAP_BASE * PANEL_HEIGHT_RATIO);

export interface OverlayPanelBounds {
  opponent: Rectangle;
  player: Rectangle;
}

export function computeOverlayPanelBounds(hearthstoneBounds: Rectangle): OverlayPanelBounds {
  const height = Math.min(
    Math.round(hearthstoneBounds.height * PANEL_HEIGHT_RATIO),
    MAX_PANEL_HEIGHT,
  );
  const y = hearthstoneBounds.y + Math.round(hearthstoneBounds.height * PANEL_TOP_PAD_RATIO);

  return {
    opponent: {
      x: hearthstoneBounds.x + PANEL_EDGE_GAP,
      y,
      width: PANEL_WIDTH,
      height,
    },
    player: {
      x: hearthstoneBounds.x + hearthstoneBounds.width - PANEL_WIDTH - PANEL_EDGE_GAP,
      y,
      width: PANEL_WIDTH,
      height,
    },
  };
}
