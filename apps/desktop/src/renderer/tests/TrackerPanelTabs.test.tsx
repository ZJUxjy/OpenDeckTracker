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

function setup(props?: { effectsCount?: number }) {
  return render(
    <I18nProvider preference="en-US">
      <TrackerPanelTabs
        side="player"
        effectsCount={props?.effectsCount ?? 0}
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
          deckSlot={<div data-testid="deck-slot" />}
          effectsSlot={<div data-testid="effects-slot" />}
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
});
