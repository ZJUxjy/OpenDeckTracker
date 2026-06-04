import { useEffect, useState, type CSSProperties } from 'react';
import {
  AppWindow,
  BarChart2,
  BookOpen,
  Layers,
  Monitor,
  Settings,
  User,
} from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { DeckSelectDialog } from './components/DeckSelectDialog';
import { useHearthMirrorStatus } from './hooks/use-hearthmirror-status';
import { useDeckTracker } from './hooks/use-deck-tracker';
import { useTranslation } from './i18n';
import { useAppearanceStore } from './stores/appearance-store';
import { ReferenceStatusSidebar } from './components/ReferenceStatusSidebar';
import heroArt from './assets/reference-ui/hero.png';
import logoHsCut from './assets/reference-ui/logo-hs-cut.png';

import { useHearthWatcherStatus } from './hooks/use-hearthwatcher-status';

const MAIN_NAV_ITEMS = [
  { id: 'tracker', icon: AppWindow, labelKey: 'sidebar.deckTracker', code: 'DASHBOARD' },
  { id: 'decks', icon: Layers, labelKey: 'sidebar.decks', code: 'DECKS' },
  { id: 'stats', icon: BarChart2, labelKey: 'sidebar.stats', code: 'STATS' },
  { id: 'collection', icon: BookOpen, labelKey: 'sidebar.collection', code: 'COLLECTION' },
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
  const [appVersion, setAppVersion] = useState<string>('');
  useEffect(() => {
    let alive = true;
    void window.hdt?.app?.getVersion().then((v) => {
      if (alive) setAppVersion(v);
    });
    return () => {
      alive = false;
    };
  }, []);
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
  const showStatusSidebar =
    location.pathname === '/' ||
    location.pathname === '/tracker' ||
    location.pathname === '/stats';

  return (
    <div className="tavern-app-shell flex h-screen text-text font-sans overflow-hidden">
      <div className="tavern-app-frame flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <div
          className="tavern-window-titlebar flex h-8 shrink-0 items-center px-5 pr-[148px]"
          aria-hidden
          style={{ WebkitAppRegion: 'drag' } as CSSProperties}
        >
          <div className="tavern-titlebar-grip h-px w-full" />
        </div>
        <header
          className="tavern-topbar tahoe-topbar grid shrink-0 items-center gap-3 px-5 relative z-50"
          style={{ WebkitAppRegion: 'drag' } as CSSProperties}
        >
          <button
            type="button"
            aria-label="OpenDeckTracker"
            className="tavern-brand-plaque flex min-w-0 items-center"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            onClick={() => {
              void navigate('/tracker');
            }}
          >
            <span className="tavern-brand-emblem" aria-hidden="true">
              <img src={logoHsCut} alt="" />
            </span>
            <span className="tavern-brand-copy flex min-w-0 flex-col">
              <span className="tavern-brand-title min-w-0 text-lg font-black tracking-wide">OpenDeckTracker</span>
              <span className="tavern-brand-subtitle min-w-0 truncate text-xs font-semibold">
                {t('app.subtitle')}
              </span>
            </span>
          </button>

          <nav
            aria-label={t('app.primaryNavigation')}
            className="tavern-main-tabs flex min-w-0 flex-1 items-center justify-start gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          >
            {MAIN_NAV_ITEMS.map((item) => {
              const active = isActive(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={t(item.labelKey)}
                  data-active={active ? 'true' : 'false'}
                  className="tavern-nav-tab flex min-w-0 items-center justify-center gap-2"
                  onClick={() => {
                    void navigate(`/${item.id}`);
                  }}
                >
                  <item.icon size={17} className="shrink-0" />
                  <span className="tavern-nav-labels min-w-0">
                    <span className="tavern-nav-label truncate">{t(item.labelKey)}</span>
                    <span className="tavern-nav-code truncate">{item.code}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div
            className="tavern-topbar-actions flex min-w-0 items-center gap-3"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          >
            <span className="tavern-status-pill text-text-dim flex min-w-0 items-center text-sm font-semibold uppercase">
              <Monitor size={16} className={`mr-2 ${statusIconClass}`} />
              <span className="truncate">
                {isAlive
                  ? (battleTag ? t('app.status.gameRunning') : t('app.status.notLoggedIn'))
                  : t('app.status.gameNotRunning')}
              </span>
              <span className="reference-status-chevron" aria-hidden="true" />
            </span>
            <div
              data-testid="player-identity"
              className="tavern-player-pill flex min-w-0 items-center gap-2 select-none"
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

        <main className="tavern-main-surface flex-1 min-h-0 flex overflow-hidden relative">
          <div
            className="reference-global-hero"
            style={{ '--reference-hero': `url(${heroArt})` } as CSSProperties}
            aria-hidden="true"
          />
          {showStatusSidebar ? <ReferenceStatusSidebar /> : null}
          <section className="reference-route-surface min-w-0 min-h-0 flex flex-1 flex-col overflow-hidden">
            <Outlet />
          </section>
        </main>
        <footer
          className="tavern-bottom-status shrink-0"
          aria-label={t('app.versionAriaLabel')}
          style={{ WebkitAppRegion: 'drag' } as CSSProperties}
        >
          <span className="text-text-dim">
            {appVersion ? `v${appVersion.replace('-', ' ')}` : ''}
          </span>
        </footer>
      </div>
      {/* Global dialog — shown only when the tracker emits
          'needs-deck-selection' (Practice / Brawl modes etc.). */}
      <DeckSelectDialog />
    </div>
  );
}
