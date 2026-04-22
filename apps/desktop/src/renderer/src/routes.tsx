import { Navigate, type RouteObject } from 'react-router';
import { Dashboard } from './components/Dashboard';
import { Stats } from './components/Stats';
import { Collection } from './components/Collection';
import { Settings } from './components/Settings';
import { OverlayView } from './components/OverlayView';
import { DeckTracker } from './components/Decklist';
import { LiveDeckPanel } from './components/LiveDeckPanel';
import { MOCK_DECK } from './data/mockDecks';
import { useDeckTrackerStore } from './stores/deck-tracker-store';

/**
 * Right-side panel: live tracker when in a match (snapshot has a
 * resolved deck), otherwise the existing mock-deck preview so the
 * dashboard remains useful out-of-game.
 */
function RightPanel() {
  const snapshot = useDeckTrackerStore((s) => s.snapshot);
  const showLive =
    snapshot !== null && (snapshot.phase === 'IN_MATCH' || snapshot.phase === 'PRE_MATCH');
  if (showLive) {
    return <LiveDeckPanel />;
  }
  return <DeckTracker cards={MOCK_DECK} />;
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
  { path: 'stats', element: <Stats /> },
  { path: 'collection', element: <Collection /> },
  { path: 'settings', element: <Settings /> },
  { path: 'overlay', element: <OverlayView /> },
  { path: '*', element: <Navigate to="/tracker" replace /> },
];
