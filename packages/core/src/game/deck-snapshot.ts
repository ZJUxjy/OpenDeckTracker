/**
 * A multiset of cards (cardId → count) representing one deck's
 * composition at a single point in time. Immutable interface — all
 * mutators return new instances.
 *
 * Used as both:
 *   - originalDeck: the 30-card list the player picked at match start.
 *   - "seen multiset": the cardIds that have left the deck zone (built
 *     from hand/board/graveyard entities by the remaining-cards algorithm).
 *
 * The class is the only place we centralize multiset arithmetic;
 * `computeRemaining` consumes it directly.
 */
export class DeckSnapshot {
  /** Read-only view of the underlying counts. */
  private readonly counts: ReadonlyMap<string, number>;

  constructor(counts: Iterable<readonly [string, number]>) {
    const m = new Map<string, number>();
    for (const [cardId, count] of counts) {
      if (count <= 0 || cardId === '') {
        continue;
      }
      m.set(cardId, (m.get(cardId) ?? 0) + count);
    }
    this.counts = m;
  }

  /** Build from a `Deck.cards: { cardId, count }[]` shape (e.g. `getDecks` result). */
  static fromDeckCards(cards: readonly { readonly cardId: string; readonly count: number }[]): DeckSnapshot {
    return new DeckSnapshot(cards.map((c) => [c.cardId, c.count] as const));
  }

  /** Build from an iterable of cardIds (one entry per copy). Used to multiset-ify entity arrays. */
  static fromCardIds(cardIds: Iterable<string>): DeckSnapshot {
    const m = new Map<string, number>();
    for (const cardId of cardIds) {
      if (cardId === '') {
        continue;
      }
      m.set(cardId, (m.get(cardId) ?? 0) + 1);
    }
    return new DeckSnapshot(m);
  }

  /** Sum of all counts across cardIds. */
  total(): number {
    let n = 0;
    for (const c of this.counts.values()) {
      n += c;
    }
    return n;
  }

  /** Look up the count for a single cardId. Returns 0 if absent. */
  countOf(cardId: string): number {
    return this.counts.get(cardId) ?? 0;
  }

  /** True if the snapshot contains zero cards. */
  isEmpty(): boolean {
    return this.counts.size === 0;
  }

  /**
   * Sorted alphabetical entries (cardId, count). Used for stable
   * iteration in tests; rendering uses `entries()` then sorts by cost
   * via card-def lookup.
   */
  entries(): { cardId: string; count: number }[] {
    return Array.from(this.counts.entries())
      .map(([cardId, count]) => ({ cardId, count }))
      .sort((a, b) => a.cardId.localeCompare(b.cardId));
  }

  /**
   * Returns a new snapshot with `other` removed (negative counts
   * clamped to 0; cardIds that drop to 0 are removed entirely).
   *
   * `other` may be either a `DeckSnapshot` (preferred) or a flat
   * `{ cardId }[]` list (treated as one decrement per element).
   */
  subtract(other: DeckSnapshot | readonly { readonly cardId: string }[]): DeckSnapshot {
    const otherCounts = other instanceof DeckSnapshot
      ? new Map(other.counts)
      : countByCardId(other);
    const result = new Map<string, number>();
    for (const [cardId, count] of this.counts) {
      const decrement = otherCounts.get(cardId) ?? 0;
      const remaining = Math.max(0, count - decrement);
      if (remaining > 0) {
        result.set(cardId, remaining);
      }
    }
    return new DeckSnapshot(result);
  }

  /**
   * Returns the cards in `seen` that aren't in `this` (or that exceed
   * `this`'s count) — i.e. the "extras" Hearthstone added mid-game
   * (Discover offers, stolen cards, Burgle-injected coins, etc.).
   *
   * In M2 we surface these as a small badge but don't subtract them
   * from `remaining`; M3 will use entity.info flags to handle them
   * with full precision.
   */
  extras(seen: DeckSnapshot | readonly { readonly cardId: string }[]): { cardId: string; count: number }[] {
    const seenCounts = seen instanceof DeckSnapshot
      ? new Map(seen.counts)
      : countByCardId(seen);
    const result: { cardId: string; count: number }[] = [];
    for (const [cardId, seenCount] of seenCounts) {
      const original = this.counts.get(cardId) ?? 0;
      const extra = seenCount - original;
      if (extra > 0) {
        result.push({ cardId, count: extra });
      }
    }
    return result.sort((a, b) => a.cardId.localeCompare(b.cardId));
  }
}

function countByCardId(items: readonly { readonly cardId: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    if (!it.cardId) continue;
    m.set(it.cardId, (m.get(it.cardId) ?? 0) + 1);
  }
  return m;
}
