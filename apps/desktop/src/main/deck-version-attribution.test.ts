import { expect, it } from 'vitest';
import type { DeckDetail, DeckTrackerSnapshot } from '@hdt/core';
import { resolveLiveDeckVersion } from './deck-version-attribution';

it('attributes the played immutable list even when the saved deck was edited during a match', () => {
  const snapshot = { phase: 'IN_MATCH', deck: { id: 42, original: [{ cardId: 'A', count: 2 }] } } as DeckTrackerSnapshot;
  const store = { findByLiveDeckId: () => ({ id: 'saved', version: 2 } as DeckDetail), listVersions: () => [
    { deckId: 'saved', version: 1, cards: [{ cardId: 'A', count: 2 }], cardListHash: 'a', createdAt: 1 },
    { deckId: 'saved', version: 2, cards: [{ cardId: 'B', count: 2 }], cardListHash: 'b', createdAt: 2 },
  ] };
  expect(resolveLiveDeckVersion(snapshot, store)).toEqual({ savedDeckId: 'saved', savedDeckVersion: 1 });
  expect(resolveLiveDeckVersion({ ...snapshot, savedDeckId: 'manual' }, store)).toBeNull();
});
