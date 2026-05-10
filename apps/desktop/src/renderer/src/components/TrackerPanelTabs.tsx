import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n';
import { useGlassMouseFollow } from '../hooks/use-glass-mouse-follow';

type Tab = 'deck' | 'effects' | 'graveyard';

// Frameless overlay BrowserWindows recognize `-webkit-app-region: drag`
// as the OS drag handle. The styles are inert in framed windows (the
// main window has its own native title bar), so applying them here
// unconditionally is safe.
const DRAG: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties;
const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

interface TrackerPanelTabsProps {
  side: 'player' | 'opponent';
  deckSlot: ReactNode;
  effectsSlot: ReactNode;
  effectsCount: number;
  /**
   * Optional third tab for the local-side tracker showing this match's
   * friendly graveyard. Strictly local — never carries opponent data.
   * When `graveyardSlot` is omitted, the third tab is not rendered.
   */
  graveyardSlot?: ReactNode;
  /** Number of cards in the friendly graveyard, rendered as a count badge. */
  graveyardCount?: number;
}

/**
 * Two-tab vertical container used to wrap the deck panel + global
 * effects panel on each side. Both slots stay mounted across tab
 * switches (the inactive one is `hidden`) so per-row state — hover
 * targets, draw animations, image refs — survives a toggle.
 */
export function TrackerPanelTabs({
  side,
  deckSlot,
  effectsSlot,
  effectsCount,
  graveyardSlot,
  graveyardCount = 0,
}: TrackerPanelTabsProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<Tab>('deck');
  const shellRef = useRef<HTMLDivElement | null>(null);
  useGlassMouseFollow(shellRef);

  return (
    <div
      ref={shellRef}
      className="tracker-panel-shell w-full h-full flex flex-col"
      data-tracker-side={side}
    >
      <div
        role="tablist"
        aria-label={`${side} tracker tabs`}
        style={DRAG}
        className="tracker-panel-tabbar shrink-0 flex items-stretch gap-1 px-2 pt-2 pb-1 bg-overlay-surface border-b border-border"
      >
        <TabPill
          testId="tracker-tab-deck"
          active={active === 'deck'}
          onClick={() => setActive('deck')}
        >
          {t('globalEffects.tabDeck')}
        </TabPill>
        <TabPill
          testId="tracker-tab-effects"
          active={active === 'effects'}
          onClick={() => setActive('effects')}
        >
          <span>{t('globalEffects.tabEffects')}</span>
          {effectsCount > 0 ? (
            <span
              data-testid="tracker-tab-effects-badge"
              style={NO_DRAG}
              className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-accent text-bg text-[11px] font-bold tabular-nums"
            >
              {effectsCount}
            </span>
          ) : null}
        </TabPill>
        {graveyardSlot ? (
          <TabPill
            testId="tracker-tab-graveyard"
            active={active === 'graveyard'}
            onClick={() => setActive('graveyard')}
          >
            <span>{t('tracker.tabGraveyard')}</span>
            {graveyardCount > 0 ? (
              <span
                data-testid="tracker-tab-graveyard-badge"
                style={NO_DRAG}
                className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-accent text-bg text-[11px] font-bold tabular-nums"
              >
                {graveyardCount}
              </span>
            ) : null}
          </TabPill>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          aria-hidden={active !== 'deck'}
          hidden={active !== 'deck'}
          className="w-full h-full"
        >
          {deckSlot}
        </div>
        <div
          aria-hidden={active !== 'effects'}
          hidden={active !== 'effects'}
          className="w-full h-full"
        >
          {effectsSlot}
        </div>
        {graveyardSlot ? (
          <div
            aria-hidden={active !== 'graveyard'}
            hidden={active !== 'graveyard'}
            className="w-full h-full"
          >
            {graveyardSlot}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface TabPillProps {
  testId: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

function TabPill({ testId, active, onClick, children }: TabPillProps) {
  return (
    <button
      type="button"
      role="tab"
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      aria-selected={active}
      onClick={onClick}
      style={NO_DRAG}
      className={clsx(
        'px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors',
        active
          ? 'bg-accent text-text-on-accent shadow-[0_1px_3px_rgba(0,0,0,0.18)]'
          : 'text-text-mute hover:text-text hover:bg-overlay-surface',
      )}
    >
      {children}
    </button>
  );
}
