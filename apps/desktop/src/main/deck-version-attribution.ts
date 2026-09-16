import { areCardListsEqual, type DeckTrackerSnapshot } from '@hdt/core';
import type { DeckStore } from './deck-store';

/** Match the actual played list, never the latest edited list merely sharing a name. */
export function resolveLiveDeckVersion(snapshot: DeckTrackerSnapshot, store: Pick<DeckStore, 'findByLiveDeckId' | 'listVersions'>) {
  if (!snapshot.deck || snapshot.phase !== 'IN_MATCH' || snapshot.savedDeckId) return null;
  const saved = store.findByLiveDeckId(snapshot.deck.id);
  if (!saved) return null;
  const version = store.listVersions(saved.id).filter(candidate => areCardListsEqual(candidate.cards, snapshot.deck!.original))
    .sort((a, b) => b.version - a.version)[0];
  return version ? { savedDeckId: saved.id, savedDeckVersion: version.version } : null;
}
