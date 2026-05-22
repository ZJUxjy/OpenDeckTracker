import type { DeckPositionPlacement, KnownDeckPosition } from './types';

/**
 * Per-match store of known deck positions. Reset on every new match
 * (matched to the deck-tracker phase machine's IDLE → PRE_MATCH edge).
 *
 * Maintains FIFO ordering per `(cardId, controllerId, placement)`
 * bucket so that when the deck count of a cardId falls below the
 * marker count (a drawn copy must have been ours), we trim the OLDEST
 * marker first. Rationale: in Hearthstone, "put on the bottom of the
 * deck" stacks new entries beneath existing ones, so an older bottom
 * marker has a slightly larger chance of being drawn first as the
 * deck thins. We never claim to know *which* of N markers got drawn
 * — the FIFO rule is a stable, predictable choice.
 */
export class MatchDeckPositionState {
  private entries: KnownDeckPosition[] = [];
  private nextSeq = 0;

  /**
   * Append new markers. Each gets an auto-assigned `insertedAt`.
   * Idempotent on empty input.
   */
  recordPlacements(placements: readonly DeckPositionPlacement[]): void {
    for (const p of placements) {
      this.entries.push({
        cardId: p.cardId,
        controllerId: p.controllerId,
        placement: p.placement,
        sourceCardId: p.sourceCardId,
        insertedAt: this.nextSeq,
      });
      this.nextSeq += 1;
    }
  }

  /**
   * Conservative decay: for each (cardId, controllerId) bucket where
   * marker count exceeds the deck's current copies of that cardId,
   * drop the oldest markers until counts match. Run once per snapshot
   * rebuild — passive draws are reflected without needing to hook
   * each individual draw event.
   *
   * @param remainingCounts cardId → count, taken from the controller's
   *   current deck.remaining list. Missing keys are treated as 0.
   * @param controllerId Only buckets matching this controller are touched.
   */
  reconcileWithDeckCounts(
    remainingCounts: ReadonlyMap<string, number>,
    controllerId: number,
  ): void {
    const buckets = new Map<string, KnownDeckPosition[]>();
    for (const entry of this.entries) {
      if (entry.controllerId !== controllerId) continue;
      const list = buckets.get(entry.cardId);
      if (list) list.push(entry);
      else buckets.set(entry.cardId, [entry]);
    }
    const toRemove = new Set<KnownDeckPosition>();
    for (const [cardId, markers] of buckets) {
      const remaining = remainingCounts.get(cardId) ?? 0;
      const overage = markers.length - remaining;
      if (overage <= 0) continue;
      markers.sort((a, b) => a.insertedAt - b.insertedAt);
      for (let i = 0; i < overage; i += 1) {
        const m = markers[i];
        if (m) toRemove.add(m);
      }
    }
    if (toRemove.size > 0) {
      this.entries = this.entries.filter((e) => !toRemove.has(e));
    }
  }

  /** Clear all markers. Called on match boundaries. */
  reset(): void {
    this.entries = [];
    this.nextSeq = 0;
  }

  /**
   * Return a defensive copy of the markers. Optionally filter by
   * controllerId — useful for the snapshot, which only exposes the
   * local player's positions to avoid leaking opponent deck info.
   */
  snapshot(controllerId?: number): KnownDeckPosition[] {
    const source =
      controllerId === undefined
        ? this.entries
        : this.entries.filter((e) => e.controllerId === controllerId);
    return source
      .slice()
      .sort((a, b) => a.insertedAt - b.insertedAt)
      .map((e) => ({ ...e }));
  }
}
