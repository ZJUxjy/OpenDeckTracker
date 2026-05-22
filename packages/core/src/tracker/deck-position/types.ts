/**
 * Known-deck-position tracking.
 *
 * Some cards reveal information about the position of specific cards
 * in the deck — e.g. Waveshaping (TIME_701) puts the two unchosen
 * Discover candidates on the bottom; future "put X on top of your
 * deck" cards will produce similar information.
 *
 * This module owns the *generic* state + extractor contract. Add new
 * cards by registering a new `DeckPositionExtractor` in
 * `extractor-registry.ts`; the snapshot field, state machine, and
 * renderer don't need touching.
 */
import type { CardPlayedEvent, ExtractCtx } from '../../global-effects/types';

/**
 * One marker carried in `DeckTrackerSnapshot.deck.knownPositions`.
 * Plain JSON — round-trips through Electron IPC unchanged.
 */
export interface KnownDeckPosition {
  /** Hearthstone cardId of the card known to be at this position. */
  cardId: string;
  /** Whose deck this marker belongs to. */
  controllerId: number;
  /** `'top'` = will be drawn first; `'bottom'` = drawn last. */
  placement: 'top' | 'bottom';
  /**
   * Monotonically increasing per match. Used to preserve insertion
   * order (multiple plays of the same source card stack predictably)
   * and to decide which marker to drop when the deck count of a cardId
   * falls below the marker count (oldest marker wins the trim).
   */
  insertedAt: number;
  /** cardId of the spell/minion that introduced this marker (for UI). */
  sourceCardId: string;
}

/**
 * What a `DeckPositionExtractor` returns. Inserted into the state by
 * `MatchDeckPositionState.recordPlacements`, which stamps `insertedAt`.
 */
export interface DeckPositionPlacement {
  cardId: string;
  controllerId: number;
  placement: 'top' | 'bottom';
  sourceCardId: string;
}

/**
 * Per-card extractor. Looks at the PowerEvent window after the trigger
 * card was played and decides what (if anything) ended up at a known
 * deck position.
 *
 * Implementations may be async — Hearthstone surfaces some of these
 * effects only after the user interacts with a Discover prompt, which
 * can take several seconds. Use `ctx.waitForMoreEvents()` to wait.
 *
 * Return `null` when the extractor times out or can't determine the
 * placements with confidence — the state will simply remain empty for
 * this play.
 */
export interface DeckPositionExtractor {
  /** cardId whose play triggers this extractor. */
  readonly triggerCardId: string;
  extract(
    event: CardPlayedEvent,
    ctx: ExtractCtx,
  ): Promise<DeckPositionPlacement[] | null> | DeckPositionPlacement[] | null;
}
