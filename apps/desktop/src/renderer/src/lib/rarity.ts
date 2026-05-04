import type { Rarity } from '@hdt/hearthdb';

const TOKEN: Record<Rarity, string> = {
  FREE: '--rarity-free',
  COMMON: '--rarity-common',
  RARE: '--rarity-rare',
  EPIC: '--rarity-epic',
  LEGENDARY: '--rarity-legendary',
};

export function getRarityToken(rarity?: Rarity): string {
  return rarity && TOKEN[rarity] ? TOKEN[rarity] : '--rarity-common';
}

const COST_BG: Record<Rarity, string> = {
  FREE: 'bg-rarity-free text-text',
  COMMON: 'bg-rarity-common text-bg',
  RARE: 'bg-rarity-rare text-bg',
  EPIC: 'bg-rarity-epic text-bg',
  LEGENDARY: 'bg-rarity-legendary text-bg',
};

export function getRarityCostBg(rarity?: Rarity): string {
  return rarity && COST_BG[rarity] ? COST_BG[rarity] : COST_BG.COMMON;
}
