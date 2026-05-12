import { useEffect, type CSSProperties } from 'react';
import { AppWindow, BarChart2, BookOpen, Crown, Layers, Monitor, Settings, User } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { DeckSelectDialog } from './components/DeckSelectDialog';
import { useHearthMirrorStatus } from './hooks/use-hearthmirror-status';
import { useDeckTracker } from './hooks/use-deck-tracker';
import { useTranslation } from './i18n';
import { useAppearanceStore } from './stores/appearance-store';

import { useHearthWatcherStatus } from './hooks/use-hearthwatcher-status';

const MAIN_NAV_ITEMS = [
  { id: 'tracker', icon: AppWindow, labelKey: 'sidebar.deckTracker' },
  { id: 'decks', icon: Layers, labelKey: 'sidebar.decks' },
  { id: 'stats', icon: BarChart2, labelKey: 'sidebar.stats' },
  { id: 'collection', icon: BookOpen, labelKey: 'sidebar.collection' },
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
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

  const isActive = (id: string) =>
    location.pathname === `/${id}` || (id === 'tracker' && location.pathname === '/');
  const statusIconClass = isAlive ? (battleTag ? 'text-green' : 'text-amber') : 'text-text-mute';

  return (
    <div className="tavern-app-shell flex h-screen text-text font-sans overflow-hidden">
      <div className="tavern-app-frame flex h-full min-w-0 flex-1 flex-col">
        <header
          className="tavern-topbar tahoe-topbar flex h-[72px] shrink-0 items-center gap-4 px-5 pr-[148px] relative z-50"
          style={{ WebkitAppRegion: 'drag' } as CSSProperties}
        >
          <button
            type="button"
            className="tavern-brand-plaque flex shrink-0 items-center gap-3"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            onClick={() => {
              void navigate('/tracker');
            }}
          >
            <span className="tavern-brand-icon flex h-10 w-10 items-center justify-center">
              <Crown size={22} />
            </span>
            <span className="text-lg font-black tracking-wide">OpenDeckTracker</span>
          </button>

          <nav
            aria-label="Primary"
            className="tavern-main-tabs flex min-w-0 flex-1 items-center justify-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          >
            {MAIN_NAV_ITEMS.map((item) => {
              const active = isActive(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  data-active={active ? 'true' : 'false'}
                  className="tavern-nav-tab flex items-center justify-center gap-2"
                  onClick={() => {
                    void navigate(`/${item.id}`);
                  }}
                >
                  <item.icon size={17} className="shrink-0" />
                  <span className="truncate">{t(item.labelKey)}</span>
                </button>
              );
            })}
          </nav>

          <div
            className="tavern-topbar-actions flex shrink-0 items-center gap-3"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          >
            <span className="tavern-status-pill text-text-dim flex items-center text-sm font-semibold uppercase">
              <Monitor size={16} className={`mr-2 ${statusIconClass}`} />
              <span className="truncate">
                {isAlive
                  ? (battleTag ? t('app.status.gameRunning') : t('app.status.notLoggedIn'))
                  : t('app.status.gameNotRunning')}
              </span>
            </span>
            <div
              data-testid="player-identity"
              className="tavern-player-pill flex items-center gap-2 select-none"
            >
              <div className="tavern-avatar-medallion flex h-8 w-8 items-center justify-center font-bold text-sm">
                <User size={16} />
              </div>
              <span className="max-w-[160px] truncate text-sm font-semibold text-text">
                {displayBattleTag?.fullBattleTag ?? t('app.playerFallback')}
              </span>
            </div>
            <button
              type="button"
              aria-label={t('sidebar.settings')}
              data-active={isActive('settings') ? 'true' : 'false'}
              className="tavern-settings-button flex h-10 w-10 items-center justify-center"
              onClick={() => {
                void navigate('/settings');
              }}
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        <main className="tavern-main-surface flex-1 flex overflow-hidden relative">
          <Outlet />
        </main>
      </div>
      {/* Global dialog — shown only when the tracker emits
          'needs-deck-selection' (Practice / Brawl modes etc.). */}
      <DeckSelectDialog />
    </div>
  );
}
