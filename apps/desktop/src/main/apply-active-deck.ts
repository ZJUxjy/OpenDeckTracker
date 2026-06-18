import { DeckSnapshot } from '@hdt/core';
import type { DeckCard } from './deck-store';

/** Minimal deck shape required by applyActiveDeck. */
interface ActiveDeck {
  id: string;
  name: string;
  version: number;
  cards: DeckCard[];
}

interface ApplyActiveDeckDeps {
  tracker: {
    setOriginalDeck(identified: { deckId: number; name: string; originalDeck: DeckSnapshot }): void;
    selectSavedDeck(savedDeckId: string, savedDeckVersion: number): void;
    getLocalOriginalDeck(): unknown | null;
  };
  mirrorAbsent: boolean;
  getActiveDeckId(): string | null;
  getDeckById(id: string): ActiveDeck | null;
}

/**
 * Apply the user's persisted "current deck" as the tracker's live deck at
 * match start — only in mirror-absent mode and only when no deck has been
 * identified yet (so the Windows mirror auto-identify path always wins).
 */
export function applyActiveDeck(deps: ApplyActiveDeckDeps): void {
  if (!deps.mirrorAbsent) return;
  if (deps.tracker.getLocalOriginalDeck() !== null) return;
  const activeId = deps.getActiveDeckId();
  if (activeId === null) return;
  const deck = deps.getDeckById(activeId);
  if (deck === null) return;
  deps.tracker.setOriginalDeck({
    deckId: 0, // sentinel — no mirror deck id on macOS
    name: deck.name,
    originalDeck: DeckSnapshot.fromDeckCards(deck.cards),
  });
  deps.tracker.selectSavedDeck(deck.id, deck.version);
}
