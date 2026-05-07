import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { OpponentOverlayView } from '../src/components/OpponentOverlayView';
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

describe('OpponentOverlayView tabs', () => {
  it('renders both Deck and Effects tabs', () => {
    render(
      <I18nProvider preference="en-US">
        <OpponentOverlayView />
      </I18nProvider>,
    );
    expect(screen.getByTestId('tracker-tab-deck')).toBeInTheDocument();
    expect(screen.getByTestId('tracker-tab-effects')).toBeInTheDocument();
  });
});
