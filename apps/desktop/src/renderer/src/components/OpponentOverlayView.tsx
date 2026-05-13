import { useEffect, type CSSProperties } from 'react';
import { OpponentCardsPanel } from './OpponentCardsPanel';
import { TrackerPanelTabs } from './TrackerPanelTabs';
import { GlobalEffectsPanel } from './GlobalEffectsPanel';
import { OpponentGraveyardPanel } from './FriendlyGraveyardPanel';
import {
  useDeckTrackerStore,
  useOpposingEffects,
} from '../stores/deck-tracker-store';
import { partitionAnimalCompanionEffects } from '../lib/animal-companion-effects';

const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/**
 * Opponent overlay route. Wraps `OpponentCardsPanel` in a
 * TrackerPanelTabs container so the user can pivot between revealed
 * opponent cards, opposing graveyard cards, and active global effects.
 */
export function OpponentOverlayView() {
  useEffect(() => {
    document.body.dataset['overlay'] = 'true';
    return () => {
      delete document.body.dataset['overlay'];
    };
  }, []);
  const opponent = useDeckTrackerStore((s) => s.snapshot?.opponent);
  const opposingBoardAttack = useDeckTrackerStore(
    (s) => s.snapshot?.boardAttack?.opposing ?? 0,
  );
  const opposingFaceDamage = useDeckTrackerStore(
    (s) => s.snapshot?.boardAttackToFace?.opposing ?? s.snapshot?.boardAttack?.opposing ?? 0,
  );
  const friendlyEffectiveHealth = useDeckTrackerStore(
    (s) => s.snapshot?.friendlyHero?.effectiveHealth ?? null,
  );
  const opposingEffects = useOpposingEffects();
  const { effectiveRowCount } = partitionAnimalCompanionEffects(opposingEffects);

  const close = (): void => {
    void window.hdt?.overlay?.closeFromWindow?.('opponent');
  };

  return (
    <div className="w-full h-full relative">
      <TrackerPanelTabs
        side="opponent"
        effectsCount={effectiveRowCount}
        deckSlot={
          <OpponentCardsPanel
            revealed={opponent?.revealed ?? []}
            boardAttack={opposingBoardAttack}
            faceDamage={opposingFaceDamage}
            targetEffectiveHealth={friendlyEffectiveHealth}
          />
        }
        effectsSlot={
          <GlobalEffectsPanel side="opponent" effects={opposingEffects} />
        }
        graveyardSlot={<OpponentGraveyardPanel records={opponent?.graveyard ?? []} />}
        graveyardCount={opponent?.graveyard.length ?? 0}
      />
      <button
        type="button"
        aria-label="Close opponent overlay"
        onClick={close}
        style={NO_DRAG}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-text-mute hover:text-red hover:bg-overlay-hover transition-colors text-sm leading-none z-20"
      >
        ×
      </button>
    </div>
  );
}
