import type { CSSProperties } from 'react';
import { LiveDeckPanel } from './LiveDeckPanel';

const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/**
 * Player overlay route. The hosting BrowserWindow is sized to the panel,
 * pinned to the right edge of the Hearthstone window — so the panel fills
 * its window entirely. A small close button overlays the top-right
 * corner of the panel header so the user can dismiss the overlay; that
 * disables the corresponding setting across all renderers.
 */
export function OverlayView() {
  const close = (): void => {
    void window.hdt?.overlay?.closeFromWindow?.('player');
  };
  return (
    <div className="w-full h-full relative">
      <LiveDeckPanel compact />
      <button
        type="button"
        aria-label="Close player overlay"
        onClick={close}
        style={NO_DRAG}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-text-mute hover:text-red hover:bg-bg-3 transition-colors text-sm leading-none"
      >
        ×
      </button>
    </div>
  );
}
