import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { DeckSelectDialog } from '../src/components/DeckSelectDialog';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';

describe('DeckSelectDialog i18n', () => {
  beforeEach(() => {
    useDeckTrackerStore.setState({
      snapshot: null,
      pendingSelection: {
        decks: [],
      },
      dialogDismissed: false,
    });
  });

  it('renders English dialog labels from locale resources', () => {
    render(
      <I18nProvider preference="en-US">
        <DeckSelectDialog />
      </I18nProvider>,
    );

    expect(screen.getByText('Select the deck for this match')).toBeInTheDocument();
    expect(screen.getByText('No saved decks. Create a deck in Hearthstone first.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Selection' })).toBeInTheDocument();
  });
});
