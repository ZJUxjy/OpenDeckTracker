import { useState, type CSSProperties, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n';

type Tab = 'deck' | 'effects';

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
}: TrackerPanelTabsProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<Tab>('deck');

  return (
    <div className="w-full h-full flex flex-col" data-tracker-side={side}>
      <div
        role="tablist"
        aria-label={`${side} tracker tabs`}
        style={DRAG}
        className="shrink-0 flex items-stretch gap-1 px-2 pt-2 pb-1 bg-bg-2 border-b border-border"
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
          ? 'bg-bg-3 text-text shadow-[inset_0_-2px_0_var(--accent)]'
          : 'text-text-mute hover:text-text hover:bg-bg-3/50',
      )}
    >
      {children}
    </button>
  );
}
