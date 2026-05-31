import { Navigate, type RouteObject } from 'react-router';
import { Dashboard } from './components/Dashboard';
import { DecksPage } from './components/DecksPage';
import { Stats } from './components/Stats';
import { Collection } from './components/Collection';
import { Settings } from './components/Settings';
import { OverlayView } from './components/OverlayView';
import { OpponentOverlayView } from './components/OpponentOverlayView';
import { CardPreviewView } from './components/CardPreviewView';

function TrackerRoute() {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <Dashboard />
      </div>
    </div>
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
