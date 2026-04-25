import { DeckSnapshot } from '../game/deck-snapshot';
import type { Entity } from '../game/entity';

/**
 * Compute the displayable "remaining cards in deck" multiset using the
 * memory-only algorithm:
 *
 *   baseRemaining   = originalDeck − seenCards
 *   knownDeck       = known friendly cards currently in DECK
 *   shuffledIntoDeck = knownDeck − baseRemaining
 *   remaining       = baseRemaining + shuffledIntoDeck
 *   extras          = seenCards − originalDeck
 *
 * where `seenCards` is the multiset of cardIds we've revealed leaving
 * the DECK zone (i.e. they're now in HAND / PLAY / GRAVEYARD / SECRET
 * with a known cardId, and they were originally controlled by this
 * player).
 *
 * Filters applied to `seen`:
 *   - cardId must be non-empty (face-down entities don't count).
 *   - controllerId must match `localControllerId` (we're not tracking
 *     the opponent in M2; this guards against accidentally leaking
 *     opposing entities into the friendly tally).
 *   - `info.created !== true` — created cards are surfaced via `extras`,
 *     not subtracted from the original deck. In M2 `info.created` is
 *     always `undefined`, so this filter is currently a no-op; M3
 *     (log stream) will populate the flag and start using it.
 *
 * The function is pure — same inputs always produce the same outputs
 * with no side effects.
 */
export function computeRemaining(args: {
  originalDeck: DeckSnapshot;
  seenEntities: readonly Entity[];
  deckEntities: readonly Entity[];
  localControllerId: number;
}): {
  remaining: DeckSnapshot;
  extras: { cardId: string; count: number }[];
} {
  const { originalDeck, seenEntities, deckEntities, localControllerId } = args;

  const seenCardIds: string[] = [];
  for (const e of seenEntities) {
    if (e.cardId === '') continue;
    if (e.controllerId !== localControllerId) continue;
    if (e.info.created === true) continue;
    seenCardIds.push(e.cardId);
  }

  const deckCardIds: string[] = [];
  for (const e of deckEntities) {
    if (e.cardId === '') continue;
    if (e.controllerId !== localControllerId) continue;
    deckCardIds.push(e.cardId);
  }

  const seenSnapshot = DeckSnapshot.fromCardIds(seenCardIds);
  const baseRemaining = originalDeck.subtract(seenSnapshot);
  const knownDeckSnapshot = DeckSnapshot.fromCardIds(deckCardIds);
  const shuffledIntoDeck = baseRemaining.extras(knownDeckSnapshot);
  return {
    remaining: baseRemaining.add(shuffledIntoDeck),
    extras: originalDeck.extras(seenSnapshot),
  };
}

/**
 * Build the `seen` set from a Player's projected zones (HAND / BOARD /
 * GRAVEYARD / SECRET). Convenience wrapper around `computeRemaining`
 * for the common in-match case.
 */
export function gatherSeenEntities(player: {
  hand: readonly Entity[];
  board: readonly Entity[];
  graveyard: readonly Entity[];
  secret: readonly Entity[];
}): Entity[] {
  return [...player.hand, ...player.board, ...player.graveyard, ...player.secret];
}
