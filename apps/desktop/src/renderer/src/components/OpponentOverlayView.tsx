import { OpponentCardsPanel } from './OpponentCardsPanel';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';

/**
 * Opponent overlay route. The hosting BrowserWindow is sized to the panel,
 * pinned to the right edge of the Hearthstone window.
 */
export function OpponentOverlayView() {
  const opponent = useDeckTrackerStore((s) => s.snapshot?.opponent);

  return (
    <div className="w-full h-full">
      <OpponentCardsPanel
        revealed={opponent?.revealed ?? []}
        graveyard={opponent?.graveyard ?? []}
      />
    </div>
  );
}
