import { Navigate, type RouteObject } from 'react-router';
import { Dashboard } from './components/Dashboard';
import { DecksPage } from './components/DecksPage';
import { Stats } from './components/Stats';
import { Collection } from './components/Collection';
import { Settings } from './components/Settings';
import { OverlayView } from './components/OverlayView';
import { OpponentOverlayView } from './components/OpponentOverlayView';
import { CardPreviewView } from './components/CardPreviewView';
import { LiveDeckPanel } from './components/LiveDeckPanel';
import { OpponentCardsPanel } from './components/OpponentCardsPanel';
import { TrackerStatusBanner } from './components/TrackerStatusBanner';
import { TrackerPanelTabs } from './components/TrackerPanelTabs';
import { GlobalEffectsPanel } from './components/GlobalEffectsPanel';
import {
  useDeckTrackerStore,
  useFriendlyEffects,
  useOpposingEffects,
} from './stores/deck-tracker-store';

function RightPanel() {
  const opponent = useDeckTrackerStore((s) => s.snapshot?.opponent);
  const friendlyEffects = useFriendlyEffects();
  const opposingEffects = useOpposingEffects();

  return (
    <div className="flex h-full gap-4">
      <div className="hidden xl:block h-full">
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
      </div>
      <TrackerPanelTabs
        side="player"
        effectsCount={friendlyEffects.length}
        deckSlot={<LiveDeckPanel />}
        effectsSlot={
          <GlobalEffectsPanel side="player" effects={friendlyEffects} />
        }
      />
    </div>
  );
}

function TrackerRoute() {
  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden bg-bg">
        <TrackerStatusBanner />
        <div className="flex-1 flex overflow-hidden">
          <Dashboard />
        </div>
      </div>
      <div className="hidden lg:block h-full bg-bg p-6 border-l border-border">
        <RightPanel />
      </div>
    </>
  );
}

export const routes: RouteObject[] = [
  { index: true, element: <Navigate to="/tracker" replace /> },
  { path: 'tracker', element: <TrackerRoute /> },
  { path: 'decks', element: <DecksPage /> },
  { path: 'stats', element: <Stats /> },
  { path: 'collection', element: <Collection /> },
  { path: 'settings', element: <Settings /> },
  { path: 'overlay', element: <OverlayView /> },
  { path: 'overlay-opponent', element: <OpponentOverlayView /> },
  { path: 'card-preview', element: <CardPreviewView /> },
  { path: '*', element: <Navigate to="/tracker" replace /> },
];
