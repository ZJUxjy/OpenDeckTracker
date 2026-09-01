export interface FollowCardMetadata {
  type?: string;
  mechanics?: readonly string[];
}

/** One-turn Follow enchantments granted by the "Follow the X" class-set spells. */
export const FOLLOW_ENCHANTMENT_IDS: ReadonlySet<string> = new Set([
  'CAP_002e',
  'CAP_101e',
  'CAP_402e',
  'CAP_802e1',
]);

const FOLLOW_SOURCE_BY_ENCHANTMENT: Readonly<Record<string, string>> = {
  CAP_002e: 'CAP_002',
  CAP_101e: 'CAP_101',
  CAP_402e: 'CAP_402',
  CAP_802e1: 'CAP_802',
};

export function isFollowEnchantment(cardId: string): boolean {
  return FOLLOW_ENCHANTMENT_IDS.has(cardId);
}

export function followSourceCardId(enchantmentCardId: string): string | null {
  return FOLLOW_SOURCE_BY_ENCHANTMENT[enchantmentCardId] ?? null;
}

export function isStealthMinion(metadata: FollowCardMetadata | null | undefined): boolean {
  if (metadata?.type !== undefined && metadata.type !== 'MINION') return false;
  return (metadata?.mechanics ?? []).some((m) => m.trim().toUpperCase() === 'STEALTH');
}
