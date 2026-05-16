import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { OverlayView } from '../src/components/OverlayView';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';

beforeEach(() => {
  useDeckTrackerStore.setState({
    snapshot: null,
    pendingSelection: null,
    dialogDismissed: false,
  });
});

afterEach(() => {
  useDeckTrackerStore.setState({
    snapshot: null,
    pendingSelection: null,
    dialogDismissed: false,
  });
});

describe('OverlayView tabs', () => {
  it('renders both Deck and Effects tabs', () => {
    render(
      <I18nProvider preference="en-US">
        <OverlayView />
      </I18nProvider>,
    );
    expect(screen.getByTestId('tracker-tab-deck')).toBeInTheDocument();
    expect(screen.getByTestId('tracker-tab-effects')).toBeInTheDocument();
  });

  it('renders the live narration tab', () => {
    render(
      <I18nProvider preference="en-US">
        <OverlayView />
      </I18nProvider>,
    );
    expect(screen.getByTestId('tracker-tab-narration')).toBeInTheDocument();
  });
});
