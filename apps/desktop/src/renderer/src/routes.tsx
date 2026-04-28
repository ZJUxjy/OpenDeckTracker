import { Navigate, type RouteObject } from 'react-router';
import { Dashboard } from './components/Dashboard';
import { DecksPage } from './components/DecksPage';
import { Stats } from './components/Stats';
import { Collection } from './components/Collection';
import { Settings } from './components/Settings';
import { OverlayView } from './components/OverlayView';
import { LiveDeckPanel } from './components/LiveDeckPanel';
import { OpponentCardsPanel } from './components/OpponentCardsPanel';
import { useDeckTrackerStore } from './stores/deck-tracker-store';

function RightPanel() {
  const opponent = useDeckTrackerStore((s) => s.snapshot?.opponent);

  return (
    <div className="flex h-full gap-4">
      <div className="hidden xl:block h-full">
        <OpponentCardsPanel
          revealed={opponent?.revealed ?? []}
          graveyard={opponent?.graveyard ?? []}
        />
      </div>
      <LiveDeckPanel />
    </div>
  );
}

function TrackerRoute() {
  return (
    <>
      <Dashboard />
      <div className="hidden lg:block h-full bg-[#0E0E14] p-6 border-l border-[#2A2A35]">
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
  { path: '*', element: <Navigate to="/tracker" replace /> },
];
