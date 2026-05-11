import type { Rarity } from '@hdt/hearthdb';

export function maxCopiesForRarity(rarity: Rarity): number {
  return rarity === 'LEGENDARY' ? 1 : 2;
}

export function dustValueForRarity(rarity: Rarity): number {
  switch (rarity) {
    case 'COMMON':
      return 40;
    case 'RARE':
      return 100;
    case 'EPIC':
      return 400;
    case 'LEGENDARY':
      return 1600;
    case 'FREE':
    default:
      return 0;
  }
}
