import { useEffect } from 'react';
import { Monitor, User } from 'lucide-react';
import { Outlet, useLocation } from 'react-router';
import { Sidebar } from './components/Sidebar';
import { DeckSelectDialog } from './components/DeckSelectDialog';
import { useHearthMirrorStatus } from './hooks/use-hearthmirror-status';
import { useDeckTracker } from './hooks/use-deck-tracker';
import { useTranslation } from './i18n';
import { useAppearanceStore } from './stores/appearance-store';

import { useHearthWatcherStatus } from './hooks/use-hearthwatcher-status';

export default function App() {
  const location = useLocation();
  const { t } = useTranslation();
  const isOverlay =
    location.pathname === '/overlay' ||
    location.pathname === '/overlay-opponent' ||
    location.pathname === '/card-preview';
  const { isAlive, battleTag, displayBattleTag } = useHearthMirrorStatus();
  // Subscribe the global deck-tracker store to main-process IPC pushes.
  // Mounted at App root so the subscription survives all route changes.
  useDeckTracker();
  // Activate hearthwatcher diagnostics subscription (status displayed in Dashboard).
  useHearthWatcherStatus();

  // Cross-window sync: when an overlay window's close button disables
  // the overlay, every renderer (including the main window's Settings
  // page and the OTHER overlay window) gets a broadcast so its
  // appearance store reflects the new state. We use the silent setter
  // to avoid echoing the disable back to the main process.
  useEffect(() => {
    const off = window.hdt?.overlay?.onDisabledByWindow?.((which) => {
      const s = useAppearanceStore.getState();
      if (which === 'player') s.silentSetGameOverlay(false);
      else s.silentSetGameOverlayOpponent(false);
    });
    return () => {
      off?.();
    };
  }, []);

  // Make html/body transparent on overlay routes so the BrowserWindow's
  // `transparent: true` actually shows through. Both index.html (body
  // class) and theme.css (body { background }) paint a solid background
  // by default, which would otherwise cover the Hearthstone game window.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (isOverlay) {
      html.style.background = 'transparent';
      body.style.background = 'transparent';
      body.classList.add('overlay-route');
    } else {
      html.style.background = '';
      body.style.background = '';
      body.classList.remove('overlay-route');
    }
  }, [isOverlay]);

  // Overlay routes are hosted in dedicated transparent BrowserWindows.
  // They MUST NOT render the desktop shell (sidebar + header + opaque bg)
  // — the shell would paint the entire transparent window opaque, covering
  // the Hearthstone game underneath.
  if (isOverlay) {
    return (
      <div className="w-screen h-screen bg-transparent overflow-hidden text-text font-sans select-none">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen text-text font-sans overflow-hidden">
      {!isOverlay && <Sidebar />}

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="tahoe-topbar h-14 flex items-center justify-between pl-6 pr-[148px] shrink-0 z-50 relative"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex items-center space-x-4">
            <span className="text-text-dim text-sm font-medium uppercase tracking-wider flex items-center">
              <Monitor size={16} className={`mr-2 ${isAlive ? (battleTag ? 'text-green' : 'text-amber') : 'text-text-mute'}`} />
              {isAlive
                ? (battleTag ? t('app.status.gameRunning') : t('app.status.notLoggedIn'))
                : t('app.status.gameNotRunning')}
            </span>
          </div>

          <div
            className="flex items-center space-x-4"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div
              data-testid="player-identity"
              className="flex items-center space-x-2 px-3 py-1.5 rounded-md hover:bg-white/5 transition-colors select-none"
            >
              <div className="w-7 h-7 bg-indigo-500 rounded flex items-center justify-center text-white font-bold text-sm">
                <User size={16} />
              </div>
              <span className="text-sm font-medium text-text">
                {displayBattleTag?.fullBattleTag ?? t('app.playerFallback')}
              </span>
            </div>
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
