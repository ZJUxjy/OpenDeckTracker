import type { Deck, MatchInfo } from '@hdt/hearthmirror';
import { DeckSnapshot } from '../game/deck-snapshot';

/**
 * Strategy interface for resolving "which saved deck is the player
 * currently using". Implementations: `InGameDeckIdentifier` (memory
 * field — Spike pending), `CallbackDeckIdentifier` (delegates to
 * a renderer-side dialog).
 *
 * Per design D5 the orchestrator tries `InGameDeckIdentifier` first,
 * falls back to `CallbackDeckIdentifier` when it returns null.
 */
export interface IDeckIdentifier {
  identify(snapshot: { decks: Deck[]; matchInfo: MatchInfo }): Promise<IdentifiedDeck | null>;
}

export interface IdentifiedDeck {
  /** ID of the saved deck (Deck.id from getDecks). */
  deckId: number;
  /** Display name for UI. */
  name: string;
  /** Snapshot of the original 30-card list, ready to consume by `computeRemaining`. */
  originalDeck: DeckSnapshot;
}

/**
 * In-game memory-field identifier. STUB until Section 2 spike completes.
 *
 * Today this returns null (no auto-detection); the orchestrator falls
 * back to the dialog. When the spike finds a usable Mono field we'll
 * add a `getSelectedDeckId()` reflector and wire it here.
 */
export class InGameDeckIdentifier implements IDeckIdentifier {
  async identify(_snapshot: { decks: Deck[]; matchInfo: MatchInfo }): Promise<IdentifiedDeck | null> {
    // Spike Section 2 pending. Return null so callers fall back to
    // `CallbackDeckIdentifier` (the dialog-driven flow).
    return null;
  }
}

/**
 * Callback identifier — delegates to a user-supplied promise. The
 * Electron main process uses this to open a renderer-side dialog,
 * await the user's choice, then resolve.
 */
export class CallbackDeckIdentifier implements IDeckIdentifier {
  constructor(
    private readonly callback: (
      decks: Deck[],
      matchInfo: MatchInfo,
    ) => Promise<number | null>,
  ) {}

  async identify(snapshot: { decks: Deck[]; matchInfo: MatchInfo }): Promise<IdentifiedDeck | null> {
    const deckId = await this.callback(snapshot.decks, snapshot.matchInfo);
    if (deckId === null) return null;
    const deck = snapshot.decks.find((d) => d.id === deckId);
    if (!deck) return null;
    return {
      deckId: deck.id,
      name: deck.name,
      originalDeck: DeckSnapshot.fromDeckCards(deck.cards),
    };
  }
}

/**
 * Composite identifier — tries each underlying identifier in order,
 * returning the first non-null. Used by the orchestrator to chain
 * `InGameDeckIdentifier → CallbackDeckIdentifier` per design D5.
 */
export class ChainedDeckIdentifier implements IDeckIdentifier {
  constructor(private readonly identifiers: IDeckIdentifier[]) {}

  async identify(snapshot: { decks: Deck[]; matchInfo: MatchInfo }): Promise<IdentifiedDeck | null> {
    for (const identifier of this.identifiers) {
      const result = await identifier.identify(snapshot);
      if (result !== null) return result;
    }
    return null;
  }
}
