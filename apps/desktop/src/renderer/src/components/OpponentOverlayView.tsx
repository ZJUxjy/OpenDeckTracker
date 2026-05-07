import type { CSSProperties } from 'react';
import { OpponentCardsPanel } from './OpponentCardsPanel';
import { TrackerPanelTabs } from './TrackerPanelTabs';
import { GlobalEffectsPanel } from './GlobalEffectsPanel';
import {
  useDeckTrackerStore,
  useOpposingEffects,
} from '../stores/deck-tracker-store';

const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/**
 * Opponent overlay route. Wraps `OpponentCardsPanel` in a
 * TrackerPanelTabs container so the user can pivot between revealed
 * opponent cards and the opposing side's active global effects.
 */
export function OpponentOverlayView() {
  const opponent = useDeckTrackerStore((s) => s.snapshot?.opponent);
  const opposingEffects = useOpposingEffects();

  const close = (): void => {
    void window.hdt?.overlay?.closeFromWindow?.('opponent');
  };

  return (
    <div className="w-full h-full relative">
      <TrackerPanelTabs
        side="opponent"
        effectsCount={opposingEffects.length}
        deckSlot={
          <OpponentCardsPanel
            revealed={opponent?.revealed ?? []}
            graveyard={opponent?.graveyard ?? []}
          />
        }
        effectsSlot={
          <GlobalEffectsPanel side="opponent" effects={opposingEffects} />
        }
      />
      <button
        type="button"
        aria-label="Close opponent overlay"
        onClick={close}
        style={NO_DRAG}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-text-mute hover:text-red hover:bg-bg-3 transition-colors text-sm leading-none z-20"
      >
        ×
      </button>
    </div>
  );
}
