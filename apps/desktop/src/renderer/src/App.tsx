import { Bell, ChevronDown, Ghost, LayoutTemplate, Monitor, User } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Sidebar } from './components/Sidebar';
import { DeckSelectDialog } from './components/DeckSelectDialog';
import { useHearthMirrorStatus } from './hooks/use-hearthmirror-status';
import { useDeckTracker } from './hooks/use-deck-tracker';
import { useTranslation } from './i18n';

import { useHearthWatcherStatus } from './hooks/use-hearthwatcher-status';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const isOverlay = location.pathname === '/overlay' || location.pathname === '/overlay-opponent';
  const { isAlive, battleTag } = useHearthMirrorStatus();
  // Subscribe the global deck-tracker store to main-process IPC pushes.
  // Mounted at App root so the subscription survives all route changes.
  useDeckTracker();
  // Activate hearthwatcher diagnostics subscription (status displayed in Dashboard).
  useHearthWatcherStatus();

  return (
    <div className="flex h-screen bg-bg text-text font-sans overflow-hidden">
      {!isOverlay && <Sidebar />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-bg border-b border-border flex items-center justify-between px-6 shrink-0 z-50 shadow-md relative">
          <div className="flex items-center space-x-4">
            <span className="text-text-dim text-sm font-medium uppercase tracking-wider flex items-center">
              <Monitor size={16} className={`mr-2 ${isAlive ? (battleTag ? 'text-green' : 'text-amber') : 'text-text-mute'}`} />
              {isAlive
                ? (battleTag ? t('app.status.gameRunning') : t('app.status.notLoggedIn'))
                : t('app.status.gameNotRunning')}
            </span>
            <div className="h-6 w-px bg-border mx-2" />

            <div className="flex bg-bg rounded-md p-1 border border-border">
              <button
                onClick={() => {
                  void navigate('/tracker');
                }}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  !isOverlay
                    ? 'bg-bg-3 text-text shadow'
                    : 'text-text-mute hover:text-text'
                }`}
              >
                <LayoutTemplate size={14} />
                <span>{t('app.mode.desktop')}</span>
              </button>
              <button
                onClick={() => {
                  void navigate('/overlay');
                }}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isOverlay
                    ? 'bg-bg-3 text-accent shadow'
                    : 'text-text-mute hover:text-text'
                }`}
              >
                <Ghost size={14} />
                <span>{t('app.mode.overlay')}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button className="relative text-text-dim hover:text-text transition-colors">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-red rounded-full border border-bg" />
            </button>
            <div className="h-6 w-px bg-border mx-2" />
            <button className="flex items-center space-x-2 hover:bg-bg-2 px-3 py-1.5 rounded-md transition-colors">
              <div className="w-7 h-7 bg-indigo-500 rounded flex items-center justify-center text-white font-bold text-sm">
                <User size={16} />
              </div>
              <span className="text-sm font-medium text-text">{battleTag?.fullBattleTag ?? t('app.playerFallback')}</span>
              <ChevronDown size={14} className="text-text-mute" />
            </button>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden relative">
          <Outlet />
        </main>
      </div>
      {/* Global dialog — shown only when the tracker emits
          'needs-deck-selection' (Practice / Brawl modes etc.). */}
      <DeckSelectDialog />
    </div>
  );
}
