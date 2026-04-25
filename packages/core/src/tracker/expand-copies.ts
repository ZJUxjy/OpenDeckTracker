export interface DeckCopy {
  copyKey: string;
  cardId: string;
  ordinal: number;
}

/**
 * Expand aggregated deck entries `{ cardId, count }` into one entry per
 * physical copy with stable keys (`${cardId}#${ordinal}`).
 *
 * Invalid counts (≤ 0) are ignored.
 */
export function expandDeckToCopies(
  deck: { cardId: string; count: number }[],
): DeckCopy[] {
  const copies: DeckCopy[] = [];
  for (const entry of deck) {
    if (entry.count <= 0) continue;
    for (let ordinal = 0; ordinal < entry.count; ordinal++) {
      copies.push({
        copyKey: `${entry.cardId}#${ordinal}`,
        cardId: entry.cardId,
        ordinal,
      });
    }
  }
  return copies;
}
