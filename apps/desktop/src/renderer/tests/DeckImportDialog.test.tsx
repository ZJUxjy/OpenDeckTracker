import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DeckImportDialog } from '../src/components/DeckImportDialog';
import { I18nProvider } from '../src/i18n';

function renderDialog(onOpenChange: (open: boolean) => void = () => undefined) {
  return render(
    <I18nProvider preference="en-US">
      <DeckImportDialog open onOpenChange={onOpenChange} />
    </I18nProvider>,
  );
}

describe('DeckImportDialog', () => {
  let saved: typeof window.hdt.decks;

  beforeEach(() => {
    saved = window.hdt.decks;
  });

  afterEach(() => {
    (window.hdt as { decks: typeof window.hdt.decks }).decks = saved;
  });

  it('Confirm calls importDeckstring once and closes the dialog on success', async () => {
    const importDeckstring = vi.fn().mockResolvedValue({
      id: 'd-1',
      name: 'Imported',
      class: 'DRUID',
      format: 'Standard',
      version: 1,
      cards: [],
      notes: '',
      tags: [],
      createdAt: 0,
      updatedAt: 0,
    });
    const list = vi.fn().mockResolvedValue([]);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...saved,
      importDeckstring,
      list,
    };

    const onOpenChange = vi.fn();
    await act(async () => {
      renderDialog(onOpenChange);
    });

    fireEvent.change(screen.getByTestId('deckstring-input'), {
      target: { value: 'AAEBAfHhBAyZ8AOe...' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Import'));
      await Promise.resolve();
    });

    await waitFor(() => expect(importDeckstring).toHaveBeenCalledOnce());
    expect(importDeckstring).toHaveBeenCalledWith('AAEBAfHhBAyZ8AOe...');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('renders localized UnknownCardError message including the cardId', async () => {
    const error = Object.assign(new Error('UnknownCardError: cardId=PHANTOM_001'), {
      name: 'UnknownCardError',
    });
    const importDeckstring = vi.fn().mockRejectedValue(error);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, importDeckstring };

    await act(async () => {
      renderDialog();
    });

    fireEvent.change(screen.getByTestId('deckstring-input'), { target: { value: 'AAEB...' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Import'));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.queryByTestId('import-error')).not.toBeNull());
    expect(screen.getByTestId('import-error').textContent).toContain('PHANTOM_001');
  });

  it('renders localized DeckstringDecodeError message', async () => {
    const error = Object.assign(new Error('DeckstringDecodeError: malformed'), {
      name: 'DeckstringDecodeError',
    });
    const importDeckstring = vi.fn().mockRejectedValue(error);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, importDeckstring };

    await act(async () => {
      renderDialog();
    });

    fireEvent.change(screen.getByTestId('deckstring-input'), { target: { value: 'XXX' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Import'));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.queryByTestId('import-error')).not.toBeNull());
    expect(screen.getByTestId('import-error').textContent).toContain("Could not decode deckstring");
  });
});
