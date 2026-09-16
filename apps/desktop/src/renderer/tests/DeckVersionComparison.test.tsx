import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DeckVersionComparison } from '../src/components/DeckVersionComparison';
import { I18nProvider } from '../src/i18n';
import type { DeckVersion, MatchHistoryRecord } from '@hdt/core';

vi.mock('../src/hooks/use-card-def', () => ({ useCardDef: (id: string) => ({ name: id }) }));
it('loads saved versions and renders card changes and version-specific outcomes', async () => {
  const version: DeckVersion = { deckId: 'd', version: 1, cards: [{ cardId: 'Old card', count: 1 }], cardListHash: 'a', createdAt: 1 };
  window.hdt.decks.listVersions = vi.fn(async () => [version, { ...version, version: 2, cards: [{ cardId: 'New card', count: 1 }] }]);
  window.hdt.stats.deckVersionMatches = vi.fn(async () => [{ savedDeckId: 'd', savedDeckVersion: 1, result: 'win', opponentClass: 'MAGE', turnCount: 8 }] as MatchHistoryRecord[]);
  const beforeLoad = vi.fn(async () => undefined);
  render(<I18nProvider preference="en-US"><DeckVersionComparison deckId="d" beforeLoad={beforeLoad} /></I18nProvider>);
  fireEvent.click(screen.getByText('Compare deck versions'));
  expect(await screen.findByText('Old card ×1')).toBeInTheDocument();
  expect(screen.getByText('New card ×1')).toBeInTheDocument();
  expect(screen.getByText('100%')).toBeInTheDocument();
  expect(screen.getByText('8.0 (1)')).toBeInTheDocument();
  expect(beforeLoad).toHaveBeenCalledOnce();
  expect(window.hdt.stats.deckVersionMatches).toHaveBeenCalledWith('d');
});
