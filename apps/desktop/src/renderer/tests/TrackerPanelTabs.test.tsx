import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { TrackerPanelTabs } from '../src/components/TrackerPanelTabs';

function MountCounter({ id }: { id: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN((v) => v + 1);
  }, []);
  return <div data-testid={`mounts-${id}`}>{n}</div>;
}

function setup(props?: { effectsCount?: number; advisorBadge?: boolean }) {
  return render(
    <I18nProvider preference="en-US">
      <TrackerPanelTabs
        side="player"
        effectsCount={props?.effectsCount ?? 0}
        advisorBadge={props?.advisorBadge ?? false}
        deckSlot={
          <div data-testid="deck-slot">
            <MountCounter id="deck" />
          </div>
        }
        effectsSlot={
          <div data-testid="effects-slot">
            <MountCounter id="effects" />
          </div>
        }
        advisorSlot={
          <div data-testid="advisor-slot">
            <MountCounter id="advisor" />
          </div>
        }
      />
    </I18nProvider>,
  );
}

describe('TrackerPanelTabs', () => {
  it('defaults to the Deck tab on mount', () => {
    setup();
    const deckTab = screen.getByTestId('tracker-tab-deck');
    expect(deckTab.getAttribute('data-active')).toBe('true');
    const effectsTab = screen.getByTestId('tracker-tab-effects');
    expect(effectsTab.getAttribute('data-active')).toBe('false');
  });

  it('shows the effects-count badge only when count > 0', () => {
    const { rerender } = setup({ effectsCount: 0 });
    expect(screen.queryByTestId('tracker-tab-effects-badge')).toBeNull();

    rerender(
      <I18nProvider preference="en-US">
        <TrackerPanelTabs
          side="player"
          effectsCount={3}
          advisorBadge={false}
          deckSlot={<div data-testid="deck-slot" />}
          effectsSlot={<div data-testid="effects-slot" />}
          advisorSlot={<div data-testid="advisor-slot" />}
        />
      </I18nProvider>,
    );
    const badge = screen.getByTestId('tracker-tab-effects-badge');
    expect(badge.textContent).toBe('3');
  });

  it('toggling tabs preserves slot mount state', () => {
    setup();
    expect(screen.getByTestId('mounts-deck').textContent).toBe('1');
    expect(screen.getByTestId('mounts-effects').textContent).toBe('1');

    fireEvent.click(screen.getByTestId('tracker-tab-effects'));
    fireEvent.click(screen.getByTestId('tracker-tab-deck'));

    // Both slots should still be mounted exactly once — the mount counter
    // never re-runs because the slot containers stay in the DOM.
    expect(screen.getByTestId('mounts-deck').textContent).toBe('1');
    expect(screen.getByTestId('mounts-effects').textContent).toBe('1');
  });

  it('renders an optional advisor tab with a status badge', () => {
    setup({ advisorBadge: true });

    const advisorTab = screen.getByTestId('tracker-tab-advisor');
    expect(advisorTab).toBeInTheDocument();
    expect(screen.getByTestId('tracker-tab-advisor-badge')).toBeInTheDocument();

    fireEvent.click(advisorTab);
    expect(advisorTab.getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('advisor-slot')).toBeVisible();
  });

  it('keeps the optional advisor slot mounted across tab switches', () => {
    setup();
    expect(screen.getByTestId('mounts-advisor').textContent).toBe('1');

    fireEvent.click(screen.getByTestId('tracker-tab-advisor'));
    fireEvent.click(screen.getByTestId('tracker-tab-deck'));

    expect(screen.getByTestId('mounts-advisor').textContent).toBe('1');
  });
});
