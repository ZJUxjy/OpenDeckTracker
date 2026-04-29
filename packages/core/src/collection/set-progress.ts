import { STANDARD_SET_CODES } from '@hdt/hearthdb';
import type { CardDef } from '@hdt/hearthdb';

export interface SetProgress {
  setCode: string;
  format: 'standard' | 'wild';
  totalCards: number;
  totalCopies: number;
  ownedCopies: number;
  ownedUniqueCards: number;
}

export function computeSetProgress(
  allCollectibleCards: readonly CardDef[],
  ownedByDbfId: ReadonlyMap<number, number>,
): SetProgress[] {
  const buckets = new Map<string, { totalCards: number; totalCopies: number; ownedCopies: number; ownedUniqueCards: number }>();

  for (const card of allCollectibleCards) {
    if (!card.collectible) continue;

    let bucket = buckets.get(card.set);
    if (!bucket) {
      bucket = { totalCards: 0, totalCopies: 0, ownedCopies: 0, ownedUniqueCards: 0 };
      buckets.set(card.set, bucket);
    }

    const legalMax = card.rarity === 'LEGENDARY' ? 1 : 2;
    bucket.totalCards++;
    bucket.totalCopies += legalMax;

    const owned = ownedByDbfId.get(card.dbfId);
    if (owned !== undefined && owned > 0) {
      const capped = Math.min(owned, legalMax);
      bucket.ownedCopies += capped;
      bucket.ownedUniqueCards++;
    }
  }

  const standardSet = new Set(STANDARD_SET_CODES);
  const standardOrder = new Map(STANDARD_SET_CODES.map((code, i) => [code, i]));

  const rows: SetProgress[] = [];
  for (const [setCode, bucket] of buckets) {
    rows.push({
      setCode,
      format: standardSet.has(setCode) ? 'standard' : 'wild',
      totalCards: bucket.totalCards,
      totalCopies: bucket.totalCopies,
      ownedCopies: bucket.ownedCopies,
      ownedUniqueCards: bucket.ownedUniqueCards,
    });
  }

  rows.sort((a, b) => {
    const aStd = a.format === 'standard';
    const bStd = b.format === 'standard';
    if (aStd && !bStd) return -1;
    if (!aStd && bStd) return 1;
    if (aStd && bStd) {
      return (standardOrder.get(a.setCode) ?? 0) - (standardOrder.get(b.setCode) ?? 0);
    }
    return a.setCode.localeCompare(b.setCode);
  });

  return rows;
}
