import type { Deck, HearthMirror, MatchInfo } from '@hdt/hearthmirror';
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
  /**
   * Hero class (e.g. `'DRUID'`, `'MAGE'`) when known. Optional because the
   * live `Deck` shape from hearthmirror only carries `hero` (a hero card id
   * like `'HERO_06'`); callers that want matchup-matrix attribution should
   * resolve the class from the card database before constructing this object.
   */
  heroClass?: string;
}

/**
 * In-game memory-field identifier. Reads
 * `DeckPickerTrayDisplay.s_instance.m_selectedCustomDeckBox.m_deckID`
 * via the new `getSelectedDeckId` reflector (Section 2 spike outcome —
 * see `selected_deck.rs` doc comment for the chain).
 *
 * Returns null (→ orchestrator falls back to dialog) when:
 *   - HearthMirror is unavailable.
 *   - The reflector returns null (typical for Practice / Brawl /
 *     Adventure modes where the deck-picker UI doesn't load).
 *   - The selected `deckId` doesn't match any saved deck in the
 *     `getDecks` snapshot (template decks, dungeon decks, etc.).
 *
 * Constructed PvP queueing → identifier resolves the saved deck
 * automatically; everything else → dialog.
 */
export class InGameDeckIdentifier implements IDeckIdentifier {
  constructor(private readonly mirror: HearthMirror) {}

  async identify(snapshot: { decks: Deck[]; matchInfo: MatchInfo }): Promise<IdentifiedDeck | null> {
    const selected = await this.mirror.getSelectedDeckId();
    if (!selected) return null;
    if (selected.deckId <= 0n) return null;
    const deckIdNumber = Number(selected.deckId);
    const deck = snapshot.decks.find((d) => d.id === deckIdNumber);
    if (!deck) return null;
    return {
      deckId: deck.id,
      name: deck.name,
      originalDeck: DeckSnapshot.fromDeckCards(deck.cards),
    };
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
