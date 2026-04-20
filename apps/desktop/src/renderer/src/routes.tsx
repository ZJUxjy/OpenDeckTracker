import { Navigate, type RouteObject } from 'react-router';
import { Dashboard } from './components/Dashboard';
import { Stats } from './components/Stats';
import { Collection } from './components/Collection';
import { Settings } from './components/Settings';
import { OverlayView } from './components/OverlayView';
import { DeckTracker } from './components/Decklist';
import { MOCK_DECK } from './data/mockDecks';

export const routes: RouteObject[] = [
  { index: true, element: <Navigate to="/tracker" replace /> },
  {
    path: 'tracker',
    element: (
      <>
        <Dashboard />
        <div className="hidden lg:block h-full bg-[#0E0E14] p-6 border-l border-[#2A2A35]">
          <DeckTracker cards={MOCK_DECK} />
        </div>
      </>
    ),
  },
  { path: 'stats', element: <Stats /> },
  { path: 'collection', element: <Collection /> },
  { path: 'settings', element: <Settings /> },
  { path: 'overlay', element: <OverlayView /> },
  { path: '*', element: <Navigate to="/tracker" replace /> },
];
