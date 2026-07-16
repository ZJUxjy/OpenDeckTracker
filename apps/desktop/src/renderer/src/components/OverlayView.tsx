import { useEffect, type CSSProperties } from 'react';
import { LiveDeckPanel } from './LiveDeckPanel';
import { LiveNarrationPanel } from './LiveNarrationPanel';
import { AdvisorPanel } from './AdvisorPanel';
import { TrackerPanelTabs } from './TrackerPanelTabs';
import { GlobalEffectsPanel } from './GlobalEffectsPanel';
import { FriendlyGraveyardPanel } from './FriendlyGraveyardPanel';
import { useAdvisorStore } from '../stores/advisor-store';
import { useFriendlyEffects, useFriendlyGraveyard } from '../stores/deck-tracker-store';
import { partitionAnimalCompanionEffects } from '../lib/animal-companion-effects';

const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/**
 * Player overlay route. Wraps `LiveDeckPanel` in a TrackerPanelTabs
 * container so the player can flip between the deck list and the
 * active global-effects list without leaving the in-game overlay.
 */
export function OverlayView() {
  useEffect(() => {
    document.body.dataset['overlay'] = 'true';
    return () => {
      delete document.body.dataset['overlay'];
    };
  }, []);
  const close = (): void => {
    void window.hdt?.overlay?.closeFromWindow?.('player');
  };
  const friendlyEffects = useFriendlyEffects();
  const friendlyGraveyard = useFriendlyGraveyard();
  const advisorBadge = useAdvisorStore((s) => s.alerts.length > 0);
  const { effectiveRowCount } = partitionAnimalCompanionEffects(friendlyEffects);
  return (
    <div className="w-full h-full relative">
      <TrackerPanelTabs
        side="player"
        effectsCount={effectiveRowCount}
        deckSlot={<LiveDeckPanel />}
        effectsSlot={
          <GlobalEffectsPanel side="player" effects={friendlyEffects} />
        }
        graveyardSlot={<FriendlyGraveyardPanel records={friendlyGraveyard} />}
        graveyardCount={friendlyGraveyard.length}
        narrationSlot={<LiveNarrationPanel />}
        advisorSlot={<AdvisorPanel />}
        advisorBadge={advisorBadge}
      />
      <button
        type="button"
        aria-label="Close player overlay"
        onClick={close}
        style={NO_DRAG}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-text-mute hover:text-red hover:bg-overlay-hover transition-colors text-sm leading-none z-20"
      >
        ×
      </button>
    </div>
  );
}
