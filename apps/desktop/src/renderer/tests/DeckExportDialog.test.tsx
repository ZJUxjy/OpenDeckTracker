import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DeckExportDialog } from '../src/components/DeckExportDialog';
import { I18nProvider } from '../src/i18n';

function renderDialog(deckId = 'd-1') {
  return render(
    <I18nProvider preference="en-US">
      <DeckExportDialog open onOpenChange={() => undefined} deckId={deckId} />
    </I18nProvider>,
  );
}

describe('DeckExportDialog', () => {
  let saved: typeof window.hdt.decks;

  beforeEach(() => {
    saved = window.hdt.decks;
  });

  afterEach(() => {
    (window.hdt as { decks: typeof window.hdt.decks }).decks = saved;
  });

  it('renders deckstring content for a legal deck and Copy invokes clipboard', async () => {
    const deckstring = 'AAEBAfHhBAyZ8AOe...';
    const exportDeckstring = vi.fn().mockResolvedValue(deckstring);
    const exportJson = vi.fn().mockResolvedValue('{"schemaVersion":1}');
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...saved,
      exportDeckstring,
      exportJson,
    };

    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await act(async () => {
      renderDialog();
    });

    await waitFor(() => expect(screen.queryByTestId('deckstring-content')).not.toBeNull());
    expect(screen.getByTestId('deckstring-content').textContent).toBe(deckstring);

    fireEvent.click(screen.getByTestId('copy-deckstring'));
    expect(writeText).toHaveBeenCalledWith(deckstring);
  });

  it('renders illegal-deck message when exportDeckstring rejects with IllegalDeckExportError', async () => {
    const error = Object.assign(new Error('IllegalDeckExportError'), {
      name: 'IllegalDeckExportError',
    });
    const exportDeckstring = vi.fn().mockRejectedValue(error);
    const exportJson = vi.fn().mockResolvedValue('{}');
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...saved,
      exportDeckstring,
      exportJson,
    };

    await act(async () => {
      renderDialog();
    });

    await waitFor(() => expect(screen.queryByTestId('deckstring-illegal')).not.toBeNull());
    expect(screen.getByTestId('deckstring-illegal').textContent).toContain(
      'Cannot export an illegal deck',
    );
    // Copy button is disabled while there's no deckstring
    const copyBtn = screen.getByTestId('copy-deckstring') as HTMLButtonElement;
    expect(copyBtn.disabled).toBe(true);
  });
});
