import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from '../i18n';
import { useGlassMouseFollow } from '../hooks/use-glass-mouse-follow';
import * as Tabs from './beui/tabs';

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties;

interface TrackerPanelTabsProps {
  side: 'player' | 'opponent';
  deckSlot: ReactNode;
  effectsSlot: ReactNode;
  effectsCount: number;
  /**
   * Optional third tab showing this side's match graveyard. Player and
   * opponent callers pass their own side-specific records.
   * When `graveyardSlot` is omitted, the third tab is not rendered.
   */
  graveyardSlot?: ReactNode;
  /** Number of cards in this side's graveyard, rendered as a count badge. */
  graveyardCount?: number;
  /**
   * Optional tab showing the live game-progress narration feed. Only the
   * player overlay passes this; when omitted, the tab is not rendered.
   */
  narrationSlot?: ReactNode;
  /** Optional tab showing player-side AI advice. Omitted for opponent overlays. */
  advisorSlot?: ReactNode;
  analysisSlot?: ReactNode;
  /** Shows a compact badge on the advisor tab when urgent advice is available. */
  advisorBadge?: boolean;
}

/** Keep every panel mounted so live card state survives tab switches. */
export function TrackerPanelTabs({
  side,
  deckSlot,
  effectsSlot,
  effectsCount,
  graveyardSlot,
  graveyardCount = 0,
  narrationSlot,
  advisorSlot,
  analysisSlot,
  advisorBadge = false,
}: TrackerPanelTabsProps) {
  const { t } = useTranslation();
  const shellRef = useRef<HTMLDivElement | null>(null);
  useGlassMouseFollow(shellRef);
  const panels = [
    { id: 'deck', label: t('globalEffects.tabDeck'), content: deckSlot, count: 0 },
    {
      id: 'effects',
      label: t('globalEffects.tabEffects'),
      content: effectsSlot,
      count: effectsCount,
    },
    ...(graveyardSlot
      ? [
          {
            id: 'graveyard',
            label: t('tracker.tabGraveyard'),
            content: graveyardSlot,
            count: graveyardCount,
          },
        ]
      : []),
    ...(narrationSlot
      ? [{ id: 'narration', label: t('tracker.tabNarration'), content: narrationSlot, count: 0 }]
      : []),
    ...(analysisSlot
      ? [{ id: 'analysis', label: t('analysis.tab'), content: analysisSlot, count: 0 }]
      : []),
    ...(advisorSlot
      ? [{ id: 'advisor', label: t('tracker.tabAdvisor'), content: advisorSlot, count: 0 }]
      : []),
  ];

  return (
    <Tabs.Root
      ref={shellRef}
      defaultValue="deck"
      className="tracker-panel-shell w-full h-full flex flex-col"
      data-tracker-side={side}
    >
      <Tabs.List
        aria-label={`${side} tracker tabs`}
        style={DRAG}
        className="tracker-panel-tabbar shrink-0 flex flex-wrap items-stretch gap-1 pl-2 pr-9 pt-2 pb-1 bg-overlay-surface border-b border-border"
      >
        {panels.map((panel) => (
          <Tabs.Trigger
            key={panel.id}
            value={panel.id}
            data-testid={`tracker-tab-${panel.id}`}
            style={NO_DRAG}
            className="tracker-tab-pill px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1"
          >
            <span>{panel.label}</span>
            {panel.count > 0 && (
              <span
                data-testid={`tracker-tab-${panel.id}-badge`}
                className="beui-tab-count ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[11px] font-bold tabular-nums"
              >
                {panel.count}
              </span>
            )}
            {panel.id === 'advisor' && advisorBadge && (
              <span
                data-testid="tracker-tab-advisor-badge"
                className="ml-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-red"
              />
            )}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <div className="flex-1 min-h-0 overflow-hidden">
        {panels.map((panel) => (
          <Tabs.Content key={panel.id} value={panel.id} forceMount className="w-full h-full">
            {panel.content}
          </Tabs.Content>
        ))}
      </div>
    </Tabs.Root>
  );
}
