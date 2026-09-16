import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { MulliganStatsPanel } from '../src/components/MulliganStatsPanel';

it('sends independent deck, class and play-order filters and displays sample coverage', async () => {
  window.hdt.recordings.mulliganStats = vi.fn(async () => ({ rows: [], sampleSize: 2, excludedMissingData: 1, unmatchedRecordings: 3 }));
  window.hdt.decks.list = vi.fn(async () => []);
  render(<I18nProvider preference="en-US"><MulliganStatsPanel /></I18nProvider>);
  fireEvent.click(screen.getByText('Personal mulligan analysis · all history'));
  expect(await screen.findByText(/2 eligible matches/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Opponent class'), { target: { value: 'MAGE' } });
  fireEvent.change(screen.getByLabelText('Play order'), { target: { value: 'coin' } });
  await waitFor(() => expect(window.hdt.recordings.mulliganStats).toHaveBeenLastCalledWith({ opponentClass: 'MAGE', playOrder: 'coin' }));
});
