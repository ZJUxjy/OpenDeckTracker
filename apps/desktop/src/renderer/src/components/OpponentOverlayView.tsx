import type { CSSProperties } from 'react';
import { OpponentCardsPanel } from './OpponentCardsPanel';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';

const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/**
 * Opponent overlay route. The hosting BrowserWindow is sized to the panel,
 * pinned to the left edge of the Hearthstone window. Includes a close
 * button at the top-right of the panel header.
 */
export function OpponentOverlayView() {
  const opponent = useDeckTrackerStore((s) => s.snapshot?.opponent);

  const close = (): void => {
    void window.hdt?.overlay?.closeFromWindow?.('opponent');
  };

  return (
    <div className="w-full h-full relative">
      <OpponentCardsPanel
        revealed={opponent?.revealed ?? []}
        graveyard={opponent?.graveyard ?? []}
      />
      <button
        type="button"
        aria-label="Close opponent overlay"
        onClick={close}
        style={NO_DRAG}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-text-mute hover:text-red hover:bg-bg-3 transition-colors text-sm leading-none"
      >
        ×
      </button>
    </div>
  );
}
